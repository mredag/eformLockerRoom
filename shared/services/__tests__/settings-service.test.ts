import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsService } from '../settings-service';
import { DatabaseManager } from '../../database/database-manager';
import * as argon2 from 'argon2';

// Mock argon2
vi.mock('argon2', () => ({
  hash: vi.fn(),
  verify: vi.fn()
}));

describe('SettingsService', () => {
  let settingsService: SettingsService;
  let mockDb: any;

  beforeEach(() => {
    // Mock database connection methods
    mockDb = {
      all: vi.fn(),
      get: vi.fn(),
      run: vi.fn()
    };

    // Mock DatabaseManager
    vi.spyOn(DatabaseManager, 'getInstance').mockReturnValue({
      getConnection: () => ({
        all: mockDb.all || vi.fn(),
        get: mockDb.get || vi.fn(),
        run: mockDb.run || vi.fn()
      })
    } as any);

    settingsService = new SettingsService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getSecuritySettings', () => {
    it('should return default settings when no settings exist', async () => {
      mockDb.all.mockResolvedValue([]);

      const settings = await settingsService.getSecuritySettings();

      expect(settings).toEqual({
        lockout_attempts: 5,
        lockout_minutes: 5
      });
    });

    it('should return stored settings', async () => {
      mockDb.all.mockResolvedValue([
        { setting_key: 'lockout_attempts', setting_value: '3' },
        { setting_key: 'lockout_minutes', setting_value: '10' }
      ]);

      const settings = await settingsService.getSecuritySettings();

      expect(settings).toEqual({
        lockout_attempts: 3,
        lockout_minutes: 10
      });
    });
  });

  describe('updateSecuritySettings', () => {
    it('should update security settings', async () => {
      const mockStmt = {
        run: vi.fn()
      };
      const mockTransaction = vi.fn();
      
      mockDb.prepare.mockReturnValue(mockStmt);
      mockDb.transaction.mockReturnValue(mockTransaction);

      await settingsService.updateSecuritySettings({
        lockout_attempts: 3,
        lockout_minutes: 10
      });

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE'));
      expect(mockTransaction).toHaveBeenCalled();
    });
  });

  describe('verifyMasterPin', () => {
    it('should use default PIN when no hash is stored', async () => {
      const mockStmt = {
        get: vi.fn().mockReturnValue(undefined)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = await settingsService.verifyMasterPin('1234');
      expect(result).toBe(true);

      const result2 = await settingsService.verifyMasterPin('9999');
      expect(result2).toBe(false);
    });

    it('should verify against stored hash', async () => {
      const mockStmt = {
        get: vi.fn().mockReturnValue({ setting_value: 'hashed_pin' })
      };
      mockDb.prepare.mockReturnValue(mockStmt);
      vi.mocked(argon2.verify).mockResolvedValue(true);

      const result = await settingsService.verifyMasterPin('1234');

      expect(result).toBe(true);
      expect(argon2.verify).toHaveBeenCalledWith('hashed_pin', '1234');
    });

    it('should handle verification errors', async () => {
      const mockStmt = {
        get: vi.fn().mockReturnValue({ setting_value: 'hashed_pin' })
      };
      mockDb.prepare.mockReturnValue(mockStmt);
      vi.mocked(argon2.verify).mockRejectedValue(new Error('Verification failed'));

      const result = await settingsService.verifyMasterPin('1234');

      expect(result).toBe(false);
    });
  });

  describe('changeMasterPin', () => {
    it('should hash and store new PIN', async () => {
      const mockStmt = {
        run: vi.fn()
      };
      mockDb.prepare.mockReturnValue(mockStmt);
      vi.mocked(argon2.hash).mockResolvedValue('new_hashed_pin');

      await settingsService.changeMasterPin('5678');

      expect(argon2.hash).toHaveBeenCalledWith('5678');
      expect(mockStmt.run).toHaveBeenCalledWith('new_hashed_pin');
    });
  });

  describe('recordPinAttempt', () => {
    it('should clear attempts on successful PIN', async () => {
      const mockClearStmt = {
        run: vi.fn()
      };
      mockDb.prepare.mockReturnValue(mockClearStmt);

      const isLocked = await settingsService.recordPinAttempt('kiosk-1', '192.168.1.1', true);

      expect(isLocked).toBe(false);
      expect(mockClearStmt.run).toHaveBeenCalledWith('kiosk-1', '192.168.1.1');
    });

    it('should increment attempts on failed PIN', async () => {
      const mockGetStmt = {
        get: vi.fn().mockReturnValue({ attempts: 2, lockout_end: null })
      };
      const mockUpdateStmt = {
        run: vi.fn()
      };
      
      mockDb.prepare
        .mockReturnValueOnce({ getSecuritySettings: vi.fn().mockResolvedValue({ lockout_attempts: 5, lockout_minutes: 5 }) })
        .mockReturnValueOnce(mockGetStmt)
        .mockReturnValueOnce(mockUpdateStmt);

      // Mock getSecuritySettings call
      settingsService.getSecuritySettings = vi.fn().mockResolvedValue({
        lockout_attempts: 5,
        lockout_minutes: 5
      });

      const isLocked = await settingsService.recordPinAttempt('kiosk-1', '192.168.1.1', false);

      expect(isLocked).toBe(false);
      expect(mockUpdateStmt.run).toHaveBeenCalledWith(
        'kiosk-1',
        '192.168.1.1',
        3, // attempts incremented
        null, // not locked yet
        expect.any(String)
      );
    });

    it('should lock after max attempts', async () => {
      const mockGetStmt = {
        get: vi.fn().mockReturnValue({ attempts: 4, lockout_end: null })
      };
      const mockUpdateStmt = {
        run: vi.fn()
      };
      
      mockDb.prepare
        .mockReturnValueOnce(mockGetStmt)
        .mockReturnValueOnce(mockUpdateStmt);

      settingsService.getSecuritySettings = vi.fn().mockResolvedValue({
        lockout_attempts: 5,
        lockout_minutes: 5
      });

      const isLocked = await settingsService.recordPinAttempt('kiosk-1', '192.168.1.1', false);

      expect(isLocked).toBe(true);
      expect(mockUpdateStmt.run).toHaveBeenCalledWith(
        'kiosk-1',
        '192.168.1.1',
        5, // max attempts reached
        expect.any(Number), // lockout end time
        expect.any(String)
      );
    });

    it('should return true if already locked', async () => {
      const futureTime = Date.now() + 300000; // 5 minutes in future
      const mockGetStmt = {
        get: vi.fn().mockReturnValue({ attempts: 5, lockout_end: futureTime })
      };
      
      mockDb.prepare.mockReturnValue(mockGetStmt);

      const isLocked = await settingsService.recordPinAttempt('kiosk-1', '192.168.1.1', false);

      expect(isLocked).toBe(true);
    });
  });

  describe('isLocked', () => {
    it('should return true if lockout is active', async () => {
      const futureTime = Date.now() + 300000;
      const mockStmt = {
        get: vi.fn().mockReturnValue({ lockout_end: futureTime })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const isLocked = await settingsService.isLocked('kiosk-1', '192.168.1.1');

      expect(isLocked).toBe(true);
    });

    it('should return false if no active lockout', async () => {
      const mockStmt = {
        get: vi.fn().mockReturnValue(undefined)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const isLocked = await settingsService.isLocked('kiosk-1', '192.168.1.1');

      expect(isLocked).toBe(false);
    });
  });

  describe('getRemainingLockoutTime', () => {
    it('should return remaining seconds', async () => {
      const futureTime = Date.now() + 120000; // 2 minutes
      const mockStmt = {
        get: vi.fn().mockReturnValue({ lockout_end: futureTime })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const remaining = await settingsService.getRemainingLockoutTime('kiosk-1', '192.168.1.1');

      expect(remaining).toBeGreaterThan(110);
      expect(remaining).toBeLessThanOrEqual(120);
    });

    it('should return 0 if no lockout', async () => {
      const mockStmt = {
        get: vi.fn().mockReturnValue(undefined)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const remaining = await settingsService.getRemainingLockoutTime('kiosk-1', '192.168.1.1');

      expect(remaining).toBe(0);
    });
  });

  describe('clearLockout', () => {
    it('should delete lockout record', async () => {
      const mockStmt = {
        run: vi.fn()
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      await settingsService.clearLockout('kiosk-1');

      expect(mockStmt.run).toHaveBeenCalledWith('kiosk-1');
    });
  });

  describe('getLockoutStatus', () => {
    it('should return lockout status for all kiosks', async () => {
      const now = Date.now();
      const mockStmt = {
        all: vi.fn().mockReturnValue([
          { kiosk_id: 'kiosk-1', attempts: 3, lockout_end: null },
          { kiosk_id: 'kiosk-2', attempts: 5, lockout_end: now + 300000 }
        ])
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const status = await settingsService.getLockoutStatus();

      expect(status).toHaveLength(2);
      expect(status[0]).toEqual({
        kiosk_id: 'kiosk-1',
        locked: false,
        lockout_end: undefined,
        attempts: 3
      });
      expect(status[1]).toEqual({
        kiosk_id: 'kiosk-2',
        locked: true,
        lockout_end: now + 300000,
        attempts: 5
      });
    });
  });
});