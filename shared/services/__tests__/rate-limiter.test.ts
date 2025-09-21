import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter, RateLimitConfig, createRateLimiter } from '../rate-limiter';
import { EventRepository } from '../../database/event-repository';
import { EventType } from '../../types/core-entities';

// Mock EventRepository
const mockEventRepository = {
  logEvent: vi.fn().mockResolvedValue({ id: 1 })
} as unknown as EventRepository;

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  let config: RateLimitConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventRepository.logEvent.mockClear();

    config = {
      ip: { maxTokens: 30, refillRate: 0.5, blockThreshold: 10, blockDuration: 300 },
      card: { maxTokens: 60, refillRate: 1, blockThreshold: 20, blockDuration: 600 },
      locker: { maxTokens: 6, refillRate: 0.1, blockThreshold: 15, blockDuration: 300 },
      device: { maxTokens: 1, refillRate: 0.05, blockThreshold: 5, blockDuration: 1200 },
      cleanupInterval: 60,
      violationLogThreshold: 3
    };

    rateLimiter = new RateLimiter(config, mockEventRepository);
  });

  afterEach(() => {
    rateLimiter.shutdown();
  });

  describe('IP Rate Limiting', () => {
    it('should allow requests within IP rate limit', async () => {
      const result = await rateLimiter.checkIpRateLimit('192.168.1.1', 'kiosk1');
      
      expect(result.allowed).toBe(true);
      expect(result.remainingTokens).toBe(29);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it('should deny requests exceeding IP rate limit', async () => {
      const ip = '192.168.1.2';
      
      // Exhaust all tokens
      for (let i = 0; i < 30; i++) {
        await rateLimiter.checkIpRateLimit(ip, 'kiosk1');
      }
      
      // Next request should be denied
      const result = await rateLimiter.checkIpRateLimit(ip, 'kiosk1');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('ip rate limit exceeded');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should refill tokens over time', async () => {
      const ip = '192.168.1.3';
      
      // Exhaust all tokens
      for (let i = 0; i < 30; i++) {
        await rateLimiter.checkIpRateLimit(ip, 'kiosk1');
      }
      
      // Should be denied
      let result = await rateLimiter.checkIpRateLimit(ip, 'kiosk1');
      expect(result.allowed).toBe(false);
      
      // Mock time passage (2 seconds = 1 token at 0.5 tokens/sec)
      const bucket = rateLimiter.getBucketStatus(`ip:${ip}`);
      if (bucket) {
        bucket.last_refill = new Date(Date.now() - 2000);
      }
      
      // Should now be allowed
      result = await rateLimiter.checkIpRateLimit(ip, 'kiosk1');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Card Rate Limiting', () => {
    it('should allow requests within card rate limit', async () => {
      const result = await rateLimiter.checkCardRateLimit('card123', 'kiosk1');
      
      expect(result.allowed).toBe(true);
      expect(result.remainingTokens).toBe(59);
    });

    it('should deny requests exceeding card rate limit', async () => {
      const cardId = 'card456';
      
      // Exhaust all tokens
      for (let i = 0; i < 60; i++) {
        await rateLimiter.checkCardRateLimit(cardId, 'kiosk1');
      }
      
      // Next request should be denied
      const result = await rateLimiter.checkCardRateLimit(cardId, 'kiosk1');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('card rate limit exceeded');
    });
  });

  describe('Locker Rate Limiting', () => {
    it('should allow requests within locker rate limit', async () => {
      const result = await rateLimiter.checkLockerRateLimit(1, 'kiosk1');
      
      expect(result.allowed).toBe(true);
      expect(result.remainingTokens).toBe(5);
    });

    it('should deny requests exceeding locker rate limit', async () => {
      const lockerId = 2;
      const kioskId = 'kiosk1';
      
      // Exhaust all tokens
      for (let i = 0; i < 6; i++) {
        await rateLimiter.checkLockerRateLimit(lockerId, kioskId);
      }
      
      // Next request should be denied
      const result = await rateLimiter.checkLockerRateLimit(lockerId, kioskId);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('locker rate limit exceeded');
    });
  });

  describe('Device Rate Limiting', () => {
    it('should allow requests within device rate limit', async () => {
      const result = await rateLimiter.checkDeviceRateLimit('device123', 'kiosk1');
      
      expect(result.allowed).toBe(true);
      expect(result.remainingTokens).toBe(0);
    });

    it('should deny rapid successive requests from same device', async () => {
      const deviceId = 'device456';
      
      // First request should be allowed
      let result = await rateLimiter.checkDeviceRateLimit(deviceId, 'kiosk1');
      expect(result.allowed).toBe(true);
      
      // Immediate second request should be denied
      result = await rateLimiter.checkDeviceRateLimit(deviceId, 'kiosk1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('device rate limit exceeded');
    });
  });

  describe('QR Rate Limiting (Comprehensive)', () => {
    it('should check all QR rate limits and allow when within limits', async () => {
      const result = await rateLimiter.checkQrRateLimits(
        '192.168.1.10',
        5,
        'device789',
        'kiosk1'
      );
      
      expect(result.allowed).toBe(true);
    });

    it('should deny when IP rate limit exceeded', async () => {
      const ip = '192.168.1.11';
      
      // Exhaust IP tokens
      for (let i = 0; i < 30; i++) {
        await rateLimiter.checkIpRateLimit(ip, 'kiosk1');
      }
      
      const result = await rateLimiter.checkQrRateLimits(ip, 5, 'device789', 'kiosk1');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('ip rate limit exceeded');
    });

    it('should deny when locker rate limit exceeded', async () => {
      const lockerId = 10;
      const kioskId = 'kiosk1';
      
      // Exhaust locker tokens
      for (let i = 0; i < 6; i++) {
        await rateLimiter.checkLockerRateLimit(lockerId, kioskId);
      }
      
      const result = await rateLimiter.checkQrRateLimits('192.168.1.12', lockerId, 'device789', kioskId);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('locker rate limit exceeded');
    });

    it('should deny when device rate limit exceeded', async () => {
      const deviceId = 'device999';
      
      // Exhaust device tokens
      await rateLimiter.checkDeviceRateLimit(deviceId, 'kiosk1');
      
      const result = await rateLimiter.checkQrRateLimits('192.168.1.13', 5, deviceId, 'kiosk1');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('device rate limit exceeded');
    });
  });

  describe('RFID Rate Limiting', () => {
    it('should allow RFID requests within limits', async () => {
      const result = await rateLimiter.checkRfidRateLimits('rfid123', 'kiosk1');
      
      expect(result.allowed).toBe(true);
    });

    it('should deny RFID requests exceeding card limits', async () => {
      const cardId = 'rfid456';
      
      // Exhaust card tokens
      for (let i = 0; i < 60; i++) {
        await rateLimiter.checkCardRateLimit(cardId, 'kiosk1');
      }
      
      const result = await rateLimiter.checkRfidRateLimits(cardId, 'kiosk1');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('card rate limit exceeded');
    });
  });

  describe('Violation Tracking and Blocking', () => {
    it('should track violations and block after threshold', async () => {
      const ip = '192.168.1.20';
      
      // Exhaust tokens and trigger violations
      for (let i = 0; i < 30; i++) {
        await rateLimiter.checkIpRateLimit(ip, 'kiosk1');
      }
      
      // Trigger violations up to block threshold
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkIpRateLimit(ip, 'kiosk1');
      }
      
      // Should now be blocked
      expect(rateLimiter.isBlocked(`ip:${ip}`)).toBe(true);
      
      const result = await rateLimiter.checkIpRateLimit(ip, 'kiosk1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Temporarily blocked');
    });

    it('should log violations after threshold', async () => {
      const ip = '192.168.1.21';
      
      // Exhaust tokens
      for (let i = 0; i < 30; i++) {
        await rateLimiter.checkIpRateLimit(ip, 'kiosk1');
      }
      
      // Trigger violations to reach log threshold
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkIpRateLimit(ip, 'kiosk1');
      }
      
      // Should have logged the violation
      expect(mockEventRepository.logEvent).toHaveBeenCalledWith(
        'kiosk1',
        EventType.RATE_LIMIT_VIOLATION,
        expect.objectContaining({
          key: `ip:${ip}`,
          violation_type: 'ip',
          violation_count: 3
        })
      );
    });

    it('should unblock after block duration expires', async () => {
      const ip = '192.168.1.22';
      
      // Create a blocked violation
      const violation = {
        id: Date.now(),
        key: `ip:${ip}`,
        limit_type: 'ip' as const,
        violation_count: 15,
        first_violation: new Date(),
        last_violation: new Date(),
        is_blocked: true,
        block_expires_at: new Date(Date.now() - 1000) // Expired 1 second ago
      };
      
      rateLimiter['violations'].set(`ip:${ip}`, violation);
      
      // Should not be blocked anymore
      expect(rateLimiter.isBlocked(`ip:${ip}`)).toBe(false);
    });
  });

  describe('Administrative Functions', () => {
    it('should reset limits for a key', async () => {
      const ip = '192.168.1.30';
      
      // Create some state
      await rateLimiter.checkIpRateLimit(ip, 'kiosk1');
      expect(rateLimiter.getBucketStatus(`ip:${ip}`)).not.toBeNull();
      
      // Reset limits
      await rateLimiter.resetLimits(`ip:${ip}`, 'admin1', 'kiosk1');
      
      // Should be cleared
      expect(rateLimiter.getBucketStatus(`ip:${ip}`)).toBeNull();
      expect(rateLimiter.getViolationHistory(`ip:${ip}`)).toBeNull();
    });

    it('should provide statistics', () => {
      const stats = rateLimiter.getStatistics();
      
      expect(stats).toHaveProperty('buckets');
      expect(stats).toHaveProperty('violations');
      expect(stats).toHaveProperty('activeBlocks');
      expect(stats).toHaveProperty('config');
      expect(stats.config).toEqual(config);
    });

    it('should get all violations', async () => {
      const ip1 = '192.168.1.31';
      const ip2 = '192.168.1.32';
      
      // Create enough violations to trigger blocking (need 10+ violations per IP)
      // IP has 30 tokens, so first 30 calls succeed, then next calls create violations
      for (let i = 0; i < 45; i++) {  // 45 calls = 30 success + 15 violations
        await rateLimiter.checkIpRateLimit(ip1, 'kiosk1');
      }
      for (let i = 0; i < 45; i++) {  // 45 calls = 30 success + 15 violations
        await rateLimiter.checkIpRateLimit(ip2, 'kiosk1');
      }
      
      // Give a small delay to ensure all violations are processed
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const violations = rateLimiter.getAllViolations();
      expect(violations.length).toBeGreaterThan(0);
      
      const activeBlocks = rateLimiter.getActiveBlocks();
      expect(activeBlocks.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration', () => {
      const newConfig = {
        ip: { maxTokens: 50, refillRate: 1, blockThreshold: 15, blockDuration: 600 }
      };
      
      rateLimiter.updateConfig(newConfig);
      
      const stats = rateLimiter.getStatistics();
      expect(stats.config.ip.maxTokens).toBe(50);
      expect(stats.config.ip.refillRate).toBe(1);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup old buckets and violations', async () => {
      const ip = '192.168.1.40';
      
      // Create bucket and violation
      await rateLimiter.checkIpRateLimit(ip, 'kiosk1');
      
      // Manually age the bucket
      const bucket = rateLimiter.getBucketStatus(`ip:${ip}`);
      if (bucket) {
        bucket.last_refill = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      }
      
      // Run cleanup
      rateLimiter.cleanup();
      
      // Should be cleaned up
      expect(rateLimiter.getBucketStatus(`ip:${ip}`)).toBeNull();
    });
  });
});

describe('createRateLimiter', () => {
  it('should create rate limiter with system config', () => {
    const systemConfig = {
      security: {
        rate_limits: {
          ip_per_minute: 50,
          card_per_minute: 100,
          locker_per_minute: 10,
          device_per_20_seconds: 1
        }
      }
    };
    
    const rateLimiter = createRateLimiter(systemConfig, mockEventRepository);
    const stats = rateLimiter.getStatistics();
    
    expect(stats.config.ip.maxTokens).toBe(50);
    expect(stats.config.card.maxTokens).toBe(100);
    expect(stats.config.locker.maxTokens).toBe(10);
    
    rateLimiter.shutdown();
  });

  it('should use default values when config is missing', () => {
    const systemConfig = {};
    
    const rateLimiter = createRateLimiter(systemConfig, mockEventRepository);
    const stats = rateLimiter.getStatistics();
    
    expect(stats.config.ip.maxTokens).toBe(30); // Default
    expect(stats.config.card.maxTokens).toBe(60); // Default
    expect(stats.config.locker.maxTokens).toBe(6); // Default
    
    rateLimiter.shutdown();
  });
});
