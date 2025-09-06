import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HotWindowManager } from '../hot-window-manager';
import { DatabaseConnection } from '../../database/connection';
import { ConfigurationManager } from '../configuration-manager';

// Mock dependencies
const mockDb = {
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn()
} as unknown as DatabaseConnection;

const mockConfigManager = {
  getEffectiveConfig: vi.fn()
} as unknown as ConfigurationManager;

describe('HotWindowManager', () => {
  let hotWindowManager: HotWindowManager;

  beforeEach(() => {
    vi.clearAllMocks();
    hotWindowManager = new HotWindowManager(mockDb, mockConfigManager);
    
    // Default config
    vi.mocked(mockConfigManager.getEffectiveConfig).mockResolvedValue({
      owner_hot_window_min: 10,
      owner_hot_window_max: 30,
      free_ratio_low: 0.1,
      free_ratio_high: 0.5
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateHotWindow', () => {
    it('should disable hot window when free ratio ≤ 0.1', async () => {
      // Mock free ratio calculation (0 free, 10 total = 0.0 ratio)
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 0 });

      const result = await hotWindowManager.calculateHotWindow('kiosk-1');

      expect(result).toEqual({
        duration: 0,
        disabled: true,
        freeRatio: 0.0
      });
    });

    it('should set maximum duration when free ratio ≥ 0.5', async () => {
      // Mock free ratio calculation (6 free, 10 total = 0.6 ratio)
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 6 });

      const result = await hotWindowManager.calculateHotWindow('kiosk-1');

      expect(result).toEqual({
        duration: 30,
        disabled: false,
        freeRatio: 0.6
      });
    });

    it('should interpolate linearly between 0.1 and 0.5 free ratio', async () => {
      // Mock free ratio calculation (3 free, 10 total = 0.3 ratio)
      // 0.3 is halfway between 0.1 and 0.5, so should be halfway between 10 and 30 minutes = 20 minutes
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 3 });

      const result = await hotWindowManager.calculateHotWindow('kiosk-1');

      expect(result).toEqual({
        duration: 20,
        disabled: false,
        freeRatio: 0.3
      });
    });

    it('should handle edge case at exactly 0.1 free ratio', async () => {
      // Mock free ratio calculation (1 free, 10 total = 0.1 ratio)
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 1 });

      const result = await hotWindowManager.calculateHotWindow('kiosk-1');

      expect(result).toEqual({
        duration: 0,
        disabled: true,
        freeRatio: 0.1
      });
    });

    it('should handle edge case at exactly 0.5 free ratio', async () => {
      // Mock free ratio calculation (5 free, 10 total = 0.5 ratio)
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 5 });

      const result = await hotWindowManager.calculateHotWindow('kiosk-1');

      expect(result).toEqual({
        duration: 30,
        disabled: false,
        freeRatio: 0.5
      });
    });

    it('should handle zero total lockers', async () => {
      // Mock free ratio calculation (0 free, 0 total = 0.0 ratio)
      vi.mocked(mockDb.get).mockResolvedValue({ total: 0, free: 0 });

      const result = await hotWindowManager.calculateHotWindow('kiosk-1');

      expect(result).toEqual({
        duration: 0,
        disabled: true,
        freeRatio: 0.0
      });
    });

    it('should use custom configuration values', async () => {
      // Mock custom config
      vi.mocked(mockConfigManager.getEffectiveConfig).mockResolvedValue({
        owner_hot_window_min: 5,
        owner_hot_window_max: 45,
        free_ratio_low: 0.2,
        free_ratio_high: 0.6
      } as any);

      // Mock free ratio calculation (4 free, 10 total = 0.4 ratio)
      // 0.4 is halfway between 0.2 and 0.6, so should be halfway between 5 and 45 minutes = 25 minutes
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 4 });

      const result = await hotWindowManager.calculateHotWindow('kiosk-1');

      expect(result).toEqual({
        duration: 25,
        disabled: false,
        freeRatio: 0.4
      });
    });
  });

  describe('applyHotWindow', () => {
    it('should apply hot window when not disabled', async () => {
      // Mock free ratio calculation (3 free, 10 total = 0.3 ratio → 20 minutes)
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 3 });
      vi.mocked(mockDb.run).mockResolvedValue({ changes: 1 } as any);

      const result = await hotWindowManager.applyHotWindow('kiosk-1', 5, 'card123');

      expect(result).toBeTruthy();
      expect(result?.lockerId).toBe(5);
      expect(result?.cardId).toBe('card123');
      expect(result?.duration).toBe(20);
      expect(result?.expiresAt).toBeInstanceOf(Date);

      // Verify database update
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lockers SET owner_hot_until = ?'),
        expect.arrayContaining([expect.any(String), 'card123', 'kiosk-1', 5])
      );
    });

    it('should not apply hot window when disabled', async () => {
      // Mock free ratio calculation (0 free, 10 total = 0.0 ratio → disabled)
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 0 });

      const result = await hotWindowManager.applyHotWindow('kiosk-1', 5, 'card123');

      expect(result).toBeNull();
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    it('should return null if database update fails', async () => {
      // Mock free ratio calculation (3 free, 10 total = 0.3 ratio → 20 minutes)
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 3 });
      vi.mocked(mockDb.run).mockResolvedValue({ changes: 0 } as any);

      const result = await hotWindowManager.applyHotWindow('kiosk-1', 5, 'card123');

      expect(result).toBeNull();
    });
  });

  describe('isInHotWindow', () => {
    it('should return true when locker is in hot window', async () => {
      const futureTime = new Date();
      futureTime.setMinutes(futureTime.getMinutes() + 10);

      vi.mocked(mockDb.get).mockResolvedValue({
        owner_hot_until: futureTime.toISOString()
      });

      const result = await hotWindowManager.isInHotWindow('kiosk-1', 5);

      expect(result).toBe(true);
    });

    it('should return false when hot window has expired', async () => {
      const pastTime = new Date();
      pastTime.setMinutes(pastTime.getMinutes() - 10);

      vi.mocked(mockDb.get).mockResolvedValue({
        owner_hot_until: pastTime.toISOString()
      });

      const result = await hotWindowManager.isInHotWindow('kiosk-1', 5);

      expect(result).toBe(false);
    });

    it('should return false when no hot window is set', async () => {
      vi.mocked(mockDb.get).mockResolvedValue({
        owner_hot_until: null
      });

      const result = await hotWindowManager.isInHotWindow('kiosk-1', 5);

      expect(result).toBe(false);
    });

    it('should return false when locker not found', async () => {
      vi.mocked(mockDb.get).mockResolvedValue(null);

      const result = await hotWindowManager.isInHotWindow('kiosk-1', 5);

      expect(result).toBe(false);
    });
  });

  describe('canBypassHotWindow', () => {
    it('should allow original owner to bypass hot window', async () => {
      const futureTime = new Date();
      futureTime.setMinutes(futureTime.getMinutes() + 10);

      vi.mocked(mockDb.get).mockResolvedValue({
        recent_owner: 'card123',
        owner_hot_until: futureTime.toISOString()
      });

      const result = await hotWindowManager.canBypassHotWindow('kiosk-1', 5, 'card123');

      expect(result).toBe(true);
    });

    it('should not allow different card to bypass hot window', async () => {
      const futureTime = new Date();
      futureTime.setMinutes(futureTime.getMinutes() + 10);

      vi.mocked(mockDb.get).mockResolvedValue({
        recent_owner: 'card123',
        owner_hot_until: futureTime.toISOString()
      });

      const result = await hotWindowManager.canBypassHotWindow('kiosk-1', 5, 'card456');

      expect(result).toBe(false);
    });

    it('should return false when hot window has expired', async () => {
      const pastTime = new Date();
      pastTime.setMinutes(pastTime.getMinutes() - 10);

      vi.mocked(mockDb.get).mockResolvedValue({
        recent_owner: 'card123',
        owner_hot_until: pastTime.toISOString()
      });

      const result = await hotWindowManager.canBypassHotWindow('kiosk-1', 5, 'card123');

      expect(result).toBe(false);
    });

    it('should return false when no hot window is set', async () => {
      vi.mocked(mockDb.get).mockResolvedValue({
        recent_owner: 'card123',
        owner_hot_until: null
      });

      const result = await hotWindowManager.canBypassHotWindow('kiosk-1', 5, 'card123');

      expect(result).toBe(false);
    });
  });

  describe('clearExpiredHotWindows', () => {
    it('should clear expired hot windows and return count', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ changes: 3 } as any);

      const result = await hotWindowManager.clearExpiredHotWindows('kiosk-1');

      expect(result).toBe(3);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lockers SET owner_hot_until = NULL'),
        ['kiosk-1']
      );
    });

    it('should return 0 when no expired hot windows', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ changes: 0 } as any);

      const result = await hotWindowManager.clearExpiredHotWindows('kiosk-1');

      expect(result).toBe(0);
    });
  });

  describe('getHotWindowLockers', () => {
    it('should return active hot window lockers with remaining time', async () => {
      const futureTime1 = new Date();
      futureTime1.setMinutes(futureTime1.getMinutes() + 15);
      
      const futureTime2 = new Date();
      futureTime2.setMinutes(futureTime2.getMinutes() + 25);

      vi.mocked(mockDb.all).mockResolvedValue([
        {
          id: 5,
          recent_owner: 'card123',
          owner_hot_until: futureTime1.toISOString()
        },
        {
          id: 8,
          recent_owner: 'card456',
          owner_hot_until: futureTime2.toISOString()
        }
      ]);

      const result = await hotWindowManager.getHotWindowLockers('kiosk-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        lockerId: 5,
        cardId: 'card123',
        expiresAt: futureTime1,
        remainingMinutes: 15
      });
      expect(result[1]).toEqual({
        lockerId: 8,
        cardId: 'card456',
        expiresAt: futureTime2,
        remainingMinutes: 25
      });
    });

    it('should return empty array when no active hot windows', async () => {
      vi.mocked(mockDb.all).mockResolvedValue([]);

      const result = await hotWindowManager.getHotWindowLockers('kiosk-1');

      expect(result).toEqual([]);
    });
  });

  describe('getStatus', () => {
    it('should return comprehensive status information', async () => {
      // Mock free ratio calculation (3 free, 10 total = 0.3 ratio → 20 minutes)
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 3 });
      
      // Mock active hot windows
      const futureTime = new Date();
      futureTime.setMinutes(futureTime.getMinutes() + 15);
      
      vi.mocked(mockDb.all).mockResolvedValue([
        {
          id: 5,
          recent_owner: 'card123',
          owner_hot_until: futureTime.toISOString()
        }
      ]);

      const result = await hotWindowManager.getStatus('kiosk-1');

      expect(result).toEqual({
        activeHotWindows: 1,
        freeRatio: 0.3,
        currentDuration: 20,
        disabled: false
      });
    });
  });

  describe('logging requirements', () => {
    it('should log hot window calculation with correct format', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Mock free ratio calculation (3 free, 10 total = 0.3 ratio → 20 minutes)
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 3 });

      await hotWindowManager.calculateHotWindow('kiosk-1');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Hot window: duration=20, disabled=false.'
      );

      consoleSpy.mockRestore();
    });

    it('should log disabled hot window with correct format', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Mock free ratio calculation (0 free, 10 total = 0.0 ratio → disabled)
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 0 });

      await hotWindowManager.calculateHotWindow('kiosk-1');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Hot window: duration=0, disabled=true.'
      );

      consoleSpy.mockRestore();
    });

    it('should log hot window application with correct format', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Mock free ratio calculation (3 free, 10 total = 0.3 ratio → 20 minutes)
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 3 });
      vi.mocked(mockDb.run).mockResolvedValue({ changes: 1 } as any);

      await hotWindowManager.applyHotWindow('kiosk-1', 5, 'card123');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Hot window applied: locker=5, duration=20min.'
      );

      consoleSpy.mockRestore();
    });

    it('should clamp free ratio to [0,1] range', async () => {
      // Test negative ratio
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: -2 });
      
      const result1 = await hotWindowManager.calculateHotWindow('kiosk-1');
      expect(result1.freeRatio).toBe(0);
      expect(result1.disabled).toBe(true);

      // Test ratio > 1
      vi.mocked(mockDb.get).mockResolvedValue({ total: 10, free: 15 });
      
      const result2 = await hotWindowManager.calculateHotWindow('kiosk-1');
      expect(result2.freeRatio).toBe(1);
      expect(result2.duration).toBe(30);
    });
  });
});