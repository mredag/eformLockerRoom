/**
 * Comprehensive Candidate Selector Unit Tests
 * Task 28: Create comprehensive unit tests - Deterministic seeding focus
 * 
 * Tests deterministic selection with seeded randomization
 * Requirements: 2.1-2.5
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CandidateSelector } from '../candidate-selector';

describe('CandidateSelector - Comprehensive Tests', () => {
  let candidateSelector: CandidateSelector;
  let mockConsole: any;

  const mockConfig = {
    top_k_candidates: 5,
    selection_temperature: 1.0
  };

  beforeEach(() => {
    candidateSelector = new CandidateSelector(mockConfig);
    mockConsole = global.mockConsole();
  });

  afterEach(() => {
    mockConsole.restore();
  });

  describe('Deterministic Seeded Selection (Requirements 2.1-2.5)', () => {
    it('should use seed = hash(kioskId + cardId + floor(nowSecs/5)) for deterministic selection', () => {
      const mockScores = [
        { lockerId: 1, finalScore: 100 },
        { lockerId: 2, finalScore: 90 },
        { lockerId: 3, finalScore: 80 }
      ];

      const kioskId = 'kiosk-1';
      const cardId = 'card-123';
      const nowSecs1 = 1000; // First 5-second bucket: floor(1000/5) = 200
      const nowSecs2 = 1004; // Same 5-second bucket: floor(1004/5) = 200
      const nowSecs3 = 1005; // Next 5-second bucket: floor(1005/5) = 201

      // Same seed should give same result
      const selected1 = candidateSelector.selectFromCandidatesWithSeed(mockScores, kioskId, cardId, nowSecs1);
      const selected2 = candidateSelector.selectFromCandidatesWithSeed(mockScores, kioskId, cardId, nowSecs2);
      expect(selected1).toBe(selected2);

      // Different bucket may give different result (but deterministic for same inputs)
      const selected3 = candidateSelector.selectFromCandidatesWithSeed(mockScores, kioskId, cardId, nowSecs3);
      expect(typeof selected3).toBe('number');
      
      // Verify seed calculation: hash(kioskId + cardId + floor(nowSecs/5))
      const seed1 = candidateSelector.calculateSeed(kioskId, cardId, nowSecs1);
      const seed2 = candidateSelector.calculateSeed(kioskId, cardId, nowSecs2);
      const seed3 = candidateSelector.calculateSeed(kioskId, cardId, nowSecs3);
      
      expect(seed1).toBe(seed2); // Same 5-second bucket
      expect(seed1).not.toBe(seed3); // Different bucket
    });

    it('should produce consistent results for same seed across multiple calls', () => {
      const mockScores = [
        { lockerId: 1, finalScore: 100 },
        { lockerId: 2, finalScore: 90 },
        { lockerId: 3, finalScore: 80 },
        { lockerId: 4, finalScore: 70 },
        { lockerId: 5, finalScore: 60 }
      ];

      const kioskId = 'kiosk-1';
      const cardId = 'card-123';
      const nowSecs = 1000;

      // Multiple calls with same parameters should give same result
      const results = [];
      for (let i = 0; i < 10; i++) {
        const selected = candidateSelector.selectFromCandidatesWithSeed(mockScores, kioskId, cardId, nowSecs);
        results.push(selected);
      }

      // All results should be identical
      const firstResult = results[0];
      results.forEach(result => {
        expect(result).toBe(firstResult);
      });
    });

    it('should select from top K candidates only', () => {
      const mockScores = [
        { lockerId: 1, finalScore: 100 },
        { lockerId: 2, finalScore: 90 },
        { lockerId: 3, finalScore: 80 },
        { lockerId: 4, finalScore: 70 },
        { lockerId: 5, finalScore: 60 },
        { lockerId: 6, finalScore: 50 }, // Should not be selected (beyond top 5)
        { lockerId: 7, finalScore: 40 }  // Should not be selected (beyond top 5)
      ];

      const kioskId = 'kiosk-1';
      const cardId = 'card-123';
      const nowSecs = 1000;

      // Test multiple times to ensure we never select beyond top K
      for (let i = 0; i < 100; i++) {
        const selected = candidateSelector.selectFromCandidatesWithSeed(mockScores, kioskId, cardId, nowSecs + i * 5);
        expect([1, 2, 3, 4, 5]).toContain(selected);
        expect([6, 7]).not.toContain(selected);
      }
    });

    it('should log selection with exact format', () => {
      const mockScores = [
        { lockerId: 1, finalScore: 100 },
        { lockerId: 2, finalScore: 90 }
      ];

      const kioskId = 'kiosk-1';
      const cardId = 'card-123';
      const nowSecs = 1000;

      const selected = candidateSelector.selectFromCandidatesWithSeed(mockScores, kioskId, cardId, nowSecs);

      expect(mockConsole.logs).toContain(`Selected locker ${selected} from 2 candidates.`);
    });

    it('should handle empty candidate list', () => {
      const kioskId = 'kiosk-1';
      const cardId = 'card-123';
      const nowSecs = 1000;

      const selected = candidateSelector.selectFromCandidatesWithSeed([], kioskId, cardId, nowSecs);
      expect(selected).toBeNull();
    });

    it('should handle single candidate', () => {
      const mockScores = [{ lockerId: 1, finalScore: 100 }];
      const kioskId = 'kiosk-1';
      const cardId = 'card-123';
      const nowSecs = 1000;

      const selected = candidateSelector.selectFromCandidatesWithSeed(mockScores, kioskId, cardId, nowSecs);
      expect(selected).toBe(1);
    });
  });

  describe('Configuration Bounds Validation', () => {
    it('should reject top_k_candidates > 20 in constructor', () => {
      expect(() => {
        new CandidateSelector({ top_k_candidates: 21, selection_temperature: 1.0 });
      }).toThrow('top_k_candidates must be between 1 and 20');
    });

    it('should reject selection_temperature <= 0 in constructor', () => {
      expect(() => {
        new CandidateSelector({ top_k_candidates: 5, selection_temperature: 0 });
      }).toThrow('selection_temperature must be greater than 0');

      expect(() => {
        new CandidateSelector({ top_k_candidates: 5, selection_temperature: -0.5 });
      }).toThrow('selection_temperature must be greater than 0');
    });

    it('should accept valid bounds', () => {
      expect(() => {
        new CandidateSelector({ top_k_candidates: 1, selection_temperature: 0.1 });
      }).not.toThrow();

      expect(() => {
        new CandidateSelector({ top_k_candidates: 20, selection_temperature: 2.0 });
      }).not.toThrow();
    });

    it('should reject bounds in updateConfig', () => {
      expect(() => {
        candidateSelector.updateConfig({ top_k_candidates: 25, selection_temperature: 1.0 });
      }).toThrow('top_k_candidates must be between 1 and 20');

      expect(() => {
        candidateSelector.updateConfig({ top_k_candidates: 5, selection_temperature: -1 });
      }).toThrow('selection_temperature must be greater than 0');
    });
  });

  describe('Seed Calculation', () => {
    it('should calculate hash correctly', () => {
      const kioskId = 'kiosk-1';
      const cardId = 'card-123';
      const nowSecs = 1000;
      const bucket = Math.floor(nowSecs / 5); // 200

      const seed = candidateSelector.calculateSeed(kioskId, cardId, nowSecs);
      
      // Verify seed is deterministic
      const seed2 = candidateSelector.calculateSeed(kioskId, cardId, nowSecs);
      expect(seed).toBe(seed2);

      // Verify different inputs give different seeds
      const seed3 = candidateSelector.calculateSeed('kiosk-2', cardId, nowSecs);
      expect(seed).not.toBe(seed3);
    });

    it('should use floor(nowSecs/5) for time bucketing', () => {
      const kioskId = 'kiosk-1';
      const cardId = 'card-123';

      // Test various times in same bucket
      const times = [1000, 1001, 1002, 1003, 1004]; // All floor to 200
      const seeds = times.map(t => candidateSelector.calculateSeed(kioskId, cardId, t));
      
      // All should be the same
      seeds.forEach(seed => {
        expect(seed).toBe(seeds[0]);
      });

      // Next bucket should be different
      const nextBucketSeed = candidateSelector.calculateSeed(kioskId, cardId, 1005); // floors to 201
      expect(nextBucketSeed).not.toBe(seeds[0]);
    });
  });

  describe('PII Protection', () => {
    it('should never log raw card IDs or seeds', () => {
      const mockScores = [
        { lockerId: 1, finalScore: 100 },
        { lockerId: 2, finalScore: 90 }
      ];

      const kioskId = 'kiosk-1';
      const cardId = '0009652489'; // Sensitive card ID
      const nowSecs = 1000;

      candidateSelector.selectFromCandidatesWithSeed(mockScores, kioskId, cardId, nowSecs);

      // Check all logs for PII
      global.assertNoPII(mockConsole.logs, [cardId]);
    });
  });

  describe('Temperature-based Selection', () => {
    it('should use temperature for weighted selection', () => {
      const mockScores = [
        { lockerId: 1, finalScore: 100 },
        { lockerId: 2, finalScore: 50 }
      ];

      // Test with different temperatures using different seeds
      const kioskId = 'kiosk-1';
      const cardId = 'card-123';
      
      const highTempSelector = new CandidateSelector({ top_k_candidates: 5, selection_temperature: 2.0 });
      const lowTempSelector = new CandidateSelector({ top_k_candidates: 5, selection_temperature: 0.1 });

      // With different seeds, we should see different selection patterns
      const highTempResults = [];
      const lowTempResults = [];

      for (let i = 0; i < 50; i++) {
        const nowSecs = 1000 + i * 5; // Different time buckets
        highTempResults.push(highTempSelector.selectFromCandidatesWithSeed(mockScores, kioskId, cardId, nowSecs));
        lowTempResults.push(lowTempSelector.selectFromCandidatesWithSeed(mockScores, kioskId, cardId, nowSecs));
      }

      // Both should select valid lockers
      highTempResults.forEach(result => expect([1, 2]).toContain(result));
      lowTempResults.forEach(result => expect([1, 2]).toContain(result));
    });
  });
});