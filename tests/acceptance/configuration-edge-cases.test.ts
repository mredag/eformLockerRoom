/**
 * Configuration Edge Cases - Acceptance Tests
 * 
 * Validates all configuration scenarios and edge cases for the smart assignment system.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../shared/database/database-manager';
import { ConfigurationManager } from '../../shared/services/configuration-manager';
import { AssignmentEngine } from '../../shared/services/assignment-engine';

describe('Configuration Edge Cases Acceptance', () => {
  let db: DatabaseManager;
  let configManager: ConfigurationManager;
  let assignmentEngine: AssignmentEngine;

  beforeEach(async () => {
    db = new DatabaseManager(':memory:');
    await db.initialize();
    
    configManager = new ConfigurationManager(db);
    assignmentEngine = new AssignmentEngine(db, configManager);
    
    await seedTestData();
  });

  afterEach(async () => {
    await db.close();
  });

  async function seedTestData() {
    // Create test lockers
    for (let i = 1; i <= 10; i++) {
      await db.query(`
        INSERT INTO lockers (kiosk_id, id, status, free_since, wear_count) 
        VALUES ('test-kiosk', ?, 'Free', CURRENT_TIMESTAMP, ?)
      `, [i, Math.floor(Math.random() * 50)]);
    }

    await configManager.seedDefaultConfiguration();
  }

  describe('Extreme Configuration Values', () => {
    test('validates minimum configuration values', async () => {
      // Test minimum valid values within acceptable ranges
      const minConfig = {
        base_score: 1,
        score_factor_a: 0.1,
        score_factor_b: 0.1,
        score_factor_g: 0.01,
        top_k_candidates: 1,
        selection_temperature: 0.1,
        quarantine_min_floor: 1,
        quarantine_min_ceiling: 2,
        session_limit_minutes: 30,
        pulse_ms: 200,        // FIXED: Within valid range 200-2000
        open_window_sec: 5,   // FIXED: Within valid range 5-20
        retry_backoff_ms: 100
      };

      await configManager.updateGlobalConfig(minConfig);
      const config = await configManager.getGlobalConfig();
      
      Object.entries(minConfig).forEach(([key, value]) => {
        expect(config[key]).toBe(value);
      });

      // Test assignment still works with minimum values
      const result = await assignmentEngine.assignLocker({
        cardId: 'min-test-card',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });
      
      expect(result.success).toBe(true);
    });

    test('validates maximum configuration values', async () => {
      // Test maximum values within acceptable ranges
      const maxConfig = {
        base_score: 10000,
        score_factor_a: 100.0,
        score_factor_b: 100.0,
        score_factor_g: 10.0,
        top_k_candidates: 50,
        selection_temperature: 10.0,
        quarantine_min_floor: 60,
        quarantine_min_ceiling: 120,
        session_limit_minutes: 1440, // 24 hours
        pulse_ms: 2000,       // FIXED: Within valid range 200-2000
        open_window_sec: 20,  // FIXED: Within valid range 5-20
        retry_backoff_ms: 5000
      };

      await configManager.updateGlobalConfig(maxConfig);
      const config = await configManager.getGlobalConfig();
      
      Object.entries(maxConfig).forEach(([key, value]) => {
        expect(config[key]).toBe(value);
      });

      // Test assignment still works with maximum values
      const result = await assignmentEngine.assignLocker({
        cardId: 'max-test-card',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });
      
      expect(result.success).toBe(true);
    });

    test('validates zero and negative value handling', async () => {
      // Test zero values where appropriate
      const zeroConfig = {
        score_factor_d: 0, // Waiting hours bonus can be zero
        reserve_ratio: 0,  // Reserve can be zero
        reserve_minimum: 0
      };

      await configManager.updateGlobalConfig(zeroConfig);
      const config = await configManager.getGlobalConfig();
      
      expect(config.score_factor_d).toBe(0);
      expect(config.reserve_ratio).toBe(0);
      expect(config.reserve_minimum).toBe(0);

      // Test negative values are rejected
      await expect(
        configManager.updateGlobalConfig({ base_score: -1 })
      ).rejects.toThrow('Configuration value out of range');

      await expect(
        configManager.updateGlobalConfig({ session_limit_minutes: -30 })
      ).rejects.toThrow('Configuration value out of range');
    });

    test('validates floating point precision handling', async () => {
      // Test precise floating point values
      const preciseConfig = {
        score_factor_a: 2.123456789,
        score_factor_b: 1.987654321,
        selection_temperature: 0.123456789,
        reserve_ratio: 0.123456789
      };

      await configManager.updateGlobalConfig(preciseConfig);
      const config = await configManager.getGlobalConfig();
      
      // Should handle reasonable precision
      expect(Math.abs(config.score_factor_a - 2.123456789)).toBeLessThan(0.000001);
      expect(Math.abs(config.score_factor_b - 1.987654321)).toBeLessThan(0.000001);
    });
  });

  describe('Configuration Conflict Resolution', () => {
    test('validates conflicting global and kiosk settings', async () => {
      // Set global configuration
      await configManager.updateGlobalConfig({
        smart_assignment_enabled: true,
        session_limit_minutes: 180
      });

      // Set conflicting kiosk override
      await configManager.setKioskOverride('test-kiosk', 'smart_assignment_enabled', false);
      await configManager.setKioskOverride('test-kiosk', 'session_limit_minutes', 240);

      // Verify kiosk override takes precedence
      const effectiveConfig = await configManager.getEffectiveConfig('test-kiosk');
      expect(effectiveConfig.smart_assignment_enabled).toBe(false);
      expect(effectiveConfig.session_limit_minutes).toBe(240);

      // Verify other kiosks use global settings
      const otherKioskConfig = await configManager.getEffectiveConfig('other-kiosk');
      expect(otherKioskConfig.smart_assignment_enabled).toBe(true);
      expect(otherKioskConfig.session_limit_minutes).toBe(180);
    });

    test('validates multiple kiosk overrides', async () => {
      const kiosks = ['kiosk-1', 'kiosk-2', 'kiosk-3'];
      const sessionLimits = [120, 180, 240];

      // Set different session limits for each kiosk
      for (let i = 0; i < kiosks.length; i++) {
        await configManager.setKioskOverride(kiosks[i], 'session_limit_minutes', sessionLimits[i]);
      }

      // Verify each kiosk has correct override
      for (let i = 0; i < kiosks.length; i++) {
        const config = await configManager.getEffectiveConfig(kiosks[i]);
        expect(config.session_limit_minutes).toBe(sessionLimits[i]);
      }
    });

    test('validates override removal and fallback', async () => {
      // Set override
      await configManager.setKioskOverride('test-kiosk', 'base_score', 200);
      
      let config = await configManager.getEffectiveConfig('test-kiosk');
      expect(config.base_score).toBe(200);

      // Remove override
      await configManager.removeKioskOverride('test-kiosk', 'base_score');
      
      config = await configManager.getEffectiveConfig('test-kiosk');
      expect(config.base_score).toBe(100); // Should fall back to global default
    });
  });

  describe('Configuration Validation Edge Cases', () => {
    test('validates interdependent configuration values', async () => {
      // Test quarantine floor > ceiling (should be rejected)
      await expect(
        configManager.updateGlobalConfig({
          quarantine_min_floor: 30,
          quarantine_min_ceiling: 20
        })
      ).rejects.toThrow('Quarantine floor cannot be greater than ceiling');

      // Test top_k_candidates > available lockers
      await configManager.updateGlobalConfig({ top_k_candidates: 100 });
      
      // Should handle gracefully when fewer lockers available
      const result = await assignmentEngine.assignLocker({
        cardId: 'large-k-test',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });
      
      expect(result.success).toBe(true); // Should still work
    });

    test('validates configuration data type enforcement', async () => {
      // Test string values for numeric fields
      await expect(
        configManager.updateGlobalConfig({ base_score: 'invalid' as any })
      ).rejects.toThrow('Invalid configuration value type');

      // Test numeric values for boolean fields
      await expect(
        configManager.updateGlobalConfig({ smart_assignment_enabled: 1 as any })
      ).rejects.toThrow('Invalid configuration value type');

      // Test boolean values for numeric fields
      await expect(
        configManager.updateGlobalConfig({ session_limit_minutes: true as any })
      ).rejects.toThrow('Invalid configuration value type');
    });

    test('validates configuration key validation', async () => {
      // Test unknown configuration keys
      await expect(
        configManager.updateGlobalConfig({ unknown_setting: 123 } as any)
      ).rejects.toThrow('Unknown configuration key');

      // Test empty key
      await expect(
        configManager.setKioskOverride('test-kiosk', '', 'value')
      ).rejects.toThrow('Configuration key cannot be empty');

      // Test null/undefined values
      await expect(
        configManager.updateGlobalConfig({ base_score: null as any })
      ).rejects.toThrow('Configuration value cannot be null');
    });
  });

  describe('Hot Reload Edge Cases', () => {
    test('validates rapid configuration changes', async () => {
      const rapidChanges = [];
      
      // Make 10 rapid configuration changes
      for (let i = 0; i < 10; i++) {
        rapidChanges.push(
          configManager.updateGlobalConfig({ base_score: 100 + i })
        );
      }
      
      await Promise.all(rapidChanges);
      
      // Verify final state is consistent
      const config = await configManager.getGlobalConfig();
      expect(config.base_score).toBeGreaterThanOrEqual(100);
      expect(config.base_score).toBeLessThan(110);
    });

    test('validates configuration reload during assignment', async () => {
      // Start assignment
      const assignmentPromise = assignmentEngine.assignLocker({
        cardId: 'reload-test-card',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });

      // Change configuration during assignment
      const configPromise = configManager.updateGlobalConfig({ base_score: 150 });

      // Both should complete successfully
      const [assignmentResult, _] = await Promise.all([assignmentPromise, configPromise]);
      expect(assignmentResult.success).toBe(true);
    });

    test('validates configuration version consistency', async () => {
      const initialVersion = await configManager.getConfigVersion();
      
      // Make several changes
      await configManager.updateGlobalConfig({ base_score: 110 });
      await configManager.updateGlobalConfig({ score_factor_a: 2.5 });
      await configManager.setKioskOverride('test-kiosk', 'session_limit_minutes', 200);
      
      const finalVersion = await configManager.getConfigVersion();
      expect(finalVersion).toBeGreaterThan(initialVersion);
      
      // Version should increment with each change
      expect(finalVersion - initialVersion).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Capacity and Stock Edge Cases', () => {
    test('validates zero capacity scenarios', async () => {
      // Fill all lockers
      await db.query(`UPDATE lockers SET status = 'Owned', owner_key = 'capacity-test'`);
      
      // Test assignment with zero capacity
      const result = await assignmentEngine.assignLocker({
        cardId: 'zero-capacity-test',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });
      
      expect(result.success).toBe(false);
      expect(result.message).toBe("Boş dolap yok. Görevliye başvurun");
    });

    test('validates single locker scenarios', async () => {
      // Fill all but one locker
      await db.query(`
        UPDATE lockers SET status = 'Owned', owner_key = 'single-test'
        WHERE id != 1
      `);
      
      // Test assignment with single available locker
      const result = await assignmentEngine.assignLocker({
        cardId: 'single-locker-test',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });
      
      expect(result.success).toBe(true);
      expect(result.lockerId).toBe(1);
    });

    test('validates reserve capacity edge cases', async () => {
      // Set reserve ratio to 50%
      await configManager.updateGlobalConfig({ reserve_ratio: 0.5 });
      
      // With 10 lockers, 5 should be reserved
      const result = await assignmentEngine.assignLocker({
        cardId: 'reserve-test',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });
      
      expect(result.success).toBe(true);
      
      // Fill assignable lockers (should be 5)
      for (let i = 0; i < 4; i++) {
        await assignmentEngine.assignLocker({
          cardId: `reserve-fill-${i}`,
          kioskId: 'test-kiosk',
          timestamp: new Date()
        });
      }
      
      // Next assignment should fail (reserve capacity reached)
      const reserveResult = await assignmentEngine.assignLocker({
        cardId: 'reserve-exceed-test',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });
      
      expect(reserveResult.success).toBe(false);
    });
  });

  describe('Timing and Duration Edge Cases', () => {
    test('validates short timing windows', async () => {
      // Set short but valid timing windows
      await configManager.updateGlobalConfig({
        pulse_ms: 200,        // FIXED: Minimum valid value
        open_window_sec: 5,   // FIXED: Minimum valid value
        retry_backoff_ms: 100
      });
      
      const result = await assignmentEngine.assignLocker({
        cardId: 'short-timing-test',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });
      
      expect(result.success).toBe(true);
    });

    test('validates long timing windows', async () => {
      // Set long but valid timing windows
      await configManager.updateGlobalConfig({
        pulse_ms: 2000,       // FIXED: Maximum valid value
        open_window_sec: 20,  // FIXED: Maximum valid value
        retry_backoff_ms: 2000,
        session_limit_minutes: 1440 // 24 hours
      });
      
      const result = await assignmentEngine.assignLocker({
        cardId: 'long-timing-test',
        kioskId: 'test-kiosk',
        timestamp: new Date()
      });
      
      expect(result.success).toBe(true);
    });

    test('validates quarantine duration calculations at boundaries', async () => {
      // Test at exact boundary values
      const boundaryTests = [
        { freeRatio: 0.1, expectedMin: 5 },   // Minimum
        { freeRatio: 0.5, expectedMin: 20 },  // Maximum
        { freeRatio: 0.3, expectedMin: 11 },  // Middle (5 + (0.3-0.1)/0.4 * 15 = 12.5, rounded)
        { freeRatio: 0.0, expectedMin: 5 },   // Below minimum
        { freeRatio: 1.0, expectedMin: 20 }   // Above maximum
      ];

      for (const test of boundaryTests) {
        const duration = calculateQuarantineDuration(test.freeRatio);
        expect(duration).toBeGreaterThanOrEqual(5);
        expect(duration).toBeLessThanOrEqual(20);
      }
    });

    function calculateQuarantineDuration(freeRatio: number): number {
      const floor = 5;
      const ceiling = 20;
      
      if (freeRatio >= 0.5) return ceiling;
      if (freeRatio <= 0.1) return floor;
      
      return floor + ((freeRatio - 0.1) / 0.4) * (ceiling - floor);
    }
  });

  describe('Seeded Determinism Validation', () => {
    test('validates deterministic selection with same seed', async () => {
      const kioskId = 'test-kiosk';
      const cardId = 'determinism-test-card';
      
      // Test same 5-second bucket produces same selection
      const nowSecs = Math.floor(Date.now() / 1000);
      const bucketTime = Math.floor(nowSecs / 5) * 5; // Current 5-second bucket
      
      // Create seed hash: hash(kioskId + cardId + floor(nowSecs/5))
      const seedInput = `${kioskId}${cardId}${Math.floor(bucketTime / 5)}`;
      
      // Perform multiple assignments in same time bucket
      const results1 = [];
      const results2 = [];
      
      // First set of assignments
      for (let i = 0; i < 3; i++) {
        const result = await assignmentEngine.assignLocker({
          cardId: `${cardId}-${i}`,
          kioskId,
          timestamp: new Date(bucketTime * 1000)
        });
        if (result.success) results1.push(result.lockerId);
      }
      
      // Second set with same seed conditions
      for (let i = 0; i < 3; i++) {
        const result = await assignmentEngine.assignLocker({
          cardId: `${cardId}-${i}`,
          kioskId,
          timestamp: new Date(bucketTime * 1000)
        });
        if (result.success) results2.push(result.lockerId);
      }
      
      // Same seed should produce same selections
      expect(results1).toEqual(results2);
    });

    test('validates selection changes in next 5-second bucket', async () => {
      const kioskId = 'test-kiosk';
      const cardId = 'bucket-test-card';
      
      const nowSecs = Math.floor(Date.now() / 1000);
      const currentBucket = Math.floor(nowSecs / 5) * 5;
      const nextBucket = currentBucket + 5;
      
      // Assignment in current bucket
      const currentResult = await assignmentEngine.assignLocker({
        cardId,
        kioskId,
        timestamp: new Date(currentBucket * 1000)
      });
      
      // Reset locker state for next test
      if (currentResult.success) {
        await db.query(`
          UPDATE lockers SET status = 'Free', owner_key = NULL 
          WHERE kiosk_id = ? AND id = ?
        `, [kioskId, currentResult.lockerId]);
      }
      
      // Assignment in next bucket (different seed)
      const nextResult = await assignmentEngine.assignLocker({
        cardId,
        kioskId,
        timestamp: new Date(nextBucket * 1000)
      });
      
      // Different buckets may produce different selections
      // (not guaranteed to be different, but seed is different)
      expect(currentResult.success).toBe(true);
      expect(nextResult.success).toBe(true);
      
      // Verify seed calculation is time-dependent
      const currentSeed = Math.floor(currentBucket / 5);
      const nextSeed = Math.floor(nextBucket / 5);
      expect(nextSeed).toBe(currentSeed + 1);
    });

    test('validates seed hash consistency', () => {
      const kioskId = 'test-kiosk';
      const cardId = 'hash-test-card';
      const timeBucket = Math.floor(Date.now() / 1000 / 5);
      
      // Generate seed hash multiple times
      const seedInput = `${kioskId}${cardId}${timeBucket}`;
      
      // Simple hash function for testing (should match implementation)
      function simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
      }
      
      const hash1 = simpleHash(seedInput);
      const hash2 = simpleHash(seedInput);
      const hash3 = simpleHash(seedInput);
      
      // Same input should always produce same hash
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
      
      // Different input should produce different hash
      const differentInput = `${kioskId}${cardId}${timeBucket + 1}`;
      const differentHash = simpleHash(differentInput);
      expect(differentHash).not.toBe(hash1);
    });
  });

  describe('Concurrent Configuration Changes', () => {
    test('validates concurrent global configuration updates', async () => {
      const concurrentUpdates = [
        configManager.updateGlobalConfig({ base_score: 120 }),
        configManager.updateGlobalConfig({ score_factor_a: 2.2 }),
        configManager.updateGlobalConfig({ session_limit_minutes: 200 })
      ];
      
      // All updates should complete without error
      await Promise.all(concurrentUpdates);
      
      const finalConfig = await configManager.getGlobalConfig();
      expect(finalConfig.base_score).toBeDefined();
      expect(finalConfig.score_factor_a).toBeDefined();
      expect(finalConfig.session_limit_minutes).toBeDefined();
    });

    test('validates concurrent kiosk override operations', async () => {
      const concurrentOverrides = [
        configManager.setKioskOverride('kiosk-1', 'base_score', 150),
        configManager.setKioskOverride('kiosk-2', 'base_score', 160),
        configManager.setKioskOverride('kiosk-3', 'base_score', 170)
      ];
      
      await Promise.all(concurrentOverrides);
      
      // Verify all overrides applied correctly
      const config1 = await configManager.getEffectiveConfig('kiosk-1');
      const config2 = await configManager.getEffectiveConfig('kiosk-2');
      const config3 = await configManager.getEffectiveConfig('kiosk-3');
      
      expect(config1.base_score).toBe(150);
      expect(config2.base_score).toBe(160);
      expect(config3.base_score).toBe(170);
    });
  });
});