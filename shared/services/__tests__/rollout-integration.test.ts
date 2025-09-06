import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RolloutManager } from '../rollout-manager';
import { AutomatedRollbackMonitor } from '../automated-rollback-monitor';
import { DatabaseManager } from '../../database/database-manager';
import { ConfigurationManager } from '../configuration-manager';
import { AlertManager } from '../alert-manager';

describe('Rollout System Integration', () => {
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
      CREATE TABLE rollout_status (
        kiosk_id TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT 0,
        enabled_at DATETIME,
        enabled_by TEXT,
        rollback_at DATETIME,
        rollback_by TEXT,
        rollback_reason TEXT,
        phase TEXT NOT NULL DEFAULT 'disabled',
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE assignment_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kiosk_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        assignment_time DATETIME NOT NULL,
        locker_id INTEGER,
        action_type TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        error_code TEXT,
        duration_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE alerts (
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
      CREATE TABLE monitoring_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kiosk_id TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        success_rate REAL NOT NULL,
        failure_rate REAL NOT NULL,
        avg_response_time REAL NOT NULL,
        total_assignments INTEGER NOT NULL,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        alert_level TEXT NOT NULL DEFAULT 'none',
        recommended_action TEXT NOT NULL DEFAULT 'continue'
      )
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

  describe('Rollout Lifecycle', () => {
    it('should complete full rollout lifecycle', async () => {
      const kioskId = 'test-kiosk-1';
      const adminUser = 'test-admin';

      // 1. Enable kiosk
      await rolloutManager.enableKiosk(kioskId, adminUser, 'Initial rollout');
      
      let status = await rolloutManager.getKioskStatus(kioskId);
      expect(status?.enabled).toBe(true);
      expect(status?.phase).toBe('enabled');
      expect(status?.enabledBy).toBe(adminUser);

      // 2. Add some successful assignment metrics
      for (let i = 0; i < 50; i++) {
        await db.query(`
          INSERT INTO assignment_metrics (
            kiosk_id, card_id, assignment_time, action_type, success, duration_ms
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          kioskId,
          `card-${i}`,
          new Date(Date.now() - (50 - i) * 60000).toISOString(), // Spread over last 50 minutes
          'assign_new',
          i < 48 ? 1 : 0, // 96% success rate
          800 + Math.random() * 400 // 800-1200ms
        ]);
      }

      // 3. Analyze decision - should recommend continue/monitor
      const decision = await rolloutManager.analyzeRolloutDecision(kioskId);
      expect(decision.recommendation).toBeOneOf(['enable', 'monitor']);
      expect(decision.metrics.successRate).toBeGreaterThan(0.9);

      // 4. Simulate performance degradation
      for (let i = 0; i < 20; i++) {
        await db.query(`
          INSERT INTO assignment_metrics (
            kiosk_id, card_id, assignment_time, action_type, success, duration_ms, error_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          kioskId,
          `card-fail-${i}`,
          new Date(Date.now() - i * 30000).toISOString(), // Recent failures
          'assign_new',
          0, // All failures
          3000, // Slow responses
          'assignment_timeout'
        ]);
      }

      // 5. Re-analyze - should recommend rollback
      const degradedDecision = await rolloutManager.analyzeRolloutDecision(kioskId);
      expect(degradedDecision.recommendation).toBe('rollback');
      expect(degradedDecision.confidence).toBeGreaterThan(0.8);

      // 6. Execute rollback
      await rolloutManager.disableKiosk(kioskId, adminUser, 'Performance degradation');
      
      status = await rolloutManager.getKioskStatus(kioskId);
      expect(status?.enabled).toBe(false);
      expect(status?.phase).toBe('rolled_back');
      expect(status?.rollbackReason).toBe('Performance degradation');
    });

    it('should handle emergency disable scenario', async () => {
      // Enable multiple kiosks
      const kiosks = ['kiosk-1', 'kiosk-2', 'kiosk-3'];
      
      for (const kioskId of kiosks) {
        await rolloutManager.enableKiosk(kioskId, 'admin', 'Batch rollout');
      }

      // Verify all enabled
      for (const kioskId of kiosks) {
        const status = await rolloutManager.getKioskStatus(kioskId);
        expect(status?.enabled).toBe(true);
      }

      // Execute emergency disable
      await rolloutManager.emergencyDisableAll('emergency-admin', 'Critical system issue');

      // Verify all disabled
      for (const kioskId of kiosks) {
        const status = await rolloutManager.getKioskStatus(kioskId);
        expect(status?.enabled).toBe(false);
        expect(status?.phase).toBe('rolled_back');
        expect(status?.rollbackReason).toContain('EMERGENCY');
      }

      // Check summary
      const summary = await rolloutManager.getRolloutSummary();
      expect(summary.enabledKiosks).toBe(0);
      expect(summary.rolledBackKiosks).toBe(3);
    });
  });

  describe('Automated Monitoring', () => {
    it('should detect and rollback failing kiosk automatically', async () => {
      const kioskId = 'auto-test-kiosk';
      
      // Enable kiosk
      await rolloutManager.enableKiosk(kioskId, 'admin', 'Auto monitoring test');

      // Add failing metrics that should trigger rollback
      const now = Date.now();
      for (let i = 0; i < 30; i++) {
        await db.query(`
          INSERT INTO assignment_metrics (
            kiosk_id, card_id, assignment_time, action_type, success, duration_ms, error_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          kioskId,
          `card-${i}`,
          new Date(now - i * 60000).toISOString(),
          'assign_new',
          i < 20 ? 0 : 1, // 67% failure rate (33% success)
          2500 + Math.random() * 1000, // Slow responses
          i < 20 ? 'no_stock' : null
        ]);
      }

      // Run monitoring check
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

      // Verify kiosk was automatically rolled back
      const status = await rolloutManager.getKioskStatus(kioskId);
      expect(status?.enabled).toBe(false);
      expect(status?.phase).toBe('rolled_back');
      expect(status?.rollbackBy).toBe('automated-monitor');
      expect(status?.rollbackReason).toContain('Automated rollback');
    });

    it('should not rollback kiosk with good performance', async () => {
      const kioskId = 'good-performance-kiosk';
      
      // Enable kiosk
      await rolloutManager.enableKiosk(kioskId, 'admin', 'Performance test');

      // Add good metrics
      const now = Date.now();
      for (let i = 0; i < 50; i++) {
        await db.query(`
          INSERT INTO assignment_metrics (
            kiosk_id, card_id, assignment_time, action_type, success, duration_ms
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          kioskId,
          `card-${i}`,
          new Date(now - i * 60000).toISOString(),
          'assign_new',
          1, // 100% success
          800 + Math.random() * 200 // Fast responses
        ]);
      }

      // Run monitoring check
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

      // Verify kiosk remains enabled
      const status = await rolloutManager.getKioskStatus(kioskId);
      expect(status?.enabled).toBe(true);
      expect(status?.phase).toBe('enabled');
    });
  });

  describe('Metrics and Analytics', () => {
    it('should calculate accurate rollout metrics', async () => {
      const kioskId = 'metrics-test-kiosk';
      
      // Add mixed performance data
      const assignments = [
        { success: 1, duration: 800, error: null },
        { success: 1, duration: 1200, error: null },
        { success: 0, duration: 2500, error: 'no_stock' },
        { success: 1, duration: 900, error: null },
        { success: 0, duration: 3000, error: 'assignment_conflict' },
        { success: 1, duration: 1100, error: null },
        { success: 1, duration: 850, error: null },
        { success: 0, duration: 2000, error: 'retry_failed' },
        { success: 1, duration: 950, error: null },
        { success: 1, duration: 1050, error: null }
      ];

      for (let i = 0; i < assignments.length; i++) {
        const assignment = assignments[i];
        await db.query(`
          INSERT INTO assignment_metrics (
            kiosk_id, card_id, assignment_time, action_type, success, 
            duration_ms, error_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          kioskId,
          `card-${i}`,
          new Date(Date.now() - (assignments.length - i) * 60000).toISOString(),
          'assign_new',
          assignment.success,
          assignment.duration,
          assignment.error
        ]);
      }

      const metrics = await rolloutManager.calculateMetrics(kioskId);

      expect(metrics.totalAssignments).toBe(10);
      expect(metrics.successfulAssignments).toBe(7);
      expect(metrics.failedAssignments).toBe(3);
      expect(metrics.successRate).toBe(0.7);
      expect(metrics.noStockEvents).toBe(1);
      expect(metrics.retryEvents).toBe(1);
      expect(metrics.conflictEvents).toBe(1);
      expect(metrics.averageAssignmentTime).toBeCloseTo(1340, 0); // Average of all durations
    });

    it('should provide comprehensive rollout summary', async () => {
      // Set up multiple kiosks in different states
      await rolloutManager.enableKiosk('kiosk-enabled-1', 'admin', 'Test');
      await rolloutManager.enableKiosk('kiosk-enabled-2', 'admin', 'Test');
      await rolloutManager.enableKiosk('kiosk-rollback', 'admin', 'Test');
      await rolloutManager.disableKiosk('kiosk-rollback', 'admin', 'Test rollback');

      // Add some assignment data
      const now = Date.now();
      for (let i = 0; i < 100; i++) {
        await db.query(`
          INSERT INTO assignment_metrics (
            kiosk_id, card_id, assignment_time, action_type, success, duration_ms
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          i < 50 ? 'kiosk-enabled-1' : 'kiosk-enabled-2',
          `card-${i}`,
          new Date(now - i * 30000).toISOString(),
          'assign_new',
          i % 10 !== 0 ? 1 : 0, // 90% success rate
          1000
        ]);
      }

      // Add a critical alert
      await db.query(`
        INSERT INTO alerts (id, type, kiosk_id, severity, message, triggered_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        'alert-1',
        'performance_critical',
        'kiosk-enabled-1',
        'critical',
        'Test critical alert',
        new Date().toISOString()
      ]);

      const summary = await rolloutManager.getRolloutSummary();

      expect(summary.totalKiosks).toBe(3);
      expect(summary.enabledKiosks).toBe(2);
      expect(summary.rolledBackKiosks).toBe(1);
      expect(summary.overallSuccessRate).toBe(0.9);
      expect(summary.criticalIssues).toBe(1);
    });
  });

  describe('Decision Analysis', () => {
    it('should provide detailed decision analysis with reasons', async () => {
      const kioskId = 'decision-test-kiosk';
      
      // Add metrics that should trigger specific recommendations
      const now = Date.now();
      
      // High retry rate scenario
      for (let i = 0; i < 100; i++) {
        await db.query(`
          INSERT INTO assignment_metrics (
            kiosk_id, card_id, assignment_time, action_type, success, 
            duration_ms, error_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          kioskId,
          `card-${i}`,
          new Date(now - i * 30000).toISOString(),
          i < 15 ? 'retry_assignment' : 'assign_new', // 15% retry rate
          1, // All successful
          1500, // Good response time
          null
        ]);
      }

      const decision = await rolloutManager.analyzeRolloutDecision(kioskId);

      expect(decision.kioskId).toBe(kioskId);
      expect(decision.recommendation).toBe('monitor'); // High retry rate but not critical
      expect(decision.reasons).toContain(expect.stringContaining('High retry rate'));
      expect(decision.metrics.totalAssignments).toBe(100);
      expect(decision.confidence).toBeGreaterThan(0.5);
    });

    it('should handle custom thresholds in decision analysis', async () => {
      const kioskId = 'custom-threshold-kiosk';
      
      // Add metrics with 85% success rate
      for (let i = 0; i < 100; i++) {
        await db.query(`
          INSERT INTO assignment_metrics (
            kiosk_id, card_id, assignment_time, action_type, success, duration_ms
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          kioskId,
          `card-${i}`,
          new Date(Date.now() - i * 30000).toISOString(),
          'assign_new',
          i < 85 ? 1 : 0, // 85% success rate
          1000
        ]);
      }

      // With default thresholds (95% min), should recommend rollback
      const defaultDecision = await rolloutManager.analyzeRolloutDecision(kioskId);
      expect(defaultDecision.recommendation).toBe('rollback');

      // With custom lower threshold (80% min), should be acceptable
      const customDecision = await rolloutManager.analyzeRolloutDecision(kioskId, {
        minSuccessRate: 0.80
      });
      expect(customDecision.recommendation).toBeOneOf(['enable', 'monitor']);
      expect(customDecision.thresholds.minSuccessRate).toBe(0.80);
    });
  });
});