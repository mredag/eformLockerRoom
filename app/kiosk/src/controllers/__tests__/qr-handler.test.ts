import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QrHandler } from '../qr-handler';
import { RateLimiter } from '../../services/rate-limiter';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { EventLogger } from '../../../../shared/services/event-logger';

// Mock dependencies
vi.mock('../../services/rate-limiter.js');
vi.mock('../../../../shared/database/database-manager.js');
vi.mock('../../../../shared/services/locker-state-manager.js');
vi.mock('../../../../shared/services/event-logger.js');

describe('QrHandler', () => {
  let qrHandler: QrHandler;
  let mockRateLimiter: any;
  let mockDbManager: any;
  let mockLockerStateManager: any;
  let mockEventLogger: any;

  beforeEach(() => {
    mockRateLimiter = {
      checkQrRateLimits: vi.fn()
    };
    
    mockDbManager = {
      getLockerRepository: vi.fn().mockReturnValue({
        findByKioskAndId: vi.fn(),
        updateStatus: vi.fn()
      }),
      getVipContractRepository: vi.fn().mockReturnValue({
        findActiveByLocker: vi.fn()
      })
    };
    
    mockLockerStateManager = {
      assignLocker: vi.fn(),
      releaseLocker: vi.fn()
    };
    
    mockEventLogger = {
      logEvent: vi.fn()
    };

    qrHandler = new QrHandler(
      'kiosk1',
      mockRateLimiter,
      mockDbManager,
      mockLockerStateManager,
      mockEventLogger
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleQrRequest', () => {
    it('should assign free locker to device', async () => {
      const lockerId = 5;
      const deviceId = 'device123';
      const ip = '192.168.1.100';

      // Mock rate limiting - allow request
      mockRateLimiter.checkQrRateLimits.mockResolvedValue({
        allowed: true,
        reason: null
      });

      // Mock locker is free
      const mockLocker = {
        id: lockerId,
        kiosk_id: 'kiosk1',
        status: 'Free',
        owner_type: null,
        owner_key: null,
        is_vip: false
      };
      mockDbManager.getLockerRepository().findByKioskAndId.mockResolvedValue(mockLocker);

      // Mock no VIP contract
      mockDbManager.getVipContractRepository().findActiveByLocker.mockResolvedValue(null);

      // Mock successful assignment
      mockLockerStateManager.assignLocker.mockResolvedValue(true);

      const result = await qrHandler.handleQrRequest(lockerId, deviceId, ip);

      expect(result.success).toBe(true);
      expect(result.action).toBe('assigned');
      expect(result.message).toContain('Dolap atandı');
      expect(mockLockerStateManager.assignLocker).toHaveBeenCalledWith(
        'kiosk1',
        lockerId,
        'device',
        deviceId
      );
      expect(mockEventLogger.logEvent).toHaveBeenCalledWith(
        'qr_assign',
        'kiosk1',
        lockerId,
        expect.objectContaining({
          device_id: deviceId,
          ip_address: ip
        })
      );
    });

    it('should release owned locker from same device', async () => {
      const lockerId = 5;
      const deviceId = 'device123';
      const ip = '192.168.1.100';

      // Mock rate limiting - allow request
      mockRateLimiter.checkQrRateLimits.mockResolvedValue({
        allowed: true,
        reason: null
      });

      // Mock locker is owned by same device
      const mockLocker = {
        id: lockerId,
        kiosk_id: 'kiosk1',
        status: 'Owned',
        owner_type: 'device',
        owner_key: deviceId,
        is_vip: false
      };
      mockDbManager.getLockerRepository().findByKioskAndId.mockResolvedValue(mockLocker);

      // Mock successful release
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const result = await qrHandler.handleQrRequest(lockerId, deviceId, ip);

      expect(result.success).toBe(true);
      expect(result.action).toBe('released');
      expect(result.message).toContain('Dolap açıldı');
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith('kiosk1', lockerId);
      expect(mockEventLogger.logEvent).toHaveBeenCalledWith(
        'qr_release',
        'kiosk1',
        lockerId,
        expect.objectContaining({
          device_id: deviceId,
          ip_address: ip
        })
      );
    });

    it('should reject request when rate limited', async () => {
      const lockerId = 5;
      const deviceId = 'device123';
      const ip = '192.168.1.100';

      // Mock rate limiting - deny request
      mockRateLimiter.checkQrRateLimits.mockResolvedValue({
        allowed: false,
        reason: 'IP rate limit exceeded'
      });

      const result = await qrHandler.handleQrRequest(lockerId, deviceId, ip);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(429);
      expect(result.message).toContain('Çok fazla istek');
      expect(mockDbManager.getLockerRepository().findByKioskAndId).not.toHaveBeenCalled();
    });

    it('should reject request for VIP locker', async () => {
      const lockerId = 5;
      const deviceId = 'device123';
      const ip = '192.168.1.100';

      // Mock rate limiting - allow request
      mockRateLimiter.checkQrRateLimits.mockResolvedValue({
        allowed: true,
        reason: null
      });

      // Mock locker exists
      const mockLocker = {
        id: lockerId,
        kiosk_id: 'kiosk1',
        status: 'Free',
        owner_type: null,
        owner_key: null,
        is_vip: true
      };
      mockDbManager.getLockerRepository().findByKioskAndId.mockResolvedValue(mockLocker);

      // Mock VIP contract exists
      mockDbManager.getVipContractRepository().findActiveByLocker.mockResolvedValue({
        id: 1,
        rfid_card: 'vip123'
      });

      const result = await qrHandler.handleQrRequest(lockerId, deviceId, ip);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(423);
      expect(result.message).toContain('VIP dolap');
    });

    it('should reject request for occupied locker by different device', async () => {
      const lockerId = 5;
      const deviceId = 'device123';
      const ip = '192.168.1.100';

      // Mock rate limiting - allow request
      mockRateLimiter.checkQrRateLimits.mockResolvedValue({
        allowed: true,
        reason: null
      });

      // Mock locker is owned by different device
      const mockLocker = {
        id: lockerId,
        kiosk_id: 'kiosk1',
        status: 'Owned',
        owner_type: 'device',
        owner_key: 'different-device',
        is_vip: false
      };
      mockDbManager.getLockerRepository().findByKioskAndId.mockResolvedValue(mockLocker);

      const result = await qrHandler.handleQrRequest(lockerId, deviceId, ip);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(409);
      expect(result.message).toContain('Dolap dolu');
    });

    it('should handle non-existent locker', async () => {
      const lockerId = 999;
      const deviceId = 'device123';
      const ip = '192.168.1.100';

      // Mock rate limiting - allow request
      mockRateLimiter.checkQrRateLimits.mockResolvedValue({
        allowed: true,
        reason: null
      });

      // Mock locker not found
      mockDbManager.getLockerRepository().findByKioskAndId.mockResolvedValue(null);

      const result = await qrHandler.handleQrRequest(lockerId, deviceId, ip);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.message).toContain('Dolap bulunamadı');
    });

    it('should handle blocked locker', async () => {
      const lockerId = 5;
      const deviceId = 'device123';
      const ip = '192.168.1.100';

      // Mock rate limiting - allow request
      mockRateLimiter.checkQrRateLimits.mockResolvedValue({
        allowed: true,
        reason: null
      });

      // Mock blocked locker
      const mockLocker = {
        id: lockerId,
        kiosk_id: 'kiosk1',
        status: 'Blocked',
        owner_type: null,
        owner_key: null,
        is_vip: false
      };
      mockDbManager.getLockerRepository().findByKioskAndId.mockResolvedValue(mockLocker);

      const result = await qrHandler.handleQrRequest(lockerId, deviceId, ip);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(423);
      expect(result.message).toContain('Dolap bakımda');
    });
  });

  describe('generateActionToken', () => {
    it('should generate valid HMAC token', () => {
      const lockerId = 5;
      const deviceId = 'device123';

      const token = qrHandler.generateActionToken(lockerId, deviceId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate different tokens for different inputs', () => {
      const token1 = qrHandler.generateActionToken(1, 'device1');
      const token2 = qrHandler.generateActionToken(2, 'device2');

      expect(token1).not.toBe(token2);
    });
  });

  describe('validateActionToken', () => {
    it('should validate correct token within TTL', () => {
      const lockerId = 5;
      const deviceId = 'device123';

      const token = qrHandler.generateActionToken(lockerId, deviceId);
      const isValid = qrHandler.validateActionToken(token, lockerId, deviceId);

      expect(isValid).toBe(true);
    });

    it('should reject token with wrong parameters', () => {
      const token = qrHandler.generateActionToken(5, 'device123');
      const isValid = qrHandler.validateActionToken(token, 6, 'device123');

      expect(isValid).toBe(false);
    });

    it('should reject malformed token', () => {
      const isValid = qrHandler.validateActionToken('invalid-token', 5, 'device123');

      expect(isValid).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const lockerId = 5;
      const deviceId = 'device123';
      const ip = '192.168.1.100';

      // Mock rate limiting - allow request
      mockRateLimiter.checkQrRateLimits.mockResolvedValue({
        allowed: true,
        reason: null
      });

      // Mock database error
      mockDbManager.getLockerRepository().findByKioskAndId.mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await qrHandler.handleQrRequest(lockerId, deviceId, ip);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.message).toContain('Sistem hatası');
    });

    it('should handle state manager errors', async () => {
      const lockerId = 5;
      const deviceId = 'device123';
      const ip = '192.168.1.100';

      // Mock rate limiting - allow request
      mockRateLimiter.checkQrRateLimits.mockResolvedValue({
        allowed: true,
        reason: null
      });

      // Mock free locker
      const mockLocker = {
        id: lockerId,
        kiosk_id: 'kiosk1',
        status: 'Free',
        owner_type: null,
        owner_key: null,
        is_vip: false
      };
      mockDbManager.getLockerRepository().findByKioskAndId.mockResolvedValue(mockLocker);
      mockDbManager.getVipContractRepository().findActiveByLocker.mockResolvedValue(null);

      // Mock assignment failure
      mockLockerStateManager.assignLocker.mockResolvedValue(false);

      const result = await qrHandler.handleQrRequest(lockerId, deviceId, ip);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.message).toContain('Dolap atanamadı');
    });
  });
});
