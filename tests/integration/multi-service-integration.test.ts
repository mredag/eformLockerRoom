import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../shared/database/database-manager';
import { LockerStateManager } from '../../shared/services/locker-state-manager';
import { CommandQueueManager } from '../../shared/services/command-queue-manager';
import { HeartbeatManager } from '../../shared/services/heartbeat-manager';
import { EventLogger } from '../../shared/services/event-logger';
import { VipContractRepository } from '../../shared/database/vip-contract-repository';
import { LockerRepository } from '../../shared/database/locker-repository';
import { EventRepository } from '../../shared/database/event-repository';
import { EventType } from '../../shared/types/core-entities';

describe('Multi-Service Integration Tests', () => {
  let dbManager: DatabaseManager;
  let lockerStateManager: LockerStateManager;
  let commandQueue: CommandQueueManager;
  let heartbeatManager: HeartbeatManager;
  let eventLogger: EventLogger;
  let vipRepository: VipContractRepository;
  let lockerRepository: LockerRepository;

  beforeEach(async () => {
    // Initialize database manager with in-memory database and correct migrations path
    dbManager = DatabaseManager.getInstance({ 
      path: ':memory:',
      migrationsPath: '../../migrations'
    });
    await dbManager.initialize();
    
    const dbConnection = dbManager.getConnection();
    
    // Initialize services
    lockerRepository = new LockerRepository(dbConnection);
    vipRepository = new VipContractRepository(dbConnection);
    const eventRepository = new EventRepository(dbConnection);
    
    lockerStateManager = new LockerStateManager(lockerRepository, vipRepository);
    commandQueue = new CommandQueueManager(dbConnection);
    heartbeatManager = new HeartbeatManager({}, undefined, dbConnection);
    eventLogger = new EventLogger(eventRepository);

    // Setup test data - multiple rooms
    await setupMultiRoomTestData();
  });

  afterEach(async () => {
    await dbManager.close();
    DatabaseManager.resetAllInstances();
  });

  async function setupMultiRoomTestData() {
    // Room A - 30 lockers
    for (let i = 1; i <= 30; i++) {
      await lockerRepository.create({
        kiosk_id: 'room-a',
        id: i,
        status: 'Free',
        is_vip: false
      });
    }

    // Room B - 16 lockers
    for (let i = 1; i <= 16; i++) {
      await lockerRepository.create({
        kiosk_id: 'room-b',
        id: i,
        status: 'Free',
        is_vip: false
      });
    }

    // Room C - 20 lockers
    for (let i = 1; i <= 20; i++) {
      await lockerRepository.create({
        kiosk_id: 'room-c',
        id: i,
        status: 'Free',
        is_vip: false
      });
    }

    // Register kiosks
    await heartbeatManager.registerKiosk('room-a', 'Zone A', '1.0.0');
    await heartbeatManager.registerKiosk('room-b', 'Zone B', '1.0.0');
    await heartbeatManager.registerKiosk('room-c', 'Zone C', '1.0.0');
  }

  describe('Multi-Room Locker Operations', () => {
    it('should handle cross-room locker assignments', async () => {
      const cardId = 'test-card-001';

      // Assign locker in room A
      const availableA = await lockerStateManager.getAvailableLockers('room-a');
      expect(availableA).toHaveLength(30);

      const assigned = await lockerStateManager.assignLocker('room-a', 1, 'rfid', cardId);
      expect(assigned).toBe(true);

      // Verify locker is owned
      const locker = await lockerRepository.findByKioskAndId('room-a', 1);
      expect(locker?.status).toBe('Owned');
      expect(locker?.owner_key).toBe(cardId);

      // Check that same card cannot be assigned in other rooms
      const existingOwnership = await lockerRepository.findByOwnerKey(cardId);
      expect(existingOwnership).toBeTruthy();
      expect(existingOwnership?.kiosk_id).toBe('room-a');

      // Available lockers in room A should be reduced
      const availableAfter = await lockerStateManager.getAvailableLockers('room-a');
      expect(availableAfter).toHaveLength(29);

      // Other rooms should still have all lockers available
      const availableB = await lockerStateManager.getAvailableLockers('room-b');
      const availableC = await lockerStateManager.getAvailableLockers('room-c');
      expect(availableB).toHaveLength(16);
      expect(availableC).toHaveLength(20);
    });

    it('should handle VIP locker operations across rooms', async () => {
      const vipCard = 'vip-card-001';
      
      // Create VIP contract in room B
      const contract = await vipRepository.create({
        kiosk_id: 'room-b',
        locker_id: 5,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: 'active',
        created_by: 'admin'
      });

      expect(contract.id).toBeDefined();

      // Mark locker as VIP
      const vipLocker = await lockerRepository.findByKioskAndId('room-b', 5);
      await lockerRepository.update('room-b', 5, {
        is_vip: true,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: vipCard
      }, vipLocker!.version);

      // VIP locker should not appear in available list
      const available = await lockerStateManager.getAvailableLockers('room-b');
      expect(available).toHaveLength(15);
      expect(available.find(l => l.id === 5)).toBeUndefined();

      // VIP locker should be accessible by VIP card
      const vipLockerCheck = await lockerRepository.findByOwnerKey(vipCard);
      expect(vipLockerCheck?.kiosk_id).toBe('room-b');
      expect(vipLockerCheck?.id).toBe(5);
      expect(vipLockerCheck?.is_vip).toBe(true);
    });
  });

  describe('Command Queue Cross-Room Coordination', () => {
    it('should queue and execute commands for multiple rooms', async () => {
      // Queue commands for different rooms
      const commandA = await commandQueue.enqueueCommand('room-a', 'open_locker', {
        open_locker: {
          locker_id: 1,
          staff_user: 'admin',
          reason: 'test'
        }
      });

      const commandB = await commandQueue.enqueueCommand('room-b', 'open_locker', {
        open_locker: {
          locker_id: 2,
          staff_user: 'admin',
          reason: 'test'
        }
      });

      const commandC = await commandQueue.enqueueCommand('room-c', 'bulk_open', {
        bulk_open: {
          locker_ids: [1, 2, 3],
          staff_user: 'admin',
          exclude_vip: true,
          interval_ms: 300
        }
      });

      // Each room should have its own commands
      const commandsA = await commandQueue.getPendingCommands('room-a');
      const commandsB = await commandQueue.getPendingCommands('room-b');
      const commandsC = await commandQueue.getPendingCommands('room-c');

      expect(commandsA).toHaveLength(1);
      expect(commandsB).toHaveLength(1);
      expect(commandsC).toHaveLength(1);

      expect(commandsA[0].command_id).toBe(commandA);
      expect(commandsB[0].command_id).toBe(commandB);
      expect(commandsC[0].command_id).toBe(commandC);

      // Mark commands as complete
      await commandQueue.markCommandCompleted(commandA);
      await commandQueue.markCommandCompleted(commandB);
      await commandQueue.markCommandCompleted(commandC);

      // Queues should be empty
      const emptyA = await commandQueue.getPendingCommands('room-a');
      const emptyB = await commandQueue.getPendingCommands('room-b');
      const emptyC = await commandQueue.getPendingCommands('room-c');

      expect(emptyA).toHaveLength(0);
      expect(emptyB).toHaveLength(0);
      expect(emptyC).toHaveLength(0);
    });

    it('should handle command failures and retries per room', async () => {
      const commandId = await commandQueue.enqueueCommand('room-a', 'open_locker', {
        open_locker: {
          locker_id: 1,
          staff_user: 'admin'
        }
      });

      // Simulate command failure
      await commandQueue.markCommandFailed(commandId, 'Hardware error');

      // Command should be available for retry
      const commands = await commandQueue.getPendingCommands('room-a');
      expect(commands).toHaveLength(1);
      expect(commands[0].status).toBe('failed');
      expect(commands[0].retry_count).toBe(1);
      expect(commands[0].last_error).toBe('Hardware error');

      // Other rooms should not be affected
      const commandsB = await commandQueue.getPendingCommands('room-b');
      const commandsC = await commandQueue.getPendingCommands('room-c');
      expect(commandsB).toHaveLength(0);
      expect(commandsC).toHaveLength(0);
    });
  });

  describe('Heartbeat and Kiosk Management', () => {
    it('should track multiple kiosk heartbeats', async () => {
      // Update heartbeats
      await heartbeatManager.updateHeartbeat('room-a', 'Zone A');
      await heartbeatManager.updateHeartbeat('room-b', 'Zone B');
      await heartbeatManager.updateHeartbeat('room-c', 'Zone C');

      // All kiosks should be online
      const kiosks = await heartbeatManager.getAllKiosks();
      expect(kiosks).toHaveLength(3);

      const roomA = kiosks.find(k => k.kiosk_id === 'room-a');
      const roomB = kiosks.find(k => k.kiosk_id === 'room-b');
      const roomC = kiosks.find(k => k.kiosk_id === 'room-c');

      expect(roomA?.status).toBe('online');
      expect(roomB?.status).toBe('online');
      expect(roomC?.status).toBe('online');
      expect(roomA?.zone).toBe('Zone A');
      expect(roomB?.zone).toBe('Zone B');
      expect(roomC?.zone).toBe('Zone C');
    });

    it('should detect offline kiosks independently', async () => {
      // Set up initial heartbeats
      await heartbeatManager.updateHeartbeat('room-a', 'Zone A');
      await heartbeatManager.updateHeartbeat('room-b', 'Zone B');
      await heartbeatManager.updateHeartbeat('room-c', 'Zone C');

      // Simulate room-b going offline by not updating heartbeat
      // Update only room-a and room-c
      await new Promise(resolve => setTimeout(resolve, 100));
      await heartbeatManager.updateHeartbeat('room-a', 'Zone A');
      await heartbeatManager.updateHeartbeat('room-c', 'Zone C');

      // Check offline detection (using a very short threshold for testing)
      const offlineKiosks = await heartbeatManager.getOfflineKiosks(0.05); // 50ms threshold
      
      // room-b should be detected as offline
      expect(offlineKiosks.some(k => k.kiosk_id === 'room-b')).toBe(true);
      expect(offlineKiosks.some(k => k.kiosk_id === 'room-a')).toBe(false);
      expect(offlineKiosks.some(k => k.kiosk_id === 'room-c')).toBe(false);
    });
  });

  describe('Event Logging Across Rooms', () => {
    it('should log events with proper room identification', async () => {
      // Log events in different rooms
      await eventLogger.logEvent(
        'room-a',
        EventType.RFID_ASSIGN,
        { previous_status: 'Free' },
        1,
        'card-001'
      );

      await eventLogger.logEvent(
        'room-b',
        EventType.STAFF_OPEN,
        { reason: 'user assistance' },
        5,
        undefined,
        undefined,
        'admin'
      );

      await eventLogger.logEvent(
        'room-c',
        EventType.BULK_OPEN,
        { total_count: 5, success_count: 5 },
        undefined,
        undefined,
        undefined,
        'admin'
      );

      // Query events by room
      const eventsA = await eventLogger.queryEvents({ kiosk_id: 'room-a' });
      const eventsB = await eventLogger.queryEvents({ kiosk_id: 'room-b' });
      const eventsC = await eventLogger.queryEvents({ kiosk_id: 'room-c' });

      expect(eventsA).toHaveLength(1);
      expect(eventsB).toHaveLength(1);
      expect(eventsC).toHaveLength(1);

      expect(eventsA[0].event_type).toBe(EventType.RFID_ASSIGN);
      expect(eventsB[0].event_type).toBe(EventType.STAFF_OPEN);
      expect(eventsC[0].event_type).toBe(EventType.BULK_OPEN);
    });
  });

  describe('Staff Management Workflows', () => {
    it('should handle bulk operations across multiple rooms', async () => {
      // Assign some lockers first
      await lockerStateManager.assignLocker('room-a', 1, 'rfid', 'card-001');
      await lockerStateManager.assignLocker('room-a', 2, 'rfid', 'card-002');
      await lockerStateManager.assignLocker('room-b', 1, 'rfid', 'card-003');
      await lockerStateManager.assignLocker('room-c', 1, 'rfid', 'card-004');

      // Queue bulk open commands for each room
      const bulkCommandA = await commandQueue.enqueueCommand('room-a', 'bulk_open', {
        bulk_open: {
          locker_ids: [1, 2],
          staff_user: 'admin',
          exclude_vip: true,
          interval_ms: 300
        }
      });

      const bulkCommandB = await commandQueue.enqueueCommand('room-b', 'bulk_open', {
        bulk_open: {
          locker_ids: [1],
          staff_user: 'admin',
          exclude_vip: true,
          interval_ms: 300
        }
      });

      const bulkCommandC = await commandQueue.enqueueCommand('room-c', 'bulk_open', {
        bulk_open: {
          locker_ids: [1],
          staff_user: 'admin',
          exclude_vip: true,
          interval_ms: 300
        }
      });

      // Verify commands are queued properly
      const commandsA = await commandQueue.getPendingCommands('room-a');
      const commandsB = await commandQueue.getPendingCommands('room-b');
      const commandsC = await commandQueue.getPendingCommands('room-c');

      expect(commandsA[0].payload).toContain('locker_ids');
      expect(commandsB[0].payload).toContain('locker_ids');
      expect(commandsC[0].payload).toContain('locker_ids');

      // Simulate execution
      await commandQueue.markCommandCompleted(bulkCommandA);
      await commandQueue.markCommandCompleted(bulkCommandB);
      await commandQueue.markCommandCompleted(bulkCommandC);

      // Log bulk operations
      await eventLogger.logEvent(
        'room-a',
        EventType.BULK_OPEN,
        { total_count: 2, success_count: 2, failed_lockers: [] },
        undefined,
        undefined,
        undefined,
        'admin'
      );

      await eventLogger.logEvent(
        'room-b',
        EventType.BULK_OPEN,
        { total_count: 1, success_count: 1, failed_lockers: [] },
        undefined,
        undefined,
        undefined,
        'admin'
      );

      await eventLogger.logEvent(
        'room-c',
        EventType.BULK_OPEN,
        { total_count: 1, success_count: 1, failed_lockers: [] },
        undefined,
        undefined,
        undefined,
        'admin'
      );

      // Verify events were logged
      const bulkEvents = await eventLogger.queryEvents({ event_type: EventType.BULK_OPEN });
      expect(bulkEvents).toHaveLength(3);
      
      const roomEvents = bulkEvents.reduce((acc, event) => {
        acc[event.kiosk_id] = (acc[event.kiosk_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(roomEvents['room-a']).toBe(1);
      expect(roomEvents['room-b']).toBe(1);
      expect(roomEvents['room-c']).toBe(1);
    });

    it('should handle VIP contract management across rooms', async () => {
      // Create VIP contracts in different rooms
      const contractA = await vipRepository.create({
        kiosk_id: 'room-a',
        locker_id: 10,
        rfid_card: 'vip-001',
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: 'admin'
      });

      const contractB = await vipRepository.create({
        kiosk_id: 'room-b',
        locker_id: 5,
        rfid_card: 'vip-002',
        start_date: new Date(),
        end_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: 'admin'
      });

      // Update lockers to VIP status
      const vipLockerA = await lockerRepository.findByKioskAndId('room-a', 10);
      await lockerRepository.update('room-a', 10, {
        is_vip: true,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: 'vip-001'
      }, vipLockerA!.version);

      const vipLockerB = await lockerRepository.findByKioskAndId('room-b', 5);
      await lockerRepository.update('room-b', 5, {
        is_vip: true,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: 'vip-002'
      }, vipLockerB!.version);

      // Verify VIP contracts are active
      const activeContracts = await vipRepository.findActiveContracts();
      expect(activeContracts).toHaveLength(2);

      const contractsByRoom = activeContracts.reduce((acc, contract) => {
        acc[contract.kiosk_id] = (acc[contract.kiosk_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(contractsByRoom['room-a']).toBe(1);
      expect(contractsByRoom['room-b']).toBe(1);

      // Verify VIP lockers are excluded from available lists
      const availableA = await lockerStateManager.getAvailableLockers('room-a');
      const availableB = await lockerStateManager.getAvailableLockers('room-b');

      expect(availableA).toHaveLength(29); // 30 - 1 VIP
      expect(availableB).toHaveLength(15); // 16 - 1 VIP
      expect(availableA.find(l => l.id === 10)).toBeUndefined();
      expect(availableB.find(l => l.id === 5)).toBeUndefined();
    });
  });

  describe('System Resilience and Recovery', () => {
    it('should handle service restart scenarios', async () => {
      // Simulate system with active operations
      await lockerStateManager.assignLocker('room-a', 1, 'rfid', 'card-001');
      await lockerStateManager.reserveLocker('room-b', 2, 'card-002');
      
      // Queue some commands
      const commandId = await commandQueue.enqueueCommand('room-c', 'open_locker', {
        open_locker: {
          locker_id: 3,
          staff_user: 'admin'
        }
      });

      // Log restart event
      await eventLogger.logEvent(
        'room-a',
        EventType.SYSTEM_RESTARTED,
        { reason: 'system_restart', previous_uptime: 3600 }
      );

      await eventLogger.logEvent(
        'room-b',
        EventType.SYSTEM_RESTARTED,
        { reason: 'system_restart', previous_uptime: 3600 }
      );

      await eventLogger.logEvent(
        'room-c',
        EventType.SYSTEM_RESTARTED,
        { reason: 'system_restart', previous_uptime: 3600 }
      );

      // Verify restart events were logged
      const restartEvents = await eventLogger.queryEvents({ event_type: EventType.SYSTEM_RESTARTED });
      expect(restartEvents).toHaveLength(3);

      // Verify system state is maintained
      const locker1 = await lockerRepository.findByKioskAndId('room-a', 1);
      const locker2 = await lockerRepository.findByKioskAndId('room-b', 2);
      
      expect(locker1?.status).toBe('Owned');
      expect(locker2?.status).toBe('Reserved');

      // Verify command queue is maintained
      const commands = await commandQueue.getPendingCommands('room-c');
      expect(commands).toHaveLength(1);
      expect(commands[0].command_id).toBe(commandId);
    });
  });
});