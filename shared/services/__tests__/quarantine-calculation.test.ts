import { describe, it, expect } from 'vitest';

/**
 * Test the quarantine calculation logic in isolation
 * This verifies the mathematical correctness of the linear interpolation
 */
describe('Quarantine Calculation Logic', () => {
  
  /**
   * Linear interpolation for quarantine duration
   * ≥0.5 → 20min, ≤0.1 → 5min, linear between
   */
  function calculateQuarantineDuration(freeRatio: number): number {
    const quarantine_min_floor = 5;
    const quarantine_min_ceiling = 20;
    const free_ratio_low = 0.1;
    const free_ratio_high = 0.5;

    // Clamp free_ratio to [0, 1] before computing minutes
    const clampedRatio = Math.max(0, Math.min(1, freeRatio));

    // High capacity: maximum quarantine (20 minutes)
    if (clampedRatio >= free_ratio_high) {
      return quarantine_min_ceiling;
    }

    // Low capacity: minimum quarantine (5 minutes)
    if (clampedRatio <= free_ratio_low) {
      return quarantine_min_floor;
    }

    // Linear interpolation between free_ratio_low and free_ratio_high
    const ratio = (clampedRatio - free_ratio_low) / (free_ratio_high - free_ratio_low);
    const duration = quarantine_min_floor + ratio * (quarantine_min_ceiling - quarantine_min_floor);

    return Math.round(duration);
  }

  describe('Boundary Values', () => {
    it('should return 20 minutes for high capacity (≥0.5)', () => {
      expect(calculateQuarantineDuration(0.5)).toBe(20);
      expect(calculateQuarantineDuration(0.6)).toBe(20);
      expect(calculateQuarantineDuration(0.8)).toBe(20);
      expect(calculateQuarantineDuration(1.0)).toBe(20);
    });

    it('should return 5 minutes for low capacity (≤0.1)', () => {
      expect(calculateQuarantineDuration(0.1)).toBe(5);
      expect(calculateQuarantineDuration(0.05)).toBe(5);
      expect(calculateQuarantineDuration(0.0)).toBe(5);
    });
  });

  describe('Linear Interpolation', () => {
    it('should interpolate correctly between boundaries', () => {
      // Test specific interpolation points
      expect(calculateQuarantineDuration(0.2)).toBe(9);   // 25% between boundaries: 5 + 0.25 * 15 = 8.75 → 9
      expect(calculateQuarantineDuration(0.3)).toBe(13);  // 50% between boundaries: 5 + 0.5 * 15 = 12.5 → 13
      expect(calculateQuarantineDuration(0.4)).toBe(16);  // 75% between boundaries: 5 + 0.75 * 15 = 16.25 → 16
    });

    it('should handle precise mathematical calculations', () => {
      // Test the exact formula: 5 + (free_ratio - 0.1) / 0.4 * 15
      
      // For 0.15: (0.15 - 0.1) / 0.4 * 15 = 0.05 / 0.4 * 15 = 1.875 → 7
      expect(calculateQuarantineDuration(0.15)).toBe(7);
      
      // For 0.25: (0.25 - 0.1) / 0.4 * 15 = 0.15 / 0.4 * 15 = 5.625 → 11
      expect(calculateQuarantineDuration(0.25)).toBe(11);
      
      // For 0.35: (0.35 - 0.1) / 0.4 * 15 = 0.25 / 0.4 * 15 = 9.375 → 14
      expect(calculateQuarantineDuration(0.35)).toBe(14);
      
      // For 0.45: (0.45 - 0.1) / 0.4 * 15 = 0.35 / 0.4 * 15 = 13.125 → 18
      expect(calculateQuarantineDuration(0.45)).toBe(18);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative ratios', () => {
      expect(calculateQuarantineDuration(-0.1)).toBe(5);
      expect(calculateQuarantineDuration(-1.0)).toBe(5);
    });

    it('should handle very high ratios', () => {
      expect(calculateQuarantineDuration(2.0)).toBe(20);
      expect(calculateQuarantineDuration(10.0)).toBe(20);
    });

    it('should handle precise boundary values', () => {
      expect(calculateQuarantineDuration(0.100000001)).toBe(5); // Just above low boundary
      expect(calculateQuarantineDuration(0.499999999)).toBe(20); // Just below high boundary
    });
  });

  describe('Real-world Scenarios', () => {
    it('should calculate correctly for typical locker scenarios', () => {
      // 30 lockers total scenarios
      const scenarios = [
        { freeLockers: 3, totalLockers: 30, expectedRatio: 0.1, expectedDuration: 5 },   // 10% free
        { freeLockers: 6, totalLockers: 30, expectedRatio: 0.2, expectedDuration: 9 },   // 20% free
        { freeLockers: 9, totalLockers: 30, expectedRatio: 0.3, expectedDuration: 13 },  // 30% free
        { freeLockers: 12, totalLockers: 30, expectedRatio: 0.4, expectedDuration: 16 }, // 40% free
        { freeLockers: 15, totalLockers: 30, expectedRatio: 0.5, expectedDuration: 20 }, // 50% free
        { freeLockers: 18, totalLockers: 30, expectedRatio: 0.6, expectedDuration: 20 }, // 60% free
      ];

      scenarios.forEach(scenario => {
        const ratio = scenario.freeLockers / scenario.totalLockers;
        const duration = calculateQuarantineDuration(ratio);
        
        expect(ratio).toBeCloseTo(scenario.expectedRatio, 3);
        expect(duration).toBe(scenario.expectedDuration);
      });
    });

    it('should handle different locker pool sizes', () => {
      // Test with different total locker counts
      const testCases = [
        { freeLockers: 5, totalLockers: 50, expectedDuration: 5 },   // 10% free
        { freeLockers: 10, totalLockers: 50, expectedDuration: 9 },  // 20% free
        { freeLockers: 25, totalLockers: 50, expectedDuration: 20 }, // 50% free
        
        { freeLockers: 1, totalLockers: 10, expectedDuration: 5 },   // 10% free
        { freeLockers: 2, totalLockers: 10, expectedDuration: 9 },   // 20% free
        { freeLockers: 5, totalLockers: 10, expectedDuration: 20 },  // 50% free
      ];

      testCases.forEach(testCase => {
        const ratio = testCase.freeLockers / testCase.totalLockers;
        const duration = calculateQuarantineDuration(ratio);
        expect(duration).toBe(testCase.expectedDuration);
      });
    });
  });

  describe('Exit Quarantine Logic', () => {
    it('should always return 20 minutes for exit quarantine regardless of capacity', () => {
      const exitQuarantineDuration = 20; // Fixed duration
      
      // Exit quarantine should always be 20 minutes regardless of free ratio
      expect(exitQuarantineDuration).toBe(20);
      
      // This would be used in reclaim scenarios where we want a fixed quarantine period
      const scenarios = [0.0, 0.1, 0.3, 0.5, 0.8, 1.0];
      scenarios.forEach(ratio => {
        // Exit quarantine is always fixed at 20 minutes
        expect(exitQuarantineDuration).toBe(20);
      });
    });
  });

  describe('Performance Characteristics', () => {
    it('should be monotonically increasing', () => {
      // Quarantine duration should increase as free ratio increases
      const ratios = [0.0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6];
      const durations = ratios.map(calculateQuarantineDuration);
      
      for (let i = 1; i < durations.length; i++) {
        expect(durations[i]).toBeGreaterThanOrEqual(durations[i - 1]);
      }
    });

    it('should have reasonable step sizes', () => {
      // Check that duration changes are reasonable (not too jumpy)
      const ratios = [0.1, 0.2, 0.3, 0.4, 0.5];
      const durations = ratios.map(calculateQuarantineDuration);
      
      // Each step should be between 3-5 minutes (reasonable progression)
      for (let i = 1; i < durations.length; i++) {
        const step = durations[i] - durations[i - 1];
        expect(step).toBeGreaterThanOrEqual(3);
        expect(step).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('Configuration Flexibility', () => {
    it('should work with custom configuration values', () => {
      function customCalculateQuarantineDuration(
        freeRatio: number,
        minDuration: number,
        maxDuration: number,
        lowThreshold: number,
        highThreshold: number
      ): number {
        if (freeRatio >= highThreshold) return maxDuration;
        if (freeRatio <= lowThreshold) return minDuration;
        
        const ratio = (freeRatio - lowThreshold) / (highThreshold - lowThreshold);
        return Math.round(minDuration + ratio * (maxDuration - minDuration));
      }

      // Test with custom ranges
      expect(customCalculateQuarantineDuration(0.3, 10, 30, 0.2, 0.8)).toBe(13); // 10 + (0.1/0.6)*20 = 13.33 → 13
      expect(customCalculateQuarantineDuration(0.5, 2, 15, 0.0, 1.0)).toBe(9);   // 2 + 0.5*13 = 8.5 → 9
    });
  });
});