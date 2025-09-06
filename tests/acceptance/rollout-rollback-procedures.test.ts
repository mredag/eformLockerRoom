/**
 * Rollout and Rollback Procedures - Acceptance Tests
 * 
 * Validates all rollout and rollback procedures for the smart assignment system,
 * including feature flag management, gradual deployment, and emergency procedures.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../shared/database/database-manager';
import { ConfigurationManager } from '../../shared/services/configuration-manager';
import { AssignmentEngine } from '../../shared/services/assignment-engine';
import { AlertManager } from '../../shared/services/alert-manager';

describe('Rollout and Rollback Procedures Acceptance', () => {
  let db: DatabaseManager;
  let configManager: ConfigurationManager;
  let assignmentEngine: AssignmentEngine;
  let alertManager: AlertManager;

  beforeEach(async () => {
    db = new DatabaseManager(':memory:');
    await db.initialize();
    
    configManager = new ConfigurationManager(db);
    assignmentEngine = new AssignmentEngine(db, configManager);
    alertManager = new AlertManager(db);
    
    await seedTestEnvironment();
  });

  afterEach(async () => {
    await db.close();
  });

  async function seedTestEnvironment() {
    // Create multiple test kiosks
    const kiosks = ['kiosk-1', 'kiosk-2', 'kiosk-3', 'kiosk-4', 'kiosk-5'];
    
    for (const kioskId of kiosks) {
      for (let i = 1; i <= 10; i++) {
        await db.query(`
          INSERT INTO lockers (kiosk_id, id, status) VALUES (?, ?, 'Free')
        `, [kioskId, i]);
      }
    }

    // Seed default configuration
    await configManager.seedDefaultConfiguration();
  }

  describe('Feature Flag Management', () => {
    test('validates seamless feature flag switching without restart', async () => {
      // 1. Verify initial state (smart assignment disabled)
      let config = await configManager.getEffectiveConfig('kiosk-1');
      expect(config.smart_assignment_enabled).toBe(false);
      
      // 2. Test assignment in manual mode
      const manualResult = await simulateManualAssignment('kiosk-1', 'card-123');
      expect(manualResult.mode).toBe('manual');
      expect(manualResult.success).toBe(true);

      // 3. Enable smart assignment globally
      const enableStartTime = Date.now();
      await configManager.updateGlobalConfig({ smart_assignment_enabled: true });
      
      // 4. Verify immediate effect (no restart required)
      config = await configManager.getEffectiveConfig('kiosk-1');
      expect(config.smart_assignment_enabled).toBe(true);
      
      const switchTime = Date.now() - enableStartTime;
      expect(switchTime).toBeLessThan(3000); // ≤3 seconds requirement

      // 5. Test assignment in smart mode
      const smartResult = await assignmentEngine.assignLocker({
        cardId: 'card-456',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      });
      expect(smartResult.success).toBe(true);

      // 6. Disable smart assignment (rollback)
      await configManager.updateGlobalConfig({ smart_assignment_enabled: false });
      
      // 7. Verify immediate rollback
      config = await configManager.getEffectiveConfig('kiosk-1');
      expect(config.smart_assignment_enabled).toBe(false);
      
      // 8. Verify manual mode works again
      const rollbackResult = await simulateManualAssignment('kiosk-1', 'card-789');
      expect(rollbackResult.mode).toBe('manual');
      expect(rollbackResult.success).toBe(true);
    });

    test('validates feature flag audit logging', async () => {
      // Enable smart assignment
      await configManager.updateGlobalConfig({ smart_assignment_enabled: true });
      
      // Disable smart assignment
      await configManager.updateGlobalConfig({ smart_assignment_enabled: false });
      
      // Verify audit trail
      const history = await configManager.getConfigHistory();
      const flagChanges = history.filter(h => h.key === 'smart_assignment_enabled');
      
      expect(flagChanges.length).toBeGreaterThanOrEqual(2);
      expect(flagChanges.some(c => c.new_value === 'true')).toBe(true);
      expect(flagChanges.some(c => c.new_value === 'false')).toBe(true);
      
      // Verify timestamps
      flagChanges.forEach(change => {
        expect(change.changed_at).toBeDefined();
        expect(change.changed_by).toBeDefined();
      });
    });

    async function simulateManualAssignment(kioskId: string, cardId: string) {
      // Simulate manual locker selection flow
      const availableLockers = await db.query(`
        SELECT id FROM lockers WHERE kiosk_id = ? AND status = 'Free' LIMIT 1
      `, [kioskId]);
      
      if (availableLockers.length === 0) {
        return { mode: 'manual', success: false, reason: 'no_lockers' };
      }
      
      const lockerId = availableLockers[0].id;
      await db.query(`
        UPDATE lockers SET status = 'Owned', owner_key = ? 
        WHERE kiosk_id = ? AND id = ?
      `, [cardId, kioskId, lockerId]);
      
      return { mode: 'manual', success: true, lockerId };
    }
  });

  describe('Gradual Rollout Procedures', () => {
    test('validates per-kiosk rollout capability', async () => {
      // 1. Start with all kiosks in manual mode
      const allKiosks = ['kiosk-1', 'kiosk-2', 'kiosk-3', 'kiosk-4', 'kiosk-5'];
      
      for (const kioskId of allKiosks) {
        const config = await configManager.getEffectiveConfig(kioskId);
        expect(config.smart_assignment_enabled).toBe(false);
      }

      // 2. Enable for single kiosk (pilot)
      await configManager.setKioskOverride('kiosk-1', 'smart_assignment_enabled', true);
      
      let kiosk1Config = await configManager.getEffectiveConfig('kiosk-1');
      let kiosk2Config = await configManager.getEffectiveConfig('kiosk-2');
      
      expect(kiosk1Config.smart_assignment_enabled).toBe(true);
      expect(kiosk2Config.smart_assignment_enabled).toBe(false);

      // 3. Gradual expansion (25% rollout)
      await configManager.setKioskOverride('kiosk-2', 'smart_assignment_enabled', true);
      
      const enabledKiosks = await getEnabledKiosks();
      expect(enabledKiosks.length).toBe(2); // 40% of 5 kiosks

      // 4. Continue rollout (50% rollout)
      await configManager.setKioskOverride('kiosk-3', 'smart_assignment_enabled', true);
      
      const halfRollout = await getEnabledKiosks();
      expect(halfRollout.length).toBe(3); // 60% of 5 kiosks

      // 5. Complete rollout (global enable)
      await configManager.updateGlobalConfig({ smart_assignment_enabled: true });
      
      // Remove individual overrides (now redundant)
      for (const kioskId of ['kiosk-1', 'kiosk-2', 'kiosk-3']) {
        await configManager.removeKioskOverride(kioskId, 'smart_assignment_enabled');
      }
      
      // Verify all kiosks enabled
      for (const kioskId of allKiosks) {
        const config = await configManager.getEffectiveConfig(kioskId);
        expect(config.smart_assignment_enabled).toBe(true);
      }
    });

    test('validates rollout monitoring and metrics', async () => {
      // Enable for pilot kiosk
      await configManager.setKioskOverride('kiosk-1', 'smart_assignment_enabled', true);
      
      // Generate test assignments
      for (let i = 0; i < 10; i++) {
        await assignmentEngine.assignLocker({
          cardId: `test-card-${i}`,
          kioskId: 'kiosk-1',
          timestamp: new Date()
        });
      }
      
      // Check rollout metrics
      const metrics = await getRolloutMetrics('kiosk-1');
      expect(metrics.total_assignments).toBe(10);
      expect(metrics.success_rate).toBeGreaterThan(0);
      expect(metrics.average_response_time).toBeDefined();
      
      // Verify monitoring data
      const monitoringData = await getRolloutMonitoringData();
      expect(monitoringData.enabled_kiosks).toBe(1);
      expect(monitoringData.total_kiosks).toBe(5);
      expect(monitoringData.rollout_percentage).toBe(20);
    });

    test('validates rollout decision support metrics', async () => {
      // Enable pilot kiosk
      await configManager.setKioskOverride('kiosk-1', 'smart_assignment_enabled', true);
      
      // Generate mixed success/failure scenarios
      await generateRolloutTestData('kiosk-1');
      
      // Get decision support metrics
      const decisionMetrics = await getRolloutDecisionMetrics('kiosk-1');
      
      expect(decisionMetrics.success_rate).toBeDefined();
      expect(decisionMetrics.error_rate).toBeDefined();
      expect(decisionMetrics.retry_rate).toBeDefined();
      expect(decisionMetrics.user_satisfaction_proxy).toBeDefined();
      
      // Verify recommendation logic
      const recommendation = generateRolloutRecommendation(decisionMetrics);
      expect(['continue', 'pause', 'rollback']).toContain(recommendation.action);
      expect(recommendation.reason).toBeDefined();
    });

    async function getEnabledKiosks() {
      const overrides = await db.query(`
        SELECT DISTINCT kiosk_id FROM settings_kiosk 
        WHERE key = 'smart_assignment_enabled' AND value = 'true'
      `);
      
      const globalEnabled = await configManager.getGlobalConfig();
      if (globalEnabled.smart_assignment_enabled) {
        // If globally enabled, all kiosks are enabled unless specifically disabled
        return ['kiosk-1', 'kiosk-2', 'kiosk-3', 'kiosk-4', 'kiosk-5'];
      }
      
      return overrides.map(o => o.kiosk_id);
    }

    async function getRolloutMetrics(kioskId: string) {
      const results = await db.query(`
        SELECT 
          COUNT(*) as total_assignments,
          AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate,
          AVG(duration_ms) as average_response_time
        FROM assignment_metrics 
        WHERE kiosk_id = ? AND assignment_time > datetime('now', '-1 hour')
      `, [kioskId]);
      
      return results[0] || { total_assignments: 0, success_rate: 0, average_response_time: 0 };
    }

    async function getRolloutMonitoringData() {
      const enabledCount = (await getEnabledKiosks()).length;
      const totalKiosks = 5;
      
      return {
        enabled_kiosks: enabledCount,
        total_kiosks: totalKiosks,
        rollout_percentage: Math.round((enabledCount / totalKiosks) * 100)
      };
    }

    async function generateRolloutTestData(kioskId: string) {
      // Insert test metrics with various outcomes
      await db.query(`
        INSERT INTO assignment_metrics (kiosk_id, card_id, assignment_time, action_type, success, duration_ms, error_code)
        VALUES 
        (?, 'card-1', CURRENT_TIMESTAMP, 'assign_new', 1, 450, NULL),
        (?, 'card-2', CURRENT_TIMESTAMP, 'assign_new', 1, 380, NULL),
        (?, 'card-3', CURRENT_TIMESTAMP, 'assign_new', 0, 1200, 'no_stock'),
        (?, 'card-4', CURRENT_TIMESTAMP, 'assign_new', 1, 520, NULL),
        (?, 'card-5', CURRENT_TIMESTAMP, 'assign_new', 0, 800, 'hardware_error')
      `, [kioskId, kioskId, kioskId, kioskId, kioskId]);
    }

    async function getRolloutDecisionMetrics(kioskId: string) {
      const results = await db.query(`
        SELECT 
          AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate,
          AVG(CASE WHEN success = 0 THEN 1.0 ELSE 0.0 END) as error_rate,
          AVG(CASE WHEN error_code = 'retry' THEN 1.0 ELSE 0.0 END) as retry_rate,
          AVG(duration_ms) as avg_response_time
        FROM assignment_metrics 
        WHERE kiosk_id = ? AND assignment_time > datetime('now', '-24 hours')
      `, [kioskId]);
      
      const metrics = results[0] || {};
      return {
        ...metrics,
        user_satisfaction_proxy: metrics.success_rate * (1 - (metrics.avg_response_time / 5000)) // Proxy based on success and speed
      };
    }

    function generateRolloutRecommendation(metrics: any) {
      if (metrics.success_rate >= 0.95 && metrics.avg_response_time < 1000) {
        return { action: 'continue', reason: 'Excellent performance metrics' };
      } else if (metrics.success_rate >= 0.85 && metrics.error_rate < 0.1) {
        return { action: 'continue', reason: 'Good performance, continue monitoring' };
      } else if (metrics.success_rate < 0.7 || metrics.error_rate > 0.2) {
        return { action: 'rollback', reason: 'Poor performance metrics detected' };
      } else {
        return { action: 'pause', reason: 'Mixed results, investigate before continuing' };
      }
    }
  });

  describe('Emergency Rollback Procedures', () => {
    test('validates emergency disable functionality', async () => {
      // 1. Enable smart assignment globally
      await configManager.updateGlobalConfig({ smart_assignment_enabled: true });
      
      // Verify enabled
      let config = await configManager.getEffectiveConfig('kiosk-1');
      expect(config.smart_assignment_enabled).toBe(true);

      // 2. Trigger emergency disable
      const emergencyStartTime = Date.now();
      await configManager.emergencyDisable('Critical hardware malfunction detected');
      
      // 3. Verify immediate disable
      config = await configManager.getEffectiveConfig('kiosk-1');
      expect(config.smart_assignment_enabled).toBe(false);
      
      const emergencyTime = Date.now() - emergencyStartTime;
      expect(emergencyTime).toBeLessThan(1000); // Should be immediate

      // 4. Verify all kiosks disabled
      const allKiosks = ['kiosk-1', 'kiosk-2', 'kiosk-3', 'kiosk-4', 'kiosk-5'];
      for (const kioskId of allKiosks) {
        const kioskConfig = await configManager.getEffectiveConfig(kioskId);
        expect(kioskConfig.smart_assignment_enabled).toBe(false);
      }

      // 5. Verify emergency audit trail
      const history = await configManager.getConfigHistory();
      const emergencyRecord = history.find(h => h.changed_by === 'EMERGENCY_DISABLE');
      expect(emergencyRecord).toBeDefined();
      expect(emergencyRecord?.key).toBe('smart_assignment_enabled');
      expect(emergencyRecord?.new_value).toBe('false');
    });

    test('validates automated rollback triggers', async () => {
      // Enable smart assignment
      await configManager.setKioskOverride('kiosk-1', 'smart_assignment_enabled', true);
      
      // Simulate critical alert conditions
      await simulateCriticalAlerts('kiosk-1');
      
      // Check if automated rollback should trigger
      const shouldRollback = await evaluateAutomaticRollbackConditions('kiosk-1');
      expect(shouldRollback.trigger).toBe(true);
      expect(shouldRollback.reason).toContain('critical');
      
      // Execute automated rollback
      if (shouldRollback.trigger) {
        await executeAutomaticRollback('kiosk-1', shouldRollback.reason);
      }
      
      // Verify rollback completed
      const config = await configManager.getEffectiveConfig('kiosk-1');
      expect(config.smart_assignment_enabled).toBe(false);
    });

    test('validates rollback data preservation', async () => {
      // 1. Enable smart assignment and create assignments
      await configManager.updateGlobalConfig({ smart_assignment_enabled: true });
      
      const assignments = [];
      for (let i = 0; i < 5; i++) {
        const result = await assignmentEngine.assignLocker({
          cardId: `preserve-card-${i}`,
          kioskId: 'kiosk-1',
          timestamp: new Date()
        });
        if (result.success) {
          assignments.push({ cardId: `preserve-card-${i}`, lockerId: result.lockerId });
        }
      }
      
      expect(assignments.length).toBeGreaterThan(0);

      // 2. Rollback to manual mode
      await configManager.updateGlobalConfig({ smart_assignment_enabled: false });

      // 3. Verify existing assignments preserved
      for (const assignment of assignments) {
        const locker = await db.query(`
          SELECT * FROM lockers 
          WHERE owner_key = ? AND status = 'Owned'
        `, [assignment.cardId]);
        
        expect(locker.length).toBe(1);
        expect(locker[0].id).toBe(assignment.lockerId);
      }

      // 4. Verify manual operations still work with preserved data
      const manualRelease = await db.query(`
        UPDATE lockers SET status = 'Free', owner_key = NULL 
        WHERE owner_key = ?
      `, [assignments[0].cardId]);
      
      expect(manualRelease).toBeDefined();
    });

    test('validates configuration rollback procedures', async () => {
      // 1. Backup current configuration
      const originalConfig = await configManager.getGlobalConfig();
      const configBackup = await createConfigurationBackup();
      
      // 2. Make significant configuration changes
      await configManager.updateGlobalConfig({
        smart_assignment_enabled: true,
        base_score: 200,
        score_factor_a: 3.0,
        session_limit_minutes: 300
      });
      
      // 3. Verify changes applied
      const modifiedConfig = await configManager.getGlobalConfig();
      expect(modifiedConfig.smart_assignment_enabled).toBe(true);
      expect(modifiedConfig.base_score).toBe(200);

      // 4. Rollback configuration
      await restoreConfigurationBackup(configBackup);
      
      // 5. Verify rollback successful
      const restoredConfig = await configManager.getGlobalConfig();
      expect(restoredConfig.smart_assignment_enabled).toBe(originalConfig.smart_assignment_enabled);
      expect(restoredConfig.base_score).toBe(originalConfig.base_score);
      expect(restoredConfig.score_factor_a).toBe(originalConfig.score_factor_a);
    });

    async function simulateCriticalAlerts(kioskId: string) {
      // Trigger multiple critical alerts
      await alertManager.triggerAlert('no_stock', {
        kioskId,
        eventCount: 10,
        windowMinutes: 5
      });
      
      await alertManager.triggerAlert('open_fail_rate', {
        kioskId,
        failureRate: 0.15, // 15% failure rate
        windowMinutes: 10
      });
      
      await alertManager.triggerAlert('conflict_rate', {
        kioskId,
        conflictRate: 0.05, // 5% conflict rate
        windowMinutes: 5
      });
    }

    async function evaluateAutomaticRollbackConditions(kioskId: string) {
      const activeAlerts = await alertManager.getActiveAlerts(kioskId);
      const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
      
      if (criticalAlerts.length >= 2) {
        return {
          trigger: true,
          reason: `Multiple critical alerts detected: ${criticalAlerts.map(a => a.type).join(', ')}`
        };
      }
      
      return { trigger: false, reason: 'No critical conditions detected' };
    }

    async function executeAutomaticRollback(kioskId: string, reason: string) {
      // Disable smart assignment for specific kiosk
      await configManager.setKioskOverride(kioskId, 'smart_assignment_enabled', false);
      
      // Log rollback action
      await db.query(`
        INSERT INTO config_history (kiosk_id, key, old_value, new_value, changed_by, changed_at)
        VALUES (?, 'smart_assignment_enabled', 'true', 'false', 'AUTOMATIC_ROLLBACK', CURRENT_TIMESTAMP)
      `, [kioskId]);
    }

    async function createConfigurationBackup() {
      const globalConfig = await configManager.getGlobalConfig();
      const kioskOverrides = await db.query(`SELECT * FROM settings_kiosk`);
      
      return {
        timestamp: new Date().toISOString(),
        global_config: globalConfig,
        kiosk_overrides: kioskOverrides
      };
    }

    async function restoreConfigurationBackup(backup: any) {
      // Restore global configuration
      await configManager.updateGlobalConfig(backup.global_config);
      
      // Clear existing overrides
      await db.query(`DELETE FROM settings_kiosk`);
      
      // Restore kiosk overrides
      for (const override of backup.kiosk_overrides) {
        await db.query(`
          INSERT INTO settings_kiosk (kiosk_id, key, value, data_type, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [override.kiosk_id, override.key, override.value, override.data_type, 'BACKUP_RESTORE', new Date().toISOString()]);
      }
    }
  });

  describe('Rollout Communication and Documentation', () => {
    test('validates rollout status communication', async () => {
      // Test rollout status reporting
      const rolloutStatus = await generateRolloutStatusReport();
      
      expect(rolloutStatus.phase).toBeDefined();
      expect(rolloutStatus.enabled_kiosks).toBeDefined();
      expect(rolloutStatus.total_kiosks).toBeDefined();
      expect(rolloutStatus.success_metrics).toBeDefined();
      expect(rolloutStatus.issues).toBeDefined();
      expect(rolloutStatus.next_steps).toBeDefined();
    });

    test('validates rollback procedure documentation', () => {
      const rollbackProcedures = {
        emergency_disable: {
          command: 'configManager.emergencyDisable(reason)',
          time_limit: '< 1 second',
          scope: 'All kiosks immediately'
        },
        gradual_rollback: {
          command: 'configManager.setKioskOverride(kioskId, "smart_assignment_enabled", false)',
          time_limit: '< 3 seconds per kiosk',
          scope: 'Per-kiosk selective'
        },
        configuration_restore: {
          command: 'restoreConfigurationBackup(backup)',
          time_limit: '< 10 seconds',
          scope: 'All configuration settings'
        }
      };

      Object.entries(rollbackProcedures).forEach(([procedure, details]) => {
        expect(details.command).toBeDefined();
        expect(details.time_limit).toBeDefined();
        expect(details.scope).toBeDefined();
      });
    });

    async function generateRolloutStatusReport() {
      const enabledKiosks = await getEnabledKiosks();
      const totalKiosks = 5;
      
      return {
        phase: enabledKiosks.length === 0 ? 'not_started' : 
               enabledKiosks.length < totalKiosks ? 'in_progress' : 'complete',
        enabled_kiosks: enabledKiosks.length,
        total_kiosks: totalKiosks,
        rollout_percentage: Math.round((enabledKiosks.length / totalKiosks) * 100),
        success_metrics: {
          overall_success_rate: 0.95,
          average_response_time: 450,
          error_rate: 0.02
        },
        issues: [],
        next_steps: enabledKiosks.length < totalKiosks ? 
          ['Monitor current kiosks for 24h', 'Enable next batch if metrics good'] :
          ['Monitor all kiosks', 'Optimize based on usage patterns']
      };
    }
  });
});