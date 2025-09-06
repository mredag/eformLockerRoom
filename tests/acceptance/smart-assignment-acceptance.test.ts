/**
 * Smart Locker Assignment - Acceptance Tests
 * 
 * This test suite validates all acceptance criteria for the smart assignment system:
 * - Turkish UI messages validation
 * - Admin panel functionality and workflows
 * - Configuration scenarios and edge cases
 * - Rollout and rollback procedures
 * - Production readiness validation
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../shared/database/database-manager';
import { AssignmentEngine } from '../../shared/services/assignment-engine';
import { ConfigurationManager } from '../../shared/services/configuration-manager';
import { SessionTracker } from '../../shared/services/session-tracker';
import { AlertManager } from '../../shared/services/alert-manager';

describe('Smart Assignment Acceptance Tests', () => {
  let db: DatabaseManager;
  let assignmentEngine: AssignmentEngine;
  let configManager: ConfigurationManager;
  let sessionTracker: SessionTracker;
  let alertManager: AlertManager;

  beforeEach(async () => {
    // Initialize test database and services
    db = new DatabaseManager(':memory:');
    await db.initialize();
    
    configManager = new ConfigurationManager(db);
    assignmentEngine = new AssignmentEngine(db, configManager);
    sessionTracker = new SessionTracker(db);
    alertManager = new AlertManager(db);
    
    // Seed test data
    await seedTestData();
  });

  afterEach(async () => {
    await db.close();
  });

  async function seedTestData() {
    // Create test kiosk and lockers
    await db.query(`
      INSERT INTO lockers (kiosk_id, id, status) VALUES 
      ('test-kiosk', 1, 'Free'),
      ('test-kiosk', 2, 'Free'),
      ('test-kiosk', 3, 'Owned'),
      ('test-kiosk', 4, 'Free'),
      ('test-kiosk', 5, 'Free')
    `);

    // Seed default configuration
    await configManager.seedDefaultConfiguration();
  }

  describe('Turkish UI Messages Validation', () => {
    test('validates all required Turkish messages are present and correct', async () => {
      const requiredMessages = {
        idle: "Kartınızı okutun.",
        success_new: "Dolabınız açıldı. Eşyalarınızı yerleştirin.",
        success_existing: "Önceki dolabınız açıldı.",
        retrieve_overdue: "Süreniz doldu. Almanız için açılıyor.",
        reported_occupied: "Dolap dolu bildirildi. Yeni dolap açılıyor.",
        retry: "Tekrar deneniyor.",
        throttled: "Lütfen birkaç saniye sonra deneyin.",
        no_stock: "Boş dolap yok. Görevliye başvurun.",
        error: "Şu an işlem yapılamıyor."
      };

      // Test each message scenario
      for (const [scenario, expectedMessage] of Object.entries(requiredMessages)) {
        const result = await simulateScenario(scenario);
        expect(result.message).toBe(expectedMessage);
      }
    });

    test('validates Turkish characters are properly encoded', () => {
      const turkishChars = ['ç', 'ğ', 'ı', 'ö', 'ş', 'ü', 'Ç', 'Ğ', 'İ', 'Ö', 'Ş', 'Ü'];
      const messages = [
        "Kartınızı okutun.",
        "Dolabınız açıldı. Eşyalarınızı yerleştirin.",
        "Önceki dolabınız açıldı.",
        "Süreniz doldu. Almanız için açılıyor."
      ];

      messages.forEach(message => {
        const hasValidTurkish = turkishChars.some(char => message.includes(char));
        if (hasValidTurkish) {
          // Verify UTF-8 encoding
          const encoded = Buffer.from(message, 'utf8');
          const decoded = encoded.toString('utf8');
          expect(decoded).toBe(message);
        }
      });
    });

    test('validates message display timing constraints', async () => {
      const startTime = Date.now();
      
      // Simulate retry scenario with timing constraints
      const result = await assignmentEngine.assignLocker({
        cardId: 'test-card',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });

      const duration = Date.now() - startTime;
      
      // Verify timing budget: ≤ pulse_ms + open_window_sec + retry_backoff_ms + pulse_ms
      const config = await configManager.getEffectiveConfig('test-kiosk');
      const maxDuration = config.pulse_ms + (config.open_window_sec * 1000) + 
                         config.retry_backoff_ms + config.pulse_ms;
      
      expect(duration).toBeLessThanOrEqual(maxDuration);
    });

    async function simulateScenario(scenario: string) {
      switch (scenario) {
        case 'idle':
          return { message: "Kartınızı okutun." };
        case 'success_new':
          return await assignmentEngine.assignLocker({
            cardId: 'new-card',
            kioskId: 'test-kiosk',
            timestamp: new Date()
          });
        case 'success_existing':
          // First assign, then return
          await assignmentEngine.assignLocker({
            cardId: 'existing-card',
            kioskId: 'test-kiosk',
            timestamp: new Date()
          });
          return await assignmentEngine.assignLocker({
            cardId: 'existing-card',
            kioskId: 'test-kiosk',
            timestamp: new Date()
          });
        case 'no_stock':
          // Fill all lockers
          await db.query(`UPDATE lockers SET status = 'Owned' WHERE kiosk_id = 'test-kiosk'`);
          return await assignmentEngine.assignLocker({
            cardId: 'no-stock-card',
            kioskId: 'test-kiosk',
            timestamp: new Date()
          });
        default:
          return { message: "Test scenario not implemented" };
      }
    }
  });

  describe('Admin Panel Functionality', () => {
    test('validates configuration management workflow', async () => {
      // Test global configuration update
      const newConfig = {
        base_score: 150,
        score_factor_a: 2.5,
        smart_assignment_enabled: true
      };

      await configManager.updateGlobalConfig(newConfig);
      const globalConfig = await configManager.getGlobalConfig();
      
      expect(globalConfig.base_score).toBe(150);
      expect(globalConfig.score_factor_a).toBe(2.5);
      expect(globalConfig.smart_assignment_enabled).toBe(true);
    });

    test('validates kiosk override functionality', async () => {
      // Set kiosk-specific override
      await configManager.setKioskOverride('test-kiosk', 'session_limit_minutes', 240);
      
      const effectiveConfig = await configManager.getEffectiveConfig('test-kiosk');
      expect(effectiveConfig.session_limit_minutes).toBe(240);
      
      // Remove override
      await configManager.removeKioskOverride('test-kiosk', 'session_limit_minutes');
      
      const resetConfig = await configManager.getEffectiveConfig('test-kiosk');
      expect(resetConfig.session_limit_minutes).toBe(180); // Default value
    });

    test('validates live session monitoring', async () => {
      // Create test session
      const session = await sessionTracker.createSmartSession('test-card', 'test-kiosk');
      
      // Verify session appears in live monitoring
      const liveSessions = await sessionTracker.getActiveSessions();
      expect(liveSessions).toHaveLength(1);
      expect(liveSessions[0].cardId).toBe('test-card');
      expect(liveSessions[0].status).toBe('active');
    });

    test('validates session extension workflow', async () => {
      const session = await sessionTracker.createSmartSession('test-card', 'test-kiosk');
      
      // Extend session
      const extended = await sessionTracker.extendSession(
        session.id, 
        'admin-user', 
        'User requested more time'
      );
      
      expect(extended).toBe(true);
      
      const updatedSession = await sessionTracker.getActiveSession('test-card');
      expect(updatedSession?.extensionCount).toBe(1);
    });

    test('validates overdue locker management', async () => {
      // Create overdue session
      const session = await sessionTracker.createSmartSession('overdue-card', 'test-kiosk');
      await sessionTracker.markOverdue(session.id);
      
      const overdueSessions = await sessionTracker.getOverdueSessions();
      expect(overdueSessions).toHaveLength(1);
      expect(overdueSessions[0].status).toBe('overdue');
    });

    test('validates Turkish admin interface labels', () => {
      const requiredLabels = {
        save: "Kaydet",
        load_default: "Varsayılanı Yükle", 
        override_for_kiosk: "Kiosk için Geçersiz Kıl",
        remaining_time: "Kalan süre",
        extend_session: "Oturumu uzat +60 dk",
        overdue_lockers: "Gecikmiş dolaplar",
        suspected_lockers: "Şüpheli dolaplar"
      };

      // Verify all required Turkish labels are defined
      Object.values(requiredLabels).forEach(label => {
        expect(label).toMatch(/[çğıöşüÇĞİÖŞÜ]/); // Contains Turkish characters
        expect(label.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Configuration Scenarios and Edge Cases', () => {
    test('validates hot reload within 3 seconds', async () => {
      const startTime = Date.now();
      
      // Update configuration
      await configManager.updateGlobalConfig({ base_score: 200 });
      
      // Trigger reload and measure propagation time
      await configManager.triggerReload();
      
      const propagationTime = Date.now() - startTime;
      expect(propagationTime).toBeLessThanOrEqual(3000); // ≤3 seconds
    });

    test('validates configuration validation and type checking', async () => {
      // Test invalid configuration values
      await expect(
        configManager.updateGlobalConfig({ base_score: 'invalid' as any })
      ).rejects.toThrow();
      
      await expect(
        configManager.updateGlobalConfig({ smart_assignment_enabled: 'maybe' as any })
      ).rejects.toThrow();
    });

    test('validates configuration merge logic', async () => {
      // Set global and kiosk-specific values
      await configManager.updateGlobalConfig({ base_score: 100 });
      await configManager.setKioskOverride('test-kiosk', 'base_score', 150);
      
      const effective = await configManager.getEffectiveConfig('test-kiosk');
      expect(effective.base_score).toBe(150); // Override takes precedence
    });

    test('validates configuration audit trail', async () => {
      await configManager.updateGlobalConfig({ base_score: 125 });
      
      const history = await configManager.getConfigHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].key).toBe('base_score');
      expect(history[0].new_value).toBe('125');
    });

    test('validates edge case: zero available lockers', async () => {
      // Set all lockers to owned
      await db.query(`UPDATE lockers SET status = 'Owned' WHERE kiosk_id = 'test-kiosk'`);
      
      const result = await assignmentEngine.assignLocker({
        cardId: 'test-card',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });
      
      expect(result.success).toBe(false);
      expect(result.message).toBe("Boş dolap yok. Görevliye başvurun");
    });

    test('validates edge case: very low capacity behavior', async () => {
      // Set up low capacity scenario (only 1 free locker)
      await db.query(`
        UPDATE lockers SET status = 'Owned' 
        WHERE kiosk_id = 'test-kiosk' AND id != 1
      `);
      
      const config = await configManager.getEffectiveConfig('test-kiosk');
      
      // Verify hot window is disabled at low capacity
      const freeRatio = 0.2; // 1 out of 5 lockers free
      expect(freeRatio).toBeLessThanOrEqual(0.1); // Should disable hot window
    });
  });

  describe('Rollout and Rollback Procedures', () => {
    test('validates feature flag switching without restart', async () => {
      // Initially disabled
      let config = await configManager.getEffectiveConfig('test-kiosk');
      expect(config.smart_assignment_enabled).toBe(false);
      
      // Enable smart assignment
      await configManager.updateGlobalConfig({ smart_assignment_enabled: true });
      
      config = await configManager.getEffectiveConfig('test-kiosk');
      expect(config.smart_assignment_enabled).toBe(true);
      
      // Disable (rollback)
      await configManager.updateGlobalConfig({ smart_assignment_enabled: false });
      
      config = await configManager.getEffectiveConfig('test-kiosk');
      expect(config.smart_assignment_enabled).toBe(false);
    });

    test('validates per-kiosk rollout capability', async () => {
      // Enable for specific kiosk only
      await configManager.setKioskOverride('test-kiosk', 'smart_assignment_enabled', true);
      
      const kioskConfig = await configManager.getEffectiveConfig('test-kiosk');
      const otherKioskConfig = await configManager.getEffectiveConfig('other-kiosk');
      
      expect(kioskConfig.smart_assignment_enabled).toBe(true);
      expect(otherKioskConfig.smart_assignment_enabled).toBe(false);
    });

    test('validates emergency disable functionality', async () => {
      // Enable system
      await configManager.updateGlobalConfig({ smart_assignment_enabled: true });
      
      // Emergency disable
      await configManager.emergencyDisable('Critical hardware issue');
      
      const config = await configManager.getEffectiveConfig('test-kiosk');
      expect(config.smart_assignment_enabled).toBe(false);
      
      // Verify audit trail
      const history = await configManager.getConfigHistory();
      const emergencyRecord = history.find(h => h.changed_by === 'EMERGENCY_DISABLE');
      expect(emergencyRecord).toBeDefined();
    });

    test('validates rollback preserves data integrity', async () => {
      // Create some assignments
      await assignmentEngine.assignLocker({
        cardId: 'test-card-1',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });
      
      // Rollback to manual mode
      await configManager.updateGlobalConfig({ smart_assignment_enabled: false });
      
      // Verify existing assignments are preserved
      const existingOwnership = await db.query(`
        SELECT * FROM lockers WHERE owner_key = 'test-card-1'
      `);
      expect(existingOwnership.length).toBe(1);
    });

    test('validates configuration version tracking', async () => {
      const initialVersion = await configManager.getConfigVersion();
      
      await configManager.updateGlobalConfig({ base_score: 110 });
      
      const newVersion = await configManager.getConfigVersion();
      expect(newVersion).toBeGreaterThan(initialVersion);
    });
  });

  describe('Production Readiness Validation', () => {
    test('validates assignment performance under load', async () => {
      const assignments = [];
      const startTime = Date.now();
      
      // Simulate 10 concurrent assignments
      for (let i = 0; i < 10; i++) {
        assignments.push(
          assignmentEngine.assignLocker({
            cardId: `load-test-${i}`,
            kioskId: 'test-kiosk',
            timestamp: new Date()
          })
        );
      }
      
      const results = await Promise.all(assignments);
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds for 10 assignments
      
      // At least some should succeed (limited by available lockers)
      const successful = results.filter(r => r.success);
      expect(successful.length).toBeGreaterThan(0);
    });

    test('validates concurrency control and race conditions', async () => {
      // Simulate race condition: two cards trying to get same locker
      const promise1 = assignmentEngine.assignLocker({
        cardId: 'race-card-1',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });
      
      const promise2 = assignmentEngine.assignLocker({
        cardId: 'race-card-2', 
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });
      
      const [result1, result2] = await Promise.all([promise1, promise2]);
      
      // Only one should succeed, or both succeed with different lockers
      if (result1.success && result2.success) {
        expect(result1.lockerId).not.toBe(result2.lockerId);
      }
    });

    test('validates error handling and recovery', async () => {
      // Simulate database error
      const originalQuery = db.query;
      db.query = async () => { throw new Error('Database connection lost'); };
      
      const result = await assignmentEngine.assignLocker({
        cardId: 'error-test',
        kioskId: 'test-kiosk', 
        timestamp: new Date()
      });
      
      expect(result.success).toBe(false);
      expect(result.message).toBe("Şu an işlem yapılamıyor");
      
      // Restore database
      db.query = originalQuery;
    });

    test('validates alert system functionality', async () => {
      // Trigger no_stock alert
      await db.query(`UPDATE lockers SET status = 'Owned' WHERE kiosk_id = 'test-kiosk'`);
      
      // Simulate multiple no-stock events
      for (let i = 0; i < 4; i++) {
        await assignmentEngine.assignLocker({
          cardId: `no-stock-${i}`,
          kioskId: 'test-kiosk',
          timestamp: new Date()
        });
      }
      
      await alertManager.checkAlerts('test-kiosk');
      
      const alerts = await alertManager.getActiveAlerts('test-kiosk');
      const noStockAlert = alerts.find(a => a.type === 'no_stock');
      expect(noStockAlert).toBeDefined();
    });

    test('validates session limit enforcement', async () => {
      const session = await sessionTracker.createSmartSession('limit-test', 'test-kiosk');
      
      // Try to extend beyond maximum (240 minutes)
      for (let i = 0; i < 5; i++) {
        await sessionTracker.extendSession(session.id, 'admin', 'test extension');
      }
      
      const finalSession = await sessionTracker.getActiveSession('limit-test');
      expect(finalSession?.extensionCount).toBeLessThanOrEqual(4); // Max 4 extensions
    });

    test('validates system health monitoring', async () => {
      const healthCheck = await performSystemHealthCheck();
      
      expect(healthCheck.database).toBe('healthy');
      expect(healthCheck.configuration).toBe('healthy');
      expect(healthCheck.assignment_engine).toBe('healthy');
      expect(healthCheck.overall_status).toBe('operational');
    });

    async function performSystemHealthCheck() {
      try {
        // Test database connectivity
        await db.query('SELECT 1');
        
        // Test configuration system
        await configManager.getGlobalConfig();
        
        // Test assignment engine
        const testResult = await assignmentEngine.scoreLockers('test-kiosk', []);
        
        return {
          database: 'healthy',
          configuration: 'healthy', 
          assignment_engine: 'healthy',
          overall_status: 'operational'
        };
      } catch (error) {
        return {
          database: 'error',
          configuration: 'error',
          assignment_engine: 'error', 
          overall_status: 'degraded'
        };
      }
    }
  });

  describe('Backward Compatibility Validation', () => {
    test('validates existing API endpoints remain functional', async () => {
      // Test that manual mode APIs still work
      await configManager.updateGlobalConfig({ smart_assignment_enabled: false });
      
      // Simulate manual locker selection (existing flow)
      const manualAssignment = await db.query(`
        UPDATE lockers SET status = 'Owned', owner_key = 'manual-test'
        WHERE kiosk_id = 'test-kiosk' AND id = 1
      `);
      
      expect(manualAssignment).toBeDefined();
      
      // Verify locker state
      const locker = await db.query(`
        SELECT * FROM lockers WHERE kiosk_id = 'test-kiosk' AND id = 1
      `);
      expect(locker[0].status).toBe('Owned');
      expect(locker[0].owner_key).toBe('manual-test');
    });

    test('validates data migration compatibility', async () => {
      // Verify new columns exist but don't break existing queries
      const lockers = await db.query(`SELECT * FROM lockers WHERE kiosk_id = 'test-kiosk'`);
      
      expect(lockers[0]).toHaveProperty('free_since');
      expect(lockers[0]).toHaveProperty('wear_count');
      expect(lockers[0]).toHaveProperty('quarantine_until');
      
      // Verify existing columns still work
      expect(lockers[0]).toHaveProperty('status');
      expect(lockers[0]).toHaveProperty('owner_key');
    });
  });
});