import { RateLimitBucket, RateLimitViolation, EventType } from '../types/core-entities';
import { EventRepository } from '../database/event-repository';

/**
 * Defines the configuration for various rate limiting buckets.
 */
export interface RateLimitConfig {
  ip: { maxTokens: number; refillRate: number; blockThreshold: number; blockDuration: number };
  card: { maxTokens: number; refillRate: number; blockThreshold: number; blockDuration: number };
  locker: { maxTokens: number; refillRate: number; blockThreshold: number; blockDuration: number };
  device: { maxTokens: number; refillRate: number; blockThreshold: number; blockDuration: number };
  cleanupInterval: number;
  violationLogThreshold: number;
}

/**
 * Represents the result of a rate limit check.
 */
export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
  remainingTokens?: number;
  resetTime?: Date;
}

/**
 * A service that provides rate limiting functionality to prevent abuse.
 * It uses the token bucket algorithm to limit requests based on IP address,
 * RFID card, locker ID, and device ID.
 */
export class RateLimiter {
  private buckets: Map<string, RateLimitBucket> = new Map();
  private violations: Map<string, RateLimitViolation> = new Map();
  private eventRepository: EventRepository;
  private cleanupTimer?: NodeJS.Timeout;
  private config: RateLimitConfig;

  /**
   * Creates an instance of RateLimiter.
   * @param {RateLimitConfig} config - The configuration for the rate limiter.
   * @param {EventRepository} eventRepository - The repository for logging violation events.
   */
  constructor(config: RateLimitConfig, eventRepository: EventRepository) {
    this.config = config;
    this.eventRepository = eventRepository;
    this.startCleanupTimer();
  }

  /**
   * Updates the rate limiting configuration at runtime.
   * @param {Partial<RateLimitConfig>} newConfig - The new configuration settings to apply.
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.cleanupInterval) {
      this.stopCleanupTimer();
      this.startCleanupTimer();
    }
  }

  /**
   * Checks the rate limit for a given IP address.
   * @param {string} ip - The IP address to check.
   * @param {string} [kioskId] - An optional kiosk ID for context.
   * @returns {Promise<RateLimitResult>} The result of the rate limit check.
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
   * Checks the rate limit for a given RFID card.
   * @param {string} cardId - The RFID card ID to check.
   * @param {string} [kioskId] - An optional kiosk ID for context.
   * @returns {Promise<RateLimitResult>} The result of the rate limit check.
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
   * Checks the rate limit for a specific locker.
   * @param {number} lockerId - The ID of the locker.
   * @param {string} kioskId - The ID of the kiosk.
   * @returns {Promise<RateLimitResult>} The result of the rate limit check.
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
   * Checks the rate limit for a specific device (used for QR access).
   * @param {string} deviceId - The unique device identifier.
   * @param {string} [kioskId] - An optional kiosk ID for context.
   * @returns {Promise<RateLimitResult>} The result of the rate limit check.
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
   * Performs a comprehensive rate limit check for a QR code access request,
   * checking limits for IP, locker, and device.
   * @param {string} ip - The IP address of the request.
   * @param {number} lockerId - The ID of the target locker.
   * @param {string} deviceId - The unique device identifier.
   * @param {string} kioskId - The ID of the kiosk.
   * @returns {Promise<RateLimitResult>} The result of the rate limit check.
   */
  async checkQrRateLimits(
    ip: string,
    lockerId: number,
    deviceId: string,
    kioskId: string
  ): Promise<RateLimitResult> {
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

    await this.consumeToken(`ip:${ip}`, 'ip', kioskId);
    await this.consumeToken(`locker:${kioskId}:${lockerId}`, 'locker', kioskId);
    await this.consumeToken(`device:${deviceId}`, 'device', kioskId);

    return { allowed: true };
  }

  /**
   * Performs a rate limit check for an RFID access request.
   * @param {string} cardId - The RFID card ID.
   * @param {string} kioskId - The ID of the kiosk.
   * @returns {Promise<RateLimitResult>} The result of the rate limit check.
   */
  async checkRfidRateLimits(cardId: string, kioskId: string): Promise<RateLimitResult> {
    const cardResult = await this.checkRateLimit(`card:${cardId}`, 'card', kioskId);
    if (!cardResult.allowed) {
      return { ...cardResult, reason: 'card rate limit exceeded' };
    }

    await this.consumeToken(`card:${cardId}`, 'card', kioskId);
    return { allowed: true };
  }

  /**
   * The core rate limiting logic using the token bucket algorithm.
   * @private
   */
  private async checkRateLimit(
    key: string,
    limitType: keyof Omit<RateLimitConfig, 'cleanupInterval' | 'violationLogThreshold'>,
    kioskId?: string
  ): Promise<RateLimitResult> {
    const now = new Date();

    if (this.isBlocked(key)) {
      const violation = this.violations.get(key);
      const retryAfter = violation?.block_expires_at 
        ? Math.ceil((violation.block_expires_at.getTime() - now.getTime()) / 1000)
        : 300;

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

    const timeDiff = (now.getTime() - bucket.last_refill.getTime()) / 1000;
    const tokensToAdd = Math.floor(timeDiff * bucket.refill_rate);
    
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.max_tokens, bucket.tokens + tokensToAdd);
      bucket.last_refill = now;
    }

    if (bucket.tokens >= 1) {
      return {
        allowed: true,
        remainingTokens: bucket.tokens - 1,
        resetTime: new Date(now.getTime() + (bucket.max_tokens - bucket.tokens + 1) / bucket.refill_rate * 1000)
      };
    } else {
      await this.recordViolation(key, limitType, now, kioskId);
      
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
   * Consumes a token from a specific bucket after a successful rate limit check.
   * @private
   */
  private async consumeToken(key: string, limitType: string, kioskId?: string): Promise<void> {
    const bucket = this.buckets.get(key);
    if (bucket && bucket.tokens >= 1) {
      bucket.tokens -= 1;
    }
  }

  /**
   * Records a rate limit violation and temporarily blocks the key if the threshold is exceeded.
   * @private
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
    
    if (violation.violation_count >= config.blockThreshold) {
      violation.is_blocked = true;
      violation.block_expires_at = new Date(now.getTime() + config.blockDuration * 1000);
    }

    this.violations.set(key, violation);

    if (violation.violation_count >= this.config.violationLogThreshold) {
      await this.logRateLimitViolation(violation, kioskId);
    }

    console.warn(
      `Rate limit violation: ${key} (${limitType}) - Count: ${violation.violation_count}` +
      (violation.is_blocked ? ` - BLOCKED until ${violation.block_expires_at}` : '')
    );
  }

  /**
   * Logs a rate limit violation event to the database.
   * @private
   */
  private async logRateLimitViolation(violation: RateLimitViolation, kioskId?: string): Promise<void> {
    try {
      await this.eventRepository.logEvent(
        kioskId || 'system',
        EventType.RATE_LIMIT_VIOLATION,
        {
          key: violation.key,
          violation_type: violation.limit_type,
          violation_count: violation.violation_count,
          is_blocked: violation.is_blocked,
          block_expires_at: violation.block_expires_at?.toISOString(),
          first_violation: violation.first_violation.toISOString(),
          last_violation: violation.last_violation.toISOString()
        }
      );
    } catch (error) {
      console.error('Failed to log rate limit violation:', error);
    }
  }

  /**
   * Checks if a given key is currently blocked due to excessive violations.
   * @param {string} key - The key to check (e.g., 'ip:127.0.0.1').
   * @returns {boolean} True if the key is currently blocked.
   */
  isBlocked(key: string): boolean {
    const violation = this.violations.get(key);
    if (!violation || !violation.is_blocked) {
      return false;
    }

    if (violation.block_expires_at && new Date() > violation.block_expires_at) {
      violation.is_blocked = false;
      violation.block_expires_at = undefined;
      return false;
    }

    return true;
  }

  /**
   * Retrieves the current status of a specific rate limit bucket for monitoring.
   * @param {string} key - The key of the bucket.
   * @returns {RateLimitBucket | null} The bucket object, or null if it doesn't exist.
   */
  getBucketStatus(key: string): RateLimitBucket | null {
    return this.buckets.get(key) || null;
  }

  /**
   * Retrieves the violation history for a specific key.
   * @param {string} key - The key to retrieve violation history for.
   * @returns {RateLimitViolation | null} The violation record, or null if none exists.
   */
  getViolationHistory(key: string): RateLimitViolation | null {
    return this.violations.get(key) || null;
  }

  /**
   * Retrieves all current rate limit violations.
   * @returns {RateLimitViolation[]} An array of all violation records.
   */
  getAllViolations(): RateLimitViolation[] {
    return Array.from(this.violations.values());
  }

  /**
   * Retrieves all currently active blocks.
   * @returns {RateLimitViolation[]} An array of violation records that are currently blocked.
   */
  getActiveBlocks(): RateLimitViolation[] {
    return Array.from(this.violations.values()).filter(v => v.is_blocked);
  }

  /**
   * Manually resets the rate limits for a specific key. This is typically an administrative function.
   * @param {string} key - The key to reset.
   * @param {string} [adminUser] - The user performing the reset.
   * @param {string} [kioskId] - The kiosk context for logging.
   */
  async resetLimits(key: string, adminUser?: string, kioskId?: string): Promise<void> {
    const hadViolation = this.violations.has(key);
    const hadBucket = this.buckets.has(key);

    this.buckets.delete(key);
    this.violations.delete(key);

    if (hadViolation || hadBucket) {
      try {
        await this.eventRepository.logEvent(
          kioskId || 'system',
          EventType.STAFF_OPEN,
          {
            rate_limit_reset: {
              key,
              had_violation: hadViolation,
              had_bucket: hadBucket,
              reset_by: adminUser
            }
          },
          undefined,
          undefined,
          undefined,
          adminUser
        );
      } catch (error) {
        console.error('Failed to log rate limit reset:', error);
      }
    }
  }

  /**
   * Periodically cleans up old, inactive buckets and expired violation records from memory.
   */
  cleanup(): void {
    const now = new Date();
    const cleanupThreshold = new Date(now.getTime() - this.config.cleanupInterval * 60 * 1000);

    let bucketsRemoved = 0;
    let violationsRemoved = 0;

    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.last_refill < cleanupThreshold) {
        this.buckets.delete(key);
        bucketsRemoved++;
      }
    }

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
   * Retrieves statistics about the current state of the rate limiter.
   * @returns {object} An object containing rate limiter statistics.
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
   * Starts the periodic cleanup timer.
   * @private
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval * 60 * 1000);
  }

  /**
   * Stops the periodic cleanup timer.
   * @private
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Shuts down the rate limiter and clears all state.
   */
  shutdown(): void {
    this.stopCleanupTimer();
    this.buckets.clear();
    this.violations.clear();
  }
}

/**
 * Creates and configures a `RateLimiter` instance based on the main system configuration.
 * @param {any} systemConfig - The main system configuration object.
 * @param {EventRepository} eventRepository - The repository for logging events.
 * @returns {RateLimiter} A configured instance of the RateLimiter.
 */
export function createRateLimiter(
  systemConfig: any,
  eventRepository: EventRepository
): RateLimiter {
  const config: RateLimitConfig = {
    ip: {
      maxTokens: systemConfig.security?.rate_limits?.ip_per_minute || 30,
      refillRate: (systemConfig.security?.rate_limits?.ip_per_minute || 30) / 60,
      blockThreshold: 10,
      blockDuration: 300
    },
    card: {
      maxTokens: systemConfig.security?.rate_limits?.card_per_minute || 60,
      refillRate: (systemConfig.security?.rate_limits?.card_per_minute || 60) / 60,
      blockThreshold: 20,
      blockDuration: 600
    },
    locker: {
      maxTokens: systemConfig.security?.rate_limits?.locker_per_minute || 6,
      refillRate: (systemConfig.security?.rate_limits?.locker_per_minute || 6) / 60,
      blockThreshold: 15,
      blockDuration: 300
    },
    device: {
      maxTokens: 1,
      refillRate: 1 / (systemConfig.security?.rate_limits?.device_per_20_seconds || 20),
      blockThreshold: 5,
      blockDuration: 1200
    },
    cleanupInterval: 60,
    violationLogThreshold: 3
  };

  return new RateLimiter(config, eventRepository);
}
