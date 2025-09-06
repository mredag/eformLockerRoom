import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReserveCapacityManager } from '../reserve-capacity-manager';
import { ConfigurationManager } from '../configuration-manager';
import { DatabaseConnection } from '../../database/connection';
import { Locker } from '../../types/core-entities';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

describe('ReserveCapacityManager Integration Tests', () => {
  let db: Database.Database;
  let dbConnection: DatabaseConnection;
  let configManager: ConfigurationManager;
  let reserveManager: ReserveCapacityManager;
  const testDbPath = path.join(__dirname, 'test-reserve-capacity.db');

  beforeEach(async () => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create test database
    db = new Database(testDbPath);
    dbConnection = new DatabaseConnection(db);
    
    // Create tables
    await createTestTables();
    
    // Initialize managers
    configManager = new ConfigurationManager(dbConnection);
    reserveManager = new ReserveCapacityManager(dbConnection, configManager);
    
    // Seed configuration
    await seedConfiguration();
    
    // Create test lockers
    await createTestLockers();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function createTestTables() {
    // Create lockers table
    db.exec(`
      CREATE TABLE lockers (
        kiosk_id TEXT NOT NULL,
        id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Free',
        owner_type TEXT,
        owner_key TEXT,
        reserved_at DATETIME,
        owned_at DATETIME,
        version INTEGER NOT NULL DEFAULT 1,
        is_vip BOOLEAN NOT NULL DEFAULT 0,
        display_name TEXT,
        name_updated_at DATETIME,
        name_updated_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        free_since DATETIME,
        recent_owner TEXT,
        recent_owner_time DATETIME,
        quarantine_until DATETIME,
        wear_count INTEGER DEFAULT 0,
        overdue_from DATETIME,
        overdue_reason TEXT,
        suspected_occupied BOOLEAN DEFAULT 0,
        cleared_by TEXT,
        cleared_at DATETIME,
        return_hold_until DATETIME,
        owner_hot_until DATETIME,
        PRIMARY KEY (kiosk_id, id)
      );
    `);

    // Create configuration tables
    db.exec(`
      CREATE TABLE settings_global (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        data_type TEXT NOT NULL DEFAULT 'string',
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE settings_kiosk (
        kiosk_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        data_type TEXT NOT NULL DEFAULT 'string',
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kiosk_id, key)
      );
      
      CREATE TABLE config_version (
        id INTEGER PRIMARY KEY DEFAULT 1,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  async function seedConfiguration() {
    // Seed global configuration
    const globalConfig = [
      ['reserve_ratio', '0.1', 'number'],
      ['reserve_minimum', '2', 'number']
    ];

    for (const [key, value, dataType] of globalConfig) {
      db.prepare(`
        INSERT INTO settings_global (key, value, data_type) 
        VALUES (?, ?, ?)
      `).run(key, value, dataType);
    }

    // Initialize config version
    db.prepare(`INSERT INTO config_version (version) VALUES (1)`).run();
  }

  async function createTestLockers() {
    const kioskId = 'test-kiosk';
    
    // Create 30 total lockers
    for (let i = 1; i <= 30; i++) {
      const isVip = i <= 2; // First 2 are VIP
      const status = i <= 20 ? 'Free' : 'Owned'; // 20 free, 10 owned
      
      db.prepare(`
        INSERT INTO lockers (
          kiosk_id, id, status, is_vip, free_since, wear_count
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(kioskId, i, status, isVip, new Date().toISOString(), Math.floor(Math.random() * 10));
    }
  }

  describe('Real Database Integration', () => {
    it('should apply reserve capacity with real database queries', async () => {
      const kioskId = 'test-kiosk';
      
      // Get available lockers (should be 18: 20 free - 2 VIP)
      const availableLockers = await dbConnection.all<Locker>(
        `SELECT * FROM lockers 
         WHERE kiosk_id = ? AND status = 'Free' AND is_vip = 0
         ORDER BY id ASC`,
        [kioskId]
      );
      
      expect(availableLockers).toHaveLength(18);
      
      // Apply reserve capacity
      const result = await reserveManager.applyReserveCapacity(kioskId, availableLockers);
      
      // With 18 available: reserve = Math.ceil(18 * 0.1) = 2, assignable = 16
      expect(result.totalAvailable).toBe(18);
      expect(result.reserveRequired).toBe(2);
      expect(result.assignableCount).toBe(16);
      expect(result.reserveDisabled).toBe(false);
    });

    it('should get accurate reserve capacity status from database', async () => {
      const kioskId = 'test-kiosk';
      
      const status = await reserveManager.getReserveCapacityStatus(kioskId);
      
      expect(status.totalLockers).toBe(28); // 30 total - 2 VIP
      expect(status.availableLockers).toBe(18); // 20 free - 2 VIP
      expect(status.reserveRequired).toBe(2);
      expect(status.assignableLockers).toBe(16);
      expect(status.reserveDisabled).toBe(false);
      expect(status.lowStockAlert).toBe(false);
    });

    it('should handle low stock scenario with real data', async () => {
      const kioskId = 'test-kiosk';
      
      // Make most lockers owned to simulate low stock
      db.prepare(`
        UPDATE lockers 
        SET status = 'Owned' 
        WHERE kiosk_id = ? AND id > 5 AND is_vip = 0
      `).run(kioskId);
      
      const status = await reserveManager.getReserveCapacityStatus(kioskId);
      
      // Should have only 3 available (lockers 3, 4, 5 - excluding VIP 1,2)
      expect(status.availableLockers).toBe(3);
      expect(status.reserveDisabled).toBe(true); // 3 <= 2*2
      expect(status.assignableLockers).toBe(3);
      expect(status.lowStockAlert).toBe(true);
    });

    it('should monitor and generate alerts based on real data', async () => {
      const kioskId = 'test-kiosk';
      
      // Create critical low stock scenario
      db.prepare(`
        UPDATE lockers 
        SET status = 'Owned' 
        WHERE kiosk_id = ? AND id > 3 AND is_vip = 0
      `).run(kioskId);
      
      const monitoring = await reserveManager.monitorReserveCapacity(kioskId);
      
      expect(monitoring.alerts.length).toBeGreaterThan(0);
      
      const lowStockAlert = monitoring.alerts.find(a => a.type === 'low_stock');
      expect(lowStockAlert).toBeDefined();
      expect(lowStockAlert?.severity).toBe('high');
      
      const reserveDisabledAlert = monitoring.alerts.find(a => a.type === 'reserve_disabled');
      expect(reserveDisabledAlert).toBeDefined();
    });
  });

  describe('Configuration Integration', () => {
    it('should update configuration and reflect in reserve calculations', async () => {
      const kioskId = 'test-kiosk';
      
      // Update reserve configuration
      await reserveManager.updateReserveConfig(kioskId, {
        reserve_ratio: 0.2, // 20%
        reserve_minimum: 5
      });
      
      // Get status with new configuration
      const status = await reserveManager.getReserveCapacityStatus(kioskId);
      
      // With 18 available and 20% ratio: reserve = Math.ceil(18 * 0.2) = 4
      // With minimum 5: reserve = Math.max(4, 5) = 5
      expect(status.reserveRequired).toBe(5);
      expect(status.assignableLockers).toBe(13); // 18 - 5
      expect(status.reserveRatio).toBe(0.2);
      expect(status.reserveMinimum).toBe(5);
    });

    it('should reset configuration to global defaults', async () => {
      const kioskId = 'test-kiosk';
      
      // First set overrides
      await reserveManager.updateReserveConfig(kioskId, {
        reserve_ratio: 0.3,
        reserve_minimum: 10
      });
      
      // Then reset
      await reserveManager.resetReserveConfig(kioskId);
      
      // Should use global defaults
      const status = await reserveManager.getReserveCapacityStatus(kioskId);
      expect(status.reserveRatio).toBe(0.1); // Global default
      expect(status.reserveMinimum).toBe(2); // Global default
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle quarantined and held lockers correctly', async () => {
      const kioskId = 'test-kiosk';
      const futureTime = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes from now
      
      // Set some lockers as quarantined and in return hold
      db.prepare(`
        UPDATE lockers 
        SET quarantine_until = ? 
        WHERE kiosk_id = ? AND id IN (3, 4)
      `).run(futureTime, kioskId);
      
      db.prepare(`
        UPDATE lockers 
        SET return_hold_until = ? 
        WHERE kiosk_id = ? AND id IN (5, 6)
      `).run(futureTime, kioskId);
      
      const status = await reserveManager.getReserveCapacityStatus(kioskId);
      
      // Should exclude quarantined and held lockers from available count
      expect(status.availableLockers).toBe(14); // 18 - 4 (quarantined/held)
    });

    it('should handle overdue and suspected lockers correctly', async () => {
      const kioskId = 'test-kiosk';
      
      // Set some lockers as overdue and suspected
      db.prepare(`
        UPDATE lockers 
        SET overdue_from = CURRENT_TIMESTAMP 
        WHERE kiosk_id = ? AND id IN (7, 8)
      `).run(kioskId);
      
      db.prepare(`
        UPDATE lockers 
        SET suspected_occupied = 1 
        WHERE kiosk_id = ? AND id IN (9, 10)
      `).run(kioskId);
      
      const status = await reserveManager.getReserveCapacityStatus(kioskId);
      
      // Should exclude overdue and suspected lockers
      expect(status.availableLockers).toBe(14); // 18 - 4 (overdue/suspected)
    });

    it('should test multiple scenarios with testReserveCapacity', async () => {
      const kioskId = 'test-kiosk';
      
      const scenarios = [
        { availableCount: 30, description: 'High capacity' },
        { availableCount: 10, description: 'Medium capacity' },
        { availableCount: 4, description: 'Low capacity' },
        { availableCount: 1, description: 'Critical capacity' }
      ];
      
      const results = await reserveManager.testReserveCapacity(kioskId, scenarios);
      
      expect(results).toHaveLength(4);
      
      // High capacity: 30 * 0.1 = 3, reserve = max(3, 2) = 3, assignable = 27
      expect(results[0].result.reserveRequired).toBe(3);
      expect(results[0].result.assignableCount).toBe(27);
      expect(results[0].result.reserveDisabled).toBe(false);
      
      // Low capacity: reserve disabled due to low stock
      expect(results[2].result.reserveDisabled).toBe(true);
      expect(results[2].result.assignableCount).toBe(4);
      
      // Critical capacity: reserve disabled
      expect(results[3].result.reserveDisabled).toBe(true);
      expect(results[3].result.assignableCount).toBe(1);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large number of lockers efficiently', async () => {
      const kioskId = 'large-kiosk';
      
      // Create 1000 lockers
      const stmt = db.prepare(`
        INSERT INTO lockers (kiosk_id, id, status, is_vip, free_since) 
        VALUES (?, ?, 'Free', 0, ?)
      `);
      
      const now = new Date().toISOString();
      for (let i = 1; i <= 1000; i++) {
        stmt.run(kioskId, i, now);
      }
      
      const startTime = Date.now();
      const status = await reserveManager.getReserveCapacityStatus(kioskId);
      const endTime = Date.now();
      
      expect(status.totalLockers).toBe(1000);
      expect(status.availableLockers).toBe(1000);
      expect(status.reserveRequired).toBe(100); // Math.ceil(1000 * 0.1)
      expect(status.assignableLockers).toBe(900);
      
      // Should complete within reasonable time (< 100ms)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle concurrent access correctly', async () => {
      const kioskId = 'test-kiosk';
      
      // Simulate concurrent reserve capacity checks
      const promises = Array.from({ length: 10 }, () => 
        reserveManager.getReserveCapacityStatus(kioskId)
      );
      
      const results = await Promise.all(promises);
      
      // All results should be consistent
      results.forEach(result => {
        expect(result.totalLockers).toBe(28);
        expect(result.availableLockers).toBe(18);
        expect(result.reserveRequired).toBe(2);
        expect(result.assignableLockers).toBe(16);
      });
    });
  });
});