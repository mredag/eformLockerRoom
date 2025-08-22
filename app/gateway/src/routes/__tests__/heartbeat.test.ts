import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { heartbeatRoutes } from '../heartbeat.js';
import { DatabaseConnection } from '../../../../../shared/database/connection.js';

// Mock the database connection
vi.mock('../../../../../shared/database/connection.js', () => ({
  DatabaseConnection: {
    getInstance: vi.fn(() => ({
      initializeSchema: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn()
    }))
  }
}));

// Mock the HeartbeatManager
const mockHeartbeatManager = {
  start: vi.fn(),
  stop: vi.fn(),
  registerKiosk: vi.fn(),
  updateHeartbeat: vi.fn(),
  getAllKiosks: vi.fn(),
  getKiosksByZone: vi.fn(),
  getAllZones: vi.fn(),
  getStatistics: vi.fn(),
  getPendingCommands: vi.fn(),
  markCommandCompleted: vi.fn(),
  markCommandFailed: vi.fn(),
  updateKioskStatus: vi.fn(),
  clearPendingCommands: vi.fn(),
  getKioskHealth: vi.fn(),
  getPollingConfig: vi.fn()
};

vi.mock('../../../../../shared/services/heartbeat-manager.js', () => ({
  HeartbeatManager: vi.fn(() => mockHeartbeatManager)
}));

describe('Heartbeat Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(heartbeatRoutes);
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Set up default mock return values
    mockHeartbeatManager.getPendingCommands.mockResolvedValue([]);
    mockHeartbeatManager.markCommandCompleted.mockResolvedValue(true);
    mockHeartbeatManager.markCommandFailed.mockResolvedValue(true);
    mockHeartbeatManager.getAllKiosks.mockResolvedValue([]);
    mockHeartbeatManager.getAllZones.mockResolvedValue([]);
    mockHeartbeatManager.getStatistics.mockResolvedValue({});
    mockHeartbeatManager.getKioskHealth.mockResolvedValue({});
    mockHeartbeatManager.clearPendingCommands.mockResolvedValue(0);
    mockHeartbeatManager.getPollingConfig.mockReturnValue({
      heartbeatIntervalMs: 10000,
      pollIntervalMs: 2000
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /register', () => {
    it('should register a new kiosk successfully', async () => {
      const mockKiosk = {
        kiosk_id: 'test-kiosk',
        zone: 'test-zone',
        status: 'online',
        version: '1.0.0',
        last_seen: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };

      mockHeartbeatManager.registerKiosk.mockResolvedValue(mockKiosk);

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: {
          kiosk_id: 'test-kiosk',
          zone: 'test-zone',
          version: '1.0.0',
          hardware_id: 'hw-123'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data.kiosk_id).toBe('test-kiosk');
    });

    it('should return 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: {
          kiosk_id: 'test-kiosk'
          // Missing zone and version
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing required fields');
    });
  });

  describe('POST /heartbeat', () => {
    it('should update heartbeat successfully', async () => {
      const mockKiosk = {
        kiosk_id: 'test-kiosk',
        status: 'online',
        last_seen: new Date()
      };

      const response = await app.inject({
        method: 'POST',
        url: '/heartbeat',
        payload: {
          kiosk_id: 'test-kiosk',
          version: '1.0.0',
          config_hash: 'hash-123'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
    });

    it('should return 400 for missing kiosk_id', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/heartbeat',
        payload: {
          version: '1.0.0'
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing required field: kiosk_id');
    });
  });

  describe('POST /commands/poll', () => {
    it('should return pending commands', async () => {
      const mockCommands = [
        {
          command_id: 'cmd-1',
          command_type: 'open_locker',
          payload: { locker_id: 5 }
        }
      ];

      mockHeartbeatManager.getPendingCommands.mockResolvedValue(mockCommands);

      const response = await app.inject({
        method: 'POST',
        url: '/commands/poll',
        payload: {
          kiosk_id: 'test-kiosk',
          limit: 10
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('should return 400 for missing kiosk_id', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/commands/poll',
        payload: {
          limit: 10
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing required field: kiosk_id');
    });
  });

  describe('POST /commands/complete', () => {
    it('should mark command as completed', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/commands/complete',
        payload: {
          command_id: 'cmd-123',
          success: true
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
    });

    it('should mark command as failed', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/commands/complete',
        payload: {
          command_id: 'cmd-123',
          success: false,
          error: 'Hardware failure'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/commands/complete',
        payload: {
          command_id: 'cmd-123'
          // Missing success field
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing required fields');
    });
  });

  describe('GET /kiosks', () => {
    it('should return all kiosks with statistics', async () => {
      const mockKiosks = [{ kiosk_id: 'test-kiosk', zone: 'test-zone' }];
      const mockZones = ['test-zone'];
      const mockStats = { total: 1, online: 1, offline: 0 };

      mockHeartbeatManager.getAllKiosks.mockResolvedValue(mockKiosks);
      mockHeartbeatManager.getAllZones.mockResolvedValue(mockZones);
      mockHeartbeatManager.getStatistics.mockResolvedValue(mockStats);

      const response = await app.inject({
        method: 'GET',
        url: '/kiosks'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('kiosks');
      expect(data.data).toHaveProperty('zones');
      expect(data.data).toHaveProperty('statistics');
    });
  });

  describe('GET /kiosks/zone/:zone', () => {
    it('should return kiosks for specific zone', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/kiosks/zone/test-zone'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.zone).toBe('test-zone');
    });
  });

  describe('GET /kiosks/:kioskId/health', () => {
    it('should return kiosk health information', async () => {
      const mockHealth = {
        kiosk: { kiosk_id: 'test-kiosk', status: 'online' },
        commands: []
      };

      mockHeartbeatManager.getKioskHealth.mockResolvedValue(mockHealth);

      const response = await app.inject({
        method: 'GET',
        url: '/kiosks/test-kiosk/health'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('kiosk');
      expect(data.data).toHaveProperty('commands');
    });
  });

  describe('PUT /kiosks/:kioskId/status', () => {
    it('should update kiosk status', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/kiosks/test-kiosk/status',
        payload: {
          status: 'maintenance'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
    });

    it('should return 400 for invalid status', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/kiosks/test-kiosk/status',
        payload: {
          status: 'invalid-status'
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid status');
    });
  });

  describe('POST /kiosks/:kioskId/clear-commands', () => {
    it('should clear pending commands for kiosk', async () => {
      mockHeartbeatManager.clearPendingCommands.mockResolvedValue(3);

      const response = await app.inject({
        method: 'POST',
        url: '/kiosks/test-kiosk/clear-commands'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('cleared_count');
    });
  });

  describe('GET /config/polling', () => {
    it('should return polling configuration', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/config/polling'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('heartbeatIntervalMs');
      expect(data.data).toHaveProperty('pollIntervalMs');
    });
  });
});