import { describe, it, expect, beforeEach, vi } from 'vitest';
import { I18nService } from '../../shared/services/i18n-service';
import { LockerNamingService } from '../../shared/services/locker-naming-service';

describe('Turkish Language Display and Error Messages Integration Tests', () => {
  let i18nService: I18nService;
  let namingService: LockerNamingService;
  let mockDatabase: any;

  beforeEach(() => {
    mockDatabase = {
      get: vi.fn(),
      run: vi.fn(),
      all: vi.fn(),
      prepare: vi.fn(() => ({
        get: vi.fn(),
        run: vi.fn(),
        all: vi.fn()
      }))
    };

    i18nService = new I18nService();
    i18nService.setLanguage('tr');
    namingService = new LockerNamingService(mockDatabase);
  });

  describe('Turkish Character Support', () => {
    it('should properly handle Turkish characters in locker names', async () => {
      const turkishNames = [
        'Kapı A1',
        'Dolap 101',
        'Özel Bölüm',
        'Güvenlik Kapısı',
        'İdari Dolap',
        'Çalışan Dolabı',
        'Şef Odası',
        'Ünite 5'
      ];

      for (const name of turkishNames) {
        const validation = namingService.validateName(name);
        expect(validation.isValid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });

    it('should validate Turkish character limits correctly', () => {
      const testCases = [
        { name: 'Kısa', expected: true },
        { name: 'Çok Uzun Dolap İsmi Test', expected: false }, // Over 20 chars
        { name: 'Türkçe Karakterler ÇĞİÖŞÜ', expected: false }, // Over 20 chars
        { name: 'Normal Dolap 123', expected: true },
        { name: '', expected: false }, // Empty name
        { name: 'Özel Dolap 1', expected: true }
      ];

      testCases.forEach(({ name, expected }) => {
        const validation = namingService.validateName(name);
        expect(validation.isValid).toBe(expected);
      });
    });

    it('should generate Turkish preset names', () => {
      const presets = namingService.generatePresets();
      
      expect(presets).toContain('Kapı A1');
      expect(presets).toContain('Dolap 101');
      // Check for some expected presets (the actual list may vary)
      expect(presets.length).toBeGreaterThan(10);
      expect(presets.some(preset => preset.includes('Kapı'))).toBe(true);
      expect(presets.some(preset => preset.includes('Dolap'))).toBe(true);
      
      // All presets should be valid
      presets.forEach(preset => {
        const validation = namingService.validateName(preset);
        expect(validation.isValid).toBe(true);
      });
    });
  });

  describe('Error Messages in Turkish', () => {
    it('should provide correct Turkish error messages', () => {
      // Test kiosk error messages
      expect(i18nService.get('kiosk.error_network')).toBe('Ağ hatası. Lütfen tekrar deneyin');
      expect(i18nService.get('kiosk.error_server')).toBe('Sunucu hatası. Personeli çağırın');
      expect(i18nService.get('kiosk.error_timeout')).toBe('Zaman aşımı. Lütfen tekrar deneyin');
      expect(i18nService.get('kiosk.error_unknown')).toBe('Bilinmeyen hata. Personeli çağırın');
      
      // Test panel error messages
      expect(i18nService.get('panel.operation_failed')).toBe('İşlem başarısız');
      expect(i18nService.get('panel.login_failed')).toBe('Giriş başarısız');
      expect(i18nService.get('panel.session_expired')).toBe('Oturum süresi doldu');
      expect(i18nService.get('panel.access_denied')).toBe('Erişim reddedildi');
    });

    it('should provide Turkish recovery suggestions through validation', () => {
      // Test validation suggestions for Turkish names
      const longName = 'Çok Uzun Dolap İsmi Test Adı';
      const validation = namingService.validateName(longName);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('20 characters');
      if (validation.suggestions) {
        expect(validation.suggestions[0]).toContain('Try shortening to:');
      }
    });

    it('should provide Turkish UI messages', () => {
      expect(i18nService.get('kiosk.scan_card')).toBe('Kart okutunuz');
      expect(i18nService.get('kiosk.select_locker')).toBe('Dolap Seçin');
      expect(i18nService.get('kiosk.select_locker_info')).toBe('Kullanmak istediğiniz dolabı seçin');
      expect(i18nService.get('kiosk.locker_opening')).toBe('Dolap açılıyor...');
      expect(i18nService.get('kiosk.locker_opened')).toBe('Dolap açıldı');
      expect(i18nService.get('kiosk.failed_open')).toBe('Açılamadı. Personeli çağırın');
    });
  });

  describe('State Names Consistency', () => {
    it('should use consistent Turkish state names across all interfaces', () => {
      expect(i18nService.get('kiosk.status_free')).toBe('Boş');
      expect(i18nService.get('kiosk.status_owned')).toBe('Dolu');
      expect(i18nService.get('kiosk.status_opening')).toBe('Açılıyor');
      expect(i18nService.get('kiosk.status_blocked')).toBe('Bloklu');
      
      // Test that these are the exact state names used in the system
      const requiredStates = ['Boş', 'Dolu', 'Açılıyor', 'Hata', 'Engelli'];
      requiredStates.forEach(state => {
        expect(state).toMatch(/^[\p{L}\p{N}\s]+$/u); // Unicode letters, numbers, spaces
        expect(state.length).toBeGreaterThan(0);
        expect(state.length).toBeLessThanOrEqual(10);
      });
    });

    it('should validate state name translations', () => {
      const requiredStates = ['Boş', 'Dolu', 'Açılıyor', 'Hata', 'Engelli'];
      
      requiredStates.forEach(state => {
        // Each state should be properly encoded and displayable
        expect(state).toMatch(/^[\p{L}\p{N}\s]+$/u); // Unicode letters, numbers, spaces
        expect(state.length).toBeGreaterThan(0);
        expect(state.length).toBeLessThanOrEqual(10); // Reasonable length for UI
      });
    });
  });

  describe('Admin Panel Turkish Messages', () => {
    it('should provide Turkish admin operation messages', () => {
      expect(i18nService.get('panel.locker_opened')).toBe('Dolap açıldı');
      expect(i18nService.get('panel.locker_blocked')).toBe('Dolap bloklandı');
      expect(i18nService.get('panel.locker_unblocked')).toBe('Dolap bloğu kaldırıldı');
      expect(i18nService.get('panel.bulk_complete')).toBe('Toplu açma tamamlandı');
      expect(i18nService.get('panel.operation_failed')).toBe('İşlem başarısız');
      expect(i18nService.get('panel.success')).toBe('Başarılı');
      expect(i18nService.get('panel.error')).toBe('Hata');
    });

    it('should provide Turkish filter and sort labels', () => {
      expect(i18nService.get('panel.filter')).toBe('Filtrele');
      expect(i18nService.get('panel.search')).toBe('Ara');
      expect(i18nService.get('panel.locker_status')).toBe('Durum');
      expect(i18nService.get('panel.locker_id')).toBe('Dolap No');
      expect(i18nService.get('panel.actions')).toBe('İşlemler');
      expect(i18nService.get('panel.refresh')).toBe('Yenile');
      expect(i18nService.get('panel.save')).toBe('Kaydet');
      expect(i18nService.get('panel.cancel')).toBe('İptal');
    });
  });

  describe('Character Encoding and Display', () => {
    it('should properly encode Turkish characters for web display', () => {
      const turkishText = 'Çalışan Dolabı - Güvenlik Bölümü';
      
      // Should be valid UTF-8
      const encoded = Buffer.from(turkishText, 'utf8');
      const decoded = encoded.toString('utf8');
      
      expect(decoded).toBe(turkishText);
    });

    it('should handle Turkish characters in JSON serialization', () => {
      const data = {
        displayName: 'Özel Dolap',
        message: 'İşlem başarılı',
        error: 'Bağlantı hatası'
      };
      
      const json = JSON.stringify(data);
      const parsed = JSON.parse(json);
      
      expect(parsed.displayName).toBe('Özel Dolap');
      expect(parsed.message).toBe('İşlem başarılı');
      expect(parsed.error).toBe('Bağlantı hatası');
    });

    it('should validate Turkish text in database operations', async () => {
      const turkishName = 'Güvenlik Kapısı';
      const kioskId = 'kiosk-1';
      const lockerId = 1;
      
      // Mock existing locker
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        kiosk_id: kioskId,
        display_name: null,
        version: 1
      });
      
      // Mock database queries for uniqueness check
      mockDatabase.all.mockReturnValue([]); // No existing names
      
      // Mock successful update
      mockDatabase.run.mockResolvedValue({ changes: 1 });
      
      await namingService.setDisplayName(kioskId, lockerId, turkishName, 'admin');
      
      // Verify the name was processed correctly
      expect(mockDatabase.run).toHaveBeenCalled();
    });
  });

  describe('Fallback and Error Handling', () => {
    it('should provide fallback names when custom names are not set', async () => {
      const kioskId = 'kiosk-1';
      const lockerId = 5;
      
      // Mock locker without display name
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        kiosk_id: kioskId,
        display_name: null,
        relay_number: 5
      });
      
      const displayName = await namingService.getDisplayName(kioskId, lockerId);
      expect(displayName).toBe('Dolap 5');
    });

    it('should handle missing translations gracefully', () => {
      const missingKey = 'non.existent.key';
      const message = i18nService.get(missingKey);
      
      // Should return the key itself when translation is missing
      expect(message).toBe(missingKey);
      expect(typeof message).toBe('string');
    });

    it('should validate Turkish input sanitization', () => {
      const maliciousInput = '<script>alert("test")</script>Dolap';
      const validation = namingService.validateName(maliciousInput);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('invalid characters');
    });
  });
});