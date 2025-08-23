import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiter } from '../rate-limiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('IP Rate Limiting (30/min)', () => {
    it('should allow requests within IP rate limit', async () => {
      const ip = '192.168.1.100';
      const lockerId = 1;
      const deviceId = 'device123';

      // Make 30 requests (should all be allowed)
      for (let i = 0; i < 30; i++) {
        const result = await rateLimiter.checkRateLimit(ip, lockerId + i, deviceId + i);
        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests exceeding IP rate limit', async () => {
      const ip = '192.168.1.100';
      const lockerId = 1;
      const deviceId = 'device123';

      // Make 31 requests (31st should be blocked)
      for (let i = 0; i < 30; i++) {
        await rateLimiter.checkRateLimit(ip, lockerId + i, deviceId + i);
      }

      const result = await rateLimiter.checkRateLimit(ip, lockerId + 30, deviceId + 30);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('IP rate limit exceeded');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should allow different IPs independently', async () => {
      const ip1 = '192.168.1.100';
      const ip2 = '192.168.1.101';
      const lockerId = 1;
      const deviceId = 'device123';

      // Exhaust rate limit for IP1
      for (let i = 0; i < 30; i++) {
        await rateLimiter.checkRateLimit(ip1, lockerId + i, deviceId + i);
      }

      // IP2 should still be allowed
      const result = await rateLimiter.checkRateLimit(ip2, lockerId, deviceId + '2');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Locker Rate Limiting (6/min)', () => {
    it('should allow requests within locker rate limit', async () => {
      const ip = '192.168.1.100';
      const lockerId = 1;
      const deviceId = 'device123';

      // Make 6 requests to same locker (should all be allowed)
      for (let i = 0; i < 6; i++) {
        const result = await rateLimiter.checkRateLimit(ip + i, lockerId, deviceId + i);
        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests exceeding locker rate limit', async () => {
      const ip = '192.168.1.100';
      const lockerId = 1;
      const deviceId = 'device123';

      // Make 7 requests to same locker (7th should be blocked)
      for (let i = 0; i < 6; i++) {
        await rateLimiter.checkRateLimit(ip + i, lockerId, deviceId + i);
      }

      const result = await rateLimiter.checkRateLimit(ip + '7', lockerId, deviceId + '7');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Locker rate limit exceeded');
    });

    it('should allow different lockers independently', async () => {
      const ip = '192.168.1.100';
      const lockerId1 = 1;
      const lockerId2 = 2;
      const deviceId = 'device123';

      // Exhaust rate limit for locker 1
      for (let i = 0; i < 6; i++) {
        await rateLimiter.checkRateLimit(ip + i, lockerId1, deviceId + i);
      }

      // Locker 2 should still be allowed
      const result = await rateLimiter.checkRateLimit(ip, lockerId2, deviceId);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Device Rate Limiting (1/20sec)', () => {
    it('should allow first request from device', async () => {
      const ip = '192.168.1.100';
      const lockerId = 1;
      const deviceId = 'device123';

      const result = await rateLimiter.checkRateLimit(ip, lockerId, deviceId);
      expect(result.allowed).toBe(true);
    });

    it('should block immediate second request from same device', async () => {
      const ip = '192.168.1.100';
      const lockerId = 1;
      const deviceId = 'device123';

      // First request should be allowed
      const result1 = await rateLimiter.checkRateLimit(ip, lockerId, deviceId);
      expect(result1.allowed).toBe(true);

      // Immediate second request should be blocked
      const result2 = await rateLimiter.checkRateLimit(ip, lockerId, deviceId);
      expect(result2.allowed).toBe(false);
      expect(result2.reason).toBe('Device rate limit exceeded');
      expect(result2.retryAfter).toBeGreaterThan(0);
    });

    it('should allow different devices independently', async () => {
      const ip = '192.168.1.100';
      const lockerId = 1;
      const deviceId1 = 'device123';
      const deviceId2 = 'device456';

      // First device makes request
      await rateLimiter.checkRateLimit(ip, lockerId, deviceId1);

      // Second device should still be allowed
      const result = await rateLimiter.checkRateLimit(ip, lockerId, deviceId2);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Token Bucket Refill', () => {
    it('should refill tokens over time', async () => {
      const ip = '192.168.1.100';
      const lockerId = 1;
      const deviceId = 'device123';

      // Exhaust device rate limit
      await rateLimiter.checkRateLimit(ip, lockerId, deviceId);
      
      // Should be blocked immediately
      let result = await rateLimiter.checkRateLimit(ip, lockerId, deviceId);
      expect(result.allowed).toBe(false);

      // Mock time passage (simulate 21 seconds later)
      const originalNow = Date.now;
      Date.now = vi.fn(() => originalNow() + 21000);

      // Should be allowed after refill
      result = await rateLimiter.checkRateLimit(ip, lockerId, deviceId);
      expect(result.allowed).toBe(true);

      Date.now = originalNow;
    });
  });

  describe('Violation Tracking', () => {
    it('should track violations', async () => {
      const ip = '192.168.1.100';
      const lockerId = 1;
      const deviceId = 'device123';

      // Exhaust rate limit
      for (let i = 0; i < 30; i++) {
        await rateLimiter.checkRateLimit(ip, lockerId + i, deviceId + i);
      }

      // Trigger violation
      await rateLimiter.checkRateLimit(ip, lockerId + 30, deviceId + 30);

      const violation = rateLimiter.getViolationHistory(`ip:${ip}`);
      expect(violation).toBeDefined();
      expect(violation!.violation_count).toBe(1);
      expect(violation!.limit_type).toBe('ip');
    });

    it('should block after multiple violations', async () => {
      const ip = '192.168.1.100';
      const lockerId = 1;
      const deviceId = 'device123';

      // Trigger 10 violations to get blocked
      for (let i = 0; i < 10; i++) {
        // Exhaust rate limit
        for (let j = 0; j < 30; j++) {
          await rateLimiter.checkRateLimit(ip, lockerId + j, deviceId + j + i);
        }
        // Trigger violation
        await rateLimiter.checkRateLimit(ip, lockerId + 30, deviceId + 30 + i);
      }

      const isBlocked = rateLimiter.isBlocked(`ip:${ip}`);
      expect(isBlocked).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should clean up old buckets and violations', async () => {
      const ip = '192.168.1.100';
      const lockerId = 1;
      const deviceId = 'device123';

      // Create some activity
      await rateLimiter.checkRateLimit(ip, lockerId, deviceId);

      // Mock time passage (2 hours later)
      const originalNow = Date.now;
      Date.now = vi.fn(() => originalNow() + 2 * 60 * 60 * 1000);

      // Run cleanup
      rateLimiter.cleanup();

      // Bucket should be cleaned up
      const bucket = rateLimiter.getBucketStatus(`ip:${ip}`);
      expect(bucket).toBeNull();

      Date.now = originalNow;
    });
  });

  describe('Admin Functions', () => {
    it('should reset limits for a key', async () => {
      const ip = '192.168.1.100';
      const lockerId = 1;
      const deviceId = 'device123';

      // Exhaust rate limit
      for (let i = 0; i < 30; i++) {
        await rateLimiter.checkRateLimit(ip, lockerId + i, deviceId + i);
      }

      // Should be blocked
      let result = await rateLimiter.checkRateLimit(ip, lockerId + 30, deviceId + 30);
      expect(result.allowed).toBe(false);

      // Reset limits
      rateLimiter.resetLimits(`ip:${ip}`);

      // Should be allowed again
      result = await rateLimiter.checkRateLimit(ip, lockerId + 31, deviceId + 31);
      expect(result.allowed).toBe(true);
    });

    it('should get all violations', async () => {
      const ip1 = '192.168.1.100';
      const ip2 = '192.168.1.101';
      const lockerId = 1;
      const deviceId = 'device123';

      // Create violations for both IPs
      for (let i = 0; i < 30; i++) {
        await rateLimiter.checkRateLimit(ip1, lockerId + i, deviceId + i);
        await rateLimiter.checkRateLimit(ip2, lockerId + i, deviceId + i + 100);
      }

      // Trigger violations
      await rateLimiter.checkRateLimit(ip1, lockerId + 30, deviceId + 30);
      await rateLimiter.checkRateLimit(ip2, lockerId + 30, deviceId + 130);

      const violations = rateLimiter.getAllViolations();
      expect(violations.length).toBe(2);
      expect(violations.some(v => v.key === `ip:${ip1}`)).toBe(true);
      expect(violations.some(v => v.key === `ip:${ip2}`)).toBe(true);
    });
  });

  describe('Custom Configuration', () => {
    it('should accept custom rate limit configuration', async () => {
      const customRateLimiter = new RateLimiter({
        ip: { maxTokens: 10, refillRate: 10 / 60 }, // 10/min instead of 30/min
        locker: { maxTokens: 2, refillRate: 2 / 60 }, // 2/min instead of 6/min
        device: { maxTokens: 1, refillRate: 1 / 10 } // 1/10sec instead of 1/20sec
      });

      const ip = '192.168.1.100';
      const lockerId = 1;
      const deviceId = 'device123';

      // Should be blocked after 10 IP requests instead of 30
      for (let i = 0; i < 10; i++) {
        await customRateLimiter.checkRateLimit(ip, lockerId + i, deviceId + i);
      }

      const result = await customRateLimiter.checkRateLimit(ip, lockerId + 10, deviceId + 10);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('IP rate limit exceeded');
    });
  });
});
