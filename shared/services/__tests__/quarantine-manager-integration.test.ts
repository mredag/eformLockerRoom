import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QuarantineManager } from '../quarantine-manager';
import { DatabaseConnection } from '../../database/connection';
import { ConfigurationManager } from '../configuration-manager';
import path from 'path';
import fs from 'fs';

describe('QuarantineManager Integration Tests', () => {
  let quarantineManager: QuarantineManager;
  let db: DatabaseConnection;
  let config: ConfigurationManager;
  let testDbPath: string;

  beforeEach(async () => {
    // Create temporary test database
    testDbPath = path.join(__dirname, `test-quarantine-${Date.now()}.db`);
    db = DatabaseConnection.getInstance(testDbPath);
    
    // Initialize database with required schema
    await db.run(`
      CREATE TABLE IF NOT EXISTS lockers (
        kiosk_id TEXT NOT NULL,
        id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Free',
        owner_type TEXT,
        owner_key TEXT,
        quarantine_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kiosk_id, id)
      )
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS settings_global (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        data_type TEXT NOT NULL DEFAULT 'string',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS settings_kiosk (
        kiosk_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        data_type TEXT NOT NULL DEFAULT 'string',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kiosk_id, key)
      )
    `);

    // Insert test configuration
    const configData = [
      ['quarantine_minutes_base', '5', 'number'],
      ['quarantine_minutes_ceiling', '20', 'number'],
      ['exit_quarantine_minutes', '20', 'number'],
      ['free_ratio_low', '0.1', 'number'],
      ['free_ratio_high', '0.5', 'number']
    ];

    for (const [key, value, dataType] of configData) {
      await db.run(
        'INSERT OR REPLACE INTO settings_global (key, value, data_type) VALUES (?, ?, ?)',
        [key, value, dataType]
      );
    }

    // Insert test lockers
    const lockers = [];
    for (let i = 1; i <= 30; i++) {
      lockers.push(['kiosk-1', i, 'Free']);
    }

    for (const [kioskId, lockerId, status] of lockers) {
      await db.run(
        'INSERT INTO lockers (kiosk_id, id, status) VALUES (?, ?, ?)',
        [kioskId, lockerId, status]
      );
    }

    config = new ConfigurationManager(db);
    quarantineManager = new QuarantineManager(db as any, config);
  });

  afterEach(async () => {
    await db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Real Database Integration', () => {
    it('should calculate quarantine based on actual locker data', async () => {
      // Set up scenario: 15 out of 30 lockers free (0.5 ratio)
      await db.run(`
        UPDATE lockers 
        SET status = 'Owned', owner_key = 'test-card' 
        WHERE kiosk_id = 'kiosk-1' AND id <= 15
      `);

      const result = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');

      expect(result.duration).toBe(20); // High capacity = max quarantine
      expect(result.reason).toBe('capacity_based_ratio_0.500');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should apply quarantine to actual locker', async () => {
      const application = await quarantineManager.applyQuarantine('kiosk-1', 5, 'capacity_based');

      expect(application.lockerId).toBe(5);
      expect(application.duration).toBe(20); // All lockers free = high capacity

      // Verify database was updated
      const locker = await db.get(
        'SELECT quarantine_until FROM lockers WHERE kiosk_id = ? AND id = ?',
        ['kiosk-1', 5]
      );

      expect(locker.quarantine_until).toBeTruthy();
      
      const quarantineUntil = new Date(locker.quarantine_until);
      const expectedTime = new Date(Date.now() + 20 * 60 * 1000);
      const timeDiff = Math.abs(quarantineUntil.getTime() - expectedTime.getTime());
      expect(timeDiff).toBeLessThan(5000); // Within 5 seconds
    });

    it('should correctly identify quarantined lockers', async () => {
      // Apply quarantine
      await quarantineManager.applyQuarantine('kiosk-1', 8, 'exit_quarantine');

      // Check if quarantined
      const isQuarantined = await quarantineManager.isQuarantined('kiosk-1', 8);
      expect(isQuarantined).toBe(true);

      // Check non-quarantined locker
      const isNotQuarantined = await quarantineManager.isQuarantined('kiosk-1', 9);
      expect(isNotQuarantined).toBe(false);
    });

    it('should handle different capacity scenarios correctly', async () => {
      // Test low capacity (3 out of 30 free = 0.1 ratio)
      await db.run(`
        UPDATE lockers 
        SET status = 'Owned', owner_key = 'test-card' 
        WHERE kiosk_id = 'kiosk-1' AND id <= 27
      `);

      const lowCapacityResult = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');
      expect(lowCapacityResult.duration).toBe(5); // Low capacity = min quarantine

      // Test medium capacity (9 out of 30 free = 0.3 ratio)
      await db.run(`
        UPDATE lockers 
        SET status = 'Free' 
        WHERE kiosk_id = 'kiosk-1' AND id BETWEEN 22 AND 27
      `);

      const mediumCapacityResult = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');
      expect(mediumCapacityResult.duration).toBe(13); // Linear interpolation: 5 + (0.3-0.1)/0.4 * 15 = 12.5 → 13
    });

    it('should cleanup expired quarantines', async () => {
      // Apply quarantine that expires immediately
      await db.run(`
        UPDATE lockers 
        SET quarantine_until = datetime('now', '-1 minute') 
        WHERE kiosk_id = 'kiosk-1' AND id IN (1, 2, 3)
      `);

      // Apply current quarantine
      await quarantineManager.applyQuarantine('kiosk-1', 4, 'capacity_based');

      const cleanedCount = await quarantineManager.cleanupExpiredQuarantines('kiosk-1');
      expect(cleanedCount).toBe(3);

      // Verify expired quarantines were removed
      const expiredLocker = await db.get(
        'SELECT quarantine_until FROM lockers WHERE kiosk_id = ? AND id = ?',
        ['kiosk-1', 1]
      );
      expect(expiredLocker.quarantine_until).toBeNull();

      // Verify current quarantine remains
      const currentLocker = await db.get(
        'SELECT quarantine_until FROM lockers WHERE kiosk_id = ? AND id = ?',
        ['kiosk-1', 4]
      );
      expect(currentLocker.quarantine_until).toBeTruthy();
    });

    it('should get list of quarantined lockers with remaining time', async () => {
      // Apply quarantines with different durations
      await quarantineManager.applyQuarantine('kiosk-1', 5, 'exit_quarantine'); // 20 minutes
      
      // Manually set a shorter quarantine for testing
      const shortQuarantineTime = new Date(Date.now() + 5 * 60 * 1000);
      await db.run(`
        UPDATE lockers 
        SET quarantine_until = ? 
        WHERE kiosk_id = 'kiosk-1' AND id = 6
      `, [shortQuarantineTime.toISOString()]);

      const quarantinedLockers = await quarantineManager.getQuarantinedLockers('kiosk-1');

      expect(quarantinedLockers).toHaveLength(2);
      
      // Should be sorted by expiration time (shortest first)
      expect(quarantinedLockers[0].lockerId).toBe(6);
      expect(quarantinedLockers[0].remainingMinutes).toBe(5);
      
      expect(quarantinedLockers[1].lockerId).toBe(5);
      expect(quarantinedLockers[1].remainingMinutes).toBe(20);
    });

    it('should remove quarantine by admin action', async () => {
      // Apply quarantine
      await quarantineManager.applyQuarantine('kiosk-1', 10, 'capacity_based');

      // Verify it's quarantined
      const isQuarantined = await quarantineManager.isQuarantined('kiosk-1', 10);
      expect(isQuarantined).toBe(true);

      // Remove quarantine
      const removed = await quarantineManager.removeQuarantine('kiosk-1', 10, 'admin-user');
      expect(removed).toBe(true);

      // Verify it's no longer quarantined
      const isStillQuarantined = await quarantineManager.isQuarantined('kiosk-1', 10);
      expect(isStillQuarantined).toBe(false);
    });

    it('should handle edge case with no available lockers', async () => {
      // Set all lockers to owned
      await db.run(`
        UPDATE lockers 
        SET status = 'Owned', owner_key = 'test-card' 
        WHERE kiosk_id = 'kiosk-1'
      `);

      const result = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');
      expect(result.duration).toBe(5); // Should default to minimum
      expect(result.reason).toBe('capacity_based_ratio_0.000');
    });

    it('should work with custom configuration values', async () => {
      // Update configuration for this kiosk
      await db.run(
        'INSERT OR REPLACE INTO settings_kiosk (kiosk_id, key, value, data_type) VALUES (?, ?, ?, ?)',
        ['kiosk-1', 'quarantine_minutes_base', '10', 'number']
      );
      
      await db.run(
        'INSERT OR REPLACE INTO settings_kiosk (kiosk_id, key, value, data_type) VALUES (?, ?, ?, ?)',
        ['kiosk-1', 'quarantine_minutes_ceiling', '30', 'number']
      );

      // Set low capacity scenario
      await db.run(`
        UPDATE lockers 
        SET status = 'Owned', owner_key = 'test-card' 
        WHERE kiosk_id = 'kiosk-1' AND id <= 27
      `);

      const result = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');
      expect(result.duration).toBe(10); // Custom minimum value
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle multiple concurrent quarantine operations', async () => {
      const operations = [];
      
      // Create multiple concurrent quarantine operations
      for (let i = 1; i <= 10; i++) {
        operations.push(
          quarantineManager.applyQuarantine('kiosk-1', i, 'capacity_based')
        );
      }

      const results = await Promise.all(operations);

      // All operations should succeed
      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result.lockerId).toBe(index + 1);
        expect(result.duration).toBe(20); // All free = high capacity
      });

      // Verify all lockers are quarantined
      const quarantinedCount = await db.get(
        'SELECT COUNT(*) as count FROM lockers WHERE kiosk_id = ? AND quarantine_until IS NOT NULL',
        ['kiosk-1']
      );
      expect(quarantinedCount.count).toBe(10);
    });

    it('should efficiently calculate free ratio for large locker sets', async () => {
      // Add more lockers to test performance
      const largeLockerSet = [];
      for (let i = 31; i <= 100; i++) {
        largeLockerSet.push(['kiosk-1', i, 'Free']);
      }

      for (const [kioskId, lockerId, status] of largeLockerSet) {
        await db.run(
          'INSERT INTO lockers (kiosk_id, id, status) VALUES (?, ?, ?)',
          [kioskId, lockerId, status]
        );
      }

      const startTime = Date.now();
      const result = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');
      const endTime = Date.now();

      expect(result.duration).toBe(20); // All 100 lockers free = high capacity
      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
    });
  });
});