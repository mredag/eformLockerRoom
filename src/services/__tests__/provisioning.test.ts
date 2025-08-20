import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProvisioningService } from '../provisioning.js';
import { DatabaseConnection } from '../../database/connection.js';
import { unlinkSync } from 'fs';

describe('ProvisioningService', () => {
  let provisioningService: ProvisioningService;
  let db: DatabaseConnection;
  const testDbPath = './test.db';

  beforeEach(async () => {
    // Reset database instance and use test database
    DatabaseConnection.resetInstance();
    db = DatabaseConnection.getInstance(testDbPath);
    await db.initializeSchema();
    provisioningService = new ProvisioningService();
  });

  afterEach(async () => {
    await db.close();
    try {
      unlinkSync(testDbPath);
    } catch (error) {
      // File might not exist
    }
  });

  describe('generateProvisioningToken', () => {
    it('should generate a valid provisioning token', async () => {
      const zone = 'gym-floor-1';
      const token = await provisioningService.generateProvisioningToken(zone);

      expect(token.token).toBeDefined();
      expect(token.token).toHaveLength(64); // 32 bytes hex = 64 chars
      expect(token.kiosk_id).toMatch(/^kiosk-gym-floor-1-[a-f0-9]{8}$/);
      expect(token.zone).toBe(zone);
      expect(token.expires_at).toBeInstanceOf(Date);
      expect(token.used).toBe(false);
      expect(token.expires_at.getTime()).toBeGreaterThan(Date.now());
    });

    it('should store token in database', async () => {
      const zone = 'spa-room-2';
      const token = await provisioningService.generateProvisioningToken(zone);

      const storedToken = await db.get(
        'SELECT * FROM provisioning_tokens WHERE token = ?',
        [token.token]
      );

      expect(storedToken).toBeDefined();
      expect(storedToken.zone).toBe(zone);
      expect(storedToken.used).toBe(0); // SQLite stores boolean as 0/1
    });
  });

  describe('registerKiosk', () => {
    it('should successfully register a kiosk with valid token', async () => {
      const zone = 'test-zone';
      const token = await provisioningService.generateProvisioningToken(zone);
      
      const request = {
        zone,
        version: '1.0.0',
        hardware_id: 'hw-12345'
      };

      const response = await provisioningService.registerKiosk(token.token, request);

      expect(response.kiosk_id).toBe(token.kiosk_id);
      expect(response.registration_secret).toBeDefined();
      expect(response.registration_secret).toHaveLength(64); // SHA256 hex
      expect(response.panel_url).toBeDefined();

      // Verify kiosk is in heartbeat table
      const kiosk = await db.get(
        'SELECT * FROM kiosk_heartbeat WHERE kiosk_id = ?',
        [response.kiosk_id]
      );
      expect(kiosk).toBeDefined();
      expect(kiosk.status).toBe('provisioning');
      expect(kiosk.zone).toBe(zone);
      expect(kiosk.hardware_id).toBe(request.hardware_id);
    });

    it('should fail with invalid token', async () => {
      const request = {
        zone: 'test-zone',
        version: '1.0.0',
        hardware_id: 'hw-12345'
      };

      await expect(
        provisioningService.registerKiosk('invalid-token', request)
      ).rejects.toThrow('Invalid or expired provisioning token');
    });

    it('should fail with zone mismatch', async () => {
      const token = await provisioningService.generateProvisioningToken('zone-a');
      
      const request = {
        zone: 'zone-b', // Different zone
        version: '1.0.0',
        hardware_id: 'hw-12345'
      };

      await expect(
        provisioningService.registerKiosk(token.token, request)
      ).rejects.toThrow('Zone mismatch in provisioning token');
    });

    it('should mark token as used after successful registration', async () => {
      const zone = 'test-zone';
      const token = await provisioningService.generateProvisioningToken(zone);
      
      const request = {
        zone,
        version: '1.0.0',
        hardware_id: 'hw-12345'
      };

      await provisioningService.registerKiosk(token.token, request);

      const usedToken = await db.get(
        'SELECT * FROM provisioning_tokens WHERE token = ?',
        [token.token]
      );
      expect(usedToken.used).toBe(1); // SQLite stores boolean as 0/1
      expect(usedToken.used_at).toBeDefined();
    });
  });

  describe('validateKioskIdentity', () => {
    it('should validate correct kiosk identity', async () => {
      const zone = 'test-zone';
      const token = await provisioningService.generateProvisioningToken(zone);
      const hardware_id = 'hw-12345';
      
      const request = { zone, version: '1.0.0', hardware_id };
      const response = await provisioningService.registerKiosk(token.token, request);

      const isValid = await provisioningService.validateKioskIdentity(
        response.kiosk_id,
        response.registration_secret,
        hardware_id
      );

      expect(isValid).toBe(true);
    });

    it('should reject invalid registration secret', async () => {
      const zone = 'test-zone';
      const token = await provisioningService.generateProvisioningToken(zone);
      const hardware_id = 'hw-12345';
      
      const request = { zone, version: '1.0.0', hardware_id };
      const response = await provisioningService.registerKiosk(token.token, request);

      const isValid = await provisioningService.validateKioskIdentity(
        response.kiosk_id,
        'invalid-secret',
        hardware_id
      );

      expect(isValid).toBe(false);
    });

    it('should reject mismatched hardware ID', async () => {
      const zone = 'test-zone';
      const token = await provisioningService.generateProvisioningToken(zone);
      const hardware_id = 'hw-12345';
      
      const request = { zone, version: '1.0.0', hardware_id };
      const response = await provisioningService.registerKiosk(token.token, request);

      const isValid = await provisioningService.validateKioskIdentity(
        response.kiosk_id,
        response.registration_secret,
        'different-hardware-id'
      );

      expect(isValid).toBe(false);
    });
  });

  describe('completeEnrollment', () => {
    it('should update kiosk status to online', async () => {
      const zone = 'test-zone';
      const token = await provisioningService.generateProvisioningToken(zone);
      const hardware_id = 'hw-12345';
      
      const request = { zone, version: '1.0.0', hardware_id };
      const response = await provisioningService.registerKiosk(token.token, request);

      await provisioningService.completeEnrollment(response.kiosk_id);

      const kiosk = await db.get(
        'SELECT * FROM kiosk_heartbeat WHERE kiosk_id = ?',
        [response.kiosk_id]
      );
      expect(kiosk.status).toBe('online');
    });
  });

  describe('rollback mechanism', () => {
    it('should rollback on registration failure', async () => {
      const request = {
        zone: 'test-zone',
        version: '1.0.0',
        hardware_id: 'hw-12345'
      };

      try {
        await provisioningService.registerKiosk('invalid-token', request);
      } catch (error) {
        // Expected to fail
      }

      // Check that provisioning status shows rollback
      const statuses = await db.all(
        'SELECT * FROM provisioning_status WHERE status = ?',
        ['rolled_back']
      );
      expect(statuses.length).toBeGreaterThan(0);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should remove expired unused tokens', async () => {
      // Create a token and manually expire it
      const zone = 'test-zone';
      const token = await provisioningService.generateProvisioningToken(zone);
      
      // Manually set expiry to past
      await db.run(
        'UPDATE provisioning_tokens SET expires_at = ? WHERE token = ?',
        [new Date(Date.now() - 1000).toISOString(), token.token]
      );

      await provisioningService.cleanupExpiredTokens();

      const expiredToken = await db.get(
        'SELECT * FROM provisioning_tokens WHERE token = ?',
        [token.token]
      );
      expect(expiredToken).toBeUndefined();
    });

    it('should not remove used tokens even if expired', async () => {
      const zone = 'test-zone';
      const token = await provisioningService.generateProvisioningToken(zone);
      
      // Mark as used and expired
      await db.run(
        'UPDATE provisioning_tokens SET used = TRUE, expires_at = ? WHERE token = ?',
        [new Date(Date.now() - 1000).toISOString(), token.token]
      );

      await provisioningService.cleanupExpiredTokens();

      const usedToken = await db.get(
        'SELECT * FROM provisioning_tokens WHERE token = ?',
        [token.token]
      );
      expect(usedToken).toBeDefined();
    });
  });

  describe('generateProvisioningQR', () => {
    it('should generate valid QR data URL', () => {
      const token = 'test-token-123';
      const qrData = provisioningService.generateProvisioningQR(token);
      
      expect(qrData).toMatch(/^http.*\/provision\?token=test-token-123$/);
    });
  });
});