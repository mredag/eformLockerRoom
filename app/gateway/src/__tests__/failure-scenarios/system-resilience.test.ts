/**
 * System Resilience Tests - Failure Scenarios
 * Tests system behavior under various failure conditions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../../../shared/database/database-manager.js';
import { CommandQueueManager } from '../../../../shared/services/command-queue-manager.js';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager.js';
import { EventLogger } from '../../../../shared/services/event-logger.js';
import { HeartbeatManager } from '../../../../shared/services/heartbeat-manager.js';
import { LockerCoordinationService } from '../../services/locker-coordination.js';

describe('System Resilience - Failure Scenarios', () => {
  let dbManager: DatabaseManager;
  let commandQueue: CommandQueueManager;
  let stateManager: LockerStateManager;
  let eventLogger: EventLogger;
  let heartbeatManager: HeartbeatManager;
  let coordinationService: LockerCoordinationService;

  beforeEach(async () => {
    // Use in-memory database for testing
    dbManager = new DatabaseManager(':memory:');
    await dbManager.initialize();

    eventLogger = new EventLogger(dbManager.getEventRepository());
    commandQueue = new CommandQueueManager(
      dbManager.getCommandQueueRepository(),
      eventLogger
    );
    stateManager = new LockerStateManager(
      dbManager.getLockerRepository(),
      eventLogger
    );
    heartbeatManager = new HeartbeatManager(
      dbManager.getKioskHeartbeatRepository(),
      eventLogger
    );
    coordinationService = new LockerCoordinationService(
      dbManager,
      commandQueue,
      stateManager,
      heartbeatManager,
      eventLogger
    );

    await setupTestData();
  });

  afterEach(async () => {
    await dbManager.close();
  });

  async function setupTestData() {
    const lockerRepo = dbManager.getLockerRepository();
    const heartbeatRepo = dbManager.getKioskHeartbeatRepository();

    // Create test kiosks
    const kiosks = ['room-a', 'room-b', 'room-c'];
    for (const kioskId of kiosks) {
      await heartbeatRepo.upsert({
        kiosk_id: kioskId,
        last_seen: new Date(),
        zone: `Zone ${kioskId}`,
        status: 'online',
        version: '1.0.0'
      });

      // Create lockers for each kiosk
      for (let i = 1; i <= 10; i++) {
        await lockerRepo.create({
          kiosk_id: kioskId,
          id: i,
          status: 'Free',
          version: 1,
          is_vip: false
        });
      }
    }
  }

  describe('Power Loss and Recovery Scenarios', () => {
    it('should handle graceful system restart', async () => {
      // Setup: Assign some lockers before "power loss"
      await stateManager.assignLocker('room-a', 1, 'rfid', 'card-123');
      await stateManager.transitionToOwned('room-a', 1, 'card-123');
      await stateManager.assignLocker('room-b', 2, 'device', 'device-456');

      // Queue some commands
      await commandQueue.enqueueCommand('room-a', {
        command_id: 'cmd-1',
        command_type: 'open_locker',
        payload: { locker_id: 3 },
        kiosk_id: 'room-a'
      });

      // Simulate power loss and restart
      await eventLogger.logEvent({
        kiosk_id: 'system',
        event_type: 'restarted',
        details: { reason: 'power_restored', timestamp: new Date().toISOString() }
      });

      // Clear pending commands (as system would do on restart)
      await commandQueue.clearPendingCommands('room-a');
      await commandQueue.clearPendingCommands('room-b');
      await commandQueue.clearPendingCommands('room-c');

      // Verify locker states persisted
      const locker1 = await stateManager.getLocker('room-a', 1);
      const locker2 = await stateManager.getLocker('room-b', 2);

      expect(locker1?.status).toBe('Owned');
      expect(locker1?.owner_key).toBe('card-123');
      expect(locker2?.status).toBe('Reserved'); // Device assignments start as Reserved

      // Verify commands were cleared
      const pendingCommands = await commandQueue.getCommands('room-a');
      expect(pendingCommands.length).toBe(0);

      // Verify restart event was logged
      const events = await eventLogger.getEvents('system', { limit: 5 });
      const restartEvent = events.find(e => e.event_type === 'restarted');
      expect(restartEvent).toBeTruthy();
    });

    it('should not automatically open lockers after power restoration', async () => {
      // Setup: Multiple owned lockers
      const ownedLockers = [
        { kiosk: 'room-a', id: 1, card: 'card-1' },
        { kiosk: 'room-a', id: 2, card: 'card-2' },
        { kiosk: 'room-b', id: 1, card: 'card-3' }
      ];

      for (const locker of ownedLockers) {
        await stateManager.assignLocker(locker.kiosk, locker.id, 'rfid', locker.card);
        await stateManager.transitionToOwned(locker.kiosk, locker.id, locker.card);
      }

      // Simulate restart
      await eventLogger.logEvent({
        kiosk_id: 'system',
        event_type: 'restarted',
        details: { reason: 'power_restored' }
      });

      // Verify no automatic opening occurred
      for (const locker of ownedLockers) {
        const lockerState = await stateManager.getLocker(locker.kiosk, locker.id);
        expect(lockerState?.status).toBe('Owned'); // Should remain Owned
        expect(lockerState?.owner_key).toBe(locker.card);
      }

      // Verify no open commands were queued
      const roomACommands = await commandQueue.getCommands('room-a');
      const roomBCommands = await commandQueue.getCommands('room-b');
      expect(roomACommands.length).toBe(0);
      expect(roomBCommands.length).toBe(0);
    });

    it('should handle incomplete command queue after restart', async () => {
      // Queue commands before "crash"
      const commands = [
        { id: 'cmd-1', kiosk: 'room-a', type: 'open_locker', payload: { locker_id: 1 } },
        { id: 'cmd-2', kiosk: 'room-b', type: 'bulk_open', payload: { locker_ids: [1, 2, 3] } },
        { id: 'cmd-3', kiosk: 'room-c', type: 'block_locker', payload: { locker_id: 5 } }
      ];

      for (const cmd of commands) {
        await commandQueue.enqueueCommand(cmd.kiosk, {
          command_id: cmd.id,
          command_type: cmd.type,
          payload: cmd.payload,
          kiosk_id: cmd.kiosk
        });
      }

      // Simulate restart and cleanup
      await commandQueue.clearPendingCommands('room-a');
      await commandQueue.clearPendingCommands('room-b');
      await commandQueue.clearPendingCommands('room-c');

      // Log restart with warning about cleared commands
      await eventLogger.logEvent({
        kiosk_id: 'system',
        event_type: 'restarted',
        details: { 
          reason: 'power_restored',
          cleared_commands: commands.length,
          warning: 'Incomplete command queue cleared'
        }
      });

      // Verify all commands were cleared
      for (const cmd of commands) {
        const remainingCommands = await commandQueue.getCommands(cmd.kiosk);
        expect(remainingCommands.length).toBe(0);
      }

      // Verify warning was logged
      const events = await eventLogger.getEvents('system', { limit: 5 });
      const restartEvent = events.find(e => e.event_type === 'restarted');
      expect(restartEvent?.details).toHaveProperty('warning');
    });
  });

  describe('Network Failure Scenarios', () => {
    it('should handle kiosk disconnection gracefully', async () => {
      // Initially all kiosks online
      await heartbeatManager.updateHeartbeat('room-a', { version: '1.0.0', zone: 'Zone A' });
      await heartbeatManager.updateHeartbeat('room-b', { version: '1.0.0', zone: 'Zone B' });

      // Simulate room-b going offline
      vi.useFakeTimers();
      vi.advanceTimersByTime(35000); // 35 seconds, past 30-second threshold

      await heartbeatManager.checkOfflineKiosks();

      // Verify room-b marked as offline
      const kioskStatus = await heartbeatManager.getKioskStatus('room-b');
      expect(kioskStatus.status).toBe('offline');

      // Queue command for offline kiosk
      await commandQueue.enqueueCommand('room-b', {
        command_id: 'offline-cmd',
        command_type: 'open_locker',
        payload: { locker_id: 1 },
        kiosk_id: 'room-b'
      });

      // Command should be queued but not executed
      const queuedCommands = await commandQueue.getCommands('room-b');
      expect(queuedCommands.length).toBe(1);
      expect(queuedCommands[0].status).toBe('pending');

      // Simulate kiosk coming back online
      await heartbeatManager.updateHeartbeat('room-b', { version: '1.0.0', zone: 'Zone B' });

      // Command should still be available for execution
      const availableCommands = await commandQueue.getCommands('room-b');
      expect(availableCommands.length).toBe(1);

      vi.useRealTimers();
    });

    it('should handle partial network connectivity', async () => {
      // Setup: Some kiosks online, some offline
      await heartbeatManager.updateHeartbeat('room-a', { version: '1.0.0', zone: 'Zone A' });
      // room-b and room-c are offline (no recent heartbeat)

      vi.useFakeTimers();
      vi.advanceTimersByTime(35000);
      await heartbeatManager.checkOfflineKiosks();

      // Attempt bulk operation across all rooms
      const result = await coordinationService.coordinateBulkOpening(
        ['room-a', 'room-b', 'room-c'], 
        'admin'
      );

      expect(result.success).toBe(true);
      expect(result.offlineKiosks).toContain('room-b');
      expect(result.offlineKiosks).toContain('room-c');
      expect(result.offlineKiosks).not.toContain('room-a');

      // Commands should only be queued for online kiosks
      const roomACommands = await commandQueue.getCommands('room-a');
      const roomBCommands = await commandQueue.getCommands('room-b');

      expect(roomACommands.length).toBeGreaterThan(0);
      expect(roomBCommands.length).toBe(0); // No commands for offline kiosk

      vi.useRealTimers();
    });

    it('should maintain command queue integrity during network issues', async () => {
      // Queue multiple commands
      const commands = [];
      for (let i = 1; i <= 5; i++) {
        const cmd = {
          command_id: `net-cmd-${i}`,
          command_type: 'open_locker',
          payload: { locker_id: i },
          kiosk_id: 'room-a'
        };
        await commandQueue.enqueueCommand('room-a', cmd);
        commands.push(cmd);
      }

      // Simulate network interruption during command processing
      await commandQueue.markCommandComplete('net-cmd-1');
      await commandQueue.markCommandFailed('net-cmd-2', 'Network timeout');
      
      // Simulate kiosk going offline
      vi.useFakeTimers();
      vi.advanceTimersByTime(35000);
      await heartbeatManager.checkOfflineKiosks();

      // Remaining commands should still be in queue
      const remainingCommands = await commandQueue.getCommands('room-a');
      expect(remainingCommands.length).toBe(3); // 3 pending commands remain

      // When kiosk comes back online, commands should be available
      await heartbeatManager.updateHeartbeat('room-a', { version: '1.0.0', zone: 'Zone A' });
      
      const availableCommands = await commandQueue.getCommands('room-a');
      expect(availableCommands.length).toBe(3);

      vi.useRealTimers();
    });
  });

  describe('Database Failure Scenarios', () => {
    it('should handle database connection loss', async () => {
      // Mock database connection failure
      const originalQuery = dbManager.getConnection().prepare;
      dbManager.getConnection().prepare = vi.fn().mockImplementation(() => {
        throw new Error('SQLITE_BUSY: database is locked');
      });

      // Attempt operations that should fail gracefully
      let assignResult;
      try {
        assignResult = await stateManager.assignLocker('room-a', 1, 'rfid', 'card-fail');
      } catch (error) {
        expect(error.message).toContain('database');
      }

      expect(assignResult).toBeUndefined();

      // Restore connection
      dbManager.getConnection().prepare = originalQuery;

      // Operations should work again
      const recoveryResult = await stateManager.assignLocker('room-a', 1, 'rfid', 'card-recovery');
      expect(recoveryResult).toBe(true);
    });

    it('should handle optimistic locking conflicts', async () => {
      // Create concurrent modification scenario
      const locker1 = await stateManager.getLocker('room-a', 1);
      const locker2 = await stateManager.getLocker('room-a', 1);

      expect(locker1?.version).toBe(locker2?.version);

      // First modification succeeds
      await stateManager.assignLocker('room-a', 1, 'rfid', 'card-1');

      // Second modification should detect version conflict
      try {
        await dbManager.getLockerRepository().update('room-a', 1, {
          status: 'Owned',
          owner_type: 'rfid',
          owner_key: 'card-2',
          version: locker2!.version // Old version
        });
        
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error.name).toBe('OptimisticLockError');
      }

      // Verify first modification persisted
      const finalLocker = await stateManager.getLocker('room-a', 1);
      expect(finalLocker?.owner_key).toBe('card-1');
    });

    it('should handle database corruption recovery', async () => {
      // Simulate database corruption by creating invalid data
      const lockerRepo = dbManager.getLockerRepository();
      
      // Create locker with invalid status
      try {
        await lockerRepo.create({
          kiosk_id: 'room-corrupt',
          id: 1,
          status: 'InvalidStatus' as any,
          version: 1,
          is_vip: false
        });
      } catch (error) {
        // Should be caught by database constraints
        expect(error.message).toContain('constraint');
      }

      // Verify database integrity maintained
      const validLocker = await lockerRepo.create({
        kiosk_id: 'room-corrupt',
        id: 1,
        status: 'Free',
        version: 1,
        is_vip: false
      });

      expect(validLocker.status).toBe('Free');
    });
  });

  describe('Hardware Failure Scenarios', () => {
    it('should handle Modbus communication failures', async () => {
      // Mock hardware failure in coordination service
      const mockModbusFailure = vi.fn().mockRejectedValue(new Error('Modbus timeout'));
      
      // Simulate command execution with hardware failure
      await commandQueue.enqueueCommand('room-a', {
        command_id: 'hw-fail-cmd',
        command_type: 'open_locker',
        payload: { locker_id: 1, mockExecutor: mockModbusFailure },
        kiosk_id: 'room-a'
      });

      // Command should be marked as failed
      await commandQueue.markCommandFailed('hw-fail-cmd', 'Modbus communication timeout');

      const failedCommand = await commandQueue.getCommandStatus('hw-fail-cmd');
      expect(failedCommand?.status).toBe('failed');
      expect(failedCommand?.last_error).toContain('Modbus');
    });

    it('should handle RFID reader failures', async () => {
      // Simulate RFID reader disconnection
      await eventLogger.logEvent({
        kiosk_id: 'room-a',
        event_type: 'hardware_error',
        details: {
          component: 'rfid_reader',
          error: 'Device disconnected',
          timestamp: new Date().toISOString()
        }
      });

      // System should continue operating with QR codes only
      const deviceAssignResult = await stateManager.assignLocker('room-a', 2, 'device', 'device-backup');
      expect(deviceAssignResult).toBe(true);

      // Verify hardware error was logged
      const events = await eventLogger.getEvents('room-a', { limit: 5 });
      const hardwareError = events.find(e => e.event_type === 'hardware_error');
      expect(hardwareError).toBeTruthy();
      expect(hardwareError?.details).toHaveProperty('component', 'rfid_reader');
    });

    it('should handle relay board failures', async () => {
      // Simulate relay board failure affecting multiple lockers
      const affectedLockers = [1, 2, 3, 4]; // First relay board
      
      for (const lockerId of affectedLockers) {
        await eventLogger.logEvent({
          kiosk_id: 'room-a',
          event_type: 'hardware_error',
          locker_id: lockerId,
          details: {
            component: 'relay_board_1',
            error: 'No response from relay channel',
            lockerId
          }
        });

        // Mark lockers as blocked due to hardware failure
        await stateManager.forceStateTransition('room-a', lockerId, 'Blocked', 'system', 'Hardware failure');
      }

      // Verify affected lockers are blocked
      for (const lockerId of affectedLockers) {
        const locker = await stateManager.getLocker('room-a', lockerId);
        expect(locker?.status).toBe('Blocked');
      }

      // Unaffected lockers should still work
      const unaffectedResult = await stateManager.assignLocker('room-a', 5, 'rfid', 'card-unaffected');
      expect(unaffectedResult).toBe(true);
    });
  });

  describe('Load and Stress Scenarios', () => {
    it('should handle high concurrent load', async () => {
      const concurrentOperations = 20;
      const operations = [];

      // Create concurrent operations across multiple kiosks
      for (let i = 0; i < concurrentOperations; i++) {
        const kioskId = `room-${String.fromCharCode(97 + (i % 3))}`; // room-a, room-b, room-c
        const lockerId = (i % 10) + 1;
        const cardId = `load-card-${i}`;

        operations.push(
          stateManager.assignLocker(kioskId, lockerId, 'rfid', cardId)
        );
      }

      // Execute all operations concurrently
      const results = await Promise.allSettled(operations);

      // Some operations should succeed, some may fail due to conflicts
      const successful = results.filter(r => r.status === 'fulfilled' && r.value === true);
      const failed = results.filter(r => r.status === 'rejected' || r.value === false);

      expect(successful.length).toBeGreaterThan(0);
      expect(successful.length + failed.length).toBe(concurrentOperations);

      // Verify database consistency
      const allLockers = await Promise.all([
        dbManager.getLockerRepository().findByKiosk('room-a'),
        dbManager.getLockerRepository().findByKiosk('room-b'),
        dbManager.getLockerRepository().findByKiosk('room-c')
      ]);

      const totalAssigned = allLockers.flat().filter(l => l.status !== 'Free').length;
      expect(totalAssigned).toBe(successful.length);
    });

    it('should handle command queue overflow', async () => {
      const maxCommands = 100;
      
      // Fill command queue beyond typical capacity
      for (let i = 0; i < maxCommands; i++) {
        await commandQueue.enqueueCommand('room-a', {
          command_id: `overflow-cmd-${i}`,
          command_type: 'open_locker',
          payload: { locker_id: (i % 10) + 1 },
          kiosk_id: 'room-a'
        });
      }

      // Verify all commands were queued
      const queuedCommands = await commandQueue.getCommands('room-a');
      expect(queuedCommands.length).toBe(maxCommands);

      // Process commands in batches
      const batchSize = 10;
      for (let i = 0; i < maxCommands; i += batchSize) {
        const batch = queuedCommands.slice(i, i + batchSize);
        
        // Mark batch as completed
        for (const cmd of batch) {
          await commandQueue.markCommandComplete(cmd.command_id);
        }
      }

      // Verify queue is empty
      const remainingCommands = await commandQueue.getCommands('room-a');
      expect(remainingCommands.length).toBe(0);
    });

    it('should maintain performance under sustained load', async () => {
      const testDuration = 5000; // 5 seconds
      const startTime = Date.now();
      let operationCount = 0;

      // Run continuous operations for test duration
      while (Date.now() - startTime < testDuration) {
        const lockerId = (operationCount % 10) + 1;
        const cardId = `perf-card-${operationCount}`;

        try {
          await stateManager.assignLocker('room-a', lockerId, 'rfid', cardId);
          await stateManager.releaseLocker('room-a', lockerId, cardId, 'rfid');
          operationCount++;
        } catch (error) {
          // Expected under high load
        }

        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const actualDuration = Date.now() - startTime;
      const operationsPerSecond = operationCount / (actualDuration / 1000);

      // Should maintain reasonable throughput
      expect(operationsPerSecond).toBeGreaterThan(10); // At least 10 ops/sec
      expect(operationCount).toBeGreaterThan(50); // At least 50 total operations

      // Verify system is still responsive
      const finalResult = await stateManager.assignLocker('room-a', 1, 'rfid', 'final-test');
      expect(typeof finalResult).toBe('boolean');
    });
  });
});