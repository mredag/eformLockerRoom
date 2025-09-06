import { getRateLimiter } from '../../../../shared/services/rate-limiter';

export interface RateLimitConfig {
  ip: { maxTokens: number; refillRate: number }; // 30/min
  locker: { maxTokens: number; refillRate: number }; // 6/min
  device: { maxTokens: number; refillRate: number }; // 1/20sec
}

export class RateLimiter {
  private sharedRateLimiter = getRateLimiter();

  constructor(config?: Partial<RateLimitConfig>) {
    // Configuration is now handled by the shared ConfigurationManager
    // This constructor is kept for backward compatibility
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
    const result = this.sharedRateLimiter.checkRateLimits(deviceId, kioskId || 'unknown', lockerId);
    return {
      allowed: result.allowed,
      reason: result.reason
    };
  }

  /**
   * Check RFID rate limits
   */
  async checkRfidRateLimit(cardId: string, kioskId?: string): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
    const result = this.sharedRateLimiter.checkRateLimits(cardId, kioskId || 'unknown');
    return {
      allowed: result.allowed,
      reason: result.reason
    };
  }

  /**
   * Clear old buckets and violations (cleanup)
   */
  cleanup(): void {
    this.sharedRateLimiter.cleanup();
  }
}
