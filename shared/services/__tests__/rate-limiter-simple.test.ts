import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../rate-limiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter();
  });

  describe('card rate limiting', () => {
    it('should allow first assignment', () => {
      const result = rateLimiter.isCardRateLimited('card123');
      expect(result).toBe(false);
    });

    it('should block rapid assignments', () => {
      rateLimiter.recordCardAssignment('card123');
      const result = rateLimiter.isCardRateLimited('card123', 10);
      expect(result).toBe(true);
    });
  });

  describe('command cooldown', () => {
    it('should allow first command', () => {
      const result = rateLimiter.isCommandCooldownActive();
      expect(result).toBe(false);
    });

    it('should block rapid commands', () => {
      rateLimiter.recordCommand();
      const result = rateLimiter.isCommandCooldownActive(3);
      expect(result).toBe(true);
    });
  });

  describe('locker rate limiting', () => {
    it('should allow first locker command', () => {
      const result = rateLimiter.isLockerRateLimited('kiosk1', 5);
      expect(result).toBe(false);
    });

    it('should block excessive locker commands', () => {
      // Record 3 commands (at limit)
      for (let i = 0; i < 3; i++) {
        rateLimiter.recordLockerCommand('kiosk1', 5);
      }
      
      const result = rateLimiter.isLockerRateLimited('kiosk1', 5, 3);
      expect(result).toBe(true);
    });
  });

  describe('checkRateLimits', () => {
    it('should return allowed for new request', () => {
      const result = rateLimiter.checkRateLimits('card123', 'kiosk1', 5);
      expect(result.allowed).toBe(true);
    });

    it('should return throttled message for rate limited card', () => {
      rateLimiter.recordCardAssignment('card123');
      const result = rateLimiter.checkRateLimits('card123', 'kiosk1', 5);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('card_rate_limit');
    });
  });
});