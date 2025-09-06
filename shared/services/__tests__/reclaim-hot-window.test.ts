import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReclaimManager } from '../reclaim-manager';
import { HotWindowManager } from '../hot-window-manager';
import { DatabaseConnection } from '../../database/connection';
import { ConfigurationManager } from '../configuration-manager';
import { QuarantineManager } from '../quarantine-manager';
import { createTestDatabase, cleanupTestDatabase } from '../../database/test-helpers';

describe('ReclaimManager Hot Window Integration Tests', () => {
  let db: DatabaseConnection;
  let configManager: ConfigurationManager;
  let quarantineManager: QuarantineManager;
  let reclaimManager: ReclaimManager;
  let hotWindowManager: HotWindowManager;

  beforeEach(async () => {
    db = await createTestDatabase();
    configManager = new ConfigurationManager(db);
    quarantineManager = new QuarantineManager(db, configManager);
    reclaimManager = new ReclaimManager(db, configManager, quarantineManager);
    hotWindowManager = new HotWindowManager(db, configManager);

    // Seed configuration
    await db.run(
      `INSERT OR REPLACE INTO settings_global (key, value, data_type) VALUES 
       ('reclaim_min', '30', 'number'),
       ('owner_hot_window_min', '10', 'number'),
       ('owner_hot_window_max', '30', 'number'),
       ('free_ratio_low', '0.1', 'number'),
       ('free_ratio_high', '0.5', 'number')`
    );

    // Create test kiosk and lockers
    await db.run(
      `INSERT INTO lockers (kiosk_id, id, status, is_vip, version, recent_owner, recent_owner_time) VALUES 
       ('test-kiosk', 1, 'Free', 0, 1, 'card123', datetime('now', '-60 minutes')),
       ('test-kiosk', 2, 'Free', 0, 1, NULL, NULL),
       ('test-kiosk', 3, 'Free', 0, 1, NULL, NULL),
       ('test-kiosk', 4, 'Free', 0, 1, NULL, NULL),
       ('test-kiosk', 5, 'Free', 0, 1, NULL, NULL)`
    );
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  describe('Hot Window Exclusion from Reclaim', () => {
    it('should block reclaim when locker is in hot window protection by different user', async () => {
      // Apply hot window protection to locker 1 by different user
      await db.run(
        `UPDATE lockers 
         SET owner_hot_until = datetime('now', '+20 minutes'), recent_owner = 'card456'
         WHERE kiosk_id = 'test-kiosk' AND id = 1`
      );

      // Try to reclaim with original user (card123)
      const result = await reclaimManager.checkReclaimEligibility({
        cardId: 'card123',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });

      expect(result.canReclaim).toBe(false);
      expect(result.reason).toContain('hot window protection');
    });

    it('should allow reclaim when original owner bypasses hot window', async () => {
      // Apply hot window protection to locker 1 by same user
      await db.run(
        `UPDATE lockers 
         SET owner_hot_until = datetime('now', '+20 minutes'), recent_owner = 'card123'
         WHERE kiosk_id = 'test-kiosk' AND id = 1`
      );

      // Try to reclaim with same user (card123) - should bypass hot window
      const result = await reclaimManager.checkReclaimEligibility({
        cardId: 'card123',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });

      expect(result.canReclaim).toBe(true);
      expect(result.lockerId).toBe(1);
      expect(result.reclaimType).toBe('standard');
    });

    it('should allow reclaim when hot window has expired', async () => {
      // Apply expired hot window protection to locker 1
      await db.run(
        `UPDATE lockers 
         SET owner_hot_until = datetime('now', '-5 minutes'), recent_owner = 'card456'
         WHERE kiosk_id = 'test-kiosk' AND id = 1`
      );

      // Try to reclaim with original user (card123)
      const result = await reclaimManager.checkReclaimEligibility({
        cardId: 'card123',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });

      expect(result.canReclaim).toBe(true);
      expect(result.lockerId).toBe(1);
      expect(result.reclaimType).toBe('standard');
    });

    it('should allow reclaim when no hot window protection exists', async () => {
      // No hot window protection on locker 1
      const result = await reclaimManager.checkReclaimEligibility({
        cardId: 'card123',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });

      expect(result.canReclaim).toBe(true);
      expect(result.lockerId).toBe(1);
      expect(result.reclaimType).toBe('standard');
    });
  });

  describe('Hot Window and Assignment Pool Exclusion', () => {
    it('should exclude hot window protected lockers from assignment queries', async () => {
      // Apply hot window to multiple lockers
      await hotWindowManager.applyHotWindow('test-kiosk', 1, 'card123');
      await hotWindowManager.applyHotWindow('test-kiosk', 2, 'card456');

      // Query assignable lockers (excluding hot window protected ones)
      const assignableLockers = await db.all(
        `SELECT * FROM lockers 
         WHERE kiosk_id = 'test-kiosk' 
         AND status = 'Free' 
         AND is_vip = 0
         AND (owner_hot_until IS NULL OR owner_hot_until <= CURRENT_TIMESTAMP)
         ORDER BY id ASC`
      );

      const lockerIds = assignableLockers.map(l => l.id);
      
      // Should exclude hot window protected lockers
      expect(lockerIds).not.toContain(1);
      expect(lockerIds).not.toContain(2);
      
      // Should include unprotected lockers
      expect(lockerIds).toContain(3);
      expect(lockerIds).toContain(4);
      expect(lockerIds).toContain(5);
    });

    it('should use hot window index for efficient queries', async () => {
      // Apply hot window to locker 1
      await hotWindowManager.applyHotWindow('test-kiosk', 1, 'card123');

      // Query should use the idx_lockers_hot index
      const result = await db.get(
        `SELECT id FROM lockers 
         WHERE kiosk_id = 'test-kiosk' AND owner_hot_until > CURRENT_TIMESTAMP`
      );

      expect(result?.id).toBe(1);
    });
  });

  describe('Transaction Scope Integration', () => {
    it('should handle hot window application within transaction scope', async () => {
      await db.beginTransaction();
      
      try {
        // Simulate locker release within transaction
        await db.run(
          `UPDATE lockers 
           SET status = 'Free', owner_type = NULL, owner_key = NULL,
               recent_owner = 'card123', recent_owner_time = CURRENT_TIMESTAMP
           WHERE kiosk_id = 'test-kiosk' AND id = 1`
        );

        // Apply hot window within same transaction
        const application = await hotWindowManager.applyHotWindow('test-kiosk', 1, 'card123');
        
        await db.commit();

        expect(application).toBeTruthy();
        expect(application?.lockerId).toBe(1);
        expect(application?.cardId).toBe('card123');
      } catch (error) {
        await db.rollback();
        throw error;
      }
    });
  });

  describe('Configuration Integration', () => {
    it('should respect snake_case configuration keys', async () => {
      // Test that configuration uses snake_case keys
      const config = await configManager.getEffectiveConfig('test-kiosk');
      
      expect(config).toHaveProperty('owner_hot_window_min');
      expect(config).toHaveProperty('owner_hot_window_max');
      expect(config).toHaveProperty('free_ratio_low');
      expect(config).toHaveProperty('free_ratio_high');
      
      expect(config.owner_hot_window_min).toBe(10);
      expect(config.owner_hot_window_max).toBe(30);
      expect(config.free_ratio_low).toBe(0.1);
      expect(config.free_ratio_high).toBe(0.5);
    });
  });
});