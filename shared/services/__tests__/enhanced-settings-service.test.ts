import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SettingsService } from '../settings-service';
import { DatabaseManager } from '../../database/database-manager';
import * as fs from 'fs';
import * as path from 'path';

describe('Enhanced SettingsService', () => {
  let settingsService: SettingsService;
  let dbManager: DatabaseManager;
  const testDbPath = path.join(__dirname, 'test-enhanced-settings.db');

  beforeEach(async () => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Reset singleton instance
    (DatabaseManager as any)._instance = null;

    // Initialize database with migrations
    dbManager = DatabaseManager.getInstance({
      path: testDbPath,
      migrationsPath: path.join(__dirname, '../../../migrations')
    });
    
    await dbManager.initialize();
    settingsService = new SettingsService();
  });

  afterEach(async () => {
    await dbManager.close();
    // Reset singleton instance
    (DatabaseManager as any)._instance = null;
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Security Settings', () => {
    it('should get default security settings', async () => {
      const settings = await settingsService.getSecuritySettings();
      
      expect(settings).toEqual({
        lockout_attempts: 5,
        lockout_minutes: 5
      });
    });

    it('should update security settings', async () => {
      const newSettings = {
        lockout_attempts: 3,
        lockout_minutes: 10
      };

      await settingsService.updateSecuritySettings(newSettings);
      const retrieved = await settingsService.getSecuritySettings();

      expect(retrieved).toEqual(newSettings);
    });
  });

  describe('Master PIN Management', () => {
    it('should verify default master PIN', async () => {
      const isValid = await settingsService.verifyMasterPin('1234');
      expect(isValid).toBe(true);
    });

    it('should reject invalid PIN', async () => {
      const isValid = await settingsService.verifyMasterPin('9999');
      expect(isValid).toBe(false);
    });

    it('should change master PIN', async () => {
      await settingsService.changeMasterPin('5678');
      
      const oldPinValid = await settingsService.verifyMasterPin('1234');
      const newPinValid = await settingsService.verifyMasterPin('5678');
      
      expect(oldPinValid).toBe(false);
      expect(newPinValid).toBe(true);
    });
  });

  describe('Lockout Management', () => {
    const kioskId = 'test-kiosk-1';
    const clientIp = '192.168.1.100';

    it('should not be locked initially', async () => {
      const isLocked = await settingsService.isLocked(kioskId, clientIp);
      expect(isLocked).toBe(false);
    });

    it('should track failed attempts', async () => {
      // Record 3 failed attempts
      for (let i = 0; i < 3; i++) {
        const isLocked = await settingsService.recordPinAttempt(kioskId, clientIp, false);
        expect(isLocked).toBe(false); // Not locked yet (default is 5 attempts)
      }

      const status = await settingsService.getLockoutStatus();
      const kioskStatus = status.find(s => s.kiosk_id === kioskId);
      
      expect(kioskStatus).toBeDefined();
      expect(kioskStatus!.attempts).toBe(3);
      expect(kioskStatus!.locked).toBe(false);
    });

    it('should lock after max attempts', async () => {
      // Record 5 failed attempts (default max)
      let isLocked = false;
      for (let i = 0; i < 5; i++) {
        isLocked = await settingsService.recordPinAttempt(kioskId, clientIp, false);
      }

      expect(isLocked).toBe(true);
      
      const stillLocked = await settingsService.isLocked(kioskId, clientIp);
      expect(stillLocked).toBe(true);
    });

    it('should clear attempts on successful PIN', async () => {
      // Record some failed attempts
      await settingsService.recordPinAttempt(kioskId, clientIp, false);
      await settingsService.recordPinAttempt(kioskId, clientIp, false);
      
      // Then successful attempt
      const isLocked = await settingsService.recordPinAttempt(kioskId, clientIp, true);
      expect(isLocked).toBe(false);
      
      const status = await settingsService.getLockoutStatus();
      const kioskStatus = status.find(s => s.kiosk_id === kioskId);
      expect(kioskStatus).toBeUndefined(); // Should be cleared
    });

    it('should calculate remaining lockout time', async () => {
      // Trigger lockout
      for (let i = 0; i < 5; i++) {
        await settingsService.recordPinAttempt(kioskId, clientIp, false);
      }

      const remainingTime = await settingsService.getRemainingLockoutTime(kioskId, clientIp);
      expect(remainingTime).toBeGreaterThan(0);
      expect(remainingTime).toBeLessThanOrEqual(300); // 5 minutes max
    });

    it('should clear lockout manually', async () => {
      // Trigger lockout
      for (let i = 0; i < 5; i++) {
        await settingsService.recordPinAttempt(kioskId, clientIp, false);
      }

      expect(await settingsService.isLocked(kioskId, clientIp)).toBe(true);

      // Clear lockout
      await settingsService.clearLockout(kioskId);
      
      expect(await settingsService.isLocked(kioskId, clientIp)).toBe(false);
    });

    it('should respect custom lockout settings', async () => {
      // Set custom settings: 3 attempts, 2 minutes
      await settingsService.updateSecuritySettings({
        lockout_attempts: 3,
        lockout_minutes: 2
      });

      // Should lock after 3 attempts
      let isLocked = false;
      for (let i = 0; i < 3; i++) {
        isLocked = await settingsService.recordPinAttempt(kioskId, clientIp, false);
      }

      expect(isLocked).toBe(true);
      
      const remainingTime = await settingsService.getRemainingLockoutTime(kioskId, clientIp);
      expect(remainingTime).toBeLessThanOrEqual(120); // 2 minutes max
    });
  });

  describe('Lockout Status Overview', () => {
    it('should return empty status when no attempts', async () => {
      const status = await settingsService.getLockoutStatus();
      expect(status).toEqual([]);
    });

    it('should return status for multiple kiosks', async () => {
      const kiosk1 = 'test-kiosk-1';
      const kiosk2 = 'test-kiosk-2';
      const clientIp = '192.168.1.100';

      // Add attempts for both kiosks
      await settingsService.recordPinAttempt(kiosk1, clientIp, false);
      await settingsService.recordPinAttempt(kiosk1, clientIp, false);
      
      await settingsService.recordPinAttempt(kiosk2, clientIp, false);
      
      const status = await settingsService.getLockoutStatus();
      expect(status).toHaveLength(2);
      
      const kiosk1Status = status.find(s => s.kiosk_id === kiosk1);
      const kiosk2Status = status.find(s => s.kiosk_id === kiosk2);
      
      expect(kiosk1Status!.attempts).toBe(2);
      expect(kiosk2Status!.attempts).toBe(1);
      expect(kiosk1Status!.locked).toBe(false);
      expect(kiosk2Status!.locked).toBe(false);
    });

    it('should show locked status correctly', async () => {
      const kioskId = 'test-kiosk-1';
      const clientIp = '192.168.1.100';

      // Trigger lockout
      for (let i = 0; i < 5; i++) {
        await settingsService.recordPinAttempt(kioskId, clientIp, false);
      }

      const status = await settingsService.getLockoutStatus();
      const kioskStatus = status.find(s => s.kiosk_id === kioskId);
      
      expect(kioskStatus!.locked).toBe(true);
      expect(kioskStatus!.lockout_end).toBeDefined();
      expect(kioskStatus!.lockout_end!).toBeGreaterThan(Date.now());
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid PIN gracefully', async () => {
      const isValid = await settingsService.verifyMasterPin('');
      expect(isValid).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      // Close database to simulate error
      await dbManager.close();
      
      await expect(settingsService.getSecuritySettings()).rejects.toThrow();
    });
  });
});