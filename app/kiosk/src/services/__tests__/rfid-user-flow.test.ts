/**
 * Tests for RFID User Flow Service
 * Covers complete RFID user journeys and business logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RfidUserFlow, RfidUserFlowConfig } from '../rfid-user-flow';
import { LockerStateManager } from '../../../../../shared/services/locker-state-manager';
import { ModbusController } from '../../hardware/modbus-controller';
import { Locker, RfidScanEvent } from '../../../../../src/types/core-entities';
import { LockerAssignmentMode } from '../../../../../shared/types/system-config';

// Mock dependencies
vi.mock('../../../../../shared/services/locker-state-manager');
vi.mock('../../hardware/modbus-controller');

describe('RfidUserFlow', () => {
  let rfidUserFlow: RfidUserFlow;
  let mockLockerStateManager: vi.Mocked<LockerStateManager>;
  let mockModbusController: vi.Mocked<ModbusController>;
  let config: RfidUserFlowConfig;
  let mockConfigManager: { initialize: ReturnType<typeof vi.fn>; getKioskAssignmentMode: ReturnType<typeof vi.fn> };

  const mockKioskId = 'test-kiosk-001';
  const mockCardId = '1234567890abcdef';

  function createMockConfig(mode: LockerAssignmentMode = 'manual') {
    return {
      initialize: vi.fn().mockResolvedValue(undefined),
      getKioskAssignmentMode: vi.fn().mockReturnValue(mode)
    };
  }

  beforeEach(() => {
    config = {
      kiosk_id: mockKioskId,
      max_available_lockers_display: 10,
      opening_timeout_ms: 5000
    };

    mockLockerStateManager = {
      getAvailableLockers: vi.fn(),
      getOldestAvailableLocker: vi.fn(),
      checkExistingOwnership: vi.fn(),
      validateOwnership: vi.fn(),
      assignLocker: vi.fn(),
      confirmOwnership: vi.fn(),
      releaseLocker: vi.fn(),
      getKioskStats: vi.fn()
    } as any;

    mockModbusController = {
      openLocker: vi.fn()
    } as any;

    const mockLockerNamingService = {
      getDisplayName: vi.fn().mockImplementation((kioskId: string, lockerId: number) =>
        Promise.resolve(`Dolap ${lockerId}`)
      )
    } as any;

    mockConfigManager = createMockConfig();

    rfidUserFlow = new RfidUserFlow(
      config,
      mockLockerStateManager,
      mockModbusController,
      mockLockerNamingService,
      mockConfigManager as any
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Card Scanning - No Existing Locker', () => {
    it('should show available lockers when card has no existing assignment', async () => {
      const mockAvailableLockers: Locker[] = [
        {
          id: 1,
          kiosk_id: mockKioskId,
          status: 'Free',
          version: 1,
          is_vip: false,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 2,
          kiosk_id: mockKioskId,
          status: 'Free',
          version: 1,
          is_vip: false,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getAvailableLockers.mockResolvedValue(mockAvailableLockers);

      const scanEvent: RfidScanEvent = {
        card_id: mockCardId,
        scan_time: new Date(),
        reader_id: 'test-reader'
      };

      const result = await rfidUserFlow.handleCardScanned(scanEvent);

      expect(result.success).toBe(true);
      expect(result.action).toBe('show_lockers');
      expect(result.message).toBe('Dolap seçiniz');
      expect(result.available_lockers).toEqual(mockAvailableLockers);
      expect(mockLockerStateManager.checkExistingOwnership).toHaveBeenCalledWith(mockCardId, 'rfid');
      expect(mockLockerStateManager.getAvailableLockers).toHaveBeenCalledWith(mockKioskId);
      expect(mockConfigManager.getKioskAssignmentMode).toHaveBeenCalledWith(mockKioskId);
      expect(result.assignment_mode).toBe('manual');
      expect(result.auto_assigned).toBe(false);
    });

    it('should return error when no lockers are available', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getAvailableLockers.mockResolvedValue([]);

      const scanEvent: RfidScanEvent = {
        card_id: mockCardId,
        scan_time: new Date(),
        reader_id: 'test-reader'
      };

      const result = await rfidUserFlow.handleCardScanned(scanEvent);

      expect(result.success).toBe(false);
      expect(result.action).toBe('error');
      expect(result.message).toBe('Boş dolap yok. Lütfen bekleyin.');
      expect(result.error_code).toBe('NO_AVAILABLE_LOCKERS');
      expect(result.assignment_mode).toBe('manual');
    });

    it('should limit displayed lockers to configured maximum', async () => {
      const manyLockers: Locker[] = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        kiosk_id: mockKioskId,
        status: 'Free' as const,
        version: 1,
        is_vip: false,
        created_at: new Date(),
        updated_at: new Date()
      }));

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getAvailableLockers.mockResolvedValue(manyLockers);

      const scanEvent: RfidScanEvent = {
        card_id: mockCardId,
        scan_time: new Date(),
        reader_id: 'test-reader'
      };

      const result = await rfidUserFlow.handleCardScanned(scanEvent);

      expect(result.success).toBe(true);
      expect(result.available_lockers).toHaveLength(config.max_available_lockers_display);
      expect(result.assignment_mode).toBe('manual');
      expect(result.auto_assigned).toBe(false);
      expect(result.available_lockers![0].id).toBe(1);
      expect(result.available_lockers![9].id).toBe(10);
    });

    it('should emit show_available_lockers event', async () => {
      const mockAvailableLockers: Locker[] = [
        {
          id: 1,
          kiosk_id: mockKioskId,
          status: 'Free',
          version: 1,
          is_vip: false,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getAvailableLockers.mockResolvedValue(mockAvailableLockers);

      const eventPromise = new Promise((resolve) => {
        rfidUserFlow.on('show_available_lockers', resolve);
      });

      const scanEvent: RfidScanEvent = {
        card_id: mockCardId,
        scan_time: new Date(),
        reader_id: 'test-reader'
      };

      await rfidUserFlow.handleCardScanned(scanEvent);
      const eventData = await eventPromise;

      expect(eventData).toEqual({
        card_id: mockCardId,
        lockers: mockAvailableLockers,
        total_available: 1
      });
    });

    it('should automatically assign oldest locker when mode is automatic', async () => {
      mockConfigManager = createMockConfig('automatic');

      const mockLockerNamingService = {
        getDisplayName: vi.fn().mockResolvedValue('Dolap 3')
      } as any;

      rfidUserFlow = new RfidUserFlow(
        config,
        mockLockerStateManager,
        mockModbusController,
        mockLockerNamingService,
        mockConfigManager as any
      );

      const available: Locker[] = [
        { id: 2, kiosk_id: mockKioskId, status: 'Free', version: 1, is_vip: false, created_at: new Date(), updated_at: new Date() },
        { id: 3, kiosk_id: mockKioskId, status: 'Free', version: 1, is_vip: false, created_at: new Date(), updated_at: new Date() }
      ] as any;

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getAvailableLockers.mockResolvedValue(available);
      mockLockerStateManager.getOldestAvailableLocker.mockResolvedValue({ ...available[1] });
      mockLockerStateManager.assignLocker.mockResolvedValue(true);
      mockLockerStateManager.confirmOwnership.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(true);

      const scanEvent: RfidScanEvent = {
        card_id: mockCardId,
        scan_time: new Date(),
        reader_id: 'test-reader'
      };

      const result = await rfidUserFlow.handleCardScanned(scanEvent);

      expect(result.success).toBe(true);
      expect(result.action).toBe('open_locker');
      expect(result.opened_locker).toBe(3);
      expect(result.auto_assigned).toBe(true);
      expect(result.assignment_mode).toBe('automatic');
      expect(mockLockerStateManager.assignLocker).toHaveBeenCalledWith(mockKioskId, 3, 'rfid', mockCardId);
    });

    it('should fall back to manual selection when automatic assignment fails', async () => {
      mockConfigManager = createMockConfig('automatic');

      const mockLockerNamingService = {
        getDisplayName: vi.fn().mockResolvedValue('Dolap 4')
      } as any;

      rfidUserFlow = new RfidUserFlow(
        config,
        mockLockerStateManager,
        mockModbusController,
        mockLockerNamingService,
        mockConfigManager as any
      );

      const available: Locker[] = [
        { id: 4, kiosk_id: mockKioskId, status: 'Free', version: 1, is_vip: false, created_at: new Date(), updated_at: new Date() },
        { id: 5, kiosk_id: mockKioskId, status: 'Free', version: 1, is_vip: false, created_at: new Date(), updated_at: new Date() }
      ] as any;

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getAvailableLockers.mockResolvedValue(available);
      mockLockerStateManager.getOldestAvailableLocker.mockResolvedValue({ ...available[0] });
      mockLockerStateManager.assignLocker.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(false);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);
      mockLockerStateManager.getAvailableLockers.mockResolvedValue(available);

      const scanEvent: RfidScanEvent = {
        card_id: mockCardId,
        scan_time: new Date(),
        reader_id: 'test-reader'
      };

      const result = await rfidUserFlow.handleCardScanned(scanEvent);

      expect(result.success).toBe(true);
      expect(result.action).toBe('show_lockers');
      expect(result.auto_assigned).toBe(false);
      expect(result.assignment_mode).toBe('automatic');
      expect(result.fallback_reason).toBe('OPENING_FAILED');
      expect(result.available_lockers).toHaveLength(available.length);
    });
  });

  describe('Card Scanning - Existing Locker', () => {
    it('should open and release locker when card has existing assignment', async () => {
      const mockExistingLocker: Locker = {
        id: 5,
        kiosk_id: mockKioskId,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: mockCardId,
        version: 1,
        is_vip: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(mockExistingLocker);
      mockLockerStateManager.validateOwnership.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const scanEvent: RfidScanEvent = {
        card_id: mockCardId,
        scan_time: new Date(),
        reader_id: 'test-reader'
      };

      const result = await rfidUserFlow.handleCardScanned(scanEvent);

      expect(result.success).toBe(true);
      expect(result.action).toBe('open_locker');
      expect(result.message).toBe('Dolap 5 açıldı ve bırakıldı');
      expect(result.opened_locker).toBe(5);

      expect(mockLockerStateManager.validateOwnership).toHaveBeenCalledWith(
        mockKioskId, 5, mockCardId, 'rfid'
      );
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(5);
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith(
        mockKioskId, 5, mockCardId
      );
    });

    it('should handle opening failure gracefully', async () => {
      const mockExistingLocker: Locker = {
        id: 5,
        kiosk_id: mockKioskId,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: mockCardId,
        version: 1,
        is_vip: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(mockExistingLocker);
      mockLockerStateManager.validateOwnership.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(false);

      const scanEvent: RfidScanEvent = {
        card_id: mockCardId,
        scan_time: new Date(),
        reader_id: 'test-reader'
      };

      const result = await rfidUserFlow.handleCardScanned(scanEvent);

      expect(result.success).toBe(false);
      expect(result.action).toBe('error');
      expect(result.message).toBe('Dolap açılamadı. Personeli çağırın.');
      expect(result.error_code).toBe('OPENING_FAILED');

      // Should not attempt to release if opening failed
      expect(mockLockerStateManager.releaseLocker).not.toHaveBeenCalled();
    });

    it('should handle ownership validation failure', async () => {
      const mockExistingLocker: Locker = {
        id: 5,
        kiosk_id: mockKioskId,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: 'different-card',
        version: 1,
        is_vip: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(mockExistingLocker);
      mockLockerStateManager.validateOwnership.mockResolvedValue(false);

      const scanEvent: RfidScanEvent = {
        card_id: mockCardId,
        scan_time: new Date(),
        reader_id: 'test-reader'
      };

      const result = await rfidUserFlow.handleCardScanned(scanEvent);

      expect(result.success).toBe(false);
      expect(result.action).toBe('error');
      expect(result.message).toBe('Dolap erişim hatası.');
      expect(result.error_code).toBe('OWNERSHIP_VALIDATION_FAILED');

      expect(mockModbusController.openLocker).not.toHaveBeenCalled();
    });

    it('should emit appropriate events during open and release flow', async () => {
      const mockExistingLocker: Locker = {
        id: 5,
        kiosk_id: mockKioskId,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: mockCardId,
        version: 1,
        is_vip: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(mockExistingLocker);
      mockLockerStateManager.validateOwnership.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const openingEventPromise = new Promise((resolve) => {
        rfidUserFlow.on('locker_opening', resolve);
      });

      const releasedEventPromise = new Promise((resolve) => {
        rfidUserFlow.on('locker_opened_and_released', resolve);
      });

      const scanEvent: RfidScanEvent = {
        card_id: mockCardId,
        scan_time: new Date(),
        reader_id: 'test-reader'
      };

      await rfidUserFlow.handleCardScanned(scanEvent);

      const openingEvent = await openingEventPromise;
      const releasedEvent = await releasedEventPromise;

      expect(openingEvent).toEqual({
        card_id: mockCardId,
        locker_id: 5,
        message: 'Dolap 5 açılıyor'
      });

      expect(releasedEvent).toEqual({
        card_id: mockCardId,
        locker_id: 5,
        message: 'Dolap 5 açıldı ve bırakıldı'
      });
    });
  });

  describe('Locker Selection Flow', () => {
    it('should successfully assign and open selected locker', async () => {
      const selectedLockerId = 3;

      mockLockerStateManager.assignLocker.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.confirmOwnership.mockResolvedValue(true);

      const result = await rfidUserFlow.handleLockerSelection(mockCardId, selectedLockerId);

      expect(result.success).toBe(true);
      expect(result.action).toBe('open_locker');
      expect(result.message).toBe('Dolap 3 açıldı');
      expect(result.opened_locker).toBe(3);

      expect(mockLockerStateManager.assignLocker).toHaveBeenCalledWith(
        mockKioskId, selectedLockerId, 'rfid', mockCardId
      );
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(selectedLockerId);
      expect(mockLockerStateManager.confirmOwnership).toHaveBeenCalledWith(
        mockKioskId, selectedLockerId
      );
    });

    it('should handle assignment failure', async () => {
      const selectedLockerId = 3;

      mockLockerStateManager.assignLocker.mockResolvedValue(false);

      const result = await rfidUserFlow.handleLockerSelection(mockCardId, selectedLockerId);

      expect(result.success).toBe(false);
      expect(result.action).toBe('error');
      expect(result.message).toBe('Dolap atanamadı. Başka dolap seçin.');
      expect(result.error_code).toBe('ASSIGNMENT_FAILED');

      expect(mockModbusController.openLocker).not.toHaveBeenCalled();
    });

    it('should release reservation when opening fails', async () => {
      const selectedLockerId = 3;

      mockLockerStateManager.assignLocker.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(false);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const result = await rfidUserFlow.handleLockerSelection(mockCardId, selectedLockerId);

      expect(result.success).toBe(false);
      expect(result.action).toBe('error');
      expect(result.message).toBe('Dolap açılamadı. Başka dolap deneyin.');
      expect(result.error_code).toBe('OPENING_FAILED');

      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith(
        mockKioskId, selectedLockerId, mockCardId
      );
    });

    it('should emit appropriate events during selection flow', async () => {
      const selectedLockerId = 3;

      mockLockerStateManager.assignLocker.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.confirmOwnership.mockResolvedValue(true);

      const assignedEventPromise = new Promise((resolve) => {
        rfidUserFlow.on('locker_assigned', resolve);
      });

      const openingEventPromise = new Promise((resolve) => {
        rfidUserFlow.on('locker_opening', resolve);
      });

      const ownedEventPromise = new Promise((resolve) => {
        rfidUserFlow.on('locker_opened_and_owned', resolve);
      });

      await rfidUserFlow.handleLockerSelection(mockCardId, selectedLockerId);

      const assignedEvent = await assignedEventPromise;
      const openingEvent = await openingEventPromise;
      const ownedEvent = await ownedEventPromise;

      expect(assignedEvent).toEqual({
        card_id: mockCardId,
        locker_id: selectedLockerId,
        message: 'Dolap 3 atandı'
      });

      expect(openingEvent).toEqual({
        card_id: mockCardId,
        locker_id: selectedLockerId,
        message: 'Dolap 3 açılıyor'
      });

      expect(ownedEvent).toEqual({
        card_id: mockCardId,
        locker_id: selectedLockerId,
        message: 'Dolap 3 açıldı ve sahiplenildi'
      });
    });
  });

  describe('One Card One Locker Rule', () => {
    it('should enforce one card one locker rule correctly', async () => {
      const existingLocker: Locker = {
        id: 7,
        kiosk_id: mockKioskId,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: mockCardId,
        version: 1,
        is_vip: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      const result = await rfidUserFlow.checkExistingOwnership(mockCardId);
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(existingLocker);

      expect(mockLockerStateManager.checkExistingOwnership).toHaveBeenCalledWith(mockCardId, 'rfid');
    });

    it('should return null when card has no existing ownership', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);

      const result = await rfidUserFlow.checkExistingOwnership(mockCardId);

      expect(result).toBeNull();
    });
  });

  describe('Emergency Operations', () => {
    it('should handle emergency release successfully', async () => {
      const lockerId = 8;
      const staffUser = 'admin';
      const reason = 'User lost card';

      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const emergencyEventPromise = new Promise((resolve) => {
        rfidUserFlow.on('emergency_release', resolve);
      });

      const result = await rfidUserFlow.emergencyRelease(lockerId, staffUser, reason);

      expect(result).toBe(true);
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(lockerId);
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith(mockKioskId, lockerId);

      const emergencyEvent = await emergencyEventPromise;
      expect(emergencyEvent).toEqual({
        locker_id: lockerId,
        staff_user: staffUser,
        reason: reason,
        success: true
      });
    });

    it('should handle emergency release failure', async () => {
      const lockerId = 8;
      const staffUser = 'admin';
      const reason = 'Hardware issue';

      mockModbusController.openLocker.mockResolvedValue(false);

      const result = await rfidUserFlow.emergencyRelease(lockerId, staffUser, reason);

      expect(result).toBe(false);
      expect(mockLockerStateManager.releaseLocker).not.toHaveBeenCalled();
    });
  });

  describe('Utility Functions', () => {
    it('should validate card ID format correctly', () => {
      expect(rfidUserFlow.validateCardId('1234567890abcdef')).toBe(true);
      expect(rfidUserFlow.validateCardId('ABCDEF1234567890')).toBe(false); // uppercase
      expect(rfidUserFlow.validateCardId('123456789')).toBe(false); // too short
      expect(rfidUserFlow.validateCardId('1234567890abcdefg')).toBe(false); // too long
      expect(rfidUserFlow.validateCardId('123456789gabcdef')).toBe(false); // invalid char
    });

    it('should get kiosk statistics', async () => {
      const mockStats = {
        total: 30,
        free: 20,
        reserved: 2,
        owned: 5,
        blocked: 1,
        vip: 2
      };

      mockLockerStateManager.getKioskStats.mockResolvedValue(mockStats);

      const result = await rfidUserFlow.getKioskStats();

      expect(result).toEqual(mockStats);
      expect(mockLockerStateManager.getKioskStats).toHaveBeenCalledWith(mockKioskId);
    });

    it('should get and update configuration', () => {
      const currentConfig = rfidUserFlow.getConfig();
      expect(currentConfig).toEqual(config);

      const newConfig = { max_available_lockers_display: 15 };
      rfidUserFlow.updateConfig(newConfig);

      const updatedConfig = rfidUserFlow.getConfig();
      expect(updatedConfig.max_available_lockers_display).toBe(15);
      expect(updatedConfig.kiosk_id).toBe(mockKioskId); // Other values preserved
    });
  });

  describe('Error Handling', () => {
    it('should handle system errors gracefully', async () => {
      // Mock the checkExistingOwnership method directly on the rfidUserFlow instance
      vi.spyOn(rfidUserFlow, 'checkExistingOwnership').mockRejectedValue(new Error('Database error'));

      const scanEvent: RfidScanEvent = {
        card_id: mockCardId,
        scan_time: new Date(),
        reader_id: 'test-reader'
      };

      const result = await rfidUserFlow.handleCardScanned(scanEvent);

      expect(result.success).toBe(false);
      expect(result.action).toBe('error');
      expect(result.message).toBe('Sistem hatası. Personeli çağırın.');
      expect(result.error_code).toBe('SYSTEM_ERROR');
    });

    it('should handle locker list retrieval errors', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getAvailableLockers.mockRejectedValue(new Error('Database error'));

      const scanEvent: RfidScanEvent = {
        card_id: mockCardId,
        scan_time: new Date(),
        reader_id: 'test-reader'
      };

      const result = await rfidUserFlow.handleCardScanned(scanEvent);

      expect(result.success).toBe(false);
      expect(result.action).toBe('error');
      expect(result.error_code).toBe('LOCKER_LIST_ERROR');
    });
  });
});
