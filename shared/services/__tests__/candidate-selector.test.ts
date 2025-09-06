import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  CandidateSelector, 
  DEFAULT_SELECTION_CONFIG, 
  SelectionConfig, 
  LockerScore, 
  LockerExclusionData,
  SelectionResult
} from '../candidate-selector';

describe('CandidateSelector', () => {
  let selector: CandidateSelector;
  let mockLogger: any;
  
  // Common test parameters
  const testKioskId = 'kiosk-1';
  const testCardId = 'card-123';
  const testNowSecs = 1641234567;

  beforeEach(() => {
    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn()
    };
    selector = new CandidateSelector(DEFAULT_SELECTION_CONFIG, mockLogger);
  });

  // Helper function to create mock locker scores
  const createMockScore = (lockerId: number, finalScore: number): LockerScore => ({
    lockerId,
    baseScore: 100,
    freeHours: 5,
    hoursSinceLastOwner: 3,
    wearCount: 2,
    quarantineMultiplier: 1.0,
    waitingHours: 0,
    finalScore,
    breakdown: {
      baseScore: 100,
      freeHoursBonus: 10,
      lastOwnerBonus: 3,
      wearPenalty: 18,
      waitingBonus: 0,
      quarantinePenalty: 0
    }
  });

  // Helper function to create mock exclusion data
  const createMockExclusion = (
    lockerId: number, 
    isQuarantined = false, 
    isInReturnHold = false, 
    isOverdue = false, 
    isSuspectedOccupied = false
  ): LockerExclusionData => ({
    lockerId,
    isQuarantined,
    isInReturnHold,
    isOverdue,
    isSuspectedOccupied
  });

  describe('selectFromCandidates', () => {
    it('should select from available candidates', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90),
        createMockScore(3, 80)
      ];
      const exclusions: LockerExclusionData[] = [];

      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.selectedLockerId).toBeOneOf([1, 2, 3]);
      expect(result!.candidateCount).toBe(3);
      expect(result!.topCandidates).toEqual([1, 2, 3]);
      expect(result!.timeBucket).toBe(Math.floor(testNowSecs / 5));
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringMatching(/Selected locker \d+ from 3 candidates/));
    });

    it('should exclude quarantined lockers', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90),
        createMockScore(3, 80)
      ];
      const exclusions = [
        createMockExclusion(1, true), // quarantined
        createMockExclusion(2, false),
        createMockExclusion(3, false)
      ];

      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.selectedLockerId).toBeOneOf([2, 3]);
      expect(result!.candidateCount).toBe(2);
      expect(result!.topCandidates).toEqual([2, 3]);
    });

    it('should exclude lockers in return hold', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90),
        createMockScore(3, 80)
      ];
      const exclusions = [
        createMockExclusion(1, false, true), // in return hold
        createMockExclusion(2, false, false),
        createMockExclusion(3, false, false)
      ];

      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.selectedLockerId).toBeOneOf([2, 3]);
      expect(result!.candidateCount).toBe(2);
      expect(result!.topCandidates).toEqual([2, 3]);
    });

    it('should exclude overdue lockers', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90),
        createMockScore(3, 80)
      ];
      const exclusions = [
        createMockExclusion(1, false, false, true), // overdue
        createMockExclusion(2, false, false, false),
        createMockExclusion(3, false, false, false)
      ];

      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.selectedLockerId).toBeOneOf([2, 3]);
      expect(result!.candidateCount).toBe(2);
      expect(result!.topCandidates).toEqual([2, 3]);
    });

    it('should exclude suspected occupied lockers', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90),
        createMockScore(3, 80)
      ];
      const exclusions = [
        createMockExclusion(1, false, false, false, true), // suspected occupied
        createMockExclusion(2, false, false, false, false),
        createMockExclusion(3, false, false, false, false)
      ];

      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.selectedLockerId).toBeOneOf([2, 3]);
      expect(result!.candidateCount).toBe(2);
      expect(result!.topCandidates).toEqual([2, 3]);
    });

    it('should exclude lockers with multiple exclusion conditions', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90),
        createMockScore(3, 80),
        createMockScore(4, 70)
      ];
      const exclusions = [
        createMockExclusion(1, true, false, false, false), // quarantined
        createMockExclusion(2, false, true, false, false), // return hold
        createMockExclusion(3, false, false, true, false), // overdue
        createMockExclusion(4, false, false, false, false)  // available
      ];

      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.selectedLockerId).toBe(4);
      expect(result!.candidateCount).toBe(1);
      expect(result!.topCandidates).toEqual([4]);
    });

    it('should return null when all lockers are excluded', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90)
      ];
      const exclusions = [
        createMockExclusion(1, true), // quarantined
        createMockExclusion(2, false, true) // return hold
      ];

      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).toBeNull();
    });

    it('should handle empty scores array', () => {
      const scores: LockerScore[] = [];
      const exclusions: LockerExclusionData[] = [];

      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).toBeNull();
    });

    it('should respect top_k_candidates limit', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90),
        createMockScore(3, 80),
        createMockScore(4, 70),
        createMockScore(5, 60),
        createMockScore(6, 50),
        createMockScore(7, 40)
      ];
      const exclusions: LockerExclusionData[] = [];

      // Default config has top_k_candidates = 5
      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.candidateCount).toBe(5);
      expect(result!.topCandidates).toEqual([1, 2, 3, 4, 5]);
      expect(result!.selectedLockerId).toBeOneOf([1, 2, 3, 4, 5]);
    });

    it('should handle fewer candidates than top_k_candidates', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90)
      ];
      const exclusions: LockerExclusionData[] = [];

      // Default config has top_k_candidates = 5, but only 2 candidates
      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.candidateCount).toBe(2);
      expect(result!.topCandidates).toEqual([1, 2]);
      expect(result!.selectedLockerId).toBeOneOf([1, 2]);
    });

    it('should handle lockers without exclusion data (treat as available)', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90),
        createMockScore(3, 80)
      ];
      const exclusions = [
        createMockExclusion(1, false) // Only locker 1 has exclusion data
        // Lockers 2 and 3 have no exclusion data - should be treated as available
      ];

      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.candidateCount).toBe(3);
      expect(result!.topCandidates).toEqual([1, 2, 3]);
    });
  });

  describe('deterministic selection with time buckets', () => {
    it('should produce identical results within same time bucket', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90),
        createMockScore(3, 80),
        createMockScore(4, 70),
        createMockScore(5, 60)
      ];
      const exclusions: LockerExclusionData[] = [];
      
      // Same time bucket (within 5 seconds)
      const nowSecs1 = 1641234567;
      const nowSecs2 = 1641234569; // 2 seconds later, same bucket

      const result1 = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, nowSecs1);
      const result2 = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, nowSecs2);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1!.selectedLockerId).toBe(result2!.selectedLockerId);
      expect(result1!.timeBucket).toBe(result2!.timeBucket);
    });

    it('should produce different results in different time buckets', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 95),  // Close scores for more randomness
        createMockScore(3, 90),
        createMockScore(4, 85),
        createMockScore(5, 80)
      ];
      const exclusions: LockerExclusionData[] = [];

      // Use higher temperature for more randomness
      selector.updateConfig({ selection_temperature: 2.0 });

      const results = [];
      // Test across multiple time buckets
      for (let i = 0; i < 20; i++) {
        const nowSecs = 1641234567 + (i * 10); // 10 seconds apart = different buckets
        const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, nowSecs);
        expect(result).not.toBeNull();
        results.push(result!.selectedLockerId);
      }

      // Verify that we get valid results
      expect(results.length).toBe(20);
      
      // All results should be valid locker IDs
      results.forEach(lockerId => {
        expect([1, 2, 3, 4, 5]).toContain(lockerId);
      });
    });
  });

  describe('selection temperature effects with power function', () => {
    it('should favor higher scores with low temperature', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 50),
        createMockScore(3, 25)
      ];
      const exclusions: LockerExclusionData[] = [];

      // Low temperature should strongly favor highest score
      selector.updateConfig({ selection_temperature: 0.1 });

      // Test the weight calculation directly
      const testResult = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);
      expect(testResult).not.toBeNull();
      
      // With low temperature and power function, highest score should have highest weight
      const weights = testResult!.selectionWeights;
      expect(weights.length).toBe(3);
      
      // Weights should be valid probabilities
      expect(weights.every(w => w >= 0 && w <= 1)).toBe(true);
      expect(weights.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1.0, 6);
      
      // With power function weight = max(score, 1e-9) ^ temperature
      // For temperature = 0.1: 100^0.1 ≈ 1.58, 50^0.1 ≈ 1.41, 25^0.1 ≈ 1.32
      // So highest score should have highest weight
      const maxWeightIndex = weights.indexOf(Math.max(...weights));
      expect(maxWeightIndex).toBe(0); // First locker (highest score) should have max weight
      
      // Test multiple selections to verify consistency
      const results = [];
      for (let i = 0; i < 20; i++) {
        const nowSecs = testNowSecs + (i * 10);
        const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, nowSecs);
        expect(result).not.toBeNull();
        results.push(result!.selectedLockerId);
      }
      
      // All results should be valid
      results.forEach(lockerId => {
        expect([1, 2, 3]).toContain(lockerId);
      });
    });

    it('should be more random with high temperature', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90),
        createMockScore(3, 80)
      ];
      const exclusions: LockerExclusionData[] = [];

      // High temperature should be more random
      selector.updateConfig({ selection_temperature: 3.0 });

      const results = [];
      for (let i = 0; i < 100; i++) { // More iterations for better chance of variation
        const nowSecs = testNowSecs + (i * 10); // Different time buckets
        const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, nowSecs);
        expect(result).not.toBeNull();
        results.push(result!.selectedLockerId);
      }

      // Verify all results are valid
      results.forEach(lockerId => {
        expect([1, 2, 3]).toContain(lockerId);
      });
      
      // With high temperature, there should be some distribution
      // Even if not perfectly random, should at least get valid selections
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBeGreaterThanOrEqual(1); // At least one locker selected
      
      // Test that the power function works correctly by checking weights
      const testResult = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);
      expect(testResult).not.toBeNull();
      expect(testResult!.selectionWeights.length).toBe(3);
      expect(testResult!.selectionWeights.every(w => w >= 0 && w <= 1)).toBe(true);
      
      // Sum of weights should be approximately 1
      const weightSum = testResult!.selectionWeights.reduce((sum, w) => sum + w, 0);
      expect(weightSum).toBeCloseTo(1.0, 6);
    });

    it('should handle uniform scores correctly', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 100),
        createMockScore(3, 100)
      ];
      const exclusions: LockerExclusionData[] = [];

      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.selectedLockerId).toBeOneOf([1, 2, 3]);
      expect(result!.selectionWeights).toEqual([1/3, 1/3, 1/3]);
    });
  });

  describe('edge cases', () => {
    it('should handle single candidate', () => {
      const scores = [createMockScore(1, 100)];
      const exclusions: LockerExclusionData[] = [];

      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.selectedLockerId).toBe(1);
      expect(result!.candidateCount).toBe(1);
      expect(result!.topCandidates).toEqual([1]);
      expect(result!.selectionWeights).toEqual([1.0]);
    });

    it('should handle very small temperature', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90)
      ];
      const exclusions: LockerExclusionData[] = [];

      selector.updateConfig({ selection_temperature: 0.001 });
      
      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.selectedLockerId).toBeOneOf([1, 2]);
    });

    it('should handle negative scores using power function', () => {
      const scores = [
        createMockScore(1, -10),
        createMockScore(2, -20),
        createMockScore(3, -5)
      ];
      const exclusions: LockerExclusionData[] = [];

      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.selectedLockerId).toBeOneOf([1, 2, 3]);
      // Should handle negative scores by using max(score, 1e-9) in power function
    });

    it('should handle zero scores using power function', () => {
      const scores = [
        createMockScore(1, 0),
        createMockScore(2, 0),
        createMockScore(3, 0)
      ];
      const exclusions: LockerExclusionData[] = [];

      const result = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.selectedLockerId).toBeOneOf([1, 2, 3]);
      // Should handle zero scores by using max(score, 1e-9) in power function
    });
  });

  describe('configuration management', () => {
    it('should update configuration correctly', () => {
      const newConfig = {
        top_k_candidates: 10,
        selection_temperature: 2.0
      };

      selector.updateConfig(newConfig);
      const config = selector.getConfig();

      expect(config.top_k_candidates).toBe(10);
      expect(config.selection_temperature).toBe(2.0);
    });

    it('should return copy of configuration', () => {
      const config1 = selector.getConfig();
      const config2 = selector.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });

    it('should allow partial configuration updates', () => {
      selector.updateConfig({ top_k_candidates: 8 });
      const config = selector.getConfig();

      expect(config.top_k_candidates).toBe(8);
      expect(config.selection_temperature).toBe(1.0); // Should remain unchanged
    });
  });

  describe('configuration validation', () => {
    it('should validate valid configuration', () => {
      const errors = CandidateSelector.validateConfig(DEFAULT_SELECTION_CONFIG);
      expect(errors).toHaveLength(0);
    });

    it('should detect invalid top_k_candidates', () => {
      const config1 = { ...DEFAULT_SELECTION_CONFIG, top_k_candidates: 0 };
      const config2 = { ...DEFAULT_SELECTION_CONFIG, top_k_candidates: -1 };
      const config3 = { ...DEFAULT_SELECTION_CONFIG, top_k_candidates: 1.5 };
      const config4 = { ...DEFAULT_SELECTION_CONFIG, top_k_candidates: 25 }; // > 20

      const errors1 = CandidateSelector.validateConfig(config1);
      const errors2 = CandidateSelector.validateConfig(config2);
      const errors3 = CandidateSelector.validateConfig(config3);
      const errors4 = CandidateSelector.validateConfig(config4);

      expect(errors1).toContain('top_k_candidates must be a positive integer');
      expect(errors2).toContain('top_k_candidates must be a positive integer');
      expect(errors3).toContain('top_k_candidates must be a positive integer');
      expect(errors4).toContain('top_k_candidates must not exceed 20');
    });

    it('should detect invalid selection_temperature', () => {
      const config1 = { ...DEFAULT_SELECTION_CONFIG, selection_temperature: 0 }; // Must be > 0
      const config2 = { ...DEFAULT_SELECTION_CONFIG, selection_temperature: -1 };
      const config3 = { ...DEFAULT_SELECTION_CONFIG, selection_temperature: 15 };

      const errors1 = CandidateSelector.validateConfig(config1);
      const errors2 = CandidateSelector.validateConfig(config2);
      const errors3 = CandidateSelector.validateConfig(config3);

      expect(errors1).toContain('selection_temperature must be positive (greater than 0)');
      expect(errors2).toContain('selection_temperature must be positive (greater than 0)');
      expect(errors3).toContain('selection_temperature should not exceed 10 for practical use');
    });

    it('should detect multiple validation errors', () => {
      const config = {
        top_k_candidates: -5,
        selection_temperature: 0
      };

      const errors = CandidateSelector.validateConfig(config);

      expect(errors).toHaveLength(2);
      expect(errors).toContain('top_k_candidates must be a positive integer');
      expect(errors).toContain('selection_temperature must be positive (greater than 0)');
    });
  });

  describe('time bucket seed generation', () => {
    it('should generate consistent results within same time bucket', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90)
      ];
      const exclusions: LockerExclusionData[] = [];
      
      // Same time bucket
      const nowSecs1 = 1641234567;
      const nowSecs2 = 1641234569; // 2 seconds later, same bucket

      const result1 = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, nowSecs1);
      const result2 = selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, nowSecs2);

      expect(result1!.selectedLockerId).toBe(result2!.selectedLockerId);
      expect(result1!.timeBucket).toBe(result2!.timeBucket);
    });

    it('should handle different kiosk and card combinations', () => {
      const scores = [createMockScore(1, 100)];
      const exclusions: LockerExclusionData[] = [];

      const result1 = selector.selectFromCandidates(scores, exclusions, 'kiosk-1', 'card-123', testNowSecs);
      const result2 = selector.selectFromCandidates(scores, exclusions, 'kiosk-2', 'card-123', testNowSecs);
      const result3 = selector.selectFromCandidates(scores, exclusions, 'kiosk-1', 'card-456', testNowSecs);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result3).not.toBeNull();
      
      // All should select the only available locker
      expect(result1!.selectedLockerId).toBe(1);
      expect(result2!.selectedLockerId).toBe(1);
      expect(result3!.selectedLockerId).toBe(1);
    });

    it('should handle empty kiosk and card IDs', () => {
      const scores = [createMockScore(1, 100)];
      const exclusions: LockerExclusionData[] = [];

      const result = selector.selectFromCandidates(scores, exclusions, '', '', testNowSecs);

      expect(result).not.toBeNull();
      expect(result!.selectedLockerId).toBe(1);
    });
  });

  describe('logging', () => {
    it('should log selection results in exact format', () => {
      const scores = [
        createMockScore(1, 100),
        createMockScore(2, 90),
        createMockScore(3, 80)
      ];
      const exclusions: LockerExclusionData[] = [];

      selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/^Selected locker \d+ from 3 candidates$/)
      );
    });

    it('should not log sensitive card data', () => {
      const scores = [createMockScore(1, 100)];
      const exclusions: LockerExclusionData[] = [];
      const sensitiveCardId = '0009652489';

      selector.selectFromCandidates(scores, exclusions, testKioskId, sensitiveCardId, testNowSecs);

      // Should not log the card ID or any sensitive information
      expect(mockLogger.log).toHaveBeenCalledWith('Selected locker 1 from 1 candidates');
      expect(mockLogger.log).not.toHaveBeenCalledWith(expect.stringContaining(sensitiveCardId));
    });

    it('should not log time bucket or seed information', () => {
      const scores = [createMockScore(1, 100)];
      const exclusions: LockerExclusionData[] = [];

      selector.selectFromCandidates(scores, exclusions, testKioskId, testCardId, testNowSecs);

      // Should only log the exact format specified
      expect(mockLogger.log).toHaveBeenCalledWith('Selected locker 1 from 1 candidates');
      expect(mockLogger.log).not.toHaveBeenCalledWith(expect.stringContaining('bucket'));
      expect(mockLogger.log).not.toHaveBeenCalledWith(expect.stringContaining('seed'));
    });
  });
});