import { describe, it, expect } from 'vitest';
import { I18nService, SupportedLanguage } from '../i18n-service';

/**
 * Regression tests for i18n system
 * These tests ensure that new message additions don't break existing functionality
 * and that message structure remains consistent across languages
 */
describe('I18n Regression Tests', () => {
  const i18nService = new I18nService();

  describe('Message Structure Stability', () => {
    it('should maintain expected message structure', () => {
      const expectedSections = ['kiosk', 'qr', 'panel'];
      
      for (const language of ['tr', 'en'] as SupportedLanguage[]) {
        i18nService.setLanguage(language);
        const messages = i18nService.getAllMessages();
        
        expect(Object.keys(messages).sort()).toEqual(expectedSections.sort());
        
        // Each section should be an object
        for (const section of expectedSections) {
          expect(typeof messages[section as keyof typeof messages]).toBe('object');
          expect(messages[section as keyof typeof messages]).not.toBeNull();
        }
      }
    });

    it('should have consistent section structure across languages', () => {
      i18nService.setLanguage('tr');
      const trMessages = i18nService.getAllMessages();
      
      i18nService.setLanguage('en');
      const enMessages = i18nService.getAllMessages();

      // Same sections
      expect(Object.keys(trMessages).sort()).toEqual(Object.keys(enMessages).sort());

      // Same keys in each section
      for (const section of Object.keys(trMessages)) {
        const trKeys = Object.keys(trMessages[section as keyof typeof trMessages]).sort();
        const enKeys = Object.keys(enMessages[section as keyof typeof enMessages]).sort();
        expect(trKeys).toEqual(enKeys);
      }
    });
  });

  describe('Critical Message Availability', () => {
    const criticalMessages = {
      kiosk: [
        'scan_card',
        'loading',
        'no_lockers',
        'opening',
        'opened_released',
        'failed_open',
        'error_network',
        'error_server',
        'error_timeout',
        'error_unknown'
      ],
      qr: [
        'vip_blocked',
        'network_required',
        'private_mode_warning',
        'locker_busy',
        'action_success',
        'action_failed'
      ],
      panel: [
        'dashboard',
        'lockers',
        'login',
        'logout',
        'save',
        'cancel',
        'error',
        'success',
        'locker_opened',
        'bulk_complete'
      ]
    };

    it('should have all critical messages in both languages', () => {
      for (const language of ['tr', 'en'] as SupportedLanguage[]) {
        i18nService.setLanguage(language);
        
        for (const [section, messageKeys] of Object.entries(criticalMessages)) {
          const sectionMessages = i18nService.getSection(section as any);
          
          for (const messageKey of messageKeys) {
            expect(sectionMessages).toHaveProperty(messageKey);
            expect(typeof sectionMessages[messageKey]).toBe('string');
            expect(sectionMessages[messageKey].trim().length).toBeGreaterThan(0);
          }
        }
      }
    });
  });

  describe('Parameter Placeholder Consistency', () => {
    const parametrizedMessages = [
      { key: 'kiosk.opening', params: ['id'] },
      { key: 'kiosk.opened_released', params: ['id'] },
      { key: 'kiosk.pin_locked', params: ['minutes'] },
      { key: 'kiosk.pin_attempts_remaining', params: ['attempts'] }
    ];

    it('should have consistent parameters across languages', () => {
      for (const { key, params } of parametrizedMessages) {
        i18nService.setLanguage('tr');
        const trMessage = i18nService.get(key);
        
        i18nService.setLanguage('en');
        const enMessage = i18nService.get(key);

        for (const param of params) {
          const paramPattern = `{${param}}`;
          expect(trMessage, `Parameter ${param} missing in Turkish message ${key}`).toContain(paramPattern);
          expect(enMessage, `Parameter ${param} missing in English message ${key}`).toContain(paramPattern);
        }
      }
    });

    it('should not have orphaned parameters', () => {
      const knownParameters = ['id', 'minutes', 'attempts'];
      
      for (const language of ['tr', 'en'] as SupportedLanguage[]) {
        i18nService.setLanguage(language);
        const allMessages = i18nService.getAllMessages();
        
        const checkSection = (section: any, sectionName: string) => {
          for (const [key, message] of Object.entries(section)) {
            if (typeof message === 'string') {
              const parameters = message.match(/\{([^}]+)\}/g) || [];
              
              for (const param of parameters) {
                const paramName = param.slice(1, -1); // Remove { and }
                expect(knownParameters, `Unknown parameter ${param} in ${sectionName}.${key} (${language})`).toContain(paramName);
              }
            }
          }
        };

        checkSection(allMessages.kiosk, 'kiosk');
        checkSection(allMessages.panel, 'panel');
        checkSection(allMessages.qr, 'qr');
      }
    });
  });

  describe('Message Quality Checks', () => {
    it('should not have placeholder text in production messages', () => {
      const placeholderPatterns = [
        /TODO/i,
        /FIXME/i,
        /placeholder/i,
        /lorem ipsum/i,
        /test message/i,
        /\[.*\]/,  // [placeholder] style
        /{{\s*.*\s*}}/  // {{ placeholder }} style
      ];

      for (const language of ['tr', 'en'] as SupportedLanguage[]) {
        i18nService.setLanguage(language);
        const allMessages = i18nService.getAllMessages();
        
        const checkSection = (section: any, sectionName: string) => {
          for (const [key, message] of Object.entries(section)) {
            if (typeof message === 'string') {
              for (const pattern of placeholderPatterns) {
                expect(message, `Placeholder text found in ${sectionName}.${key} (${language}): "${message}"`).not.toMatch(pattern);
              }
            }
          }
        };

        checkSection(allMessages.kiosk, 'kiosk');
        checkSection(allMessages.panel, 'panel');
        checkSection(allMessages.qr, 'qr');
      }
    });

    it('should not have excessively long messages', () => {
      const maxLength = 200; // Reasonable limit for UI messages
      
      for (const language of ['tr', 'en'] as SupportedLanguage[]) {
        i18nService.setLanguage(language);
        const allMessages = i18nService.getAllMessages();
        
        const checkSection = (section: any, sectionName: string) => {
          for (const [key, message] of Object.entries(section)) {
            if (typeof message === 'string') {
              expect(message.length, `Message too long in ${sectionName}.${key} (${language}): ${message.length} chars`).toBeLessThanOrEqual(maxLength);
            }
          }
        };

        checkSection(allMessages.kiosk, 'kiosk');
        checkSection(allMessages.panel, 'panel');
        checkSection(allMessages.qr, 'qr');
      }
    });

    it('should not have messages with only whitespace', () => {
      for (const language of ['tr', 'en'] as SupportedLanguage[]) {
        i18nService.setLanguage(language);
        const allMessages = i18nService.getAllMessages();
        
        const checkSection = (section: any, sectionName: string) => {
          for (const [key, message] of Object.entries(section)) {
            if (typeof message === 'string') {
              expect(message.trim().length, `Empty or whitespace-only message in ${sectionName}.${key} (${language})`).toBeGreaterThan(0);
            }
          }
        };

        checkSection(allMessages.kiosk, 'kiosk');
        checkSection(allMessages.panel, 'panel');
        checkSection(allMessages.qr, 'qr');
      }
    });
  });

  describe('Backwards Compatibility', () => {
    it('should maintain compatibility with legacy key access patterns', () => {
      // Test that old-style key access still works
      const legacyKeys = [
        'scan_card',  // Without section prefix
        'loading',
        'dashboard',
        'login'
      ];

      for (const key of legacyKeys) {
        const message = i18nService.get(key);
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      }
    });

    it('should handle section-prefixed keys', () => {
      const sectionKeys = [
        'kiosk.scan_card',
        'kiosk.loading',
        'panel.dashboard',
        'panel.login',
        'qr.vip_blocked'
      ];

      for (const key of sectionKeys) {
        const message = i18nService.get(key);
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
        expect(message).not.toBe(key); // Should not return the key itself
      }
    });
  });

  describe('Performance Characteristics', () => {
    it('should retrieve messages efficiently', () => {
      const startTime = performance.now();
      
      // Perform many message retrievals
      for (let i = 0; i < 1000; i++) {
        i18nService.get('kiosk.scan_card');
        i18nService.get('panel.dashboard');
        i18nService.get('qr.vip_blocked');
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete 3000 message retrievals in under 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should handle language switching efficiently', () => {
      const startTime = performance.now();
      
      // Switch languages many times
      for (let i = 0; i < 100; i++) {
        i18nService.setLanguage('tr');
        i18nService.get('kiosk.scan_card');
        i18nService.setLanguage('en');
        i18nService.get('kiosk.scan_card');
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete 200 operations in under 50ms
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Error Recovery', () => {
    it('should handle malformed message keys gracefully', () => {
      const malformedKeys = [
        '',
        '.',
        '..',
        'section.',
        '.key',
        'section..key',
        'section.key.',
        'section.key.subkey.toomany.levels'
      ];

      for (const key of malformedKeys) {
        expect(() => i18nService.get(key)).not.toThrow();
        const result = i18nService.get(key);
        expect(typeof result).toBe('string');
      }
    });

    it('should handle parameter replacement edge cases', () => {
      const edgeCases = [
        { key: 'kiosk.opening', params: { id: '' } },
        { key: 'kiosk.opening', params: { id: 'null' } },
        { key: 'kiosk.opening', params: { id: 'undefined' } },
        { key: 'kiosk.opening', params: { id: 'value' } },
        { key: 'kiosk.scan_card', params: undefined }
      ];

      for (const { key, params } of edgeCases) {
        expect(() => i18nService.get(key, params)).not.toThrow();
        const result = i18nService.get(key, params);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });
});
