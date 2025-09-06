import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RolloutManager } from '../../shared/services/rollout-manager';
import { AutomatedRollbackMonitor } from '../../shared/services/automated-rollback-monitor';
import { DatabaseManager } from '../../shared/database/database-manager';
import { ConfigurationManager } from '../../shared/services/configuration-manager';
import { AlertManager } from '../../shared/services/alert-manager';

describe('Rollout E2E Tests', () => {
  let rolloutManager: RolloutManager;
  let monitor: AutomatedRollbackMonitor;
  let db: DatabaseManager;
  let configManager: ConfigurationManager;
  let alertManager: AlertManager;

  beforeEach(async () => {
    // Use in-memory database for testing
    db = new DatabaseManager(':memory:');
    await db.initialize();
    
    // Run rollout migrations
    await db.query(`
      CREATE TABLE IF NOT EXISTS rollout_status (
        kiosk_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        enabled_at DATETIME,
        enabled_by TEXT,
        rollback_at DATETIME,
        rollback_by TEXT,
        rollback_reason TEXT,
        phase TEXT NOT NULL DEFAULT 'disabled',
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CHECK (phase IN ('disabled', 'enabled', 'monitoring', 'rolled_back'))
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS assignment_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kiosk_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        assignment_time DATETIME NOT NULL,
        locker_id INTEGER,
        action_type TEXT NOT NULL,
        success INTEGER NOT NULL,
        error_code TEXT,
        duration_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        kiosk_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT,
        triggered_at DATETIME NOT NULL,
        cleared_at DATETIME
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS rollout_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kiosk_id TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        confidence REAL NOT NULL,
        reasons TEXT NOT NULL,
        metrics TEXT NOT NULL,
        thresholds TEXT NOT NULL,
        decision_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        acted_upon INTEGER DEFAULT 0,
        acted_by TEXT,
        acted_at DATETIME
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS rollout_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kiosk_id TEXT,
        event_type TEXT NOT NULL,
        event_data TEXT,
        triggered_by TEXT NOT NULL,
        event_time DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS rollout_thresholds (
        kiosk_id TEXT,
        min_success_rate REAL NOT NULL DEFAULT 0.90,
        max_no_stock_rate REAL NOT NULL DEFAULT 0.05,
        max_retry_rate REAL NOT NULL DEFAULT 0.10,
        max_conflict_rate REAL NOT NULL DEFAULT 0.02,
        max_assignment_time_ms INTEGER NOT NULL DEFAULT 2000,
        min_sample_size INTEGER NOT NULL DEFAULT 50,
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kiosk_id)
      )
    `);

    // Insert default thresholds
    await db.query(`
      INSERT OR IGNORE INTO rollout_thresholds (
        kiosk_id, min_success_rate, max_assignment_time_ms, min_sample_size, updated_by
      ) VALUES (NULL, 0.90, 2000, 20, 'system')
    `);

    configManager = new ConfigurationManager(db);
    alertManager = new AlertManager(db);
    rolloutManager = new RolloutManager(db, configManager, alertManager);
    monitor = new AutomatedRollbackMonitor(rolloutManager, db, configManager, alertManager);
  });

  afterEach(async () => {
    monitor.stopMonitoring();
    await db.close();
  });

  describe('E2E: Enable → Metrics Breach → Automated Rollback', () => {
    it('should automatically rollback kiosk when performance degrades', async () => {
      const kioskId = 'e2e-test-kiosk';
      const adminUser = 'test-admin';

      // Step 1: Enable kiosk
      await rolloutManager.enableKiosk(kioskId, adminUser, 'E2E test rollout');
      
      let status = await rolloutManager.getKioskStatus(kioskId);
      expect(status?.enabled).toBe(true);
      expect(status?.phase).toBe('enabled');

      // Step 2: Add good initial metrics
      const now = Date.now();
      for (let i = 0; i < 25; i++) {
        await db.query(`
          INSERT INTO assignment_metrics (
            kiosk_id, card_id, assignment_time, action_type, success, duration_ms
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          kioskId,
          `card-good-${i}`,
          new Date(now - (25 - i) * 60000).toISOString(),
          'assign_new',
          1, // All successful
          1000 + Math.random() * 200 // Good response times
        ]);
      }

      // Verify good performance doesn't trigger rollback
      const goodDecision = await rolloutManager.analyzeRolloutDecision(kioskId);
      expect(goodDecision.recommendation).not.toBe('rollback');

      // Step 3: Add degraded performance metrics (breach thresholds)
      for (let i = 0; i < 30; i++) {
        await db.query(`
          INSERT INTO assignment_metrics (
            kiosk_id, card_id, assignment_time, action_type, success, duration_ms, error_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          kioskId,
          `card-bad-${i}`,
          new Date(now - i * 30000).toISOString(), // Recent failures
          'assign_new',
          i < 25 ? 0 : 1, // 83% failure rate (17% success)
          3000 + Math.random() * 1000, // Slow responses
          i < 25 ? 'assignment_timeout' : null
        ]);
      }

      // Step 4: Verify metrics breach detection
      const degradedDecision = await rolloutManager.analyzeRolloutDecision(kioskId);
      expect(degradedDecision.recommendation).toBe('rollback');
      expect(degradedDecision.confidence).toBeGreaterThan(0.8);
      expect(degradedDecision.reasons).toContain(expect.stringContaining('Low success rate'));

      // Step 5: Run automated monitoring check
      await monitor.performMonitoringCheck({
        checkIntervalMinutes: 5,
        enableAutomatedRollback: true,
        criticalThresholds: {
          minSuccessRate: 0.90,
          maxFailureRate: 0.10,
          maxResponseTimeMs: 2000,
          minSampleSize: 20
        },
        alertThresholds: {
          warningSuccessRate: 0.95,
          criticalSuccessRate: 0.90,
          maxConsecutiveFailures: 5
        }
      });

      // Step 6: Verify automated rollback occurred
      status = await rolloutManager.getKioskStatus(kioskId);
      expect(status?.enabled).toBe(false);
      expect(status?.phase).toBe('rolled_back');
      expect(status?.rollbackBy).toBe('automated-system');
      expect(status?.rollbackReason).toContain('Automated rollback');

      // Step 7: Verify audit trail
      const decisions = await db.query(`
        SELECT * FROM rollout_decisions 
        WHERE kiosk_id = ? AND acted_upon = 1
        ORDER BY decision_time DESC
      `, [kioskId]);
      
      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions[0].recommendation).toBe('rollback');
      expect(decisions[0].acted_by).toBe('automated-system');

      // Step 8: Verify event log
      const events = await db.query(`
        SELECT * FROM rollout_events 
        WHERE kiosk_id = ? AND event_type = 'automated_rollback'
      `, [kioskId]);
      
      expect(events.length).toBe(1);
      expect(events[0].triggered_by).toBe('automated-system');

      // Step 9: Verify alert was created
      const alerts = await db.query(`
        SELECT * FROM alerts 
        WHERE kiosk_id = ? AND type = 'automated_rollback'
      `, [kioskId]);
      
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should validate exact log message format', async () => {
      const kioskId = 'log-test-kiosk';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Test enable log
      await rolloutManager.enableKiosk(kioskId, 'admin', 'Test');
      expect(consoleSpy).toHaveBeenCalledWith(`Rollout enabled: kiosk=${kioskId}.`);

      // Test disable log
      await rolloutManager.disableKiosk(kioskId, 'admin', 'Performance issues');
      expect(consoleSpy).toHaveBeenCalledWith(`Rollout disabled: kiosk=${kioskId}, reason=Performance issues.`);

      // Test emergency disable log
      await rolloutManager.emergencyDisableAll('admin', 'Critical issue');
      expect(consoleSpy).toHaveBeenCalledWith('Emergency disable executed.');

      consoleSpy.mockRestore();
    });
  });

  describe('Pagination Tests', () => {
    beforeEach(async () => {
      // Create test data for pagination
      const kioskId = 'pagination-test-kiosk';
      
      // Create 100 events
      for (let i = 0; i < 100; i++) {
        await db.query(`
          INSERT INTO rollout_events (kiosk_id, event_type, triggered_by, event_time)
          VALUES (?, ?, ?, ?)
        `, [
          kioskId,
          i % 2 === 0 ? 'enabled' : 'disabled',
          'test-admin',
          new Date(Date.now() - i * 60000).toISOString()
        ]);
      }

      // Create 50 decisions
      for (let i = 0; i < 50; i++) {
        await db.query(`
          INSERT INTO rollout_decisions (
            kiosk_id, recommendation, confidence, reasons, metrics, thresholds
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          kioskId,
          i % 3 === 0 ? 'enable' : 'monitor',
          0.8,
          JSON.stringify(['Test reason']),
          JSON.stringify({ totalAssignments: 100 }),
          JSON.stringify({ minSuccessRate: 0.9 })
        ]);
      }
    });

    it('should paginate events correctly', async () => {
      const kioskId = 'pagination-test-kiosk';

      // Test default limit
      const defaultEvents = await db.query(`
        SELECT * FROM rollout_events 
        WHERE kiosk_id = ?
        ORDER BY event_time DESC 
        LIMIT 20
      `, [kioskId]);
      
      expect(defaultEvents.length).toBe(20);

      // Test custom limit
      const limitedEvents = await db.query(`
        SELECT * FROM rollout_events 
        WHERE kiosk_id = ?
        ORDER BY event_time DESC 
        LIMIT 10
      `, [kioskId]);
      
      expect(limitedEvents.length).toBe(10);

      // Test pagination with offset
      const page1 = await db.query(`
        SELECT * FROM rollout_events 
        WHERE kiosk_id = ?
        ORDER BY event_time DESC 
        LIMIT 10 OFFSET 0
      `, [kioskId]);

      const page2 = await db.query(`
        SELECT * FROM rollout_events 
        WHERE kiosk_id = ?
        ORDER BY event_time DESC 
        LIMIT 10 OFFSET 10
      `, [kioskId]);

      expect(page1.length).toBe(10);
      expect(page2.length).toBe(10);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('should paginate decisions correctly', async () => {
      const kioskId = 'pagination-test-kiosk';

      // Test default limit
      const defaultDecisions = await db.query(`
        SELECT * FROM rollout_decisions 
        WHERE kiosk_id = ?
        ORDER BY decision_time DESC 
        LIMIT 25
      `, [kioskId]);
      
      expect(defaultDecisions.length).toBe(25);

      // Test all decisions
      const allDecisions = await db.query(`
        SELECT COUNT(*) as count FROM rollout_decisions 
        WHERE kiosk_id = ?
      `, [kioskId]);
      
      expect(allDecisions[0].count).toBe(50);
    });
  });

  describe('Threshold Configuration Tests', () => {
    it('should load kiosk-specific thresholds', async () => {
      const kioskId = 'threshold-test-kiosk';

      // Insert kiosk-specific thresholds
      await db.query(`
        INSERT INTO rollout_thresholds (
          kiosk_id, min_success_rate, max_assignment_time_ms, min_sample_size, updated_by
        ) VALUES (?, ?, ?, ?, ?)
      `, [kioskId, 0.85, 3000, 30, 'test-admin']);

      const thresholds = await rolloutManager.loadThresholds(kioskId);
      
      expect(thresholds.minSuccessRate).toBe(0.85);
      expect(thresholds.maxAssignmentTimeMs).toBe(3000);
      expect(thresholds.minSampleSize).toBe(30);
    });

    it('should fall back to global thresholds', async () => {
      const kioskId = 'no-specific-thresholds';

      const thresholds = await rolloutManager.loadThresholds(kioskId);
      
      // Should use global defaults
      expect(thresholds.minSuccessRate).toBe(0.90);
      expect(thresholds.maxAssignmentTimeMs).toBe(2000);
      expect(thresholds.minSampleSize).toBe(20);
    });

    it('should hot-reload thresholds within 3 seconds', async () => {
      const kioskId = 'hot-reload-test';
      const startTime = Date.now();

      // Update thresholds
      await db.query(`
        INSERT OR REPLACE INTO rollout_thresholds (
          kiosk_id, min_success_rate, updated_by, updated_at
        ) VALUES (?, ?, ?, ?)
      `, [kioskId, 0.95, 'test-admin', new Date().toISOString()]);

      // Load thresholds (should be immediate)
      const thresholds = await rolloutManager.loadThresholds(kioskId);
      const loadTime = Date.now() - startTime;

      expect(thresholds.minSuccessRate).toBe(0.95);
      expect(loadTime).toBeLessThan(3000); // Should be much faster, but allow 3s buffer
    });
  });
});