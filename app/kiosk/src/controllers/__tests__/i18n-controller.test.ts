import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { KioskI18nController } from '../i18n-controller';

describe('KioskI18nController', () => {
  let fastify: FastifyInstance;
  let controller: KioskI18nController;

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    controller = new KioskI18nController(fastify);
    await controller.registerRoutes();
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /api/i18n/kiosk', () => {
    it('should return current language and kiosk messages', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/kiosk'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data).toHaveProperty('currentLanguage');
      expect(data).toHaveProperty('availableLanguages');
      expect(data).toHaveProperty('messages');
      expect(data.messages).toHaveProperty('kiosk');
      expect(data.messages).toHaveProperty('qr');
      expect(data.availableLanguages).toEqual(['tr', 'en']);
    });

    it('should return Turkish messages by default', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/kiosk'
      });

      const data = JSON.parse(response.payload);
      expect(data.currentLanguage).toBe('tr');
      expect(data.messages.kiosk.scan_card).toBe('Kart okutunuz');
    });
  });

  describe('POST /api/i18n/kiosk/language', () => {
    it('should set language to English', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/i18n/kiosk/language',
        payload: { language: 'en' }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.success).toBe(true);
      expect(data.currentLanguage).toBe('en');
      expect(data.messages.kiosk.scan_card).toBe('Scan your card');
    });

    it('should reject invalid language', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/i18n/kiosk/language',
        payload: { language: 'invalid' }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      
      expect(data.error).toBe('Invalid language');
      expect(data.availableLanguages).toEqual(['tr', 'en']);
    });

    it('should handle missing language parameter', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/i18n/kiosk/language',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/i18n/message', () => {
    it('should return specific message with parameters', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/i18n/message',
        payload: {
          key: 'kiosk.opening',
          params: { id: '5' }
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.message).toBe('Dolap 5 açılıyor');
      expect(data.language).toBe('tr');
    });

    it('should return message without parameters', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/i18n/message',
        payload: {
          key: 'kiosk.scan_card'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.message).toBe('Kart okutunuz');
    });

    it('should return key for non-existent message', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/i18n/message',
        payload: {
          key: 'non.existent.key'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.message).toBe('non.existent.key');
    });
  });

  describe('Static Methods', () => {
    it('should get message via static method', () => {
      const message = KioskI18nController.getMessage('kiosk.scan_card');
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should get message with parameters via static method', () => {
      const message = KioskI18nController.getMessage('kiosk.opening', { id: '10' });
      expect(message).toContain('10');
    });

    it('should set language via static method', () => {
      KioskI18nController.setLanguage('en');
      const message = KioskI18nController.getMessage('kiosk.scan_card');
      expect(message).toBe('Scan your card');
      
      // Reset to Turkish
      KioskI18nController.setLanguage('tr');
    });
  });

  describe('Message Validation', () => {
    it('should have all required kiosk messages', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/kiosk'
      });

      const data = JSON.parse(response.payload);
      const kioskMessages = data.messages.kiosk;

      const requiredMessages = [
        'scan_card',
        'loading',
        'no_lockers',
        'opening',
        'opened_released',
        'failed_open',
        'error_network',
        'error_server'
      ];

      for (const messageKey of requiredMessages) {
        expect(kioskMessages).toHaveProperty(messageKey);
        expect(typeof kioskMessages[messageKey]).toBe('string');
        expect(kioskMessages[messageKey].length).toBeGreaterThan(0);
      }
    });

    it('should have all required QR messages', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/kiosk'
      });

      const data = JSON.parse(response.payload);
      const qrMessages = data.messages.qr;

      const requiredMessages = [
        'vip_blocked',
        'network_required',
        'private_mode_warning',
        'locker_busy',
        'action_success',
        'action_failed'
      ];

      for (const messageKey of requiredMessages) {
        expect(qrMessages).toHaveProperty(messageKey);
        expect(typeof qrMessages[messageKey]).toBe('string');
        expect(qrMessages[messageKey].length).toBeGreaterThan(0);
      }
    });
  });

  describe('Language Switching Integration', () => {
    it('should maintain consistency when switching languages', async () => {
      // Get Turkish messages
      const trResponse = await fastify.inject({
        method: 'POST',
        url: '/api/i18n/kiosk/language',
        payload: { language: 'tr' }
      });
      
      const trData = JSON.parse(trResponse.payload);
      const trKeys = Object.keys(trData.messages.kiosk);

      // Get English messages
      const enResponse = await fastify.inject({
        method: 'POST',
        url: '/api/i18n/kiosk/language',
        payload: { language: 'en' }
      });
      
      const enData = JSON.parse(enResponse.payload);
      const enKeys = Object.keys(enData.messages.kiosk);

      // Should have same keys
      expect(trKeys.sort()).toEqual(enKeys.sort());

      // Messages should be different
      expect(trData.messages.kiosk.scan_card).not.toBe(enData.messages.kiosk.scan_card);
    });

    it('should handle parameter replacement in both languages', async () => {
      // Test Turkish
      await fastify.inject({
        method: 'POST',
        url: '/api/i18n/kiosk/language',
        payload: { language: 'tr' }
      });

      const trResponse = await fastify.inject({
        method: 'POST',
        url: '/api/i18n/message',
        payload: {
          key: 'kiosk.opening',
          params: { id: '7' }
        }
      });

      const trData = JSON.parse(trResponse.payload);
      expect(trData.message).toContain('7');

      // Test English
      await fastify.inject({
        method: 'POST',
        url: '/api/i18n/kiosk/language',
        payload: { language: 'en' }
      });

      const enResponse = await fastify.inject({
        method: 'POST',
        url: '/api/i18n/message',
        payload: {
          key: 'kiosk.opening',
          params: { id: '7' }
        }
      });

      const enData = JSON.parse(enResponse.payload);
      expect(enData.message).toContain('7');
      expect(enData.message).not.toBe(trData.message);
    });
  });
});
