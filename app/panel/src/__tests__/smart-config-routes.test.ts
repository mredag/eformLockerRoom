import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { smartConfigRoutes } from '../routes/smart-config-routes';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { ConfigurationManager } from '../../../../shared/services/configuration-manager';
import path from 'path';

describe('Smart Configuration API Routes', () => {
  let fastify: FastifyInstance;
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    // Initialize test database
    dbManager = DatabaseManager.getInstance({
      databasePath: ':memory:',
      migrationsPath: path.resolve(__dirname, '../../../../migrations')
    });
    await dbManager.initialize();

    // Create Fastify instance
    fastify = Fastify({ logger: false });

    // Mock authentication middleware
    fastify.addHook('preHandler', async (request) => {
      (request as any).user = {
        id: 1,
        username: 'test-admin',
        role: 'admin'
      };
    });

    // Register routes
    await fastify.register(smartConfigRoutes, {
      prefix: '/api/admin/config'
    });

    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    await dbManager.close();
  });

  describe('GET /api/admin/config/global', () => {
    it('should retrieve global configuration', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/global'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.config).toBeDefined();
      expect(data.config.smart_assignment_enabled).toBeDefined();
    });
  });

  describe('GET /api/admin/config/effective', () => {
    it('should retrieve effective configuration for a kiosk', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/effective?kiosk_id=test-kiosk-1'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.kiosk_id).toBe('test-kiosk-1');
      expect(data.config).toBeDefined();
      expect(data.version).toBeDefined();
    });
  });

  describe('PUT /api/admin/config/global', () => {
    it('should update global configuration', async () => {
      const updates = {
        base_score: 150,
        smart_assignment_enabled: true
      };

      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/global',
        payload: {
          updates,
          reason: 'Test update'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.updated_keys).toEqual(['base_score', 'smart_assignment_enabled']);
    });

    it('should reject unknown configuration keys', async () => {
      const updates = {
        unknown_key: 'invalid'
      };

      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/global',
        payload: {
          updates
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unknown configuration keys');
    });

    it('should handle idempotent no-op updates', async () => {
      // First, set a value
      await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/global',
        payload: {
          updates: { base_score: 100 }
        }
      });

      // Then try to set the same value again
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/global',
        payload: {
          updates: { base_score: 100 }
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.updated_keys).toEqual([]);
      expect(data.message).toContain('No changes detected');
    });
  });

  describe('PUT /api/admin/config/override/:kioskId', () => {
    it('should set kiosk-specific override', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/override/test-kiosk-1',
        payload: {
          key: 'smart_assignment_enabled',
          value: true,
          reason: 'Enable for this kiosk'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.kiosk_id).toBe('test-kiosk-1');
      expect(data.key).toBe('smart_assignment_enabled');
      expect(data.value).toBe(true);
    });

    it('should reject unknown configuration keys', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/override/test-kiosk-1',
        payload: {
          key: 'unknown_key',
          value: true
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unknown configuration key');
    });
  });

  describe('DELETE /api/admin/config/override/:kioskId', () => {
    it('should remove specific kiosk overrides', async () => {
      // First set some overrides
      await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/override/test-kiosk-1',
        payload: {
          key: 'base_score',
          value: 200
        }
      });

      await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/override/test-kiosk-1',
        payload: {
          key: 'smart_assignment_enabled',
          value: true
        }
      });

      // Then remove specific keys
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/admin/config/override/test-kiosk-1',
        payload: {
          keys: ['base_score'],
          reason: 'Test removal'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.kiosk_id).toBe('test-kiosk-1');
      expect(data.removed_count).toBe(1);
      expect(data.version).toBeDefined();
    });

    it('should remove all overrides when no keys specified', async () => {
      // First set some overrides
      await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/override/test-kiosk-1',
        payload: {
          key: 'base_score',
          value: 200
        }
      });

      // Then remove all
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/admin/config/override/test-kiosk-1',
        payload: {}
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.removed_count).toBeGreaterThan(0);
    });
  });

  describe('GET /api/admin/config/history', () => {
    it('should retrieve configuration history with pagination', async () => {
      // Make a configuration change first
      await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/global',
        payload: {
          updates: { base_score: 120 }
        }
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/history?page=1&page_size=10'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.history)).toBe(true);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.page_size).toBe(10);
    });

    it('should filter history by kiosk ID', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/history?kiosk_id=test-kiosk-1&page_size=5'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.filters.kiosk_id).toBe('test-kiosk-1');
    });

    it('should handle pagination correctly', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/history?page=1&page_size=5'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.page_size).toBe(5);
      expect(typeof data.pagination.total_records).toBe('number');
      expect(typeof data.pagination.total_pages).toBe('number');
    });
  });

  describe('GET /api/admin/config/version', () => {
    it('should retrieve current configuration version', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/version'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(typeof data.version).toBe('number');
    });
  });

  describe('POST /api/admin/config/reload', () => {
    it('should trigger configuration reload without version bump', async () => {
      // Get current version
      const versionBefore = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/version'
      });
      const beforeData = JSON.parse(versionBefore.payload);

      // Trigger reload
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/admin/config/reload'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.message).toContain('reload triggered');

      // Version should not have changed
      const versionAfter = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/version'
      });
      const afterData = JSON.parse(versionAfter.payload);
      expect(afterData.version).toBe(beforeData.version);
    });
  });

  describe('Audit Logging', () => {
    it('should log configuration changes with proper format', async () => {
      await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/global',
        payload: {
          updates: { base_score: 130 },
          reason: 'Audit test'
        }
      });

      // Check that audit log was created in database
      const history = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/history?page_size=1'
      });

      const data = JSON.parse(history.payload);
      expect(data.history[0].changed_by).toBe('test-admin');
      expect(data.history[0].key).toBe('base_score');
      expect(data.history[0].new_value).toBe('130');
    });
  });

  describe('Effective Configuration Propagation', () => {
    it('should reflect overrides in effective config within 3 seconds', async () => {
      const startTime = Date.now();

      // Set an override
      await fastify.inject({
        method: 'PUT',
        url: '/api/admin/config/override/test-kiosk-1',
        payload: {
          key: 'smart_assignment_enabled',
          value: true
        }
      });

      // Get effective config
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/admin/config/effective?kiosk_id=test-kiosk-1'
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.config.smart_assignment_enabled).toBe(true);
      expect(duration).toBeLessThan(3000); // Should be within 3 seconds
    });
  });
});