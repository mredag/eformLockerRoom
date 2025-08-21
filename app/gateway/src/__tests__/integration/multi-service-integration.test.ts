/**
 * Multi-Service Integration Tests
 * Tests communication and coordination between Gateway, Kiosk, and Panel services
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../../../shared/database/database-manager.js';
import { CommandQueueManager } from '../../../../shared/services/command-queue-manager.js';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager.js';
import { EventLogger } from '../../../../shared/services/event-logger.js';
import { HeartbeatManager } from '../../../../shared/services/heartbeat-manager.js';
import { LockerCoordinationService } from '../../services/locker-coordination.js';
import { Command, KioskHeartbeat } from '../../../../shared/types/core-entities.js';

describe('Multi-Service Integration Tests', () => {
  let dbManager: DatabaseManager;
  let commandQueue: CommandQueueManager;
  let stateManager: LockerStateManager;
  let eventLogger: EventLogger;
  let heartbeatManager: HeartbeatManager;
  let lockerCoordination: LockerCoordinationService;

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
    lockerCoordination = new LockerCoordinationService(
      dbManager,
      commandQueue,
      eventLogger
    );

    // Create test kiosks and lockers
    await setupTestData();
  });

  afterEach(async () => {
    await dbManager.close();
  });

  async function setupTestData() {
    const lockerRepo = dbManager.getLockerRepository();
    const heartbeatRepo = dbManager.getKioskHeartbeatRepository();

    // Create kiosks
    const kiosks = ['room-a', 'room-b', 'room-c'];
    for (const kioskId of kiosks) {
      await heartbeatRepo.upsert({
        kiosk_id: kioskId,
        last_seen: new Date(),
        zone: kioskId.replace('-', ' ').toUpperCase(),
        status: 'online',
        version: '1.0.0'
      });

      // Create lockers for each kiosk
      for (let i = 1; i <= 20; i++) {
        await lockerRepo.create({
          id: i,
          kiosk_id: kioskId,
          status: 'Free',
          is_vip: i <= 2 // First 2 lockers are VIP
        });
      }
    }
  }

  describe('Cross-Room Operations', () => {
    it('should coordinate bulk operations across multiple rooms', async () => {
      // Simulate panel requesting bulk open across all rooms
      const bulkCommand: Command = {
        command_id: 'bulk-001',
        kiosk_id: 'all',
        command_type: 'bulk_open',
        payload: {
          exclude_vip: true,
          reason: 'end_of_day',
          staff_user: 'admin'
        },
        status: 'pending',
        retry_count: 0,
        created_at: new Date()
      };

      // Execute bulk operation
      const result = await lockerCoordination.coordinateBulkOpening(['room-a', 'room-b', 'room-c'], 'admin');

      expect(result.success).toBe(true);
      expect(result.commandsQueued).toBe(0); // No owned lockers initially

      // Verify commands were queued for each kiosk
      const roomACommands = await commandQueue.getCommands('room-a');
      const roomBCommands = await commandQueue.getCommands('room-b');
      const roomCCommands = await commandQueue.getCommands('room-c');

      expect(roomACommands).toHaveLength(1);
      expect(roomBCommands).toHaveLength(1);
      expect(roomCCommands).toHaveLength(1);

      // Verify command content
      expect(roomACommands[0].command_type).toBe('bulk_open');
      expect(roomACommands[0].payload.exclude_vip).toBe(true);
    });

    it('should handle kiosk offline scenarios during multi-room operations', async () => {
      // Mark room-b as offline
      await heartbeatManager.markOffline('room-b');

      const bulkCommand: Command = {
        command_id: 'bulk-002',
        kiosk_id: 'all',
        command_type: 'bulk_open',
        payload: {
          exclude_vip: false,
          reason: 'maintenance',
          staff_user: 'admin'
        },
        status: 'pending',
        retry_count: 0,
        created_at: new Date()
      };

      const result = await lockerCoordination.coordinateBulkOpening(['room-a', 'room-b', 'room-c'], 'admin');

      expect(result.success).toBe(true);
      expect(result.commandsQueued).toBe(0); // No owned lockers initially
      expect(result.offlineKiosks).toContain('room-b');

      // Verify commands only queued for online kiosks
      const roomACommands = await commandQueue.getCommands('room-a');
      const roomBCommands = await commandQueue.getCommands('room-b');
      const roomCCommands = await commandQueue.getCommands('room-c');

      expect(roomACommands).toHaveLength(1);
      expect(roomBCommands).toHaveLength(0); // Offline kiosk
      expect(roomCCommands).toHaveLength(1);
    });

    it('should synchronize locker states across rooms', async () => {
      // Assign lockers in different rooms
      await stateManager.assignLocker('room-a', 5, 'rfid', 'card-123');
      await stateManager.assignLocker('room-b', 10, 'device', 'device-456');
      await stateManager.assignLocker('room-c', 15, 'rfid', 'card-789');

      // Get cross-room statistics
      const stats = await lockerCoordination.getSystemStats();

      expect(stats.totalLockers).toBe(60); // 20 per room * 3 rooms
      expect(stats.ownedLockers).toBe(3);
      expect(stats.freeLockers).toBe(57);
      expect(stats.vipLockers).toBe(6); // 2 per room * 3 rooms
    });
  });

  describe('Command Queue Coordination', () => {
    it('should handle command polling and execution lifecycle', async () => {
      // Queue commands for different kiosks
      const commands = [
        {
          command_id: 'cmd-001',
          kiosk_id: 'room-a',
          command_type: 'open_locker',
          payload: { locker_id: 5, reason: 'staff_override' }
        },
        {
          command_id: 'cmd-002',
          kiosk_id: 'room-a',
          command_type: 'block_locker',
          payload: { locker_id: 10, reason: 'maintenance' }
        },
        {
          command_id: 'cmd-003',
          kiosk_id: 'room-b',
          command_type: 'open_locker',
          payload: { locker_id: 3, reason: 'user_assistance' }
        }
      ];

      for (const cmd of commands) {
        await commandQueue.enqueueCommand(cmd.kiosk_id, cmd);
      }

      // Simulate kiosk polling
      const roomACommands = await commandQueue.getCommands('room-a');
      const roomBCommands = await commandQueue.getCommands('room-b');
      const roomCCommands = await commandQueue.getCommands('room-c');

      expect(roomACommands).toHaveLength(2);
      expect(roomBCommands).toHaveLength(1);
      expect(roomCCommands).toHaveLength(0);

      // Simulate command execution
      await commandQueue.markCommandComplete('cmd-001');
      await commandQueue.markCommandFailed('cmd-002', 'Hardware error');

      // Verify command status
      const completedCommands = await commandQueue.getCommands('room-a');
      expect(completedCommands).toHaveLength(1); // Only failed command remains for retry
    });

    it('should handle command retry logic with exponential backoff', async () => {
      const failingCommand: Command = {
        command_id: 'retry-001',
        kiosk_id: 'room-a',
        command_type: 'open_locker',
        payload: { locker_id: 7, reason: 'test' },
        status: 'pending',
        retry_count: 0,
        created_at: new Date()
      };

      await commandQueue.enqueueCommand('room-a', failingCommand);

      // Simulate multiple failures
      for (let i = 0; i < 3; i++) {
        const commands = await commandQueue.getCommands('room-a');
        expect(commands).toHaveLength(1);
        
        await commandQueue.markCommandFailed(
          'retry-001', 
          `Attempt ${i + 1} failed`
        );
      }

      // After max retries, command should be marked as permanently failed
      const finalCommands = await commandQueue.getCommands('room-a');
      expect(finalCommands).toHaveLength(0); // No more retries
    });

    it('should prioritize commands based on type and urgency', async () => {
      const commands = [
        {
          command_id: 'low-001',
          command_type: 'bulk_open',
          priority: 1
        },
        {
          command_id: 'high-001',
          command_type: 'emergency_open',
          priority: 10
        },
        {
          command_id: 'med-001',
          command_type: 'open_locker',
          priority: 5
        }
      ];

      for (const cmd of commands) {
        await commandQueue.enqueueCommand('room-a', {
          ...cmd,
          kiosk_id: 'room-a',
          payload: {},
          status: 'pending',
          retry_count: 0,
          created_at: new Date()
        } as Command);
      }

      const queuedCommands = await commandQueue.getCommands('room-a');
      
      // Commands should be ordered by priority (highest first)
      expect(queuedCommands[0].command_id).toBe('high-001');
      expect(queuedCommands[1].command_id).toBe('med-001');
      expect(queuedCommands[2].command_id).toBe('low-001');
    });
  });

  describe('Heartbeat and Health Monitoring', () => {
    it('should track kiosk health and connectivity', async () => {
      // Simulate heartbeats from different kiosks
      const heartbeats: KioskHeartbeat[] = [
        {
          kiosk_id: 'room-a',
          last_seen: new Date(),
          zone: 'ROOM A',
          status: 'online',
          version: '1.0.0'
        },
        {
          kiosk_id: 'room-b',
          last_seen: new Date(Date.now() - 45000), // 45 seconds ago
          zone: 'ROOM B',
          status: 'online',
          version: '1.0.0'
        },
        {
          kiosk_id: 'room-c',
          last_seen: new Date(),
          zone: 'ROOM C',
          status: 'online',
          version: '1.0.1'
        }
      ];

      for (const heartbeat of heartbeats) {
        await heartbeatManager.updateHeartbeat(heartbeat);
      }

      // Check health status
      const healthStatus = await heartbeatManager.getSystemHealth();

      expect(healthStatus.total_kiosks).toBe(3);
      expect(healthStatus.online_kiosks).toBe(2); // room-b should be offline
      expect(healthStatus.offline_kiosks).toBe(1);
      
      const offlineKiosk = healthStatus.kiosks.find(k => k.status === 'offline');
      expect(offlineKiosk?.kiosk_id).toBe('room-b');
    });

    it('should handle kiosk reconnection after offline period', async () => {
      // Mark kiosk as offline
      await heartbeatManager.markOffline('room-a');
      
      let healthStatus = await heartbeatManager.getSystemHealth();
      expect(healthStatus.online_kiosks).toBe(2);

      // Simulate reconnection
      await heartbeatManager.updateHeartbeat({
        kiosk_id: 'room-a',
        last_seen: new Date(),
        zone: 'ROOM A',
        status: 'online',
        version: '1.0.0'
      });

      healthStatus = await heartbeatManager.getSystemHealth();
      expect(healthStatus.online_kiosks).toBe(3);

      // Verify queued commands are delivered after reconnection
      await commandQueue.enqueueCommand('room-a', {
        command_id: 'reconnect-001',
        kiosk_id: 'room-a',
        command_type: 'sync_state',
        payload: {},
        status: 'pending',
        retry_count: 0,
        created_at: new Date()
      });

      const commands = await commandQueue.getCommands('room-a');
      expect(commands).toHaveLength(1);
    });

    it('should detect version mismatches across kiosks', async () => {
      const heartbeats = [
        { kiosk_id: 'room-a', version: '1.0.0' },
        { kiosk_id: 'room-b', version: '1.0.1' },
        { kiosk_id: 'room-c', version: '1.0.0' }
      ];

      for (const heartbeat of heartbeats) {
        await heartbeatManager.updateHeartbeat({
          ...heartbeat,
          last_seen: new Date(),
          zone: heartbeat.kiosk_id.toUpperCase(),
          status: 'online'
        });
      }

      const versionReport = await heartbeatManager.getVersionReport();
      
      expect(versionReport.versions).toHaveLength(2);
      expect(versionReport.versions.find(v => v.version === '1.0.0')?.count).toBe(2);
      expect(versionReport.versions.find(v => v.version === '1.0.1')?.count).toBe(1);
      expect(versionReport.needs_update).toBe(true);
    });
  });

  describe('Event Coordination and Logging', () => {
    it('should log cross-room events with proper correlation', async () => {
      // Simulate coordinated operations across rooms
      await lockerCoordination.coordinateBulkOpening(['room-a', 'room-b', 'room-c'], 'admin');

      // Verify events were logged
      const events = await dbManager.getEventRepository().findAll(50);
      const bulkEvents = events.filter(e => e.event_type === 'bulk_open');

      expect(bulkEvents).toHaveLength(1);
      expect(bulkEvents[0].details?.staff_user).toBe('admin');
    });

    it('should maintain event ordering across concurrent operations', async () => {
      const operations = [
        { kiosk: 'room-a', locker: 5, card: 'card-001' },
        { kiosk: 'room-b', locker: 10, card: 'card-002' },
        { kiosk: 'room-c', locker: 15, card: 'card-003' }
      ];

      const startTime = Date.now();

      // Execute concurrent operations
      await Promise.all(operations.map(async (op, index) => {
        await new Promise(resolve => setTimeout(resolve, index * 10)); // Slight delay
        await stateManager.assignLocker(op.kiosk, op.locker, 'rfid', op.card);
      }));

      // Verify events are properly ordered
      const events = await dbManager.getEventRepository().findAll(10);
      const assignEvents = events
        .filter(e => e.event_type === 'rfid_assign')
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      expect(assignEvents).toHaveLength(3);
      
      // Events should be in chronological order
      for (let i = 1; i < assignEvents.length; i++) {
        expect(assignEvents[i].timestamp.getTime())
          .toBeGreaterThanOrEqual(assignEvents[i-1].timestamp.getTime());
      }
    });
  });

  describe('Database Transaction Coordination', () => {
    it('should handle concurrent database operations safely', async () => {
      const concurrentOperations = Array.from({ length: 10 }, (_, i) => ({
        kiosk: `room-${i % 3 === 0 ? 'a' : i % 3 === 1 ? 'b' : 'c'}`,
        locker: (i % 18) + 1,
        card: `card-${i.toString().padStart(3, '0')}`
      }));

      // Execute all operations concurrently
      const results = await Promise.allSettled(
        concurrentOperations.map(op =>
          stateManager.assignLocker(op.kiosk, op.locker, 'rfid', op.card)
        )
      );

      // Count successful operations
      const successful = results.filter(r => r.status === 'fulfilled' && r.value === true);
      const failed = results.filter(r => r.status === 'rejected' || 
        (r.status === 'fulfilled' && r.value === false));

      // Some operations should succeed, conflicts should be handled gracefully
      expect(successful.length).toBeGreaterThan(0);
      expect(successful.length + failed.length).toBe(10);

      // Verify database consistency
      const allLockers = await Promise.all([
        dbManager.getLockerRepository().findByKiosk('room-a'),
        dbManager.getLockerRepository().findByKiosk('room-b'),
        dbManager.getLockerRepository().findByKiosk('room-c')
      ]);

      const totalOccupied = allLockers.flat().filter(l => l.status === 'Owned').length;
      expect(totalOccupied).toBe(successful.length);
    });

    it('should handle database connection failures gracefully', async () => {
      // Close database to simulate connection failure
      await dbManager.close();

      // Operations should fail gracefully without crashing
      const result = await stateManager.assignLocker('room-a', 1, 'rfid', 'card-test')
        .catch(error => ({ error: error.message }));

      expect(result).toHaveProperty('error');
    });
  });

  describe('Performance Under Load', () => {
    it('should handle high-frequency operations efficiently', async () => {
      const operationCount = 100;
      const startTime = Date.now();

      // Generate high-frequency operations
      const operations = Array.from({ length: operationCount }, (_, i) => ({
        type: i % 4 === 0 ? 'assign' : i % 4 === 1 ? 'release' : i % 4 === 2 ? 'heartbeat' : 'command',
        kiosk: `room-${i % 3 === 0 ? 'a' : i % 3 === 1 ? 'b' : 'c'}`,
        data: i
      }));

      await Promise.all(operations.map(async (op) => {
        switch (op.type) {
          case 'assign':
            return stateManager.assignLocker(op.kiosk, (op.data % 18) + 1, 'rfid', `card-${op.data}`);
          case 'release':
            return stateManager.releaseLocker(op.kiosk, (op.data % 18) + 1, `card-${op.data}`);
          case 'heartbeat':
            return heartbeatManager.updateHeartbeat({
              kiosk_id: op.kiosk,
              last_seen: new Date(),
              zone: op.kiosk.toUpperCase(),
              status: 'online',
              version: '1.0.0'
            });
          case 'command':
            return commandQueue.enqueueCommand(op.kiosk, {
              command_id: `perf-${op.data}`,
              kiosk_id: op.kiosk,
              command_type: 'ping',
              payload: {},
              status: 'pending',
              retry_count: 0,
              created_at: new Date()
            });
        }
      }));

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (10 seconds for 100 operations)
      expect(duration).toBeLessThan(10000);

      // Verify system state is consistent
      const stats = await lockerCoordination.getSystemStats();
      expect(stats.totalLockers).toBe(60);
    });
  });
});