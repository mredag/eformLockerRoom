import { StockMonitor } from '../stock-monitor';
import { DatabaseConnection } from '../../database/connection';
import { promises as fs } from 'fs';
import path from 'path';

describe('StockMonitor Integration Tests', () => {
  let stockMonitor: StockMonitor;
  let db: DatabaseConnection;
  const testKioskId = 'integration-test-kiosk';

  beforeAll(async () => {
    // Use in-memory database for testing
    db = new DatabaseConnection(':memory:');
    
    // Run migrations to set up schema
    const migrationPath = path.join(__dirname, '../../../migrations/027_stock_monitoring_system.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    
    // Split and execute migration statements
    const statements = migrationSql.split(';').filter(stmt => stmt.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await db.run(statement);
      }
    }

    // Create test lockers
    await setupTestLockers();
    
    stockMonitor = new StockMonitor(db);
    stockMonitor.stopMonitoring(); // Prevent automatic monitoring during tests
  });

  afterAll(async () => {
    stockMonitor.stopMonitoring();
    await db.close();
  });

  async function setupTestLockers() {
    // Create lockers table if not exists
    await db.run(`
      CREATE TABLE IF NOT EXISTS lockers (
        kiosk_id TEXT NOT NULL,
        id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Free',
        owner_type TEXT,
        owner_key TEXT,
        is_vip BOOLEAN NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kiosk_id, id)
      )
    `);

    // Create config tables
    await db.run(`
      CREATE TABLE IF NOT EXISTS config_version (
        id INTEGER PRIMARY KEY DEFAULT 1,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CHECK (id = 1)
      )
    `);

    await db.run(`
      INSERT OR IGNORE INTO config_version (id, version) VALUES (1, 1)
    `);

    // Insert test lockers: 10 total, mixed statuses
    const lockers = [
      { id: 1, status: 'Free', is_vip: 0 },
      { id: 2, status: 'Free', is_vip: 0 },
      { id: 3, status: 'Free', is_vip: 0 },
      { id: 4, status: 'Free', is_vip: 0 },
      { id: 5, status: 'Owned', is_vip: 0 },
      { id: 6, status: 'Owned', is_vip: 0 },
      { id: 7, status: 'Owned', is_vip: 0 },
      { id: 8, status: 'Blocked', is_vip: 0 },
      { id: 9, status: 'Free', is_vip: 1 }, // VIP locker
      { id: 10, status: 'Error', is_vip: 0 }
    ];

    for (const locker of lockers) {
      await db.run(
        'INSERT OR REPLACE INTO lockers (kiosk_id, id, status, is_vip) VALUES (?, ?, ?, ?)',
        [testKioskId, locker.id, locker.status, locker.is_vip]
      );
    }
  }

  describe('Real Database Integration', () => {
    it('should calculate accurate stock levels from real database', async () => {
      const stockLevel = await stockMonitor.getStockLevel(testKioskId);
      
      // Expected: 10 total, 4 free (non-VIP), 3 owned, 1 blocked, 1 error, 1 VIP
      // Available pool = 10 - 1 VIP = 9
      // Free ratio = 4 / 9 = 0.444...
      expect(stockLevel.totalLockers).toBe(10);
      expect(stockLevel.freeLockers).toBe(4);
      expect(stockLevel.ownedLockers).toBe(3);
      expect(stockLevel.blockedLockers).toBe(1);
      expect(stockLevel.errorLockers).toBe(1);
      expect(stockLevel.vipLockers).toBe(1);
      expect(stockLevel.freeRatio).toBeCloseTo(0.444, 3);
      expect(stockLevel.category).toBe('medium'); // Between 0.1 and 0.5
    });

    it('should persist and retrieve stock history', async () => {
      const stockLevel = await stockMonitor.getStockLevel(testKioskId);
      
      // Manually record history (normally done by monitoring)
      await db.run(
        `INSERT INTO stock_history (kiosk_id, total_lockers, free_lockers, owned_lockers, 
         blocked_lockers, error_lockers, vip_lockers, free_ratio, category, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stockLevel.kioskId,
          stockLevel.totalLockers,
          stockLevel.freeLockers,
          stockLevel.ownedLockers,
          stockLevel.blockedLockers,
          stockLevel.errorLockers,
          stockLevel.vipLockers,
          stockLevel.freeRatio,
          stockLevel.category,
          stockLevel.timestamp.toISOString()
        ]
      );

      // Verify history was recorded
      const history = await db.all(
        'SELECT * FROM stock_history WHERE kiosk_id = ?',
        [testKioskId]
      );

      expect(history).toHaveLength(1);
      expect(history[0].free_ratio).toBeCloseTo(0.444, 3);
      expect(history[0].category).toBe('medium');
    });

    it('should trigger and persist alerts for low stock', async () => {
      // Modify lockers to create low stock scenario (only 1 free out of 9 available)
      await db.run(
        'UPDATE lockers SET status = ? WHERE kiosk_id = ? AND id IN (2, 3, 4)',
        ['Owned', testKioskId]
      );

      const alerts = await stockMonitor.checkStockAlerts(testKioskId);
      
      // Should trigger critical stock alert (1/9 = 0.111... > 0.1 but < 0.2)
      expect(alerts.length).toBeGreaterThan(0);
      
      // Verify alert was persisted
      const persistedAlerts = await stockMonitor.getActiveAlerts(testKioskId);
      expect(persistedAlerts.length).toBeGreaterThan(0);
      
      // Clean up - restore original state
      await db.run(
        'UPDATE lockers SET status = ? WHERE kiosk_id = ? AND id IN (2, 3, 4)',
        ['Free', testKioskId]
      );
    });

    it('should calculate behavior adjustments based on real stock levels', async () => {
      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      
      // With ~44% free ratio (medium stock):
      // Quarantine: 5 + ((0.444 - 0.1) / (0.5 - 0.1)) * (20 - 5) ≈ 5 + 0.86 * 15 ≈ 18
      // Hot window: 10 + ((0.444 - 0.1) / (0.5 - 0.1)) * (30 - 10) ≈ 10 + 0.86 * 20 ≈ 27
      expect(adjustments.quarantineMinutes).toBeGreaterThan(10);
      expect(adjustments.quarantineMinutes).toBeLessThan(20);
      expect(adjustments.hotWindowMinutes).toBeGreaterThan(20);
      expect(adjustments.hotWindowMinutes).toBeLessThan(30);
      expect(adjustments.reserveDisabled).toBe(false); // 44% > 20% threshold
      expect(adjustments.assignmentRestricted).toBe(false); // 44% > 5% threshold
    });

    it('should calculate metrics from multiple history records', async () => {
      // Insert multiple history records
      const historyRecords = [
        { freeRatio: 0.8, timestamp: new Date(Date.now() - 3600000) }, // 1 hour ago
        { freeRatio: 0.6, timestamp: new Date(Date.now() - 1800000) }, // 30 min ago
        { freeRatio: 0.4, timestamp: new Date() } // now
      ];

      for (const record of historyRecords) {
        await db.run(
          `INSERT INTO stock_history (kiosk_id, total_lockers, free_lockers, owned_lockers, 
           blocked_lockers, error_lockers, vip_lockers, free_ratio, category, timestamp)
           VALUES (?, 10, 5, 3, 1, 1, 1, ?, 'medium', ?)`,
          [testKioskId, record.freeRatio, record.timestamp.toISOString()]
        );
      }

      const metrics = await stockMonitor.getStockMetrics(testKioskId, 24);
      
      expect(metrics.stockEvents).toBeGreaterThanOrEqual(3);
      expect(metrics.averageFreeRatio).toBeGreaterThan(0);
      expect(metrics.minFreeRatio).toBeLessThanOrEqual(metrics.maxFreeRatio);
    });

    it('should handle stock level changes dynamically', async () => {
      // Initial state
      const initialStock = await stockMonitor.getStockLevel(testKioskId);
      expect(initialStock.category).toBe('medium');

      // Change to high stock (free up more lockers)
      await db.run(
        'UPDATE lockers SET status = ? WHERE kiosk_id = ? AND status = ? AND is_vip = 0',
        ['Free', testKioskId, 'Owned']
      );

      const highStock = await stockMonitor.getStockLevel(testKioskId);
      expect(highStock.freeRatio).toBeGreaterThan(initialStock.freeRatio);
      expect(highStock.category).toBe('high');

      // Change to low stock (occupy most lockers)
      await db.run(
        'UPDATE lockers SET status = ? WHERE kiosk_id = ? AND status = ? AND is_vip = 0 AND id > 1',
        ['Owned', testKioskId, 'Free']
      );

      const lowStock = await stockMonitor.getStockLevel(testKioskId);
      expect(lowStock.freeRatio).toBeLessThan(0.2);
      expect(lowStock.category).toBe('low');

      // Restore original state
      await setupTestLockers();
    });

    it('should cleanup old history records', async () => {
      // Insert old history record
      const oldTimestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      await db.run(
        `INSERT INTO stock_history (kiosk_id, total_lockers, free_lockers, owned_lockers, 
         blocked_lockers, error_lockers, vip_lockers, free_ratio, category, timestamp)
         VALUES (?, 10, 5, 3, 1, 1, 1, 0.5, 'high', ?)`,
        [testKioskId, oldTimestamp.toISOString()]
      );

      // Verify record exists
      const beforeCleanup = await db.all(
        'SELECT * FROM stock_history WHERE kiosk_id = ? AND timestamp < ?',
        [testKioskId, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()]
      );
      expect(beforeCleanup.length).toBeGreaterThan(0);

      // Cleanup old records (keep 7 days)
      await stockMonitor.cleanupOldHistory(7);

      // Verify old record was removed
      const afterCleanup = await db.all(
        'SELECT * FROM stock_history WHERE kiosk_id = ? AND timestamp < ?',
        [testKioskId, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()]
      );
      expect(afterCleanup.length).toBe(0);
    });
  });

  describe('Current Stock Levels View', () => {
    it('should use the database view for current stock levels', async () => {
      // Query the view directly
      const viewResult = await db.get(
        'SELECT * FROM current_stock_levels WHERE kiosk_id = ?',
        [testKioskId]
      );

      expect(viewResult).toBeDefined();
      expect(viewResult.total_lockers).toBe(10);
      expect(viewResult.free_lockers).toBe(4);
      expect(viewResult.vip_lockers).toBe(1);
      expect(viewResult.free_ratio).toBeCloseTo(0.444, 3);
      expect(viewResult.category).toBe('medium');
    });
  });
});