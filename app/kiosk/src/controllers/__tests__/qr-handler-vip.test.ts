/**
 * VIP Locker Handling Tests for QR Handler
 * Tests that VIP lockers are properly handled in QR operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QrHandler } from '../qr-handler.js';
import { LockerStateManager } from '../../../../../shared/services/locker-state-manager.js';
import { ModbusController } from '../../hardware/modbus-controller.js';

// Mock dependencies
vi.mock('../../../../../shared/services/locker-state-manager.js');
vi.mock('../../hardware/modbus-controller.js');
vi.mock('../../services/rate-limiter.js');

describe('QR Handler VIP Locker Handling', () => {
  let qrHandler: QrHandler;
  let mockLockerStateManager: vi.Mocked<LockerStateManager>;
  let mockModbusController: vi.Mocked<ModbusController>;

  beforeEach(() => {
    mockLockerStateManager = vi.mocked(new LockerStateManager());
    mockModbusController = vi.mocked(new ModbusController());
    
    qrHandler = new QrHandler(mockLockerStateManager, mockModbusController);
  });

  describe('QR GET Request VIP Handling', () => {
    it('should return 423 status for VIP locker access', async () => {
      const vipLocker = {
        kiosk_id: 'test-kiosk',
        id: 5,
        status: 'Free',
        is_vip: true,
        version: 1
      };

      mockLockerStateManager.getLocker.mockResolvedValue(vipLocker as any);

      const mockRequest = {
        headers: {},
        ip: '192.168.1.100'
      } as any;

      const mockReply = {
        code: vi.fn().mockReturnThis(),
        type: vi.fn().mockReturnThis(),
        send: vi.fn(),
        header: vi.fn().mockReturnThis()
      } as any;

      await qrHandler.handleQrGet('test-kiosk', 5, mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(423);
      expect(mockReply.type).toHaveBeenCalledWith('text/html');
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.stringContaining('VIP dolap. QR kapalı')
      );
    });

    it('should allow normal QR access for non-VIP lockers', async () => {
      const regularLocker = {
        kiosk_id: 'test-kiosk',
        id: 3,
        status: 'Free',
        is_vip: false,
        version: 1
      };

      mockLockerStateManager.getLocker.mockResolvedValue(regularLocker as any);

      const mockRequest = {
        headers: {},
        ip: '192.168.1.100'
      } as any;

      const mockReply = {
        code: vi.fn().mockReturnThis(),
        type: vi.fn().mockReturnThis(),
        send: vi.fn(),
        header: vi.fn().mockReturnThis()
      } as any;

      await qrHandler.handleQrGet('test-kiosk', 3, mockRequest, mockReply);

      expect(mockReply.type).toHaveBeenCalledWith('text/html');
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.stringContaining('Dolapı açmak için butona basın')
      );
    });
  });

  describe('QR Action VIP Handling', () => {
    it('should return 423 status for VIP locker action', async () => {
      const vipLocker = {
        kiosk_id: 'test-kiosk',
        id: 7,
        status: 'Owned',
        owner_type: 'device',
        owner_key: 'device-123',
        is_vip: true,
        version: 1
      };

      mockLockerStateManager.getLocker.mockResolvedValue(vipLocker as any);

      // Mock rate limiter and validation
      const mockRateLimiter = {
        checkRateLimit: vi.fn().mockResolvedValue({ allowed: true })
      };
      (qrHandler as any).rateLimiter = mockRateLimiter;

      const mockRequest = {
        body: {
          token: 'valid-token'
        },
        headers: {
          origin: 'http://localhost:3001'
        },
        ip: '192.168.1.100'
      } as any;

      const mockReply = {
        code: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis()
      } as any;

      // Mock token validation
      (qrHandler as any).validateActionToken = vi.fn().mockReturnValue({
        locker_id: 7,
        device_id: 'device-123',
        action: 'release'
      });

      // Mock origin validation
      (qrHandler as any).validateOriginReferer = vi.fn().mockReturnValue(true);

      const result = await qrHandler.handleQrAction('test-kiosk', mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(423);
      expect(result.success).toBe(false);
      expect(result.action).toBe('vip_blocked');
      expect(result.message).toBe('VIP dolap. QR kapalı');
    });

    it('should handle VIP locker release without actually releasing', async () => {
      const vipLocker = {
        kiosk_id: 'test-kiosk',
        id: 8,
        status: 'Owned',
        owner_type: 'device',
        owner_key: 'device-456',
        is_vip: true,
        version: 1
      };

      // We need to test the private handleReleaseAction method
      // by accessing it through the public handleQrAction method
      mockLockerStateManager.getLocker.mockResolvedValue(vipLocker as any);
      mockModbusController.openLocker.mockResolvedValue(true);

      // Mock rate limiter
      const mockRateLimiter = {
        checkRateLimit: vi.fn().mockResolvedValue({ allowed: true })
      };
      (qrHandler as any).rateLimiter = mockRateLimiter;

      // Mock token validation to return release action
      (qrHandler as any).validateActionToken = vi.fn().mockReturnValue({
        locker_id: 8,
        device_id: 'device-456',
        action: 'release'
      });

      // Mock origin validation
      (qrHandler as any).validateOriginReferer = vi.fn().mockReturnValue(true);

      // Test the private method directly
      const result = await (qrHandler as any).handleReleaseAction(
        'test-kiosk',
        8,
        'device-456',
        vipLocker
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('release');
      expect(result.message).toBe('VIP Dolap 8 açıldı');
      expect(result.locker_id).toBe(8);

      // Verify locker was opened but NOT released
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(8);
      expect(mockLockerStateManager.releaseLocker).not.toHaveBeenCalled();
    });

    it('should handle non-VIP locker release normally', async () => {
      const regularLocker = {
        kiosk_id: 'test-kiosk',
        id: 4,
        status: 'Owned',
        owner_type: 'device',
        owner_key: 'device-789',
        is_vip: false,
        version: 1
      };

      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      // Test the private method directly
      const result = await (qrHandler as any).handleReleaseAction(
        'test-kiosk',
        4,
        'device-789',
        regularLocker
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('release');
      expect(result.message).toBe('Dolap 4 açıldı ve bırakıldı');
      expect(result.locker_id).toBe(4);

      // Verify locker was opened AND released
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(4);
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith(
        'test-kiosk',
        4,
        'device-789'
      );
    });

    it('should handle VIP locker assignment prevention', async () => {
      const vipLocker = {
        kiosk_id: 'test-kiosk',
        id: 9,
        status: 'Free',
        is_vip: true,
        version: 1
      };

      mockLockerStateManager.getLocker.mockResolvedValue(vipLocker as any);

      // Mock rate limiter
      const mockRateLimiter = {
        checkRateLimit: vi.fn().mockResolvedValue({ allowed: true })
      };
      (qrHandler as any).rateLimiter = mockRateLimiter;

      // Mock token validation to return assign action
      (qrHandler as any).validateActionToken = vi.fn().mockReturnValue({
        locker_id: 9,
        device_id: 'device-new',
        action: 'assign'
      });

      // Mock origin validation
      (qrHandler as any).validateOriginReferer = vi.fn().mockReturnValue(true);

      const mockRequest = {
        body: {
          token: 'valid-token'
        },
        headers: {
          origin: 'http://localhost:3001'
        },
        ip: '192.168.1.100'
      } as any;

      const mockReply = {
        code: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis()
      } as any;

      const result = await qrHandler.handleQrAction('test-kiosk', mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(423);
      expect(result.success).toBe(false);
      expect(result.action).toBe('vip_blocked');
      expect(result.message).toBe('VIP dolap. QR kapalı');

      // Verify no assignment was attempted
      expect(mockLockerStateManager.assignLocker).not.toHaveBeenCalled();
    });
  });
});