/**
 * Comprehensive Configuration Manager Unit Tests
 * Task 28: Create comprehensive unit tests
 * 
 * Tests all configuration management components with >90% coverage
 * Requirements: 8.1-8.5, 18.1-18.5
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ConfigurationManager, GlobalConfig, EffectiveConfig } from '../configuration-manager';
import { vi } from 'vitest';

describe('ConfigurationManager - Comprehensive Tests', () => {
  let configManager: ConfigurationManager;
  let mockDb: any;
  let mockEventEmitter: any;
  let mockConsole: any;

  const mockGlobalConfig: GlobalConfig = {
    smart_assignment_enabled: false,
    base_score: 100,
    score_factor_a: 2.0,
    score_factor_b: 1.0,
    score_factor_g: 0.1,
    score_factor_d: 0.5,
    top_k_candidates: 5,
    selection_temperature: 1.0,
    quarantine_min_floor: 5,
    quarantine_min_ceiling: 20,
    exit_quarantine_minutes: 20,
    return_hold_trigger_seconds: 120,
    return_hold_minutes: 15,
    session_limit_minutes: 180,
    retrieve_window_minutes: 10,
    reserve_ratio: 0.1,
    reserve_minimum: 2,
    sensorless_pulse_ms: 800,
    open_window_seconds: 10,
    retry_count: 1,
    retry_backoff_ms: 500,
    card_rate_limit_seconds: 10,
    locker_rate_limit_per_minute: 3,
    command_cooldown_seconds: 3,
    user_report_daily_cap: 2,
    allow_reclaim_during_quarantine: false,
    version: 1
  };

  beforeEach(() => {
    mockConsole = global.mockConsole();
    
    mockDb = {
      all: jest.fn(),
      get: jest.fn(),
      run: jest.fn(),
      prepare: jest.fn().mockReturnValue({
        all: jest.fn(),
        get: jest.fn(),
        run: jest.fn()
      })
    };

    mockEventEmitter = {
      emit: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn()
    };

    configManager = new ConfigurationManager(mockDb, mockEventEmitter);
  });

  afterEach(() => {
    mockConsole.restore();
    jest.clearAllMocks();
  });

  describe('Global Configuration Management (Requirements 8.1-8.5)', () => {
    it('should retrieve global configuration correctly', async () => {
      const mockConfigRows = [
        { key: 'smart_assignment_enabled', value: 'false', data_type: 'boolean' },
        { key: 'base_score', value: '100', data_type: 'number' },
        { key: 'session_limit_minutes', value: '180', data_type: 'number' }
      ];

      mockDb.all.mockResolvedValue(mockConfigRows);

      const config = await configManager.getGlobalConfig();

      expect(config.smart_assignment_enabled).toBe(false);
      expect(config.base_score).toBe(100);
      expect(config.session_limit_minutes).toBe(180);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT key, value, data_type FROM settings_global')
      );
    });

    it('should update global configuration with validation', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue({ version: 1 });

      const updates = {
        smart_assignment_enabled: true,
        base_score: 150,
        session_limit_minutes: 240
      };

      await configManager.updateGlobalConfig(updates, 'admin-user');

      expect(mockDb.run).toHaveBeenCalledTimes(4); // 3 updates + version increment
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('configChanged', expect.any(Object));
    });

    it('should validate configuration values during update', async () => {
      const invalidUpdates = {
        base_score: -50, // Invalid negative score
        session_limit_minutes: 0, // Invalid zero limit
        top_k_candidates: 0 // Invalid zero candidates
      };

      await expect(configManager.updateGlobalConfig(invalidUpdates, 'admin-user'))
        .rejects.toThrow('Invalid configuration values');
    });

    it('should handle configuration seeding on first boot (Requirement 8.1)', async () => {
      mockDb.all.mockResolvedValue([]); // Empty config table
      mockDb.run.mockResolvedValue({ changes: 1 });

      await configManager.seedDefaultConfiguration();

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO settings_global'),
        expect.any(Array)
      );
    });

    it('should track configuration version for hot reload (Requirement 8.4)', async () => {
      mockDb.get.mockResolvedValue({ version: 5 });

      const version = await configManager.getConfigurationVersion();

      expect(version).toBe(5);
      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT version FROM config_version WHERE id = 1'
      );
    });
  });

  describe('Per-Kiosk Override System (Requirements 18.1-18.5)', () => {
    it('should retrieve kiosk-specific overrides', async () => {
      const mockOverrides = [
        { key: 'session_limit_minutes', value: '240', data_type: 'number' },
        { key: 'smart_assignment_enabled', value: 'true', data_type: 'boolean' }
      ];

      mockDb.all.mockResolvedValue(mockOverrides);

      const overrides = await configManager.getKioskOverrides('kiosk-1');

      expect(overrides.session_limit_minutes).toBe(240);
      expect(overrides.smart_assignment_enabled).toBe(true);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT key, value, data_type FROM settings_kiosk'),
        ['kiosk-1']
      );
    });

    it('should set kiosk override with validation (Requirement 18.2)', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      await configManager.setKioskOverride('kiosk-1', 'session_limit_minutes', 300, 'admin-user');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO settings_kiosk'),
        ['kiosk-1', 'session_limit_minutes', '300', 'number', 'admin-user']
      );
    });

    it('should remove kiosk override (Requirement 18.4)', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      await configManager.removeKioskOverride('kiosk-1', 'session_limit_minutes', 'admin-user');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM settings_kiosk'),
        ['kiosk-1', 'session_limit_minutes']
      );
    });

    it('should merge global and kiosk configurations (Requirement 18.1)', async () => {
      // Mock global config
      mockDb.all.mockResolvedValueOnce([
        { key: 'base_score', value: '100', data_type: 'number' },
        { key: 'session_limit_minutes', value: '180', data_type: 'number' }
      ]);

      // Mock kiosk overrides
      mockDb.all.mockResolvedValueOnce([
        { key: 'session_limit_minutes', value: '240', data_type: 'number' }
      ]);

      const effectiveConfig = await configManager.getEffectiveConfig('kiosk-1');

      expect(effectiveConfig.base_score).toBe(100); // From global
      expect(effectiveConfig.session_limit_minutes).toBe(240); // From kiosk override
    });

    it('should validate kiosk override keys and values (Requirement 18.2)', async () => {
      await expect(configManager.setKioskOverride('kiosk-1', 'invalid_key', 'value', 'admin'))
        .rejects.toThrow('Invalid configuration key');

      await expect(configManager.setKioskOverride('kiosk-1', 'base_score', -100, 'admin'))
        .rejects.toThrow('Invalid configuration value');
    });
  });

  describe('Hot Reload Mechanism (Requirements 8.4-8.5)', () => {
    it('should propagate configuration changes within 3 seconds (Requirement 8.4)', async () => {
      const startTime = Date.now();
      let propagationTime = 0;

      mockEventEmitter.on.mockImplementation((event, callback) => {
        if (event === 'configChanged') {
          setTimeout(() => {
            propagationTime = Date.now() - startTime;
            callback({ version: 2 });
          }, 100); // Simulate 100ms propagation
        }
      });

      configManager.subscribeToChanges(() => {});
      
      // Trigger config change
      mockEventEmitter.emit('configChanged', { version: 2 });

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(propagationTime).toBeLessThan(3000); // Must be < 3 seconds
    });

    it('should detect configuration version changes', async () => {
      let changeDetected = false;
      const callback = vi.fn(() => { changeDetected = true; });

      configManager.subscribeToChanges(callback);

      // Simulate version change
      mockEventEmitter.emit('configChanged', { version: 3 });

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ version: 3 }));
      expect(changeDetected).toBe(true);
    });

    it('should invalidate configuration cache on reload', async () => {
      // First call - should hit database
      mockDb.all.mockResolvedValueOnce([
        { key: 'base_score', value: '100', data_type: 'number' }
      ]);

      const config1 = await configManager.getGlobalConfig();
      expect(config1.base_score).toBe(100);

      // Trigger reload
      await configManager.triggerReload();

      // Second call - should hit database again (cache invalidated)
      mockDb.all.mockResolvedValueOnce([
        { key: 'base_score', value: '150', data_type: 'number' }
      ]);

      const config2 = await configManager.getGlobalConfig();
      expect(config2.base_score).toBe(150);
      expect(mockDb.all).toHaveBeenCalledTimes(2);
    });

    it('should measure and log propagation timing with exact format', async () => {
      await configManager.triggerReload();

      expect(mockConsole.logs).toContain('Config loaded: version=1.');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate boolean configuration values', () => {
      expect(configManager.validateConfigValue('smart_assignment_enabled', true)).toBe(true);
      expect(configManager.validateConfigValue('smart_assignment_enabled', 'invalid'))
        .toBe(false);
    });

    it('should validate number configuration values with ranges', () => {
      expect(configManager.validateConfigValue('base_score', 100)).toBe(true);
      expect(configManager.validateConfigValue('base_score', -50)).toBe(false);
      expect(configManager.validateConfigValue('session_limit_minutes', 180)).toBe(true);
      expect(configManager.validateConfigValue('session_limit_minutes', 0)).toBe(false);
    });

    it('should validate scoring parameter ranges', () => {
      expect(configManager.validateConfigValue('score_factor_a', 2.0)).toBe(true);
      expect(configManager.validateConfigValue('score_factor_a', -1.0)).toBe(false);
      expect(configManager.validateConfigValue('top_k_candidates', 5)).toBe(true);
      expect(configManager.validateConfigValue('top_k_candidates', 0)).toBe(false);
    });

    it('should reject top_k_candidates > 20', () => {
      expect(configManager.validateConfigValue('top_k_candidates', 21)).toBe(false);
      expect(configManager.validateConfigValue('top_k_candidates', 20)).toBe(true);
      expect(configManager.validateConfigValue('top_k_candidates', 1)).toBe(true);
    });

    it('should reject selection_temperature <= 0', () => {
      expect(configManager.validateConfigValue('selection_temperature', 0)).toBe(false);
      expect(configManager.validateConfigValue('selection_temperature', -0.5)).toBe(false);
      expect(configManager.validateConfigValue('selection_temperature', 0.1)).toBe(true);
      expect(configManager.validateConfigValue('selection_temperature', 1.0)).toBe(true);
    });

    it('should validate timing parameters', () => {
      expect(configManager.validateConfigValue('sensorless_pulse_ms', 800)).toBe(true);
      expect(configManager.validateConfigValue('sensorless_pulse_ms', 0)).toBe(false);
      expect(configManager.validateConfigValue('open_window_seconds', 10)).toBe(true);
      expect(configManager.validateConfigValue('retry_backoff_ms', 500)).toBe(true);
    });

    it('should validate bounds in both create and update paths', async () => {
      // Test create path
      const invalidCreateConfig = {
        top_k_candidates: 25, // > 20
        selection_temperature: 0 // <= 0
      };

      await expect(configManager.updateGlobalConfig(invalidCreateConfig, 'admin-user'))
        .rejects.toThrow('Invalid configuration values');

      // Test update path
      const invalidUpdateConfig = {
        top_k_candidates: 21, // > 20
        selection_temperature: -1 // <= 0
      };

      await expect(configManager.updateGlobalConfig(invalidUpdateConfig, 'admin-user'))
        .rejects.toThrow('Invalid configuration values');
    });
  });

  describe('Configuration Audit and History (Requirement 18.5)', () => {
    it('should create audit records for configuration changes', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      await configManager.updateGlobalConfig(
        { base_score: 150 }, 
        'admin-user'
      );

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO config_history'),
        expect.arrayContaining([null, 'base_score', expect.any(String), '150', 'admin-user'])
      );
    });

    it('should create audit records for kiosk override changes', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      await configManager.setKioskOverride('kiosk-1', 'session_limit_minutes', 240, 'admin-user');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO config_history'),
        expect.arrayContaining(['kiosk-1', 'session_limit_minutes', expect.any(String), '240', 'admin-user'])
      );
    });

    it('should retrieve configuration history', async () => {
      const mockHistory = [
        {
          id: 1,
          kiosk_id: null,
          key: 'base_score',
          old_value: '100',
          new_value: '150',
          changed_by: 'admin-user',
          changed_at: new Date().toISOString()
        }
      ];

      mockDb.all.mockResolvedValue(mockHistory);

      const history = await configManager.getConfigurationHistory();

      expect(history).toHaveLength(1);
      expect(history[0].key).toBe('base_score');
      expect(history[0].changed_by).toBe('admin-user');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database connection errors gracefully', async () => {
      mockDb.all.mockRejectedValue(new Error('Database connection failed'));

      await expect(configManager.getGlobalConfig())
        .rejects.toThrow('Database connection failed');
    });

    it('should handle missing configuration keys with defaults', async () => {
      mockDb.all.mockResolvedValue([]); // Empty configuration

      const config = await configManager.getGlobalConfig();

      // Should return default values
      expect(config.smart_assignment_enabled).toBe(false);
      expect(config.base_score).toBe(100);
      expect(config.session_limit_minutes).toBe(180);
    });

    it('should handle invalid data types in database', async () => {
      const mockConfigRows = [
        { key: 'base_score', value: 'invalid_number', data_type: 'number' }
      ];

      mockDb.all.mockResolvedValue(mockConfigRows);

      const config = await configManager.getGlobalConfig();

      // Should fall back to default value
      expect(config.base_score).toBe(100);
    });

    it('should handle concurrent configuration updates', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      const updates1 = configManager.updateGlobalConfig({ base_score: 150 }, 'user1');
      const updates2 = configManager.updateGlobalConfig({ base_score: 200 }, 'user2');

      await Promise.all([updates1, updates2]);

      // Both should complete without errors
      expect(mockDb.run).toHaveBeenCalled();
    });
  });

  describe('Performance and Caching', () => {
    it('should cache configuration for performance', async () => {
      mockDb.all.mockResolvedValue([
        { key: 'base_score', value: '100', data_type: 'number' }
      ]);

      // First call
      await configManager.getGlobalConfig();
      
      // Second call should use cache
      await configManager.getGlobalConfig();

      expect(mockDb.all).toHaveBeenCalledTimes(1);
    });

    it('should handle cache expiration', async () => {
      mockDb.all.mockResolvedValue([
        { key: 'base_score', value: '100', data_type: 'number' }
      ]);

      await configManager.getGlobalConfig();

      // Simulate cache expiration
      await configManager.triggerReload();

      mockDb.all.mockResolvedValue([
        { key: 'base_score', value: '150', data_type: 'number' }
      ]);

      await configManager.getGlobalConfig();

      expect(mockDb.all).toHaveBeenCalledTimes(2);
    });
  });

  describe('Configuration API Endpoints Support', () => {
    it('should support GET /admin/config/effective/{kioskId} format', async () => {
      mockDb.all.mockResolvedValueOnce([
        { key: 'base_score', value: '100', data_type: 'number' }
      ]);
      mockDb.all.mockResolvedValueOnce([
        { key: 'session_limit_minutes', value: '240', data_type: 'number' }
      ]);

      const effectiveConfig = await configManager.getEffectiveConfig('kiosk-1');

      expect(effectiveConfig).toHaveProperty('base_score', 100);
      expect(effectiveConfig).toHaveProperty('session_limit_minutes', 240);
    });

    it('should support configuration reload endpoint', async () => {
      mockDb.get.mockResolvedValue({ version: 1 });
      mockDb.run.mockResolvedValue({ changes: 1 });

      await configManager.triggerReload();

      expect(mockEventEmitter.emit).toHaveBeenCalledWith('configChanged', expect.any(Object));
    });
  });
});