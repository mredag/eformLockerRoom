import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigurationSeeder, ConfigSeedData, SeedingResult } from '../configuration-seeder';
import { DatabaseConnection } from '../../database/connection';

// Mock database connection
const mockDb = {
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
} as any;

describe('ConfigurationSeeder', () => {
  let seeder: ConfigurationSeeder;

  beforeEach(() => {
    vi.clearAllMocks();
    seeder = new ConfigurationSeeder(mockDb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isConfigurationSeeded', () => {
    it('should return true when configuration exists', async () => {
      mockDb.get.mockResolvedValue({ count: 5 });

      const result = await seeder.isConfigurationSeeded();

      expect(result).toBe(true);
      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM settings_global'
      );
    });

    it('should return false when no configuration exists', async () => {
      mockDb.get.mockResolvedValue({ count: 0 });

      const result = await seeder.isConfigurationSeeded();

      expect(result).toBe(false);
    });

    it('should return false when database returns null', async () => {
      mockDb.get.mockResolvedValue(null);

      const result = await seeder.isConfigurationSeeded();

      expect(result).toBe(false);
    });
  });

  describe('seedDefaultConfiguration', () => {
    it('should skip seeding if already seeded and not forced', async () => {
      mockDb.get.mockResolvedValue({ count: 5 }); // Already seeded

      const result = await seeder.seedDefaultConfiguration(false);

      expect(result).toEqual({
        seeded: 0,
        skipped: 0,
        errors: [],
        totalKeys: 0
      });
    });

    it('should seed configuration on first boot', async () => {
      // Mock not seeded
      mockDb.get
        .mockResolvedValueOnce({ count: 0 }) // isConfigurationSeeded
        .mockResolvedValue(null); // No existing keys
      
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await seeder.seedDefaultConfiguration(false);

      expect(result.seeded).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO settings_global'),
        expect.arrayContaining(['smart_assignment_enabled', 'false', 'boolean'])
      );
    });

    it('should seed critical session_limit_minutes=180', async () => {
      mockDb.get
        .mockResolvedValueOnce({ count: 0 }) // isConfigurationSeeded
        .mockResolvedValue(null); // No existing keys
      
      mockDb.run.mockResolvedValue({ changes: 1 });

      await seeder.seedDefaultConfiguration(false);

      // Verify session_limit_minutes is seeded with 180
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO settings_global'),
        expect.arrayContaining(['session_limit_minutes', '180', 'number'])
      );
    });

    it('should seed smart_assignment_enabled=false by default', async () => {
      mockDb.get
        .mockResolvedValueOnce({ count: 0 }) // isConfigurationSeeded
        .mockResolvedValue(null); // No existing keys
      
      mockDb.run.mockResolvedValue({ changes: 1 });

      await seeder.seedDefaultConfiguration(false);

      // Verify smart assignment is disabled by default
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO settings_global'),
        expect.arrayContaining(['smart_assignment_enabled', 'false', 'boolean'])
      );
    });

    it('should skip existing keys when not forced', async () => {
      mockDb.get
        .mockResolvedValueOnce({ count: 0 }) // isConfigurationSeeded
        .mockResolvedValueOnce({ key: 'smart_assignment_enabled' }) // Existing key
        .mockResolvedValue(null); // Other keys don't exist
      
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await seeder.seedDefaultConfiguration(false);

      expect(result.skipped).toBeGreaterThan(0);
    });

    it('should force seed all keys when forced=true', async () => {
      mockDb.get.mockResolvedValue(null); // No existing keys check
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await seeder.seedDefaultConfiguration(true);

      expect(result.seeded).toBeGreaterThan(0);
      expect(result.skipped).toBe(0);
    });

    it('should handle validation errors gracefully', async () => {
      mockDb.get.mockResolvedValue({ count: 0 });
      mockDb.run.mockRejectedValue(new Error('Database error'));

      const result = await seeder.seedDefaultConfiguration(false);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should initialize config version', async () => {
      mockDb.get.mockResolvedValue({ count: 0 });
      mockDb.run.mockResolvedValue({ changes: 1 });

      await seeder.seedDefaultConfiguration(false);

      expect(mockDb.run).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO config_version (id, version, updated_at) VALUES (1, 1, CURRENT_TIMESTAMP)'
      );
    });
  });

  describe('validation', () => {
    it('should validate boolean values correctly', async () => {
      mockDb.get.mockResolvedValue({ count: 0 });
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await seeder.seedDefaultConfiguration(false);

      // Should not have validation errors for boolean values
      const booleanErrors = result.errors.filter(error => 
        error.includes('smart_assignment_enabled') && error.includes('boolean')
      );
      expect(booleanErrors).toHaveLength(0);
    });

    it('should validate number ranges correctly', async () => {
      mockDb.get.mockResolvedValue({ count: 0 });
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await seeder.seedDefaultConfiguration(false);

      // Should not have validation errors for number ranges
      const rangeErrors = result.errors.filter(error => 
        error.includes('reserve_ratio') || error.includes('business rules')
      );
      expect(rangeErrors).toHaveLength(0);
    });

    it('should validate session limit is positive', async () => {
      mockDb.get.mockResolvedValue({ count: 0 });
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await seeder.seedDefaultConfiguration(false);

      // Should not have validation errors for session limit
      const sessionErrors = result.errors.filter(error => 
        error.includes('session_limit_minutes')
      );
      expect(sessionErrors).toHaveLength(0);
    });
  });

  describe('getSeedingStatus', () => {
    it('should return correct seeding status', async () => {
      mockDb.get
        .mockResolvedValueOnce({ count: 5 }) // isSeeded check
        .mockResolvedValueOnce({ count: 42 }) // total keys
        .mockResolvedValueOnce({ version: 3, updated_at: '2025-01-09T10:00:00Z' }) // version
        .mockResolvedValueOnce({ updated_at: '2025-01-09T09:00:00Z' }); // last seeded

      const status = await seeder.getSeedingStatus();

      expect(status).toEqual({
        isSeeded: true,
        totalKeys: 42,
        lastSeeded: new Date('2025-01-09T09:00:00Z'),
        version: 3
      });
    });

    it('should handle missing data gracefully', async () => {
      mockDb.get.mockResolvedValue(null);

      const status = await seeder.getSeedingStatus();

      expect(status).toEqual({
        isSeeded: false,
        totalKeys: 0,
        lastSeeded: undefined,
        version: 0
      });
    });
  });

  describe('resetToDefaults', () => {
    it('should clear existing config and re-seed', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue(null); // No existing keys after clear

      const result = await seeder.resetToDefaults();

      expect(mockDb.run).toHaveBeenCalledWith('DELETE FROM settings_global');
      expect(mockDb.run).toHaveBeenCalledWith('DELETE FROM settings_kiosk');
      expect(mockDb.run).toHaveBeenCalledWith(
        'UPDATE config_version SET version = version + 1 WHERE id = 1'
      );
      expect(result.seeded).toBeGreaterThan(0);
    });
  });

  describe('initialize', () => {
    it('should seed on first boot', async () => {
      mockDb.get
        .mockResolvedValueOnce({ count: 0 }) // Not seeded
        .mockResolvedValueOnce({ count: 0 }) // Total keys
        .mockResolvedValue(null); // Other queries

      mockDb.run.mockResolvedValue({ changes: 1 });

      await seeder.initialize();

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO settings_global'),
        expect.any(Array)
      );
    });

    it('should skip seeding if already initialized', async () => {
      mockDb.get
        .mockResolvedValueOnce({ count: 5 }) // Already seeded
        .mockResolvedValueOnce({ count: 42 }) // Total keys
        .mockResolvedValue({ version: 1 }); // Version info

      await seeder.initialize();

      // Should not call INSERT for seeding
      expect(mockDb.run).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO settings_global'),
        expect.any(Array)
      );
    });
  });

  describe('critical configuration verification', () => {
    it('should verify session_limit_minutes=180', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      mockDb.get
        .mockResolvedValueOnce({ count: 0 }) // Not seeded
        .mockResolvedValue({ value: '180', data_type: 'number' }); // Critical config verification
      
      mockDb.run.mockResolvedValue({ changes: 1 });

      await seeder.seedDefaultConfiguration(false);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Critical config verified: session_limit_minutes = 180')
      );
      
      consoleSpy.mockRestore();
    });

    it('should verify smart_assignment_enabled=false', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      mockDb.get
        .mockResolvedValueOnce({ count: 0 }) // Not seeded
        .mockResolvedValue({ value: 'false', data_type: 'boolean' }); // Critical config verification
      
      mockDb.run.mockResolvedValue({ changes: 1 });

      await seeder.seedDefaultConfiguration(false);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Critical config verified: smart_assignment_enabled = false')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('logging requirements', () => {
    it('should log "Configuration seeded: N keys" message', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      mockDb.get.mockResolvedValue({ count: 0 });
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await seeder.seedDefaultConfiguration(false);

      expect(consoleSpy).toHaveBeenCalledWith(
        `📊 Configuration seeded: ${result.seeded} keys`
      );
      
      consoleSpy.mockRestore();
    });
  });
});