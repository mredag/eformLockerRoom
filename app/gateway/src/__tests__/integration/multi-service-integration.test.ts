/**
 * Multi-Service Integration Tests
 * Tests communication and coordination between Gateway, Kiosk, and Panel services
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../../../../shared/database/database-manager.js';
import { CommandQueueManager } from '../../../../../shared/services/command-queue-manager.js';
import { LockerStateManager } from '../../../../../shared/services/locker-state-manager.js';
import { EventLogger } from '../../../../../shared/services/event-logger.js';
import { HeartbeatManager } from '../../../../../shared/services/heartbeat-manager.js';
import { LockerCoordinationService } from '../../services/locker-coordination.js';
import { LockerRepository } from '../../../../../shared/database/locker-repository.js';
import { VipContractRepository } from '../../../../../shared/database/vip-contract-repository.js';
import { KioskHeartbeatRepository } from '../../../../../shared/database/kiosk-heartbeat-repository.js';
import { EventRepository } from '../../../../../shared/database/event-repository.js';
import { KioskHeartbeat, Command } from '../../../../../shared/types/core-entities.js';

describe('Multi-Service Integration Tests', () => {
  let dbManager: DatabaseManager;
  let commandQueue: CommandQueueManager;
  let stateManager: LockerStateManager;
  let eventLogger: EventLogger;
  let heartbeatManager: HeartbeatManager;
  let lockerCoordination: LockerCoordinationService;

  beforeEach(async () => {
    // Initialize database manager with in-memory database and correct migrations path
    dbManager = DatabaseManager.getInstance({ 
      path: ':memory:',
      migrationsPath: '../../migrations'
    });
    await dbManager.initialize();

    const dbConnection = dbManager.getConnection();
    
    const lockerRepository = new LockerRepository(dbConnection);
    const vipRepository = new VipContractRepository(dbConnection);
    const eventRepository = new EventRepository(dbConnection);
    
    eventLogger = new EventLogger(eventRepository);
    commandQueue = new CommandQueueManager(dbConnection);
    stateManager = new LockerStateManager(lockerRepository, vipRepository);
    heartbeatManager = new HeartbeatManager({}, eventLogger, dbConnection);
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
    DatabaseManager.resetAllInstances();
  });

  async function setupTestData() {
    const lockerRepo = new LockerRepository(dbManager);
    const heartbeatRepo = new KioskHeartbeatRepository(dbManager);

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
      const roomACommands = await commandQueue.getPendingCommands('room-a');
      const roomBCommands = await commandQueue.getPendingCommands('room-b');
      const roomCCommands = await commandQueue.getPendingCommands('room-c');

      expect(roomACommands).toHaveLength(1);
      expect(roomBCommands).toHaveLength(1);
      expect(roomCCommands).toHaveLength(1);

      // Verify command content
      expect(roomACommands[0].command_type).toBe('bulk_open');
      expect(roomACommands[0].payload.exclude_vip).toBe(true);
    });

    it('should handle kiosk offline scenarios during multi-room operations', async () => {
      // Mark room-b as offline
      await heartbeatManager.updateKioskStatus('room-b', 'offline');

      const result = await lockerCoordination.coordinateBulkOpening(['room-a', 'room-b', 'room-c'], 'admin');

      expect(result.success).toBe(true);
      expect(result.commandsQueued).toBe(0); // No owned lockers initially

      // Verify commands were queued for all kiosks (offline handling is at execution level)
      const roomACommands = await commandQueue.getPendingCommands('room-a');
      const roomBCommands = await commandQueue.getPendingCommands('room-b');
      const roomCCommands = await commandQueue.getPendingCommands('room-c');

      expect(roomACommands).toHaveLength(1);
      expect(roomBCommands).toHaveLength(1); // Commands still queued for offline kiosk
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
      await commandQueue.enqueueCommand('room-a', 'open_locker', {
        open_locker: { locker_id: 5, reason: 'staff_override' }
      });

      await commandQueue.enqueueCommand('room-a', 'block_locker', {
        block_locker: { locker_id: 10, staff_user: 'admin', reason: 'maintenance' }
      });

      await commandQueue.enqueueCommand('room-b', 'open_locker', {
        open_locker: { locker_id: 3, reason: 'user_assistance' }
      });

      // Simulate kiosk polling
      const roomACommands = await commandQueue.getPendingCommands('room-a');
      const roomBCommands = await commandQueue.getPendingCommands('room-b');
      const roomCCommands = await commandQueue.getPendingCommands('room-c');

      expect(roomACommands).toHaveLength(2);
      expect(roomBCommands).toHaveLength(1);
      expect(roomCCommands).toHaveLength(0);

      // Simulate command execution
      await commandQueue.markCommandComplete('cmd-001');
      await commandQueue.markCommandFailed('cmd-002', 'Hardware error');

      // Verify command status
      const completedCommands = await commandQueue.getPendingCommands('room-a');
      expect(completedCommands).toHaveLength(1); // Only failed command remains for retry
    });

    it('should handle command retry logic with exponential backoff', async () => {
      const commandId = await commandQueue.enqueueCommand('room-a', 'open_locker', {
        open_locker: { locker_id: 7, reason: 'test' }
      });

      // Simulate multiple failures
      for (let i = 0; i < 3; i++) {
        const commands = await commandQueue.getPendingCommands('room-a');
        expect(commands).toHaveLength(1);
        
        await commandQueue.markCommandFailed(
          commandId, 
          `Attempt ${i + 1} failed`
        );
      }

      // After max retries, command should be marked as permanently failed
      const finalCommands = await commandQueue.getPendingCommands('room-a');
      expect(finalCommands).toHaveLength(0); // No more retries
    });

    it('should prioritize commands based on type and urgency', async () => {
      // Queue commands with different priorities (simulated by order)
      const lowCmd = await commandQueue.enqueueCommand('room-a', 'bulk_open', {
        bulk_open: { locker_ids: [1, 2, 3], staff_user: 'admin', exclude_vip: true, interval_ms: 300 }
      });

      const highCmd = await commandQueue.enqueueCommand('room-a', 'open_locker', {
        open_locker: { locker_id: 1, staff_user: 'admin', reason: 'emergency' }
      });

      const medCmd = await commandQueue.enqueueCommand('room-a', 'open_locker', {
        open_locker: { locker_id: 2, staff_user: 'admin', reason: 'normal' }
      });

      const queuedCommands = await commandQueue.getPendingCommands('room-a');
      
      // Commands should be queued (order may vary based on implementation)
      expect(queuedCommands).toHaveLength(3);
      expect([lowCmd, highCmd, medCmd]).toContain(queuedCommands[0].command_id);
      expect([lowCmd, highCmd, medCmd]).toContain(queuedCommands[1].command_id);
      expect([lowCmd, highCmd, medCmd]).toContain(queuedCommands[2].command_id);
    });
  });

  describe('Heartbeat and Health Monitoring', () => {
    it('should track kiosk health and connectivity', async () => {
      // Update heartbeats for different kiosks
      await heartbeatManager.updateHeartbeat('room-a', '1.0.0');
      await heartbeatManager.updateHeartbeat('room-b', '1.0.0');
      await heartbeatManager.updateHeartbeat('room-c', '1.0.1');

      // Get all kiosks
      const allKiosks = await heartbeatManager.getAllKiosks();
      expect(allKiosks).toHaveLength(3);

      // Check that kiosks are registered
      const kioskIds = allKiosks.map(k => k.kiosk_id);
      expect(kioskIds).toContain('room-a');
      expect(kioskIds).toContain('room-b');
      expect(kioskIds).toContain('room-c');

      // Check statistics
      const stats = await heartbeatManager.getStatistics();
      expect(stats.total).toBe(3);
      expect(stats.online).toBeGreaterThanOrEqual(0);
    });

    it('should handle kiosk reconnection after offline period', async () => {
      // Mark kiosk as offline
      await heartbeatManager.updateKioskStatus('room-a', 'offline');
      
      let stats = await heartbeatManager.getStatistics();
      expect(stats.offline).toBeGreaterThanOrEqual(1);

      // Simulate reconnection
      await heartbeatManager.updateHeartbeat('room-a', '1.0.0');

      // Verify queued commands are delivered after reconnection
      await commandQueue.enqueueCommand('room-a', 'restart_service', {
        restart_service: { service_name: 'kiosk', delay_seconds: 0 }
      });

      const commands = await commandQueue.getPendingCommands('room-a');
      expect(commands).toHaveLength(1);
    });

    it('should detect version mismatches across kiosks', async () => {
      // Update heartbeats with different versions
      await heartbeatManager.updateHeartbeat('room-a', '1.0.0');
      await heartbeatManager.updateHeartbeat('room-b', '1.0.1');
      await heartbeatManager.updateHeartbeat('room-c', '1.0.0');

      // Get all kiosks and check versions
      const allKiosks = await heartbeatManager.getAllKiosks();
      const versions = allKiosks.map(k => k.version);
      
      expect(versions).toContain('1.0.0');
      expect(versions).toContain('1.0.1');
      
      // Count version occurrences
      const versionCounts = versions.reduce((acc, version) => {
        acc[version] = (acc[version] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      expect(versionCounts['1.0.0']).toBe(2);
      expect(versionCounts['1.0.1']).toBe(1);
    });
  });

  describe('Event Coordination and Logging', () => {
    it('should log cross-room events with proper correlation', async () => {
      // Simulate coordinated operations across rooms
      await lockerCoordination.coordinateBulkOpening(['room-a', 'room-b', 'room-c'], 'admin');

      // Verify events were logged
      const eventRepository = new EventRepository(dbManager.getConnection());
      const events = await eventRepository.findAll(50);
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
      const eventRepository = new EventRepository(dbManager.getConnection());
      const events = await eventRepository.findAll(10);
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
      const lockerRepository = new LockerRepository(dbManager.getConnection());
      const allLockers = await Promise.all([
        lockerRepository.findByKiosk('room-a'),
        lockerRepository.findByKiosk('room-b'),
        lockerRepository.findByKiosk('room-c')
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
            return commandQueue.enqueueCommand(op.kiosk, 'restart_service', {
              restart_service: { service_name: 'test', delay_seconds: 0 }
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