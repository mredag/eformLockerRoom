/**
 * Integration Tests for RFID System
 * Tests the complete RFID user journey from card scan to locker operation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { RfidHandler, RfidConfig } from '../hardware/rfid-handler';
import { RfidUserFlow, RfidUserFlowConfig } from '../services/rfid-user-flow';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { ModbusController } from '../hardware/modbus-controller';
import { Locker, RfidScanEvent } from '../../../../src/types/core-entities';
import { LockerAssignmentMode } from '../../../../shared/types/system-config';

// Mock dependencies
vi.mock('../../../../shared/services/locker-state-manager');
vi.mock('../hardware/modbus-controller');
vi.mock('node-hid', () => ({
  default: {
    HID: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn()
    })),
    devices: vi.fn(() => [{
      vendorId: 0x08ff,
      productId: 0x0009,
      path: '/dev/hidraw0'
    }])
  }
}));

describe('RFID Integration Tests', () => {
  let rfidHandler: RfidHandler;
  let rfidUserFlow: RfidUserFlow;
  let mockLockerStateManager: vi.Mocked<LockerStateManager>;
  let mockModbusController: vi.Mocked<ModbusController>;
  let mockConfigManager: { initialize: ReturnType<typeof vi.fn>; getKioskAssignmentMode: ReturnType<typeof vi.fn> };

  const mockKioskId = 'integration-test-kiosk';

  beforeEach(async () => {
    // Setup mocks
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

    // Setup RFID handler
    const rfidConfig: RfidConfig = {
      reader_type: 'hid',
      debounce_ms: 100,
      vendor_id: 0x08ff,
      product_id: 0x0009
    };

    rfidHandler = new RfidHandler(rfidConfig);

    // Setup user flow
    const userFlowConfig: RfidUserFlowConfig = {
      kiosk_id: mockKioskId,
      max_available_lockers_display: 10,
      opening_timeout_ms: 5000
    };

    const mockLockerNamingService = {
      getDisplayName: vi.fn().mockImplementation((kioskId: string, lockerId: number) =>
        Promise.resolve(`Dolap ${lockerId}`)
      )
    } as any;

    mockConfigManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getKioskAssignmentMode: vi.fn().mockReturnValue('manual' as LockerAssignmentMode)
    };

    rfidUserFlow = new RfidUserFlow(
      userFlowConfig,
      mockLockerStateManager,
      mockModbusController,
      mockLockerNamingService,
      mockConfigManager as any
    );

    // Initialize RFID handler
    await rfidHandler.initialize();
  });

  afterEach(async () => {
    await rfidHandler.disconnect();
    vi.clearAllMocks();
  });

  describe('Complete User Journeys', () => {
    it('should handle complete new user journey: scan -> select -> open', async () => {
      // Setup: Available lockers
      const availableLockers: Locker[] = [
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
      mockLockerStateManager.getAvailableLockers.mockResolvedValue(availableLockers);
      mockLockerStateManager.assignLocker.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.confirmOwnership.mockResolvedValue(true);

      // Step 1: Simulate card scan
      const cardScanPromise = new Promise<RfidScanEvent>((resolve) => {
        rfidHandler.on('card_scanned', resolve);
      });

      // Simulate HID data (card scan)
      const mockHidDevice = (rfidHandler as any).device;
      const dataHandler = mockHidDevice.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      dataHandler(Buffer.from([0x12, 0x34, 0x56, 0x78]));

      const scanEvent = await cardScanPromise;
      expect(scanEvent.card_id).toBeDefined();

      // Step 2: Handle card scan - should show available lockers
      const scanResult = await rfidUserFlow.handleCardScanned(scanEvent);
      
      expect(scanResult.success).toBe(true);
      expect(scanResult.action).toBe('show_lockers');
      expect(scanResult.available_lockers).toEqual(availableLockers);

      // Step 3: User selects locker 1
      const selectionResult = await rfidUserFlow.handleLockerSelection(scanEvent.card_id, 1);

      expect(selectionResult.success).toBe(true);
      expect(selectionResult.action).toBe('open_locker');
      expect(selectionResult.opened_locker).toBe(1);

      // Verify the complete flow
      expect(mockLockerStateManager.checkExistingOwnership).toHaveBeenCalledWith(scanEvent.card_id, 'rfid');
      expect(mockLockerStateManager.getAvailableLockers).toHaveBeenCalledWith(mockKioskId);
      expect(mockLockerStateManager.assignLocker).toHaveBeenCalledWith(mockKioskId, 1, 'rfid', scanEvent.card_id);
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(1);
      expect(mockLockerStateManager.confirmOwnership).toHaveBeenCalledWith(mockKioskId, 1);
    });

    it('should handle complete returning user journey: scan -> immediate open and release', async () => {
      // Setup: User has existing locker
      const existingLocker: Locker = {
        id: 5,
        kiosk_id: mockKioskId,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: 'existing-card-hash',
        version: 1,
        is_vip: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(existingLocker);
      mockLockerStateManager.validateOwnership.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      // Step 1: Simulate card scan
      const cardScanPromise = new Promise<RfidScanEvent>((resolve) => {
        rfidHandler.on('card_scanned', resolve);
      });

      const mockHidDevice = (rfidHandler as any).device;
      const dataHandler = mockHidDevice.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      dataHandler(Buffer.from([0xAB, 0xCD, 0xEF, 0x12]));

      const scanEvent = await cardScanPromise;

      // Step 2: Handle card scan - should immediately open and release
      const scanResult = await rfidUserFlow.handleCardScanned(scanEvent);

      expect(scanResult.success).toBe(true);
      expect(scanResult.action).toBe('open_locker');
      expect(scanResult.opened_locker).toBe(5);
      expect(scanResult.message).toBe('Dolap 5 açıldı ve bırakıldı');

      // Verify the complete flow
      expect(mockLockerStateManager.checkExistingOwnership).toHaveBeenCalledWith(scanEvent.card_id, 'rfid');
      expect(mockLockerStateManager.validateOwnership).toHaveBeenCalledWith(mockKioskId, 5, scanEvent.card_id, 'rfid');
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(5);
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith(mockKioskId, 5, scanEvent.card_id);
    });

    it('should handle card ID consistency across scans', async () => {
      // Same physical card should produce same hash
      const cardData = Buffer.from([0x12, 0x34, 0x56, 0x78]);
      
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getAvailableLockers.mockResolvedValue([]);

      const scanEvents: RfidScanEvent[] = [];
      
      rfidHandler.on('card_scanned', (event) => {
        scanEvents.push(event);
      });

      const mockHidDevice = (rfidHandler as any).device;
      const dataHandler = mockHidDevice.on.mock.calls.find((call: any) => call[0] === 'data')[1];

      // Scan same card multiple times (with debounce gaps)
      dataHandler(cardData);
      
      await new Promise(resolve => setTimeout(resolve, 150)); // Wait for debounce
      dataHandler(cardData);

      await new Promise(resolve => setTimeout(resolve, 150)); // Wait for debounce
      dataHandler(cardData);

      // All scans should produce the same card ID
      expect(scanEvents).toHaveLength(3);
      expect(scanEvents[0].card_id).toBe(scanEvents[1].card_id);
      expect(scanEvents[1].card_id).toBe(scanEvents[2].card_id);
    });
  });

  describe('Error Scenarios Integration', () => {
    it('should handle hardware failure during user flow', async () => {
      const availableLockers: Locker[] = [{
        id: 3,
        kiosk_id: mockKioskId,
        status: 'Free',
        version: 1,
        is_vip: false,
        created_at: new Date(),
        updated_at: new Date()
      }];

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getAvailableLockers.mockResolvedValue(availableLockers);
      mockLockerStateManager.assignLocker.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(false); // Hardware failure
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      // Simulate card scan
      const cardScanPromise = new Promise<RfidScanEvent>((resolve) => {
        rfidHandler.on('card_scanned', resolve);
      });

      const mockHidDevice = (rfidHandler as any).device;
      const dataHandler = mockHidDevice.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      dataHandler(Buffer.from([0x11, 0x22, 0x33, 0x44]));

      const scanEvent = await cardScanPromise;

      // Handle scan and selection
      const scanResult = await rfidUserFlow.handleCardScanned(scanEvent);
      expect(scanResult.success).toBe(true);

      const selectionResult = await rfidUserFlow.handleLockerSelection(scanEvent.card_id, 3);

      // Should handle hardware failure gracefully
      expect(selectionResult.success).toBe(false);
      expect(selectionResult.error_code).toBe('OPENING_FAILED');
      
      // Should release reservation after failure
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith(mockKioskId, 3, scanEvent.card_id);
    });

    it('should handle RFID reader disconnection', async () => {
      // Simulate reader disconnection
      const errorPromise = new Promise((resolve) => {
        rfidHandler.on('error', resolve);
      });

      const mockHidDevice = (rfidHandler as any).device;
      const errorHandler = mockHidDevice.on.mock.calls.find((call: any) => call[0] === 'error')[1];
      errorHandler(new Error('Device disconnected'));

      await errorPromise;
      expect(rfidHandler.isReaderConnected()).toBe(false);

      // Reader should attempt reconnection
      const reconnectPromise = new Promise((resolve) => {
        rfidHandler.on('connected', resolve);
      });

      // Simulate successful reconnection
      await rfidHandler.initialize();
      await reconnectPromise;
      expect(rfidHandler.isReaderConnected()).toBe(true);
    });
  });

  describe('Event Flow Integration', () => {
    it('should emit all expected events during complete user flow', async () => {
      const availableLockers: Locker[] = [{
        id: 7,
        kiosk_id: mockKioskId,
        status: 'Free',
        version: 1,
        is_vip: false,
        created_at: new Date(),
        updated_at: new Date()
      }];

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getAvailableLockers.mockResolvedValue(availableLockers);
      mockLockerStateManager.assignLocker.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.confirmOwnership.mockResolvedValue(true);

      const events: any[] = [];

      // Listen to all events
      rfidHandler.on('card_scanned', (event) => events.push({ type: 'card_scanned', data: event }));
      rfidUserFlow.on('show_available_lockers', (event) => events.push({ type: 'show_available_lockers', data: event }));
      rfidUserFlow.on('locker_assigned', (event) => events.push({ type: 'locker_assigned', data: event }));
      rfidUserFlow.on('locker_opening', (event) => events.push({ type: 'locker_opening', data: event }));
      rfidUserFlow.on('locker_opened_and_owned', (event) => events.push({ type: 'locker_opened_and_owned', data: event }));

      // Simulate complete flow
      const mockHidDevice = (rfidHandler as any).device;
      const dataHandler = mockHidDevice.on.mock.calls.find((call: any) => call[0] === 'data')[1];
      dataHandler(Buffer.from([0xFF, 0xEE, 0xDD, 0xCC]));

      // Wait for card scan event
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const cardId = events.find(e => e.type === 'card_scanned')?.data.card_id;
      expect(cardId).toBeDefined();

      // Handle scan and selection
      await rfidUserFlow.handleCardScanned({ card_id: cardId, scan_time: new Date(), reader_id: 'test' });
      await rfidUserFlow.handleLockerSelection(cardId, 7);

      // Verify all events were emitted in correct order
      expect(events).toHaveLength(5);
      expect(events[0].type).toBe('card_scanned');
      expect(events[1].type).toBe('show_available_lockers');
      expect(events[2].type).toBe('locker_assigned');
      expect(events[3].type).toBe('locker_opening');
      expect(events[4].type).toBe('locker_opened_and_owned');

      // Verify event data consistency
      expect(events[1].data.card_id).toBe(cardId);
      expect(events[2].data.locker_id).toBe(7);
      expect(events[3].data.locker_id).toBe(7);
      expect(events[4].data.locker_id).toBe(7);
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle rapid card scans with debouncing', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getAvailableLockers.mockResolvedValue([]);

      let scanCount = 0;
      rfidHandler.on('card_scanned', () => scanCount++);

      const mockHidDevice = (rfidHandler as any).device;
      const dataHandler = mockHidDevice.on.mock.calls.find((call: any) => call[0] === 'data')[1];

      // Rapid scans of same card
      const cardData = Buffer.from([0x99, 0x88, 0x77, 0x66]);
      for (let i = 0; i < 10; i++) {
        dataHandler(cardData);
      }

      // Wait for debounce period
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should only register one scan due to debouncing
      expect(scanCount).toBe(1);
    });

    it('should maintain state consistency during concurrent operations', async () => {
      const existingLocker: Locker = {
        id: 9,
        kiosk_id: mockKioskId,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: 'test-card',
        version: 1,
        is_vip: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(existingLocker);
      mockLockerStateManager.validateOwnership.mockResolvedValue(true);
      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      // Simulate multiple concurrent card scans
      const scanEvent: RfidScanEvent = {
        card_id: 'test-card-hash',
        scan_time: new Date(),
        reader_id: 'test-reader'
      };

      const promises = Array.from({ length: 5 }, () => 
        rfidUserFlow.handleCardScanned(scanEvent)
      );

      const results = await Promise.all(promises);

      // All should succeed (idempotent operations)
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.action).toBe('open_locker');
      });
    });
  });
});
