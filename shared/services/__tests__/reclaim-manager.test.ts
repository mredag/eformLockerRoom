import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReclaimManager, ReclaimEligibilityCheck } from '../reclaim-manager';
import { ConfigurationManager } from '../configuration-manager';
import { QuarantineManager } from '../quarantine-manager';
import { DatabaseConnection } from '../../database/connection';

// Mock dependencies
vi.mock('../configuration-manager');
vi.mock('../quarantine-manager');
vi.mock('../../database/connection');

describe('ReclaimManager', () => {
  let reclaimManager: ReclaimManager;
  let mockDb: any;
  let mockConfigManager: any;
  let mockQuarantineManager: any;

  beforeEach(() => {
    // Mock database
    mockDb = {
      get: vi.fn(),
      run: vi.fn(),
      all: vi.fn()
    };

    // Mock configuration manager
    mockConfigManager = {
      getEffectiveConfig: vi.fn().mockResolvedValue({
        reclaim_min: 120,
        reclaim_low_min: 30,
        reclaim_high_min: 180,
        free_ratio_low: 0.1,
        free_ratio_high: 0.5,
        exit_quarantine_minutes: 20
      })
    };

    // Mock quarantine manager
    mockQuarantineManager = {};

    reclaimManager = new ReclaimManager(mockDb, mockConfigManager, mockQuarantineManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkReclaimEligibility', () => {
    const baseCheck: ReclaimEligibilityCheck = {
      cardId: 'card123',
      kioskId: 'kiosk1',
      timestamp: new Date('2025-01-09T12:00:00Z')
    };

    it('should return false when no recent locker found', async () => {
      mockDb.get.mockResolvedValue(null);

      const result = await reclaimManager.checkReclaimEligibility(baseCheck);

      expect(result.canReclaim).toBe(false);
      expect(result.reason).toBe('No recent locker found for user');
    });

    it('should return false when previous locker is not available', async () => {
      mockDb.get.mockResolvedValue({
        id: 5,
        kiosk_id: 'kiosk1',
        recent_owner: 'card123',
        recent_owner_time: '2025-01-09T10:00:00Z',
        status: 'Owned',
        version: 1
      });

      const result = await reclaimManager.checkReclaimEligibility(baseCheck);

      expect(result.canReclaim).toBe(false);
      expect(result.reason).toBe('Previous locker 5 is not available (status: Owned)');
    });

    it('should return false when not enough time has elapsed', async () => {
      mockDb.get.mockResolvedValue({
        id: 5,
        kiosk_id: 'kiosk1',
        recent_owner: 'card123',
        recent_owner_time: '2025-01-09T11:30:00Z', // 30 minutes ago
        status: 'Free',
        version: 1
      });

      const result = await reclaimManager.checkReclaimEligibility(baseCheck);

      expect(result.canReclaim).toBe(false);
      expect(result.reason).toContain('Not enough time elapsed (30min < 120min threshold)');
    });

    it('should allow standard reclaim between reclaim_min and 120 minutes', async () => {
      mockDb.get.mockResolvedValue({
        id: 5,
        kiosk_id: 'kiosk1',
        recent_owner: 'card123',
        recent_owner_time: '2025-01-09T10:30:00Z', // 90 minutes ago
        status: 'Free',
        version: 1
      });

      // Mock config with reclaim_min = 60
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reclaim_min: 60,
        exit_quarantine_minutes: 20
      });

      const result = await reclaimManager.checkReclaimEligibility(baseCheck);

      expect(result.canReclaim).toBe(true);
      expect(result.lockerId).toBe(5);
      expect(result.reclaimType).toBe('standard');
      expect(result.quarantineApplied).toBe(false);
      expect(result.reason).toContain('Standard reclaim eligible after 90 minutes');
    });

    it('should allow exit reopen after 120 minutes within window', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          id: 5,
          kiosk_id: 'kiosk1',
          recent_owner: 'card123',
          recent_owner_time: '2025-01-09T09:00:00Z', // 180 minutes ago
          status: 'Free',
          version: 1
        })
        .mockResolvedValueOnce({ total: 10, free: 5 }); // 50% free ratio

      const result = await reclaimManager.checkReclaimEligibility(baseCheck);

      expect(result.canReclaim).toBe(true);
      expect(result.lockerId).toBe(5);
      expect(result.reclaimType).toBe('exit_reopen');
      expect(result.quarantineApplied).toBe(true);
      expect(result.reclaimWindowMinutes).toBe(180); // High capacity window
      expect(result.reason).toContain('Exit reopen eligible: 180min within 180min window');
    });

    it('should reject exit reopen when window has expired', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          id: 5,
          kiosk_id: 'kiosk1',
          recent_owner: 'card123',
          recent_owner_time: '2025-01-09T06:00:00Z', // 360 minutes ago
          status: 'Free',
          version: 1
        })
        .mockResolvedValueOnce({ total: 10, free: 1 }); // 10% free ratio (low capacity)

      const result = await reclaimManager.checkReclaimEligibility(baseCheck);

      expect(result.canReclaim).toBe(false);
      expect(result.reclaimWindowMinutes).toBe(30); // Low capacity window
      expect(result.reason).toContain('Exit reopen window expired: 360min > 30min window');
    });
  });

  describe('calculateReclaimWindow', () => {
    it('should return high window (180min) at high capacity (≥50%)', async () => {
      mockDb.get.mockResolvedValue({ total: 10, free: 5 }); // 50% free

      const window = await reclaimManager.calculateReclaimWindow('kiosk1');

      expect(window).toBe(180);
    });

    it('should return low window (30min) at low capacity (≤10%)', async () => {
      mockDb.get.mockResolvedValue({ total: 10, free: 1 }); // 10% free

      const window = await reclaimManager.calculateReclaimWindow('kiosk1');

      expect(window).toBe(30);
    });

    it('should interpolate linearly between low and high capacity', async () => {
      mockDb.get.mockResolvedValue({ total: 10, free: 3 }); // 30% free

      const window = await reclaimManager.calculateReclaimWindow('kiosk1');

      // 30% is halfway between 10% and 50%
      // Should be halfway between 30min and 180min = 105min
      expect(window).toBe(105);
    });

    it('should handle zero capacity gracefully', async () => {
      mockDb.get.mockResolvedValue({ total: 10, free: 0 }); // 0% free

      const window = await reclaimManager.calculateReclaimWindow('kiosk1');

      expect(window).toBe(30); // Should use low capacity window
    });

    it('should handle no lockers gracefully', async () => {
      mockDb.get.mockResolvedValue({ total: 0, free: 0 });

      const window = await reclaimManager.calculateReclaimWindow('kiosk1');

      expect(window).toBe(30); // Should default to low capacity window
    });
  });

  describe('executeReclaim', () => {
    it('should execute standard reclaim without quarantine', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await reclaimManager.executeReclaim('card123', 'kiosk1', 5, 'standard');

      expect(result).toBe(true);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lockers'),
        ['card123', 'kiosk1', 5]
      );
      expect(consoleSpy).toHaveBeenCalledWith('Reclaim executed: locker=5, quarantine=none');
      
      consoleSpy.mockRestore();
    });

    it('should execute exit reopen with 20-minute quarantine', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await reclaimManager.executeReclaim('card123', 'kiosk1', 5, 'exit_reopen');

      expect(result).toBe(true);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('quarantine_until = ?'),
        expect.arrayContaining(['card123', expect.any(String), 'kiosk1', 5])
      );
      expect(consoleSpy).toHaveBeenCalledWith('Reclaim executed: locker=5, quarantine=20min');
      
      consoleSpy.mockRestore();
    });

    it('should handle database errors gracefully', async () => {
      mockDb.run.mockRejectedValue(new Error('Database error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await reclaimManager.executeReclaim('card123', 'kiosk1', 5, 'standard');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to execute reclaim for locker 5:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('getReclaimStats', () => {
    it('should return comprehensive reclaim statistics', async () => {
      // Mock free ratio calculation
      mockDb.get
        .mockResolvedValueOnce({ total: 10, free: 3 }) // 30% free ratio
        .mockResolvedValueOnce({ count: 2 }) // eligible for standard reclaim
        .mockResolvedValueOnce({ count: 1 }); // eligible for exit reopen

      const stats = await reclaimManager.getReclaimStats('kiosk1');

      expect(stats).toEqual({
        freeRatio: 0.3,
        reclaimWindow: 105, // Interpolated window
        eligibleForReclaim: 2,
        eligibleForExitReopen: 1
      });
    });

    it('should handle no eligible lockers', async () => {
      mockDb.get
        .mockResolvedValueOnce({ total: 10, free: 5 }) // 50% free ratio
        .mockResolvedValueOnce({ count: 0 }) // no eligible for standard reclaim
        .mockResolvedValueOnce({ count: 0 }); // no eligible for exit reopen

      const stats = await reclaimManager.getReclaimStats('kiosk1');

      expect(stats).toEqual({
        freeRatio: 0.5,
        reclaimWindow: 180,
        eligibleForReclaim: 0,
        eligibleForExitReopen: 0
      });
    });
  });

  describe('boundary timing tests', () => {
    const baseTimestamp = new Date('2025-01-09T12:00:00Z');

    it('should reject at 59 minutes (not eligible)', async () => {
      const releaseTime = new Date(baseTimestamp.getTime() - 59 * 60 * 1000); // 59 minutes ago
      
      mockDb.get.mockResolvedValueOnce({
        id: 5,
        kiosk_id: 'kiosk1',
        recent_owner: 'card123',
        recent_owner_time: releaseTime.toISOString(),
        status: 'Free',
        version: 1,
        overdue_from: null,
        suspected_occupied: 0
      });

      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reclaim_min: 60,
        exit_quarantine_minutes: 20
      });

      const result = await reclaimManager.checkReclaimEligibility({
        cardId: 'card123',
        kioskId: 'kiosk1',
        timestamp: baseTimestamp
      });

      expect(result.canReclaim).toBe(false);
      expect(result.reason).toContain('59min < 60min threshold');
    });

    it('should allow standard reclaim at 60-119 minutes', async () => {
      const testCases = [60, 90, 119];
      
      for (const minutes of testCases) {
        const releaseTime = new Date(baseTimestamp.getTime() - minutes * 60 * 1000);
        
        mockDb.get.mockResolvedValueOnce({
          id: 5,
          kiosk_id: 'kiosk1',
          recent_owner: 'card123',
          recent_owner_time: releaseTime.toISOString(),
          status: 'Free',
          version: 1,
          overdue_from: null,
          suspected_occupied: 0
        });

        mockConfigManager.getEffectiveConfig.mockResolvedValue({
          reclaim_min: 60,
          exit_quarantine_minutes: 20
        });

        const result = await reclaimManager.checkReclaimEligibility({
          cardId: 'card123',
          kioskId: 'kiosk1',
          timestamp: baseTimestamp
        });

        expect(result.canReclaim).toBe(true);
        expect(result.reclaimType).toBe('standard');
        expect(result.quarantineApplied).toBe(false);
        
        vi.clearAllMocks();
      }
    });

    it('should allow exit reopen at ≥120 minutes within window', async () => {
      const releaseTime = new Date(baseTimestamp.getTime() - 120 * 60 * 1000); // Exactly 120 minutes
      
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
        .mockResolvedValueOnce({ total: 10, free: 5 }); // 50% free ratio -> 180min window

      const result = await reclaimManager.checkReclaimEligibility({
        cardId: 'card123',
        kioskId: 'kiosk1',
        timestamp: baseTimestamp
      });

      expect(result.canReclaim).toBe(true);
      expect(result.reclaimType).toBe('exit_reopen');
      expect(result.quarantineApplied).toBe(true);
      expect(result.reclaimWindowMinutes).toBe(180);
    });
  });

  describe('exclusion flag tests', () => {
    const baseTimestamp = new Date('2025-01-09T12:00:00Z');
    const releaseTime = new Date(baseTimestamp.getTime() - 90 * 60 * 1000); // 90 minutes ago

    it('should exclude when overdue_from is set', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 5,
        kiosk_id: 'kiosk1',
        recent_owner: 'card123',
        recent_owner_time: releaseTime.toISOString(),
        status: 'Free',
        version: 1,
        overdue_from: '2025-01-09T11:30:00Z', // Overdue flag set
        suspected_occupied: 0
      });

      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reclaim_min: 60,
        exit_quarantine_minutes: 20
      });

      const result = await reclaimManager.checkReclaimEligibility({
        cardId: 'card123',
        kioskId: 'kiosk1',
        timestamp: baseTimestamp
      });

      expect(result.canReclaim).toBe(false);
      expect(result.reason).toContain('is overdue');
    });

    it('should exclude when suspected_occupied = 1', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 5,
        kiosk_id: 'kiosk1',
        recent_owner: 'card123',
        recent_owner_time: releaseTime.toISOString(),
        status: 'Free',
        version: 1,
        overdue_from: null,
        suspected_occupied: 1 // Suspected occupied flag set
      });

      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reclaim_min: 60,
        exit_quarantine_minutes: 20
      });

      const result = await reclaimManager.checkReclaimEligibility({
        cardId: 'card123',
        kioskId: 'kiosk1',
        timestamp: baseTimestamp
      });

      expect(result.canReclaim).toBe(false);
      expect(result.reason).toContain('is suspected occupied');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete reclaim flow with timing validation', async () => {
      const now = new Date('2025-01-09T12:00:00Z');
      const releaseTime = new Date('2025-01-09T09:30:00Z'); // 150 minutes ago
      
      // Mock recent locker found
      mockDb.get
        .mockResolvedValueOnce({
          id: 8,
          kiosk_id: 'kiosk1',
          recent_owner: 'card456',
          recent_owner_time: releaseTime.toISOString(),
          status: 'Free',
          version: 2,
          overdue_from: null,
          suspected_occupied: 0
        })
        .mockResolvedValueOnce({ total: 20, free: 6 }); // 30% free ratio

      const check: ReclaimEligibilityCheck = {
        cardId: 'card456',
        kioskId: 'kiosk1',
        timestamp: now
      };

      const eligibility = await reclaimManager.checkReclaimEligibility(check);

      expect(eligibility.canReclaim).toBe(true);
      expect(eligibility.reclaimType).toBe('exit_reopen');
      expect(eligibility.quarantineApplied).toBe(true);
      expect(eligibility.reclaimWindowMinutes).toBe(105); // Interpolated

      // Execute the reclaim
      mockDb.run.mockResolvedValue({ changes: 1 });
      const executed = await reclaimManager.executeReclaim(
        'card456', 
        'kiosk1', 
        8, 
        'exit_reopen'
      );

      expect(executed).toBe(true);
    });

    it('should respect 120-minute threshold for exit reopen eligibility', async () => {
      const now = new Date('2025-01-09T12:00:00Z');
      const releaseTime = new Date('2025-01-09T10:01:00Z'); // 119 minutes ago (just under threshold)
      
      mockDb.get.mockResolvedValueOnce({
        id: 3,
        kiosk_id: 'kiosk1',
        recent_owner: 'card789',
        recent_owner_time: releaseTime.toISOString(),
        status: 'Free',
        version: 1,
        overdue_from: null,
        suspected_occupied: 0
      });

      // Set reclaim_min to 60 minutes
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reclaim_min: 60,
        exit_quarantine_minutes: 20
      });

      const check: ReclaimEligibilityCheck = {
        cardId: 'card789',
        kioskId: 'kiosk1',
        timestamp: now
      };

      const result = await reclaimManager.checkReclaimEligibility(check);

      // Should be standard reclaim (not exit reopen) since < 120 minutes
      expect(result.canReclaim).toBe(true);
      expect(result.reclaimType).toBe('standard');
      expect(result.quarantineApplied).toBe(false);
    });
  });
});