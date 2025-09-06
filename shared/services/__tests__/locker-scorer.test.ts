import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LockerScorer, DEFAULT_SCORING_CONFIG, ScoringConfig, LockerScoringData } from '../locker-scorer';

describe('LockerScorer', () => {
  let scorer: LockerScorer;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn()
    };
    scorer = new LockerScorer(DEFAULT_SCORING_CONFIG, mockLogger);
  });

  describe('scoreLocker', () => {
    it('should calculate basic score correctly', () => {
      const locker: LockerScoringData = {
        lockerId: 1,
        freeHours: 5,
        hoursSinceLastOwner: 3,
        wearCount: 2,
        isQuarantined: false
      };

      const result = scorer.scoreLocker(locker);

      // Expected calculation:
      // base_score = 100
      // free_hours_bonus = 2.0 * 5 = 10
      // last_owner_bonus = 1.0 * 3 = 3
      // waiting_bonus = 0.5 * 0 = 0
      // pre_adjustment = 100 + 10 + 3 + 0 = 113
      // wear_divisor = 1 + (0.1 * 2) = 1.2
      // after_wear = 113 / 1.2 = 94.167
      // quarantine_multiplier = 1.0 (not quarantined)
      // final_score = 94.167 * 1.0 = 94.167

      expect(result.lockerId).toBe(1);
      expect(result.baseScore).toBe(100);
      expect(result.freeHours).toBe(5);
      expect(result.hoursSinceLastOwner).toBe(3);
      expect(result.wearCount).toBe(2);
      expect(result.quarantineMultiplier).toBe(1.0);
      expect(result.waitingHours).toBe(0);
      expect(result.finalScore).toBeCloseTo(94.167, 2);
      
      expect(result.breakdown.baseScore).toBe(100);
      expect(result.breakdown.freeHoursBonus).toBe(10);
      expect(result.breakdown.lastOwnerBonus).toBe(3);
      expect(result.breakdown.waitingBonus).toBe(0);
      expect(result.breakdown.wearPenalty).toBeCloseTo(18.833, 2);
      expect(result.breakdown.quarantinePenalty).toBe(0);
    });

    it('should apply quarantine multiplier correctly', () => {
      const locker: LockerScoringData = {
        lockerId: 2,
        freeHours: 4,
        hoursSinceLastOwner: 2,
        wearCount: 1,
        isQuarantined: true
      };

      const result = scorer.scoreLocker(locker);

      // Expected calculation:
      // pre_adjustment = 100 + (2.0 * 4) + (1.0 * 2) + 0 = 110
      // after_wear = 110 / (1 + 0.1 * 1) = 110 / 1.1 = 100
      // final_score = 100 * 0.2 = 20

      expect(result.finalScore).toBeCloseTo(20, 2);
      expect(result.quarantineMultiplier).toBe(0.2);
      expect(result.breakdown.quarantinePenalty).toBeCloseTo(80, 2);
    });

    it('should handle waiting hours bonus for starvation reduction', () => {
      const locker: LockerScoringData = {
        lockerId: 3,
        freeHours: 2,
        hoursSinceLastOwner: 1,
        wearCount: 0,
        isQuarantined: false,
        waitingHours: 10
      };

      const result = scorer.scoreLocker(locker);

      // Expected calculation:
      // pre_adjustment = 100 + (2.0 * 2) + (1.0 * 1) + (0.5 * 10) = 100 + 4 + 1 + 5 = 110
      // after_wear = 110 / (1 + 0.1 * 0) = 110 / 1 = 110
      // final_score = 110 * 1.0 = 110

      expect(result.finalScore).toBe(110);
      expect(result.waitingHours).toBe(10);
      expect(result.breakdown.waitingBonus).toBe(5);
    });

    it('should handle zero wear count correctly', () => {
      const locker: LockerScoringData = {
        lockerId: 4,
        freeHours: 1,
        hoursSinceLastOwner: 1,
        wearCount: 0,
        isQuarantined: false
      };

      const result = scorer.scoreLocker(locker);

      // With zero wear count, divisor should be 1, so no wear penalty
      expect(result.breakdown.wearPenalty).toBe(0);
      expect(result.finalScore).toBe(103); // 100 + 2 + 1 + 0
    });

    it('should handle high wear count correctly', () => {
      const locker: LockerScoringData = {
        lockerId: 5,
        freeHours: 0,
        hoursSinceLastOwner: 0,
        wearCount: 50,
        isQuarantined: false
      };

      const result = scorer.scoreLocker(locker);

      // Expected calculation:
      // pre_adjustment = 100 + 0 + 0 + 0 = 100
      // wear_divisor = 1 + (0.1 * 50) = 1 + 5 = 6
      // after_wear = 100 / 6 = 16.667
      // final_score = 16.667 * 1.0 = 16.667

      expect(result.finalScore).toBeCloseTo(16.667, 2);
      expect(result.breakdown.wearPenalty).toBeCloseTo(83.333, 2);
    });

    it('should handle edge case with all zero values', () => {
      const locker: LockerScoringData = {
        lockerId: 6,
        freeHours: 0,
        hoursSinceLastOwner: 0,
        wearCount: 0,
        isQuarantined: false,
        waitingHours: 0
      };

      const result = scorer.scoreLocker(locker);

      // Should just return base score
      expect(result.finalScore).toBe(100);
      expect(result.breakdown.freeHoursBonus).toBe(0);
      expect(result.breakdown.lastOwnerBonus).toBe(0);
      expect(result.breakdown.waitingBonus).toBe(0);
      expect(result.breakdown.wearPenalty).toBe(0);
      expect(result.breakdown.quarantinePenalty).toBe(0);
    });

    it('should clamp negative input values', () => {
      const locker: LockerScoringData = {
        lockerId: 7,
        freeHours: -5,
        hoursSinceLastOwner: -2,
        wearCount: -1,
        isQuarantined: false,
        waitingHours: -10
      };

      const result = scorer.scoreLocker(locker);

      // All negative inputs should be clamped to 0
      expect(result.freeHours).toBe(0);
      expect(result.hoursSinceLastOwner).toBe(0);
      expect(result.wearCount).toBe(0);
      expect(result.waitingHours).toBe(0);
      expect(result.finalScore).toBe(100); // Just base score
    });

    it('should prevent negative scores after wear penalty', () => {
      const locker: LockerScoringData = {
        lockerId: 8,
        freeHours: 1,
        hoursSinceLastOwner: 1,
        wearCount: 1000, // Extreme wear count
        isQuarantined: false
      };

      const result = scorer.scoreLocker(locker);

      // Score should not go negative
      expect(result.finalScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle quarantined locker with high wear', () => {
      const locker: LockerScoringData = {
        lockerId: 7,
        freeHours: 10,
        hoursSinceLastOwner: 5,
        wearCount: 20,
        isQuarantined: true,
        waitingHours: 15
      };

      const result = scorer.scoreLocker(locker);

      // Expected calculation:
      // pre_adjustment = 100 + (2.0 * 10) + (1.0 * 5) + (0.5 * 15) = 100 + 20 + 5 + 7.5 = 132.5
      // wear_divisor = 1 + (0.1 * 20) = 1 + 2 = 3
      // after_wear = 132.5 / 3 = 44.167
      // final_score = 44.167 * 0.2 = 8.833

      expect(result.finalScore).toBeCloseTo(8.833, 2);
      expect(result.quarantineMultiplier).toBe(0.2);
    });
  });

  describe('scoreLockers', () => {
    it('should score multiple lockers and sort by final score', () => {
      const lockers: LockerScoringData[] = [
        {
          lockerId: 1,
          freeHours: 2,
          hoursSinceLastOwner: 1,
          wearCount: 5,
          isQuarantined: false
        },
        {
          lockerId: 2,
          freeHours: 8,
          hoursSinceLastOwner: 4,
          wearCount: 1,
          isQuarantined: false
        },
        {
          lockerId: 3,
          freeHours: 5,
          hoursSinceLastOwner: 2,
          wearCount: 0,
          isQuarantined: true
        }
      ];

      const results = scorer.scoreLockers(lockers);

      expect(results).toHaveLength(3);
      
      // Results should be sorted by final score descending
      expect(results[0].finalScore).toBeGreaterThanOrEqual(results[1].finalScore);
      expect(results[1].finalScore).toBeGreaterThanOrEqual(results[2].finalScore);
      
      // Should log the scoring result
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/Scored 3 lockers, top candidate: \d+/)
      );
    });

    it('should handle empty locker list', () => {
      const results = scorer.scoreLockers([]);

      expect(results).toHaveLength(0);
      expect(mockLogger.log).toHaveBeenCalledWith('Scored 0 lockers, top candidate: none');
    });

    it('should maintain consistent ordering with same scores', () => {
      const lockers: LockerScoringData[] = [
        {
          lockerId: 2,
          freeHours: 5,
          hoursSinceLastOwner: 3,
          wearCount: 2,
          isQuarantined: false
        },
        {
          lockerId: 1,
          freeHours: 5,
          hoursSinceLastOwner: 3,
          wearCount: 2,
          isQuarantined: false
        }
      ];

      const results = scorer.scoreLockers([...lockers]);

      // Should produce identical scores but deterministic order (lower ID first on ties)
      expect(results[0].finalScore).toBeCloseTo(results[1].finalScore, 6);
      expect(results[0].lockerId).toBe(1); // Lower ID should come first on ties
      expect(results[1].lockerId).toBe(2);
    });

    it('should guard against NaN and Infinity values', () => {
      const mockLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
      const testScorer = new LockerScorer(DEFAULT_SCORING_CONFIG, mockLogger);

      const locker: LockerScoringData = {
        lockerId: 1,
        freeHours: NaN,
        hoursSinceLastOwner: Infinity,
        wearCount: -5,
        isQuarantined: false,
        waitingHours: -Infinity
      };

      const result = testScorer.scoreLocker(locker);

      // Should clamp all invalid values to 0
      expect(result.freeHours).toBe(0);
      expect(result.hoursSinceLastOwner).toBe(0);
      expect(result.wearCount).toBe(0);
      expect(result.waitingHours).toBe(0);
      
      // Should log config errors for non-finite values
      expect(mockLogger.error).toHaveBeenCalledWith('config_error: freeHours is not finite (NaN), setting to 0');
      expect(mockLogger.error).toHaveBeenCalledWith('config_error: hoursSinceLastOwner is not finite (Infinity), setting to 0');
      expect(mockLogger.error).toHaveBeenCalledWith('config_error: waitingHours is not finite (-Infinity), setting to 0');
    });
  });

  describe('configuration management', () => {
    it('should update configuration correctly', () => {
      const newConfig = {
        base_score: 200,
        score_factor_a: 3.0
      };

      scorer.updateConfig(newConfig);
      const config = scorer.getConfig();

      expect(config.base_score).toBe(200);
      expect(config.score_factor_a).toBe(3.0);
      expect(config.score_factor_b).toBe(1.0); // Should remain unchanged
    });

    it('should return copy of configuration', () => {
      const config1 = scorer.getConfig();
      const config2 = scorer.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });
  });

  describe('configuration validation', () => {
    it('should validate valid configuration', () => {
      const errors = LockerScorer.validateConfig(DEFAULT_SCORING_CONFIG);
      expect(errors).toHaveLength(0);
    });

    it('should detect invalid base_score', () => {
      const config = { ...DEFAULT_SCORING_CONFIG, base_score: 0 };
      const errors = LockerScorer.validateConfig(config);
      
      expect(errors).toContain('base_score must be positive');
    });

    it('should detect invalid quarantine_multiplier', () => {
      const config1 = { ...DEFAULT_SCORING_CONFIG, quarantine_multiplier: -0.1 };
      const config2 = { ...DEFAULT_SCORING_CONFIG, quarantine_multiplier: 1.5 };
      
      const errors1 = LockerScorer.validateConfig(config1);
      const errors2 = LockerScorer.validateConfig(config2);
      
      expect(errors1).toContain('quarantine_multiplier must be between 0 and 1');
      expect(errors2).toContain('quarantine_multiplier must be between 0 and 1');
    });

    it('should detect invalid score_factor_g', () => {
      const config = { ...DEFAULT_SCORING_CONFIG, score_factor_g: 1.5 };
      const errors = LockerScorer.validateConfig(config);
      
      expect(errors).toContain('score_factor_g must be between 0 and 1');
    });

    it('should validate score factor ranges', () => {
      // Test score_factor_a
      let config = { ...DEFAULT_SCORING_CONFIG, score_factor_a: 6.0 };
      let errors = LockerScorer.validateConfig(config);
      expect(errors).toContain('score_factor_a must be between 0 and 5');

      // Test score_factor_b
      config = { ...DEFAULT_SCORING_CONFIG, score_factor_b: -1.0 };
      errors = LockerScorer.validateConfig(config);
      expect(errors).toContain('score_factor_b must be between 0 and 5');

      // Test score_factor_d
      config = { ...DEFAULT_SCORING_CONFIG, score_factor_d: 10.0 };
      errors = LockerScorer.validateConfig(config);
      expect(errors).toContain('score_factor_d must be between 0 and 5');
    });

    it('should detect multiple validation errors with tightened constraints', () => {
      const config = {
        ...DEFAULT_SCORING_CONFIG,
        base_score: -10,
        score_factor_a: 6.0,
        score_factor_b: -1.0,
        score_factor_d: 10.0,
        score_factor_g: 2.0,
        quarantine_multiplier: 1.5
      };
      
      const errors = LockerScorer.validateConfig(config);
      
      expect(errors).toHaveLength(6);
      expect(errors).toContain('base_score must be positive');
      expect(errors).toContain('score_factor_a must be between 0 and 5');
      expect(errors).toContain('score_factor_b must be between 0 and 5');
      expect(errors).toContain('score_factor_d must be between 0 and 5');
      expect(errors).toContain('score_factor_g must be between 0 and 1');
      expect(errors).toContain('quarantine_multiplier must be between 0 and 1');
    });
  });

  describe('parameter variations', () => {
    it('should handle different score_factor_a values', () => {
      const locker: LockerScoringData = {
        lockerId: 1,
        freeHours: 5,
        hoursSinceLastOwner: 0,
        wearCount: 0,
        isQuarantined: false
      };

      // Test with score_factor_a = 0
      scorer.updateConfig({ score_factor_a: 0 });
      const result1 = scorer.scoreLocker(locker);
      expect(result1.breakdown.freeHoursBonus).toBe(0);

      // Test with score_factor_a = 5
      scorer.updateConfig({ score_factor_a: 5 });
      const result2 = scorer.scoreLocker(locker);
      expect(result2.breakdown.freeHoursBonus).toBe(25);
    });

    it('should handle different quarantine_multiplier values', () => {
      const locker: LockerScoringData = {
        lockerId: 1,
        freeHours: 0,
        hoursSinceLastOwner: 0,
        wearCount: 0,
        isQuarantined: true
      };

      // Test with quarantine_multiplier = 0.1
      scorer.updateConfig({ quarantine_multiplier: 0.1 });
      const result1 = scorer.scoreLocker(locker);
      expect(result1.finalScore).toBe(10);

      // Test with quarantine_multiplier = 0.5
      scorer.updateConfig({ quarantine_multiplier: 0.5 });
      const result2 = scorer.scoreLocker(locker);
      expect(result2.finalScore).toBe(50);
    });

    it('should handle extreme parameter values', () => {
      const locker: LockerScoringData = {
        lockerId: 1,
        freeHours: 100,
        hoursSinceLastOwner: 50,
        wearCount: 1000,
        isQuarantined: false,
        waitingHours: 200
      };

      const extremeConfig = {
        base_score: 1000,
        score_factor_a: 10.0,
        score_factor_b: 5.0,
        score_factor_g: 0.01,
        score_factor_d: 2.0,
        quarantine_multiplier: 0.1
      };

      scorer.updateConfig(extremeConfig);
      const result = scorer.scoreLocker(locker);

      // Should handle extreme values without errors
      expect(result.finalScore).toBeGreaterThan(0);
      expect(Number.isFinite(result.finalScore)).toBe(true);
      expect(result.breakdown.freeHoursBonus).toBe(1000);
      expect(result.breakdown.lastOwnerBonus).toBe(250);
      expect(result.breakdown.waitingBonus).toBe(400);
    });
  });
});