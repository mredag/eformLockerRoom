import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReclaimManager } from '../reclaim-manager';
import { ConfigurationManager } from '../configuration-manager';
import { QuarantineManager } from '../quarantine-manager';
import { DatabaseConnection } from '../../database/connection';

/**
 * Integration tests for reclaim timing and quarantine application
 * Tests the complete flow from eligibility check to execution
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
describe('ReclaimManager Integration Tests', () => {
  let reclaimManager: ReclaimManager;
  let mockDb: any;
  let mockConfigManager: any;
  let mockQuarantineManager: any;

  beforeEach(() => {
    mockDb = {
      get: vi.fn(),
      run: vi.fn(),
      all: vi.fn()
    };

    mockConfigManager = {
      getEffectiveConfig: vi.fn()
    };

    mockQuarantineManager = {};

    reclaimManager = new ReclaimManager(mockDb, mockConfigManager, mockQuarantineManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Reclaim Window Calculation Integration', () => {
    it('should calculate correct windows across capacity spectrum', async () => {
      const testCases = [
        { freeRatio: 0.0, expectedWindow: 30 },   // 0% -> 30min (low)
        { freeRatio: 0.05, expectedWindow: 30 },  // 5% -> 30min (low)
        { freeRatio: 0.1, expectedWindow: 30 },   // 10% -> 30min (boundary)
        { freeRatio: 0.2, expectedWindow: 68 },   // 20% -> 67.5min (interpolated)
        { freeRatio: 0.3, expectedWindow: 105 },  // 30% -> 105min (interpolated)
        { freeRatio: 0.4, expectedWindow: 143 },  // 40% -> 142.5min (interpolated)
        { freeRatio: 0.5, expectedWindow: 180 },  // 50% -> 180min (boundary)
        { freeRatio: 0.6, expectedWindow: 180 },  // 60% -> 180min (high)
        { freeRatio: 1.0, expectedWindow: 180 }   // 100% -> 180min (high)
      ];

      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reclaim_low_min: 30,
        reclaim_high_min: 180,
        free_ratio_low: 0.1,
        free_ratio_high: 0.5
      });

      for (const testCase of testCases) {
        const total = 100;
        const free = Math.floor(testCase.freeRatio * total);
        mockDb.get.mockResolvedValue({ total, free });

        const window = await reclaimManager.calculateReclaimWindow('kiosk1');
        
        expect(window).toBeCloseTo(testCase.expectedWindow, 0);
      }
    });

    it('should use configuration values for window bounds', async () => {
      // Test custom configuration
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reclaim_low_min: 15,    // Custom low window
        reclaim_high_min: 240,  // Custom high window
        free_ratio_low: 0.2,    // Custom low threshold
        free_ratio_high: 0.8    // Custom high threshold
      });

      // Test low capacity (15% free, below 20% threshold)
      mockDb.get.mockResolvedValue({ total: 100, free: 15 });
      let window = await reclaimManager.calculateReclaimWindow('kiosk1');
      expect(window).toBe(15);

      // Test high capacity (85% free, above 80% threshold)
      mockDb.get.mockResolvedValue({ total: 100, free: 85 });
      window = await reclaimManager.calculateReclaimWindow('kiosk1');
      expect(window).toBe(240);

      // Test interpolation (50% free, middle of 20%-80% range)
      mockDb.get.mockResolvedValue({ total: 100, free: 50 });
      window = await reclaimManager.calculateReclaimWindow('kiosk1');
      expect(window).toBe(128); // 15 + (0.5 * (240-15)) = 127.5 ≈ 128
    });
  });

  describe('Timing Threshold Integration', () => {
    const baseTimestamp = new Date('2025-01-09T12:00:00Z');

    it('should enforce exact boundary times (59→not eligible, 60–119→standard, ≥120 within window→exit_reopen)', async () => {
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reclaim_min: 60,
        exit_quarantine_minutes: 20,
        reclaim_low_min: 30,
        reclaim_high_min: 180,
        free_ratio_low: 0.1,
        free_ratio_high: 0.5
      });

      const testCases = [
        { minutesAgo: 59, expectedType: null, shouldReclaim: false, description: '59min → not eligible' },
        { minutesAgo: 60, expectedType: 'standard', shouldReclaim: true, description: '60min → standard' },
        { minutesAgo: 119, expectedType: 'standard', shouldReclaim: true, description: '119min → standard' },
        { minutesAgo: 120, expectedType: 'exit_reopen', shouldReclaim: true, description: '120min → exit_reopen' },
        { minutesAgo: 180, expectedType: 'exit_reopen', shouldReclaim: true, description: '180min → exit_reopen (within window)' },
        { minutesAgo: 181, expectedType: 'exit_reopen', shouldReclaim: false, description: '181min → beyond window' }
      ];

      for (const testCase of testCases) {
        const releaseTime = new Date(baseTimestamp.getTime() - testCase.minutesAgo * 60 * 1000);
        
        mockDb.get
          .mockResolvedValueOnce({
            id: 5,
            kiosk_id: 'kiosk1',
            recent_owner: 'card123',
            recent_owner_time: releaseTime.toISOString(),
            status: 'Free',
            version: 1,
            overdue_from: null,
            suspected_occupied: 0
          })
          .mockResolvedValue({ total: 10, free: 5 }); // 50% free ratio -> 180min window

        const result = await reclaimManager.checkReclaimEligibility({
          cardId: 'card123',
          kioskId: 'kiosk1',
          timestamp: baseTimestamp
        });

        if (testCase.shouldReclaim) {
          expect(result.canReclaim).toBe(true);
          expect(result.reclaimType).toBe(testCase.expectedType);
          
          if (testCase.expectedType === 'exit_reopen') {
            expect(result.quarantineApplied).toBe(true);
            expect(result.reclaimWindowMinutes).toBe(180);
          } else {
            expect(result.quarantineApplied).toBe(false);
          }
        } else {
          expect(result.canReclaim).toBe(false);
        }

        vi.clearAllMocks();
      }
    });
  });

  describe('Exclusion Flag Integration', () => {
    const baseTimestamp = new Date('2025-01-09T12:00:00Z');
    const releaseTime = new Date(baseTimestamp.getTime() - 90 * 60 * 1000); // 90 minutes ago

    it('should exclude when overdue/suspected flags are set', async () => {
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reclaim_min: 60,
        exit_quarantine_minutes: 20
      });

      const exclusionCases = [
        {
          name: 'overdue_from set',
          locker: {
            id: 5,
            kiosk_id: 'kiosk1',
            recent_owner: 'card123',
            recent_owner_time: releaseTime.toISOString(),
            status: 'Free',
            version: 1,
            overdue_from: '2025-01-09T11:30:00Z',
            suspected_occupied: 0
          },
          expectedReason: 'is overdue'
        },
        {
          name: 'suspected_occupied = 1',
          locker: {
            id: 5,
            kiosk_id: 'kiosk1',
            recent_owner: 'card123',
            recent_owner_time: releaseTime.toISOString(),
            status: 'Free',
            version: 1,
            overdue_from: null,
            suspected_occupied: 1
          },
          expectedReason: 'is suspected occupied'
        }
      ];

      for (const testCase of exclusionCases) {
        mockDb.get.mockResolvedValueOnce(testCase.locker);

        const result = await reclaimManager.checkReclaimEligibility({
          cardId: 'card123',
          kioskId: 'kiosk1',
          timestamp: baseTimestamp
        });

        expect(result.canReclaim).toBe(false);
        expect(result.reason).toContain(testCase.expectedReason);

        vi.clearAllMocks();
      }
    });
  });

  describe('Quarantine Application Integration', () => {
    it('should apply 20-minute exit quarantine correctly', async () => {
      const mockDate = new Date('2025-01-09T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        exit_quarantine_minutes: 20
      });

      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await reclaimManager.executeReclaim('card123', 'kiosk1', 5, 'exit_reopen');

      expect(result).toBe(true);
      
      // Verify quarantine timestamp is set correctly (20 minutes from now)
      const expectedQuarantineTime = new Date(mockDate.getTime() + 20 * 60 * 1000);
      
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('quarantine_until = ?'),
        expect.arrayContaining([
          'card123',
          expectedQuarantineTime.toISOString(),
          'kiosk1',
          5
        ])
      );

      vi.useRealTimers();
    });

    it('should not apply quarantine for standard reclaim', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await reclaimManager.executeReclaim('card123', 'kiosk1', 5, 'standard');

      expect(result).toBe(true);
      
      // Verify no quarantine is set
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.not.stringContaining('quarantine_until'),
        ['card123', 'kiosk1', 5]
      );
    });
  });

  describe('Capacity-Based Behavior Integration', () => {
    it('should prioritize new assignments over reclaims at low capacity', async () => {
      const baseTimestamp = new Date('2025-01-09T12:00:00Z');
      const releaseTime = new Date('2025-01-09T09:00:00Z'); // 180 minutes ago

      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reclaim_min: 120,
        reclaim_low_min: 30,
        reclaim_high_min: 180,
        free_ratio_low: 0.1,
        free_ratio_high: 0.5
      });

      // Low capacity scenario (5% free)
      mockDb.get
        .mockResolvedValueOnce({
          id: 8,
          kiosk_id: 'kiosk1',
          recent_owner: 'card456',
          recent_owner_time: releaseTime.toISOString(),
          status: 'Free',
          version: 1
        })
        .mockResolvedValue({ total: 100, free: 5 }); // 5% free -> 30min window

      const result = await reclaimManager.checkReclaimEligibility({
        cardId: 'card456',
        kioskId: 'kiosk1',
        timestamp: baseTimestamp
      });

      // Should reject reclaim because 180min > 30min window (low capacity)
      expect(result.canReclaim).toBe(false);
      expect(result.reason).toContain('Exit reopen window expired: 180min > 30min window');
      expect(result.reclaimWindowMinutes).toBe(30);
    });

    it('should allow longer reclaim windows at high capacity', async () => {
      const baseTimestamp = new Date('2025-01-09T12:00:00Z');
      const releaseTime = new Date('2025-01-09T09:00:00Z'); // 180 minutes ago

      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reclaim_min: 120,
        reclaim_low_min: 30,
        reclaim_high_min: 180,
        free_ratio_low: 0.1,
        free_ratio_high: 0.5
      });

      // High capacity scenario (60% free)
      mockDb.get
        .mockResolvedValueOnce({
          id: 8,
          kiosk_id: 'kiosk1',
          recent_owner: 'card456',
          recent_owner_time: releaseTime.toISOString(),
          status: 'Free',
          version: 1
        })
        .mockResolvedValue({ total: 100, free: 60 }); // 60% free -> 180min window

      const result = await reclaimManager.checkReclaimEligibility({
        cardId: 'card456',
        kioskId: 'kiosk1',
        timestamp: baseTimestamp
      });

      // Should allow reclaim because 180min <= 180min window (high capacity)
      expect(result.canReclaim).toBe(true);
      expect(result.reclaimType).toBe('exit_reopen');
      expect(result.reclaimWindowMinutes).toBe(180);
    });
  });

  describe('Statistics and Monitoring Integration', () => {
    it('should provide accurate reclaim statistics', async () => {
      const now = new Date('2025-01-09T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reclaim_min: 60,
        reclaim_low_min: 30,
        reclaim_high_min: 180,
        free_ratio_low: 0.1,
        free_ratio_high: 0.5
      });

      // Mock database responses for statistics
      mockDb.get
        .mockResolvedValueOnce({ total: 20, free: 6 }) // 30% free ratio
        .mockResolvedValueOnce({ count: 3 }) // 3 eligible for standard reclaim
        .mockResolvedValueOnce({ count: 1 }); // 1 eligible for exit reopen

      const stats = await reclaimManager.getReclaimStats('kiosk1');

      expect(stats).toEqual({
        freeRatio: 0.3,
        reclaimWindow: 105, // Interpolated: 30 + (0.5 * 150) = 105
        eligibleForReclaim: 3,
        eligibleForExitReopen: 1
      });

      // Verify SQL queries use correct time calculations
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('(julianday(?) - julianday(recent_owner_time)) * 24 * 60 >= ?'),
        expect.arrayContaining([now.toISOString(), 60]) // reclaim_min threshold
      );

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('(julianday(?) - julianday(recent_owner_time)) * 24 * 60 >= 120'),
        expect.arrayContaining([now.toISOString(), now.toISOString(), 105]) // 120min threshold and window
      );

      vi.useRealTimers();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle database failures gracefully during reclaim execution', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockDb.run.mockRejectedValue(new Error('SQLITE_BUSY: database is locked'));

      const result = await reclaimManager.executeReclaim('card123', 'kiosk1', 5, 'exit_reopen');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to execute reclaim for locker 5:',
        expect.objectContaining({ message: 'SQLITE_BUSY: database is locked' })
      );

      consoleSpy.mockRestore();
    });

    it('should handle missing configuration gracefully', async () => {
      // Mock missing configuration values
      mockConfigManager.getEffectiveConfig.mockResolvedValue({});

      mockDb.get.mockResolvedValue({ total: 10, free: 3 });

      const window = await reclaimManager.calculateReclaimWindow('kiosk1');

      // Should use default values
      expect(window).toBe(105); // Default interpolation with 30min low, 180min high
    });
  });
});