import { RateLimiter as SharedRateLimiter, createRateLimiter } from '../../../../shared/services/rate-limiter.js';
import { EventRepository } from '../../../../shared/database/event-repository.js';

export interface RateLimitConfig {
  ip: { maxTokens: number; refillRate: number }; // 30/min
  locker: { maxTokens: number; refillRate: number }; // 6/min
  device: { maxTokens: number; refillRate: number }; // 1/20sec
}

export class RateLimiter {
  private sharedRateLimiter: SharedRateLimiter;

  constructor(config?: Partial<RateLimitConfig>, eventRepository?: EventRepository) {
    // Convert old config format to system config format for compatibility
    const systemConfig = {
      security: {
        rate_limits: {
          ip_per_minute: config?.ip?.maxTokens || 30,
          card_per_minute: 60,
          locker_per_minute: config?.locker?.maxTokens || 6,
          device_per_20_seconds: 20 // Convert from refill rate to seconds
        }
      }
    };

    this.sharedRateLimiter = createRateLimiter(systemConfig, eventRepository!);
  }

  /**
   * Check if request is allowed based on rate limits
   */
  async checkRateLimit(
    ip: string,
    lockerId: number,
    deviceId: string,
    kioskId?: string
  ): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
    const result = await this.sharedRateLimiter.checkQrRateLimits(ip, lockerId, deviceId, kioskId || 'unknown');
    return {
      allowed: result.allowed,
      reason: result.reason,
      retryAfter: result.retryAfter
    };
  }

  /**
   * Check RFID rate limits
   */
  async checkRfidRateLimit(cardId: string, kioskId?: string): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
    const result = await this.sharedRateLimiter.checkRfidRateLimits(cardId, kioskId || 'unknown');
    return {
      allowed: result.allowed,
      reason: result.reason,
      retryAfter: result.retryAfter
    };
  }

  /**
   * Check if key is currently blocked
   */
  isBlocked(key: string): boolean {
    return this.sharedRateLimiter.isBlocked(key);
  }

  /**
   * Get current bucket status (for debugging)
   */
  getBucketStatus(key: string) {
    return this.sharedRateLimiter.getBucketStatus(key);
  }

  /**
   * Get violation history (for debugging)
   */
  getViolationHistory(key: string) {
    return this.sharedRateLimiter.getViolationHistory(key);
  }

  /**
   * Clear old buckets and violations (cleanup)
   */
  cleanup(): void {
    this.sharedRateLimiter.cleanup();
  }

  /**
   * Reset rate limits for a key (admin function)
   */
  async resetLimits(key: string, adminUser?: string, kioskId?: string): Promise<void> {
    await this.sharedRateLimiter.resetLimits(key, adminUser, kioskId);
  }

  /**
   * Get all current violations (for monitoring)
   */
  getAllViolations() {
    return this.sharedRateLimiter.getAllViolations();
  }

  /**
   * Get rate limiter statistics
   */
  getStatistics() {
    return this.sharedRateLimiter.getStatistics();
  }

  /**
   * Shutdown rate limiter
   */
  shutdown(): void {
    this.sharedRateLimiter.shutdown();
  }
}