/**
 * Unit tests for Rate Limiter Service
 */

import { RateLimiter, RateLimitConfig, DEFAULT_RATE_LIMIT_CONFIG } from '../rate-limiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  let config: RateLimitConfig;

  beforeEach(() => {
    config = { ...DEFAULT_RATE_LIMIT_CONFIG };
    rateLimiter = new RateLimiter(config);
  });

  describe('Card Rate Limiting', () => {
    it('should allow first card open', () => {
      const result = rateLimiter.checkCardRate('card123');
      
      expect(result.allowed).toBe(true);
      expect(result.type).toBe('card_rate');
      expect(result.key).toBe('card123');
    });

    it('should block second card open within 10 seconds', () => {
      // First open
      rateLimiter.recordCardOpen('card123');
      
      // Immediate second attempt
      const result = rateLimiter.checkCardRate('card123');
      
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('card_rate');
      expect(result.key).toBe('card123');
      expect(result.message).toBe('Lütfen birkaç saniye sonra deneyin');
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(10);
    });

    it('should allow card open after 10 seconds', async () => {
      // Mock time progression
      const originalNow = Date.now;
      let mockTime = 1000000;
      Date.now = jest.fn(() => mockTime);

      // First open
      rateLimiter.recordCardOpen('card123');
      
      // Advance time by 11 seconds
      mockTime += 11000;
      
      const result = rateLimiter.checkCardRate('card123');
      
      expect(result.allowed).toBe(true);
      
      // Restore original Date.now
      Date.now = originalNow;
    });

    it('should handle different cards independently', () => {
      rateLimiter.recordCardOpen('card123');
      
      // Different card should be allowed
      const result = rateLimiter.checkCardRate('card456');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Locker Rate Limiting', () => {
    it('should allow first 3 locker opens', () => {
      for (let i = 0; i < 3; i++) {
        const result = rateLimiter.checkLockerRate(1);
        expect(result.allowed).toBe(true);
        rateLimiter.recordLockerOpen(1);
      }
    });

    it('should block 4th locker open within 60 seconds', () => {
      // Record 3 opens
      for (let i = 0; i < 3; i++) {
        rateLimiter.recordLockerOpen(1);
      }
      
      // 4th attempt should be blocked
      const result = rateLimiter.checkLockerRate(1);
      
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('locker_rate');
      expect(result.key).toBe('1');
      expect(result.message).toBe('Lütfen birkaç saniye sonra deneyin');
    });

    it('should allow opens after 60 seconds', () => {
      const originalNow = Date.now;
      let mockTime = 1000000;
      Date.now = jest.fn(() => mockTime);

      // Record 3 opens
      for (let i = 0; i < 3; i++) {
        rateLimiter.recordLockerOpen(1);
      }
      
      // Advance time by 61 seconds
      mockTime += 61000;
      
      const result = rateLimiter.checkLockerRate(1);
      expect(result.allowed).toBe(true);
      
      Date.now = originalNow;
    });

    it('should handle different lockers independently', () => {
      // Fill up locker 1
      for (let i = 0; i < 3; i++) {
        rateLimiter.recordLockerOpen(1);
      }
      
      // Locker 2 should still be available
      const result = rateLimiter.checkLockerRate(2);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Command Cooldown', () => {
    it('should allow first command', () => {
      const result = rateLimiter.checkCommandCooldown();
      expect(result.allowed).toBe(true);
    });

    it('should block command within 3 seconds', () => {
      rateLimiter.recordCommand();
      
      const result = rateLimiter.checkCommandCooldown();
      
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('command_cooldown');
      expect(result.key).toBe('global');
      expect(result.message).toBe('Lütfen birkaç saniye sonra deneyin');
    });

    it('should allow command after 3 seconds', () => {
      const originalNow = Date.now;
      let mockTime = 1000000;
      Date.now = jest.fn(() => mockTime);

      rateLimiter.recordCommand();
      
      // Advance time by 4 seconds
      mockTime += 4000;
      
      const result = rateLimiter.checkCommandCooldown();
      expect(result.allowed).toBe(true);
      
      Date.now = originalNow;
    });
  });

  describe('User Report Rate Limiting', () => {
    it('should allow first 2 reports per day', () => {
      for (let i = 0; i < 2; i++) {
        const result = rateLimiter.checkUserReportRate('card123');
        expect(result.allowed).toBe(true);
        rateLimiter.recordUserReport('card123');
      }
    });

    it('should block 3rd report within 24 hours', () => {
      // Record 2 reports
      for (let i = 0; i < 2; i++) {
        rateLimiter.recordUserReport('card123');
      }
      
      // 3rd attempt should be blocked
      const result = rateLimiter.checkUserReportRate('card123');
      
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('user_report_rate');
      expect(result.key).toBe('card123');
      expect(result.message).toBe('Günlük rapor limitine ulaştınız');
    });

    it('should allow reports after 24 hours', () => {
      const originalNow = Date.now;
      let mockTime = 1000000;
      Date.now = jest.fn(() => mockTime);

      // Record 2 reports
      for (let i = 0; i < 2; i++) {
        rateLimiter.recordUserReport('card123');
      }
      
      // Advance time by 25 hours
      mockTime += 25 * 60 * 60 * 1000;
      
      const result = rateLimiter.checkUserReportRate('card123');
      expect(result.allowed).toBe(true);
      
      Date.now = originalNow;
    });
  });

  describe('Combined Rate Limiting', () => {
    it('should check all limits for card open operation', () => {
      const result = rateLimiter.checkAllLimits('card123', 1);
      expect(result.allowed).toBe(true);
    });

    it('should fail if any limit is exceeded', () => {
      // Exceed card rate limit
      rateLimiter.recordCardOpen('card123');
      
      const result = rateLimiter.checkAllLimits('card123', 1);
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('card_rate');
    });

    it('should record successful operation', () => {
      rateLimiter.recordSuccessfulOpen('card123', 1);
      
      // Verify all counters were updated
      const cardResult = rateLimiter.checkCardRate('card123');
      const lockerResult = rateLimiter.checkLockerRate(1);
      const commandResult = rateLimiter.checkCommandCooldown();
      
      expect(cardResult.allowed).toBe(false);
      expect(lockerResult.allowed).toBe(true); // Still has 2 more opens
      expect(commandResult.allowed).toBe(false);
    });
  });

  describe('Violation Tracking', () => {
    it('should record violations', () => {
      rateLimiter.recordCardOpen('card123');
      rateLimiter.checkCardRate('card123'); // This should create a violation
      
      const violations = rateLimiter.getRecentViolations();
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('card_rate');
      expect(violations[0].key).toBe('card123');
    });

    it('should cleanup old violations', () => {
      const originalNow = Date.now;
      let mockTime = 1000000;
      Date.now = jest.fn(() => mockTime);

      // Create a violation
      rateLimiter.recordCardOpen('card123');
      rateLimiter.checkCardRate('card123');
      
      // Advance time by 2 hours
      mockTime += 2 * 60 * 60 * 1000;
      
      rateLimiter.cleanupViolations();
      
      const violations = rateLimiter.getRecentViolations();
      expect(violations).toHaveLength(0);
      
      Date.now = originalNow;
    });
  });

  describe('State Management', () => {
    it('should provide current state for debugging', () => {
      rateLimiter.recordCardOpen('card123');
      rateLimiter.recordLockerOpen(1);
      rateLimiter.recordCommand();
      
      const state = rateLimiter.getState();
      
      expect(state.cardLastOpen).toHaveProperty('card123');
      expect(state.lockerOpenHistory).toHaveProperty('1');
      expect(state.lastCommandTime).toBeGreaterThan(0);
    });
  });
});