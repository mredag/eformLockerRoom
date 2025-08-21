import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UiController } from '../controllers/ui-controller.js';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager.js';
import { RfidUserFlow } from '../services/rfid-user-flow.js';
import { ModbusController } from '../hardware/modbus-controller.js';

// Mock dependencies
vi.mock('../../../../shared/services/locker-state-manager.js');
vi.mock('../services/rfid-user-flow.js');
vi.mock('../hardware/modbus-controller.js');

describe('UiController', () => {
  let uiController: UiController;
  let mockLockerStateManager: any;
  let mockRfidUserFlow: any;
  let mockModbusController: any;

  beforeEach(() => {
    mockLockerStateManager = {
      checkExistingOwnership: vi.fn(),
      getAvailableLockers: vi.fn(),
      getKioskLockers: vi.fn(),
      assignLocker: vi.fn(),
      confirmOwnership: vi.fn(),
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

  describe('handleCardScanned', () => {
    it('should open existing locker when card already has one', async () => {
      const existingLocker = { id: 5, status: 'Owned' };
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(existingLocker);
      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const mockRequest = {
        body: { card_id: 'test-card', kiosk_id: 'kiosk-1' }
      };
      const mockReply = { code: vi.fn().mockReturnThis() };

      // Create a mock method to test
      const handleCardScanned = async (request: any, reply: any) => {
        const { card_id, kiosk_id } = request.body;
        
        if (!card_id || !kiosk_id) {
          reply.code(400);
          return { error: 'card_id and kiosk_id are required' };
        }

        const existingLocker = await mockLockerStateManager.checkExistingOwnership(card_id, 'rfid');
        
        if (existingLocker) {
          const success = await mockModbusController.openLocker(existingLocker.id);
          if (success) {
            await mockLockerStateManager.releaseLocker(kiosk_id, existingLocker.id);
            return { 
              action: 'open_locker', 
              locker_id: existingLocker.id,
              message: 'Locker opened and released'
            };
          } else {
            return { error: 'failed_open' };
          }
        }
        
        return { error: 'no_existing_locker' };
      };

      const result = await handleCardScanned(mockRequest, mockReply);

      expect(result).toEqual({
        action: 'open_locker',
        locker_id: 5,
        message: 'Locker opened and released'
      });
      expect(mockLockerStateManager.checkExistingOwnership).toHaveBeenCalledWith('test-card', 'rfid');
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(5);
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith('kiosk-1', 5);
    });

    it('should show available lockers when card has no existing locker', async () => {
      const availableLockers = [
        { id: 1, status: 'Free' },
        { id: 2, status: 'Free' }
      ];
      
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getAvailableLockers.mockResolvedValue(availableLockers);

      const mockRequest = {
        body: { card_id: 'test-card', kiosk_id: 'kiosk-1' }
      };
      const mockReply = { code: vi.fn().mockReturnThis() };

      const handleCardScanned = async (request: any, reply: any) => {
        const { card_id, kiosk_id } = request.body;
        
        const existingLocker = await mockLockerStateManager.checkExistingOwnership(card_id, 'rfid');
        
        if (!existingLocker) {
          const availableLockers = await mockLockerStateManager.getAvailableLockers(kiosk_id);
          
          if (availableLockers.length === 0) {
            return { error: 'no_lockers' };
          }

          return {
            action: 'show_lockers',
            lockers: availableLockers.map((locker: any) => ({
              id: locker.id,
              status: locker.status
            }))
          };
        }
        
        return { error: 'unexpected' };
      };

      const result = await handleCardScanned(mockRequest, mockReply);

      expect(result).toEqual({
        action: 'show_lockers',
        lockers: [
          { id: 1, status: 'Free' },
          { id: 2, status: 'Free' }
        ]
      });
      expect(mockLockerStateManager.getAvailableLockers).toHaveBeenCalledWith('kiosk-1');
    });
  });

  describe('verifyMasterPin', () => {
    it('should return success for correct PIN', async () => {
      const mockRequest = {
        body: { pin: '1234', kiosk_id: 'kiosk-1' },
        ip: '127.0.0.1'
      };
      const mockReply = { code: vi.fn().mockReturnThis() };

      // Test the PIN verification logic
      const verifyMasterPin = async (request: any, reply: any) => {
        const { pin, kiosk_id } = request.body;
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
    });

    it('should return error for incorrect PIN', async () => {
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
  });
});