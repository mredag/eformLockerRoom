import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { provisioningRoutes } from '../src/routes/provisioning.js';
import { DatabaseConnection } from '../../../shared/database/connection.js';
import { unlinkSync } from 'fs';

describe('ProvisioningController', () => {
  let app: FastifyInstance;
  let db: DatabaseConnection;
  const testDbPath = './test-controller.db';

  beforeEach(async () => {
    app = Fastify();
    DatabaseConnection.resetInstance();
    db = DatabaseConnection.getInstance(testDbPath);
    await db.initializeSchema();
    await app.register(provisioningRoutes, { prefix: '/api/provisioning' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await db.close();
    try {
      unlinkSync(testDbPath);
    } catch (error) {
      // File might not exist
    }
  });

  describe('POST /api/provisioning/token', () => {
    it('should generate provisioning token successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/provisioning/token',
        payload: { zone: 'gym-floor-1' }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.token).toBeDefined();
      expect(data.kiosk_id).toMatch(/^kiosk-gym-floor-1-[a-f0-9]{8}$/);
      expect(data.zone).toBe('gym-floor-1');
      expect(data.qr_data).toContain('/provision?token=');
    });

    it('should return 400 for missing zone', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/provisioning/token',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for empty zone', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/provisioning/token',
        payload: { zone: '' }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/provisioning/register', () => {
    it('should register kiosk successfully with valid token', async () => {
      // First generate a token
      const tokenResponse = await app.inject({
        method: 'POST',
        url: '/api/provisioning/token',
        payload: { zone: 'test-zone' }
      });
      const tokenData = JSON.parse(tokenResponse.payload);

      // Then register kiosk
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/provisioning/register',
        payload: {
          token: tokenData.token,
          zone: 'test-zone',
          version: '1.0.0',
          hardware_id: 'hw-12345'
        }
      });

      expect(registerResponse.statusCode).toBe(200);
      const data = JSON.parse(registerResponse.payload);
      expect(data.kiosk_id).toBe(tokenData.kiosk_id);
      expect(data.registration_secret).toBeDefined();
      expect(data.panel_url).toBeDefined();
    });

    it('should return 401 for invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/provisioning/register',
        payload: {
          token: 'invalid-token',
          zone: 'test-zone',
          version: '1.0.0',
          hardware_id: 'hw-12345'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for zone mismatch', async () => {
      // Generate token for zone-a
      const tokenResponse = await app.inject({
        method: 'POST',
        url: '/api/provisioning/token',
        payload: { zone: 'zone-a' }
      });
      const tokenData = JSON.parse(tokenResponse.payload);

      // Try to register with zone-b
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/provisioning/register',
        payload: {
          token: tokenData.token,
          zone: 'zone-b', // Different zone
          version: '1.0.0',
          hardware_id: 'hw-12345'
        }
      });

      expect(registerResponse.statusCode).toBe(400);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/provisioning/register',
        payload: {
          token: 'some-token',
          zone: 'test-zone'
          // Missing version and hardware_id
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/provisioning/validate', () => {
    it('should validate kiosk identity successfully', async () => {
      // First register a kiosk
      const tokenResponse = await app.inject({
        method: 'POST',
        url: '/api/provisioning/token',
        payload: { zone: 'test-zone' }
      });
      const tokenData = JSON.parse(tokenResponse.payload);

      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/provisioning/register',
        payload: {
          token: tokenData.token,
          zone: 'test-zone',
          version: '1.0.0',
          hardware_id: 'hw-12345'
        }
      });
      const registerData = JSON.parse(registerResponse.payload);

      // Then validate identity
      const validateResponse = await app.inject({
        method: 'POST',
        url: '/api/provisioning/validate',
        payload: {
          kiosk_id: registerData.kiosk_id,
          registration_secret: registerData.registration_secret,
          hardware_id: 'hw-12345'
        }
      });

      expect(validateResponse.statusCode).toBe(200);
      const data = JSON.parse(validateResponse.payload);
      expect(data.valid).toBe(true);
      expect(data.status).toBe('enrolled');
    });

    it('should return 401 for invalid identity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/provisioning/validate',
        payload: {
          kiosk_id: 'invalid-kiosk',
          registration_secret: 'invalid-secret',
          hardware_id: 'hw-12345'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/provisioning/validate',
        payload: {
          kiosk_id: 'some-kiosk'
          // Missing registration_secret and hardware_id
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/provisioning/kiosks', () => {
    it('should list all kiosks', async () => {
      // Register a kiosk first
      const tokenResponse = await app.inject({
        method: 'POST',
        url: '/api/provisioning/token',
        payload: { zone: 'test-zone' }
      });
      const tokenData = JSON.parse(tokenResponse.payload);

      await app.inject({
        method: 'POST',
        url: '/api/provisioning/register',
        payload: {
          token: tokenData.token,
          zone: 'test-zone',
          version: '1.0.0',
          hardware_id: 'hw-12345'
        }
      });

      // List kiosks
      const response = await app.inject({
        method: 'GET',
        url: '/api/provisioning/kiosks'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.kiosks).toBeDefined();
      expect(Array.isArray(data.kiosks)).toBe(true);
      expect(data.kiosks.length).toBe(1);
      expect(data.kiosks[0].zone).toBe('test-zone');
    });
  });

  describe('POST /api/provisioning/cleanup', () => {
    it('should cleanup expired tokens', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/provisioning/cleanup'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.message).toContain('cleaned up successfully');
    });
  });
});