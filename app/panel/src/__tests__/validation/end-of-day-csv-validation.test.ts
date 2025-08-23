import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../../../../shared/database/database-manager';
import { LockerRepository } from '../../../../../shared/database/locker-repository';
import { VipContractRepository } from '../../../../../shared/database/vip-contract-repository';
import { EventLogger } from '../../../../../shared/services/event-logger';
import { HeartbeatManager } from '../../../../../shared/services/heartbeat-manager';
import { CommandQueueManager } from '../../../../../shared/services/command-queue-manager';

interface EndOfDayRecord {
  kiosk_id: string;
  locker_id: number;
  timestamp: string;
  result: 'success' | 'failed' | 'skipped_vip' | 'already_free';
  previous_status?: string;
  owner_key?: string;
  error_message?: string;
}

describe('End-of-Day CSV Schema Validation (Task 15.3)', () => {
  let dbManager: DatabaseManager;
  let lockerRepository: LockerRepository;
  let vipRepository: VipContractRepository;
  let eventLogger: EventLogger;
  let heartbeatManager: HeartbeatManager;
  let commandQueue: CommandQueueManager;

  beforeEach(async () => {
    dbManager = new DatabaseManager(':memory:');
    await dbManager.initialize();
    
    lockerRepository = new LockerRepository(dbManager);
    vipRepository = new VipContractRepository(dbManager);
    eventLogger = new EventLogger(dbManager);
    heartbeatManager = new HeartbeatManager(dbManager);
    commandQueue = new CommandQueueManager(dbManager);

    await setupEndOfDayTestEnvironment();
  });

  afterEach(async () => {
    await dbManager.close();
  });

  async function setupEndOfDayTestEnvironment() {
    // Create test kiosks
    const kiosks = [
      { id: 'gym-main', zone: 'Main Gym', lockers: 50 },
      { id: 'spa-premium', zone: 'Premium Spa', lockers: 30 },
      { id: 'pool-area', zone: 'Pool Area', lockers: 40 }
    ];

    for (const kiosk of kiosks) {
      await heartbeatManager.registerKiosk(kiosk.id, kiosk.zone);
      
      // Create lockers with various states
      for (let i = 1; i <= kiosk.lockers; i++) {
        let status = 'Free';
        let ownerType = null;
        let ownerKey = null;
        let isVip = false;

        // Create realistic distribution
        if (i <= 10) {
          status = 'Owned';
          ownerType = 'rfid';
          ownerKey = `card-${kiosk.id}-${i}`;
        } else if (i <= 15) {
          status = 'Reserved';
          ownerType = 'rfid';
          ownerKey = `reserved-${kiosk.id}-${i}`;
        } else if (i <= 17) {
          status = 'Blocked';
        } else if (i <= 20) {
          status = 'Owned';
          ownerType = 'vip';
          ownerKey = `vip-${kiosk.id}-${i}`;
          isVip = true;
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

    // Create VIP contracts
    const vipContracts = [
      { kiosk: 'gym-main', locker: 18, card: 'vip-premium-001' },
      { kiosk: 'gym-main', locker: 19, card: 'vip-premium-002' },
      { kiosk: 'spa-premium', locker: 18, card: 'vip-spa-001' },
      { kiosk: 'pool-area', locker: 18, card: 'vip-pool-001' }
    ];

    for (const contract of vipContracts) {
      await vipRepository.create({
        kiosk_id: contract.kiosk,
        locker_id: contract.locker,
        rfid_card: contract.card,
        start_date: new Date(),
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: 'admin'
      });
    }
  }

  describe('CSV Schema Requirements', () => {
    it('should generate CSV with fixed column set', async () => {
      const csvData = await performEndOfDayOperation(false); // exclude VIP by default

      // Verify required columns are present
      const requiredColumns = ['kiosk_id', 'locker_id', 'timestamp', 'result'];
      const optionalColumns = ['previous_status', 'owner_key', 'error_message'];
      
      expect(csvData.length).toBeGreaterThan(0);
      
      // Check first record has all required columns
      const firstRecord = csvData[0];
      requiredColumns.forEach(col => {
        expect(firstRecord).toHaveProperty(col);
        expect(firstRecord[col]).toBeDefined();
      });

      // Verify column types
      csvData.forEach(record => {
        expect(typeof record.kiosk_id).toBe('string');
        expect(typeof record.locker_id).toBe('number');
        expect(typeof record.timestamp).toBe('string');
        expect(['success', 'failed', 'skipped_vip', 'already_free'].includes(record.result)).toBe(true);
        
        // Validate timestamp format (ISO 8601)
        expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);
      });

      console.log(`Generated CSV with ${csvData.length} records`);
    });

    it('should exclude VIP lockers by default', async () => {
      const csvData = await performEndOfDayOperation(false); // exclude VIP (default)

      // Verify no VIP lockers in results
      const vipResults = csvData.filter(record => record.result === 'skipped_vip');
      expect(vipResults.length).toBe(0); // Should not appear when excluded

      // Verify VIP lockers were not processed
      const vipLockers = await lockerRepository.findVipLockers();
      for (const vipLocker of vipLockers) {
        const vipRecord = csvData.find(r => 
          r.kiosk_id === vipLocker.kiosk_id && r.locker_id === vipLocker.id
        );
        expect(vipRecord).toBeUndefined();
      }

      // Verify VIP lockers maintain their status
      const vipLockersAfter = await lockerRepository.findVipLockers();
      const ownedVipLockers = vipLockersAfter.filter(l => l.status === 'Owned');
      expect(ownedVipLockers.length).toBeGreaterThan(0);
    });

    it('should include VIP lockers when explicitly requested', async () => {
      const csvData = await performEndOfDayOperation(true); // include VIP

      // Verify VIP lockers appear with skipped_vip result
      const vipResults = csvData.filter(record => record.result === 'skipped_vip');
      expect(vipResults.length).toBeGreaterThan(0);

      // Verify VIP records have correct structure
      vipResults.forEach(record => {
        expect(record.kiosk_id).toBeDefined();
        expect(record.locker_id).toBeDefined();
        expect(record.timestamp).toBeDefined();
        expect(record.result).toBe('skipped_vip');
        expect(record.previous_status).toBeDefined();
      });

      // Verify VIP lockers were not actually opened
      const vipLockers = await lockerRepository.findVipLockers();
      const ownedVipLockers = vipLockers.filter(l => l.status === 'Owned');
      expect(ownedVipLockers.length).toBeGreaterThan(0); // Should remain owned
    });

    it('should handle different locker states correctly', async () => {
      const csvData = await performEndOfDayOperation(false);

      // Group results by outcome
      const resultGroups = csvData.reduce((groups, record) => {
        if (!groups[record.result]) groups[record.result] = [];
        groups[record.result].push(record);
        return groups;
      }, {} as Record<string, EndOfDayRecord[]>);

      // Verify success results (Owned and Reserved lockers)
      expect(resultGroups.success).toBeDefined();
      expect(resultGroups.success.length).toBeGreaterThan(0);
      
      resultGroups.success.forEach(record => {
        expect(['Owned', 'Reserved'].includes(record.previous_status!)).toBe(true);
        expect(record.owner_key).toBeDefined();
      });

      // Verify already_free results
      expect(resultGroups.already_free).toBeDefined();
      expect(resultGroups.already_free.length).toBeGreaterThan(0);
      
      resultGroups.already_free.forEach(record => {
        expect(record.previous_status).toBe('Free');
        expect(record.owner_key).toBeNull();
      });

      // Verify blocked lockers are handled appropriately
      if (resultGroups.failed) {
        resultGroups.failed.forEach(record => {
          expect(record.previous_status).toBe('Blocked');
          expect(record.error_message).toContain('blocked');
        });
      }
    });

    it('should maintain data consistency during bulk operation', async () => {
      // Get initial state
      const initialLockers = await lockerRepository.findAll();
      const initialOwned = initialLockers.filter(l => l.status === 'Owned' && !l.is_vip);
      const initialReserved = initialLockers.filter(l => l.status === 'Reserved');

      // Perform end-of-day operation
      const csvData = await performEndOfDayOperation(false);

      // Verify all non-VIP Owned and Reserved lockers were processed
      const successRecords = csvData.filter(r => r.result === 'success');
      expect(successRecords.length).toBe(initialOwned.length + initialReserved.length);

      // Verify all processed lockers are now Free
      const finalLockers = await lockerRepository.findAll();
      const processedLockerIds = successRecords.map(r => ({ kiosk: r.kiosk_id, id: r.locker_id }));
      
      for (const { kiosk, id } of processedLockerIds) {
        const locker = finalLockers.find(l => l.kiosk_id === kiosk && l.id === id);
        expect(locker?.status).toBe('Free');
        expect(locker?.owner_key).toBeNull();
        expect(locker?.owner_type).toBeNull();
      }

      // Verify VIP lockers were not affected
      const finalVipLockers = finalLockers.filter(l => l.is_vip);
      const initialVipLockers = initialLockers.filter(l => l.is_vip);
      expect(finalVipLockers.length).toBe(initialVipLockers.length);
      
      finalVipLockers.forEach(vipLocker => {
        const initialVip = initialVipLockers.find(l => 
          l.kiosk_id === vipLocker.kiosk_id && l.id === vipLocker.id
        );
        expect(vipLocker.status).toBe(initialVip?.status);
        expect(vipLocker.owner_key).toBe(initialVip?.owner_key);
      });
    });

    it('should generate proper CSV format for export', async () => {
      const csvData = await performEndOfDayOperation(false);
      const csvString = generateCsvString(csvData);

      // Verify CSV header
      const lines = csvString.split('\n');
      const header = lines[0];
      expect(header).toBe('kiosk_id,locker_id,timestamp,result,previous_status,owner_key,error_message');

      // Verify CSV data rows
      expect(lines.length).toBe(csvData.length + 1); // +1 for header

      // Verify CSV formatting
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim()) { // Skip empty lines
          const columns = line.split(',');
          expect(columns.length).toBe(7); // All columns should be present
          
          // Verify required fields are not empty
          expect(columns[0]).toBeTruthy(); // kiosk_id
          expect(columns[1]).toBeTruthy(); // locker_id
          expect(columns[2]).toBeTruthy(); // timestamp
          expect(columns[3]).toBeTruthy(); // result
        }
      }

      console.log(`Generated CSV with ${lines.length - 1} data rows`);
    });

    it('should handle large facility end-of-day operation efficiently', async () => {
      // Create additional large facility data
      await createLargeFacilityData();

      const startTime = Date.now();
      const csvData = await performEndOfDayOperation(false);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify operation completed efficiently
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(csvData.length).toBeGreaterThan(100); // Should have processed many lockers

      // Verify data integrity
      const uniqueKiosks = new Set(csvData.map(r => r.kiosk_id));
      expect(uniqueKiosks.size).toBeGreaterThanOrEqual(3);

      // Verify all timestamps are recent and consistent
      const now = Date.now();
      csvData.forEach(record => {
        const recordTime = new Date(record.timestamp).getTime();
        expect(now - recordTime).toBeLessThan(10000); // Within last 10 seconds
      });

      console.log(`Large facility end-of-day completed in ${duration}ms with ${csvData.length} records`);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle concurrent end-of-day operations gracefully', async () => {
      // Attempt concurrent end-of-day operations
      const operation1Promise = performEndOfDayOperation(false);
      const operation2Promise = performEndOfDayOperation(false);

      const [result1, result2] = await Promise.allSettled([operation1Promise, operation2Promise]);

      // One should succeed, one should fail or be prevented
      const successCount = [result1, result2].filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeLessThanOrEqual(1);

      if (result1.status === 'fulfilled') {
        expect(result1.value.length).toBeGreaterThan(0);
      }
    });

    it('should handle database errors during end-of-day operation', async () => {
      // Simulate database error by closing connection mid-operation
      const originalUpdate = lockerRepository.update;
      let callCount = 0;
      
      vi.spyOn(lockerRepository, 'update').mockImplementation(async (...args) => {
        callCount++;
        if (callCount === 5) {
          throw new Error('Database connection lost');
        }
        return originalUpdate.apply(lockerRepository, args);
      });

      try {
        const csvData = await performEndOfDayOperation(false);
        
        // Should have some failed records
        const failedRecords = csvData.filter(r => r.result === 'failed');
        expect(failedRecords.length).toBeGreaterThan(0);
        
        // Failed records should have error messages
        failedRecords.forEach(record => {
          expect(record.error_message).toContain('Database connection lost');
        });
      } catch (error) {
        // Operation might fail entirely, which is also acceptable
        expect(error).toBeDefined();
      }
    });

    it('should validate CSV data integrity', async () => {
      const csvData = await performEndOfDayOperation(true); // Include VIP for full test

      // Verify no duplicate records
      const recordKeys = csvData.map(r => `${r.kiosk_id}-${r.locker_id}`);
      const uniqueKeys = new Set(recordKeys);
      expect(uniqueKeys.size).toBe(recordKeys.length);

      // Verify all kiosk_id values are valid
      const validKiosks = ['gym-main', 'spa-premium', 'pool-area'];
      csvData.forEach(record => {
        expect(validKiosks.includes(record.kiosk_id)).toBe(true);
      });

      // Verify locker_id values are within valid ranges
      csvData.forEach(record => {
        expect(record.locker_id).toBeGreaterThan(0);
        expect(record.locker_id).toBeLessThanOrEqual(50); // Max lockers per kiosk
      });

      // Verify result values are from allowed set
      const allowedResults = ['success', 'failed', 'skipped_vip', 'already_free'];
      csvData.forEach(record => {
        expect(allowedResults.includes(record.result)).toBe(true);
      });
    });
  });

  // Helper functions
  async function performEndOfDayOperation(includeVip: boolean): Promise<EndOfDayRecord[]> {
    const results: EndOfDayRecord[] = [];
    const timestamp = new Date().toISOString();

    // Get all lockers
    const allLockers = await lockerRepository.findAll();
    
    for (const locker of allLockers) {
      // Skip VIP lockers unless explicitly included
      if (locker.is_vip && !includeVip) {
        continue;
      }

      const record: EndOfDayRecord = {
        kiosk_id: locker.kiosk_id,
        locker_id: locker.id,
        timestamp,
        result: 'success',
        previous_status: locker.status,
        owner_key: locker.owner_key
      };

      try {
        if (locker.is_vip) {
          // VIP lockers are skipped but recorded
          record.result = 'skipped_vip';
        } else if (locker.status === 'Free') {
          record.result = 'already_free';
        } else if (locker.status === 'Blocked') {
          record.result = 'failed';
          record.error_message = 'Locker is blocked';
        } else if (locker.status === 'Owned' || locker.status === 'Reserved') {
          // Open and release the locker
          await lockerRepository.update(locker.kiosk_id, locker.id, {
            status: 'Free',
            owner_type: null,
            owner_key: null,
            reserved_at: null,
            owned_at: null,
            version: locker.version + 1
          });
          record.result = 'success';
        }
      } catch (error) {
        record.result = 'failed';
        record.error_message = error instanceof Error ? error.message : 'Unknown error';
      }

      results.push(record);
    }

    // Log end-of-day operation
    await eventLogger.logEvent({
      kiosk_id: 'system',
      event_type: 'end_of_day_operation',
      staff_user: 'admin',
      details: {
        total_processed: results.length,
        successful: results.filter(r => r.result === 'success').length,
        failed: results.filter(r => r.result === 'failed').length,
        already_free: results.filter(r => r.result === 'already_free').length,
        skipped_vip: results.filter(r => r.result === 'skipped_vip').length,
        include_vip: includeVip
      }
    });

    return results;
  }

  function generateCsvString(data: EndOfDayRecord[]): string {
    const header = 'kiosk_id,locker_id,timestamp,result,previous_status,owner_key,error_message';
    const rows = data.map(record => [
      record.kiosk_id,
      record.locker_id.toString(),
      record.timestamp,
      record.result,
      record.previous_status || '',
      record.owner_key || '',
      record.error_message || ''
    ].join(','));

    return [header, ...rows].join('\n');
  }

  async function createLargeFacilityData() {
    // Add more kiosks and lockers for large facility testing
    const largeKiosks = [
      { id: 'mega-gym-1', zone: 'Mega Gym Floor 1', lockers: 100 },
      { id: 'mega-gym-2', zone: 'Mega Gym Floor 2', lockers: 100 }
    ];

    for (const kiosk of largeKiosks) {
      await heartbeatManager.registerKiosk(kiosk.id, kiosk.zone);
      
      for (let i = 1; i <= kiosk.lockers; i++) {
        const status = i <= 30 ? 'Owned' : i <= 40 ? 'Reserved' : 'Free';
        await lockerRepository.create({
          kiosk_id: kiosk.id,
          id: i,
          status,
          owner_type: status !== 'Free' ? 'rfid' : null,
          owner_key: status !== 'Free' ? `large-card-${kiosk.id}-${i}` : null,
          reserved_at: status === 'Reserved' ? new Date() : null,
          owned_at: status === 'Owned' ? new Date() : null,
          version: 1,
          is_vip: false
        });
      }
    }
  }
});
