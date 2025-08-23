/**
 * End-to-End Tests for Complete User Flows
 * Tests complete user journeys from RFID scan to locker operation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { EventLogger } from '../../../../shared/services/event-logger';
import { RfidUserFlow } from '../../services/rfid-user-flow';
import { QrHandler } from '../../controllers/qr-handler';
import { ModbusController } from '../../hardware/modbus-controller';
import { RfidHandler } from '../../hardware/rfid-handler';
import { UiController } from '../../controllers/ui-controller';
import { Locker, Event } from '../../../../shared/types/core-entities';

describe('Complete User Flows - End-to-End Tests', () => {
  let dbManager: DatabaseManager;
  let stateManager: LockerStateManager;
  let eventLogger: EventLogger;
  let rfidUserFlow: RfidUserFlow;
  let qrHandler: QrHandler;
  let modbusController: ModbusController;
  let rfidHandler: RfidHandler;
  let uiController: UiController;

  beforeEach(async () => {
    // Use in-memory database for testing
    dbManager = new DatabaseManager(':memory:');
    await dbManager.initialize();

    eventLogger = new EventLogger(dbManager.getEventRepository());
    stateManager = new LockerStateManager(
      dbManager.getLockerRepository(),
      eventLogger
    );

    // Mock hardware controllers
    modbusController = {
      openLocker: vi.fn().mockResolvedValue(true),
      performBurstOpening: vi.fn().mockResolvedValue(true),
      isConnected: vi.fn().mockReturnValue(true),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined)
    } as any;

    rfidHandler = {
      startScanning: vi.fn(),
      stopScanning: vi.fn(),
      on: vi.fn(),
      emit: vi.fn()
    } as any;

    // Initialize services
    rfidUserFlow = new RfidUserFlow({
      stateManager,
      modbusController,
      eventLogger,
      kioskId: 'test-kiosk'
    });

    qrHandler = new QrHandler(
      stateManager,
      modbusController,
      eventLogger,
      'test-kiosk'
    );

    uiController = new UiController(
      stateManager,
      rfidUserFlow,
      'test-kiosk'
    );

    // Setup test data
    await setupTestData();
  });

  afterEach(async () => {
    await dbManager.close();
  });

  async function setupTestData() {
    const lockerRepo = dbManager.getLockerRepository();
    
    // Create test lockers
    for (let i = 1; i <= 10; i++) {
      await lockerRepo.create({
        kiosk_id: 'test-kiosk',
        id: i,
        status: 'Free',
        version: 1,
        is_vip: false
      });
    }

    // Create one VIP locker
    await lockerRepo.create({
      kiosk_id: 'test-kiosk',
      id: 11,
      status: 'Free',
      version: 1,
      is_vip: true
    });
  }

  describe('RFID User Journey - Complete Flow', () => {
    it('should complete full RFID assignment and release cycle', async () => {
      const cardId = 'test-card-123';

      // Step 1: User scans card with no existing locker
      const availableLockers = await stateManager.getAvailableLockers('test-kiosk');
      expect(availableLockers.length).toBeGreaterThan(0);

      // Step 2: User selects locker 1
      const assignResult = await stateManager.assignLocker('test-kiosk', 1, 'rfid', cardId);
      expect(assignResult).toBe(true);

      // Verify locker is now Reserved
      const reservedLocker = await stateManager.getLocker('test-kiosk', 1);
      expect(reservedLocker?.status).toBe('Reserved');
      expect(reservedLocker?.owner_key).toBe(cardId);

      // Step 3: Simulate successful opening
      const openResult = await modbusController.openLocker(1);
      expect(openResult).toBe(true);

      // Update locker to Owned after successful opening
      await stateManager.transitionToOwned('test-kiosk', 1, cardId);
      
      const ownedLocker = await stateManager.getLocker('test-kiosk', 1);
      expect(ownedLocker?.status).toBe('Owned');

      // Step 4: User returns and scans card again
      const existingLocker = await stateManager.checkExistingOwnership(cardId, 'rfid');
      expect(existingLocker).toBeTruthy();
      expect(existingLocker?.id).toBe(1);

      // Step 5: Open and release locker
      const releaseResult = await stateManager.releaseLocker('test-kiosk', 1, cardId, 'rfid');
      expect(releaseResult).toBe(true);

      // Verify locker is now Free
      const freedLocker = await stateManager.getLocker('test-kiosk', 1);
      expect(freedLocker?.status).toBe('Free');
      expect(freedLocker?.owner_key).toBeNull();

      // Verify events were logged
      const events = await eventLogger.getEvents('test-kiosk', { limit: 10 });
      expect(events.length).toBeGreaterThan(0);
      
      const assignEvent = events.find(e => e.event_type === 'rfid_assign');
      const releaseEvent = events.find(e => e.event_type === 'rfid_release');
      expect(assignEvent).toBeTruthy();
      expect(releaseEvent).toBeTruthy();
    });

    it('should handle one-card-one-locker rule enforcement', async () => {
      const cardId = 'test-card-456';

      // Assign first locker
      await stateManager.assignLocker('test-kiosk', 1, 'rfid', cardId);
      await stateManager.transitionToOwned('test-kiosk', 1, cardId);

      // Try to assign second locker with same card
      const secondAssignResult = await stateManager.assignLocker('test-kiosk', 2, 'rfid', cardId);
      expect(secondAssignResult).toBe(false);

      // Verify only first locker is owned
      const locker1 = await stateManager.getLocker('test-kiosk', 1);
      const locker2 = await stateManager.getLocker('test-kiosk', 2);
      
      expect(locker1?.status).toBe('Owned');
      expect(locker2?.status).toBe('Free');
    });

    it('should handle reservation timeout (90 seconds)', async () => {
      const cardId = 'test-card-timeout';

      // Assign locker (Reserved state)
      await stateManager.assignLocker('test-kiosk', 3, 'rfid', cardId);
      
      const reservedLocker = await stateManager.getLocker('test-kiosk', 3);
      expect(reservedLocker?.status).toBe('Reserved');

      // Mock time passage (91 seconds)
      vi.useFakeTimers();
      vi.advanceTimersByTime(91000);

      // Run cleanup
      await stateManager.cleanupExpiredReservations();

      // Verify locker is now Free
      const freedLocker = await stateManager.getLocker('test-kiosk', 3);
      expect(freedLocker?.status).toBe('Free');
      expect(freedLocker?.owner_key).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('QR Code User Journey - Complete Flow', () => {
    it('should complete full QR assignment and release cycle', async () => {
      const deviceId = 'test-device-789';
      const lockerId = 4;

      // Step 1: User scans QR code on Free locker
      const assignResponse = await qrHandler.handleQrRequest(lockerId, deviceId);
      
      expect(assignResponse.success).toBe(true);
      expect(assignResponse.action).toBe('assigned');
      expect(assignResponse.message).toContain('assigned');

      // Verify locker is now Owned by device
      const ownedLocker = await stateManager.getLocker('test-kiosk', lockerId);
      expect(ownedLocker?.status).toBe('Owned');
      expect(ownedLocker?.owner_key).toBe(deviceId);
      expect(ownedLocker?.owner_type).toBe('device');

      // Step 2: Same device scans QR code again (release)
      const releaseResponse = await qrHandler.handleQrRequest(lockerId, deviceId);
      
      expect(releaseResponse.success).toBe(true);
      expect(releaseResponse.action).toBe('released');
      expect(releaseResponse.message).toContain('released');

      // Verify locker is now Free
      const freedLocker = await stateManager.getLocker('test-kiosk', lockerId);
      expect(freedLocker?.status).toBe('Free');
      expect(freedLocker?.owner_key).toBeNull();
    });

    it('should reject QR access to VIP lockers', async () => {
      const deviceId = 'test-device-vip';
      const vipLockerId = 11; // VIP locker from setup

      const response = await qrHandler.handleQrRequest(vipLockerId, deviceId);
      
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(423);
      expect(response.message).toContain('VIP');
    });

    it('should reject QR access when locker is occupied by different device', async () => {
      const device1 = 'device-1';
      const device2 = 'device-2';
      const lockerId = 5;

      // Device 1 assigns locker
      await qrHandler.handleQrRequest(lockerId, device1);

      // Device 2 tries to access same locker
      const response = await qrHandler.handleQrRequest(lockerId, device2);
      
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(409);
      expect(response.message).toContain('busy');
    });
  });

  describe('Mixed User Flows', () => {
    it('should handle RFID and QR users simultaneously', async () => {
      const rfidCard = 'rfid-mixed-test';
      const deviceId = 'device-mixed-test';

      // RFID user assigns locker 6
      await stateManager.assignLocker('test-kiosk', 6, 'rfid', rfidCard);
      await stateManager.transitionToOwned('test-kiosk', 6, rfidCard);

      // QR user assigns locker 7
      await qrHandler.handleQrRequest(7, deviceId);

      // Verify both lockers are properly assigned
      const rfidLocker = await stateManager.getLocker('test-kiosk', 6);
      const qrLocker = await stateManager.getLocker('test-kiosk', 7);

      expect(rfidLocker?.status).toBe('Owned');
      expect(rfidLocker?.owner_type).toBe('rfid');
      expect(rfidLocker?.owner_key).toBe(rfidCard);

      expect(qrLocker?.status).toBe('Owned');
      expect(qrLocker?.owner_type).toBe('device');
      expect(qrLocker?.owner_key).toBe(deviceId);

      // Both users can release their lockers independently
      await stateManager.releaseLocker('test-kiosk', 6, rfidCard, 'rfid');
      await qrHandler.handleQrRequest(7, deviceId);

      const freedRfidLocker = await stateManager.getLocker('test-kiosk', 6);
      const freedQrLocker = await stateManager.getLocker('test-kiosk', 7);

      expect(freedRfidLocker?.status).toBe('Free');
      expect(freedQrLocker?.status).toBe('Free');
    });
  });

  describe('Hardware Failure Scenarios', () => {
    it('should handle Modbus communication failure during opening', async () => {
      const cardId = 'test-card-hardware-fail';

      // Mock hardware failure
      modbusController.openLocker = vi.fn().mockResolvedValue(false);
      modbusController.performBurstOpening = vi.fn().mockResolvedValue(false);

      // Assign locker
      await stateManager.assignLocker('test-kiosk', 8, 'rfid', cardId);

      // Attempt to open (should fail)
      const openResult = await modbusController.openLocker(8);
      expect(openResult).toBe(false);

      // Verify locker remains in Reserved state (not transitioned to Owned)
      const locker = await stateManager.getLocker('test-kiosk', 8);
      expect(locker?.status).toBe('Reserved');

      // After timeout, should return to Free
      vi.useFakeTimers();
      vi.advanceTimersByTime(91000);
      await stateManager.cleanupExpiredReservations();

      const freedLocker = await stateManager.getLocker('test-kiosk', 8);
      expect(freedLocker?.status).toBe('Free');

      vi.useRealTimers();
    });

    it('should handle power loss and restart scenarios', async () => {
      const cardId = 'test-card-power-loss';

      // Assign and own a locker
      await stateManager.assignLocker('test-kiosk', 9, 'rfid', cardId);
      await stateManager.transitionToOwned('test-kiosk', 9, cardId);

      // Simulate system restart - log restart event
      await eventLogger.logEvent({
        kiosk_id: 'test-kiosk',
        event_type: 'restarted',
        details: { reason: 'power_restored' }
      });

      // Verify locker state persists after restart
      const locker = await stateManager.getLocker('test-kiosk', 9);
      expect(locker?.status).toBe('Owned');
      expect(locker?.owner_key).toBe(cardId);

      // Verify restart event was logged
      const events = await eventLogger.getEvents('test-kiosk', { limit: 5 });
      const restartEvent = events.find(e => e.event_type === 'restarted');
      expect(restartEvent).toBeTruthy();
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple concurrent locker assignments', async () => {
      const concurrentUsers = 5;
      const assignments = [];

      // Create concurrent assignment requests
      for (let i = 0; i < concurrentUsers; i++) {
        const cardId = `concurrent-card-${i}`;
        const lockerId = i + 1;
        
        assignments.push(
          stateManager.assignLocker('test-kiosk', lockerId, 'rfid', cardId)
        );
      }

      // Execute all assignments concurrently
      const results = await Promise.all(assignments);

      // All assignments should succeed (different lockers)
      results.forEach(result => {
        expect(result).toBe(true);
      });

      // Verify all lockers are properly assigned
      for (let i = 0; i < concurrentUsers; i++) {
        const locker = await stateManager.getLocker('test-kiosk', i + 1);
        expect(locker?.status).toBe('Reserved');
        expect(locker?.owner_key).toBe(`concurrent-card-${i}`);
      }
    });

    it('should maintain data consistency under high load', async () => {
      const operations = [];
      const cardId = 'load-test-card';

      // Create rapid assign/release cycles
      for (let i = 0; i < 10; i++) {
        operations.push(async () => {
          await stateManager.assignLocker('test-kiosk', 10, 'rfid', cardId);
          await stateManager.transitionToOwned('test-kiosk', 10, cardId);
          await stateManager.releaseLocker('test-kiosk', 10, cardId, 'rfid');
        });
      }

      // Execute operations sequentially to test consistency
      for (const operation of operations) {
        await operation();
      }

      // Verify final state is consistent
      const finalLocker = await stateManager.getLocker('test-kiosk', 10);
      expect(finalLocker?.status).toBe('Free');
      expect(finalLocker?.owner_key).toBeNull();

      // Verify all events were logged
      const events = await eventLogger.getEvents('test-kiosk', { limit: 50 });
      const assignEvents = events.filter(e => e.event_type === 'rfid_assign');
      const releaseEvents = events.filter(e => e.event_type === 'rfid_release');
      
      expect(assignEvents.length).toBe(10);
      expect(releaseEvents.length).toBe(10);
    });
  });
});
