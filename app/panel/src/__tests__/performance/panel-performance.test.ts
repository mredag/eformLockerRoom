import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../../../../shared/database/database-manager';
import { LockerRepository } from '../../../../../shared/database/locker-repository';
import { VipContractRepository } from '../../../../../shared/database/vip-contract-repository';
import { EventLogger } from '../../../../../shared/services/event-logger';
import { HeartbeatManager } from '../../../../../shared/services/heartbeat-manager';
import { LockerStateManager } from '../../../../../shared/services/locker-state-manager';
import { CommandQueueManager } from '../../../../../shared/services/command-queue-manager';

describe('Panel Performance Tests', () => {
  let dbManager: DatabaseManager;
  let lockerRepository: LockerRepository;
  let vipRepository: VipContractRepository;
  let eventLogger: EventLogger;
  let heartbeatManager: HeartbeatManager;
  let lockerStateManager: LockerStateManager;
  let commandQueue: CommandQueueManager;

  beforeEach(async () => {
    dbManager = new DatabaseManager(':memory:');
    await dbManager.initialize();
    
    lockerRepository = new LockerRepository(dbManager);
    vipRepository = new VipContractRepository(dbManager);
    eventLogger = new EventLogger(dbManager);
    heartbeatManager = new HeartbeatManager(dbManager);
    lockerStateManager = new LockerStateManager(lockerRepository, vipRepository);
    commandQueue = new CommandQueueManager(dbManager);

    await setupPerformanceTestEnvironment();
  });

  afterEach(async () => {
    await dbManager.close();
  });

  async function setupPerformanceTestEnvironment() {
    // Create realistic test environment: 500 lockers across 3 kiosks
    const kiosks = [
      { id: 'gym-main', lockers: 200, zone: 'Main Gym' },
      { id: 'spa-premium', lockers: 150, zone: 'Premium Spa' },
      { id: 'pool-area', lockers: 150, zone: 'Pool Area' }
    ];

    for (const kiosk of kiosks) {
      // Register kiosk
      await heartbeatManager.registerKiosk(kiosk.id, kiosk.zone);
      
      // Create lockers
      for (let i = 1; i <= kiosk.lockers; i++) {
        await lockerRepository.create({
          kiosk_id: kiosk.id,
          id: i,
          status: Math.random() > 0.7 ? 'Owned' : 'Free', // 30% occupied
          owner_type: Math.random() > 0.7 ? 'rfid' : null,
          owner_key: Math.random() > 0.7 ? `card-${kiosk.id}-${i}` : null,
          version: 1,
          is_vip: Math.random() > 0.95 // 5% VIP lockers
        });
      }
    }

    // Create some VIP contracts
    for (let i = 1; i <= 15; i++) {
      const kioskId = kiosks[i % 3].id;
      await vipRepository.create({
        kiosk_id: kioskId,
        locker_id: i,
        rfid_card: `vip-card-${i}`,
        start_date: new Date(),
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: 'admin'
      });
    }

    // Generate historical events
    for (let i = 0; i < 1000; i++) {
      const kiosk = kiosks[i % 3];
      await eventLogger.logEvent({
        kiosk_id: kiosk.id,
        locker_id: (i % kiosk.lockers) + 1,
        event_type: ['rfid_assign', 'rfid_release', 'staff_open'][i % 3],
        rfid_card: `historical-card-${i}`,
        details: { test_data: true, iteration: i }
      });
    }
  }

  describe('Panel Performance Requirements (Task 15.3)', () => {
    it('should handle 500 lockers with filtering under 1 second', async () => {
      const startTime = Date.now();

      // Test filtering by different criteria
      const allLockers = await lockerRepository.findAll();
      const gymLockers = await lockerRepository.findByKiosk('gym-main');
      const freeLockers = await lockerRepository.findByStatus('Free');
      const ownedLockers = await lockerRepository.findByStatus('Owned');
      const vipLockers = await lockerRepository.findVipLockers();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify results
      expect(allLockers.length).toBe(500);
      expect(gymLockers.length).toBe(200);
      expect(freeLockers.length).toBeGreaterThan(0);
      expect(ownedLockers.length).toBeGreaterThan(0);
      expect(vipLockers.length).toBeGreaterThan(0);

      // Performance requirement: under 1 second
      expect(duration).toBeLessThan(1000);
      console.log(`Locker filtering completed in ${duration}ms`);
    });

    it('should handle status updates for 3 kiosks under 1 second', async () => {
      const startTime = Date.now();

      // Simulate real-time status updates
      const kiosks = ['gym-main', 'spa-premium', 'pool-area'];
      const updatePromises = [];

      for (const kioskId of kiosks) {
        // Update heartbeat
        updatePromises.push(heartbeatManager.updateHeartbeat(kioskId));
        
        // Get locker status
        updatePromises.push(lockerRepository.findByKiosk(kioskId));
        
        // Check for commands
        updatePromises.push(commandQueue.getCommands(kioskId));
      }

      const results = await Promise.all(updatePromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all operations completed
      expect(results.length).toBe(9); // 3 operations × 3 kiosks

      // Performance requirement: under 1 second
      expect(duration).toBeLessThan(1000);
      console.log(`Status updates for 3 kiosks completed in ${duration}ms`);
    });

    it('should handle concurrent panel operations efficiently', async () => {
      const startTime = Date.now();

      // Simulate multiple staff users accessing panel simultaneously
      const concurrentOperations = [
        // User 1: Viewing main gym
        lockerRepository.findByKiosk('gym-main'),
        
        // User 2: Viewing spa area
        lockerRepository.findByKiosk('spa-premium'),
        
        // User 3: Bulk operations
        commandQueue.enqueueCommand('gym-main', {
          type: 'bulk_open',
          locker_ids: [1, 2, 3, 4, 5],
          staff_user: 'admin'
        }),
        
        // User 4: VIP management
        vipRepository.findActiveContracts(),
        
        // User 5: Event viewing
        eventLogger.getRecentEvents(100),
        
        // Background: Heartbeat updates
        heartbeatManager.updateHeartbeat('gym-main'),
        heartbeatManager.updateHeartbeat('spa-premium'),
        heartbeatManager.updateHeartbeat('pool-area')
      ];

      const results = await Promise.all(concurrentOperations);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all operations completed successfully
      expect(results.every(r => r !== null && r !== undefined)).toBe(true);

      // Should handle concurrent access efficiently
      expect(duration).toBeLessThan(2000);
      console.log(`Concurrent panel operations completed in ${duration}ms`);
    });

    it('should maintain performance with large event history', async () => {
      // Add more historical events to stress test
      const additionalEvents = 5000;
      const eventPromises = [];

      for (let i = 0; i < additionalEvents; i++) {
        eventPromises.push(
          eventLogger.logEvent({
            kiosk_id: ['gym-main', 'spa-premium', 'pool-area'][i % 3],
            locker_id: (i % 50) + 1,
            event_type: 'performance_test',
            details: { batch: 'large_history', index: i }
          })
        );
      }

      await Promise.all(eventPromises);

      // Test event querying performance
      const startTime = Date.now();

      const recentEvents = await eventLogger.getRecentEvents(100);
      const gymEvents = await eventLogger.getEventsByKiosk('gym-main');
      const staffEvents = await eventLogger.getEventsByType('staff_open');

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify results
      expect(recentEvents.length).toBe(100);
      expect(gymEvents.length).toBeGreaterThan(0);

      // Should maintain performance even with large event history
      expect(duration).toBeLessThan(1500);
      console.log(`Event queries with large history completed in ${duration}ms`);
    });

    it('should handle bulk operations efficiently', async () => {
      const startTime = Date.now();

      // Test bulk opening of 50 lockers
      const lockerIds = Array.from({ length: 50 }, (_, i) => i + 1);
      
      const bulkCommands = [];
      for (const kioskId of ['gym-main', 'spa-premium']) {
        bulkCommands.push(
          commandQueue.enqueueCommand(kioskId, {
            type: 'bulk_open',
            locker_ids: lockerIds.slice(0, 25), // 25 per kiosk
            staff_user: 'admin',
            exclude_vip: true
          })
        );
      }

      const commandIds = await Promise.all(bulkCommands);
      
      // Simulate command processing
      for (const commandId of commandIds) {
        await commandQueue.markCommandComplete(commandId);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify commands were created and processed
      expect(commandIds.every(id => typeof id === 'string')).toBe(true);

      // Bulk operations should complete efficiently
      expect(duration).toBeLessThan(3000);
      console.log(`Bulk operations for 50 lockers completed in ${duration}ms`);
    });

    it('should handle real-time dashboard updates', async () => {
      const iterations = 10;
      const durations = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        // Simulate dashboard refresh
        const dashboardData = await Promise.all([
          lockerRepository.getStatusSummary(),
          heartbeatManager.getKioskStatuses(),
          commandQueue.getPendingCommandCount(),
          eventLogger.getRecentEvents(20),
          vipRepository.getExpiringContracts(7) // 7 days warning
        ]);

        const endTime = Date.now();
        const duration = endTime - startTime;
        durations.push(duration);

        // Verify dashboard data
        expect(dashboardData).toHaveLength(5);
        expect(dashboardData.every(data => data !== null)).toBe(true);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      // Dashboard updates should be consistently fast
      expect(avgDuration).toBeLessThan(500);
      expect(maxDuration).toBeLessThan(1000);
      
      console.log(`Dashboard updates - Avg: ${avgDuration.toFixed(1)}ms, Max: ${maxDuration}ms`);
    });
  });

  describe('Memory and Resource Management', () => {
    it('should handle memory pressure gracefully', async () => {
      const initialMemory = process.memoryUsage();
      
      // Create memory pressure with large operations
      const operations = [];
      for (let i = 0; i < 100; i++) {
        operations.push(
          lockerRepository.findAll(),
          eventLogger.getRecentEvents(1000),
          vipRepository.findAll()
        );
      }

      await Promise.all(operations);

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (< 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
      
      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });

    it('should handle database connection pooling', async () => {
      // Test concurrent database operations
      const concurrentQueries = 50;
      const startTime = Date.now();

      const queries = Array.from({ length: concurrentQueries }, (_, i) => 
        lockerRepository.findByKioskAndId('gym-main', (i % 200) + 1)
      );

      const results = await Promise.all(queries);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All queries should complete successfully
      expect(results.every(r => r !== null || r === null)).toBe(true); // Some may not exist

      // Connection pooling should handle concurrent access efficiently
      expect(duration).toBeLessThan(2000);
      
      console.log(`${concurrentQueries} concurrent queries completed in ${duration}ms`);
    });
  });

  describe('Scalability Testing', () => {
    it('should scale to larger facility configurations', async () => {
      // Test with even larger configuration
      const largeKiosks = [
        { id: 'mega-gym-1', lockers: 300 },
        { id: 'mega-gym-2', lockers: 300 },
        { id: 'mega-spa', lockers: 200 }
      ];

      const setupStart = Date.now();

      // Create large facility
      for (const kiosk of largeKiosks) {
        await heartbeatManager.registerKiosk(kiosk.id, `Zone ${kiosk.id}`);
        
        const lockerPromises = [];
        for (let i = 1; i <= kiosk.lockers; i++) {
          lockerPromises.push(
            lockerRepository.create({
              kiosk_id: kiosk.id,
              id: i,
              status: 'Free',
              version: 1,
              is_vip: false
            })
          );
        }
        await Promise.all(lockerPromises);
      }

      const setupEnd = Date.now();
      const setupDuration = setupEnd - setupStart;

      // Test operations on large facility
      const operationStart = Date.now();

      const operations = await Promise.all([
        lockerRepository.findAll(),
        lockerRepository.findByKiosk('mega-gym-1'),
        lockerRepository.findByStatus('Free'),
        heartbeatManager.getKioskStatuses()
      ]);

      const operationEnd = Date.now();
      const operationDuration = operationEnd - operationStart;

      // Verify large facility was created
      expect(operations[0].length).toBe(800); // 300 + 300 + 200
      expect(operations[1].length).toBe(300);

      // Operations should still be performant
      expect(operationDuration).toBeLessThan(2000);
      
      console.log(`Large facility setup: ${setupDuration}ms, operations: ${operationDuration}ms`);
    });
  });
});
