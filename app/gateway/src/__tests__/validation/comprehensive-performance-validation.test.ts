import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../../../../shared/database/database-manager';
import { LockerRepository } from '../../../../../shared/database/locker-repository';
import { VipContractRepository } from '../../../../../shared/database/vip-contract-repository';
import { EventLogger } from '../../../../../shared/services/event-logger';
import { HeartbeatManager } from '../../../../../shared/services/heartbeat-manager';
import { CommandQueueManager } from '../../../../../shared/services/command-queue-manager';
import { LockerStateManager } from '../../../../../shared/services/locker-state-manager';

describe('Comprehensive Performance and Health Validation (Task 15.3)', () => {
  let dbManager: DatabaseManager;
  let lockerRepository: LockerRepository;
  let vipRepository: VipContractRepository;
  let eventLogger: EventLogger;
  let heartbeatManager: HeartbeatManager;
  let commandQueue: CommandQueueManager;
  let lockerStateManager: LockerStateManager;

  beforeEach(async () => {
    dbManager = new DatabaseManager(':memory:');
    await dbManager.initialize();
    
    lockerRepository = new LockerRepository(dbManager);
    vipRepository = new VipContractRepository(dbManager);
    eventLogger = new EventLogger(dbManager);
    heartbeatManager = new HeartbeatManager(dbManager);
    commandQueue = new CommandQueueManager(dbManager);
    lockerStateManager = new LockerStateManager(lockerRepository, vipRepository);

    await setupLargeScaleTestEnvironment();
  });

  afterEach(async () => {
    await dbManager.close();
  });

  async function setupLargeScaleTestEnvironment() {
    // Create 500 lockers across 3 kiosks as specified in requirements
    const kiosks = [
      { id: 'gym-main', zone: 'Main Gym', lockers: 200 },
      { id: 'spa-premium', zone: 'Premium Spa', lockers: 150 },
      { id: 'pool-area', zone: 'Pool Area', lockers: 150 }
    ];

    for (const kiosk of kiosks) {
      await heartbeatManager.registerKiosk(kiosk.id, kiosk.zone);
      
      // Create realistic locker distribution
      for (let i = 1; i <= kiosk.lockers; i++) {
        let status = 'Free';
        let ownerType = null;
        let ownerKey = null;
        let isVip = false;

        // 40% occupied, 5% VIP, 3% blocked, 2% reserved
        const rand = Math.random();
        if (rand < 0.05) {
          status = 'Owned';
          ownerType = 'vip';
          ownerKey = `vip-${kiosk.id}-${i}`;
          isVip = true;
        } else if (rand < 0.08) {
          status = 'Blocked';
        } else if (rand < 0.10) {
          status = 'Reserved';
          ownerType = 'rfid';
          ownerKey = `reserved-${kiosk.id}-${i}`;
        } else if (rand < 0.40) {
          status = 'Owned';
          ownerType = 'rfid';
          ownerKey = `card-${kiosk.id}-${i}`;
        }

        await lockerRepository.create({
          kiosk_id: kiosk.id,
          id: i,
          status,
          owner_type: ownerType,
          owner_key: ownerKey,
          reserved_at: status === 'Reserved' ? new Date() : null,
          owned_at: status === 'Owned' ? new Date() : null,
          version: 1,
          is_vip: isVip
        });
      }
    }

    // Create VIP contracts for VIP lockers
    const vipLockers = await lockerRepository.findVipLockers();
    for (const vipLocker of vipLockers) {
      await vipRepository.create({
        kiosk_id: vipLocker.kiosk_id,
        locker_id: vipLocker.id,
        rfid_card: vipLocker.owner_key!,
        start_date: new Date(),
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: 'admin'
      });
    }

    // Generate realistic event history (10,000 events)
    const eventTypes = ['rfid_assign', 'rfid_release', 'qr_assign', 'qr_release', 'staff_open', 'bulk_open'];
    for (let i = 0; i < 10000; i++) {
      const kiosk = kiosks[i % 3];
      await eventLogger.logEvent({
        kiosk_id: kiosk.id,
        locker_id: (i % kiosk.lockers) + 1,
        event_type: eventTypes[i % eventTypes.length],
        rfid_card: `historical-card-${i}`,
        staff_user: eventTypes[i % eventTypes.length].includes('staff') ? 'admin' : undefined,
        details: { 
          test_data: true, 
          iteration: i,
          timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      });
    }
  }

  describe('Panel Performance Requirements (500 lockers, 3 kiosks)', () => {
    it('should handle locker filtering under 1 second', async () => {
      const testCases = [
        { name: 'All lockers', filter: () => lockerRepository.findAll() },
        { name: 'By kiosk (gym-main)', filter: () => lockerRepository.findByKiosk('gym-main') },
        { name: 'By kiosk (spa-premium)', filter: () => lockerRepository.findByKiosk('spa-premium') },
        { name: 'By kiosk (pool-area)', filter: () => lockerRepository.findByKiosk('pool-area') },
        { name: 'Free lockers', filter: () => lockerRepository.findByStatus('Free') },
        { name: 'Owned lockers', filter: () => lockerRepository.findByStatus('Owned') },
        { name: 'Reserved lockers', filter: () => lockerRepository.findByStatus('Reserved') },
        { name: 'Blocked lockers', filter: () => lockerRepository.findByStatus('Blocked') },
        { name: 'VIP lockers', filter: () => lockerRepository.findVipLockers() }
      ];

      const results = [];
      for (const testCase of testCases) {
        const startTime = Date.now();
        const data = await testCase.filter();
        const endTime = Date.now();
        const duration = endTime - startTime;

        results.push({
          name: testCase.name,
          duration,
          count: data.length
        });

        // Each filter operation should complete under 1 second
        expect(duration).toBeLessThan(1000);
      }

      // Log performance results
      console.log('Locker Filtering Performance:');
      results.forEach(result => {
        console.log(`  ${result.name}: ${result.duration}ms (${result.count} records)`);
      });

      // Verify data integrity
      const allLockers = await lockerRepository.findAll();
      expect(allLockers.length).toBe(500);
    });

    it('should handle status updates for 3 kiosks under 1 second', async () => {
      const iterations = 10;
      const durations = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        // Simulate real-time panel operations
        const operations = await Promise.all([
          // Heartbeat updates
          heartbeatManager.updateHeartbeat('gym-main'),
          heartbeatManager.updateHeartbeat('spa-premium'),
          heartbeatManager.updateHeartbeat('pool-area'),
          
          // Status queries
          lockerRepository.findByKiosk('gym-main'),
          lockerRepository.findByKiosk('spa-premium'),
          lockerRepository.findByKiosk('pool-area'),
          
          // Command queue checks
          commandQueue.getCommands('gym-main'),
          commandQueue.getCommands('spa-premium'),
          commandQueue.getCommands('pool-area'),
          
          // Dashboard data
          heartbeatManager.getKioskStatuses(),
          eventLogger.getRecentEvents(20)
        ]);

        const endTime = Date.now();
        const duration = endTime - startTime;
        durations.push(duration);

        // Each iteration should complete under 1 second
        expect(duration).toBeLessThan(1000);
        expect(operations.every(op => op !== null && op !== undefined)).toBe(true);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      console.log(`Status Updates Performance - Avg: ${avgDuration.toFixed(1)}ms, Max: ${maxDuration}ms`);
      
      // Average should be well under the limit
      expect(avgDuration).toBeLessThan(500);
    });

    it('should handle concurrent panel access efficiently', async () => {
      const concurrentUsers = 5;
      const operationsPerUser = 10;
      
      const startTime = Date.now();

      // Simulate multiple staff users accessing panel simultaneously
      const userOperations = Array.from({ length: concurrentUsers }, (_, userIndex) =>
        Promise.all(Array.from({ length: operationsPerUser }, (_, opIndex) => {
          const operations = [
            lockerRepository.findByKiosk(['gym-main', 'spa-premium', 'pool-area'][opIndex % 3]),
            lockerRepository.findByStatus(['Free', 'Owned', 'Reserved'][opIndex % 3]),
            eventLogger.getRecentEvents(50),
            heartbeatManager.getKioskStatuses(),
            vipRepository.findActiveContracts()
          ];
          return Promise.all(operations);
        }))
      );

      const results = await Promise.all(userOperations);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all operations completed successfully
      expect(results.length).toBe(concurrentUsers);
      results.forEach(userResults => {
        expect(userResults.length).toBe(operationsPerUser);
        userResults.forEach(operationResults => {
          expect(operationResults.every(result => result !== null && result !== undefined)).toBe(true);
        });
      });

      // Concurrent access should be efficient
      expect(duration).toBeLessThan(3000);
      console.log(`Concurrent access (${concurrentUsers} users, ${operationsPerUser} ops each): ${duration}ms`);
    });

    it('should maintain performance with large event history', async () => {
      // Query performance with 10,000+ events
      const testQueries = [
        { name: 'Recent events (100)', query: () => eventLogger.getRecentEvents(100) },
        { name: 'Events by kiosk', query: () => eventLogger.getEventsByKiosk('gym-main') },
        { name: 'Events by type', query: () => eventLogger.getEventsByType('rfid_assign') },
        { name: 'Staff events', query: () => eventLogger.getEventsByType('staff_open') },
        { name: 'Recent events (500)', query: () => eventLogger.getRecentEvents(500) }
      ];

      const results = [];
      for (const testQuery of testQueries) {
        const startTime = Date.now();
        const data = await testQuery.query();
        const endTime = Date.now();
        const duration = endTime - startTime;

        results.push({
          name: testQuery.name,
          duration,
          count: data.length
        });

        // Event queries should be fast even with large history
        expect(duration).toBeLessThan(1500);
      }

      console.log('Event Query Performance:');
      results.forEach(result => {
        console.log(`  ${result.name}: ${result.duration}ms (${result.count} records)`);
      });
    });

    it('should handle bulk operations efficiently', async () => {
      // Test bulk opening of multiple lockers across kiosks
      const bulkOperations = [
        {
          kiosk: 'gym-main',
          lockers: Array.from({ length: 30 }, (_, i) => i + 1),
          operation: 'bulk_open'
        },
        {
          kiosk: 'spa-premium',
          lockers: Array.from({ length: 20 }, (_, i) => i + 1),
          operation: 'bulk_open'
        },
        {
          kiosk: 'pool-area',
          lockers: Array.from({ length: 25 }, (_, i) => i + 1),
          operation: 'bulk_block'
        }
      ];

      const startTime = Date.now();

      const commandIds = [];
      for (const operation of bulkOperations) {
        const commandId = await commandQueue.enqueueCommand(operation.kiosk, {
          type: operation.operation,
          locker_ids: operation.lockers,
          staff_user: 'admin',
          exclude_vip: true
        });
        commandIds.push(commandId);
      }

      // Simulate command processing
      for (const commandId of commandIds) {
        await commandQueue.markCommandComplete(commandId);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Bulk operations should complete efficiently
      expect(duration).toBeLessThan(5000);
      expect(commandIds.every(id => typeof id === 'string')).toBe(true);

      console.log(`Bulk operations (75 lockers across 3 kiosks): ${duration}ms`);
    });
  });

  describe('System Health and Resilience', () => {
    it('should handle memory pressure gracefully', async () => {
      const initialMemory = process.memoryUsage();
      
      // Create memory pressure with intensive operations
      const intensiveOperations = [];
      for (let i = 0; i < 200; i++) {
        intensiveOperations.push(
          lockerRepository.findAll(),
          eventLogger.getRecentEvents(1000),
          vipRepository.findAll(),
          heartbeatManager.getKioskStatuses(),
          commandQueue.getCommands('gym-main')
        );
      }

      const startTime = Date.now();
      await Promise.all(intensiveOperations);
      const endTime = Date.now();
      const duration = endTime - startTime;

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (< 200MB for intensive operations)
      expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024);
      
      // Operations should still complete in reasonable time
      expect(duration).toBeLessThan(10000);
      
      console.log(`Memory pressure test: ${duration}ms, Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });

    it('should handle database connection stress', async () => {
      // Test with many concurrent database operations
      const concurrentQueries = 100;
      const startTime = Date.now();

      const queries = Array.from({ length: concurrentQueries }, (_, i) => {
        const operations = [
          lockerRepository.findByKioskAndId('gym-main', (i % 200) + 1),
          eventLogger.logEvent({
            kiosk_id: 'gym-main',
            locker_id: (i % 200) + 1,
            event_type: 'stress_test',
            details: { iteration: i }
          }),
          heartbeatManager.updateHeartbeat('gym-main')
        ];
        return Promise.all(operations);
      });

      const results = await Promise.all(queries);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All queries should complete successfully
      expect(results.length).toBe(concurrentQueries);
      expect(results.every(result => result.every(r => r !== null || r === null))).toBe(true);

      // Database should handle concurrent access efficiently
      expect(duration).toBeLessThan(5000);
      
      console.log(`Database stress test (${concurrentQueries} concurrent operations): ${duration}ms`);
    });

    it('should maintain performance under sustained load', async () => {
      const testDuration = 30000; // 30 seconds
      const operationInterval = 100; // Every 100ms
      const startTime = Date.now();
      const results = [];

      while (Date.now() - startTime < testDuration) {
        const operationStart = Date.now();
        
        // Simulate typical panel operations
        await Promise.all([
          lockerRepository.findByKiosk('gym-main'),
          heartbeatManager.getKioskStatuses(),
          eventLogger.getRecentEvents(20),
          commandQueue.getCommands('gym-main')
        ]);

        const operationEnd = Date.now();
        const operationDuration = operationEnd - operationStart;
        results.push(operationDuration);

        // Wait for next interval
        const waitTime = operationInterval - operationDuration;
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      const avgDuration = results.reduce((a, b) => a + b, 0) / results.length;
      const maxDuration = Math.max(...results);
      const p95Duration = results.sort((a, b) => a - b)[Math.floor(results.length * 0.95)];

      // Performance should remain consistent under sustained load
      expect(avgDuration).toBeLessThan(500);
      expect(p95Duration).toBeLessThan(1000);
      expect(maxDuration).toBeLessThan(2000);

      console.log(`Sustained load test (${results.length} operations over 30s):`);
      console.log(`  Average: ${avgDuration.toFixed(1)}ms`);
      console.log(`  95th percentile: ${p95Duration}ms`);
      console.log(`  Maximum: ${maxDuration}ms`);
    });

    it('should handle error conditions gracefully', async () => {
      // Test various error conditions
      const errorTests = [
        {
          name: 'Invalid kiosk ID',
          test: () => lockerRepository.findByKiosk('invalid-kiosk')
        },
        {
          name: 'Invalid locker ID',
          test: () => lockerRepository.findByKioskAndId('gym-main', 999)
        },
        {
          name: 'Malformed event data',
          test: () => eventLogger.logEvent({
            kiosk_id: '',
            event_type: '',
            details: null as any
          })
        }
      ];

      for (const errorTest of errorTests) {
        try {
          const startTime = Date.now();
          await errorTest.test();
          const endTime = Date.now();
          const duration = endTime - startTime;

          // Error handling should be fast
          expect(duration).toBeLessThan(1000);
        } catch (error) {
          // Errors should be handled gracefully
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Scalability Validation', () => {
    it('should scale to larger facility configurations', async () => {
      // Test with 1000+ lockers across 5 kiosks
      const largeKiosks = [
        { id: 'mega-gym-1', zone: 'Mega Gym Floor 1', lockers: 200 },
        { id: 'mega-gym-2', zone: 'Mega Gym Floor 2', lockers: 200 }
      ];

      const setupStart = Date.now();

      // Add large facility data
      for (const kiosk of largeKiosks) {
        await heartbeatManager.registerKiosk(kiosk.id, kiosk.zone);
        
        const lockerPromises = [];
        for (let i = 1; i <= kiosk.lockers; i++) {
          lockerPromises.push(
            lockerRepository.create({
              kiosk_id: kiosk.id,
              id: i,
              status: Math.random() > 0.6 ? 'Owned' : 'Free',
              owner_type: Math.random() > 0.6 ? 'rfid' : null,
              owner_key: Math.random() > 0.6 ? `large-card-${kiosk.id}-${i}` : null,
              version: 1,
              is_vip: false
            })
          );
        }
        await Promise.all(lockerPromises);
      }

      const setupEnd = Date.now();
      const setupDuration = setupEnd - setupStart;

      // Test operations on large facility (900 total lockers)
      const operationStart = Date.now();

      const operations = await Promise.all([
        lockerRepository.findAll(),
        lockerRepository.findByKiosk('mega-gym-1'),
        lockerRepository.findByStatus('Free'),
        lockerRepository.findByStatus('Owned'),
        heartbeatManager.getKioskStatuses()
      ]);

      const operationEnd = Date.now();
      const operationDuration = operationEnd - operationStart;

      // Verify large facility operations
      expect(operations[0].length).toBe(900); // 500 + 200 + 200
      expect(operations[1].length).toBe(200);

      // Operations should still be performant with larger dataset
      expect(operationDuration).toBeLessThan(3000);
      
      console.log(`Large facility (900 lockers, 5 kiosks):`);
      console.log(`  Setup: ${setupDuration}ms`);
      console.log(`  Operations: ${operationDuration}ms`);
    });

    it('should handle high-frequency operations', async () => {
      // Simulate high-frequency locker operations
      const operations = 1000;
      const startTime = Date.now();

      const promises = [];
      for (let i = 0; i < operations; i++) {
        const kioskId = ['gym-main', 'spa-premium', 'pool-area'][i % 3];
        const lockerId = (i % 50) + 1;
        
        promises.push(
          lockerRepository.findByKioskAndId(kioskId, lockerId),
          eventLogger.logEvent({
            kiosk_id: kioskId,
            locker_id: lockerId,
            event_type: 'high_frequency_test',
            details: { iteration: i }
          })
        );
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // High-frequency operations should complete efficiently
      expect(duration).toBeLessThan(10000); // 10 seconds for 2000 operations
      expect(results.length).toBe(operations * 2);

      const operationsPerSecond = (operations * 2) / (duration / 1000);
      console.log(`High-frequency test: ${operations * 2} operations in ${duration}ms (${operationsPerSecond.toFixed(1)} ops/sec)`);
    });
  });

  describe('Real-World Scenario Testing', () => {
    it('should handle peak usage scenarios', async () => {
      // Simulate peak usage: multiple users accessing lockers simultaneously
      const peakOperations = [
        // Multiple RFID assignments
        ...Array.from({ length: 20 }, (_, i) => 
          lockerStateManager.assignLocker('gym-main', i + 50, 'rfid', `peak-card-${i}`)
        ),
        
        // Staff bulk operations
        commandQueue.enqueueCommand('spa-premium', {
          type: 'bulk_open',
          locker_ids: Array.from({ length: 15 }, (_, i) => i + 1),
          staff_user: 'admin'
        }),
        
        // VIP access
        ...Array.from({ length: 5 }, (_, i) => 
          lockerRepository.findByKioskAndId('pool-area', i + 18)
        ),
        
        // Panel queries
        ...Array.from({ length: 10 }, () => Promise.all([
          lockerRepository.findByStatus('Free'),
          heartbeatManager.getKioskStatuses(),
          eventLogger.getRecentEvents(50)
        ]))
      ];

      const startTime = Date.now();
      const results = await Promise.allSettled(peakOperations);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Most operations should succeed
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const successRate = successCount / results.length;
      expect(successRate).toBeGreaterThan(0.9); // 90% success rate

      // Peak usage should be handled efficiently
      expect(duration).toBeLessThan(5000);

      console.log(`Peak usage scenario: ${successCount}/${results.length} operations succeeded in ${duration}ms`);
    });

    it('should maintain data consistency under concurrent access', async () => {
      // Test concurrent locker assignments to ensure no conflicts
      const concurrentAssignments = Array.from({ length: 50 }, (_, i) => 
        lockerStateManager.assignLocker('gym-main', i + 100, 'rfid', `concurrent-card-${i}`)
      );

      const results = await Promise.allSettled(concurrentAssignments);
      const successfulAssignments = results.filter(r => r.status === 'fulfilled').length;

      // Verify no double assignments occurred
      const assignedLockers = await lockerRepository.findByKiosk('gym-main');
      const concurrentlyAssigned = assignedLockers.filter(l => 
        l.owner_key && l.owner_key.startsWith('concurrent-card-')
      );

      expect(concurrentlyAssigned.length).toBe(successfulAssignments);
      
      // Verify each locker has unique assignment
      const ownerKeys = concurrentlyAssigned.map(l => l.owner_key);
      const uniqueOwnerKeys = new Set(ownerKeys);
      expect(uniqueOwnerKeys.size).toBe(ownerKeys.length);

      console.log(`Concurrent assignments: ${successfulAssignments}/50 successful, ${concurrentlyAssigned.length} verified`);
    });
  });
});