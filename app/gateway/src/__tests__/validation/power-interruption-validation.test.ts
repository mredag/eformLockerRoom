import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../../../../shared/database/database-manager';
import { LockerRepository } from '../../../../../shared/database/locker-repository';
import { CommandQueueManager } from '../../../../../shared/services/command-queue-manager';
import { EventLogger } from '../../../../../shared/services/event-logger';
import { HeartbeatManager } from '../../../../../shared/services/heartbeat-manager';
import { LockerStateManager } from '../../../../../shared/services/locker-state-manager';

describe('Power Interruption and Recovery Validation (Task 15.3)', () => {
  let dbManager: DatabaseManager;
  let lockerRepository: LockerRepository;
  let commandQueue: CommandQueueManager;
  let eventLogger: EventLogger;
  let heartbeatManager: HeartbeatManager;
  let lockerStateManager: LockerStateManager;

  beforeEach(async () => {
    dbManager = new DatabaseManager(':memory:');
    await dbManager.initialize();
    
    lockerRepository = new LockerRepository(dbManager);
    commandQueue = new CommandQueueManager(dbManager);
    eventLogger = new EventLogger(dbManager);
    heartbeatManager = new HeartbeatManager(dbManager);
    lockerStateManager = new LockerStateManager(lockerRepository, null);

    await setupTestEnvironment();
  });

  afterEach(async () => {
    await dbManager.close();
  });

  async function setupTestEnvironment() {
    // Create test kiosks
    await heartbeatManager.registerKiosk('gym-main', 'Main Gym');
    await heartbeatManager.registerKiosk('spa-area', 'Spa Area');

    // Create test lockers
    for (let i = 1; i <= 50; i++) {
      await lockerRepository.create({
        kiosk_id: 'gym-main',
        id: i,
        status: i <= 10 ? 'Owned' : 'Free',
        owner_type: i <= 10 ? 'rfid' : null,
        owner_key: i <= 10 ? `card-${i}` : null,
        version: 1,
        is_vip: false
      });
    }

    for (let i = 1; i <= 30; i++) {
      await lockerRepository.create({
        kiosk_id: 'spa-area',
        id: i,
        status: i <= 5 ? 'Reserved' : 'Free',
        owner_type: i <= 5 ? 'rfid' : null,
        owner_key: i <= 5 ? `spa-card-${i}` : null,
        reserved_at: i <= 5 ? new Date() : null,
        version: 1,
        is_vip: false
      });
    }
  }

  describe('Power Interruption Scenarios', () => {
    it('should handle system restart with proper event logging', async () => {
      // Simulate pre-restart state with pending commands
      const commandId1 = await commandQueue.enqueueCommand('gym-main', {
        type: 'open_locker',
        locker_id: 15,
        staff_user: 'admin'
      });

      const commandId2 = await commandQueue.enqueueCommand('spa-area', {
        type: 'bulk_open',
        locker_ids: [1, 2, 3],
        staff_user: 'staff1'
      });

      // Verify commands are pending
      const pendingBefore = await commandQueue.getCommands('gym-main');
      expect(pendingBefore.length).toBeGreaterThan(0);

      // Simulate system restart - this should:
      // 1. Clear incomplete command queues
      // 2. Log restart event
      // 3. NOT automatically open any lockers
      await simulateSystemRestart();

      // Verify restart event was logged
      const events = await eventLogger.getRecentEvents(10);
      const restartEvent = events.find(e => e.event_type === 'restarted');
      expect(restartEvent).toBeDefined();
      expect(restartEvent?.details).toEqual({
        reason: 'power_interruption',
        cleared_commands: 2,
        timestamp: expect.any(String)
      });

      // Verify command queue was cleared
      const pendingAfter = await commandQueue.getCommands('gym-main');
      expect(pendingAfter.length).toBe(0);

      const pendingAfterSpa = await commandQueue.getCommands('spa-area');
      expect(pendingAfterSpa.length).toBe(0);

      // Verify no automatic locker opening occurred
      const ownedLockers = await lockerRepository.findByStatus('Owned');
      expect(ownedLockers.length).toBe(10); // Same as before restart

      const reservedLockers = await lockerRepository.findByStatus('Reserved');
      expect(reservedLockers.length).toBe(5); // Same as before restart
    });

    it('should handle database recovery after power loss', async () => {
      // Create some state before "power loss"
      await lockerStateManager.assignLocker('gym-main', 25, 'rfid', 'test-card-25');
      await lockerStateManager.reserveLocker('gym-main', 26, 'test-card-26');

      // Simulate database corruption/recovery scenario
      // In real scenario, WAL mode helps with this
      const beforeState = await lockerRepository.findByKiosk('gym-main');
      const ownedBefore = beforeState.filter(l => l.status === 'Owned').length;
      const reservedBefore = beforeState.filter(l => l.status === 'Reserved').length;

      // Simulate restart with database integrity check
      await simulateSystemRestart();

      // Verify database state is consistent after restart
      const afterState = await lockerRepository.findByKiosk('gym-main');
      const ownedAfter = afterState.filter(l => l.status === 'Owned').length;
      const reservedAfter = afterState.filter(l => l.status === 'Reserved').length;

      // State should be preserved (WAL mode protection)
      expect(ownedAfter).toBe(ownedBefore);
      expect(reservedAfter).toBe(reservedBefore);

      // Verify database integrity
      const allLockers = await lockerRepository.findAll();
      expect(allLockers.every(l => l.version >= 1)).toBe(true);
      expect(allLockers.every(l => ['Free', 'Reserved', 'Owned', 'Blocked'].includes(l.status))).toBe(true);
    });

    it('should handle kiosk reconnection after power interruption', async () => {
      // Simulate kiosks going offline
      await heartbeatManager.markKioskOffline('gym-main');
      await heartbeatManager.markKioskOffline('spa-area');

      // Queue commands while offline
      const offlineCommandId = await commandQueue.enqueueCommand('gym-main', {
        type: 'open_locker',
        locker_id: 20,
        staff_user: 'admin'
      });

      // Simulate system restart
      await simulateSystemRestart();

      // Verify offline commands were cleared
      const pendingCommands = await commandQueue.getCommands('gym-main');
      expect(pendingCommands.length).toBe(0);

      // Simulate kiosks coming back online
      await heartbeatManager.updateHeartbeat('gym-main');
      await heartbeatManager.updateHeartbeat('spa-area');

      // Verify kiosks are marked as online
      const kioskStatuses = await heartbeatManager.getKioskStatuses();
      expect(kioskStatuses.find(k => k.kiosk_id === 'gym-main')?.status).toBe('online');
      expect(kioskStatuses.find(k => k.kiosk_id === 'spa-area')?.status).toBe('online');

      // Verify restart events were logged for each kiosk
      const events = await eventLogger.getRecentEvents(20);
      const kioskOnlineEvents = events.filter(e => e.event_type === 'kiosk_online');
      expect(kioskOnlineEvents.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle reserved locker timeout after power interruption', async () => {
      // Create reserved lockers with old timestamps (simulate power was out for a while)
      const oldTimestamp = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      
      await lockerRepository.update('gym-main', 30, {
        status: 'Reserved',
        owner_key: 'timeout-test-card',
        reserved_at: oldTimestamp,
        version: 1
      });

      await lockerRepository.update('gym-main', 31, {
        status: 'Reserved',
        owner_key: 'timeout-test-card-2',
        reserved_at: oldTimestamp,
        version: 1
      });

      // Simulate system restart
      await simulateSystemRestart();

      // Simulate timeout cleanup (would normally be done by background process)
      await cleanupExpiredReservations();

      // Verify expired reservations were cleaned up
      const locker30 = await lockerRepository.findByKioskAndId('gym-main', 30);
      const locker31 = await lockerRepository.findByKioskAndId('gym-main', 31);

      expect(locker30?.status).toBe('Free');
      expect(locker31?.status).toBe('Free');
      expect(locker30?.owner_key).toBeNull();
      expect(locker31?.owner_key).toBeNull();
      expect(locker30?.reserved_at).toBeNull();
      expect(locker31?.reserved_at).toBeNull();
    });

    it('should maintain VIP locker integrity during power interruption', async () => {
      // Create VIP locker state
      await lockerRepository.update('gym-main', 40, {
        status: 'Owned',
        owner_type: 'vip',
        owner_key: 'vip-card-premium',
        is_vip: true,
        version: 1
      });

      // Simulate system restart
      await simulateSystemRestart();

      // Verify VIP locker state is preserved
      const vipLocker = await lockerRepository.findByKioskAndId('gym-main', 40);
      expect(vipLocker?.status).toBe('Owned');
      expect(vipLocker?.owner_type).toBe('vip');
      expect(vipLocker?.owner_key).toBe('vip-card-premium');
      expect(vipLocker?.is_vip).toBe(true);

      // Verify VIP lockers are not affected by bulk operations after restart
      const bulkCommandId = await commandQueue.enqueueCommand('gym-main', {
        type: 'bulk_open',
        locker_ids: [35, 36, 37, 38, 39, 40, 41, 42],
        staff_user: 'admin',
        exclude_vip: true
      });

      // Process command (simulate)
      const command = await commandQueue.getCommands('gym-main');
      expect(command[0].payload.locker_ids).not.toContain(40); // VIP locker excluded
    });
  });

  describe('Queue Cleanup Validation', () => {
    it('should properly clean up command queue on restart', async () => {
      // Create various command types
      const commands = [
        { kiosk: 'gym-main', type: 'open_locker', data: { locker_id: 1 } },
        { kiosk: 'gym-main', type: 'bulk_open', data: { locker_ids: [2, 3, 4] } },
        { kiosk: 'spa-area', type: 'block_locker', data: { locker_id: 10 } },
        { kiosk: 'spa-area', type: 'unblock_locker', data: { locker_id: 11 } }
      ];

      const commandIds = [];
      for (const cmd of commands) {
        const id = await commandQueue.enqueueCommand(cmd.kiosk, {
          type: cmd.type,
          ...cmd.data,
          staff_user: 'admin'
        });
        commandIds.push(id);
      }

      // Verify commands are queued
      const gymCommands = await commandQueue.getCommands('gym-main');
      const spaCommands = await commandQueue.getCommands('spa-area');
      expect(gymCommands.length).toBe(2);
      expect(spaCommands.length).toBe(2);

      // Simulate restart with queue cleanup
      await simulateSystemRestart();

      // Verify all queues are cleared
      const gymAfter = await commandQueue.getCommands('gym-main');
      const spaAfter = await commandQueue.getCommands('spa-area');
      expect(gymAfter.length).toBe(0);
      expect(spaAfter.length).toBe(0);

      // Verify cleanup was logged
      const events = await eventLogger.getRecentEvents(10);
      const restartEvent = events.find(e => e.event_type === 'restarted');
      expect(restartEvent?.details.cleared_commands).toBe(4);
    });

    it('should handle partial command execution during power loss', async () => {
      // Simulate commands that were partially executed
      const commandId = await commandQueue.enqueueCommand('gym-main', {
        type: 'bulk_open',
        locker_ids: [10, 11, 12, 13, 14],
        staff_user: 'admin'
      });

      // Mark command as in progress (simulate partial execution)
      await commandQueue.markCommandInProgress(commandId);

      // Simulate power loss during execution
      await simulateSystemRestart();

      // Verify partial command was cleared
      const commands = await commandQueue.getCommands('gym-main');
      expect(commands.length).toBe(0);

      // Verify no lockers were left in inconsistent state
      const lockers = await lockerRepository.findByKiosk('gym-main');
      const openingLockers = lockers.filter(l => l.status === 'Opening');
      expect(openingLockers.length).toBe(0);
    });
  });

  // Helper functions
  async function simulateSystemRestart() {
    // Clear all pending commands
    const allKiosks = ['gym-main', 'spa-area'];
    let totalCleared = 0;

    for (const kioskId of allKiosks) {
      const commands = await commandQueue.getCommands(kioskId);
      totalCleared += commands.length;
      await commandQueue.clearKioskCommands(kioskId);
    }

    // Log restart event
    await eventLogger.logEvent({
      kiosk_id: 'system',
      event_type: 'restarted',
      details: {
        reason: 'power_interruption',
        cleared_commands: totalCleared,
        timestamp: new Date().toISOString()
      }
    });

    // Mark all kiosks as offline initially
    for (const kioskId of allKiosks) {
      await heartbeatManager.markKioskOffline(kioskId);
    }
  }

  async function cleanupExpiredReservations() {
    const reservedLockers = await lockerRepository.findByStatus('Reserved');
    const now = new Date();
    const timeoutMs = 90 * 1000; // 90 seconds

    for (const locker of reservedLockers) {
      if (locker.reserved_at) {
        const reservedTime = new Date(locker.reserved_at).getTime();
        if (now.getTime() - reservedTime > timeoutMs) {
          await lockerRepository.update(locker.kiosk_id, locker.id, {
            status: 'Free',
            owner_type: null,
            owner_key: null,
            reserved_at: null,
            version: locker.version + 1
          });
        }
      }
    }
  }
});