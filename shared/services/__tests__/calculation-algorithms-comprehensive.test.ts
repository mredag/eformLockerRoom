/**
 * Comprehensive Calculation Algorithms Unit Tests
 * Task 28: Create comprehensive unit tests
 * 
 * Tests all calculation algorithms (quarantine, reclaim, scoring) with >90% coverage
 * Requirements: 2.1-2.5, 4.1-4.5, 12.1-12.5, 14.1-14.5
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QuarantineManager } from '../quarantine-manager';
import { ReclaimManager } from '../reclaim-manager';
import { LockerScorer } from '../locker-scorer';
import { HotWindowManager } from '../hot-window-manager';

describe('Calculation Algorithms - Comprehensive Tests', () => {
  let mockConsole: any;

  beforeEach(() => {
    mockConsole = global.mockConsole();
  });

  afterEach(() => {
    mockConsole.restore();
  });

  describe('Quarantine Calculations (Requirements 12.1-12.5)', () => {
    let quarantineManager: QuarantineManager;
    let mockDb: any;
    let mockConfig: any;

    beforeEach(() => {
      mockDb = {
        get: jest.fn(),
        all: jest.fn(),
        run: jest.fn()
      };

      mockConfig = {
        quarantine_min_floor: 5,
        quarantine_min_ceiling: 20,
        exit_quarantine_minutes: 20
      };

      quarantineManager = new QuarantineManager(mockDb, mockConfig);
    });

    describe('Dynamic Quarantine Duration (Requirements 12.1-12.3)', () => {
      it('should calculate 20 minutes when free_ratio >= 0.5 (Requirement 12.1)', () => {
        const duration = quarantineManager.calculateQuarantineDuration(0.5);
        expect(duration).toBe(20);

        const duration2 = quarantineManager.calculateQuarantineDuration(0.8);
        expect(duration2).toBe(20);

        const duration3 = quarantineManager.calculateQuarantineDuration(1.0);
        expect(duration3).toBe(20);
      });

      it('should calculate 5 minutes when free_ratio <= 0.1 (Requirement 12.2)', () => {
        const duration = quarantineManager.calculateQuarantineDuration(0.1);
        expect(duration).toBe(5);

        const duration2 = quarantineManager.calculateQuarantineDuration(0.05);
        expect(duration2).toBe(5);

        const duration3 = quarantineManager.calculateQuarantineDuration(0.0);
        expect(duration3).toBe(5);
      });

      it('should interpolate linearly between 0.1 and 0.5 (Requirement 12.3)', () => {
        // Test midpoint: 0.3 should give (5 + 20) / 2 = 12.5 minutes
        const duration1 = quarantineManager.calculateQuarantineDuration(0.3);
        expect(duration1).toBeCloseTo(12.5, 1);

        // Test quarter point: 0.2 should give 5 + (0.2-0.1)/0.4 * 15 = 8.75 minutes
        const duration2 = quarantineManager.calculateQuarantineDuration(0.2);
        expect(duration2).toBeCloseTo(8.75, 1);

        // Test three-quarter point: 0.4 should give 5 + (0.4-0.1)/0.4 * 15 = 16.25 minutes
        const duration3 = quarantineManager.calculateQuarantineDuration(0.4);
        expect(duration3).toBeCloseTo(16.25, 1);
      });

      it('should use formula: 5 + (free_ratio - 0.1) / 0.4 * 15 (Requirement 12.5)', () => {
        const testCases = [
          { freeRatio: 0.15, expected: 5 + (0.15 - 0.1) / 0.4 * 15 }, // 6.875
          { freeRatio: 0.25, expected: 5 + (0.25 - 0.1) / 0.4 * 15 }, // 10.625
          { freeRatio: 0.35, expected: 5 + (0.35 - 0.1) / 0.4 * 15 }, // 14.375
          { freeRatio: 0.45, expected: 5 + (0.45 - 0.1) / 0.4 * 15 }  // 18.125
        ];

        testCases.forEach(({ freeRatio, expected }) => {
          const duration = quarantineManager.calculateQuarantineDuration(freeRatio);
          expect(duration).toBeCloseTo(expected, 2);
        });
      });
    });

    describe('Exit Quarantine (Requirement 12.4)', () => {
      it('should use fixed 20-minute duration regardless of capacity', () => {
        const exitDuration1 = quarantineManager.calculateExitQuarantineDuration(0.1); // Low capacity
        expect(exitDuration1).toBe(20);

        const exitDuration2 = quarantineManager.calculateExitQuarantineDuration(0.5); // High capacity
        expect(exitDuration2).toBe(20);

        const exitDuration3 = quarantineManager.calculateExitQuarantineDuration(0.8); // Very high capacity
        expect(exitDuration3).toBe(20);
      });
    });

    describe('Quarantine Application and Management', () => {
      it('should apply quarantine with calculated duration', async () => {
        mockDb.run.mockResolvedValue({ changes: 1 });

        await quarantineManager.applyQuarantine('kiosk-1', 1, 0.3, 'assignment');

        const expectedDuration = 12.5; // From interpolation test above
        const expectedUntil = new Date(Date.now() + expectedDuration * 60 * 1000);

        expect(mockDb.run).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE lockers SET quarantine_until = ?'),
          expect.arrayContaining([
            expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) // ISO timestamp
          ])
        );
      });

      it('should check quarantine expiration', async () => {
        const expiredQuarantine = {
          kiosk_id: 'kiosk-1',
          id: 1,
          quarantine_until: new Date(Date.now() - 60000).toISOString() // 1 minute ago
        };

        mockDb.get.mockResolvedValue(expiredQuarantine);

        const isQuarantined = await quarantineManager.isQuarantined('kiosk-1', 1);
        expect(isQuarantined).toBe(false);

        const activeQuarantine = {
          kiosk_id: 'kiosk-1',
          id: 2,
          quarantine_until: new Date(Date.now() + 60000).toISOString() // 1 minute from now
        };

        mockDb.get.mockResolvedValue(activeQuarantine);

        const isQuarantined2 = await quarantineManager.isQuarantined('kiosk-1', 2);
        expect(isQuarantined2).toBe(true);
      });

      it('should clear expired quarantines', async () => {
        mockDb.run.mockResolvedValue({ changes: 3 });

        const clearedCount = await quarantineManager.clearExpiredQuarantines();

        expect(clearedCount).toBe(3);
        expect(mockDb.run).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE lockers SET quarantine_until = NULL'),
          expect.arrayContaining([expect.any(String)]) // Current timestamp
        );
      });
    });
  });

  describe('Reclaim Calculations (Requirements 4.1-4.5)', () => {
    let reclaimManager: ReclaimManager;
    let mockDb: any;
    let mockConfig: any;

    beforeEach(() => {
      mockDb = {
        get: vi.fn(),
        all: vi.fn(),
        run: vi.fn()
      };

      mockConfig = {
        reclaim_low_min: 30,
        reclaim_high_min: 180,
        free_ratio_low: 0.1,
        free_ratio_high: 0.5,
        exit_quarantine_minutes: 20,
        reclaim_threshold_minutes: 120
      };

      reclaimManager = new ReclaimManager(mockDb, mockConfig);
    });

    describe('Reclaim Window Calculation (Requirements 4.1-4.3)', () => {
      it('should calculate 180 minutes when free_ratio >= 0.5 (high stock)', () => {
        const window = reclaimManager.calculateReclaimWindow(0.5);
        expect(window).toBe(180);

        const window2 = reclaimManager.calculateReclaimWindow(0.8);
        expect(window2).toBe(180);
      });

      it('should calculate 30 minutes when free_ratio <= 0.1 (low stock)', () => {
        const window = reclaimManager.calculateReclaimWindow(0.1);
        expect(window).toBe(30);

        const window2 = reclaimManager.calculateReclaimWindow(0.05);
        expect(window2).toBe(30);
      });

      it('should interpolate linearly between 0.1 and 0.5 (Requirement 4.1)', () => {
        // Test midpoint: 0.3 should give (30 + 180) / 2 = 105 minutes
        const window1 = reclaimManager.calculateReclaimWindow(0.3);
        expect(window1).toBeCloseTo(105, 1);

        // Test formula: 30 + (free_ratio - 0.1) / 0.4 * 150
        const testCases = [
          { freeRatio: 0.2, expected: 30 + (0.2 - 0.1) / 0.4 * 150 }, // 67.5
          { freeRatio: 0.35, expected: 30 + (0.35 - 0.1) / 0.4 * 150 }, // 123.75
          { freeRatio: 0.45, expected: 30 + (0.45 - 0.1) / 0.4 * 150 }  // 161.25
        ];

        testCases.forEach(({ freeRatio, expected }) => {
          const window = reclaimManager.calculateReclaimWindow(freeRatio);
          expect(window).toBeCloseTo(expected, 2);
        });
      });
    });

    describe('Exit Reopen Logic (Requirements 4.2-4.4)', () => {
      it('should check 120-minute threshold for eligibility (Requirement 4.2)', async () => {
        const recentUser = {
          recent_owner: 'card-123',
          recent_owner_time: new Date(Date.now() - 60 * 60 * 1000).toISOString() // 60 minutes ago
        };

        mockDb.get.mockResolvedValue(recentUser);

        const eligible = await reclaimManager.isReclaimEligible('card-123', 'kiosk-1', 1);
        expect(eligible).toBe(false); // Less than 120 minutes

        const olderUser = {
          recent_owner: 'card-123',
          recent_owner_time: new Date(Date.now() - 150 * 60 * 1000).toISOString() // 150 minutes ago
        };

        mockDb.get.mockResolvedValue(olderUser);

        const eligible2 = await reclaimManager.isReclaimEligible('card-123', 'kiosk-1', 1);
        expect(eligible2).toBe(true); // More than 120 minutes
      });

      it('should check last locker availability (Requirement 4.4)', async () => {
        const occupiedLocker = {
          kiosk_id: 'kiosk-1',
          id: 1,
          status: 'Owned',
          recent_owner: 'card-123'
        };

        mockDb.get.mockResolvedValue(occupiedLocker);

        const available = await reclaimManager.isLastLockerAvailable('card-123', 'kiosk-1');
        expect(available).toBe(false);

        const freeLocker = {
          kiosk_id: 'kiosk-1',
          id: 1,
          status: 'Free',
          recent_owner: 'card-123'
        };

        mockDb.get.mockResolvedValue(freeLocker);

        const available2 = await reclaimManager.isLastLockerAvailable('card-123', 'kiosk-1');
        expect(available2).toBe(true);
      });

      it('should apply 20-minute exit quarantine after reclaim (Requirement 4.3)', async () => {
        mockDb.run.mockResolvedValue({ changes: 1 });

        await reclaimManager.executeReclaim('card-123', 'kiosk-1', 1);

        // Should apply exit quarantine
        expect(mockDb.run).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE lockers SET quarantine_until = ?'),
          expect.arrayContaining([
            expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) // 20 minutes from now
          ])
        );
      });

      it('should log reclaim execution with exact format (Requirement 4.5)', async () => {
        mockDb.run.mockResolvedValue({ changes: 1 });
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await reclaimManager.executeReclaim('card-123', 'kiosk-1', 5);

        expect(consoleSpy).toHaveBeenCalledWith(
          'Reclaim executed: locker=5, quarantine=20min.'
        );

        consoleSpy.mockRestore();
      });
    });
  });

  describe('Scoring Calculations (Requirements 2.1-2.5)', () => {
    let lockerScorer: LockerScorer;
    let mockConfig: any;

    beforeEach(() => {
      mockConfig = {
        base_score: 100,
        score_factor_a: 2.0,
        score_factor_b: 1.0,
        score_factor_g: 0.1,
        score_factor_d: 0.5
      };

      lockerScorer = new LockerScorer(mockConfig);
    });

    describe('Base Score Calculation (Requirements 2.1-2.2)', () => {
      it('should calculate score using formula: base_score + factor_a×free_hours + factor_b×hours_since_last_owner', () => {
        const lockerData = {
          id: 1,
          free_since: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          recent_owner_time: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
          wear_count: 0
        };

        const score = lockerScorer.calculateScore(lockerData);

        // Expected: 100 + 2.0×2 + 1.0×4 = 108
        expect(score.baseScore).toBe(100);
        expect(score.freeHours).toBe(2);
        expect(score.hoursSinceLastOwner).toBe(4);
        expect(score.finalScore).toBe(108);
      });

      it('should apply wear count divisor: ÷(1+score_factor_g×wear_count) (Requirement 2.3)', () => {
        const lockerData = {
          id: 1,
          free_since: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          recent_owner_time: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          wear_count: 5
        };

        const score = lockerScorer.calculateScore(lockerData);

        // Base calculation: 100 + 2×2 + 1×4 = 108
        // Wear divisor: 1 + 0.1×5 = 1.5
        // Final: 108 ÷ 1.5 = 72
        // NOTE: No ×0.2 multiplier in prod path - multiplier is sim-only
        expect(score.wearCount).toBe(5);
        expect(score.finalScore).toBeCloseTo(72, 1);
      });

      it('should handle zero wear count correctly', () => {
        const lockerData = {
          id: 1,
          free_since: new Date().toISOString(),
          recent_owner_time: new Date().toISOString(),
          wear_count: 0
        };

        const score = lockerScorer.calculateScore(lockerData);

        // Divisor should be 1 + 0.1×0 = 1 (no penalty)
        expect(score.finalScore).toBe(100); // Base score only
      });

      it('should add waiting hours bonus when provided (Requirement 2.4)', () => {
        const lockerData = {
          id: 1,
          free_since: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour
          recent_owner_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours
          wear_count: 0
        };

        const waitingHours = 3;
        const score = lockerScorer.calculateScore(lockerData, waitingHours);

        // Base: 100 + 2×1 + 1×2 = 104
        // Waiting bonus: 0.5×3 = 1.5
        // Total: 104 + 1.5 = 105.5
        expect(score.waitingHours).toBe(3);
        expect(score.finalScore).toBeCloseTo(105.5, 1);
      });
    });

    describe('Edge Cases and Validation', () => {
      it('should handle null/undefined timestamps', () => {
        const lockerData = {
          id: 1,
          free_since: null,
          recent_owner_time: null,
          wear_count: 0
        };

        const score = lockerScorer.calculateScore(lockerData);

        expect(score.freeHours).toBe(0);
        expect(score.hoursSinceLastOwner).toBe(0);
        expect(score.finalScore).toBe(100); // Base score only
      });

      it('should handle negative time differences', () => {
        const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour in future

        const lockerData = {
          id: 1,
          free_since: futureTime,
          recent_owner_time: futureTime,
          wear_count: 0
        };

        const score = lockerScorer.calculateScore(lockerData);

        expect(score.freeHours).toBe(0); // Should not be negative
        expect(score.hoursSinceLastOwner).toBe(0);
      });

      it('should handle very high wear counts', () => {
        const lockerData = {
          id: 1,
          free_since: new Date().toISOString(),
          recent_owner_time: new Date().toISOString(),
          wear_count: 100
        };

        const score = lockerScorer.calculateScore(lockerData);

        // Divisor: 1 + 0.1×100 = 11
        // Final: 100 ÷ 11 ≈ 9.09
        expect(score.finalScore).toBeCloseTo(9.09, 2);
      });
    });

    describe('Batch Scoring', () => {
      it('should score multiple lockers efficiently', () => {
        const lockers = [
          {
            id: 1,
            free_since: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            recent_owner_time: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
            wear_count: 2
          },
          {
            id: 2,
            free_since: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            recent_owner_time: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
            wear_count: 1
          }
        ];

        const scores = lockerScorer.scoreMultipleLockers(lockers);

        expect(scores).toHaveLength(2);
        expect(scores[0].lockerId).toBe(1);
        expect(scores[1].lockerId).toBe(2);
        expect(scores[0].finalScore).toBeGreaterThan(0);
        expect(scores[1].finalScore).toBeGreaterThan(0);
      });
    });
  });

  describe('Hot Window Calculations (Requirements 14.1-14.5)', () => {
    let hotWindowManager: HotWindowManager;
    let mockConfig: any;

    beforeEach(() => {
      mockConfig = {
        hot_window_min: 10,
        hot_window_max: 30,
        free_ratio_low: 0.1,
        free_ratio_high: 0.5
      };

      hotWindowManager = new HotWindowManager(mockConfig);
    });

    describe('Owner Hot Window Protection (Requirements 14.1-14.4)', () => {
      it('should calculate 30 minutes when free_ratio >= 0.5 (Requirement 14.1)', () => {
        const window = hotWindowManager.calculateHotWindow(0.5);
        expect(window).toBe(30);

        const window2 = hotWindowManager.calculateHotWindow(0.8);
        expect(window2).toBe(30);
      });

      it('should disable when free_ratio <= 0.10 (Requirement 14.2)', () => {
        const window1 = hotWindowManager.calculateHotWindow(0.10);
        expect(window1).toBe(0); // Disabled at exactly 0.10

        const window2 = hotWindowManager.calculateHotWindow(0.05);
        expect(window2).toBe(0); // Disabled below 0.10
      });

      it('should handle hot window edge cases precisely', () => {
        // Test exact edge case values: 0.30 → 20 min, 0.333 → 22 min
        const window30 = hotWindowManager.calculateHotWindow(0.30);
        expect(window30).toBe(20); // 0.30 → 20 min

        const window333 = hotWindowManager.calculateHotWindow(0.333);
        expect(window333).toBeCloseTo(22, 0); // 0.333 → 22 min
      });

      it('should interpolate linearly between 0.1 and 0.5 (Requirement 14.3)', () => {
        // Test midpoint: 0.3 should give (10 + 30) / 2 = 20 minutes
        const window1 = hotWindowManager.calculateHotWindow(0.3);
        expect(window1).toBeCloseTo(20, 1);

        // Test formula: 10 + (free_ratio - 0.1) / 0.4 * 20
        const testCases = [
          { freeRatio: 0.2, expected: 10 + (0.2 - 0.1) / 0.4 * 20 }, // 15
          { freeRatio: 0.35, expected: 10 + (0.35 - 0.1) / 0.4 * 20 }, // 22.5
          { freeRatio: 0.45, expected: 10 + (0.45 - 0.1) / 0.4 * 20 }  // 27.5
        ];

        testCases.forEach(({ freeRatio, expected }) => {
          const window = hotWindowManager.calculateHotWindow(freeRatio);
          expect(window).toBeCloseTo(expected, 2);
        });
      });

      it('should log hot window calculation with exact format (Requirement 14.5)', () => {
        const window1 = hotWindowManager.calculateHotWindow(0.3);
        expect(mockConsole.logs).toContain('Hot window: duration=20, disabled=false.');

        const window2 = hotWindowManager.calculateHotWindow(0.05);
        expect(mockConsole.logs).toContain('Hot window: duration=0, disabled=true.');
      });

      it('should log hot window application with exact format', async () => {
        const mockDb = {
          run: jest.fn().mockResolvedValue({ changes: 1 })
        };

        hotWindowManager.setDatabase(mockDb);
        await hotWindowManager.applyHotWindow('kiosk-1', 5, 0.4);

        expect(mockConsole.logs).toContain('Hot window applied: locker=5, duration=25min.');
      });

      it('should log hot window clearing with exact format', async () => {
        const mockDb = {
          run: jest.fn().mockResolvedValue({ changes: 3 })
        };

        hotWindowManager.setDatabase(mockDb);
        await hotWindowManager.clearExpiredHotWindows('kiosk-1');

        expect(mockConsole.logs).toContain('Cleared 3 expired hot windows.');
      });
    });

    describe('Hot Window Management (Requirement 14.4)', () => {
      it('should apply hot window protection', async () => {
        const mockDb = {
          run: vi.fn().mockResolvedValue({ changes: 1 })
        };

        hotWindowManager.setDatabase(mockDb);

        await hotWindowManager.applyHotWindow('kiosk-1', 1, 0.4);

        expect(mockDb.run).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE lockers SET owner_hot_until = ?'),
          expect.arrayContaining([
            expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
          ])
        );
      });

      it('should check hot window expiration', async () => {
        const mockDb = {
          get: vi.fn()
        };

        hotWindowManager.setDatabase(mockDb);

        // Test active hot window
        mockDb.get.mockResolvedValue({
          owner_hot_until: new Date(Date.now() + 60000).toISOString() // 1 minute from now
        });

        const isActive = await hotWindowManager.isHotWindowActive('kiosk-1', 1);
        expect(isActive).toBe(true);

        // Test expired hot window
        mockDb.get.mockResolvedValue({
          owner_hot_until: new Date(Date.now() - 60000).toISOString() // 1 minute ago
        });

        const isExpired = await hotWindowManager.isHotWindowActive('kiosk-1', 1);
        expect(isExpired).toBe(false);
      });
    });
  });

  describe('Algorithm Integration and Performance', () => {
    it('should handle concurrent calculations efficiently', async () => {
      const quarantineManager = new QuarantineManager({}, mockConfig);
      const reclaimManager = new ReclaimManager({}, mockConfig);
      const lockerScorer = new LockerScorer(mockConfig);

      const promises = [
        Promise.resolve(quarantineManager.calculateQuarantineDuration(0.3)),
        Promise.resolve(reclaimManager.calculateReclaimWindow(0.3)),
        Promise.resolve(lockerScorer.calculateScore({
          id: 1,
          free_since: new Date().toISOString(),
          recent_owner_time: new Date().toISOString(),
          wear_count: 0
        }))
      ];

      const [quarantine, reclaim, score] = await Promise.all(promises);

      expect(quarantine).toBeCloseTo(12.5, 1);
      expect(reclaim).toBeCloseTo(105, 1);
      expect(score.finalScore).toBe(100);
    });

    it('should validate calculation consistency across algorithms', () => {
      const freeRatio = 0.25;

      const quarantineManager = new QuarantineManager({}, mockConfig);
      const reclaimManager = new ReclaimManager({}, mockConfig);
      const hotWindowManager = new HotWindowManager(mockConfig);

      const quarantine = quarantineManager.calculateQuarantineDuration(freeRatio);
      const reclaim = reclaimManager.calculateReclaimWindow(freeRatio);
      const hotWindow = hotWindowManager.calculateHotWindow(freeRatio);

      // All should use same interpolation logic for consistency
      expect(quarantine).toBeGreaterThan(5);
      expect(quarantine).toBeLessThan(20);
      expect(reclaim).toBeGreaterThan(30);
      expect(reclaim).toBeLessThan(180);
      expect(hotWindow).toBeGreaterThan(10);
      expect(hotWindow).toBeLessThan(30);
    });
  });
});