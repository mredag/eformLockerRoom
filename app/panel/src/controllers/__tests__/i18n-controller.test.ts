import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { I18nController } from '../i18n-controller';

describe('I18nController', () => {
  let fastify: FastifyInstance;
  let controller: I18nController;

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    
    // Mock session support
    fastify.decorateRequest('session', null);
    
    controller = new I18nController(fastify);
    await controller.registerRoutes();
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /api/i18n/language', () => {
    it('should return current language and available languages', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/language'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data).toHaveProperty('currentLanguage');
      expect(data).toHaveProperty('availableLanguages');
      expect(data.availableLanguages).toEqual(['tr', 'en']);
      expect(['tr', 'en']).toContain(data.currentLanguage);
    });
  });

  describe('POST /api/i18n/language', () => {
    it('should set language successfully', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/i18n/language',
        payload: { language: 'en' }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.success).toBe(true);
      expect(data.currentLanguage).toBe('en');
    });

    it('should reject invalid language', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/i18n/language',
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
        url: '/api/i18n/language',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/i18n/messages', () => {
    it('should return all messages for current language', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data).toHaveProperty('language');
      expect(data).toHaveProperty('messages');
      expect(data.messages).toHaveProperty('kiosk');
      expect(data.messages).toHaveProperty('panel');
      expect(data.messages).toHaveProperty('qr');
    });

    it('should return Turkish messages by default', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages'
      });

      const data = JSON.parse(response.payload);
      expect(data.language).toBe('tr');
      expect(data.messages.panel.dashboard).toBe('Ana Sayfa');
    });

    it('should return English messages when language is set', async () => {
      // Set language to English
      await fastify.inject({
        method: 'POST',
        url: '/api/i18n/language',
        payload: { language: 'en' }
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages'
      });

      const data = JSON.parse(response.payload);
      expect(data.language).toBe('en');
      expect(data.messages.panel.dashboard).toBe('Dashboard');
    });
  });

  describe('GET /api/i18n/messages/:section', () => {
    it('should return panel section messages', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages/panel'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.section).toBe('panel');
      expect(data.messages).toHaveProperty('dashboard');
      expect(data.messages).toHaveProperty('login');
      expect(data.messages).toHaveProperty('logout');
    });

    it('should return kiosk section messages', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages/kiosk'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.section).toBe('kiosk');
      expect(data.messages).toHaveProperty('scan_card');
      expect(data.messages).toHaveProperty('loading');
    });

    it('should return QR section messages', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages/qr'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.section).toBe('qr');
      expect(data.messages).toHaveProperty('vip_blocked');
      expect(data.messages).toHaveProperty('network_required');
    });

    it('should return 404 for non-existent section', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages/nonexistent'
      });

      expect(response.statusCode).toBe(404);
      const data = JSON.parse(response.payload);
      expect(data.error).toBe('Section not found');
    });
  });

  describe('Panel Message Completeness', () => {
    it('should have all required navigation messages', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages/panel'
      });

      const data = JSON.parse(response.payload);
      const messages = data.messages;

      const navigationMessages = [
        'dashboard',
        'lockers',
        'vip_contracts',
        'events',
        'settings',
        'logout'
      ];

      for (const messageKey of navigationMessages) {
        expect(messages).toHaveProperty(messageKey);
        expect(typeof messages[messageKey]).toBe('string');
        expect(messages[messageKey].length).toBeGreaterThan(0);
      }
    });

    it('should have all required authentication messages', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages/panel'
      });

      const data = JSON.parse(response.payload);
      const messages = data.messages;

      const authMessages = [
        'login',
        'username',
        'password',
        'login_failed',
        'session_expired',
        'access_denied'
      ];

      for (const messageKey of authMessages) {
        expect(messages).toHaveProperty(messageKey);
        expect(typeof messages[messageKey]).toBe('string');
        expect(messages[messageKey].length).toBeGreaterThan(0);
      }
    });

    it('should have all required locker management messages', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages/panel'
      });

      const data = JSON.parse(response.payload);
      const messages = data.messages;

      const lockerMessages = [
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
        'end_of_day_open'
      ];

      for (const messageKey of lockerMessages) {
        expect(messages).toHaveProperty(messageKey);
        expect(typeof messages[messageKey]).toBe('string');
        expect(messages[messageKey].length).toBeGreaterThan(0);
      }
    });

    it('should have all required VIP management messages', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages/panel'
      });

      const data = JSON.parse(response.payload);
      const messages = data.messages;

      const vipMessages = [
        'create_contract',
        'extend_contract',
        'cancel_contract',
        'change_card',
        'contract_id',
        'rfid_card',
        'backup_card',
        'start_date',
        'end_date',
        'contract_status'
      ];

      for (const messageKey of vipMessages) {
        expect(messages).toHaveProperty(messageKey);
        expect(typeof messages[messageKey]).toBe('string');
        expect(messages[messageKey].length).toBeGreaterThan(0);
      }
    });

    it('should have all required common messages', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages/panel'
      });

      const data = JSON.parse(response.payload);
      const messages = data.messages;

      const commonMessages = [
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

      for (const messageKey of commonMessages) {
        expect(messages).toHaveProperty(messageKey);
        expect(typeof messages[messageKey]).toBe('string');
        expect(messages[messageKey].length).toBeGreaterThan(0);
      }
    });
  });

  describe('Language Consistency', () => {
    it('should have same message keys in both languages', async () => {
      // Get Turkish messages
      await fastify.inject({
        method: 'POST',
        url: '/api/i18n/language',
        payload: { language: 'tr' }
      });

      const trResponse = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages'
      });
      const trData = JSON.parse(trResponse.payload);

      // Get English messages
      await fastify.inject({
        method: 'POST',
        url: '/api/i18n/language',
        payload: { language: 'en' }
      });

      const enResponse = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages'
      });
      const enData = JSON.parse(enResponse.payload);

      // Compare structure
      expect(Object.keys(trData.messages)).toEqual(Object.keys(enData.messages));
      expect(Object.keys(trData.messages.panel).sort()).toEqual(Object.keys(enData.messages.panel).sort());
      expect(Object.keys(trData.messages.kiosk).sort()).toEqual(Object.keys(enData.messages.kiosk).sort());
      expect(Object.keys(trData.messages.qr).sort()).toEqual(Object.keys(enData.messages.qr).sort());
    });

    it('should have different message content for different languages', async () => {
      // Get Turkish messages
      await fastify.inject({
        method: 'POST',
        url: '/api/i18n/language',
        payload: { language: 'tr' }
      });

      const trResponse = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages/panel'
      });
      const trData = JSON.parse(trResponse.payload);

      // Get English messages
      await fastify.inject({
        method: 'POST',
        url: '/api/i18n/language',
        payload: { language: 'en' }
      });

      const enResponse = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/messages/panel'
      });
      const enData = JSON.parse(enResponse.payload);

      // Messages should be different
      expect(trData.messages.dashboard).not.toBe(enData.messages.dashboard);
      expect(trData.messages.login).not.toBe(enData.messages.login);
      expect(trData.messages.save).not.toBe(enData.messages.save);
    });
  });

  describe('Session Integration', () => {
    it('should handle requests without session', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/i18n/language'
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Language Middleware', () => {
    it('should create language middleware', () => {
      const middleware = I18nController.languageMiddleware();
      expect(typeof middleware).toBe('function');
    });
  });
});
