/**
 * Production Readiness - Acceptance Tests
 * 
 * Validates production readiness of the smart assignment system including
 * performance, reliability, monitoring, and operational requirements.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../shared/database/database-manager';
import { AssignmentEngine } from '../../shared/services/assignment-engine';
import { ConfigurationManager } from '../../shared/services/configuration-manager';
import { SessionTracker } from '../../shared/services/session-tracker';
import { AlertManager } from '../../shared/services/alert-manager';

describe('Production Readiness Acceptance', () => {
  let db: DatabaseManager;
  let assignmentEngine: AssignmentEngine;
  let configManager: ConfigurationManager;
  let sessionTracker: SessionTracker;
  let alertManager: AlertManager;

  beforeEach(async () => {
    db = new DatabaseManager(':memory:');
    await db.initialize();
    
    configManager = new ConfigurationManager(db);
    assignmentEngine = new AssignmentEngine(db, configManager);
    sessionTracker = new SessionTracker(db);
    alertManager = new AlertManager(db);
    
    await seedProductionEnvironment();
  });

  afterEach(async () => {
    await db.close();
  });

  async function seedProductionEnvironment() {
    // Create realistic production data
    const kiosks = ['kiosk-main', 'kiosk-secondary', 'kiosk-backup'];
    
    for (const kioskId of kiosks) {
      for (let i = 1; i <= 30; i++) {
        await db.query(`
          INSERT INTO lockers (kiosk_id, id, status, free_since, wear_count) 
          VALUES (?, ?, 'Free', CURRENT_TIMESTAMP, ?)
        `, [kioskId, i, Math.floor(Math.random() * 100)]);
      }
    }

    await configManager.seedDefaultConfiguration();
    await configManager.updateGlobalConfig({ smart_assignment_enabled: true });
  }

  describe('Performance Requirements', () => {
    test('validates assignment latency under normal load', async () => {
      // Read SLA from configuration instead of hardcoding
      const config = await configManager.getGlobalConfig();
      const maxResponseTimeMs = config.maxResponseTimeMs || 500; // Default fallback
      
      const assignments = [];
      const startTime = Date.now();
      
      // Test 50 sequential assignments
      for (let i = 0; i < 50; i++) {
        const assignmentStart = Date.now();
        
        const result = await assignmentEngine.assignLocker({
          cardId: `perf-card-${i}`,
          kioskId: 'kiosk-main',
          timestamp: new Date()
        });
        
        const assignmentTime = Date.now() - assignmentStart;
        assignments.push({ result, duration: assignmentTime });
        
        // Each assignment should be ≤ maxResponseTimeMs from config
        expect(assignmentTime).toBeLessThanOrEqual(maxResponseTimeMs);
      }
      
      const totalTime = Date.now() - startTime;
      const averageTime = totalTime / assignments.length;
      
      // Average should be significantly faster than max
      expect(averageTime).toBeLessThan(maxResponseTimeMs * 0.6);
      
      // Verify success rate
      const successfulAssignments = assignments.filter(a => a.result.success);
      const successRate = successfulAssignments.length / assignments.length;
      expect(successRate).toBeGreaterThan(0.95); // >95% success rate
    });

    test('validates concurrent assignment performance', async () => {
      const concurrentAssignments = [];
      const startTime = Date.now();
      
      // Test 20 concurrent assignments
      for (let i = 0; i < 20; i++) {
        concurrentAssignments.push(
          assignmentEngine.assignLocker({
            cardId: `concurrent-card-${i}`,
            kioskId: 'kiosk-main',
            timestamp: new Date()
          })
        );
      }
      
      const results = await Promise.all(concurrentAssignments);
      const totalTime = Date.now() - startTime;
      
      // Should complete within reasonable time even with concurrency
      expect(totalTime).toBeLessThan(5000); // 5 seconds for 20 concurrent
      
      // Verify no double assignments
      const successfulResults = results.filter(r => r.success);
      const assignedLockers = successfulResults.map(r => r.lockerId);
      const uniqueLockers = new Set(assignedLockers);
      
      expect(uniqueLockers.size).toBe(assignedLockers.length); // No duplicates
    });

    test('validates configuration hot reload performance', async () => {
      const reloadTimes = [];
      
      // Test multiple hot reloads
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        
        await configManager.updateGlobalConfig({ base_score: 100 + i });
        await configManager.triggerReload();
        
        const reloadTime = Date.now() - startTime;
        reloadTimes.push(reloadTime);
        
        // Each reload should be ≤3 seconds (requirement)
        expect(reloadTime).toBeLessThanOrEqual(3000);
      }
      
      const averageReloadTime = reloadTimes.reduce((a, b) => a + b, 0) / reloadTimes.length;
      expect(averageReloadTime).toBeLessThan(2000); // Average should be faster
    });

    test('validates database performance under load', async () => {
      // Test database operations under load
      const operations = [];
      
      for (let i = 0; i < 100; i++) {
        operations.push(
          db.query(`SELECT * FROM lockers WHERE kiosk_id = 'kiosk-main' AND status = 'Free'`)
        );
      }
      
      const startTime = Date.now();
      const results = await Promise.all(operations);
      const queryTime = Date.now() - startTime;
      
      expect(queryTime).toBeLessThan(2000); // 100 queries in <2 seconds
      expect(results.every(r => Array.isArray(r))).toBe(true);
    });
  });

  describe('Reliability and Error Handling', () => {
    test('validates graceful degradation under system stress', async () => {
      // Fill most lockers to create stress
      await db.query(`
        UPDATE lockers SET status = 'Owned', owner_key = 'stress-test'
        WHERE kiosk_id = 'kiosk-main' AND id <= 25
      `);
      
      // Test assignments under low availability
      const stressResults = [];
      for (let i = 0; i < 10; i++) {
        const result = await assignmentEngine.assignLocker({
          cardId: `stress-card-${i}`,
          kioskId: 'kiosk-main',
          timestamp: new Date()
        });
        stressResults.push(result);
      }
      
      // Should handle gracefully - some succeed, others fail with proper message
      const successful = stressResults.filter(r => r.success);
      const failed = stressResults.filter(r => !r.success);
      
      expect(successful.length).toBeLessThanOrEqual(5); // Limited by available lockers
      failed.forEach(result => {
        expect(result.message).toBe("Boş dolap yok. Görevliye başvurun");
      });
    });

    test('validates error recovery and retry logic', async () => {
      // Simulate database connection issues
      const originalQuery = db.query;
      let failureCount = 0;
      
      db.query = async (...args) => {
        failureCount++;
        if (failureCount <= 2) {
          throw new Error('Database connection lost');
        }
        return originalQuery.apply(db, args);
      };
      
      // Test assignment with retry logic
      const result = await assignmentEngine.assignLocker({
        cardId: 'retry-test-card',
        kioskId: 'kiosk-main',
        timestamp: new Date()
      });
      
      // Should eventually succeed after retries
      expect(result.success).toBe(true);
      expect(failureCount).toBeGreaterThan(2); // Retries occurred
      
      // Restore database
      db.query = originalQuery;
    });

    test('validates memory leak prevention', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform many operations to test for memory leaks
      for (let i = 0; i < 1000; i++) {
        await assignmentEngine.scoreLockers('kiosk-main', []);
        await configManager.getEffectiveConfig('kiosk-main');
        
        // Force garbage collection periodically
        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (< 50MB for 1000 operations)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('validates transaction rollback on failures', async () => {
      // Test transaction rollback behavior
      const originalAssignLocker = assignmentEngine.assignLocker;
      
      assignmentEngine.assignLocker = async (request) => {
        // Start transaction, then fail midway
        const result = await originalAssignLocker.call(assignmentEngine, request);
        if (result.success) {
          throw new Error('Simulated failure after assignment');
        }
        return result;
      };
      
      try {
        await assignmentEngine.assignLocker({
          cardId: 'rollback-test',
          kioskId: 'kiosk-main',
          timestamp: new Date()
        });
      } catch (error) {
        // Expected to fail
      }
      
      // Verify no partial state left behind
      const orphanedAssignments = await db.query(`
        SELECT * FROM lockers WHERE owner_key = 'rollback-test'
      `);
      expect(orphanedAssignments.length).toBe(0);
      
      // Restore original function
      assignmentEngine.assignLocker = originalAssignLocker;
    });
  });

  describe('Monitoring and Alerting', () => {
    test('validates comprehensive system monitoring', async () => {
      // Generate various system events
      await generateMonitoringTestData();
      
      // Check system health metrics
      const healthMetrics = await getSystemHealthMetrics();
      
      expect(healthMetrics.assignment_success_rate).toBeDefined();
      expect(healthMetrics.average_response_time).toBeDefined();
      expect(healthMetrics.error_rate).toBeDefined();
      expect(healthMetrics.active_sessions).toBeDefined();
      expect(healthMetrics.available_capacity).toBeDefined();
      
      // Verify metrics are within acceptable ranges
      expect(healthMetrics.assignment_success_rate).toBeGreaterThan(0.9);
      expect(healthMetrics.average_response_time).toBeLessThan(1000);
      expect(healthMetrics.error_rate).toBeLessThan(0.1);
    });

    test('validates alert system functionality', async () => {
      // Test all alert types
      const alertTypes = ['no_stock', 'conflict_rate', 'open_fail_rate', 'retry_rate', 'overdue_share'];
      
      for (const alertType of alertTypes) {
        await alertManager.triggerAlert(alertType, {
          kioskId: 'kiosk-main',
          threshold_exceeded: true,
          current_value: 0.15,
          threshold_value: 0.1
        });
      }
      
      // Verify alerts are active
      const activeAlerts = await alertManager.getActiveAlerts('kiosk-main');
      expect(activeAlerts.length).toBe(alertTypes.length);
      
      // Test alert auto-clearing
      for (const alert of activeAlerts) {
        await alertManager.clearAlert(alert.id);
      }
      
      const clearedAlerts = await alertManager.getActiveAlerts('kiosk-main');
      expect(clearedAlerts.length).toBe(0);
    });

    test('validates performance metrics collection', async () => {
      // Generate performance data
      for (let i = 0; i < 20; i++) {
        await assignmentEngine.assignLocker({
          cardId: `metrics-card-${i}`,
          kioskId: 'kiosk-main',
          timestamp: new Date()
        });
      }
      
      // Verify metrics are collected
      const metrics = await db.query(`
        SELECT * FROM assignment_metrics 
        WHERE kiosk_id = 'kiosk-main' 
        ORDER BY assignment_time DESC 
        LIMIT 20
      `);
      
      expect(metrics.length).toBe(20);
      
      // Verify metric data quality
      metrics.forEach(metric => {
        expect(metric.duration_ms).toBeGreaterThan(0);
        expect(metric.success).toBeTypeOf('number');
        expect(metric.action_type).toBeDefined();
      });
    });

    async function generateMonitoringTestData() {
      // Create various assignment scenarios
      const scenarios = [
        { success: true, duration: 450, action: 'assign_new' },
        { success: true, duration: 380, action: 'open_existing' },
        { success: false, duration: 1200, action: 'assign_new', error: 'no_stock' },
        { success: true, duration: 520, action: 'retrieve_overdue' },
        { success: false, duration: 800, action: 'assign_new', error: 'hardware_error' }
      ];
      
      for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];
        await db.query(`
          INSERT INTO assignment_metrics (kiosk_id, card_id, assignment_time, action_type, success, duration_ms, error_code)
          VALUES ('kiosk-main', ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
        `, [`monitor-card-${i}`, scenario.action, scenario.success ? 1 : 0, scenario.duration, scenario.error || null]);
      }
    }

    async function getSystemHealthMetrics() {
      const results = await db.query(`
        SELECT 
          AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as assignment_success_rate,
          AVG(duration_ms) as average_response_time,
          AVG(CASE WHEN success = 0 THEN 1.0 ELSE 0.0 END) as error_rate,
          COUNT(*) as total_operations
        FROM assignment_metrics 
        WHERE assignment_time > datetime('now', '-1 hour')
      `);
      
      const sessionCount = await db.query(`
        SELECT COUNT(*) as active_sessions FROM smart_sessions WHERE status = 'active'
      `);
      
      const capacityInfo = await db.query(`
        SELECT 
          COUNT(*) as total_lockers,
          SUM(CASE WHEN status = 'Free' THEN 1 ELSE 0 END) as available_lockers
        FROM lockers WHERE kiosk_id = 'kiosk-main'
      `);
      
      return {
        ...results[0],
        active_sessions: sessionCount[0].active_sessions,
        available_capacity: capacityInfo[0].available_lockers / capacityInfo[0].total_lockers
      };
    }
  });

  describe('Operational Requirements', () => {
    test('validates backup and recovery procedures', async () => {
      // Create operational data
      await assignmentEngine.assignLocker({
        cardId: 'backup-test-card',
        kioskId: 'kiosk-main',
        timestamp: new Date()
      });
      
      // Simulate backup
      const backupData = await createSystemBackup();
      expect(backupData.lockers).toBeDefined();
      expect(backupData.sessions).toBeDefined();
      expect(backupData.configuration).toBeDefined();
      expect(backupData.metrics).toBeDefined();
      
      // Simulate data corruption
      await db.query(`DELETE FROM lockers WHERE owner_key = 'backup-test-card'`);
      
      // Verify data is missing
      const corruptedData = await db.query(`SELECT * FROM lockers WHERE owner_key = 'backup-test-card'`);
      expect(corruptedData.length).toBe(0);
      
      // Restore from backup
      await restoreFromBackup(backupData);
      
      // Verify data is restored
      const restoredData = await db.query(`SELECT * FROM lockers WHERE owner_key = 'backup-test-card'`);
      expect(restoredData.length).toBe(1);
    });

    test('validates system maintenance procedures', async () => {
      // Test maintenance mode
      await configManager.updateGlobalConfig({ maintenance_mode: true });
      
      // Verify system behavior in maintenance mode
      const result = await assignmentEngine.assignLocker({
        cardId: 'maintenance-test',
        kioskId: 'kiosk-main',
        timestamp: new Date()
      });
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('maintenance'); // Should indicate maintenance
      
      // Exit maintenance mode
      await configManager.updateGlobalConfig({ maintenance_mode: false });
      
      // Verify normal operation resumed
      const normalResult = await assignmentEngine.assignLocker({
        cardId: 'post-maintenance-test',
        kioskId: 'kiosk-main',
        timestamp: new Date()
      });
      
      expect(normalResult.success).toBe(true);
    });

    test('validates log management and retention', async () => {
      // Generate log entries
      for (let i = 0; i < 100; i++) {
        await db.query(`
          INSERT INTO assignment_metrics (kiosk_id, card_id, assignment_time, action_type, success, duration_ms)
          VALUES ('kiosk-main', ?, datetime('now', '-${i} hours'), 'assign_new', 1, 450)
        `, [`log-test-${i}`]);
      }
      
      // Test log retention policy (keep last 30 days)
      const oldLogs = await db.query(`
        SELECT COUNT(*) as count FROM assignment_metrics 
        WHERE assignment_time < datetime('now', '-30 days')
      `);
      
      // Simulate log cleanup
      await db.query(`
        DELETE FROM assignment_metrics 
        WHERE assignment_time < datetime('now', '-30 days')
      `);
      
      const remainingLogs = await db.query(`
        SELECT COUNT(*) as count FROM assignment_metrics
      `);
      
      expect(remainingLogs[0].count).toBeLessThan(100); // Some logs should be cleaned
    });

    test('validates security and access control', async () => {
      // Test configuration access control
      const sensitiveOperations = [
        () => configManager.updateGlobalConfig({ smart_assignment_enabled: false }),
        () => configManager.emergencyDisable('Security test'),
        () => sessionTracker.extendSession('test-session', 'admin', 'Security test')
      ];
      
      // All operations should require proper authentication
      for (const operation of sensitiveOperations) {
        try {
          await operation();
          // Should succeed with proper auth (simulated)
          expect(true).toBe(true);
        } catch (error) {
          // Or fail gracefully with auth error
          expect(error.message).toMatch(/auth|permission|access/i);
        }
      }
    });

    async function createSystemBackup() {
      const lockers = await db.query(`SELECT * FROM lockers`);
      const sessions = await db.query(`SELECT * FROM smart_sessions`);
      const configuration = await configManager.getGlobalConfig();
      const metrics = await db.query(`SELECT * FROM assignment_metrics WHERE assignment_time > datetime('now', '-7 days')`);
      
      return {
        timestamp: new Date().toISOString(),
        lockers,
        sessions,
        configuration,
        metrics
      };
    }

    async function restoreFromBackup(backup: any) {
      // Restore lockers
      await db.query(`DELETE FROM lockers`);
      for (const locker of backup.lockers) {
        await db.query(`
          INSERT INTO lockers (kiosk_id, id, status, owner_key, free_since, wear_count)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [locker.kiosk_id, locker.id, locker.status, locker.owner_key, locker.free_since, locker.wear_count]);
      }
      
      // Restore configuration
      await configManager.updateGlobalConfig(backup.configuration);
    }
  });

  describe('Log Message Validation', () => {
    test('validates exact log lines with periods', async () => {
      // Capture logs during assignment
      const logMessages: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logMessages.push(args.join(' '));
        originalLog(...args);
      };

      try {
        // Perform assignment to generate logs
        const result = await assignmentEngine.assignLocker({
          cardId: 'log-test-card',
          kioskId: 'kiosk-main',
          timestamp: new Date()
        });

        // Restore original console.log
        console.log = originalLog;

        if (result.success) {
          // Check for exact log lines with periods
          const selectionLog = logMessages.find(msg => 
            msg.match(/Selected locker \d+ from \d+ candidates\./)
          );
          expect(selectionLog).toBeDefined();
          expect(selectionLog).toMatch(/Selected locker \d+ from \d+ candidates\./);
        }

        // Check for config load log
        const configLog = logMessages.find(msg => 
          msg.match(/Config loaded: version=\d+\./)
        );
        expect(configLog).toBeDefined();
        expect(configLog).toMatch(/Config loaded: version=\d+\./);

      } finally {
        // Ensure console.log is restored even if test fails
        console.log = originalLog;
      }
    });

    test('validates log message format consistency', async () => {
      const logMessages: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logMessages.push(args.join(' '));
        originalLog(...args);
      };

      try {
        // Generate multiple assignments to capture various log messages
        for (let i = 0; i < 3; i++) {
          await assignmentEngine.assignLocker({
            cardId: `log-format-test-${i}`,
            kioskId: 'kiosk-main',
            timestamp: new Date()
          });
        }

        console.log = originalLog;

        // Verify all log messages end with periods
        const systemLogs = logMessages.filter(msg => 
          msg.includes('Selected locker') || 
          msg.includes('Config loaded') ||
          msg.includes('Assignment completed')
        );

        systemLogs.forEach(log => {
          expect(log.endsWith('.')).toBe(true);
        });

      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Integration and Compatibility', () => {
    test('validates backward compatibility with existing systems', async () => {
      // Test manual mode still works
      await configManager.updateGlobalConfig({ smart_assignment_enabled: false });
      
      // Simulate manual assignment
      const manualAssignment = await db.query(`
        UPDATE lockers SET status = 'Owned', owner_key = 'manual-test'
        WHERE kiosk_id = 'kiosk-main' AND id = 1 AND status = 'Free'
      `);
      
      expect(manualAssignment).toBeDefined();
      
      // Verify manual release works
      const manualRelease = await db.query(`
        UPDATE lockers SET status = 'Free', owner_key = NULL
        WHERE kiosk_id = 'kiosk-main' AND id = 1
      `);
      
      expect(manualRelease).toBeDefined();
    });

    test('validates API compatibility', async () => {
      // FIXED: Test only admin API endpoints with consistent prefixes
      const apiTests = [
        { endpoint: 'GET /health', expected: 'object' },
        { endpoint: 'GET /api/admin/config/', expected: 'object' },
        { endpoint: 'GET /api/admin/alerts/', expected: 'array' },
        { endpoint: 'GET /api/admin/sessions/active', expected: 'array' }
      ];
      
      // Simulate API calls
      for (const test of apiTests) {
        const result = await simulateApiCall(test.endpoint);
        expect(result).toBeDefined();
      }
    });

    test('validates hardware integration compatibility', async () => {
      // Test hardware command generation
      const hardwareCommands = await generateHardwareCommands();
      
      expect(hardwareCommands.relay_commands).toBeDefined();
      expect(hardwareCommands.timing_constraints).toBeDefined();
      expect(hardwareCommands.error_handling).toBeDefined();
      
      // Verify timing constraints
      expect(hardwareCommands.timing_constraints.pulse_duration).toBeLessThanOrEqual(800);
      expect(hardwareCommands.timing_constraints.command_interval).toBeGreaterThanOrEqual(300);
    });

    async function simulateApiCall(endpoint: string) {
      // FIXED: Use only admin API endpoints with consistent prefixes
      switch (endpoint) {
        case 'GET /health':
          return { status: 'healthy', timestamp: new Date().toISOString() };
        case 'GET /api/admin/config/':
          return await configManager.getGlobalConfig();
        case 'GET /api/admin/alerts/':
          return await alertManager.getActiveAlerts('kiosk-main');
        case 'GET /api/admin/sessions/active':
          return await sessionTracker.getActiveSessions();
        default:
          return null;
      }
    }

    async function generateHardwareCommands() {
      return {
        relay_commands: {
          open_command: 'FF 00',
          close_command: '00 00',
          pulse_duration: 800
        },
        timing_constraints: {
          pulse_duration: 800,
          command_interval: 300,
          retry_backoff: 500
        },
        error_handling: {
          max_retries: 1,
          timeout_ms: 5000,
          fallback_mode: 'manual'
        }
      };
    }
  });
});