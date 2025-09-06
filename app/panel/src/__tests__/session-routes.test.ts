/**
 * Tests for Session Management Routes
 * Task 25: Build live session monitoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { sessionRoutes } from '../routes/session-routes';
import { SmartSessionManager } from '../../../../shared/services/smart-session-manager';
import { ConfigurationManager } from '../../../../shared/services/configuration-manager';

describe('Session Routes', () => {
  let fastify: FastifyInstance;
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    // Create test Fastify instance
    fastify = Fastify({ logger: false });
    
    // Mock database manager
    dbManager = {
      all: vi.fn(),
      get: vi.fn(),
      run: vi.fn(),
      getConnection: vi.fn()
    } as any;

    // Mock authentication middleware
    fastify.addHook('preHandler', async (request, reply) => {
      (request as any).user = { username: 'test-admin', role: 'admin' };
    });

    // Register session routes
    await fastify.register(sessionRoutes, { dbManager });
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /live', () => {
    it('should return live sessions', async () => {
      // Mock database response
      const mockSessions = [
        {
          id: 'session-1',
          card_id: '0009652489',
          kiosk_id: 'kiosk-1',
          locker_id: 5,
          start_time: new Date().toISOString(),
          expires_time: new Date(Date.now() + 3600000).toISOString(),
          status: 'active',
          extension_count: 0,
          max_extensions: 4,
          last_seen: new Date().toISOString(),
          locker_display_name: 'Dolap 5',
          locker_status: 'Owned'
        }
      ];

      dbManager.all = vi.fn().mockResolvedValue(mockSessions);

      const response = await fastify.inject({
        method: 'GET',
        url: '/live'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.sessions).toHaveLength(1);
      expect(data.sessions[0].cardId).toBe('0009652489');
      expect(data.sessions[0].kioskId).toBe('kiosk-1');
      expect(data.sessions[0].lockerId).toBe(5);
    });

    it('should handle empty sessions', async () => {
      dbManager.all = vi.fn().mockResolvedValue([]);

      const response = await fastify.inject({
        method: 'GET',
        url: '/live'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.sessions).toHaveLength(0);
    });

    it('should handle database errors', async () => {
      dbManager.all = vi.fn().mockRejectedValue(new Error('Database error'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/live'
      });

      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.payload);
      expect(data.code).toBe('server_error');
    });
  });

  describe('GET /:sessionId', () => {
    it('should return session details', async () => {
      const mockSession = {
        id: 'session-1',
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        locker_id: 5,
        start_time: new Date().toISOString(),
        limit_time: new Date().toISOString(),
        expires_time: new Date(Date.now() + 3600000).toISOString(),
        status: 'active',
        extension_count: 1,
        max_extensions: 4,
        last_seen: new Date().toISOString()
      };

      const mockLocker = {
        display_name: 'Dolap 5',
        status: 'Owned'
      };

      const mockExtensionHistory = [
        {
          admin_user: 'test-admin',
          extension_minutes: 60,
          total_minutes: 240,
          reason: 'User requested more time',
          timestamp: new Date().toISOString()
        }
      ];

      // Mock SmartSessionManager
      const mockSmartSessionManager = {
        getSession: vi.fn().mockResolvedValue(mockSession),
        getRemainingMinutes: vi.fn().mockReturnValue(45),
        canExtendSession: vi.fn().mockReturnValue(true)
      };

      // Mock database calls
      dbManager.get = vi.fn()
        .mockResolvedValueOnce(mockLocker) // First call for locker info
        .mockResolvedValueOnce(mockExtensionHistory[0]); // Second call for extension history
      
      dbManager.all = vi.fn().mockResolvedValue(mockExtensionHistory);

      const response = await fastify.inject({
        method: 'GET',
        url: '/session-1'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.session.id).toBe('session-1');
      expect(data.session.remainingMinutes).toBe(45);
      expect(data.session.canExtend).toBe(true);
      expect(data.session.locker.displayName).toBe('Dolap 5');
      expect(data.session.extensionHistory).toHaveLength(1);
    });

    it('should return 404 for non-existent session', async () => {
      // Mock SmartSessionManager to return null
      const mockSmartSessionManager = {
        getSession: vi.fn().mockResolvedValue(null)
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/non-existent-session'
      });

      expect(response.statusCode).toBe(404);
      const data = JSON.parse(response.payload);
      expect(data.code).toBe('not_found');
    });
  });

  describe('POST /:sessionId/extend', () => {
    it('should extend session successfully', async () => {
      const mockSession = {
        id: 'session-1',
        extensionCount: 1,
        status: 'active'
      };

      // Mock SmartSessionManager
      const mockSmartSessionManager = {
        extendSession: vi.fn().mockResolvedValue(true),
        getSession: vi.fn().mockResolvedValue(mockSession),
        getRemainingMinutes: vi.fn().mockReturnValue(120)
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/session-1/extend',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'test-token'
        },
        payload: {
          reason: 'User needs more time to complete task'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Oturum 60 dakika uzatıldı');
      expect(data.remainingMinutes).toBe(120);
      expect(data.extensionCount).toBe(1);
    });

    it('should fail when extension limit reached', async () => {
      // Mock SmartSessionManager to return false (extension failed)
      const mockSmartSessionManager = {
        extendSession: vi.fn().mockResolvedValue(false)
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/session-1/extend',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'test-token'
        },
        payload: {
          reason: 'User needs more time'
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.code).toBe('bad_request');
      expect(data.message).toContain('uzatılamadı');
    });

    it('should require reason for extension', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/session-1/extend',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'test-token'
        },
        payload: {}
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /:sessionId/cancel', () => {
    it('should cancel session successfully', async () => {
      // Mock SmartSessionManager
      const mockSmartSessionManager = {
        completeSession: vi.fn().mockResolvedValue(undefined)
      };

      dbManager.run = vi.fn().mockResolvedValue({ changes: 1 });

      const response = await fastify.inject({
        method: 'POST',
        url: '/session-1/cancel',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'test-token'
        },
        payload: {
          reason: 'User requested cancellation'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Oturum iptal edildi');
    });

    it('should cancel session without reason', async () => {
      // Mock SmartSessionManager
      const mockSmartSessionManager = {
        completeSession: vi.fn().mockResolvedValue(undefined)
      };

      dbManager.run = vi.fn().mockResolvedValue({ changes: 1 });

      const response = await fastify.inject({
        method: 'POST',
        url: '/session-1/cancel',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'test-token'
        },
        payload: {}
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
    });
  });

  describe('GET /history', () => {
    it('should return session history with pagination', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          card_id: '0009652489',
          kiosk_id: 'kiosk-1',
          locker_id: 5,
          status: 'completed',
          start_time: new Date().toISOString(),
          expires_time: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          locker_display_name: 'Dolap 5',
          extension_count_actual: 1
        }
      ];

      const mockTotal = { total: 1 };

      dbManager.all = vi.fn().mockResolvedValue(mockSessions);
      dbManager.get = vi.fn().mockResolvedValue(mockTotal);

      const response = await fastify.inject({
        method: 'GET',
        url: '/history?limit=10&offset=0'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.sessions).toHaveLength(1);
      expect(data.pagination.total).toBe(1);
      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.offset).toBe(0);
    });

    it('should filter by kiosk ID', async () => {
      dbManager.all = vi.fn().mockResolvedValue([]);
      dbManager.get = vi.fn().mockResolvedValue({ total: 0 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/history?kioskId=kiosk-1'
      });

      expect(response.statusCode).toBe(200);
      expect(dbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ss.kiosk_id = ?'),
        expect.arrayContaining(['kiosk-1'])
      );
    });
  });

  describe('GET /analytics', () => {
    it('should return session analytics', async () => {
      const mockStats = {
        total_sessions: 10,
        active_sessions: 2,
        completed_sessions: 7,
        overdue_sessions: 1,
        cancelled_sessions: 0,
        avg_duration_minutes: 150
      };

      const mockExtensionStats = {
        total_extensions: 5,
        avg_extension_minutes: 60,
        total_extension_minutes: 300
      };

      const mockHourlyDistribution = [
        { hour: '09', session_count: 3 },
        { hour: '10', session_count: 5 },
        { hour: '11', session_count: 2 }
      ];

      dbManager.get = vi.fn()
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockExtensionStats);
      
      dbManager.all = vi.fn().mockResolvedValue(mockHourlyDistribution);

      const response = await fastify.inject({
        method: 'GET',
        url: '/analytics?period=day'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.period).toBe('day');
      expect(data.stats.totalSessions).toBe(10);
      expect(data.stats.activeSessions).toBe(2);
      expect(data.stats.avgDurationMinutes).toBe(150);
      expect(data.stats.totalExtensions).toBe(5);
      expect(data.hourlyDistribution).toHaveLength(3);
    });

    it('should filter analytics by kiosk', async () => {
      const mockStats = {
        total_sessions: 5,
        active_sessions: 1,
        completed_sessions: 4,
        overdue_sessions: 0,
        cancelled_sessions: 0,
        avg_duration_minutes: 120
      };

      dbManager.get = vi.fn().mockResolvedValue(mockStats);
      dbManager.all = vi.fn().mockResolvedValue([]);

      const response = await fastify.inject({
        method: 'GET',
        url: '/analytics?period=week&kioskId=kiosk-1'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.period).toBe('week');
      expect(data.kioskId).toBe('kiosk-1');
    });
  });
});