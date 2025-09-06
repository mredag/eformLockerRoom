import { describe, it, expect, vi } from 'vitest';
import { LockerScorer, DEFAULT_SCORING_CONFIG, LockerScoringData } from '../locker-scorer';

describe('LockerScorer Acceptance Tests', () => {
  it('should produce consistent results for same input', () => {
    const mockLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const scorer = new LockerScorer(DEFAULT_SCORING_CONFIG, mockLogger);

    const testData: LockerScoringData[] = [
      {
        lockerId: 1,
        freeHours: 5,
        hoursSinceLastOwner: 3,
        wearCount: 2,
        isQuarantined: false
      },
      {
        lockerId: 2,
        freeHours: 8,
        hoursSinceLastOwner: 1,
        wearCount: 5,
        isQuarantined: true
      }
    ];

    // Run scoring multiple times
    const result1 = scorer.scoreLockers([...testData]);
    const result2 = scorer.scoreLockers([...testData]);

    // Results should be identical
    expect(result1).toEqual(result2);
    expect(result1[0].finalScore).toBe(result2[0].finalScore);
  });

  it('should handle edge cases without errors', () => {
    const mockLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const scorer = new LockerScorer(DEFAULT_SCORING_CONFIG, mockLogger);

    const edgeCases: LockerScoringData[] = [
      // Zero values
      {
        lockerId: 1,
        freeHours: 0,
        hoursSinceLastOwner: 0,
        wearCount: 0,
        isQuarantined: false
      },
      // High wear count
      {
        lockerId: 2,
        freeHours: 1,
        hoursSinceLastOwner: 1,
        wearCount: 1000,
        isQuarantined: false
      },
      // Quarantined with high values
      {
        lockerId: 3,
        freeHours: 100,
        hoursSinceLastOwner: 50,
        wearCount: 0,
        isQuarantined: true,
        waitingHours: 200
      }
    ];

    // Should not throw errors
    expect(() => scorer.scoreLockers(edgeCases)).not.toThrow();
    
    const results = scorer.scoreLockers(edgeCases);
    
    // All results should be valid numbers
    results.forEach(result => {
      expect(Number.isFinite(result.finalScore)).toBe(true);
      expect(result.finalScore).toBeGreaterThanOrEqual(0);
    });
  });

  it('should log scoring results with top candidate', () => {
    const mockLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const scorer = new LockerScorer(DEFAULT_SCORING_CONFIG, mockLogger);

    const testData: LockerScoringData[] = [
      {
        lockerId: 15,
        freeHours: 10,
        hoursSinceLastOwner: 5,
        wearCount: 1,
        isQuarantined: false
      },
      {
        lockerId: 8,
        freeHours: 2,
        hoursSinceLastOwner: 1,
        wearCount: 10,
        isQuarantined: false
      }
    ];

    scorer.scoreLockers(testData);

    // Should log with format: "Scored N lockers, top candidate: ID"
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringMatching(/Scored 2 lockers, top candidate: \d+/)
    );
  });

  it('should implement the correct scoring formula', () => {
    const mockLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const scorer = new LockerScorer(DEFAULT_SCORING_CONFIG, mockLogger);

    const testLocker: LockerScoringData = {
      lockerId: 1,
      freeHours: 4,
      hoursSinceLastOwner: 2,
      wearCount: 3,
      isQuarantined: false,
      waitingHours: 5
    };

    const result = scorer.scoreLocker(testLocker);

    // Verify formula: base_score + score_factor_a×free_hours + score_factor_b×hours_since_last_owner + score_factor_d×waiting_hours
    // Then divide by (1 + score_factor_g×wear_count)
    // Then multiply by quarantine_multiplier if quarantined

    const expectedPreAdjustment = 100 + (2.0 * 4) + (1.0 * 2) + (0.5 * 5); // 100 + 8 + 2 + 2.5 = 112.5
    const expectedWearDivisor = 1 + (0.1 * 3); // 1 + 0.3 = 1.3
    const expectedAfterWear = expectedPreAdjustment / expectedWearDivisor; // 112.5 / 1.3 ≈ 86.54
    const expectedFinal = expectedAfterWear * 1.0; // Not quarantined, so × 1.0

    expect(result.finalScore).toBeCloseTo(expectedFinal, 2);
    expect(result.breakdown.baseScore).toBe(100);
    expect(result.breakdown.freeHoursBonus).toBe(8);
    expect(result.breakdown.lastOwnerBonus).toBe(2);
    expect(result.breakdown.waitingBonus).toBe(2.5);
  });

  it('should apply quarantine multiplier correctly', () => {
    const mockLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const scorer = new LockerScorer(DEFAULT_SCORING_CONFIG, mockLogger);

    const quarantinedLocker: LockerScoringData = {
      lockerId: 1,
      freeHours: 5,
      hoursSinceLastOwner: 0,
      wearCount: 0,
      isQuarantined: true
    };

    const result = scorer.scoreLocker(quarantinedLocker);

    // Expected: (100 + 10 + 0 + 0) / 1 * 0.2 = 110 * 0.2 = 22
    expect(result.finalScore).toBeCloseTo(22, 2);
    expect(result.quarantineMultiplier).toBe(0.2);
    expect(result.breakdown.quarantinePenalty).toBeCloseTo(88, 2); // 110 - 22 = 88
  });

  it('should handle wear count divisor correctly', () => {
    const mockLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const scorer = new LockerScorer(DEFAULT_SCORING_CONFIG, mockLogger);

    const highWearLocker: LockerScoringData = {
      lockerId: 1,
      freeHours: 0,
      hoursSinceLastOwner: 0,
      wearCount: 10,
      isQuarantined: false
    };

    const result = scorer.scoreLocker(highWearLocker);

    // Expected: 100 / (1 + 0.1 * 10) = 100 / 2 = 50
    expect(result.finalScore).toBeCloseTo(50, 2);
    expect(result.breakdown.wearPenalty).toBeCloseTo(50, 2); // 100 - 50 = 50
  });

  it('should validate configuration parameters', () => {
    const validConfig = { ...DEFAULT_SCORING_CONFIG };
    const errors = LockerScorer.validateConfig(validConfig);
    expect(errors).toHaveLength(0);

    const invalidConfig = {
      ...DEFAULT_SCORING_CONFIG,
      base_score: -10,
      quarantine_multiplier: 1.5,
      score_factor_g: 2.0
    };
    
    const validationErrors = LockerScorer.validateConfig(invalidConfig);
    expect(validationErrors.length).toBeGreaterThan(0);
    expect(validationErrors).toContain('base_score must be positive');
    expect(validationErrors).toContain('quarantine_multiplier must be between 0 and 1');
    expect(validationErrors).toContain('score_factor_g must be between 0 and 1');
  });
});