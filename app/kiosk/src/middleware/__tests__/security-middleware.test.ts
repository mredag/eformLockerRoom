import { describe, it, expect, beforeEach, vi } from 'vitest';
import { securityMiddleware } from '../security-middleware';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('Security Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      ip: '192.168.1.100',
      url: '/test'
    };
    
    mockReply = {
      header: vi.fn().mockReturnThis(),
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };
    
    mockNext = vi.fn();
  });

  describe('Security Headers', () => {
    it('should add security headers for kiosk interface', async () => {
      mockRequest.url = '/';
      
      await securityMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        mockNext
      );

      expect(mockReply.header).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(mockReply.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockReply.header).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
      expect(mockReply.header).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("default-src 'self'")
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should add appropriate CSP for QR endpoints', async () => {
      mockRequest.url = '/lock/5';
      
      await securityMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        mockNext
      );

      expect(mockReply.header).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("script-src 'self' 'unsafe-inline'")
      );
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Origin Validation', () => {
    it('should allow requests from local network', async () => {
      mockRequest.headers = {
        origin: 'http://192.168.1.1:3000',
        referer: 'http://192.168.1.1:3000/lock/1'
      };
      mockRequest.url = '/act';
      
      await securityMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockReply.code).not.toHaveBeenCalledWith(403);
    });

    it('should reject requests from external origins', async () => {
      mockRequest.headers = {
        origin: 'http://malicious-site.com',
        referer: 'http://malicious-site.com/attack'
      };
      mockRequest.url = '/act';
      
      await securityMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        mockNext
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid origin' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow requests without origin for direct access', async () => {
      mockRequest.headers = {};
      mockRequest.url = '/lock/1';
      
      await securityMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockReply.code).not.toHaveBeenCalledWith(403);
    });
  });

  describe('IP Validation', () => {
    it('should allow local network IPs', async () => {
      const localIPs = ['192.168.1.100', '10.0.0.50', '172.16.0.10', '127.0.0.1'];
      
      for (const ip of localIPs) {
        mockRequest.ip = ip;
        mockNext.mockClear();
        
        await securityMiddleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply,
          mockNext
        );

        expect(mockNext).toHaveBeenCalled();
      }
    });

    it('should reject external IPs for sensitive endpoints', async () => {
      mockRequest.ip = '8.8.8.8';
      mockRequest.url = '/act';
      
      await securityMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        mockNext
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should pass through for non-rate-limited endpoints', async () => {
      mockRequest.url = '/health';
      
      await securityMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('should add security context for rate-limited endpoints', async () => {
      mockRequest.url = '/act';
      mockRequest.ip = '192.168.1.100';
      
      await securityMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed headers gracefully', async () => {
      mockRequest.headers = {
        origin: 'not-a-valid-url',
        referer: 'also-not-valid'
      };
      mockRequest.url = '/act';
      
      await securityMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        mockNext
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle missing IP address', async () => {
      mockRequest.ip = undefined;
      mockRequest.url = '/act';
      
      await securityMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        mockNext
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});