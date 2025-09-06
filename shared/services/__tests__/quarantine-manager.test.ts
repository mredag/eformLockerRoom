import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QuarantineManager, QuarantineConfig } from '../quarantine-manager';
import { DatabaseManager } from '../database-manager';
import { ConfigurationManager } from '../configuration-manager';

// Mock dependencies
vi.mock('../database-manager');
vi.mock('../configuration-manager');

describe('QuarantineManager', () => {
  let quarantineManager: QuarantineManager;
  let mockDb: vi.Mocked<DatabaseManager>;
  let mockConfig: vi.Mocked<ConfigurationManager>;

  const defaultConfig = {
    quarantine_min_floor: 5,
    quarantine_min_ceiling: 20,
    exit_quarantine_minutes: 20,
    free_ratio_low: 0.1,
    free_ratio_high: 0.5
  };

  beforeEach(() => {
    mockDb = {
      get: vi.fn(),
      run: vi.fn(),
      all: vi.fn()
    } as any;

    mockConfig = {
      getEffectiveConfig: vi.fn()
    } as any;

    mockConfig.getEffectiveConfig.mockResolvedValue(defaultConfig);
    
    // Mock logger
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    
    quarantineManager = new QuarantineManager(mockDb, mockConfig, mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateQuarantineDuration', () => {
    it('should return fixed 20 minutes for exit quarantine', async () => {
      const result = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'exit_quarantine');

      expect(result.duration).toBe(20);
      expect(result.reason).toBe('exit_quarantine');
      expect(result.expiresAt).toBeInstanceOf(Date);
      
      // Check that expiration is approximately 20 minutes from now
      const expectedExpiration = new Date(Date.now() + 20 * 60 * 1000);
      const timeDiff = Math.abs(result.expiresAt.getTime() - expectedExpiration.getTime());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it('should return 20 minutes for high capacity (free_ratio >= 0.5)', async () => {
      // Mock high capacity scenario
      mockDb.get.mockResolvedValue({
        total_lockers: 30,
        free_lockers: 15 // 0.5 ratio
      });

      const result = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');

      expect(result.duration).toBe(20);
      expect(result.reason).toBe('capacity_based');
    });

    it('should return 5 minutes for low capacity (free_ratio <= 0.1)', async () => {
      // Mock low capacity scenario
      mockDb.get.mockResolvedValue({
        total_lockers: 30,
        free_lockers: 3 // 0.1 ratio
      });

      const result = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');

      expect(result.duration).toBe(5);
      expect(result.reason).toBe('capacity_based');
    });

    it('should interpolate linearly between 5-20 minutes for medium capacity', async () => {
      // Test cases for linear interpolation
      const testCases = [
        { freeLockers: 6, totalLockers: 30, expectedRatio: 0.2, expectedDuration: 9 }, // 0.2 ratio
        { freeLockers: 9, totalLockers: 30, expectedRatio: 0.3, expectedDuration: 13 }, // 0.3 ratio
        { freeLockers: 12, totalLockers: 30, expectedRatio: 0.4, expectedDuration: 16 }  // 0.4 ratio -> 5 + (0.3/0.4)*15 = 16.25 -> 16
      ];

      for (const testCase of testCases) {
        mockDb.get.mockResolvedValue({
          total_lockers: testCase.totalLockers,
          free_lockers: testCase.freeLockers
        });

        const result = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');

        expect(result.duration).toBe(testCase.expectedDuration);
        expect(result.reason).toBe('capacity_based');
      }
    });

    it('should handle edge case with no lockers', async () => {
      mockDb.get.mockResolvedValue({
        total_lockers: 0,
        free_lockers: 0
      });

      const result = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');

      expect(result.duration).toBe(5); // Should default to minimum
      expect(result.reason).toBe('capacity_based');
    });

    it('should handle null database result', async () => {
      mockDb.get.mockResolvedValue(null);

      const result = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');

      expect(result.duration).toBe(5); // Should default to minimum
      expect(result.reason).toBe('capacity_based');
    });
  });

  describe('interpolateQuarantineDuration', () => {
    it('should calculate correct linear interpolation values', () => {
      const config: QuarantineConfig = {
        quarantine_min_floor: 5,
        quarantine_min_ceiling: 20,
        exit_quarantine_minutes: 20,
        free_ratio_low: 0.1,
        free_ratio_high: 0.5
      };

      // Access private method through any cast for testing
      const manager = quarantineManager as any;

      // Test boundary values
      expect(manager.interpolateQuarantineDuration(0.5, config)).toBe(20); // High boundary
      expect(manager.interpolateQuarantineDuration(0.1, config)).toBe(5);  // Low boundary
      expect(manager.interpolateQuarantineDuration(0.6, config)).toBe(20); // Above high boundary
      expect(manager.interpolateQuarantineDuration(0.05, config)).toBe(5); // Below low boundary

      // Test interpolation points
      expect(manager.interpolateQuarantineDuration(0.3, config)).toBe(13); // Middle point
      expect(manager.interpolateQuarantineDuration(0.2, config)).toBe(9);  // 25% between boundaries
      expect(manager.interpolateQuarantineDuration(0.4, config)).toBe(16); // 75% between boundaries: 5 + (0.3/0.4)*15 = 16.25 -> 16
    });

    it('should handle custom configuration values', () => {
      const customConfig: QuarantineConfig = {
        quarantine_min_floor: 10,
        quarantine_min_ceiling: 30,
        exit_quarantine_minutes: 25,
        free_ratio_low: 0.2,
        free_ratio_high: 0.8
      };

      const manager = quarantineManager as any;

      expect(manager.interpolateQuarantineDuration(0.8, customConfig)).toBe(30); // High boundary
      expect(manager.interpolateQuarantineDuration(0.2, customConfig)).toBe(10); // Low boundary
      expect(manager.interpolateQuarantineDuration(0.5, customConfig)).toBe(20); // Middle: 10 + 0.5 * 20 = 20
    });
  });

  describe('applyQuarantine', () => {
    it('should apply quarantine and update database', async () => {
      mockDb.get.mockResolvedValue({
        total_lockers: 30,
        free_lockers: 15 // 0.5 ratio -> 20 minutes
      });

      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await quarantineManager.applyQuarantine('kiosk-1', 5, 'capacity_based');

      expect(result.lockerId).toBe(5);
      expect(result.kioskId).toBe('kiosk-1');
      expect(result.duration).toBe(20);
      expect(result.reason).toBe('capacity_based');
      expect(result.appliedAt).toBeInstanceOf(Date);
      expect(result.expiresAt).toBeInstanceOf(Date);

      // Verify database update
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lockers'),
        expect.arrayContaining([
          expect.any(String), // ISO date string
          'kiosk-1',
          5
        ])
      );
    });

    it('should apply exit quarantine correctly', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await quarantineManager.applyQuarantine('kiosk-1', 8, 'exit_quarantine');

      expect(result.duration).toBe(20);
      expect(result.reason).toBe('exit_quarantine');
      expect(result.lockerId).toBe(8);
    });
  });

  describe('isQuarantined', () => {
    it('should return true for quarantined locker', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      mockDb.get.mockResolvedValue({
        quarantine_until: futureDate.toISOString()
      });

      const result = await quarantineManager.isQuarantined('kiosk-1', 5);

      expect(result).toBe(true);
    });

    it('should return false for expired quarantine', async () => {
      const pastDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      mockDb.get.mockResolvedValue({
        quarantine_until: pastDate.toISOString()
      });

      const result = await quarantineManager.isQuarantined('kiosk-1', 5);

      expect(result).toBe(false);
    });

    it('should return false for non-quarantined locker', async () => {
      mockDb.get.mockResolvedValue({
        quarantine_until: null
      });

      const result = await quarantineManager.isQuarantined('kiosk-1', 5);

      expect(result).toBe(false);
    });

    it('should return false for non-existent locker', async () => {
      mockDb.get.mockResolvedValue(null);

      const result = await quarantineManager.isQuarantined('kiosk-1', 999);

      expect(result).toBe(false);
    });
  });

  describe('getQuarantineExpiration', () => {
    it('should return expiration date for quarantined locker', async () => {
      const futureDate = new Date(Date.now() + 15 * 60 * 1000);
      mockDb.get.mockResolvedValue({
        quarantine_until: futureDate.toISOString()
      });

      const result = await quarantineManager.getQuarantineExpiration('kiosk-1', 5);

      expect(result).toBeInstanceOf(Date);
      expect(result?.getTime()).toBe(futureDate.getTime());
    });

    it('should return null for expired quarantine', async () => {
      const pastDate = new Date(Date.now() - 5 * 60 * 1000);
      mockDb.get.mockResolvedValue({
        quarantine_until: pastDate.toISOString()
      });

      const result = await quarantineManager.getQuarantineExpiration('kiosk-1', 5);

      expect(result).toBeNull();
    });

    it('should return null for non-quarantined locker', async () => {
      mockDb.get.mockResolvedValue({
        quarantine_until: null
      });

      const result = await quarantineManager.getQuarantineExpiration('kiosk-1', 5);

      expect(result).toBeNull();
    });
  });

  describe('cleanupExpiredQuarantines', () => {
    it('should cleanup expired quarantines for all kiosks', async () => {
      mockDb.run.mockResolvedValue({ changes: 3 });

      const result = await quarantineManager.cleanupExpiredQuarantines();

      expect(result).toBe(3);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lockers'),
        []
      );
    });

    it('should cleanup expired quarantines for specific kiosk', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await quarantineManager.cleanupExpiredQuarantines('kiosk-1');

      expect(result).toBe(1);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('AND kiosk_id = ?'),
        ['kiosk-1']
      );
    });

    it('should return 0 when no quarantines to cleanup', async () => {
      mockDb.run.mockResolvedValue({ changes: 0 });

      const result = await quarantineManager.cleanupExpiredQuarantines();

      expect(result).toBe(0);
    });
  });

  describe('getQuarantinedLockers', () => {
    it('should return list of quarantined lockers with remaining time', async () => {
      const now = new Date();
      const quarantine1 = new Date(now.getTime() + 5 * 60 * 1000);  // 5 minutes
      const quarantine2 = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

      mockDb.all.mockResolvedValue([
        { lockerId: 3, quarantine_until: quarantine1.toISOString() },
        { lockerId: 7, quarantine_until: quarantine2.toISOString() }
      ]);

      const result = await quarantineManager.getQuarantinedLockers('kiosk-1');

      expect(result).toHaveLength(2);
      expect(result[0].lockerId).toBe(3);
      expect(result[0].remainingMinutes).toBe(5);
      expect(result[1].lockerId).toBe(7);
      expect(result[1].remainingMinutes).toBe(15);
    });

    it('should return empty array when no quarantined lockers', async () => {
      mockDb.all.mockResolvedValue([]);

      const result = await quarantineManager.getQuarantinedLockers('kiosk-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('removeQuarantine', () => {
    it('should remove quarantine successfully', async () => {
      // Mock current quarantine state
      mockDb.get.mockResolvedValue({ 
        quarantine_until: '2025-09-05T20:00:00.000Z',
        version: 1 
      });
      
      // Mock transaction methods
      mockDb.beginTransaction = vi.fn().mockResolvedValue(undefined);
      mockDb.commit = vi.fn().mockResolvedValue(undefined);
      mockDb.rollback = vi.fn().mockResolvedValue(undefined);
      
      // Mock successful update and audit insert
      mockDb.run.mockResolvedValueOnce({ changes: 1 }) // Update locker
                .mockResolvedValueOnce({ changes: 1 }); // Insert audit

      const result = await quarantineManager.removeQuarantine('kiosk-1', 5, 'admin-user');

      expect(result).toBe(true);
      expect(mockDb.beginTransaction).toHaveBeenCalled();
      expect(mockDb.commit).toHaveBeenCalled();
    });

    it('should return false when locker not found', async () => {
      mockDb.get.mockResolvedValue(null);

      const result = await quarantineManager.removeQuarantine('kiosk-1', 999, 'admin-user');

      expect(result).toBe(false);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDb.get.mockRejectedValue(new Error('Database error'));

      await expect(
        quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based')
      ).rejects.toThrow('Database error');
    });

    it('should handle configuration errors gracefully', async () => {
      mockConfig.getEffectiveConfig.mockRejectedValue(new Error('Config error'));

      await expect(
        quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based')
      ).rejects.toThrow('Config error');
    });

    it('should handle missing configuration with defaults', async () => {
      mockConfig.getEffectiveConfig.mockResolvedValue({});
      mockDb.get.mockResolvedValue({
        total_lockers: 30,
        free_lockers: 15
      });

      const result = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');

      // Should use default values
      expect(result.duration).toBe(20); // Default ceiling for 0.5 ratio
    });

    it('should clamp free ratio to [0, 1] range', async () => {
      // Test negative ratio
      mockDb.get.mockResolvedValue({
        total_lockers: 30,
        free_lockers: -5 // This would give negative ratio
      });

      let result = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');
      expect(result.duration).toBe(5); // Should clamp to 0 and use minimum

      // Test ratio > 1
      mockDb.get.mockResolvedValue({
        total_lockers: 30,
        free_lockers: 50 // This would give ratio > 1
      });

      result = await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');
      expect(result.duration).toBe(20); // Should clamp to 1 and use maximum
    });
  });

  describe('logging verification', () => {
    it('should log quarantine application with correct format', async () => {
      mockDb.get.mockResolvedValue({
        total_lockers: 30,
        free_lockers: 9 // 0.3 ratio
      });

      const manager = quarantineManager as any;
      await quarantineManager.calculateQuarantineDuration('kiosk-1', 'capacity_based');

      expect(manager.logger.info).toHaveBeenCalledWith(
        'Quarantine applied: duration=13min, reason=capacity_based'
      );
    });

    it('should log exit quarantine application', async () => {
      const manager = quarantineManager as any;
      await quarantineManager.calculateQuarantineDuration('kiosk-1', 'exit_quarantine');

      expect(manager.logger.info).toHaveBeenCalledWith(
        'Quarantine applied: duration=20min, reason=exit_quarantine'
      );
    });
  });
});