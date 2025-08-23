import { describe, it, expect, beforeEach } from 'vitest';
import { I18nService, SupportedLanguage } from '../i18n-service';

describe('I18nService', () => {
  let i18nService: I18nService;

  beforeEach(() => {
    i18nService = new I18nService();
  });

  describe('Language Management', () => {
    it('should default to Turkish language', () => {
      expect(i18nService.getCurrentLanguage()).toBe('tr');
    });

    it('should set language correctly', () => {
      i18nService.setLanguage('en');
      expect(i18nService.getCurrentLanguage()).toBe('en');
    });

    it('should ignore invalid language', () => {
      const originalLang = i18nService.getCurrentLanguage();
      i18nService.setLanguage('invalid' as SupportedLanguage);
      expect(i18nService.getCurrentLanguage()).toBe(originalLang);
    });

    it('should return available languages', () => {
      const languages = i18nService.getAvailableLanguages();
      expect(languages).toEqual(['tr', 'en']);
    });
  });

  describe('Message Retrieval', () => {
    it('should get Turkish messages by default', () => {
      const message = i18nService.get('kiosk.scan_card');
      expect(message).toBe('Kart okutunuz');
    });

    it('should get English messages when language is set', () => {
      i18nService.setLanguage('en');
      const message = i18nService.get('kiosk.scan_card');
      expect(message).toBe('Scan your card');
    });

    it('should return key path for non-existent messages', () => {
      const message = i18nService.get('non.existent.key');
      expect(message).toBe('non.existent.key');
    });

    it('should handle nested message keys', () => {
      const message = i18nService.get('panel.dashboard');
      expect(message).toBe('Ana Sayfa');
    });
  });

  describe('Parameter Replacement', () => {
    it('should replace single parameter', () => {
      const message = i18nService.get('kiosk.opening', { id: '5' });
      expect(message).toBe('Dolap 5 açılıyor');
    });

    it('should replace multiple parameters', () => {
      const message = i18nService.get('kiosk.pin_attempts_remaining', { attempts: '3' });
      expect(message).toBe('3 deneme hakkınız kaldı');
    });

    it('should handle numeric parameters', () => {
      const message = i18nService.get('kiosk.pin_locked', { minutes: 5 });
      expect(message).toBe('PIN girişi kilitlendi. 5 dakika bekleyin');
    });

    it('should handle missing parameters gracefully', () => {
      const message = i18nService.get('kiosk.opening', {});
      expect(message).toBe('Dolap {id} açılıyor');
    });

    it('should replace same parameter multiple times', () => {
      // Create a test message with repeated parameter
      const testMessage = 'Test {value} and {value} again';
      const result = i18nService['replaceParams'](testMessage, { value: 'hello' });
      expect(result).toBe('Test hello and hello again');
    });
  });

  describe('Section Retrieval', () => {
    it('should get kiosk section messages', () => {
      const kioskMessages = i18nService.getSection('kiosk');
      expect(kioskMessages).toHaveProperty('scan_card');
      expect(kioskMessages).toHaveProperty('loading');
      expect(kioskMessages.scan_card).toBe('Kart okutunuz');
    });

    it('should get panel section messages', () => {
      const panelMessages = i18nService.getSection('panel');
      expect(panelMessages).toHaveProperty('dashboard');
      expect(panelMessages).toHaveProperty('login');
      expect(panelMessages.dashboard).toBe('Ana Sayfa');
    });

    it('should get QR section messages', () => {
      const qrMessages = i18nService.getSection('qr');
      expect(qrMessages).toHaveProperty('vip_blocked');
      expect(qrMessages).toHaveProperty('network_required');
      expect(qrMessages.vip_blocked).toBe('VIP dolap. QR kapalı');
    });
  });

  describe('Message Completeness', () => {
    it('should have all required kiosk messages in both languages', () => {
      const requiredKioskKeys = [
        'scan_card',
        'scan_card_subtitle',
        'master_access',
        'back',
        'loading',
        'select_locker',
        'select_locker_info',
        'enter_master_pin',
        'master_locker_control',
        'master_locker_info',
        'no_lockers',
        'opening',
        'opened_released',
        'failed_open',
        'card_already_has_locker',
        'locker_opening',
        'locker_opened',
        'locker_released',
        'pin_incorrect',
        'pin_locked',
        'pin_attempts_remaining',
        'status_free',
        'status_owned',
        'status_reserved',
        'status_blocked',
        'status_vip',
        'status_opening',
        'error_network',
        'error_server',
        'error_timeout',
        'error_unknown'
      ];

      for (const language of ['tr', 'en'] as SupportedLanguage[]) {
        i18nService.setLanguage(language);
        const kioskMessages = i18nService.getSection('kiosk');
        
        for (const key of requiredKioskKeys) {
          expect(kioskMessages).toHaveProperty(key);
          expect(typeof kioskMessages[key]).toBe('string');
          expect(kioskMessages[key].length).toBeGreaterThan(0);
        }
      }
    });

    it('should have all required panel messages in both languages', () => {
      const requiredPanelKeys = [
        'dashboard',
        'lockers',
        'vip_contracts',
        'events',
        'settings',
        'logout',
        'login',
        'username',
        'password',
        'login_failed',
        'session_expired',
        'access_denied',
        'total_lockers',
        'available_lockers',
        'occupied_lockers',
        'blocked_lockers',
        'vip_lockers',
        'online_kiosks',
        'offline_kiosks',
        'locker_id',
        'locker_status',
        'owner',
        'assigned_at',
        'actions',
        'open_locker',
        'block_locker',
        'unblock_locker',
        'override_open',
        'bulk_open',
        'end_of_day_open',
        'locker_opened',
        'locker_blocked',
        'locker_unblocked',
        'bulk_complete',
        'operation_failed',
        'confirm_action',
        'reason_required',
        'save',
        'cancel',
        'delete',
        'edit',
        'view',
        'refresh',
        'filter',
        'search',
        'clear',
        'yes',
        'no',
        'success',
        'error',
        'warning',
        'info'
      ];

      for (const language of ['tr', 'en'] as SupportedLanguage[]) {
        i18nService.setLanguage(language);
        const panelMessages = i18nService.getSection('panel');
        
        for (const key of requiredPanelKeys) {
          expect(panelMessages).toHaveProperty(key);
          expect(typeof panelMessages[key]).toBe('string');
          expect(panelMessages[key].length).toBeGreaterThan(0);
        }
      }
    });

    it('should have all required QR messages in both languages', () => {
      const requiredQrKeys = [
        'vip_blocked',
        'network_required',
        'private_mode_warning',
        'locker_busy',
        'action_success',
        'action_failed',
        'rate_limit_exceeded',
        'invalid_request'
      ];

      for (const language of ['tr', 'en'] as SupportedLanguage[]) {
        i18nService.setLanguage(language);
        const qrMessages = i18nService.getSection('qr');
        
        for (const key of requiredQrKeys) {
          expect(qrMessages).toHaveProperty(key);
          expect(typeof qrMessages[key]).toBe('string');
          expect(qrMessages[key].length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Message Consistency', () => {
    it('should have consistent parameter placeholders across languages', () => {
      const parametrizedMessages = [
        'kiosk.opening',
        'kiosk.opened_released',
        'kiosk.pin_locked',
        'kiosk.pin_attempts_remaining'
      ];

      for (const messageKey of parametrizedMessages) {
        i18nService.setLanguage('tr');
        const trMessage = i18nService.get(messageKey);
        
        i18nService.setLanguage('en');
        const enMessage = i18nService.get(messageKey);

        // Extract parameters from both messages
        const trParams = (trMessage.match(/\{[^}]+\}/g) || []).sort();
        const enParams = (enMessage.match(/\{[^}]+\}/g) || []).sort();

        expect(trParams, `Parameter mismatch in ${messageKey}: TR has ${trParams.join(', ')}, EN has ${enParams.join(', ')}`).toEqual(enParams);
      }
    });

    it('should not have empty messages', () => {
      for (const language of ['tr', 'en'] as SupportedLanguage[]) {
        i18nService.setLanguage(language);
        const allMessages = i18nService.getAllMessages();
        
        const checkSection = (section: any, sectionName: string) => {
          for (const [key, value] of Object.entries(section)) {
            expect(typeof value, `${sectionName}.${key} should be a string in ${language}`).toBe('string');
            expect((value as string).trim().length, `${sectionName}.${key} should not be empty in ${language}`).toBeGreaterThan(0);
          }
        };

        checkSection(allMessages.kiosk, 'kiosk');
        checkSection(allMessages.panel, 'panel');
        checkSection(allMessages.qr, 'qr');
      }
    });
  });

  describe('Language Switching', () => {
    it('should maintain message structure when switching languages', () => {
      i18nService.setLanguage('tr');
      const trMessages = i18nService.getAllMessages();
      
      i18nService.setLanguage('en');
      const enMessages = i18nService.getAllMessages();

      // Check that both languages have the same structure
      expect(Object.keys(trMessages)).toEqual(Object.keys(enMessages));
      expect(Object.keys(trMessages.kiosk)).toEqual(Object.keys(enMessages.kiosk));
      expect(Object.keys(trMessages.panel)).toEqual(Object.keys(enMessages.panel));
      expect(Object.keys(trMessages.qr)).toEqual(Object.keys(enMessages.qr));
    });

    it('should return different messages for different languages', () => {
      i18nService.setLanguage('tr');
      const trMessage = i18nService.get('kiosk.scan_card');
      
      i18nService.setLanguage('en');
      const enMessage = i18nService.get('kiosk.scan_card');

      expect(trMessage).not.toBe(enMessage);
      expect(trMessage).toBe('Kart okutunuz');
      expect(enMessage).toBe('Scan your card');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed key paths gracefully', () => {
      expect(i18nService.get('')).toBe('');
      expect(i18nService.get('.')).toBe('.');
      expect(i18nService.get('..')).toBe('..');
      expect(i18nService.get('kiosk.')).toBe('kiosk.');
      expect(i18nService.get('.scan_card')).toBe('.scan_card');
    });

    it('should handle null and undefined parameters', () => {
      const message = i18nService.get('kiosk.opening', { id: null as any });
      expect(message).toBe('Dolap null açılıyor');
      
      const message2 = i18nService.get('kiosk.opening', { id: undefined as any });
      expect(message2).toBe('Dolap undefined açılıyor');
    });
  });
});
