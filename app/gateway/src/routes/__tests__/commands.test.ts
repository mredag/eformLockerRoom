/**
 * Command Routes Tests
 * 
 * Tests for command API endpoints
 * Requirements: 8.1, 8.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { commandRoutes } from '../commands';

// Mock the command bus
const mockExecuteCommand = vi.fn();
const mockGetCommandHistory = vi.fn();
const mockGetCommandStats = vi.fn();

vi.mock('../../services/command-bus', () => ({
  CommandBus: vi.fn().mockImplementation(() => ({
    executeCommand: mockExecuteCommand,
    getCommandHistory: mockGetCommandHistory,
    getCommandStats: mockGetCommandStats
  }))
}));

describe('Command Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    
    // Mock session middleware
    app.decorateRequest('session', null);
    app.addHook('preHandler', async (request) => {
      request.session = {
        user: {
          username: 'admin',
          role: 'admin'
        }
      };
    });

    await app.register(commandRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('POST /api/commands/execute', () => {
    it('should execute a valid open command', async () => {
      mockExecuteCommand.mockResolvedValue({
        commandId: 'cmd-123',
        queued: true,
        result: {
          success: true,
          message: 'Locker 1 opened successfully',
          executionTimeMs: 150
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/commands/execute',
        payload: {
          type: 'open',
          kioskId: 'kiosk-1',
          lockerId: 1
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.commandId).toBe('cmd-123');
      expect(data.queued).toBe(true);
      expect(data.result.success).toBe(true);
    });

    it('should execute a valid buzzer command', async () => {
      mockExecuteCommand.mockResolvedValue({
        commandId: 'cmd-124',
        queued: true,
        result: {
          success: true,
          message: 'Buzzer activated successfully',
          executionTimeMs: 100
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/commands/execute',
        payload: {
          type: 'buzzer',
          kioskId: 'kiosk-1'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.result.message).toContain('Buzzer activated');
    });

    it('should reject invalid command type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/commands/execute',
        payload: {
          type: 'invalid',
          kioskId: 'kiosk-1'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject command without kiosk ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/commands/execute',
        payload: {
          type: 'open',
          lockerId: 1
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject command with invalid locker ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/commands/execute',
        payload: {
          type: 'open',
          kioskId: 'kiosk-1',
          lockerId: 31 // Invalid (max is 30)
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle validation errors', async () => {
      mockExecuteCommand.mockRejectedValue(
        new Error('Command validation failed: Invalid locker ID')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/commands/execute',
        payload: {
          type: 'open',
          kioskId: 'kiosk-1',
          lockerId: 1
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toContain('validation failed');
    });

    it('should handle authorization errors', async () => {
      mockExecuteCommand.mockRejectedValue(
        new Error('Command authorization failed: Insufficient permissions')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/commands/execute',
        payload: {
          type: 'open',
          kioskId: 'kiosk-1',
          lockerId: 1
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toContain('authorization failed');
    });

    it('should handle internal server errors', async () => {
      mockExecuteCommand.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/commands/execute',
        payload: {
          type: 'open',
          kioskId: 'kiosk-1',
          lockerId: 1
        }
      });

      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Internal server error');
    });

    it('should require authentication', async () => {
      // Create app without session mock
      const unauthApp = Fastify();
      unauthApp.decorateRequest('session', null);
      await unauthApp.register(commandRoutes);
      await unauthApp.ready();

      const response = await unauthApp.inject({
        method: 'POST',
        url: '/api/commands/execute',
        payload: {
          type: 'open',
          kioskId: 'kiosk-1',
          lockerId: 1
        }
      });

      expect(response.statusCode).toBe(401);
      const data = JSON.parse(response.payload);
      expect(data.error).toContain('Authentication required');

      await unauthApp.close();
    });
  });

  describe('GET /api/commands/history', () => {
    it('should return command history', async () => {
      const mockHistory = [
        {
          id: 1,
          command_id: 'cmd-1',
          kiosk_id: 'kiosk-1',
          command_type: 'open',
          success: 1,
          created_at: '2024-01-01T10:00:00Z'
        },
        {
          id: 2,
          command_id: 'cmd-2',
          kiosk_id: 'kiosk-1',
          command_type: 'buzzer',
          success: 1,
          created_at: '2024-01-01T10:05:00Z'
        }
      ];

      mockGetCommandHistory.mockResolvedValue(mockHistory);

      const response = await app.inject({
        method: 'GET',
        url: '/api/commands/history?kioskId=kiosk-1&limit=10'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockHistory);
      expect(mockGetCommandHistory).toHaveBeenCalledWith('kiosk-1', 10);
    });

    it('should return all history when no kiosk ID specified', async () => {
      const mockHistory = [
        {
          id: 1,
          command_id: 'cmd-1',
          kiosk_id: 'kiosk-1',
          command_type: 'open',
          success: 1,
          created_at: '2024-01-01T10:00:00Z'
        }
      ];

      mockGetCommandHistory.mockResolvedValue(mockHistory);

      const response = await app.inject({
        method: 'GET',
        url: '/api/commands/history'
      });

      expect(response.statusCode).toBe(200);
      expect(mockGetCommandHistory).toHaveBeenCalledWith(undefined, 50);
    });

    it('should handle database errors', async () => {
      mockGetCommandHistory.mockRejectedValue(
        new Error('Database error')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/commands/history'
      });

      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Failed to retrieve command history');
    });
  });

  describe('GET /api/commands/stats', () => {
    it('should return command statistics', async () => {
      const mockStats = {
        total: 100,
        successful: 85,
        failed: 10,
        queued: 5,
        successRate: 89.47
      };

      mockGetCommandStats.mockResolvedValue(mockStats);

      const response = await app.inject({
        method: 'GET',
        url: '/api/commands/stats?kioskId=kiosk-1'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockStats);
      expect(mockGetCommandStats).toHaveBeenCalledWith('kiosk-1');
    });

    it('should return global stats when no kiosk ID specified', async () => {
      const mockStats = {
        total: 200,
        successful: 180,
        failed: 15,
        queued: 5,
        successRate: 92.31
      };

      mockGetCommandStats.mockResolvedValue(mockStats);

      const response = await app.inject({
        method: 'GET',
        url: '/api/commands/stats'
      });

      expect(response.statusCode).toBe(200);
      expect(mockGetCommandStats).toHaveBeenCalledWith(undefined);
    });

    it('should handle database errors', async () => {
      mockGetCommandStats.mockRejectedValue(
        new Error('Database error')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/commands/stats'
      });

      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Failed to retrieve command statistics');
    });
  });

  describe('GET /api/commands/health', () => {
    it('should return healthy status', async () => {
      mockGetCommandStats.mockResolvedValue({
        total: 100,
        successful: 90,
        failed: 10,
        queued: 0,
        successRate: 90
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/commands/health'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.status).toBe('healthy');
      expect(data.stats.totalCommands).toBe(100);
      expect(data.stats.successRate).toBe(90);
    });

    it('should return unhealthy status on error', async () => {
      mockGetCommandStats.mockRejectedValue(
        new Error('Health check failed')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/commands/health'
      });

      expect(response.statusCode).toBe(503);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.status).toBe('unhealthy');
      expect(data.error).toContain('Command bus health check failed');
    });
  });
});