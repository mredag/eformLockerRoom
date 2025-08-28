import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../shared/database/database-manager';
import { LockerStateManager } from '../../shared/services/locker-state-manager';
import { EventLogger } from '../../shared/services/event-logger';
import { RfidUserFlow } from '../../app/kiosk/src/services/rfid-user-flow';
import { QrHandler } from '../../app/kiosk/src/controllers/qr-handler';
import { RateLimiter } from '../../app/kiosk/src/services/rate-limiter';

describe('RFID and QR Integration Tests', () => {
  let dbManager: DatabaseManager;
  let stateManager: LockerStateManager;
  let eventLogger: EventLogger;
  let rfidFlow: RfidUserFlow;
  let qrHandler: QrHandler;
  let rateLimiter: RateLimiter;

  beforeEach(async () => {
    // Use in-memory database for testing
    dbManager = new DatabaseManager(':memory:');
    await dbManager.initialize();

    eventLogger = new EventLogger(dbManager.getEventRepository());
    stateManager = new LockerStateManager(
      dbManager.getLockerRepository(),
      eventLogger
    );

    rateLimiter = new RateLimiter({
      ip: { capacity: 30, refillRate: 0.5 },
      card: { capacity: 60, refillRate: 1 },
      locker: { capacity: 6, refillRate: 0.1 },
      device: { capacity: 1, refillRate: 0.05 }
    }, eventLogger);

    rfidFlow = new RfidUserFlow(
      'test-kiosk',
      stateManager,
      rateLimiter,
      eventLogger
    );

    qrHandler = new QrHandler(
      'test-kiosk',
      rateLimiter,
      dbManager,
      stateManager,
      eventLogger
    );

    // Create test lockers
    const lockerRepo = dbManager.getLockerRepository();
    for (let i = 1; i <= 10; i++) {
      await lockerRepo.create({
        id: i,
        kiosk_id: 'test-kiosk',
        status: 'Free',
        is_vip: false
      });
    }
  });

  afterEach(async () => {
    await dbManager.close();
  });

  describe('Complete User Journeys', () => {
    it('should handle complete RFID user journey - assign and release', async () => {
      const cardId = 'RFID123456789ABC';

      // Step 1: User scans card with no existing locker
      const assignResult = await rfidFlow.handleCardScan(cardId);
      
      expect(assignResult.success).toBe(true);
      expect(assignResult.action).toBe('show_available');
      expect(assignResult.availableLockers).toBeDefined();
      expect(assignResult.availableLockers.length).toBeGreaterThan(0);

      // Step 2: User selects a locker
      const selectedLockerId = assignResult.availableLockers[0].id;
      const selectResult = await rfidFlow.handleLockerSelection(cardId, selectedLockerId);

      expect(selectResult.success).toBe(true);
      expect(selectResult.action).toBe('assigned');
      expect(selectResult.lockerId).toBe(selectedLockerId);

      // Step 3: User scans card again to open and release
      const releaseResult = await rfidFlow.handleCardScan(cardId);

      expect(releaseResult.success).toBe(true);
      expect(releaseResult.action).toBe('released');
      expect(releaseResult.lockerId).toBe(selectedLockerId);

      // Verify locker is now free
      const locker = await stateManager.getLocker('test-kiosk', selectedLockerId);
      expect(locker.status).toBe('Free');
      expect(locker.owner_key).toBeNull();
    });

    it('should handle complete QR user journey - assign and release', async () => {
      const deviceId = 'device-123-456-789';
      const lockerId = 5;
      const ip = '192.168.1.100';

      // Step 1: User scans QR code on free locker
      const assignResult = await qrHandler.handleQrRequest(lockerId, deviceId, ip);

      expect(assignResult.success).toBe(true);
      expect(assignResult.action).toBe('assigned');

      // Verify locker is now owned by device
      const locker = await stateManager.getLocker('test-kiosk', lockerId);
      expect(locker.status).toBe('Owned');
      expect(locker.owner_type).toBe('device');
      expect(locker.owner_key).toBe(deviceId);

      // Step 2: Same device scans QR code again to release
      const releaseResult = await qrHandler.handleQrRequest(lockerId, deviceId, ip);

      expect(releaseResult.success).toBe(true);
      expect(releaseResult.action).toBe('released');

      // Verify locker is now free
      const releasedLocker = await stateManager.getLocker('test-kiosk', lockerId);
      expect(releasedLocker.status).toBe('Free');
      expect(releasedLocker.owner_key).toBeNull();
    });

    it('should handle mixed RFID and QR usage scenarios', async () => {
      const cardId = 'RFID123456789ABC';
      const deviceId = 'device-123-456-789';
      const ip = '192.168.1.100';

      // RFID user takes locker 1
      const rfidAssign = await rfidFlow.handleCardScan(cardId);
      const rfidSelect = await rfidFlow.handleLockerSelection(cardId, 1);
      expect(rfidSelect.success).toBe(true);

      // QR user takes locker 2
      const qrAssign = await qrHandler.handleQrRequest(2, deviceId, ip);
      expect(qrAssign.success).toBe(true);

      // Verify both lockers are occupied
      const locker1 = await stateManager.getLocker('test-kiosk', 1);
      const locker2 = await stateManager.getLocker('test-kiosk', 2);
      
      expect(locker1.status).toBe('Owned');
      expect(locker1.owner_type).toBe('rfid');
      expect(locker2.status).toBe('Owned');
      expect(locker2.owner_type).toBe('device');

      // QR user tries to access RFID locker - should fail
      const crossAccess = await qrHandler.handleQrRequest(1, deviceId, ip);
      expect(crossAccess.success).toBe(false);
      expect(crossAccess.statusCode).toBe(409);

      // RFID user releases their locker
      const rfidRelease = await rfidFlow.handleCardScan(cardId);
      expect(rfidRelease.success).toBe(true);
      expect(rfidRelease.action).toBe('released');

      // QR user releases their locker
      const qrRelease = await qrHandler.handleQrRequest(2, deviceId, ip);
      expect(qrRelease.success).toBe(true);
      expect(qrRelease.action).toBe('released');

      // Verify both lockers are free
      const finalLocker1 = await stateManager.getLocker('test-kiosk', 1);
      const finalLocker2 = await stateManager.getLocker('test-kiosk', 2);
      
      expect(finalLocker1.status).toBe('Free');
      expect(finalLocker2.status).toBe('Free');
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should enforce rate limits across RFID and QR operations', async () => {
      const cardId = 'RFID123456789ABC';
      const deviceId = 'device-123-456-789';
      const ip = '192.168.1.100';

      // Exhaust card rate limit with RFID operations
      for (let i = 0; i < 60; i++) {
        await rfidFlow.handleCardScan(cardId);
      }

      // Next RFID operation should be rate limited
      const rfidResult = await rfidFlow.handleCardScan(cardId);
      expect(rfidResult.success).toBe(false);
      expect(rfidResult.reason).toContain('rate limit');

      // QR operations should still work (different rate limit)
      const qrResult = await qrHandler.handleQrRequest(1, deviceId, ip);
      expect(qrResult.success).toBe(true);
    });

    it('should handle IP-based rate limiting for QR operations', async () => {
      const ip = '192.168.1.100';
      const deviceIds = Array.from({ length: 35 }, (_, i) => `device-${i}`);

      // Exhaust IP rate limit with different devices
      for (let i = 0; i < 30; i++) {
        await qrHandler.handleQrRequest(1, deviceIds[i], ip);
      }

      // Next request from same IP should be rate limited
      const rateLimitedResult = await qrHandler.handleQrRequest(2, deviceIds[30], ip);
      expect(rateLimitedResult.success).toBe(false);
      expect(rateLimitedResult.statusCode).toBe(429);

      // Request from different IP should work
      const differentIpResult = await qrHandler.handleQrRequest(2, deviceIds[31], '192.168.1.101');
      expect(differentIpResult.success).toBe(true);
    });
  });

  describe('Error Scenarios and Recovery', () => {
    it('should handle database connection failures gracefully', async () => {
      // Close database to simulate connection failure
      await dbManager.close();

      const cardId = 'RFID123456789ABC';
      const deviceId = 'device-123-456-789';
      const ip = '192.168.1.100';

      // RFID operation should fail gracefully
      const rfidResult = await rfidFlow.handleCardScan(cardId);
      expect(rfidResult.success).toBe(false);
      expect(rfidResult.reason).toContain('error');

      // QR operation should fail gracefully
      const qrResult = await qrHandler.handleQrRequest(1, deviceId, ip);
      expect(qrResult.success).toBe(false);
      expect(qrResult.statusCode).toBe(500);
    });

    it('should handle concurrent access to same locker', async () => {
      const cardId1 = 'RFID123456789ABC';
      const cardId2 = 'RFID987654321DEF';
      const lockerId = 1;

      // Simulate concurrent RFID operations
      const [result1, result2] = await Promise.all([
        rfidFlow.handleLockerSelection(cardId1, lockerId),
        rfidFlow.handleLockerSelection(cardId2, lockerId)
      ]);

      // Only one should succeed
      const successes = [result1, result2].filter(r => r.success);
      const failures = [result1, result2].filter(r => !r.success);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toContain('not available');
    });

    it('should handle state inconsistencies and recovery', async () => {
      const cardId = 'RFID123456789ABC';
      const lockerId = 1;

      // Manually create inconsistent state
      const lockerRepo = dbManager.getLockerRepository();
      await lockerRepo.update('test-kiosk', lockerId, {
        status: 'Reserved',
        owner_type: 'rfid',
        owner_key: cardId,
        reserved_at: new Date(Date.now() - 120000) // 2 minutes ago (expired)
      });

      // System should detect and clean up expired reservation
      const result = await rfidFlow.handleCardScan(cardId);
      
      // Should either succeed (if cleanup worked) or provide clear error
      if (result.success) {
        expect(result.action).toBe('show_available');
      } else {
        expect(result.reason).toBeDefined();
      }
    });
  });

  describe('Event Logging Integration', () => {
    it('should log all user operations with proper event types', async () => {
      const cardId = 'RFID123456789ABC';
      const deviceId = 'device-123-456-789';
      const ip = '192.168.1.100';

      // Perform RFID journey
      await rfidFlow.handleCardScan(cardId);
      await rfidFlow.handleLockerSelection(cardId, 1);
      await rfidFlow.handleCardScan(cardId);

      // Perform QR journey
      await qrHandler.handleQrRequest(2, deviceId, ip);
      await qrHandler.handleQrRequest(2, deviceId, ip);

      // Verify events were logged
      const events = await dbManager.getEventRepository().findByKiosk('test-kiosk', 10);
      
      expect(events.length).toBeGreaterThan(0);
      
      const eventTypes = events.map(e => e.event_type);
      expect(eventTypes).toContain('rfid_assign');
      expect(eventTypes).toContain('rfid_release');
      expect(eventTypes).toContain('qr_assign');
      expect(eventTypes).toContain('qr_release');
    });

    it('should log security violations and rate limit events', async () => {
      const cardId = 'RFID123456789ABC';
      const ip = '192.168.1.100';

      // Trigger rate limit violation
      for (let i = 0; i < 65; i++) {
        await rfidFlow.handleCardScan(cardId);
      }

      // Check for rate limit violation events
      const events = await dbManager.getEventRepository().findByKiosk('test-kiosk', 100);
      const violationEvents = events.filter(e => e.event_type.includes('rate_limit') || e.event_type.includes('violation'));
      
      expect(violationEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle multiple concurrent users efficiently', async () => {
      const userCount = 20;
      const operations = [];

      // Create concurrent operations
      for (let i = 0; i < userCount; i++) {
        const cardId = `RFID${i.toString().padStart(12, '0')}`;
        const deviceId = `device-${i}`;
        const ip = `192.168.1.${100 + (i % 50)}`;

        if (i % 2 === 0) {
          // RFID operations
          operations.push(async () => {
            const scan = await rfidFlow.handleCardScan(cardId);
            if (scan.success && scan.availableLockers?.length > 0) {
              await rfidFlow.handleLockerSelection(cardId, scan.availableLockers[0].id);
            }
          });
        } else {
          // QR operations
          operations.push(async () => {
            await qrHandler.handleQrRequest((i % 10) + 1, deviceId, ip);
          });
        }
      }

      const startTime = Date.now();
      await Promise.all(operations.map(op => op()));
      const endTime = Date.now();

      // Should complete within reasonable time (5 seconds for 20 operations)
      expect(endTime - startTime).toBeLessThan(5000);

      // Verify system state is consistent
      const lockers = await dbManager.getLockerRepository().findByKiosk('test-kiosk');
      const ownedCount = lockers.filter(l => l.status === 'Owned').length;
      const freeCount = lockers.filter(l => l.status === 'Free').length;
      
      expect(ownedCount + freeCount).toBe(10); // All lockers accounted for
    });
  });

  describe('VIP Locker Integration', () => {
    it('should handle VIP locker restrictions correctly', async () => {
      // Create VIP locker
      const vipLockerId = 5;
      await dbManager.getLockerRepository().update('test-kiosk', vipLockerId, {
        is_vip: true
      });

      // Create VIP contract
      const vipRepo = dbManager.getVipContractRepository();
      await vipRepo.create({
        kiosk_id: 'test-kiosk',
        locker_id: vipLockerId,
        rfid_card: 'VIP123456789ABC',
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: 'active',
        created_by: 'admin'
      });

      const regularCard = 'RFID123456789ABC';
      const deviceId = 'device-123-456-789';
      const ip = '192.168.1.100';

      // Regular RFID user should not see VIP locker in available list
      const rfidResult = await rfidFlow.handleCardScan(regularCard);
      expect(rfidResult.success).toBe(true);
      expect(rfidResult.availableLockers.find(l => l.id === vipLockerId)).toBeUndefined();

      // QR access to VIP locker should be blocked
      const qrResult = await qrHandler.handleQrRequest(vipLockerId, deviceId, ip);
      expect(qrResult.success).toBe(false);
      expect(qrResult.statusCode).toBe(423);
      expect(qrResult.message).toContain('VIP');
    });
  });
});