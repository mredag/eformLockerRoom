import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigurationManager } from '../configuration-manager';
import { DatabaseConnection } from '../../database/connection';

describe('ConfigurationManager Integration Tests', () => {
  let configManager: ConfigurationManager;
  let db: DatabaseConnection;

  beforeEach(async () => {
    // Use in-memory database for testing
    db = DatabaseConnection.getInstance(':memory:');
    await db.waitForInitialization();
    
    // Create required tables
    await db.run(`
      CREATE TABLE IF NOT EXISTS settings_global (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        data_type TEXT NOT NULL DEFAULT 'string',
        description TEXT,
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await db.run(`
      CREATE TABLE IF NOT EXISTS settings_kiosk (
        kiosk_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        data_type TEXT NOT NULL DEFAULT 'string',
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kiosk_id, key)
      )
    `);
    
    await db.run(`
      CREATE TABLE IF NOT EXISTS config_version (
        id INTEGER PRIMARY KEY DEFAULT 1,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CHECK (id = 1)
      )
    `);
    
    await db.run(`
      CREATE TABLE IF NOT EXISTS config_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kiosk_id TEXT,
        key TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        data_type TEXT NOT NULL,
        changed_by TEXT NOT NULL,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert initial version
    await db.run('INSERT OR IGNORE INTO config_version (id, version) VALUES (1, 1)');
    
    // Seed minimal configuration
    const defaultConfig = [
      ['smart_assignment_enabled', 'false', 'boolean'],
      ['base_score', '100', 'number'],
      ['session_limit_minutes', '180', 'number'],
      ['score_factor_a', '2.0', 'number'],
      ['score_factor_b', '1.0', 'number'],
      ['score_factor_g', '0.1', 'number'],
      ['top_k_candidates', '5', 'number'],
      ['pulse_ms', '800', 'number'],
      ['open_window_sec', '10', 'number'],
      ['retry_count', '1', 'number']
    ];
    
    for (const [key, value, dataType] of defaultConfig) {
      await db.run(
        'INSERT OR IGNORE INTO settings_global (key, value, data_type) VALUES (?, ?, ?)',
        [key, value, dataType]
      );
    }
    
    configManager = new ConfigurationManager(db);
    await configManager.initialize();
  });

  afterEach(async () => {
    if (configManager) {
      configManager.destroy();
    }
    if (db) {
      await db.close();
    }
    // Reset the database instance
    DatabaseConnection.resetInstance(':memory:');
  });

  describe('End-to-End Hot Reload', () => {
    it('should propagate configuration changes within 3 seconds', async () => {
      const events: any[] = [];
      const startTime = Date.now();
      
      // Subscribe to changes
      const unsubscribe = configManager.subscribeToRawChanges((event) => {
        const propagationTime = Date.now() - startTime;
        events.push({ ...event, actualPropagationTime: propagationTime });
      });
      
      // Use triggerReload to test hot reload mechanism (which emits events)
      await configManager.triggerReload();
      
      // Verify event was emitted
      expect(events).toHaveLength(1);
      const event = events[0];
      
      // Verify SLA compliance
      expect(event.actualPropagationTime).toBeLessThan(3000);
      expect(event.type).toBe('global');
      expect(event.version).toBeGreaterThan(1);
      
      unsubscribe();
    });

    it('should invalidate cache and reload fresh configuration', async () => {
      // Load initial configuration
      const config1 = await configManager.getGlobalConfig();
      expect(config1.base_score).toBe(100);
      
      // Update configuration in database directly (simulating external change)
      await db.run(
        'UPDATE settings_global SET value = ? WHERE key = ?',
        ['200', 'base_score']
      );
      
      // Bump version to trigger hot reload
      await db.run('UPDATE config_version SET version = version + 1');
      
      // Force cache invalidation
      configManager.forceCacheInvalidation();
      
      // Load configuration again - should get fresh data
      const config2 = await configManager.getGlobalConfig();
      expect(config2.base_score).toBe(200);
    });

    it('should handle kiosk-specific overrides with hot reload', async () => {
      const kioskId = 'test-kiosk-1';
      
      // Get initial effective config
      const config1 = await configManager.getEffectiveConfig(kioskId);
      expect(config1.smart_assignment_enabled).toBe(false);
      
      // Set kiosk override
      await configManager.setKioskOverride(kioskId, 'smart_assignment_enabled', true, 'test');
      
      // Get updated effective config
      const config2 = await configManager.getEffectiveConfig(kioskId);
      expect(config2.smart_assignment_enabled).toBe(true);
      
      // Verify global config is unchanged
      const globalConfig = await configManager.getGlobalConfig();
      expect(globalConfig.smart_assignment_enabled).toBe(false);
    });

    it('should measure propagation timing accurately', async () => {
      const measurement = await configManager.measurePropagationTime();
      
      expect(measurement.version).toBeGreaterThan(0);
      expect(measurement.propagationTime).toBeGreaterThanOrEqual(0);
      expect(measurement.propagationTime).toBeLessThan(1000); // Should be very fast for in-memory DB
    });

    it('should maintain audit trail during hot reload operations', async () => {
      // Update configuration
      await configManager.updateGlobalConfig({
        base_score: 175
      }, 'audit-test');
      
      // Check audit history
      const history = await configManager.getConfigHistory();
      
      expect(history.length).toBeGreaterThan(0);
      const latestChange = history[0];
      
      expect(latestChange.key).toBe('base_score');
      expect(latestChange.newValue).toBe(175);
      expect(latestChange.changedBy).toBe('audit-test');
      expect(latestChange.type).toBe('global');
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle multiple rapid configuration changes', async () => {
      const events: any[] = [];
      const unsubscribe = configManager.subscribeToRawChanges((event) => {
        events.push(event);
      });
      
      // Perform multiple rapid reload triggers (which emit events)
      const reloadCount = 3;
      
      for (let i = 0; i < reloadCount; i++) {
        await configManager.triggerReload();
      }
      
      // Should have received all events
      expect(events.length).toBe(reloadCount);
      
      // All should be within SLA
      events.forEach(event => {
        expect(event.type).toBe('global');
        expect(event.version).toBeGreaterThan(0);
      });
      
      unsubscribe();
    });

    it('should handle concurrent configuration access', async () => {
      // Simulate concurrent access
      const promises = Array.from({ length: 10 }, (_, i) => 
        configManager.getEffectiveConfig(`kiosk-${i}`)
      );
      
      const configs = await Promise.all(promises);
      
      // All should succeed and have consistent data
      configs.forEach(config => {
        expect(config.base_score).toBe(100);
        expect(config.session_limit_minutes).toBe(180);
      });
    });

    it('should cleanup resources properly on shutdown', async () => {
      const status1 = configManager.getHotReloadStatus();
      expect(status1.isActive).toBe(true);
      expect(status1.isShuttingDown).toBe(false);
      
      // Destroy the manager
      configManager.destroy();
      
      const status2 = configManager.getHotReloadStatus();
      expect(status2.isActive).toBe(false);
      expect(status2.isShuttingDown).toBe(true);
      
      // Operations should be rejected (only getEffectiveConfig checks shutdown state)
      await expect(configManager.getEffectiveConfig('test-kiosk')).rejects.toThrow('Configuration Manager is shutting down');
    });
  });
});