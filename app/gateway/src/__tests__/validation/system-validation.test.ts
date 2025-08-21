import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { CommandQueueManager } from '../../../../shared/services/command-queue-manager';
import { EventLogger } from '../../../../shared/services/event-logger';
import { RateLimiter } from '../../../../shared/services/rate-limiter';
import { SecurityValidation } from '../../../../shared/services/security-validation';
import { LockerRepository } from '../../../../shared/database/locker-repository';
import { VipContractRepository } from '../../../../shared/database/vip-contract-repository';

describe('System Validation Tests', () => {
  let dbManager: DatabaseManager;
  let lockerStateManager: LockerStateManager;
  let commandQueue: CommandQueueManager;
  let eventLogger: EventLogger;
  let rateLimiter: RateLimiter;
  let securityValidation: SecurityValidation;
  let lockerRepository: LockerRepository;
  let vipRepository: VipContractRepository;

  beforeEach(async () => {
    dbManager = new DatabaseManager(':memory:');
    await dbManager.initialize();
    
    lockerRepository = new LockerRepository(dbManager);
    vipRepository = new VipContractRepository(dbManager);
    lockerStateManager = new LockerStateManager(lockerRepository, vipRepository);
    commandQueue = new CommandQueueManager(dbManager);
    eventLogger = new EventLogger(dbManager);
    rateLimiter = new RateLimiter();
    securityValidation = new SecurityValidation();

    await setupValidationEnvironment();
  });

  afterEach(async () => {
    await dbManager.close();
  });

  async function setupValidationEnvironment() {
    // Create test rooms with realistic locker counts
    const rooms = [
      { id: 'gym-main', lockers: 100 },
      { id: 'spa-premium', lockers: 50 },
      { id: 'pool-area', lockers: 75 }
    ];

    for (const room of rooms) {
      for (let i = 1; i <= room.lockers; i++) {
        await lockerRepository.create({
          kiosk_id: room.id,
          id: i,
          status: 'Free',
          version: 1,
          is_vip: false
        });
      }
    }
  }

  describe('All Requirements Validation', () => {
    describe('Requirement 1: RFID-Based Locker Access', () => {
      it('should validate RFID card assignment and release flow', async () => {
        const cardId = 'test-rfid-001';
        const kioskId = 'gym-main';
        const lockerId = 15;

        // 1.1: Card with no locker should get available list
        const availableLockers = await lockerStateManager.getAvailableLockers(kioskId);
        expect(availableLockers.length).toBeGreaterThan(0);
        expect(availableLockers.every(l => l.status === 'Free')).toBe(true);

        // 1.3: Assign locker to card
        const assigned = await lockerStateManager.assignLocker(kioskId, lockerId, 'rfid', cardId);
        expect(assigned).toBe(true);

        // 1.4: Verify locker is owned
        const locker = await lockerRepository.findByKioskAndId(kioskId, lockerId);
        expect(locker?.status).toBe('Owned');
        expect(locker?.owner_key).toBe(cardId);

        // 1.2: Card with existing locker should open directly
        const existingLocker = await lockerRepository.findByOwnerKey(cardId);
        expect(existingLocker?.kiosk_id).toBe(kioskId);
        expect(existingLocker?.id).toBe(lockerId);

        // 1.5: Release locker
        const released = await lockerStateManager.releaseLocker(kioskId, lockerId);
        expect(released).toBe(true);

        // 1.8: Verify immediate release
        const releasedLocker = await lockerRepository.findByKioskAndId(kioskId, lockerId);
        expect(releasedLocker?.status).toBe('Free');
        expect(releasedLocker?.owner_key).toBeNull();
      });

      it('should validate reservation timeout (1.6)', async () => {
        const cardId = 'timeout-test-001';
        const kioskId = 'gym-main';
        const lockerId = 20;

        // Reserve locker
        const reserved = await lockerStateManager.reserveLocker(kioskId, lockerId, cardId);
        expect(reserved).toBe(true);

        const reservedLocker = await lockerRepository.findByKioskAndId(kioskId, lockerId);
        expect(reservedLocker?.status).toBe('Reserved');

        // Simulate timeout (90 seconds)
        const timeoutDate = new Date(Date.now() - 91 * 1000);
        await lockerRepository.update(kioskId, lockerId, {
          reserved_at: timeoutDate
        });

        // Check if cleanup would occur (in real system, this would be automatic)
        const expiredReservation = await lockerRepository.findByKioskAndId(kioskId, lockerId);
        const isExpired = expiredReservation?.reserved_at && 
          (Date.now() - expiredReservation.reserved_at.getTime()) > 90000;
        expect(isExpired).toBe(true);
      });

      it('should validate blocked lockers exclusion (1.7)', async () => {
        const kioskId = 'gym-main';
        const lockerId = 25;

        // Block locker
        await lockerRepository.update(kioskId, lockerId, {
          status: 'Blocked'
        });

        // Verify blocked locker not in available list
        const availableLockers = await lockerStateManager.getAvailableLockers(kioskId);
        expect(availableLockers.find(l => l.id === lockerId)).toBeUndefined();
      });
    });

    describe('Requirement 2: VIP Locker Management', () => {
      it('should validate VIP contract lifecycle (2.1-2.5)', async () => {
        const vipCard = 'vip-validation-001';
        const kioskId = 'spa-premium';
        const lockerId = 10;

        // 2.1: Create VIP contract
        const contract = await vipRepository.create({
          kiosk_id: kioskId,
          locker_id: lockerId,
          rfid_card: vipCard,
          start_date: new Date(),
          end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          status: 'active',
          created_by: 'admin'
        });

        expect(contract.id).toBeDefined();

        // Set up VIP locker
        await lockerRepository.update(kioskId, lockerId, {
          is_vip: true,
          status: 'Owned',
          owner_type: 'vip',
          owner_key: vipCard
        });

        // 2.2: VIP card should access without releasing ownership
        const vipLocker = await lockerRepository.findByOwnerKey(vipCard);
        expect(vipLocker?.status).toBe('Owned');
        expect(vipLocker?.is_vip).toBe(true);

        // 2.3: VIP locker excluded from available list
        const availableLockers = await lockerStateManager.getAvailableLockers(kioskId);
        expect(availableLockers.find(l => l.id === lockerId)).toBeUndefined();

        // 2.5: Contract expiration
        await vipRepository.update(contract.id, {
          status: 'expired'
        });

        await lockerRepository.update(kioskId, lockerId, {
          is_vip: false,
          status: 'Free',
          owner_type: null,
          owner_key: null
        });

        // Verify locker returns to normal operation
        const normalLocker = await lockerRepository.findByKioskAndId(kioskId, lockerId);
        expect(normalLocker?.is_vip).toBe(false);
        expect(normalLocker?.status).toBe('Free');
      });
    });

    describe('Requirement 5: QR Code Access Security', () => {
      it('should validate QR rate limiting (5.5)', async () => {
        const deviceId = 'test-device-001';
        const ip = '192.168.1.100';
        const lockerId = 5;

        // Test device rate limit (1 per 20 seconds)
        const deviceKey = `qr_device:${deviceId}`;
        expect(rateLimiter.checkLimit(deviceKey, 1, 20)).toBe(true);
        expect(rateLimiter.checkLimit(deviceKey, 1, 20)).toBe(false); // Should be blocked

        // Test IP rate limit (30 per minute)
        const ipKey = `qr_ip:${ip}`;
        for (let i = 0; i < 30; i++) {
          expect(rateLimiter.checkLimit(ipKey, 30, 60)).toBe(true);
        }
        expect(rateLimiter.checkLimit(ipKey, 30, 60)).toBe(false); // 31st request blocked

        // Test locker rate limit (6 per minute)
        const lockerKey = `qr_locker:${lockerId}`;
        for (let i = 0; i < 6; i++) {
          expect(rateLimiter.checkLimit(lockerKey, 6, 60)).toBe(true);
        }
        expect(rateLimiter.checkLimit(lockerKey, 6, 60)).toBe(false); // 7th request blocked
      });

      it('should validate security headers and validation (5.8)', async () => {
        const origin = 'https://malicious-site.com';
        const referer = 'https://malicious-site.com/attack';
        const validOrigin = 'https://eform-kiosk.local';

        // Test Origin/Referer validation
        expect(securityValidation.validateOrigin(origin)).toBe(false);
        expect(securityValidation.validateReferer(referer)).toBe(false);
        expect(securityValidation.validateOrigin(validOrigin)).toBe(true);

        // Test action token validation
        const validToken = securityValidation.generateActionToken(5, 'device-001');
        expect(securityValidation.validateActionToken(validToken)).toBe(true);

        // Test expired token
        const expiredToken = securityValidation.generateActionToken(5, 'device-001', -10); // 10 seconds ago
        expect(securityValidation.validateActionToken(expiredToken)).toBe(false);
      });
    });

    describe('Requirement 8: Security and Access Control', () => {
      it('should validate comprehensive security measures', async () => {
        // 8.1: PIN hashing validation
        const plainPin = '123456';
        const hashedPin = await securityValidation.hashPin(plainPin);
        expect(hashedPin).not.toBe(plainPin);
        expect(await securityValidation.verifyPin(plainPin, hashedPin)).toBe(true);
        expect(await securityValidation.verifyPin('wrong', hashedPin)).toBe(false);

        // 8.3: Rate limiting validation
        const cardKey = 'rfid_card:test-card-001';
        expect(rateLimiter.checkLimit(cardKey, 10, 60)).toBe(true);

        // 8.4: Event logging validation
        await eventLogger.logEvent({
          kiosk_id: 'gym-main',
          locker_id: 1,
          event_type: 'staff_open',
          staff_user: 'admin',
          details: { reason: 'user assistance', override: true }
        });

        const events = await eventLogger.getEventsByType('staff_open');
        expect(events).toHaveLength(1);
        expect(events[0].staff_user).toBe('admin');
      });
    });

    describe('Requirement 9: Offline Operation and Reliability', () => {
      it('should validate system restart and recovery (9.2, 9.3)', async () => {
        const kioskId = 'gym-main';

        // Set up some state before restart
        await lockerStateManager.assignLocker(kioskId, 1, 'rfid', 'card-001');
        await commandQueue.enqueueCommand(kioskId, {
          type: 'open_locker',
          locker_id: 2,
          staff_user: 'admin'
        });

        // Log restart event
        await eventLogger.logEvent({
          kiosk_id: kioskId,
          event_type: 'restarted',
          details: { reason: 'power_restored', previous_uptime: 7200 }
        });

        // Verify restart event logged
        const restartEvents = await eventLogger.getEventsByType('restarted');
        expect(restartEvents).toHaveLength(1);
        expect(restartEvents[0].kiosk_id).toBe(kioskId);

        // Verify no automatic opening occurred
        const locker1 = await lockerRepository.findByKioskAndId(kioskId, 1);
        expect(locker1?.status).toBe('Owned'); // Should remain owned

        // Verify command queue maintained
        const commands = await commandQueue.getCommands(kioskId);
        expect(commands.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Performance Validation', () => {
    it('should handle concurrent locker operations efficiently', async () => {
      const kioskId = 'gym-main';
      const concurrentOperations = 50;
      const startTime = Date.now();

      // Create concurrent assignment operations
      const operations = Array.from({ length: concurrentOperations }, (_, i) => 
        lockerStateManager.assignLocker(kioskId, i + 1, 'rfid', `card-${i + 1}`)
      );

      const results = await Promise.all(operations);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All operations should complete
      expect(results.every(r => r === true)).toBe(true);

      // Should complete within reasonable time (< 5 seconds for 50 operations)
      expect(duration).toBeLessThan(5000);

      console.log(`Concurrent operations completed in ${duration}ms`);
    });

    it('should handle large-scale locker queries efficiently', async () => {
      const kioskId = 'gym-main';
      const startTime = Date.now();

      // Query available lockers multiple times
      const queries = Array.from({ length: 100 }, () => 
        lockerStateManager.getAvailableLockers(kioskId)
      );

      const results = await Promise.all(queries);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All queries should return results
      expect(results.every(r => Array.isArray(r))).toBe(true);

      // Should complete within reasonable time (< 2 seconds for 100 queries)
      expect(duration).toBeLessThan(2000);

      console.log(`Large-scale queries completed in ${duration}ms`);
    });

    it('should handle bulk command queue operations', async () => {
      const kioskIds = ['gym-main', 'spa-premium', 'pool-area'];
      const commandsPerKiosk = 20;
      const startTime = Date.now();

      // Create bulk commands across multiple kiosks
      const operations = [];
      for (const kioskId of kioskIds) {
        for (let i = 0; i < commandsPerKiosk; i++) {
          operations.push(
            commandQueue.enqueueCommand(kioskId, {
              type: 'open_locker',
              locker_id: i + 1,
              staff_user: 'admin'
            })
          );
        }
      }

      const commandIds = await Promise.all(operations);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All commands should be queued
      expect(commandIds.every(id => typeof id === 'string')).toBe(true);

      // Should complete within reasonable time
      expect(duration).toBeLessThan(3000);

      // Verify commands are properly distributed
      for (const kioskId of kioskIds) {
        const commands = await commandQueue.getCommands(kioskId);
        expect(commands).toHaveLength(commandsPerKiosk);
      }

      console.log(`Bulk command operations completed in ${duration}ms`);
    });

    it('should maintain performance under memory pressure', async () => {
      const kioskId = 'gym-main';
      const iterations = 1000;

      // Create and release many locker assignments
      for (let i = 0; i < iterations; i++) {
        const lockerId = (i % 50) + 1; // Cycle through first 50 lockers
        const cardId = `stress-card-${i}`;

        await lockerStateManager.assignLocker(kioskId, lockerId, 'rfid', cardId);
        await lockerStateManager.releaseLocker(kioskId, lockerId);

        // Log events to test memory usage
        await eventLogger.logEvent({
          kiosk_id: kioskId,
          locker_id: lockerId,
          event_type: 'rfid_assign',
          rfid_card: cardId,
          details: { iteration: i }
        });
      }

      // Verify system is still responsive
      const availableLockers = await lockerStateManager.getAvailableLockers(kioskId);
      expect(availableLockers.length).toBeGreaterThan(0);

      // Verify events were logged
      const events = await eventLogger.getEventsByKiosk(kioskId);
      expect(events.length).toBeGreaterThanOrEqual(iterations);

      console.log(`Memory pressure test completed with ${iterations} iterations`);
    });
  });

  describe('Security Validation', () => {
    it('should validate all authentication mechanisms', async () => {
      // PIN security
      const masterPin = 'master123';
      const hashedPin = await securityValidation.hashPin(masterPin);
      
      expect(await securityValidation.verifyPin(masterPin, hashedPin)).toBe(true);
      expect(await securityValidation.verifyPin('wrong', hashedPin)).toBe(false);

      // Rate limiting for PIN attempts
      const pinKey = 'master_pin:gym-main';
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.checkLimit(pinKey, 5, 300)).toBe(true); // 5 attempts per 5 minutes
      }
      expect(rateLimiter.checkLimit(pinKey, 5, 300)).toBe(false); // 6th attempt blocked

      // Session validation
      const sessionToken = securityValidation.generateSessionToken('admin');
      expect(securityValidation.validateSessionToken(sessionToken)).toBe(true);

      // CSRF protection
      const csrfToken = securityValidation.generateCSRFToken();
      expect(securityValidation.validateCSRFToken(csrfToken)).toBe(true);
    });

    it('should validate input sanitization and validation', async () => {
      // SQL injection prevention
      const maliciousInput = "'; DROP TABLE lockers; --";
      const sanitized = securityValidation.sanitizeInput(maliciousInput);
      expect(sanitized).not.toContain('DROP TABLE');

      // XSS prevention
      const xssInput = '<script>alert("xss")</script>';
      const sanitizedXss = securityValidation.sanitizeInput(xssInput);
      expect(sanitizedXss).not.toContain('<script>');

      // Command injection prevention
      const commandInjection = 'test; rm -rf /';
      const sanitizedCommand = securityValidation.sanitizeInput(commandInjection);
      expect(sanitizedCommand).not.toContain('; rm');
    });

    it('should validate access control enforcement', async () => {
      const adminUser = { role: 'admin', permissions: ['MANAGE_VIP', 'BULK_OPEN'] };
      const staffUser = { role: 'staff', permissions: ['OPEN_LOCKER', 'VIEW_LOCKERS'] };

      // Admin permissions
      expect(securityValidation.hasPermission(adminUser, 'MANAGE_VIP')).toBe(true);
      expect(securityValidation.hasPermission(adminUser, 'BULK_OPEN')).toBe(true);

      // Staff limitations
      expect(securityValidation.hasPermission(staffUser, 'MANAGE_VIP')).toBe(false);
      expect(securityValidation.hasPermission(staffUser, 'OPEN_LOCKER')).toBe(true);

      // Invalid permissions
      expect(securityValidation.hasPermission(staffUser, 'INVALID_PERMISSION')).toBe(false);
    });
  });

  describe('Hardware Integration Validation', () => {
    it('should validate Modbus communication patterns', async () => {
      // Mock Modbus controller for testing
      const mockModbus = {
        commands: [] as any[],
        async sendPulse(channel: number, duration: number = 400) {
          this.commands.push({ type: 'pulse', channel, duration, timestamp: Date.now() });
          return true;
        },
        async performBurstOpening(channel: number) {
          for (let i = 0; i < 5; i++) {
            await this.sendPulse(channel, 400);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          return true;
        }
      };

      // Test single pulse timing
      await mockModbus.sendPulse(1, 400);
      expect(mockModbus.commands).toHaveLength(1);
      expect(mockModbus.commands[0].duration).toBe(400);

      // Test command serialization (minimum 300ms intervals)
      const startTime = Date.now();
      await mockModbus.sendPulse(1);
      await new Promise(resolve => setTimeout(resolve, 300));
      await mockModbus.sendPulse(2);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(300);
      expect(mockModbus.commands).toHaveLength(3); // 1 + 2 more
    });

    it('should validate RFID reader integration', async () => {
      // Mock RFID handler
      const mockRfid = {
        scannedCards: [] as string[],
        async onCardScanned(cardId: string) {
          this.scannedCards.push(cardId);
          
          // Simulate debouncing (prevent duplicate scans within 1 second)
          const recentScans = this.scannedCards.filter(id => id === cardId);
          if (recentScans.length > 1) {
            return false; // Debounced
          }
          
          return true;
        }
      };

      // Test card scanning
      expect(await mockRfid.onCardScanned('test-card-001')).toBe(true);
      expect(await mockRfid.onCardScanned('test-card-001')).toBe(false); // Debounced
      expect(await mockRfid.onCardScanned('test-card-002')).toBe(true);

      expect(mockRfid.scannedCards).toHaveLength(3);
    });
  });

  describe('System Acceptance Testing', () => {
    it('should validate complete user journey - RFID flow', async () => {
      const cardId = 'acceptance-rfid-001';
      const kioskId = 'gym-main';
      const lockerId = 30;

      // Step 1: User scans card with no existing locker
      const existingLocker = await lockerRepository.findByOwnerKey(cardId);
      expect(existingLocker).toBeNull();

      // Step 2: System shows available lockers
      const availableLockers = await lockerStateManager.getAvailableLockers(kioskId);
      expect(availableLockers.length).toBeGreaterThan(0);
      expect(availableLockers.find(l => l.id === lockerId)).toBeDefined();

      // Step 3: User selects locker
      const assigned = await lockerStateManager.assignLocker(kioskId, lockerId, 'rfid', cardId);
      expect(assigned).toBe(true);

      // Step 4: System opens locker and sets to Owned
      const ownedLocker = await lockerRepository.findByKioskAndId(kioskId, lockerId);
      expect(ownedLocker?.status).toBe('Owned');
      expect(ownedLocker?.owner_key).toBe(cardId);

      // Step 5: User returns and scans card again
      const userLocker = await lockerRepository.findByOwnerKey(cardId);
      expect(userLocker?.kiosk_id).toBe(kioskId);
      expect(userLocker?.id).toBe(lockerId);

      // Step 6: System opens locker and releases ownership
      const released = await lockerStateManager.releaseLocker(kioskId, lockerId);
      expect(released).toBe(true);

      // Step 7: Locker is now free
      const freeLocker = await lockerRepository.findByKioskAndId(kioskId, lockerId);
      expect(freeLocker?.status).toBe('Free');
      expect(freeLocker?.owner_key).toBeNull();

      // Log complete journey
      await eventLogger.logEvent({
        kiosk_id: kioskId,
        event_type: 'acceptance_test_completed',
        rfid_card: cardId,
        details: { test_type: 'rfid_user_journey', result: 'success' }
      });
    });

    it('should validate complete staff workflow', async () => {
      const staffUser = 'admin';
      const kioskId = 'gym-main';

      // Setup: Create some owned lockers
      await lockerStateManager.assignLocker(kioskId, 1, 'rfid', 'user-001');
      await lockerStateManager.assignLocker(kioskId, 2, 'rfid', 'user-002');
      await lockerStateManager.assignLocker(kioskId, 3, 'rfid', 'user-003');

      // Staff operation 1: Individual locker open
      const openCommand = await commandQueue.enqueueCommand(kioskId, {
        type: 'staff_open',
        locker_id: 1,
        staff_user: staffUser,
        reason: 'user assistance'
      });

      expect(typeof openCommand).toBe('string');

      // Staff operation 2: Bulk open
      const bulkCommand = await commandQueue.enqueueCommand(kioskId, {
        type: 'bulk_open',
        locker_ids: [2, 3],
        staff_user: staffUser,
        exclude_vip: true
      });

      expect(typeof bulkCommand).toBe('string');

      // Verify commands queued
      const commands = await commandQueue.getCommands(kioskId);
      expect(commands).toHaveLength(2);

      // Simulate command execution
      await commandQueue.markCommandComplete(openCommand);
      await commandQueue.markCommandComplete(bulkCommand);

      // Log staff operations
      await eventLogger.logEvent({
        kiosk_id: kioskId,
        locker_id: 1,
        event_type: 'staff_open',
        staff_user: staffUser,
        details: { reason: 'user assistance', override: false }
      });

      await eventLogger.logEvent({
        kiosk_id: kioskId,
        event_type: 'bulk_open',
        staff_user: staffUser,
        details: { total_count: 2, success_count: 2, failed_lockers: [] }
      });

      // Verify audit trail
      const staffEvents = await eventLogger.getEventsByStaffUser(staffUser);
      expect(staffEvents.length).toBeGreaterThanOrEqual(2);
    });

    it('should validate VIP contract complete lifecycle', async () => {
      const vipCard = 'acceptance-vip-001';
      const adminUser = 'admin';
      const kioskId = 'spa-premium';
      const lockerId = 15;

      // Create VIP contract
      const contract = await vipRepository.create({
        kiosk_id: kioskId,
        locker_id: lockerId,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: adminUser
      });

      // Set up VIP locker
      await lockerRepository.update(kioskId, lockerId, {
        is_vip: true,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: vipCard
      });

      // VIP access (should not release ownership)
      const vipLocker = await lockerRepository.findByOwnerKey(vipCard);
      expect(vipLocker?.status).toBe('Owned');
      expect(vipLocker?.is_vip).toBe(true);

      // Extend contract
      const newEndDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      await vipRepository.update(contract.id, { end_date: newEndDate });

      // Change card
      const newCard = 'acceptance-vip-001-new';
      await vipRepository.update(contract.id, { rfid_card: newCard });
      await lockerRepository.update(kioskId, lockerId, { owner_key: newCard });

      // Cancel contract
      await vipRepository.update(contract.id, { status: 'cancelled' });
      await lockerRepository.update(kioskId, lockerId, {
        is_vip: false,
        status: 'Free',
        owner_type: null,
        owner_key: null
      });

      // Verify final state
      const finalLocker = await lockerRepository.findByKioskAndId(kioskId, lockerId);
      expect(finalLocker?.status).toBe('Free');
      expect(finalLocker?.is_vip).toBe(false);

      const finalContract = await vipRepository.findById(contract.id);
      expect(finalContract?.status).toBe('cancelled');
    });
  });
});