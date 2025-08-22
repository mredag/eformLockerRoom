import { RateLimitBucket, RateLimitViolation, EventType } from '../types/core-entities.js';
import { EventRepository } from '../database/event-repository.js';

export interface RateLimitConfig {
  ip: { maxTokens: number; refillRate: number; blockThreshold: number; blockDuration: number };
  card: { maxTokens: number; refillRate: number; blockThreshold: number; blockDuration: number };
  locker: { maxTokens: number; refillRate: number; blockThreshold: number; blockDuration: number };
  device: { maxTokens: number; refillRate: number; blockThreshold: number; blockDuration: number };
  cleanupInterval: number; // minutes
  violationLogThreshold: number; // log after this many violations
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
  remainingTokens?: number;
  resetTime?: Date;
}

export class RateLimiter {
  private buckets: Map<string, RateLimitBucket> = new Map();
  private violations: Map<string, RateLimitViolation> = new Map();
  private eventRepository: EventRepository;
  private cleanupTimer?: NodeJS.Timeout;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig, eventRepository: EventRepository) {
    this.config = config;
    this.eventRepository = eventRepository;
    this.startCleanupTimer();
  }

  /**
   * Update rate limiting configuration
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart cleanup timer if interval changed
    if (newConfig.cleanupInterval) {
      this.stopCleanupTimer();
      this.startCleanupTimer();
    }
  }

  /**
   * Check rate limit for IP address
   */
  async checkIpRateLimit(ip: string, kioskId?: string): Promise<RateLimitResult> {
    const key = `ip:${ip}`;
    const result = await this.checkRateLimit(key, 'ip', kioskId);
    if (result.allowed) {
      await this.consumeToken(key, 'ip', kioskId);
    }
    return result;
  }

  /**
   * Check rate limit for RFID card
   */
  async checkCardRateLimit(cardId: string, kioskId?: string): Promise<RateLimitResult> {
    const key = `card:${cardId}`;
    const result = await this.checkRateLimit(key, 'card', kioskId);
    if (result.allowed) {
      await this.consumeToken(key, 'card', kioskId);
    }
    return result;
  }

  /**
   * Check rate limit for locker
   */
  async checkLockerRateLimit(lockerId: number, kioskId: string): Promise<RateLimitResult> {
    const key = `locker:${kioskId}:${lockerId}`;
    const result = await this.checkRateLimit(key, 'locker', kioskId);
    if (result.allowed) {
      await this.consumeToken(key, 'locker', kioskId);
    }
    return result;
  }

  /**
   * Check rate limit for device (QR access)
   */
  async checkDeviceRateLimit(deviceId: string, kioskId?: string): Promise<RateLimitResult> {
    const key = `device:${deviceId}`;
    const result = await this.checkRateLimit(key, 'device', kioskId);
    if (result.allowed) {
      await this.consumeToken(key, 'device', kioskId);
    }
    return result;
  }

  /**
   * Check comprehensive rate limits for QR access
   */
  async checkQrRateLimits(
    ip: string,
    lockerId: number,
    deviceId: string,
    kioskId: string
  ): Promise<RateLimitResult> {
    // Check all limits first without consuming tokens
    const ipResult = await this.checkRateLimit(`ip:${ip}`, 'ip', kioskId);
    if (!ipResult.allowed) {
      return { ...ipResult, reason: 'ip rate limit exceeded' };
    }

    const lockerResult = await this.checkRateLimit(`locker:${kioskId}:${lockerId}`, 'locker', kioskId);
    if (!lockerResult.allowed) {
      return { ...lockerResult, reason: 'locker rate limit exceeded' };
    }

    const deviceResult = await this.checkRateLimit(`device:${deviceId}`, 'device', kioskId);
    if (!deviceResult.allowed) {
      return { ...deviceResult, reason: 'device rate limit exceeded' };
    }

    // All checks passed, consume tokens
    await this.consumeToken(`ip:${ip}`, 'ip', kioskId);
    await this.consumeToken(`locker:${kioskId}:${lockerId}`, 'locker', kioskId);
    await this.consumeToken(`device:${deviceId}`, 'device', kioskId);

    return { allowed: true };
  }

  /**
   * Check comprehensive rate limits for RFID access
   */
  async checkRfidRateLimits(cardId: string, kioskId: string): Promise<RateLimitResult> {
    const cardResult = await this.checkRateLimit(`card:${cardId}`, 'card', kioskId);
    if (!cardResult.allowed) {
      return { ...cardResult, reason: 'card rate limit exceeded' };
    }

    // Consume token
    await this.consumeToken(`card:${cardId}`, 'card', kioskId);
    return { allowed: true };
  }

  /**
   * Core rate limiting logic using token bucket algorithm
   */
  private async checkRateLimit(
    key: string,
    limitType: keyof Omit<RateLimitConfig, 'cleanupInterval' | 'violationLogThreshold'>,
    kioskId?: string
  ): Promise<RateLimitResult> {
    const now = new Date();

    // Check if key is currently blocked
    if (this.isBlocked(key)) {
      const violation = this.violations.get(key);
      const retryAfter = violation?.block_expires_at 
        ? Math.ceil((violation.block_expires_at.getTime() - now.getTime()) / 1000)
        : 300; // Default 5 minutes

      return {
        allowed: false,
        reason: `Temporarily blocked due to rate limit violations`,
        retryAfter
      };
    }

    let bucket = this.buckets.get(key);
    const config = this.config[limitType];

    if (!bucket) {
      bucket = {
        key,
        tokens: config.maxTokens,
        last_refill: now,
        max_tokens: config.maxTokens,
        refill_rate: config.refillRate
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const timeDiff = (now.getTime() - bucket.last_refill.getTime()) / 1000; // seconds
    const tokensToAdd = Math.floor(timeDiff * bucket.refill_rate);
    
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.max_tokens, bucket.tokens + tokensToAdd);
      bucket.last_refill = now;
    }

    // Check if we have enough tokens
    if (bucket.tokens >= 1) {
      // Don't consume token here, just check availability
      return {
        allowed: true,
        remainingTokens: bucket.tokens - 1,
        resetTime: new Date(now.getTime() + (bucket.max_tokens - bucket.tokens + 1) / bucket.refill_rate * 1000)
      };
    } else {
      // Rate limit exceeded, record violation
      await this.recordViolation(key, limitType, now, kioskId);
      
      // Calculate retry after time
      const tokensNeeded = 1 - bucket.tokens;
      const retryAfter = Math.ceil(tokensNeeded / bucket.refill_rate);
      
      return {
        allowed: false,
        reason: `${limitType} rate limit exceeded`,
        retryAfter,
        resetTime: new Date(now.getTime() + retryAfter * 1000)
      };
    }
  }

  /**
   * Consume a token from the bucket
   */
  private async consumeToken(key: string, limitType: string, kioskId?: string): Promise<void> {
    const bucket = this.buckets.get(key);
    if (bucket && bucket.tokens >= 1) {
      bucket.tokens -= 1;
    }
  }

  /**
   * Record rate limit violation with enhanced logging
   */
  private async recordViolation(
    key: string,
    limitType: string,
    now: Date,
    kioskId?: string
  ): Promise<void> {
    let violation = this.violations.get(key);
    
    if (!violation) {
      violation = {
        id: Date.now(),
        key,
        limit_type: limitType as any,
        violation_count: 1,
        first_violation: now,
        last_violation: now,
        is_blocked: false
      };
    } else {
      violation.violation_count += 1;
      violation.last_violation = now;
    }

    const config = this.config[limitType as keyof Omit<RateLimitConfig, 'cleanupInterval' | 'violationLogThreshold'>];
    
    // Block if threshold exceeded
    if (violation.violation_count >= config.blockThreshold) {
      violation.is_blocked = true;
      violation.block_expires_at = new Date(now.getTime() + config.blockDuration * 1000);
    }

    this.violations.set(key, violation);

    // Log violation if threshold reached
    if (violation.violation_count >= this.config.violationLogThreshold) {
      await this.logRateLimitViolation(violation, kioskId);
    }

    // Console warning for immediate feedback
    console.warn(
      `Rate limit violation: ${key} (${limitType}) - Count: ${violation.violation_count}` +
      (violation.is_blocked ? ` - BLOCKED until ${violation.block_expires_at}` : '')
    );
  }

  /**
   * Log rate limit violation to database
   */
  private async logRateLimitViolation(violation: RateLimitViolation, kioskId?: string): Promise<void> {
    try {
      await this.eventRepository.createEvent({
        kiosk_id: kioskId || 'system',
        event_type: EventType.SYSTEM_RESTARTED, // Using existing event type, should add RATE_LIMIT_VIOLATION
        details: {
          rate_limit_violation: {
            key: violation.key,
            limit_type: violation.limit_type,
            violation_count: violation.violation_count,
            is_blocked: violation.is_blocked,
            block_expires_at: violation.block_expires_at?.toISOString(),
            first_violation: violation.first_violation.toISOString(),
            last_violation: violation.last_violation.toISOString()
          }
        }
      });
    } catch (error) {
      console.error('Failed to log rate limit violation:', error);
    }
  }

  /**
   * Check if key is currently blocked
   */
  isBlocked(key: string): boolean {
    const violation = this.violations.get(key);
    if (!violation || !violation.is_blocked) {
      return false;
    }

    // Check if block has expired
    if (violation.block_expires_at && new Date() > violation.block_expires_at) {
      violation.is_blocked = false;
      violation.block_expires_at = undefined;
      return false;
    }

    return true;
  }

  /**
   * Get current bucket status (for monitoring/debugging)
   */
  getBucketStatus(key: string): RateLimitBucket | null {
    return this.buckets.get(key) || null;
  }

  /**
   * Get violation history (for monitoring/debugging)
   */
  getViolationHistory(key: string): RateLimitViolation | null {
    return this.violations.get(key) || null;
  }

  /**
   * Get all current violations (for monitoring)
   */
  getAllViolations(): RateLimitViolation[] {
    return Array.from(this.violations.values());
  }

  /**
   * Get all active blocks (for monitoring)
   */
  getActiveBlocks(): RateLimitViolation[] {
    return Array.from(this.violations.values()).filter(v => v.is_blocked);
  }

  /**
   * Reset rate limits for a key (admin function)
   */
  async resetLimits(key: string, adminUser?: string, kioskId?: string): Promise<void> {
    const hadViolation = this.violations.has(key);
    const hadBucket = this.buckets.has(key);

    this.buckets.delete(key);
    this.violations.delete(key);

    // Log reset action
    if (hadViolation || hadBucket) {
      try {
        await this.eventRepository.createEvent({
          kiosk_id: kioskId || 'system',
          event_type: EventType.STAFF_OPEN, // Using existing event type, should add RATE_LIMIT_RESET
          staff_user: adminUser,
          details: {
            rate_limit_reset: {
              key,
              had_violation: hadViolation,
              had_bucket: hadBucket,
              reset_by: adminUser
            }
          }
        });
      } catch (error) {
        console.error('Failed to log rate limit reset:', error);
      }
    }
  }

  /**
   * Cleanup old buckets and violations
   */
  cleanup(): void {
    const now = new Date();
    const cleanupThreshold = new Date(now.getTime() - this.config.cleanupInterval * 60 * 1000);

    let bucketsRemoved = 0;
    let violationsRemoved = 0;

    // Clean old buckets
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.last_refill < cleanupThreshold) {
        this.buckets.delete(key);
        bucketsRemoved++;
      }
    }

    // Clean old violations (but keep blocked ones until they expire)
    for (const [key, violation] of this.violations.entries()) {
      const shouldRemove = violation.last_violation < cleanupThreshold && 
                          (!violation.is_blocked || 
                           (violation.block_expires_at && violation.block_expires_at < now));
      
      if (shouldRemove) {
        this.violations.delete(key);
        violationsRemoved++;
      }
    }

    if (bucketsRemoved > 0 || violationsRemoved > 0) {
      console.log(`Rate limiter cleanup: removed ${bucketsRemoved} buckets, ${violationsRemoved} violations`);
    }
  }

  /**
   * Get rate limiter statistics
   */
  getStatistics(): {
    buckets: number;
    violations: number;
    activeBlocks: number;
    config: RateLimitConfig;
  } {
    return {
      buckets: this.buckets.size,
      violations: this.violations.size,
      activeBlocks: this.getActiveBlocks().length,
      config: this.config
    };
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval * 60 * 1000); // Convert minutes to milliseconds
  }

  /**
   * Stop cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Shutdown rate limiter
   */
  shutdown(): void {
    this.stopCleanupTimer();
    this.buckets.clear();
    this.violations.clear();
  }
}

/**
 * Create rate limiter with configuration from system config
 */
export function createRateLimiter(
  systemConfig: any,
  eventRepository: EventRepository
): RateLimiter {
  const config: RateLimitConfig = {
    ip: {
      maxTokens: systemConfig.security?.rate_limits?.ip_per_minute || 30,
      refillRate: (systemConfig.security?.rate_limits?.ip_per_minute || 30) / 60, // per second
      blockThreshold: 10,
      blockDuration: 300 // 5 minutes
    },
    card: {
      maxTokens: systemConfig.security?.rate_limits?.card_per_minute || 60,
      refillRate: (systemConfig.security?.rate_limits?.card_per_minute || 60) / 60, // per second
      blockThreshold: 20,
      blockDuration: 600 // 10 minutes
    },
    locker: {
      maxTokens: systemConfig.security?.rate_limits?.locker_per_minute || 6,
      refillRate: (systemConfig.security?.rate_limits?.locker_per_minute || 6) / 60, // per second
      blockThreshold: 15,
      blockDuration: 300 // 5 minutes
    },
    device: {
      maxTokens: 1,
      refillRate: 1 / (systemConfig.security?.rate_limits?.device_per_20_seconds || 20), // per second
      blockThreshold: 5,
      blockDuration: 1200 // 20 minutes
    },
    cleanupInterval: 60, // 1 hour
    violationLogThreshold: 3 // Log after 3 violations
  };

  return new RateLimiter(config, eventRepository);
}