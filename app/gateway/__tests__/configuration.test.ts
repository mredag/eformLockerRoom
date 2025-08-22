import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { configurationRoutes } from '../src/routes/configuration.js';
import { DatabaseConnection } from '../../../shared/database/connection.js';

describe('ConfigurationController', () => {
  let app: FastifyInstance;
  let db: DatabaseConnection;

  beforeEach(async () => {
    // Use in-memory database for testing
    db = DatabaseConnection.getInstance(':memory:');
    await db.initializeSchema();

    // Create Fastify app with routes
    app = Fastify();
    await app.register(configurationRoutes, { prefix: '/api/configuration' });
  });

  afterEach(async () => {
    await app.close();
    await db.close();
    DatabaseConnection.resetInstance();
  });

  describe('GET /api/configuration/default', () => {
    it('should return default configuration', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/configuration/default'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('BULK_INTERVAL_MS', 300);
      expect(result.data).toHaveProperty('RESERVE_TTL_SECONDS', 90);
    });
  });

  describe('POST /api/configuration/packages', () => {
    it('should create configuration package', async () => {
      const config = {
        BULK_INTERVAL_MS: 300,
        RESERVE_TTL_SECONDS: 90,
        OPEN_PULSE_MS: 400,
        OPEN_BURST_SECONDS: 10,
        OPEN_BURST_INTERVAL_MS: 2000,
        MASTER_LOCKOUT_FAILS: 5,
        MASTER_LOCKOUT_MINUTES: 5,
        HEARTBEAT_SEC: 10,
        OFFLINE_SEC: 30,
        LOG_RETENTION_DAYS: 30,
        RATE_LIMIT_IP_PER_MIN: 30,
        RATE_LIMIT_CARD_PER_MIN: 60,
        RATE_LIMIT_LOCKER_PER_MIN: 6,
        RATE_LIMIT_DEVICE_PER_SEC: 20
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/configuration/packages',
        payload: {
          config,
          created_by: 'test-admin'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.version).toMatch(/^config-/);
      expect(result.data.created_by).toBe('test-admin');
    });

    it('should return 400 for missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/configuration/packages',
        payload: {
          config: { BULK_INTERVAL_MS: 300 } // Missing required fields
        }
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should return 400 for incomplete configuration', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/configuration/packages',
        payload: {
          config: { BULK_INTERVAL_MS: 300 }, // Missing many required fields
          created_by: 'test-admin'
        }
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing configuration keys');
    });
  });

  describe('GET /api/configuration/packages/:version', () => {
    let configVersion: string;

    beforeEach(async () => {
      // Create a test configuration package
      const config = {
        BULK_INTERVAL_MS: 300,
        RESERVE_TTL_SECONDS: 90,
        OPEN_PULSE_MS: 400,
        OPEN_BURST_SECONDS: 10,
        OPEN_BURST_INTERVAL_MS: 2000,
        MASTER_LOCKOUT_FAILS: 5,
        MASTER_LOCKOUT_MINUTES: 5,
        HEARTBEAT_SEC: 10,
        OFFLINE_SEC: 30,
        LOG_RETENTION_DAYS: 30,
        RATE_LIMIT_IP_PER_MIN: 30,
        RATE_LIMIT_CARD_PER_MIN: 60,
        RATE_LIMIT_LOCKER_PER_MIN: 6,
        RATE_LIMIT_DEVICE_PER_SEC: 20
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/configuration/packages',
        payload: { config, created_by: 'test-admin' }
      });

      const result = JSON.parse(response.payload);
      configVersion = result.data.version;
    });

    it('should return configuration package by version', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/configuration/packages/${configVersion}`
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.version).toBe(configVersion);
    });

    it('should return 404 for non-existent version', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/configuration/packages/non-existent-version'
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Configuration package not found');
    });
  });

  describe('POST /api/configuration/deploy', () => {
    let configVersion: string;

    beforeEach(async () => {
      // Create test kiosk
      await db.run(
        `INSERT INTO kiosk_heartbeat (kiosk_id, last_seen, zone, status, version) 
         VALUES (?, ?, ?, ?, ?)`,
        ['test-kiosk-1', new Date().toISOString(), 'zone-a', 'online', '1.0.0']
      );

      // Create configuration package
      const config = {
        BULK_INTERVAL_MS: 300,
        RESERVE_TTL_SECONDS: 90,
        OPEN_PULSE_MS: 400,
        OPEN_BURST_SECONDS: 10,
        OPEN_BURST_INTERVAL_MS: 2000,
        MASTER_LOCKOUT_FAILS: 5,
        MASTER_LOCKOUT_MINUTES: 5,
        HEARTBEAT_SEC: 10,
        OFFLINE_SEC: 30,
        LOG_RETENTION_DAYS: 30,
        RATE_LIMIT_IP_PER_MIN: 30,
        RATE_LIMIT_CARD_PER_MIN: 60,
        RATE_LIMIT_LOCKER_PER_MIN: 6,
        RATE_LIMIT_DEVICE_PER_SEC: 20
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/configuration/packages',
        payload: { config, created_by: 'test-admin' }
      });

      const result = JSON.parse(response.payload);
      configVersion = result.data.version;
    });

    it('should deploy configuration to specific kiosk', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/configuration/deploy',
        payload: {
          config_version: configVersion,
          target: { kiosk_id: 'test-kiosk-1' },
          created_by: 'test-admin'
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.config_version).toBe(configVersion);
      expect(result.data.kiosk_id).toBe('test-kiosk-1');
    });

    it('should return 400 for missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/configuration/deploy',
        payload: {
          config_version: configVersion
          // Missing created_by
        }
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });
  });

  describe('GET /api/configuration/kiosks/:kiosk_id/pending', () => {
    it('should return null when no pending configuration', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/configuration/kiosks/test-kiosk-1/pending'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('POST /api/configuration/kiosks/:kiosk_id/apply', () => {
    it('should return 400 for missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/configuration/kiosks/test-kiosk-1/apply',
        payload: {
          config_version: 'test-version'
          // Missing config_hash
        }
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });
  });

  describe('POST /api/configuration/kiosks/:kiosk_id/rollback', () => {
    it('should return 400 for missing reason', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/configuration/kiosks/test-kiosk-1/rollback',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required field: reason');
    });
  });

  describe('GET /api/configuration/kiosks/status', () => {
    it('should return empty list when no kiosks exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/configuration/kiosks/status'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('GET /api/configuration/deployments', () => {
    it('should return empty list when no deployments exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/configuration/deployments'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should respect limit query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/configuration/deployments?limit=10'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
    });
  });
});