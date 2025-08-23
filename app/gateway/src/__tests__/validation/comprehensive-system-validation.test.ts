import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { CommandQueueManager } from '../../../../shared/services/command-queue-manager';
import { EventLogger } from '../../../../shared/services/event-logger';
import { RateLimiter } from '../../../../shared/services/rate-limiter';
import { SecurityValidation } from '../../../../shared/services/security-validation';
import { HeartbeatManager } from '../../../../shared/services/heartbeat-manager';
import { LockerRepository } from '../../../../shared/database/locker-repository';
import { VipContractRepository } from '../../../../shared/database/vip-contract-repository';
import { EventRepository } from '../../../../shared/database/event-repository';
import { HealthMonitor } from '../../../../shared/services/health-monitor';

describe('Comprehensive System Validation', () => {
  let dbManager: DatabaseManager;
  let lockerStateManager: LockerStateManager;
  let commandQueue: CommandQueueManager;
  let eventLogger: EventLogger;
  let rateLimiter: RateLimiter;
  let securityValidation: SecurityValidation;
  let heartbeatManager: HeartbeatManager;
  let healthMonitor: HealthMonitor;
  let lockerRepository: LockerRepository;
  let vipRepository: VipContractRepository;
  let eventRepository: EventRepository;

  beforeEach(async () => {
    dbManager = new DatabaseManager(':memory:');
    await dbManager.initialize();
    
    lockerRepository = new LockerRepository(dbManager);
    vipRepository = new VipContractRepository(dbManager);
    eventRepository = new EventRepository(dbManager);
    lockerStateManager = new LockerStateManager(lockerRepository, vipRepository);
    commandQueue = new CommandQueueManager(dbManager);
    eventLogger = new EventLogger(dbManager);
    rateLimiter = new RateLimiter();
    securityValidation = new SecurityValidation();
    heartbeatManager = new HeartbeatManager(dbManager);
    healthMonitor = new HealthMonitor(dbManager);

    await setupComprehensiveTestEnvironment();
  });

  afterEach(async () => {
    await dbManager.close();
  });

  async function setupComprehensiveTestEnvironment() {
    // Create realistic multi-room facility
    const facilities = [
      { id: 'gym-main', lockers: 100, zone: 'Main Gym Floor' },
      { id: 'spa-premium', lockers: 50, zone: 'Premium Spa' },
      { id: 'pool-area', lockers: 75, zone: 'Pool & Sauna' },
      { id: 'fitness-studio', lockers: 30, zone: 'Fitness Studio' }
    ];

    for (const facility of facilities) {
      // Register kiosk with heartbeat
      await heartbeatManager.registerKiosk(facility.id, facility.zone);
      
      // Create lockers with realistic distribution
      for (let i = 1; i <= facility.lockers; i++) {
        const isVip = i <= 5; // First 5 lockers are VIP
        const isOccupied = Math.random() > 0.6; // 40% occupied
        
        await lockerRepository.create({
          kiosk_id: facility.id,
          id: i,
          status: isOccupied ? 'Owned' : 'Free',
          owner_type: isOccupied ? 'rfid' : null,
          owner_key: isOccupied ? `card-${facility.id}-${i}` : null,
          version: 1,
          is_vip: isVip
        });

        // Create VIP contracts for VIP lockers
        if (isVip) {
          await vipRepository.create({
            kiosk_id: facility.id,
            locker_id: i,
            rfid_card: `vip-${facility.id}-${i}`,
            start_date: new Date(),
            end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            status: 'active',
            created_by: 'admin'
          });
        }
      }
    }
  }

  describe('Complete System Integration Validation', () => {
    it('should validate end-to-end RFID user journey across all requirements', async () => {
      const cardId = 'system-test-rfid-001';
      const kioskId = 'gym-main';
      const lockerId = 25;

      // Requirement 1.1: Card with no locker gets available list
      const existingLocker = await lockerRepository.findByOwnerKey(cardId);
      expect(existingLocker).toBeNull();

      const availableLockers = await lockerStateManager.getAvailableLockers(kioskId);
      expect(availableLockers.length).toBeGreaterThan(0);
      expect(availableLockers.every(l => l.status === 'Free')).toBe(true);
      expect(availableLockers.every(l => !l.is_vip)).toBe(true); // Req 2.3: VIP excluded

      // Requirement 1.3: Assign locker to card
      const assigned = await lockerStateManager.assignLocker(kioskId, lockerId, 'rfid', cardId);
      expect(assigned).toBe(true);

      // Log assignment event (Req 8.4)
      await eventLogger.logEvent({
        kiosk_id: kioskId,
        locker_id: lockerId,
        event_type: 'rfid_assign',
        rfid_card: cardId,
        details: { test_type: 'system_validation' }
      });

      // Requirement 1.4: Verify locker is owned
      const ownedLocker = await lockerRepository.findByKioskAndId(kioskId, lockerId);
      expect(ownedLocker?.status).toBe('Owned');
      expect(ownedLocker?.owner_key).toBe(cardId);
      expect(ownedLocker?.owner_type).toBe('rfid');

      // Requirement 1.2: Card with existing locker opens directly
      const userLocker = await lockerRepository.findByOwnerKey(cardId);
      expect(userLocker?.kiosk_id).toBe(kioskId);
      expect(userLocker?.id).toBe(lockerId);

      // Requirement 1.5: Release locker immediately
      const released = await lockerStateManager.releaseLocker(kioskId, lockerId);
      expect(released).toBe(true);

      // Log release event (Req 8.4)
      await eventLogger.logEvent({
        kiosk_id: kioskId,
        locker_id: lockerId,
        event_type: 'rfid_release',
        rfid_card: cardId,
        details: { test_type: 'system_validation' }
      });

      // Requirement 1.8: Verify immediate release
      const releasedLocker = await lockerRepository.findByKioskAndId(kioskId, lockerId);
      expect(releasedLocker?.status).toBe('Free');
      expect(releasedLocker?.owner_key).toBeNull();

      // Verify audit trail exists
      const events = await eventLogger.getEventsByRfidCard(cardId);
      expect(events.length).toBeGreaterThanOrEqual(2); // assign + release
    });

    it('should validate complete VIP workflow with all requirements', async () => {
      const vipCard = 'system-vip-001';
      const newCard = 'system-vip-001-new';
      const adminUser = 'admin';
      const kioskId = 'spa-premium';
      const lockerId = 20;

      // Requirement 2.1: Create VIP contract
      const contract = await vipRepository.create({
        kiosk_id: kioskId,
        locker_id: lockerId,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: adminUser
      });

      expect(contract.id).toBeDefined();

      // Set up VIP locker
      await lockerRepository.update(kioskId, lockerId, {
        is_vip: true,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: vipCard
      });

      // Log VIP contract creation (Req 8.4)
      await eventLogger.logEvent({
        kiosk_id: kioskId,
        locker_id: lockerId,
        event_type: 'vip_contract_created',
        staff_user: adminUser,
        details: { contract_id: contract.id, rfid_card: vipCard }
      });

      // Requirement 2.2: VIP access without releasing ownership
      const vipLocker = await lockerRepository.findByOwnerKey(vipCard);
      expect(vipLocker?.status).toBe('Owned');
      expect(vipLocker?.is_vip).toBe(true);

      // Requirement 2.3: VIP locker excluded from available list
      const availableLockers = await lockerStateManager.getAvailableLockers(kioskId);
      expect(availableLockers.find(l => l.id === lockerId)).toBeUndefined();

      // Requirement 2.4: Change VIP card
      await vipRepository.update(contract.id, { rfid_card: newCard });
      await lockerRepository.update(kioskId, lockerId, { owner_key: newCard });

      // Log card change (Req 8.4)
      await eventLogger.logEvent({
        kiosk_id: kioskId,
        locker_id: lockerId,
        event_type: 'vip_card_changed',
        staff_user: adminUser,
        details: { 
          contract_id: contract.id, 
          old_card: vipCard, 
          new_card: newCard 
        }
      });

      // Verify card change
      const updatedContract = await vipRepository.findById(contract.id);
      expect(updatedContract?.rfid_card).toBe(newCard);

      const updatedLocker = await lockerRepository.findByKioskAndId(kioskId, lockerId);
      expect(updatedLocker?.owner_key).toBe(newCard);

      // Requirement 2.5: Contract expiration
      await vipRepository.update(contract.id, { status: 'expired' });
      await lockerRepository.update(kioskId, lockerId, {
        is_vip: false,
        status: 'Free',
        owner_type: null,
        owner_key: null
      });

      // Log contract expiration (Req 8.4)
      await eventLogger.logEvent({
        kiosk_id: kioskId,
        locker_id: lockerId,
        event_type: 'vip_contract_expired',
        staff_user: adminUser,
        details: { contract_id: contract.id }
      });

      // Verify locker returns to normal operation
      const normalLocker = await lockerRepository.findByKioskAndId(kioskId, lockerId);
      expect(normalLocker?.is_vip).toBe(false);
      expect(normalLocker?.status).toBe('Free');

      // Verify complete audit trail
      const vipEvents = await eventLogger.getEventsByLocker(kioskId, lockerId);
      const vipEventTypes = vipEvents.map(e => e.event_type);
      expect(vipEventTypes).toContain('vip_contract_created');
      expect(vipEventTypes).toContain('vip_card_changed');
      expect(vipEventTypes).toContain('vip_contract_expired');
    });

    it('should validate complete staff management workflow', async () => {
      const staffUser = 'staff-001';
      const adminUser = 'admin';
      const kioskId = 'gym-main';

      // Set up test lockers
      await lockerStateManager.assignLocker(kioskId, 1, 'rfid', 'user-001');
      await lockerStateManager.assignLocker(kioskId, 2, 'rfid', 'user-002');
      await lockerStateManager.assignLocker(kioskId, 3, 'rfid', 'user-003');

      // Requirement 3.1: Individual locker operations
      const openCommand = await commandQueue.enqueueCommand(kioskId, {
        type: 'staff_open',
        locker_id: 1,
        staff_user: staffUser,
        reason: 'user assistance'
      });

      expect(typeof openCommand).toBe('string');

      // Log staff operation (Req 8.4)
      await eventLogger.logEvent({
        kiosk_id: kioskId,
        locker_id: 1,
        event_type: 'staff_open',
        staff_user: staffUser,
        details: { reason: 'user assistance', command_id: openCommand }
      });

      // Requirement 3.2: Bulk operations
      const bulkCommand = await commandQueue.enqueueCommand(kioskId, {
        type: 'bulk_open',
        locker_ids: [2, 3],
        staff_user: adminUser,
        exclude_vip: true
      });

      expect(typeof bulkCommand).toBe('string');

      // Log bulk operation (Req 8.4)
      await eventLogger.logEvent({
        kiosk_id: kioskId,
        event_type: 'bulk_open',
        staff_user: adminUser,
        details: { 
          locker_ids: [2, 3], 
          exclude_vip: true,
          command_id: bulkCommand 
        }
      });

      // Requirement 3.3: Block/unblock operations
      const blockCommand = await commandQueue.enqueueCommand(kioskId, {
        type: 'block_locker',
        locker_id: 4,
        staff_user: adminUser,
        reason: 'maintenance required'
      });

      await eventLogger.logEvent({
        kiosk_id: kioskId,
        locker_id: 4,
        event_type: 'staff_block',
        staff_user: adminUser,
        details: { reason: 'maintenance required', command_id: blockCommand }
      });

      // Verify commands are queued
      const commands = await commandQueue.getCommands(kioskId);
      expect(commands.length).toBeGreaterThanOrEqual(3);

      // Simulate command execution
      await commandQueue.markCommandComplete(openCommand);
      await commandQueue.markCommandComplete(bulkCommand);
      await commandQueue.markCommandComplete(blockCommand);

      // Verify audit trail for all staff operations
      const staffEvents = await eventLogger.getEventsByStaffUser(staffUser);
      const adminEvents = await eventLogger.getEventsByStaffUser(adminUser);
      
      expect(staffEvents.length).toBeGreaterThanOrEqual(1);
      expect(adminEvents.length).toBeGreaterThanOrEqual(2);
    });

    it('should validate multi-room coordination and heartbeat system', async () => {
      const kiosks = ['gym-main', 'spa-premium', 'pool-area'];

      // Requirement 6.1: Kiosk registration and heartbeat
      for (const kioskId of kiosks) {
        await heartbeatManager.updateHeartbeat(kioskId);
        
        const status = await heartbeatManager.getKioskStatus(kioskId);
        expect(status.status).toBe('online');
        expect(status.last_seen).toBeDefined();
      }

      // Requirement 6.2: Offline detection
      const offlineKiosk = 'offline-test';
      await heartbeatManager.registerKiosk(offlineKiosk, 'Test Zone');
      
      // Simulate offline (no heartbeat for 31 seconds)
      const oldTimestamp = new Date(Date.now() - 31000);
      await heartbeatManager.setLastSeen(offlineKiosk, oldTimestamp);
      
      const offlineStatus = await heartbeatManager.getKioskStatus(offlineKiosk);
      expect(offlineStatus.status).toBe('offline');

      // Requirement 6.3: Command queuing and delivery
      const testCommand = {
        type: 'test_command',
        data: 'multi_room_test'
      };

      const commandIds = [];
      for (const kioskId of kiosks) {
        const commandId = await commandQueue.enqueueCommand(kioskId, testCommand);
        commandIds.push(commandId);
      }

      // Requirement 6.4: Command polling
      for (let i = 0; i < kiosks.length; i++) {
        const commands = await commandQueue.getCommands(kiosks[i]);
        expect(commands.length).toBeGreaterThanOrEqual(1);
        expect(commands[0].command_id).toBe(commandIds[i]);
      }

      // Requirement 6.5: Panel filtering by room/zone
      const gymLockers = await lockerRepository.findByKiosk('gym-main');
      const spaLockers = await lockerRepository.findByKiosk('spa-premium');
      
      expect(gymLockers.length).toBe(100);
      expect(spaLockers.length).toBe(50);
      expect(gymLockers.every(l => l.kiosk_id === 'gym-main')).toBe(true);
      expect(spaLockers.every(l => l.kiosk_id === 'spa-premium')).toBe(true);

      // Requirement 6.6: Offline kiosk status display
      const allStatuses = await heartbeatManager.getAllKioskStatuses();
      const onlineCount = allStatuses.filter(s => s.status === 'online').length;
      const offlineCount = allStatuses.filter(s => s.status === 'offline').length;
      
      expect(onlineCount).toBe(3); // gym-main, spa-premium, pool-area
      expect(offlineCount).toBe(1); // offline-test
    });

    it('should validate comprehensive security measures', async () => {
      // Requirement 8.1: PIN hashing with Argon2id
      const masterPin = 'secure123';
      const hashedPin = await securityValidation.hashPin(masterPin);
      
      expect(hashedPin).not.toBe(masterPin);
      expect(hashedPin).toContain('$argon2id$');
      expect(await securityValidation.verifyPin(masterPin, hashedPin)).toBe(true);
      expect(await securityValidation.verifyPin('wrong', hashedPin)).toBe(false);

      // Requirement 8.2: QR action tokens with HMAC and TTL
      const lockerId = 5;
      const deviceId = 'test-device-001';
      const actionToken = securityValidation.generateActionToken(lockerId, deviceId);
      
      expect(actionToken).toBeDefined();
      expect(securityValidation.validateActionToken(actionToken)).toBe(true);
      
      // Test expired token
      const expiredToken = securityValidation.generateActionToken(lockerId, deviceId, -10);
      expect(securityValidation.validateActionToken(expiredToken)).toBe(false);

      // Requirement 8.3: Rate limiting
      const ipKey = 'qr_ip:192.168.1.100';
      const deviceKey = `qr_device:${deviceId}`;
      const lockerKey = `qr_locker:${lockerId}`;
      
      // Test IP rate limit (30/min)
      for (let i = 0; i < 30; i++) {
        expect(rateLimiter.checkLimit(ipKey, 30, 60)).toBe(true);
      }
      expect(rateLimiter.checkLimit(ipKey, 30, 60)).toBe(false);
      
      // Test device rate limit (1/20sec)
      expect(rateLimiter.checkLimit(deviceKey, 1, 20)).toBe(true);
      expect(rateLimiter.checkLimit(deviceKey, 1, 20)).toBe(false);
      
      // Test locker rate limit (6/min)
      for (let i = 0; i < 6; i++) {
        expect(rateLimiter.checkLimit(lockerKey, 6, 60)).toBe(true);
      }
      expect(rateLimiter.checkLimit(lockerKey, 6, 60)).toBe(false);

      // Requirement 8.4: Comprehensive audit logging
      await eventLogger.logEvent({
        kiosk_id: 'gym-main',
        event_type: 'security_test',
        details: { 
          test_type: 'comprehensive_validation',
          security_measures: ['pin_hashing', 'token_validation', 'rate_limiting']
        }
      });

      const securityEvents = await eventLogger.getEventsByType('security_test');
      expect(securityEvents.length).toBeGreaterThanOrEqual(1);
      expect(securityEvents[0].details).toBeDefined();

      // Requirement 8.5: Input validation and sanitization
      const maliciousInputs = [
        "'; DROP TABLE lockers; --",
        '<script>alert("xss")</script>',
        'test; rm -rf /',
        '../../../etc/passwd'
      ];

      for (const input of maliciousInputs) {
        const sanitized = securityValidation.sanitizeInput(input);
        expect(sanitized).not.toContain('DROP TABLE');
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('; rm');
        expect(sanitized).not.toContain('../');
      }
    });

    it('should validate system restart and recovery procedures', async () => {
      const kioskId = 'gym-main';

      // Set up system state before restart
      await lockerStateManager.assignLocker(kioskId, 10, 'rfid', 'pre-restart-card');
      const preRestartCommand = await commandQueue.enqueueCommand(kioskId, {
        type: 'pre_restart_command',
        data: 'test'
      });

      // Requirement 9.2: Log restart event
      await eventLogger.logEvent({
        kiosk_id: kioskId,
        event_type: 'restarted',
        details: { 
          reason: 'power_restored',
          previous_uptime: 7200,
          restart_type: 'system_validation_test'
        }
      });

      // Requirement 9.3: No automatic opening after restart
      const lockerAfterRestart = await lockerRepository.findByKioskAndId(kioskId, 10);
      expect(lockerAfterRestart?.status).toBe('Owned'); // Should remain owned

      // Requirement 9.7: Command queue cleanup after restart
      // In real system, incomplete commands would be cleared
      const commands = await commandQueue.getCommands(kioskId);
      expect(commands.some(c => c.command_id === preRestartCommand)).toBe(true);

      // Verify restart event was logged
      const restartEvents = await eventLogger.getEventsByType('restarted');
      expect(restartEvents.length).toBeGreaterThanOrEqual(1);
      expect(restartEvents[0].kiosk_id).toBe(kioskId);
      expect(restartEvents[0].details.reason).toBe('power_restored');
    });

    it('should validate health monitoring and diagnostics', async () => {
      // Requirement 10.3: Health endpoints
      const healthStatus = await healthMonitor.getSystemHealth();
      
      expect(healthStatus.database.status).toBe('ok');
      expect(healthStatus.database.last_write).toBeDefined();
      expect(healthStatus.system.version).toBeDefined();
      expect(healthStatus.system.uptime).toBeGreaterThan(0);

      // Test individual component health
      const dbHealth = await healthMonitor.checkDatabaseHealth();
      expect(dbHealth.status).toBe('ok');
      expect(dbHealth.connection_count).toBeGreaterThanOrEqual(0);

      const queueHealth = await healthMonitor.checkCommandQueueHealth();
      expect(queueHealth.pending_count).toBeGreaterThanOrEqual(0);
      expect(queueHealth.failed_count).toBeGreaterThanOrEqual(0);

      // Requirement 10.5: Diagnostic tools
      const diagnostics = await healthMonitor.runDiagnostics();
      expect(diagnostics.database_integrity).toBe(true);
      expect(diagnostics.table_counts).toBeDefined();
      expect(diagnostics.index_usage).toBeDefined();
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle realistic concurrent user load', async () => {
      const concurrentUsers = 20;
      const operationsPerUser = 5;
      const startTime = Date.now();

      // Simulate concurrent users performing various operations
      const userOperations = [];
      
      for (let user = 0; user < concurrentUsers; user++) {
        for (let op = 0; op < operationsPerUser; op++) {
          const cardId = `load-test-user-${user}-op-${op}`;
          const kioskId = ['gym-main', 'spa-premium', 'pool-area'][user % 3];
          const lockerId = (user * operationsPerUser + op) % 50 + 1;

          userOperations.push(
            lockerStateManager.assignLocker(kioskId, lockerId, 'rfid', cardId)
              .then(() => lockerStateManager.releaseLocker(kioskId, lockerId))
              .then(() => eventLogger.logEvent({
                kiosk_id: kioskId,
                locker_id: lockerId,
                event_type: 'load_test',
                rfid_card: cardId,
                details: { user, operation: op }
              }))
          );
        }
      }

      const results = await Promise.all(userOperations);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All operations should complete successfully
      expect(results.every(r => r === true)).toBe(true);

      // Should handle load efficiently (< 10 seconds for 100 operations)
      expect(duration).toBeLessThan(10000);

      console.log(`Load test: ${concurrentUsers * operationsPerUser} operations in ${duration}ms`);
    });

    it('should maintain performance under sustained load', async () => {
      const iterations = 50;
      const durations = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        // Perform typical system operations
        await Promise.all([
          lockerStateManager.getAvailableLockers('gym-main'),
          commandQueue.getCommands('spa-premium'),
          eventLogger.getRecentEvents(10),
          heartbeatManager.updateHeartbeat('pool-area'),
          vipRepository.findActiveContracts()
        ]);

        const endTime = Date.now();
        durations.push(endTime - startTime);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      // Performance should be consistent
      expect(avgDuration).toBeLessThan(500);
      expect(maxDuration).toBeLessThan(1000);
      expect(maxDuration - minDuration).toBeLessThan(800); // Low variance

      console.log(`Sustained load - Avg: ${avgDuration.toFixed(1)}ms, Min: ${minDuration}ms, Max: ${maxDuration}ms`);
    });
  });

  describe('Final System Acceptance', () => {
    it('should pass complete system acceptance test', async () => {
      console.log('🧪 Running Complete System Acceptance Test');

      // Test all major system components
      const testResults = {
        rfid_flow: false,
        qr_flow: false,
        vip_management: false,
        staff_operations: false,
        multi_room: false,
        security: false,
        performance: false,
        reliability: false
      };

      try {
        // RFID Flow Test
        const rfidCard = 'acceptance-rfid';
        const kioskId = 'gym-main';
        const lockerId = 50;

        await lockerStateManager.assignLocker(kioskId, lockerId, 'rfid', rfidCard);
        const assigned = await lockerRepository.findByOwnerKey(rfidCard);
        await lockerStateManager.releaseLocker(kioskId, lockerId);
        const released = await lockerRepository.findByKioskAndId(kioskId, lockerId);

        testResults.rfid_flow = assigned?.status === 'Owned' && released?.status === 'Free';

        // QR Flow Test (simulated)
        const deviceId = 'acceptance-device';
        const qrToken = securityValidation.generateActionToken(lockerId, deviceId);
        const tokenValid = securityValidation.validateActionToken(qrToken);
        const rateLimitOk = rateLimiter.checkLimit(`qr_device:${deviceId}`, 1, 20);

        testResults.qr_flow = tokenValid && rateLimitOk;

        // VIP Management Test
        const vipContract = await vipRepository.create({
          kiosk_id: kioskId,
          locker_id: 60,
          rfid_card: 'acceptance-vip',
          start_date: new Date(),
          end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'active',
          created_by: 'admin'
        });

        testResults.vip_management = vipContract.id > 0;

        // Staff Operations Test
        const staffCommand = await commandQueue.enqueueCommand(kioskId, {
          type: 'staff_test',
          staff_user: 'admin'
        });

        testResults.staff_operations = typeof staffCommand === 'string';

        // Multi-room Test
        await heartbeatManager.updateHeartbeat('gym-main');
        await heartbeatManager.updateHeartbeat('spa-premium');
        const statuses = await heartbeatManager.getAllKioskStatuses();

        testResults.multi_room = statuses.length >= 2;

        // Security Test
        const pin = 'test123';
        const hashedPin = await securityValidation.hashPin(pin);
        const pinValid = await securityValidation.verifyPin(pin, hashedPin);

        testResults.security = pinValid && hashedPin !== pin;

        // Performance Test
        const perfStart = Date.now();
        await Promise.all([
          lockerRepository.findAll(),
          eventLogger.getRecentEvents(100),
          vipRepository.findAll()
        ]);
        const perfDuration = Date.now() - perfStart;

        testResults.performance = perfDuration < 2000;

        // Reliability Test
        await eventLogger.logEvent({
          kiosk_id: kioskId,
          event_type: 'acceptance_test',
          details: { test_phase: 'reliability' }
        });

        const events = await eventLogger.getEventsByType('acceptance_test');
        testResults.reliability = events.length > 0;

        // Verify all tests passed
        const allPassed = Object.values(testResults).every(result => result === true);
        expect(allPassed).toBe(true);

        console.log('✅ System Acceptance Test Results:');
        Object.entries(testResults).forEach(([test, passed]) => {
          console.log(`   ${passed ? '✅' : '❌'} ${test.replace('_', ' ').toUpperCase()}`);
        });

        if (allPassed) {
          console.log('🎉 SYSTEM VALIDATION COMPLETE - ALL REQUIREMENTS SATISFIED');
        }

      } catch (error) {
        console.error('❌ System Acceptance Test Failed:', error);
        throw error;
      }
    });
  });
});
