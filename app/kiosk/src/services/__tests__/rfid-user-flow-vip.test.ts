/**
 * VIP Locker Handling Tests for RFID User Flow
 * Tests that VIP lockers remain Owned after opening and don't get released
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RfidUserFlow } from '../rfid-user-flow';
import { LockerStateManager } from '../../../../../shared/services/locker-state-manager';
import { ModbusController } from '../../hardware/modbus-controller';
import { Locker } from '../../../../../src/types/core-entities';

// Mock dependencies
vi.mock('../../../../../shared/services/locker-state-manager.js');
vi.mock('../../hardware/modbus-controller.js');

describe('RfidUserFlow VIP Locker Handling', () => {
  let rfidUserFlow: RfidUserFlow;
  let mockLockerStateManager: vi.Mocked<LockerStateManager>;
  let mockModbusController: vi.Mocked<ModbusController>;

  const config = {
    kiosk_id: 'test-kiosk',
    max_available_lockers_display: 10,
    opening_timeout_ms: 5000
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLockerStateManager = vi.mocked(new LockerStateManager());
    mockModbusController = vi.mocked(new ModbusController());
    
    rfidUserFlow = new RfidUserFlow(
      config,
      mockLockerStateManager,
      mockModbusController
    );
  });

  describe('VIP Locker Opening', () => {
    it('should open VIP locker without releasing ownership', async () => {
      const cardId = 'test-card-123';
      const vipLocker: Locker = {
        kiosk_id: 'test-kiosk',
        id: 5,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: cardId,
        is_vip: true,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reserved_at: null,
        owned_at: new Date().toISOString()
      };

      // Mock validation and opening
      mockLockerStateManager.validateOwnership.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(true);

      const result = await rfidUserFlow.handleCardWithLocker(cardId, vipLocker);

      expect(result.success).toBe(true);
      expect(result.action).toBe('open_locker');
      expect(result.message).toContain('VIP Dolap 5 açıldı');
      expect(result.opened_locker).toBe(5);

      // Verify that releaseLocker was NOT called for VIP locker
      expect(mockLockerStateManager.releaseLocker).not.toHaveBeenCalled();
      
      // Verify that the locker was opened
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(5);
    });

    it('should open and release non-VIP locker normally', async () => {
      const cardId = 'test-card-123';
      const regularLocker: Locker = {
        kiosk_id: 'test-kiosk',
        id: 3,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: cardId,
        is_vip: false,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reserved_at: null,
        owned_at: new Date().toISOString()
      };

      // Mock validation, opening, and release
      mockLockerStateManager.validateOwnership.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const result = await rfidUserFlow.handleCardWithLocker(cardId, regularLocker);

      expect(result.success).toBe(true);
      expect(result.action).toBe('open_locker');
      expect(result.message).toContain('açıldı ve bırakıldı');
      expect(result.opened_locker).toBe(3);

      // Verify that releaseLocker WAS called for regular locker
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith(
        'test-kiosk',
        3,
        cardId
      );
      
      // Verify that the locker was opened
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(3);
    });

    it('should handle VIP locker opening failure correctly', async () => {
      const cardId = 'test-card-123';
      const vipLocker: Locker = {
        kiosk_id: 'test-kiosk',
        id: 7,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: cardId,
        is_vip: true,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reserved_at: null,
        owned_at: new Date().toISOString()
      };

      // Mock validation success but opening failure
      mockLockerStateManager.validateOwnership.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(false);

      const result = await rfidUserFlow.handleCardWithLocker(cardId, vipLocker);

      expect(result.success).toBe(false);
      expect(result.action).toBe('error');
      expect(result.error_code).toBe('OPENING_FAILED');

      // Verify that releaseLocker was NOT called when opening failed
      expect(mockLockerStateManager.releaseLocker).not.toHaveBeenCalled();
    });

    it('should emit correct events for VIP locker opening', async () => {
      const cardId = 'test-card-123';
      const vipLocker: Locker = {
        kiosk_id: 'test-kiosk',
        id: 8,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: cardId,
        is_vip: true,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reserved_at: null,
        owned_at: new Date().toISOString()
      };

      // Mock validation and opening
      mockLockerStateManager.validateOwnership.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(true);

      // Set up event listeners
      const openingEvents: any[] = [];
      const vipEvents: any[] = [];
      
      rfidUserFlow.on('locker_opening', (event) => openingEvents.push(event));
      rfidUserFlow.on('locker_opened_vip', (event) => vipEvents.push(event));

      await rfidUserFlow.handleCardWithLocker(cardId, vipLocker);

      // Verify opening event was emitted
      expect(openingEvents).toHaveLength(1);
      expect(openingEvents[0]).toEqual({
        card_id: cardId,
        locker_id: 8,
        message: 'Dolap 8 açılıyor'
      });

      // Verify VIP-specific event was emitted
      expect(vipEvents).toHaveLength(1);
      expect(vipEvents[0]).toEqual({
        card_id: cardId,
        locker_id: 8,
        message: 'VIP Dolap 8 açıldı'
      });
    });
  });

  describe('VIP Locker Assignment Prevention', () => {
    it('should exclude VIP lockers from available locker list', async () => {
      const availableLockers: Locker[] = [
        {
          kiosk_id: 'test-kiosk',
          id: 1,
          status: 'Free',
          owner_type: null,
          owner_key: null,
          is_vip: false,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          reserved_at: null,
          owned_at: null
        },
        {
          kiosk_id: 'test-kiosk',
          id: 2,
          status: 'Free',
          owner_type: null,
          owner_key: null,
          is_vip: false,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          reserved_at: null,
          owned_at: null
        }
      ];

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getAvailableLockers.mockResolvedValue(availableLockers);

      const result = await rfidUserFlow.handleCardWithNoLocker('test-card-456');

      expect(result.success).toBe(true);
      expect(result.action).toBe('show_lockers');
      expect(result.available_lockers).toHaveLength(2);
      
      // Verify getAvailableLockers was called (which should exclude VIP lockers)
      expect(mockLockerStateManager.getAvailableLockers).toHaveBeenCalledWith('test-kiosk');
    });
  });
});
