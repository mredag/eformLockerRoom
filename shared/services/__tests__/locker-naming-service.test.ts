import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LockerNamingService, ValidationResult } from '../locker-naming-service';
import { DatabaseConnection } from '../../database/connection';
import { LockerRepository } from '../../database/locker-repository';
import { Locker, LockerStatus } from '../../types/core-entities';

describe('LockerNamingService', () => {
  let db: DatabaseConnection;
  let lockerRepository: LockerRepository;
  let namingService: LockerNamingService;
  let testKioskId: string;

  beforeEach(async () => {
    // Create in-memory database for testing
    db = DatabaseConnection.getInstance(':memory:');
    await db.waitForInitialization();
    
    // Create tables
    await db.run(`
      CREATE TABLE lockers (
        id INTEGER,
        kiosk_id TEXT,
        status TEXT DEFAULT 'Free',
        owner_type TEXT,
        owner_key TEXT,
        reserved_at DATETIME,
        owned_at DATETIME,
        version INTEGER DEFAULT 1,
        is_vip INTEGER DEFAULT 0,
        display_name VARCHAR(20),
        name_updated_at DATETIME,
        name_updated_by VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kiosk_id, id)
      )
    `);

    await db.run(`
      CREATE TABLE locker_name_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kiosk_id TEXT NOT NULL,
        locker_id INTEGER NOT NULL,
        old_name VARCHAR(20),
        new_name VARCHAR(20),
        changed_by VARCHAR(50) NOT NULL,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create triggers for audit logging
    await db.run(`
      CREATE TRIGGER log_locker_name_changes 
        AFTER UPDATE OF display_name ON lockers
        FOR EACH ROW
        WHEN (NEW.display_name != OLD.display_name OR (NEW.display_name IS NOT NULL AND OLD.display_name IS NULL) OR (NEW.display_name IS NULL AND OLD.display_name IS NOT NULL))
          AND NEW.name_updated_by IS NOT NULL
        BEGIN
          INSERT INTO locker_name_audit (kiosk_id, locker_id, old_name, new_name, changed_by)
          VALUES (NEW.kiosk_id, NEW.id, OLD.display_name, NEW.display_name, NEW.name_updated_by);
        END
    `);

    lockerRepository = new LockerRepository(db);
    namingService = new LockerNamingService(db);
    testKioskId = 'test-kiosk-1';

    // Create test lockers
    await createTestLocker(1);
    await createTestLocker(2);
    await createTestLocker(3);
  });

  afterEach(async () => {
    await db.close();
    DatabaseConnection.resetInstance(':memory:');
  });

  async function createTestLocker(lockerId: number): Promise<Locker> {
    return await lockerRepository.create({
      id: lockerId,
      kiosk_id: testKioskId,
      status: 'Free' as LockerStatus,
      is_vip: false
    });
  }

  describe('Name Validation', () => {
    it('should validate valid Turkish names', () => {
      const validNames = [
        'Kapı A1',
        'Dolap 101',
        'Oda 1',
        'Büro A',
        'Giriş Sol',
        'Çıkış Sağ',
        'Güvenlik',
        'İdari Büro',
        'Öğrenci Odası',
        'Şef Masası',
        'Ü-Blok',
        'A-1.2'
      ];

      for (const name of validNames) {
        const result = namingService.validateName(name);
        expect(result.isValid, `"${name}" should be valid`).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });

    it('should reject names with invalid characters', () => {
      const invalidNames = [
        'Room@123',     // @ symbol
        'Kapı#1',       // # symbol
        'Oda$5',        // $ symbol
        'Test&Name',    // & symbol
        'Room*1',       // * symbol
        'Kapı+A1',      // + symbol
        'Test=Name',    // = symbol
        'Room[1]',      // brackets
        'Test{Name}',   // braces
        'Room|1',       // pipe
        'Test\\Name',   // backslash
        'Room/1',       // forward slash
        'Test<Name>',   // angle brackets
        'Room?1',       // question mark
        'Test!Name',    // exclamation
        'Room%1',       // percent
        'Test^Name',    // caret
        'Room~1'        // tilde
      ];

      for (const name of invalidNames) {
        const result = namingService.validateName(name);
        expect(result.isValid, `"${name}" should be invalid`).toBe(false);
        expect(result.errors).toContain('Name contains invalid characters. Only Turkish letters, numbers, spaces, hyphens, and dots are allowed');
      }
    });

    it('should reject names exceeding 20 characters', () => {
      const longName = 'Bu çok uzun bir dolap ismi';
      const result = namingService.validateName(longName);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(`Name must be 20 characters or less (current: ${longName.length})`);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions![0]).toContain(longName.substring(0, 20));
    });

    it('should reject empty or whitespace-only names', () => {
      const emptyNames = ['', '   ', '\t', '\n'];

      for (const name of emptyNames) {
        const result = namingService.validateName(name);
        expect(result.isValid, `"${name}" should be invalid`).toBe(false);
        expect(result.errors).toContain('Name cannot be empty');
      }
    });

    it('should reject null or non-string values', () => {
      const invalidValues = [null, undefined, 123, {}, []];

      for (const value of invalidValues) {
        const result = namingService.validateName(value as any);
        expect(result.isValid, `${value} should be invalid`).toBe(false);
        expect(result.errors).toContain('Name is required and must be a string');
      }
    });

    it('should provide suggestions for names with extra spaces', () => {
      const nameWithSpaces = 'Kapı  A1   Test';
      const result = namingService.validateName(nameWithSpaces);
      
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions![0]).toContain('Kapı A1 Test');
    });

    it('should provide suggestions for names with invalid characters', () => {
      const nameWithInvalidChars = 'Kapı@A1#Test';
      const result = namingService.validateName(nameWithInvalidChars);
      
      expect(result.isValid).toBe(false);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions![0]).toContain('KapıA1Test');
    });
  });

  describe('Turkish Character Support', () => {
    it('should support all Turkish characters', () => {
      const turkishChars = [
        'ç', 'Ç', 'ğ', 'Ğ', 'ı', 'İ', 
        'ö', 'Ö', 'ş', 'Ş', 'ü', 'Ü'
      ];

      for (const char of turkishChars) {
        const testName = `Test${char}Name`;
        const result = namingService.validateName(testName);
        expect(result.isValid, `Name with "${char}" should be valid`).toBe(true);
      }
    });

    it('should handle mixed Turkish and English characters', () => {
      const mixedNames = [
        'Türkçe Room 1',
        'English Oda 2',
        'Mixed Büro A1',
        'Test Güvenlik 123'
      ];

      for (const name of mixedNames) {
        const result = namingService.validateName(name);
        expect(result.isValid, `"${name}" should be valid`).toBe(true);
      }
    });
  });

  describe('Display Name Management', () => {
    it('should set and get display names', async () => {
      const testName = 'Kapı A1';
      
      await namingService.setDisplayName(testKioskId, 1, testName, 'test-user');
      const retrievedName = await namingService.getDisplayName(testKioskId, 1);
      
      expect(retrievedName).toBe(testName);
    });

    it('should return default name when no custom name is set', async () => {
      const defaultName = await namingService.getDisplayName(testKioskId, 1);
      expect(defaultName).toBe('Dolap 1');
    });

    it('should trim whitespace from names', async () => {
      const nameWithSpaces = '  Kapı A1  ';
      
      await namingService.setDisplayName(testKioskId, 1, nameWithSpaces, 'test-user');
      const retrievedName = await namingService.getDisplayName(testKioskId, 1);
      
      expect(retrievedName).toBe('Kapı A1');
    });

    it('should enforce name uniqueness within kiosk', async () => {
      const testName = 'Kapı A1';
      
      // Set name for first locker
      await namingService.setDisplayName(testKioskId, 1, testName, 'test-user');
      
      // Try to set same name for second locker - should fail
      await expect(
        namingService.setDisplayName(testKioskId, 2, testName, 'test-user')
      ).rejects.toThrow('Display name "Kapı A1" is already used by locker 1 in this kiosk');
    });

    it('should allow updating existing name to same value', async () => {
      const testName = 'Kapı A1';
      
      await namingService.setDisplayName(testKioskId, 1, testName, 'test-user');
      
      // Should not throw error when setting same name again
      await expect(
        namingService.setDisplayName(testKioskId, 1, testName, 'test-user-2')
      ).resolves.not.toThrow();
    });

    it('should reject invalid names', async () => {
      await expect(
        namingService.setDisplayName(testKioskId, 1, 'Invalid@Name', 'test-user')
      ).rejects.toThrow('Invalid locker name');
    });

    it('should handle non-existent locker', async () => {
      await expect(
        namingService.setDisplayName(testKioskId, 999, 'Test Name', 'test-user')
      ).rejects.toThrow('Locker 999 not found in kiosk test-kiosk-1');

      await expect(
        namingService.getDisplayName(testKioskId, 999)
      ).rejects.toThrow('Locker 999 not found in kiosk test-kiosk-1');
    });
  });

  describe('Preset Generation', () => {
    it('should generate Turkish preset names', () => {
      const presets = namingService.generatePresets();
      
      expect(presets).toBeInstanceOf(Array);
      expect(presets.length).toBeGreaterThan(0);
      
      // Check for required examples from requirements
      expect(presets).toContain('Kapı A1');
      expect(presets).toContain('Dolap 101');
      
      // Check that all presets are valid
      for (const preset of presets) {
        const validation = namingService.validateName(preset);
        expect(validation.isValid, `Preset "${preset}" should be valid`).toBe(true);
      }
    });

    it('should include variety of Turkish naming patterns', () => {
      const presets = namingService.generatePresets();
      
      // Should include different patterns
      const hasKapi = presets.some(p => p.includes('Kapı'));
      const hasDolap = presets.some(p => p.includes('Dolap'));
      const hasOda = presets.some(p => p.includes('Oda'));
      const hasBuro = presets.some(p => p.includes('Büro'));
      
      expect(hasKapi).toBe(true);
      expect(hasDolap).toBe(true);
      expect(hasOda).toBe(true);
      expect(hasBuro).toBe(true);
    });
  });

  describe('Audit Logging', () => {
    it('should log name changes in audit table', async () => {
      const testName = 'Kapı A1';
      const updatedName = 'Kapı B1';
      
      // Set initial name
      await namingService.setDisplayName(testKioskId, 1, testName, 'user1');
      
      // Update name
      await namingService.setDisplayName(testKioskId, 1, updatedName, 'user2');
      
      // Check audit history
      const auditHistory = await namingService.getNameAuditHistory(testKioskId, 1);
      
      // At minimum, we should have some audit entries
      expect(auditHistory.length).toBeGreaterThanOrEqual(1);
      
      // Find the entry with the updated name (should be the most recent)
      const updateEntry = auditHistory.find(entry => entry.new_name === updatedName);
      expect(updateEntry).toBeDefined();
      expect(updateEntry!.locker_id).toBe(1);
      expect(updateEntry!.kiosk_id).toBe(testKioskId);
      expect(updateEntry!.changed_by).toBe('user2');
      expect(updateEntry!.changed_at).toBeInstanceOf(Date);
      
      // Also check that we have an entry for the initial name
      const initialEntry = auditHistory.find(entry => entry.new_name === testName);
      expect(initialEntry).toBeDefined();
      expect(initialEntry!.changed_by).toBe('user1');
    });

    it('should get audit history for all lockers in kiosk', async () => {
      await namingService.setDisplayName(testKioskId, 1, 'Kapı A1', 'user1');
      await namingService.setDisplayName(testKioskId, 2, 'Kapı A2', 'user1');
      
      const auditHistory = await namingService.getNameAuditHistory(testKioskId);
      
      expect(auditHistory).toHaveLength(2);
      expect(auditHistory.some(h => h.locker_id === 1)).toBe(true);
      expect(auditHistory.some(h => h.locker_id === 2)).toBe(true);
    });
  });

  describe('Bulk Operations', () => {
    it('should bulk update locker names', async () => {
      const nameMapping = {
        1: 'Kapı A1',
        2: 'Kapı A2',
        3: 'Kapı A3'
      };
      
      const result = await namingService.bulkUpdateNames(testKioskId, nameMapping, 'admin');
      
      expect(result.success).toBe(3);
      expect(result.failed).toHaveLength(0);
      
      // Verify names were set
      expect(await namingService.getDisplayName(testKioskId, 1)).toBe('Kapı A1');
      expect(await namingService.getDisplayName(testKioskId, 2)).toBe('Kapı A2');
      expect(await namingService.getDisplayName(testKioskId, 3)).toBe('Kapı A3');
    });

    it('should handle partial failures in bulk update', async () => {
      const nameMapping = {
        1: 'Kapı A1',
        2: 'Invalid@Name',  // This should fail
        3: 'Kapı A3'
      };
      
      const result = await namingService.bulkUpdateNames(testKioskId, nameMapping, 'admin');
      
      expect(result.success).toBe(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].lockerId).toBe(2);
      expect(result.failed[0].error).toContain('Invalid locker name');
    });

    it('should clear display names', async () => {
      // Set a name first
      await namingService.setDisplayName(testKioskId, 1, 'Kapı A1', 'user1');
      expect(await namingService.getDisplayName(testKioskId, 1)).toBe('Kapı A1');
      
      // Clear the name
      await namingService.clearDisplayName(testKioskId, 1, 'user2');
      expect(await namingService.getDisplayName(testKioskId, 1)).toBe('Dolap 1');
    });
  });

  describe('Printable Map Export', () => {
    it('should export printable map with locker information', async () => {
      // Set some custom names
      await namingService.setDisplayName(testKioskId, 1, 'Kapı A1', 'admin');
      await namingService.setDisplayName(testKioskId, 2, 'Kapı A2', 'admin');
      // Leave locker 3 with default name
      
      const map = await namingService.exportPrintableMap(testKioskId);
      
      expect(map.kiosk_id).toBe(testKioskId);
      expect(map.generated_at).toBeInstanceOf(Date);
      expect(map.lockers).toHaveLength(3);
      
      // Check custom names
      const locker1 = map.lockers.find(l => l.id === 1);
      expect(locker1?.display_name).toBe('Kapı A1');
      
      const locker2 = map.lockers.find(l => l.id === 2);
      expect(locker2?.display_name).toBe('Kapı A2');
      
      // Check default name
      const locker3 = map.lockers.find(l => l.id === 3);
      expect(locker3?.display_name).toBe('Dolap 3');
      
      // Check grid positions are calculated
      expect(locker1?.position).toBeDefined();
      expect(locker1?.position?.row).toBe(1);
      expect(locker1?.position?.col).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle case-insensitive uniqueness check', async () => {
      await namingService.setDisplayName(testKioskId, 1, 'Room A1', 'user1');
      
      // Try to set same name with different case - should fail
      await expect(
        namingService.setDisplayName(testKioskId, 2, 'ROOM A1', 'user2')
      ).rejects.toThrow('Display name "ROOM A1" is already used by locker 1 in this kiosk');
    });

    it('should handle names with only whitespace differences', async () => {
      await namingService.setDisplayName(testKioskId, 1, 'Kapı A1', 'user1');
      
      // Try to set same name with extra spaces - should fail
      await expect(
        namingService.setDisplayName(testKioskId, 2, '  Kapı A1  ', 'user2')
      ).rejects.toThrow('Display name "  Kapı A1  " is already used by locker 1 in this kiosk');
    });

    it('should handle maximum length names', async () => {
      const maxLengthName = 'A'.repeat(20); // Exactly 20 characters
      
      await expect(
        namingService.setDisplayName(testKioskId, 1, maxLengthName, 'user1')
      ).resolves.not.toThrow();
      
      expect(await namingService.getDisplayName(testKioskId, 1)).toBe(maxLengthName);
    });
  });
});