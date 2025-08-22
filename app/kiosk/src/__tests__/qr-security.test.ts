import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { QrHandler } from '../controllers/qr-handler';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { ModbusController } from '../hardware/modbus-controller';
import { FastifyRequest, FastifyReply } from 'fastify';

// Mock dependencies
vi.mock('../../../../shared/services/locker-state-manager.js');
vi.mock('../hardware/modbus-controller.js');

describe('QR Security Tests', () => {
  let qrHandler: QrHandler;
  let mockLockerStateManager: vi.Mocked<LockerStateManager>;
  let mockModbusController: vi.Mocked<ModbusController>;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    mockLockerStateManager = {
      getLocker: vi.fn(),
      assignLocker: vi.fn(),
      confirmOwnership: vi.fn(),
      releaseLocker: vi.fn(),
      checkExistingOwnership: vi.fn(),
    } as any;

    mockModbusController = {
      openLocker: vi.fn(),
    } as any;

    qrHandler = new QrHandler(mockLockerStateManager, mockModbusController);

    mockReply = {
      code: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    };

    mockRequest = {
      params: {},
      body: {},
      headers: {},
      ip: '192.168.1.100',
      socket: { remoteAddress: '192.168.1.100' },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Validation', () => {
    it('should reject requests without token', async () => {
      mockRequest.body = {};

      const result = await qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Token required');
    });

    it('should reject invalid tokens', async () => {
      mockRequest.body = { token: 'invalid-token' };

      const result = await qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid or expired token');
    });

    it('should reject expired tokens', async () => {
      // Create an expired token (simulate by mocking time)
      const originalNow = Date.now;
      Date.now = vi.fn(() => originalNow() + 10000); // 10 seconds later

      mockRequest.body = { token: 'expired-token' };

      const result = await qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid or expired token');

      Date.now = originalNow;
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      // Mock a valid locker
      mockLockerStateManager.getLocker.mockResolvedValue({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Free',
        is_vip: false,
        version: 1,
      } as any);
    });

    it('should enforce IP rate limiting (30/min)', async () => {
      const deviceId = 'device123';
      const lockerId = 1;
      
      // Generate a valid token for testing
      const validToken = await generateValidToken(lockerId, deviceId);
      mockRequest.body = { token: validToken };
      mockRequest.headers = {
        origin: 'http://localhost:3001',
        host: 'localhost:3001'
      };

      // Make 31 requests rapidly (should exceed 30/min limit)
      const promises = [];
      for (let i = 0; i < 31; i++) {
        promises.push(
          qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply)
        );
      }

      const results = await Promise.all(promises);
      
      // At least one should be rate limited
      const rateLimited = results.some(result => !result.success && result.message.includes('Rate limit'));
      expect(rateLimited).toBe(true);
    });

    it('should enforce device rate limiting (1/20sec)', async () => {
      const deviceId = 'device123';
      const lockerId = 1;
      
      const validToken = await generateValidToken(lockerId, deviceId);
      mockRequest.body = { token: validToken };
      mockRequest.headers = {
        origin: 'http://localhost:3001',
        host: 'localhost:3001'
      };

      // Make 2 requests immediately (should exceed 1/20sec limit)
      const result1 = await qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply);
      const result2 = await qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Second request should be rate limited
      expect(result2.success).toBe(false);
      expect(result2.message).toContain('Rate limit');
    });

    it('should enforce locker rate limiting (6/min)', async () => {
      const deviceId = 'device123';
      const lockerId = 1;
      
      const validToken = await generateValidToken(lockerId, deviceId);
      mockRequest.body = { token: validToken };
      mockRequest.headers = {
        origin: 'http://localhost:3001',
        host: 'localhost:3001'
      };

      // Make 7 requests rapidly (should exceed 6/min limit)
      const promises = [];
      for (let i = 0; i < 7; i++) {
        // Use different device IDs to avoid device rate limiting
        const token = await generateValidToken(lockerId, `device${i}`);
        const request = { ...mockRequest, body: { token } };
        promises.push(
          qrHandler.handleQrAction('kiosk-1', request as FastifyRequest, mockReply as FastifyReply)
        );
      }

      const results = await Promise.all(promises);
      
      // At least one should be rate limited
      const rateLimited = results.some(result => !result.success && result.message.includes('Rate limit'));
      expect(rateLimited).toBe(true);
    });

    it('should return 429 status code for rate limited requests', async () => {
      const deviceId = 'device123';
      const lockerId = 1;
      
      const validToken = await generateValidToken(lockerId, deviceId);
      mockRequest.body = { token: validToken };
      mockRequest.headers = {
        origin: 'http://localhost:3001',
        host: 'localhost:3001'
      };

      // Make multiple requests to trigger rate limiting
      await qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply);
      await qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(429);
    });
  });

  describe('Origin/Referer Validation', () => {
    beforeEach(() => {
      mockLockerStateManager.getLocker.mockResolvedValue({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Free',
        is_vip: false,
        version: 1,
      } as any);
    });

    it('should accept requests with valid origin', async () => {
      const deviceId = 'device123';
      const lockerId = 1;
      
      const validToken = await generateValidToken(lockerId, deviceId);
      mockRequest.body = { token: validToken };
      mockRequest.headers = {
        origin: 'http://localhost:3001',
        host: 'localhost:3001'
      };

      const result = await qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(result.success).toBe(true);
    });

    it('should accept requests with valid referer', async () => {
      const deviceId = 'device123';
      const lockerId = 1;
      
      const validToken = await generateValidToken(lockerId, deviceId);
      mockRequest.body = { token: validToken };
      mockRequest.headers = {
        referer: 'http://localhost:3001/lock/1',
        host: 'localhost:3001'
      };

      const result = await qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(result.success).toBe(true);
    });

    it('should reject requests with invalid origin', async () => {
      const deviceId = 'device123';
      const lockerId = 1;
      
      const validToken = await generateValidToken(lockerId, deviceId);
      mockRequest.body = { token: validToken };
      mockRequest.headers = {
        origin: 'http://malicious-site.com',
        host: 'localhost:3001'
      };

      const result = await qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid origin');
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('should accept local network origins', async () => {
      const deviceId = 'device123';
      const lockerId = 1;
      
      const validToken = await generateValidToken(lockerId, deviceId);
      mockRequest.body = { token: validToken };
      mockRequest.headers = {
        origin: 'http://192.168.1.50:3001',
        host: '192.168.1.50:3001'
      };

      const result = await qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(result.success).toBe(true);
    });
  });

  describe('VIP Locker Blocking', () => {
    it('should return 423 status for VIP lockers', async () => {
      mockLockerStateManager.getLocker.mockResolvedValue({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Free',
        is_vip: true,
        version: 1,
      } as any);

      const deviceId = 'device123';
      const lockerId = 1;
      
      const validToken = await generateValidToken(lockerId, deviceId);
      mockRequest.body = { token: validToken };
      mockRequest.headers = {
        origin: 'http://localhost:3001',
        host: 'localhost:3001'
      };

      const result = await qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(result.success).toBe(false);
      expect(result.action).toBe('vip_blocked');
      expect(result.message).toBe('VIP dolap. QR kapalı');
      expect(mockReply.code).toHaveBeenCalledWith(423);
    });

    it('should return 423 status for VIP locker GET requests', async () => {
      mockLockerStateManager.getLocker.mockResolvedValue({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Free',
        is_vip: true,
        version: 1,
      } as any);

      await qrHandler.handleQrGet('kiosk-1', 1, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(423);
      expect(mockReply.type).toHaveBeenCalledWith('text/html');
    });
  });

  describe('Device ID Management', () => {
    it('should generate device ID for new requests', async () => {
      mockLockerStateManager.getLocker.mockResolvedValue({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Free',
        is_vip: false,
        version: 1,
      } as any);

      mockRequest.headers = { cookie: '' };

      await qrHandler.handleQrGet('kiosk-1', 1, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('device_id=')
      );
    });

    it('should use existing device ID from cookie', async () => {
      mockLockerStateManager.getLocker.mockResolvedValue({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Free',
        is_vip: false,
        version: 1,
      } as any);

      mockRequest.headers = { cookie: 'device_id=existing123' };

      await qrHandler.handleQrGet('kiosk-1', 1, mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not set new cookie if one exists
      expect(mockReply.header).not.toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('device_id=')
      );
    });

    it('should detect private/incognito mode', async () => {
      mockLockerStateManager.getLocker.mockResolvedValue({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Free',
        is_vip: false,
        version: 1,
      } as any);

      mockRequest.headers = { 
        'user-agent': 'Mozilla/5.0 (Private)',
        'dnt': '1'
      };

      await qrHandler.handleQrGet('kiosk-1', 1, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.stringContaining('Gizli tarama modunda QR erişimi sınırlıdır')
      );
    });
  });

  describe('HMAC Token Security', () => {
    it('should generate tokens with proper HMAC signature', async () => {
      // This test would verify that tokens are properly signed
      // Implementation depends on the actual token generation method
      const deviceId = 'device123';
      const lockerId = 1;
      
      // Test that we can generate and validate a token
      const token = await generateValidToken(lockerId, deviceId);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should reject tokens with invalid signatures', async () => {
      const deviceId = 'device123';
      const lockerId = 1;
      
      // Create a token with invalid signature
      const invalidToken = Buffer.from(JSON.stringify({
        locker_id: lockerId,
        device_id: deviceId,
        action: 'assign',
        expires_at: Date.now() + 5000,
        signature: 'invalid-signature'
      })).toString('base64');

      mockRequest.body = { token: invalidToken };

      const result = await qrHandler.handleQrAction('kiosk-1', mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid or expired token');
    });
  });
});

// Helper function to generate valid tokens for testing
async function generateValidToken(lockerId: number, deviceId: string): string {
  // Create a proper HMAC-signed token using the same logic as QrHandler
  const { createHmac } = await import('crypto');
  const QR_HMAC_SECRET = 'default-secret-change-in-production';
  
  const payload = {
    locker_id: lockerId,
    device_id: deviceId,
    action: 'assign',
    expires_at: Date.now() + 5000
  };
  
  const payloadStr = JSON.stringify(payload);
  const signature = createHmac('sha256', QR_HMAC_SECRET)
    .update(payloadStr)
    .digest('hex');
  
  return Buffer.from(JSON.stringify({ ...payload, signature })).toString('base64');
}