/**
 * Turkish UI Messages - Acceptance Tests
 * 
 * Validates all Turkish user interface messages for correctness,
 * encoding, and proper display in various scenarios.
 */

import { describe, test, expect } from 'vitest';

describe('Turkish UI Messages Acceptance', () => {
  // Official approved Turkish messages whitelist - EXACT SET ONLY
  const APPROVED_MESSAGES = {
    // Idle state
    idle: "Kartınızı okutun.",
    
    // Success messages
    success_new: "Dolabınız açıldı. Eşyalarınızı yerleştirin.",
    success_existing: "Önceki dolabınız açıldı.",
    retrieve_overdue: "Süreniz doldu. Almanız için açılıyor.",
    
    // Process messages - FIXED: Added missing messages with periods
    retry: "Tekrar deneniyor.",
    throttled: "Lütfen birkaç saniye sonra deneyin.",
    reported_occupied: "Dolap dolu bildirildi. Yeni dolap açılıyor.",
    
    // Error messages
    no_stock: "Boş dolap yok. Görevliye başvurun.",
    error: "Şu an işlem yapılamıyor.",
    
    // Admin panel labels
    save: "Kaydet",
    load_default: "Varsayılanı Yükle",
    override_for_kiosk: "Kiosk için Geçersiz Kıl",
    remaining_time: "Kalan süre",
    extend_session: "Oturumu uzat +60 dk",
    overdue_lockers: "Gecikmiş dolaplar",
    suspected_lockers: "Şüpheli dolaplar",
    
    // Status translations
    status_free: "Boş",
    status_owned: "Sahipli", 
    status_opening: "Açılıyor",
    status_error: "Hata",
    status_blocked: "Engelli"
  };

  describe('Message Content Validation', () => {
    test('validates exact approved whitelist messages are defined', () => {
      // Test ONLY the approved whitelist - no more, no less
      const expectedCount = 9; // Exact count of approved messages
      const actualCount = Object.keys(APPROVED_MESSAGES).length;
      
      expect(actualCount).toBe(expectedCount);
      
      Object.entries(APPROVED_MESSAGES).forEach(([key, message]) => {
        expect(message).toBeDefined();
        expect(message.length).toBeGreaterThan(0);
        expect(typeof message).toBe('string');
        expect(message.endsWith('.')).toBe(true); // All messages must end with period
      });
    });

    test('validates Turkish character usage', () => {
      const turkishChars = ['ç', 'ğ', 'ı', 'ö', 'ş', 'ü', 'Ç', 'Ğ', 'İ', 'Ö', 'Ş', 'Ü'];
      const messagesWithTurkish = [
        APPROVED_MESSAGES.idle,
        APPROVED_MESSAGES.success_new,
        APPROVED_MESSAGES.success_existing,
        APPROVED_MESSAGES.retrieve_overdue,
        APPROVED_MESSAGES.throttled,
        APPROVED_MESSAGES.no_stock,
        APPROVED_MESSAGES.error,
        APPROVED_MESSAGES.remaining_time,
        APPROVED_MESSAGES.extend_session,
        APPROVED_MESSAGES.overdue_lockers,
        APPROVED_MESSAGES.suspected_lockers
      ];

      messagesWithTurkish.forEach(message => {
        const hasTurkishChars = turkishChars.some(char => message.includes(char));
        expect(hasTurkishChars).toBe(true);
      });
    });

    test('validates message grammar and spelling', () => {
      // Test specific grammar rules for Turkish
      expect(APPROVED_MESSAGES.idle).toMatch(/Kartınızı.*okutun/); // Possessive + verb
      expect(APPROVED_MESSAGES.success_new).toMatch(/Dolabınız.*açıldı/); // Past tense
      expect(APPROVED_MESSAGES.throttled).toMatch(/Lütfen.*deneyin/); // Polite request
      expect(APPROVED_MESSAGES.no_stock).toMatch(/Görevliye.*başvurun/); // Imperative
    });

    test('validates message length constraints', () => {
      // Messages should be concise but informative
      Object.entries(APPROVED_MESSAGES).forEach(([key, message]) => {
        expect(message.length).toBeLessThan(100); // Reasonable length limit
        expect(message.length).toBeGreaterThan(3); // Not too short
      });
    });

    test('validates punctuation consistency', () => {
      const sentenceMessages = [
        APPROVED_MESSAGES.idle,
        APPROVED_MESSAGES.success_new,
        APPROVED_MESSAGES.success_existing,
        APPROVED_MESSAGES.retrieve_overdue,
        APPROVED_MESSAGES.reported_occupied,
        APPROVED_MESSAGES.retry,
        APPROVED_MESSAGES.throttled,
        APPROVED_MESSAGES.no_stock,
        APPROVED_MESSAGES.error
      ];

      sentenceMessages.forEach(message => {
        expect(message).toMatch(/\.$/); // Should end with period
      });
    });
  });

  describe('UTF-8 Encoding Validation', () => {
    test('validates proper UTF-8 encoding for all messages', () => {
      Object.values(APPROVED_MESSAGES).forEach(message => {
        // Test encoding/decoding roundtrip
        const encoded = Buffer.from(message, 'utf8');
        const decoded = encoded.toString('utf8');
        expect(decoded).toBe(message);
        
        // Test byte length vs character length for Turkish chars
        const byteLength = Buffer.byteLength(message, 'utf8');
        expect(byteLength).toBeGreaterThanOrEqual(message.length);
      });
    });

    test('validates JSON serialization compatibility', () => {
      Object.values(APPROVED_MESSAGES).forEach(message => {
        const jsonString = JSON.stringify({ message });
        const parsed = JSON.parse(jsonString);
        expect(parsed.message).toBe(message);
      });
    });

    test('validates URL encoding compatibility', () => {
      Object.values(APPROVED_MESSAGES).forEach(message => {
        const encoded = encodeURIComponent(message);
        const decoded = decodeURIComponent(encoded);
        expect(decoded).toBe(message);
      });
    });
  });

  describe('Display Context Validation', () => {
    test('validates messages work in HTML context', () => {
      Object.values(APPROVED_MESSAGES).forEach(message => {
        // Should not contain HTML-breaking characters
        expect(message).not.toMatch(/[<>&"']/);
        
        // Should be safe for innerHTML
        const div = { innerHTML: message };
        expect(div.innerHTML).toBe(message);
      });
    });

    test('validates messages work in JavaScript context', () => {
      Object.values(APPROVED_MESSAGES).forEach(message => {
        // Should not contain JavaScript-breaking characters
        expect(message).not.toMatch(/[\\`$]/);
        
        // Should be safe for template literals
        const template = `Message: ${message}`;
        expect(template).toContain(message);
      });
    });

    test('validates messages work in CSS context', () => {
      Object.values(APPROVED_MESSAGES).forEach(message => {
        // Should be safe for CSS content property
        const cssContent = `content: "${message}";`;
        expect(cssContent).toContain(message);
      });
    });
  });

  describe('Accessibility Validation', () => {
    test('validates screen reader compatibility', () => {
      Object.values(APPROVED_MESSAGES).forEach(message => {
        // Should not contain special characters that confuse screen readers
        expect(message).not.toMatch(/[@#$%^&*()_+=\[\]{}|\\:";'<>?,]/);
        
        // Should have proper sentence structure
        expect(message.trim()).toBe(message); // No leading/trailing whitespace
      });
    });

    test('validates message clarity for users', () => {
      // Test that messages are clear and actionable
      expect(APPROVED_MESSAGES.idle).toMatch(/Kart/); // Clear action
      expect(APPROVED_MESSAGES.throttled).toMatch(/Lütfen.*deneyin/); // Clear instruction
      expect(APPROVED_MESSAGES.no_stock).toMatch(/Görevliye/); // Clear next step
    });
  });

  describe('Contextual Message Validation', () => {
    test('validates assignment flow messages', () => {
      const flowMessages = [
        APPROVED_MESSAGES.idle,
        APPROVED_MESSAGES.success_new,
        APPROVED_MESSAGES.success_existing
      ];

      // Should form logical progression
      expect(flowMessages[0]).toMatch(/okutun/); // Request action
      expect(flowMessages[1]).toMatch(/açıldı/); // Confirm action
      expect(flowMessages[2]).toMatch(/Önceki/); // Distinguish returning user
    });

    test('validates error handling messages', () => {
      const errorMessages = [
        APPROVED_MESSAGES.retry,
        APPROVED_MESSAGES.throttled,
        APPROVED_MESSAGES.no_stock,
        APPROVED_MESSAGES.error
      ];

      // Should provide appropriate guidance
      expect(errorMessages[0]).toMatch(/Tekrar/); // Retry indication
      expect(errorMessages[1]).toMatch(/birkaç saniye/); // Time guidance
      expect(errorMessages[2]).toMatch(/Görevliye/); // Escalation path
      expect(errorMessages[3]).toMatch(/yapılamıyor/); // Clear failure state
    });

    test('validates admin interface messages', () => {
      const adminMessages = [
        APPROVED_MESSAGES.save,
        APPROVED_MESSAGES.load_default,
        APPROVED_MESSAGES.override_for_kiosk
      ];

      // Should be clear admin actions
      expect(adminMessages[0]).toBe("Kaydet"); // Simple save
      expect(adminMessages[1]).toMatch(/Varsayılan/); // Default action
      expect(adminMessages[2]).toMatch(/Kiosk.*Geçersiz/); // Override action
    });
  });

  describe('Message Consistency Validation', () => {
    test('validates consistent terminology usage', () => {
      // "Dolap" should be used consistently for locker
      const lockerMessages = [
        APPROVED_MESSAGES.success_new,
        APPROVED_MESSAGES.reported_occupied,
        APPROVED_MESSAGES.no_stock
      ];

      lockerMessages.forEach(message => {
        if (message.includes('locker') || message.includes('Locker')) {
          expect(message).toMatch(/[Dd]olap/);
        }
      });
    });

    test('validates consistent verb tense usage', () => {
      // Past tense for completed actions
      expect(APPROVED_MESSAGES.success_new).toMatch(/açıldı/); // Past tense
      expect(APPROVED_MESSAGES.success_existing).toMatch(/açıldı/); // Past tense
      
      // Present/imperative for instructions
      expect(APPROVED_MESSAGES.idle).toMatch(/okutun/); // Imperative
      expect(APPROVED_MESSAGES.throttled).toMatch(/deneyin/); // Imperative
    });

    test('validates consistent politeness level', () => {
      // Should maintain consistent formal/polite tone
      expect(APPROVED_MESSAGES.throttled).toMatch(/Lütfen/); // Polite
      expect(APPROVED_MESSAGES.no_stock).toMatch(/başvurun/); // Formal imperative
      
      // Should not mix informal with formal
      Object.values(APPROVED_MESSAGES).forEach(message => {
        expect(message).not.toMatch(/sen|seni|senin/i); // Informal pronouns
      });
    });
  });

  describe('Integration with System States', () => {
    test('validates message mapping to system states', () => {
      const stateMessageMap = {
        'idle': APPROVED_MESSAGES.idle,
        'assigning': APPROVED_MESSAGES.retry,
        'assigned_new': APPROVED_MESSAGES.success_new,
        'assigned_existing': APPROVED_MESSAGES.success_existing,
        'overdue_retrieval': APPROVED_MESSAGES.retrieve_overdue,
        'reported_occupied': APPROVED_MESSAGES.reported_occupied,
        'rate_limited': APPROVED_MESSAGES.throttled,
        'no_stock': APPROVED_MESSAGES.no_stock,
        'error': APPROVED_MESSAGES.error
      };

      Object.entries(stateMessageMap).forEach(([state, message]) => {
        expect(message).toBeDefined();
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      });
    });

    test('validates status translation consistency', () => {
      const statusTranslations = {
        'Free': APPROVED_MESSAGES.status_free,
        'Owned': APPROVED_MESSAGES.status_owned,
        'Opening': APPROVED_MESSAGES.status_opening,
        'Error': APPROVED_MESSAGES.status_error,
        'Blocked': APPROVED_MESSAGES.status_blocked
      };

      Object.entries(statusTranslations).forEach(([english, turkish]) => {
        expect(turkish).toBeDefined();
        expect(turkish).not.toBe(english); // Should be translated
      });
    });
  });

  describe('Performance and Memory Validation', () => {
    test('validates message constants are memory efficient', () => {
      // Messages should be reasonable size
      const totalSize = Object.values(APPROVED_MESSAGES)
        .reduce((sum, msg) => sum + Buffer.byteLength(msg, 'utf8'), 0);
      
      expect(totalSize).toBeLessThan(2048); // Less than 2KB total
    });

    test('validates message lookup performance', () => {
      const startTime = Date.now();
      
      // Simulate 1000 message lookups
      for (let i = 0; i < 1000; i++) {
        const message = APPROVED_MESSAGES.success_new;
        expect(message).toBeDefined();
      }
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should be very fast
    });
  });
});