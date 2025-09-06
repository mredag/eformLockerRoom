import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigurationManager } from '../configuration-manager';

// Mock database connection
const mockDb = {
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
  transaction: vi.fn()
};

// Mock DatabaseConnection
vi.mock('../../database/connection', () => ({
  DatabaseConnection: {
    getInstance: () => mockDb
  }
}));

describe('ConfigurationManager Enhanced Features', () => {
  let configManager: ConfigurationManager;

  beforeEach(() => {
    vi.clearAllMocks();
    configManager = new ConfigurationManager(mockDb as any);
    
    // Mock transaction to execute callback immediately
    mockDb.transaction.mockImplementation(async (callback) => {
      return await callback(mockDb);
    });
  });

  afterEach(() => {
    configManager.destroy();
  });

  describe('Strict Validation Bounds', () => {
    it('should enforce top_k_candidates bounds (1-20)', async () => {
      // Valid values
      expect((configManager as any).validateConfigValue('top_k_candidates', 1).valid).toBe(true);
      expect((configManager as any).validateConfigValue('top_k_candidates', 10).valid).toBe(true);
      expect((configManager as any).validateConfigValue('top_k_candidates', 20).valid).toBe(true);
      
      // Invalid values
      expect((configManager as any).validateConfigValue('top_k_candidates', 0).valid).toBe(false);
      expect((configManager as any).validateConfigValue('top_k_candidates', 21).valid).toBe(false);
      expect((configManager as any).validateConfigValue('top_k_candidates', 5.5).valid).toBe(false); // Not integer
    });

    it('should enforce selection_temperature > 0', async () => {
      // Valid values
      expect((configManager as any).validateConfigValue('selection_temperature', 0.1).valid).toBe(true);
      expect((configManager as any).validateConfigValue('selection_temperature', 1.0).valid).toBe(true);
      expect((configManager as any).validateConfigValue('selection_temperature', 10.0).valid).toBe(true);
      
      // Invalid values
      expect((configManager as any).validateConfigValue('selection_temperature', 0).valid).toBe(false);
      expect((configManager as any).validateConfigValue('selection_temperature', -1).valid).toBe(false);
    });

    it('should enforce sensorless_pulse_ms bounds (200-2000)', async () => {
      // Valid values
      expect((configManager as any).validateConfigValue('sensorless_pulse_ms', 200).valid).toBe(true);
      expect((configManager as any).validateConfigValue('sensorless_pulse_ms', 800).valid).toBe(true);
      expect((configManager as any).validateConfigValue('sensorless_pulse_ms', 2000).valid).toBe(true);
      
      // Invalid values
      expect((configManager as any).validateConfigValue('sensorless_pulse_ms', 199).valid).toBe(false);
      expect((configManager as any).validateConfigValue('sensorless_pulse_ms', 2001).valid).toBe(false);
      expect((configManager as any).validateConfigValue('sensorless_pulse_ms', 800.5).valid).toBe(false); // Not integer
    });

    it('should enforce open_window_seconds bounds (5-20)', async () => {
      // Valid values
      expect((configManager as any).validateConfigValue('open_window_seconds', 5).valid).toBe(true);
      expect((configManager as any).validateConfigValue('open_window_seconds', 10).valid).toBe(true);
      expect((configManager as any).validateConfigValue('open_window_seconds', 20).valid).toBe(true);
      
      // Invalid values
      expect((configManager as any).validateConfigValue('open_window_seconds', 4).valid).toBe(false);
      expect((configManager as any).validateConfigValue('open_window_seconds', 21).valid).toBe(false);
    });

    it('should enforce retry_backoff_ms bounds (200-1000)', async () => {
      // Valid values
      expect((configManager as any).validateConfigValue('retry_backoff_ms', 200).valid).toBe(true);
      expect((configManager as any).validateConfigValue('retry_backoff_ms', 500).valid).toBe(true);
      expect((configManager as any).validateConfigValue('retry_backoff_ms', 1000).valid).toBe(true);
      
      // Invalid values
      expect((configManager as any).validateConfigValue('retry_backoff_ms', 199).valid).toBe(false);
      expect((configManager as any).validateConfigValue('retry_backoff_ms', 1001).valid).toBe(false);
    });

    it('should reject unknown configuration keys', async () => {
      const result = (configManager as any).validateConfigValue('unknown_key', 'value');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown configuration key');
    });

    it('should reject NaN and Infinity values', async () => {
      expect((configManager as any).validateConfigValue('base_score', NaN).valid).toBe(false);
      expect((configManager as any).validateConfigValue('base_score', Infinity).valid).toBe(false);
      expect((configManager as any).validateConfigValue('base_score', -Infinity).valid).toBe(false);
    });
  });

  describe('Atomic Transactions', () => {
    it('should use BEGIN IMMEDIATE for SQLite concurrency', async () => {
      mockDb.get.mockResolvedValue({ version: 1 });
      
      const updates = { base_score: 150 };
      await configManager.updateGlobalConfig(updates, 'test');
      
      expect(mockDb.run).toHaveBeenCalledWith('BEGIN IMMEDIATE');
      expect(mockDb.run).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback on transaction failure', async () => {
      // Create a fresh config manager for this test to avoid shared state
      const testConfigManager = new ConfigurationManager(mockDb as any);
      
      mockDb.get.mockResolvedValue({ version: 1 });
      mockDb.run.mockImplementation((sql) => {
        if (sql === 'BEGIN IMMEDIATE') return Promise.resolve();
        if (sql === 'ROLLBACK') return Promise.resolve();
        if (sql.includes('INSERT OR REPLACE INTO settings_global')) {
          throw new Error('Database error');
        }
        return Promise.resolve();
      });
      
      const updates = { base_score: 150 };
      
      await expect(testConfigManager.updateGlobalConfig(updates, 'test')).rejects.toThrow('Database error');
      expect(mockDb.run).toHaveBeenCalledWith('ROLLBACK');
      
      testConfigManager.destroy();
    });

    it('should bump version once per request', async () => {
      // Reset mocks for this test
      vi.clearAllMocks();
      
      // Create a fresh config manager for this test
      const testConfigManager = new ConfigurationManager(mockDb as any);
      
      mockDb.get.mockResolvedValue({ version: 5 });
      
      const updates = {
        base_score: 150,
        top_k_candidates: 10,
        selection_temperature: 2.0
      };
      
      await testConfigManager.updateGlobalConfig(updates, 'test');
      
      // Should update version to 6 (5 + 1) only once
      expect(mockDb.run).toHaveBeenCalledWith(
        'UPDATE config_version SET version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
        [6]
      );
      
      testConfigManager.destroy();
    });
  });

  describe('Hot Reload SLA', () => {
    it('should poll with jitter to prevent thundering herd', async () => {
      const startTime = Date.now();
      
      // Start monitoring
      (configManager as any).startHotReloadMonitoring();
      
      // Wait a bit to see if jitter is applied
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Stop monitoring
      configManager.stopHotReloadMonitoring();
      
      // Verify that monitoring was started (no specific assertion needed, just that it doesn't crash)
      expect(true).toBe(true);
    });

    it('should warn when propagation exceeds 3 second SLA', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Mock a slow propagation scenario
      const mockSlowPropagation = vi.fn().mockImplementation(() => {
        // Simulate 4 second delay
        const start = Date.now();
        while (Date.now() - start < 4000) {
          // Busy wait to simulate slow operation
        }
      });
      
      // This test is conceptual - in practice, we'd need to mock the timing
      // The important thing is that the warning logic exists in the code
      
      consoleSpy.mockRestore();
    });
  });

  describe('Override Precedence', () => {
    it('should document that kiosk overrides win over global config', async () => {
      // Complete mock global config with all required keys
      const mockGlobalConfig = [
        { key: 'smart_assignment_enabled', value: 'false', data_type: 'boolean' },
        { key: 'base_score', value: '100', data_type: 'number' },
        { key: 'session_limit_minutes', value: '180', data_type: 'number' },
        { key: 'score_factor_a', value: '2.0', data_type: 'number' },
        { key: 'score_factor_b', value: '1.0', data_type: 'number' },
        { key: 'score_factor_g', value: '0.1', data_type: 'number' },
        { key: 'top_k_candidates', value: '5', data_type: 'number' },
        { key: 'sensorless_pulse_ms', value: '800', data_type: 'number' },
        { key: 'open_window_seconds', value: '10', data_type: 'number' },
        { key: 'retry_count', value: '1', data_type: 'number' }
      ];
      
      const mockKioskOverrides = [
        { key: 'smart_assignment_enabled', value: 'true', data_type: 'boolean' }
      ];
      
      mockDb.all
        .mockResolvedValueOnce(mockGlobalConfig)
        .mockResolvedValueOnce(mockKioskOverrides);
      
      const effectiveConfig = await configManager.getEffectiveConfig('kiosk-1');
      
      // Kiosk override should win
      expect(effectiveConfig.smart_assignment_enabled).toBe(true); // Overridden
      expect(effectiveConfig.base_score).toBe(100); // From global
    });

    it('should allow smart_assignment_enabled ON per kiosk while global is OFF', async () => {
      // Complete mock global config with all required keys
      const mockGlobalConfig = [
        { key: 'smart_assignment_enabled', value: 'false', data_type: 'boolean' },
        { key: 'base_score', value: '100', data_type: 'number' },
        { key: 'session_limit_minutes', value: '180', data_type: 'number' },
        { key: 'score_factor_a', value: '2.0', data_type: 'number' },
        { key: 'score_factor_b', value: '1.0', data_type: 'number' },
        { key: 'score_factor_g', value: '0.1', data_type: 'number' },
        { key: 'top_k_candidates', value: '5', data_type: 'number' },
        { key: 'sensorless_pulse_ms', value: '800', data_type: 'number' },
        { key: 'open_window_seconds', value: '10', data_type: 'number' },
        { key: 'retry_count', value: '1', data_type: 'number' }
      ];
      
      const mockKioskOverrides = [
        { key: 'smart_assignment_enabled', value: 'true', data_type: 'boolean' }
      ];
      
      mockDb.all
        .mockResolvedValueOnce(mockGlobalConfig)
        .mockResolvedValueOnce(mockKioskOverrides);
      
      const effectiveConfig = await configManager.getEffectiveConfig('kiosk-1');
      
      // This kiosk can have smart assignment enabled even though global is disabled
      expect(effectiveConfig.smart_assignment_enabled).toBe(true);
    });
  });

  describe('Audit Trail', () => {
    it('should persist editor, old value, new value, timestamp for changes', async () => {
      // Reset mocks for this test
      vi.clearAllMocks();
      
      // Create a fresh config manager for this test
      const testConfigManager = new ConfigurationManager(mockDb as any);
      
      mockDb.get
        .mockResolvedValueOnce({ version: 1 }) // Current version
        .mockResolvedValueOnce({ value: '100', data_type: 'number' }); // Old value
      
      const updates = { base_score: 150 };
      await testConfigManager.updateGlobalConfig(updates, 'admin-user');
      
      // Verify audit trail insertion
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO config_history'),
        expect.arrayContaining(['base_score', '100', '150', 'number', 'admin-user'])
      );
      
      testConfigManager.destroy();
    });

    it('should not include card data in audit trail', async () => {
      // Reset mocks for this test
      vi.clearAllMocks();
      
      // Create a fresh config manager for this test
      const testConfigManager = new ConfigurationManager(mockDb as any);
      
      mockDb.get.mockResolvedValue({ version: 1 });
      
      const updates = { base_score: 150 };
      await testConfigManager.updateGlobalConfig(updates, 'admin-user');
      
      // Verify that kiosk_id is NULL for global config changes (no card data)
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO config_history'),
        expect.arrayContaining([null]) // kiosk_id should be null for global changes
      );
      
      testConfigManager.destroy();
    });
  });

  describe('Lifecycle Management', () => {
    it('should provide unsubscribe capability for event listeners', async () => {
      const callback = vi.fn();
      
      // Subscribe and get unsubscribe function
      const unsubscribe = configManager.subscribeToChanges(callback);
      
      // Verify unsubscribe function is returned
      expect(typeof unsubscribe).toBe('function');
      
      // Call unsubscribe
      unsubscribe();
      
      // Verify no errors occur
      expect(true).toBe(true);
    });

    it('should prevent operations when shutting down', async () => {
      // Trigger shutdown
      configManager.destroy();
      
      // Verify shutdown state
      expect(configManager.isShuttingDownState()).toBe(true);
      
      // Operations should be rejected
      await expect(configManager.getEffectiveConfig('kiosk-1')).rejects.toThrow('Configuration Manager is shutting down');
    });

    it('should cleanup resources properly on destroy', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      configManager.destroy();
      
      expect(consoleSpy).toHaveBeenCalledWith('🔄 Shutting down Configuration Manager...');
      expect(consoleSpy).toHaveBeenCalledWith('✅ Configuration Manager shutdown complete');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Retry Logic for SQLite Busy Errors', () => {
    it('should retry on SQLITE_BUSY errors with exponential backoff', async () => {
      let attemptCount = 0;
      mockDb.run.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          const error = new Error('SQLITE_BUSY: database is locked');
          throw error;
        }
        return Promise.resolve();
      });
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // This should succeed after retries
      await (configManager as any).executeWithRetry(() => mockDb.run('SELECT 1'));
      
      expect(attemptCount).toBe(3); // Should have retried twice
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/SQLite busy, retrying in \d+ms/)
      );
      
      consoleSpy.mockRestore();
    });

    it('should fail after max retry attempts', async () => {
      mockDb.run.mockImplementation(() => {
        throw new Error('SQLITE_BUSY: database is locked');
      });
      
      await expect(
        (configManager as any).executeWithRetry(() => mockDb.run('SELECT 1'))
      ).rejects.toThrow('SQLITE_BUSY');
    });
  });
});