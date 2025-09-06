import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HotWindowManager } from '../hot-window-manager';
import { DatabaseConnection } from '../../database/connection';
import { ConfigurationManager } from '../configuration-manager';
import { createTestDatabase, cleanupTestDatabase } from '../../database/test-helpers';

describe('HotWindowManager Integration Tests', () => {
  let db: DatabaseConnection;
  let configManager: ConfigurationManager;
  let hotWindowManager: HotWindowManager;

  beforeEach(async () => {
    db = await createTestDatabase();
    configManager = new ConfigurationManager(db);
    hotWindowManager = new HotWindowManager(db, configManager);

    // Seed default configuration
    await db.run(
      `INSERT OR REPLACE INTO settings_global (key, value, data_type) VALUES 
       ('owner_hot_window_min', '10', 'number'),
       ('owner_hot_window_max', '30', 'number'),
       ('free_ratio_low', '0.1', 'number'),
       ('free_ratio_high', '0.5', 'number')`
    );

    // Create test kiosk and lockers
    await db.run(
      `INSERT INTO lockers (kiosk_id, id, status, is_vip, version) VALUES 
       ('test-kiosk', 1, 'Free', 0, 1),
       ('test-kiosk', 2, 'Free', 0, 1),
       ('test-kiosk', 3, 'Free', 0, 1),
       ('test-kiosk', 4, 'Free', 0, 1),
       ('test-kiosk', 5, 'Free', 0, 1),
       ('test-kiosk', 6, 'Owned', 0, 1),
       ('test-kiosk', 7, 'Owned', 0, 1),
       ('test-kiosk', 8, 'Owned', 0, 1),
       ('test-kiosk', 9, 'Owned', 0, 1),
       ('test-kiosk', 10, 'Owned', 0, 1)`
    );
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  describe('Real Database Integration', () => {
    it('should calculate hot window based on actual database state', async () => {
      // 5 free out of 10 total = 0.5 ratio → should get max duration (30 minutes)
      const result = await hotWindowManager.calculateHotWindow('test-kiosk');

      expect(result).toEqual({
        duration: 30,
        disabled: false,
        freeRatio: 0.5
      });
    });

    it('should disable hot window when capacity is very low', async () => {
      // Make most lockers owned (only 1 free out of 10 = 0.1 ratio)
      await db.run(
        `UPDATE lockers SET status = 'Owned' WHERE kiosk_id = 'test-kiosk' AND id IN (1, 2, 3, 4)`
      );

      const result = await hotWindowManager.calculateHotWindow('test-kiosk');

      expect(result).toEqual({
        duration: 0,
        disabled: true,
        freeRatio: 0.1
      });
    });

    it('should apply and track hot window in database', async () => {
      const application = await hotWindowManager.applyHotWindow('test-kiosk', 1, 'card123');

      expect(application).toBeTruthy();
      expect(application?.lockerId).toBe(1);
      expect(application?.cardId).toBe('card123');
      expect(application?.duration).toBe(30); // 0.5 ratio → 30 minutes

      // Verify database state
      const locker = await db.get(
        `SELECT owner_hot_until, recent_owner, recent_owner_time FROM lockers 
         WHERE kiosk_id = 'test-kiosk' AND id = 1`
      );

      expect(locker.recent_owner).toBe('card123');
      expect(locker.owner_hot_until).toBeTruthy();
      expect(locker.recent_owner_time).toBeTruthy();

      // Verify hot window is active
      const isInHotWindow = await hotWindowManager.isInHotWindow('test-kiosk', 1);
      expect(isInHotWindow).toBe(true);
    });

    it('should allow original owner to bypass hot window', async () => {
      // Apply hot window
      await hotWindowManager.applyHotWindow('test-kiosk', 1, 'card123');

      // Original owner should be able to bypass
      const canBypass = await hotWindowManager.canBypassHotWindow('test-kiosk', 1, 'card123');
      expect(canBypass).toBe(true);

      // Different card should not be able to bypass
      const cannotBypass = await hotWindowManager.canBypassHotWindow('test-kiosk', 1, 'card456');
      expect(cannotBypass).toBe(false);
    });

    it('should clear expired hot windows', async () => {
      // Apply hot window with past expiration
      const pastTime = new Date();
      pastTime.setMinutes(pastTime.getMinutes() - 10);

      await db.run(
        `UPDATE lockers SET owner_hot_until = ?, recent_owner = 'card123' 
         WHERE kiosk_id = 'test-kiosk' AND id = 1`,
        [pastTime.toISOString()]
      );

      // Clear expired hot windows
      const cleared = await hotWindowManager.clearExpiredHotWindows('test-kiosk');
      expect(cleared).toBe(1);

      // Verify hot window is cleared
      const locker = await db.get(
        `SELECT owner_hot_until FROM lockers WHERE kiosk_id = 'test-kiosk' AND id = 1`
      );
      expect(locker.owner_hot_until).toBeNull();
    });

    it('should track multiple active hot windows', async () => {
      // Apply hot windows to multiple lockers
      await hotWindowManager.applyHotWindow('test-kiosk', 1, 'card123');
      await hotWindowManager.applyHotWindow('test-kiosk', 2, 'card456');

      const activeWindows = await hotWindowManager.getHotWindowLockers('test-kiosk');

      expect(activeWindows).toHaveLength(2);
      expect(activeWindows.map(w => w.lockerId)).toEqual(expect.arrayContaining([1, 2]));
      expect(activeWindows.map(w => w.cardId)).toEqual(expect.arrayContaining(['card123', 'card456']));
      expect(activeWindows.every(w => w.remainingMinutes > 0)).toBe(true);
    });

    it('should provide accurate status information', async () => {
      // Apply hot window to one locker
      await hotWindowManager.applyHotWindow('test-kiosk', 1, 'card123');

      const status = await hotWindowManager.getStatus('test-kiosk');

      expect(status).toEqual({
        activeHotWindows: 1,
        freeRatio: 0.5,
        currentDuration: 30,
        disabled: false
      });
    });

    it('should handle kiosk-specific configuration overrides', async () => {
      // Set kiosk-specific override for hot window settings
      await db.run(
        `INSERT INTO settings_kiosk (kiosk_id, key, value, data_type) VALUES 
         ('test-kiosk', 'owner_hot_window_max', '45', 'number')`
      );

      const result = await hotWindowManager.calculateHotWindow('test-kiosk');

      // Should use override value (45 minutes instead of default 30)
      expect(result.duration).toBe(45);
    });

    it('should exclude hot window lockers from assignment pool', async () => {
      // Apply hot window to locker 1
      await hotWindowManager.applyHotWindow('test-kiosk', 1, 'card123');

      // Query for assignable lockers (should exclude hot window protected ones)
      const assignableLockers = await db.all(
        `SELECT * FROM lockers 
         WHERE kiosk_id = 'test-kiosk' 
         AND status = 'Free' 
         AND is_vip = 0
         AND (owner_hot_until IS NULL OR owner_hot_until <= CURRENT_TIMESTAMP)
         ORDER BY id ASC`
      );

      // Should not include locker 1 (in hot window)
      const lockerIds = assignableLockers.map(l => l.id);
      expect(lockerIds).not.toContain(1);
      expect(lockerIds).toContain(2); // Should include other free lockers
    });

    it('should allow original owner to bypass hot window', async () => {
      // Apply hot window to locker 1 for card123
      await hotWindowManager.applyHotWindow('test-kiosk', 1, 'card123');

      // Original owner should be able to bypass
      const canBypass = await hotWindowManager.canBypassHotWindow('test-kiosk', 1, 'card123');
      expect(canBypass).toBe(true);

      // Different card should not be able to bypass
      const cannotBypass = await hotWindowManager.canBypassHotWindow('test-kiosk', 1, 'card456');
      expect(cannotBypass).toBe(false);
    });

    it('should handle linear interpolation correctly with real data', async () => {
      // Set up 3 free out of 10 total = 0.3 ratio
      // 0.3 is halfway between 0.1 and 0.5, so should be halfway between 10 and 30 = 20 minutes
      await db.run(
        `UPDATE lockers SET status = 'Owned' WHERE kiosk_id = 'test-kiosk' AND id IN (3, 4)`
      );

      const result = await hotWindowManager.calculateHotWindow('test-kiosk');

      expect(result).toEqual({
        duration: 20,
        disabled: false,
        freeRatio: 0.3
      });
    });

    it('should not apply hot window when disabled due to low capacity', async () => {
      // Make capacity very low (1 free out of 10 = 0.1 ratio)
      await db.run(
        `UPDATE lockers SET status = 'Owned' WHERE kiosk_id = 'test-kiosk' AND id IN (1, 2, 3, 4)`
      );

      const application = await hotWindowManager.applyHotWindow('test-kiosk', 5, 'card123');

      expect(application).toBeNull();

      // Verify no hot window was set in database
      const locker = await db.get(
        `SELECT owner_hot_until FROM lockers WHERE kiosk_id = 'test-kiosk' AND id = 5`
      );
      expect(locker.owner_hot_until).toBeNull();
    });

    it('should handle edge cases with zero lockers', async () => {
      // Remove all lockers
      await db.run(`DELETE FROM lockers WHERE kiosk_id = 'test-kiosk'`);

      const result = await hotWindowManager.calculateHotWindow('test-kiosk');

      expect(result).toEqual({
        duration: 0,
        disabled: true,
        freeRatio: 0
      });
    });

    it('should exclude VIP lockers from free ratio calculation', async () => {
      // Make some lockers VIP
      await db.run(
        `UPDATE lockers SET is_vip = 1 WHERE kiosk_id = 'test-kiosk' AND id IN (1, 2)`
      );

      // Now we have 3 non-VIP free lockers out of 8 non-VIP total = 0.375 ratio
      // Should interpolate between 10 and 30 minutes
      const result = await hotWindowManager.calculateHotWindow('test-kiosk');

      expect(result.freeRatio).toBeCloseTo(0.375, 3);
      expect(result.duration).toBeCloseTo(17, 0); // Approximately 17 minutes
      expect(result.disabled).toBe(false);
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent hot window applications', async () => {
      // Simulate concurrent applications
      const promises = [
        hotWindowManager.applyHotWindow('test-kiosk', 1, 'card123'),
        hotWindowManager.applyHotWindow('test-kiosk', 2, 'card456'),
        hotWindowManager.applyHotWindow('test-kiosk', 3, 'card789')
      ];

      const results = await Promise.all(promises);

      // All should succeed
      expect(results.every(r => r !== null)).toBe(true);

      // Verify all hot windows are active
      const activeWindows = await hotWindowManager.getHotWindowLockers('test-kiosk');
      expect(activeWindows).toHaveLength(3);
    });

    it('should handle rapid status queries efficiently', async () => {
      // Apply some hot windows
      await hotWindowManager.applyHotWindow('test-kiosk', 1, 'card123');
      await hotWindowManager.applyHotWindow('test-kiosk', 2, 'card456');

      // Rapid status queries should all succeed
      const promises = Array(10).fill(0).map(() => 
        hotWindowManager.getStatus('test-kiosk')
      );

      const results = await Promise.all(promises);

      // All should return consistent results
      expect(results.every(r => r.activeHotWindows === 2)).toBe(true);
      expect(results.every(r => r.freeRatio === 0.5)).toBe(true);
    });
  });
});