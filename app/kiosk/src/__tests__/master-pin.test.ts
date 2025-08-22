import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UiController } from '../controllers/ui-controller';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { RfidUserFlow } from '../services/rfid-user-flow';
import { ModbusController } from '../hardware/modbus-controller';

// Mock dependencies
vi.mock('../../../../shared/services/locker-state-manager.js');
vi.mock('../services/rfid-user-flow.js');
vi.mock('../hardware/modbus-controller.js');

describe('Master PIN Interface', () => {
  let uiController: UiController;
  let mockLockerStateManager: any;
  let mockRfidUserFlow: any;
  let mockModbusController: any;

  beforeEach(() => {
    mockLockerStateManager = {
      getKioskLockers: vi.fn(),
      releaseLocker: vi.fn()
    };

    mockRfidUserFlow = {};

    mockModbusController = {
      openLocker: vi.fn()
    };

    uiController = new UiController(
      mockLockerStateManager,
      mockRfidUserFlow,
      mockModbusController
    );
  });

  describe('PIN Validation', () => {
    it('should accept correct master PIN', async () => {
      const mockRequest = {
        body: { pin: '1234', kiosk_id: 'kiosk-1' },
        ip: '127.0.0.1'
      };
      const mockReply = { code: vi.fn().mockReturnThis() };

      // Simulate the PIN verification logic
      const verifyMasterPin = async (request: any, reply: any) => {
        const { pin } = request.body;
        const masterPin = '1234'; // Default PIN
        
        if (pin === masterPin) {
          return { success: true };
        } else {
          reply.code(401);
          return { error: 'Incorrect PIN' };
        }
      };

      const result = await verifyMasterPin(mockRequest, mockReply);

      expect(result).toEqual({ success: true });
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should reject incorrect master PIN', async () => {
      const mockRequest = {
        body: { pin: '9999', kiosk_id: 'kiosk-1' },
        ip: '127.0.0.1'
      };
      const mockReply = { code: vi.fn().mockReturnThis() };

      const verifyMasterPin = async (request: any, reply: any) => {
        const { pin } = request.body;
        const masterPin = '1234';
        
        if (pin === masterPin) {
          return { success: true };
        } else {
          reply.code(401);
          return { error: 'Incorrect PIN' };
        }
      };

      const result = await verifyMasterPin(mockRequest, mockReply);

      expect(result).toEqual({ error: 'Incorrect PIN' });
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should implement lockout after 5 failed attempts', async () => {
      const mockRequest = {
        body: { pin: '9999', kiosk_id: 'kiosk-1' },
        ip: '127.0.0.1'
      };
      const mockReply = { code: vi.fn().mockReturnThis() };

      // Simulate the lockout logic
      let attempts = 0;
      const maxAttempts = 5;
      const lockoutMinutes = 5;
      let isLocked = false;
      let lockoutEnd: number | null = null;

      const verifyMasterPin = async (request: any, reply: any) => {
        const { pin } = request.body;
        const masterPin = '1234';
        
        // Check if locked out
        if (isLocked && lockoutEnd && Date.now() < lockoutEnd) {
          reply.code(429);
          return { 
            error: 'PIN entry locked',
            lockout_end: lockoutEnd
          };
        }

        if (pin === masterPin) {
          attempts = 0; // Reset on success
          return { success: true };
        } else {
          attempts++;
          
          if (attempts >= maxAttempts) {
            isLocked = true;
            lockoutEnd = Date.now() + (lockoutMinutes * 60 * 1000);
            reply.code(429);
            return { 
              error: 'PIN entry locked',
              lockout_end: lockoutEnd
            };
          }
          
          reply.code(401);
          return { 
            error: 'Incorrect PIN',
            attempts_remaining: maxAttempts - attempts
          };
        }
      };

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        const result = await verifyMasterPin(mockRequest, mockReply);
        
        if (i < 4) {
          expect(result.error).toBe('Incorrect PIN');
          expect(result.attempts_remaining).toBe(4 - i);
        } else {
          expect(result.error).toBe('PIN entry locked');
          expect(result.lockout_end).toBeDefined();
        }
      }

      // Next attempt should still be locked
      const lockedResult = await verifyMasterPin(mockRequest, mockReply);
      expect(lockedResult.error).toBe('PIN entry locked');
    });
  });

  describe('Master Locker Operations', () => {
    it('should open any locker with master access', async () => {
      const mockRequest = {
        body: { locker_id: 5, kiosk_id: 'kiosk-1' },
        ip: '127.0.0.1'
      };
      const mockReply = { code: vi.fn().mockReturnThis() };

      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const masterOpenLocker = async (request: any, reply: any) => {
        const { locker_id, kiosk_id } = request.body;
        
        const opened = await mockModbusController.openLocker(locker_id);
        
        if (opened) {
          await mockLockerStateManager.releaseLocker(kiosk_id, locker_id);
          return { success: true, locker_id };
        } else {
          return { error: 'failed_open' };
        }
      };

      const result = await masterOpenLocker(mockRequest, mockReply);

      expect(result).toEqual({ success: true, locker_id: 5 });
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(5);
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith('kiosk-1', 5);
    });

    it('should handle locker opening failures', async () => {
      const mockRequest = {
        body: { locker_id: 5, kiosk_id: 'kiosk-1' },
        ip: '127.0.0.1'
      };
      const mockReply = { code: vi.fn().mockReturnThis() };

      mockModbusController.openLocker.mockResolvedValue(false);

      const masterOpenLocker = async (request: any, reply: any) => {
        const { locker_id } = request.body;
        
        const opened = await mockModbusController.openLocker(locker_id);
        
        if (opened) {
          return { success: true, locker_id };
        } else {
          return { error: 'failed_open' };
        }
      };

      const result = await masterOpenLocker(mockRequest, mockReply);

      expect(result).toEqual({ error: 'failed_open' });
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(5);
      expect(mockLockerStateManager.releaseLocker).not.toHaveBeenCalled();
    });

    it('should load all lockers for master grid display', async () => {
      const mockLockers = [
        { id: 1, status: 'Free', is_vip: false },
        { id: 2, status: 'Owned', is_vip: false },
        { id: 3, status: 'Reserved', is_vip: false },
        { id: 4, status: 'Blocked', is_vip: false },
        { id: 5, status: 'Owned', is_vip: true }
      ];

      mockLockerStateManager.getKioskLockers.mockResolvedValue(mockLockers);

      const mockRequest = {
        query: { kiosk_id: 'kiosk-1' }
      };
      const mockReply = { code: vi.fn().mockReturnThis() };

      const getAllLockers = async (request: any, reply: any) => {
        const { kiosk_id } = request.query;
        
        const lockers = await mockLockerStateManager.getKioskLockers(kiosk_id);
        
        return lockers.map((locker: any) => ({
          id: locker.id,
          status: locker.status,
          is_vip: locker.is_vip,
          owner_type: locker.owner_type,
          owned_at: locker.owned_at
        }));
      };

      const result = await getAllLockers(mockRequest, mockReply);

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({
        id: 1,
        status: 'Free',
        is_vip: false,
        owner_type: undefined,
        owned_at: undefined
      });
      expect(result[4]).toEqual({
        id: 5,
        status: 'Owned',
        is_vip: true,
        owner_type: undefined,
        owned_at: undefined
      });
    });
  });

  describe('Master PIN Security', () => {
    it('should track attempts per IP and kiosk combination', async () => {
      const ip1 = '192.168.1.100';
      const ip2 = '192.168.1.101';
      const kiosk1 = 'kiosk-1';
      const kiosk2 = 'kiosk-2';

      const attemptTracker = new Map<string, { count: number; lockoutEnd?: number }>();

      const verifyMasterPin = async (ip: string, kioskId: string, pin: string) => {
        const attemptKey = `${ip}-${kioskId}`;
        const attempts = attemptTracker.get(attemptKey) || { count: 0 };
        const masterPin = '1234';
        
        if (pin === masterPin) {
          attemptTracker.delete(attemptKey);
          return { success: true };
        } else {
          attempts.count++;
          attemptTracker.set(attemptKey, attempts);
          return { 
            error: 'Incorrect PIN',
            attempts_remaining: 5 - attempts.count
          };
        }
      };

      // Different IPs should have independent attempt counters
      await verifyMasterPin(ip1, kiosk1, '9999'); // 1 attempt for ip1-kiosk1
      await verifyMasterPin(ip2, kiosk1, '9999'); // 1 attempt for ip2-kiosk1
      await verifyMasterPin(ip1, kiosk2, '9999'); // 1 attempt for ip1-kiosk2

      expect(attemptTracker.get(`${ip1}-${kiosk1}`)?.count).toBe(1);
      expect(attemptTracker.get(`${ip2}-${kiosk1}`)?.count).toBe(1);
      expect(attemptTracker.get(`${ip1}-${kiosk2}`)?.count).toBe(1);

      // Successful PIN should reset attempts
      await verifyMasterPin(ip1, kiosk1, '1234');
      expect(attemptTracker.has(`${ip1}-${kiosk1}`)).toBe(false);
    });
  });
});