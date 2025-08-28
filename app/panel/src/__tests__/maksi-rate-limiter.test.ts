/**
 * Unit Tests for Maksisoft Rate Limiter
 * 
 * Tests the rate limiting middleware with timing scenarios to ensure
 * proper throttling and cleanup behavior.
 * 
 * Requirements: Core functionality validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rateLimit, clearRateLimitStore, stopCleanupTimer } from '../middleware/rate-limit';

// Mock Fastify request and reply objects
const createMockRequest = (ip: string, rfid: string) => ({
  ip,
  headers: {},
  query: { rfid },
  body: {},
  socket: { remoteAddress: ip }
});

const createMockReply = () => {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    statusCode: 200
  };
  return reply;
};

describe('Maksisoft Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitStore();
  });

  afterEach(() => {
    stopCleanupTimer();
  });

  describe('Basic rate limiting', () => {
    it('should allow first request for IP+RFID combination', () => {
      const request = createMockRequest('192.168.1.100', '1234567890');
      const reply = createMockReply();
      const next = vi.fn();

      rateLimit(request as any, reply as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(reply.code).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should block second request within 1 second window', () => {
      const request = createMockRequest('192.168.1.100', '1234567890');
      const reply = createMockReply();
      const next = vi.fn();

      // First request - should pass
      rateLimit(request as any, reply as any, next);
      expect(next).toHaveBeenCalledTimes(1);

      // Second request immediately - should be blocked
      const reply2 = createMockReply();
      const next2 = vi.fn();
      rateLimit(request as any, reply2 as any, next2);

      expect(next2).not.toHaveBeenCalled();
      expect(reply2.code).toHaveBeenCalledWith(429);
      expect(reply2.send).toHaveBeenCalledWith({
        success: false,
        error: 'rate_limited'
      });
    });

    it('should allow requests from different IP addresses', () => {
      const request1 = createMockRequest('192.168.1.100', '1234567890');
      const request2 = createMockRequest('192.168.1.101', '1234567890');
      const reply1 = createMockReply();
      const reply2 = createMockReply();
      const next1 = vi.fn();
      const next2 = vi.fn();

      // First IP - should pass
      rateLimit(request1 as any, reply1 as any, next1);
      expect(next1).toHaveBeenCalledTimes(1);

      // Different IP, same RFID - should also pass
      rateLimit(request2 as any, reply2 as any, next2);
      expect(next2).toHaveBeenCalledTimes(1);
    });

    it('should allow requests with different RFID from same IP', () => {
      const request1 = createMockRequest('192.168.1.100', '1234567890');
      const request2 = createMockRequest('192.168.1.100', '0987654321');
      const reply1 = createMockReply();
      const reply2 = createMockReply();
      const next1 = vi.fn();
      const next2 = vi.fn();

      // First RFID - should pass
      rateLimit(request1 as any, reply1 as any, next1);
      expect(next1).toHaveBeenCalledTimes(1);

      // Same IP, different RFID - should also pass
      rateLimit(request2 as any, reply2 as any, next2);
      expect(next2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Timing scenarios', () => {
    it('should allow request after 1 second window expires', async () => {
      vi.useFakeTimers();

      const request = createMockRequest('192.168.1.100', '1234567890');
      const reply1 = createMockReply();
      const reply2 = createMockReply();
      const next1 = vi.fn();
      const next2 = vi.fn();

      // First request - should pass
      rateLimit(request as any, reply1 as any, next1);
      expect(next1).toHaveBeenCalledTimes(1);

      // Advance time by 1.1 seconds
      vi.advanceTimersByTime(1100);

      // Second request after window - should pass
      rateLimit(request as any, reply2 as any, next2);
      expect(next2).toHaveBeenCalledTimes(1);
      expect(reply2.code).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should block request just before 1 second window expires', async () => {
      vi.useFakeTimers();

      const request = createMockRequest('192.168.1.100', '1234567890');
      const reply1 = createMockReply();
      const reply2 = createMockReply();
      const next1 = vi.fn();
      const next2 = vi.fn();

      // First request - should pass
      rateLimit(request as any, reply1 as any, next1);
      expect(next1).toHaveBeenCalledTimes(1);

      // Advance time by 900ms (just under 1 second)
      vi.advanceTimersByTime(900);

      // Second request before window expires - should be blocked
      rateLimit(request as any, reply2 as any, next2);
      expect(next2).not.toHaveBeenCalled();
      expect(reply2.code).toHaveBeenCalledWith(429);

      vi.useRealTimers();
    });
  });

  describe('IP address extraction', () => {
    it('should handle X-Forwarded-For header', () => {
      const request = {
        ip: '127.0.0.1',
        headers: { 'x-forwarded-for': '192.168.1.200, 10.0.0.1' },
        query: { rfid: '1234567890' },
        body: {},
        socket: { remoteAddress: '127.0.0.1' }
      };
      const reply = createMockReply();
      const next = vi.fn();

      rateLimit(request as any, reply as any, next);

      expect(next).toHaveBeenCalledTimes(1);

      // Make another request with same forwarded IP - should be blocked
      const reply2 = createMockReply();
      const next2 = vi.fn();
      rateLimit(request as any, reply2 as any, next2);

      expect(next2).not.toHaveBeenCalled();
      expect(reply2.code).toHaveBeenCalledWith(429);
    });

    it('should handle X-Real-IP header', () => {
      const request = {
        ip: '127.0.0.1',
        headers: { 'x-real-ip': '192.168.1.201' },
        query: { rfid: '1234567890' },
        body: {},
        socket: { remoteAddress: '127.0.0.1' }
      };
      const reply = createMockReply();
      const next = vi.fn();

      rateLimit(request as any, reply as any, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should fallback to request.ip when no headers present', () => {
      const request = {
        ip: '192.168.1.202',
        headers: {},
        query: { rfid: '1234567890' },
        body: {},
        socket: { remoteAddress: '10.0.0.1' }
      };
      const reply = createMockReply();
      const next = vi.fn();

      rateLimit(request as any, reply as any, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('RFID extraction', () => {
    it('should extract RFID from query parameters', () => {
      const request = createMockRequest('192.168.1.100', '1234567890');
      const reply = createMockReply();
      const next = vi.fn();

      rateLimit(request as any, reply as any, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should extract RFID from request body', () => {
      const request = {
        ip: '192.168.1.100',
        headers: {},
        query: {},
        body: { rfid: '1234567890' },
        socket: { remoteAddress: '192.168.1.100' }
      };
      const reply = createMockReply();
      const next = vi.fn();

      rateLimit(request as any, reply as any, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should handle missing RFID gracefully', () => {
      const request = {
        ip: '192.168.1.100',
        headers: {},
        query: {},
        body: {},
        socket: { remoteAddress: '192.168.1.100' }
      };
      const reply = createMockReply();
      const next = vi.fn();

      rateLimit(request as any, reply as any, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should trim whitespace from RFID', () => {
      const request = {
        ip: '192.168.1.100',
        headers: {},
        query: { rfid: '  1234567890  ' },
        body: {},
        socket: { remoteAddress: '192.168.1.100' }
      };
      const reply = createMockReply();
      const next = vi.fn();

      rateLimit(request as any, reply as any, next);

      expect(next).toHaveBeenCalledTimes(1);

      // Second request with same trimmed RFID should be blocked
      const reply2 = createMockReply();
      const next2 = vi.fn();
      rateLimit(request as any, reply2 as any, next2);

      expect(next2).not.toHaveBeenCalled();
      expect(reply2.code).toHaveBeenCalledWith(429);
    });
  });
});