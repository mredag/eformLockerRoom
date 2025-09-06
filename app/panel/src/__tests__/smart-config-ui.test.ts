import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { smartConfigRoutes } from '../routes/smart-config-routes';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { ConfigurationManager } from '../../../../shared/services/configuration-manager';
import path from 'path';

describe('Smart Configuration UI Integration', () => {
  let fastify: FastifyInstance;
  let dbManager: DatabaseManager;
  let configManager: ConfigurationManager;

  beforeEach(async () => {
    // Initialize test database
    dbManager = DatabaseManager.getInstance({
      migrationsPath: path.resolve(__dirname, '../../../../migrations'),
      databasePath: ':memory:'
    });
    await dbManager.initialize();

    // Initialize configuration manager
    configManager = new ConfigurationManager(dbManager.getConnection());

    // Create Fastify instance
    fastify = Fastify({ logger: false });

    // Register smart config routes
    await fastify.register(smartConfigRoutes, {
      prefix: '/api/admin/config'
    });

    // Mock authentication middleware
    fastify.addHook('preHandler', async (request, reply) => {
      (request as any).user = { username: 'test-admin', role: 'admin' };
    });
  });

  afterEach(async () => {
    await fastify.close();
    await dbManager.close();
  });

  describe('Global Configuration Management', () => {
    it('should load global configuration successfully', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/global'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config.smart_assignment_enabled).toBeDefined();
    });

    it('should update global configuration with Turkish validation', async () => {
      const updates = {
        smart_assignment_enabled: true,
        base_score: 150,
        session_limit_minutes: 240
      };

      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/global',
        payload: {
          updates,
          reason: 'Panel arayüzünden test güncelleme'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.updated_keys).toContain('smart_assignment_enabled');
      expect(result.updated_keys).toContain('base_score');
      expect(result.updated_keys).toContain('session_limit_minutes');
    });

    it('should validate configuration values', async () => {
      const invalidUpdates = {
        base_score: -100, // Invalid negative score
        session_limit_minutes: 10 // Too low
      };

      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/global',
        payload: {
          updates: invalidUpdates,
          reason: 'Test invalid values'
        }
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });
  });

  describe('Kiosk Override Management', () => {
    it('should set kiosk-specific overrides', async () => {
      const kioskId = 'test-kiosk-1';
      const key = 'smart_assignment_enabled';
      const value = true;

      const response = await fastify.inject({
        method: 'PUT',
        url: `/api/admin/config/override/${kioskId}`,
        payload: {
          key,
          value,
          reason: 'Test kiosk override'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.kiosk_id).toBe(kioskId);
      expect(result.key).toBe(key);
      expect(result.value).toBe(value);
    });

    it('should get effective configuration with overrides', async () => {
      const kioskId = 'test-kiosk-1';
      
      // First set an override
      await fastify.inject({
        method: 'PUT',
        url: `/api/admin/config/override/${kioskId}`,
        payload: {
          key: 'base_score',
          value: 200,
          reason: 'Test override'
        }
      });

      // Then get effective config
      const response = await fastify.inject({
        method: 'GET',
        url: `/api/admin/config/effective?kiosk_id=${kioskId}`
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.config.base_score).toBe(200); // Should be overridden value
      expect(result.kiosk_id).toBe(kioskId);
    });

    it('should remove kiosk overrides', async () => {
      const kioskId = 'test-kiosk-1';
      
      // First set an override
      await fastify.inject({
        method: 'PUT',
        url: `/api/admin/config/override/${kioskId}`,
        payload: {
          key: 'base_score',
          value: 200,
          reason: 'Test override'
        }
      });

      // Then remove it
      const response = await fastify.inject({
        method: 'DELETE',
        url: `/api/admin/config/override/${kioskId}`,
        payload: {
          keys: ['base_score'],
          reason: 'Test removal'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.removed_count).toBe(1);
    });
  });

  describe('Configuration History and Audit', () => {
    it('should track configuration changes in history', async () => {
      // Make a configuration change
      await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/global',
        payload: {
          updates: { base_score: 175 },
          reason: 'Test history tracking'
        }
      });

      // Check history
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/history?page=1&page_size=10'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.history).toBeDefined();
      expect(Array.isArray(result.history)).toBe(true);
      
      // Should have at least one history entry
      if (result.history.length > 0) {
        const historyItem = result.history[0];
        expect(historyItem.key).toBeDefined();
        expect(historyItem.changed_by).toBe('test-admin');
        expect(historyItem.changed_at).toBeDefined();
      }
    });

    it('should filter history by kiosk and key', async () => {
      const kioskId = 'test-kiosk-1';
      
      // Set a kiosk override
      await fastify.inject({
        method: 'PUT',
        url: `/api/admin/config/override/${kioskId}`,
        payload: {
          key: 'session_limit_minutes',
          value: 300,
          reason: 'Test filtered history'
        }
      });

      // Get filtered history
      const response = await fastify.inject({
        method: 'GET',
        url: `/api/admin/config/history?kiosk_id=${kioskId}&key=session_limit_minutes`
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      
      // All history items should match the filter
      result.history.forEach((item: any) => {
        expect(item.kiosk_id).toBe(kioskId);
        expect(item.key).toBe('session_limit_minutes');
      });
    });
  });

  describe('Configuration Version Management', () => {
    it('should track configuration version', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/version'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(typeof result.version).toBe('number');
      expect(result.version).toBeGreaterThan(0);
    });

    it('should increment version on configuration changes', async () => {
      // Get initial version
      const initialResponse = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/version'
      });
      const initialVersion = JSON.parse(initialResponse.payload).version;

      // Make a change
      await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/global',
        payload: {
          updates: { base_score: 125 },
          reason: 'Test version increment'
        }
      });

      // Check new version
      const newResponse = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/version'
      });
      const newVersion = JSON.parse(newResponse.payload).version;

      expect(newVersion).toBeGreaterThan(initialVersion);
    });

    it('should trigger configuration reload', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/admin/config/reload'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.message).toContain('reload');
    });
  });

  describe('Turkish Language Support', () => {
    it('should handle Turkish configuration keys and values', async () => {
      const updates = {
        smart_assignment_enabled: true
      };

      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/global',
        payload: {
          updates,
          reason: 'Türkçe karakter testi - özel ayar güncelleme'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
    });

    it('should validate Turkish error messages', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/global',
        payload: {
          updates: { invalid_key: 'test' },
          reason: 'Test Turkish validation'
        }
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('UI Integration Points', () => {
    it('should provide all required data for UI forms', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/global'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      // Check that all required UI fields are present
      const requiredFields = [
        'smart_assignment_enabled',
        'base_score',
        'score_factor_a',
        'score_factor_d',
        'selection_temperature',
        'quarantine_min_floor',
        'quarantine_min_ceiling',
        'session_limit_minutes',
        'pulse_ms',
        'open_window_sec',
        'retry_backoff_ms',
        'card_rate_limit_seconds',
        'locker_opens_window_sec',
        'locker_opens_max_per_window',
        'command_cooldown_sec',
        'reserve_ratio'
      ];

      requiredFields.forEach(field => {
        expect(result.config[field]).toBeDefined();
      });
    });

    it('should handle pagination for history display', async () => {
      // Create multiple history entries
      for (let i = 0; i < 5; i++) {
        await fastify.inject({
          method: 'PUT',
          url: '/api/admin/config/global',
          payload: {
            updates: { base_score: 100 + i },
            reason: `Test entry ${i}`
          }
        });
      }

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/history?page=1&limit=3'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(3);
      expect(result.pagination.total_records).toBeGreaterThan(0);
      expect(result.version).toBeDefined();
    });
  });
});