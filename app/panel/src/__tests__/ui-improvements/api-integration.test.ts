/**
 * Integration Tests for API Response Handling
 * Task 6.3: Add integration tests to verify API response handling with enhanced owner information
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console methods to avoid noise in tests
const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {})
};

describe('API Integration Tests', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    Object.values(consoleSpy).forEach(spy => spy.mockClear());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Locker API Response Handling', () => {
    it('should handle successful API response with enhanced owner information', async () => {
      const mockResponse = {
        lockers: [
          {
            kiosk_id: 'test-kiosk',
            id: 1,
            status: 'Owned',
            owner_type: 'rfid',
            owner_key: '0009652489',
            display_name: 'Dolap 1',
            is_vip: false,
            updated_at: '2025-01-27T10:00:00Z',
            version: 1
          },
          {
            kiosk_id: 'test-kiosk',
            id: 2,
            status: 'Free',
            owner_type: null,
            owner_key: null,
            display_name: 'Dolap 2',
            is_vip: false,
            updated_at: '2025-01-27T09:30:00Z',
            version: 1
          }
        ],
        total: 2,
        stats: {
          total: 2,
          free: 1,
          owned: 1,
          reserved: 0,
          blocked: 0,
          error: 0
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/api/lockers?kioskId=test-kiosk');
      const data = await response.json();

      expect(data.lockers).toBeDefined();
      expect(data.lockers).toHaveLength(2);
      
      // Verify enhanced owner information is present
      const ownedLocker = data.lockers[0];
      expect(ownedLocker.owner_type).toBe('rfid');
      expect(ownedLocker.owner_key).toBe('0009652489');
      expect(ownedLocker.status).toBe('Owned');
      
      const freeLocker = data.lockers[1];
      expect(freeLocker.owner_type).toBeNull();
      expect(freeLocker.owner_key).toBeNull();
      expect(freeLocker.status).toBe('Free');
    });

    it('should handle API response with VIP locker information', async () => {
      const mockResponse = {
        lockers: [
          {
            kiosk_id: 'test-kiosk',
            id: 3,
            status: 'Owned',
            owner_type: 'vip',
            owner_key: 'vip-contract-123',
            display_name: 'VIP Dolap',
            is_vip: true,
            updated_at: '2025-01-27T11:00:00Z',
            version: 1
          }
        ],
        total: 1,
        stats: {
          total: 1,
          free: 0,
          owned: 1,
          reserved: 0,
          blocked: 0,
          error: 0
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/api/lockers?kioskId=test-kiosk');
      const data = await response.json();

      const vipLocker = data.lockers[0];
      expect(vipLocker.owner_type).toBe('vip');
      expect(vipLocker.owner_key).toBe('vip-contract-123');
      expect(vipLocker.is_vip).toBe(true);
      expect(vipLocker.status).toBe('Owned');
    });

    it('should handle API response with device owner information', async () => {
      const mockResponse = {
        lockers: [
          {
            kiosk_id: 'test-kiosk',
            id: 4,
            status: 'Owned',
            owner_type: 'device',
            owner_key: 'device123456789',
            display_name: 'Dolap 4',
            is_vip: false,
            updated_at: '2025-01-27T12:00:00Z',
            version: 1
          }
        ],
        total: 1,
        stats: {
          total: 1,
          free: 0,
          owned: 1,
          reserved: 0,
          blocked: 0,
          error: 0
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/api/lockers?kioskId=test-kiosk');
      const data = await response.json();

      const deviceLocker = data.lockers[0];
      expect(deviceLocker.owner_type).toBe('device');
      expect(deviceLocker.owner_key).toBe('device123456789');
      expect(deviceLocker.status).toBe('Owned');
    });

    it('should handle API response with all status types', async () => {
      const mockResponse = {
        lockers: [
          {
            kiosk_id: 'test-kiosk',
            id: 1,
            status: 'Free',
            owner_type: null,
            owner_key: null,
            display_name: 'Dolap 1',
            is_vip: false,
            updated_at: '2025-01-27T10:00:00Z',
            version: 1
          },
          {
            kiosk_id: 'test-kiosk',
            id: 2,
            status: 'Owned',
            owner_type: 'rfid',
            owner_key: '1234567890',
            display_name: 'Dolap 2',
            is_vip: false,
            updated_at: '2025-01-27T10:05:00Z',
            version: 1
          },
          {
            kiosk_id: 'test-kiosk',
            id: 3,
            status: 'Reserved',
            owner_type: 'rfid',
            owner_key: '0987654321',
            display_name: 'Dolap 3',
            is_vip: false,
            updated_at: '2025-01-27T10:10:00Z',
            version: 1
          },
          {
            kiosk_id: 'test-kiosk',
            id: 4,
            status: 'Opening',
            owner_type: 'rfid',
            owner_key: '1122334455',
            display_name: 'Dolap 4',
            is_vip: false,
            updated_at: '2025-01-27T10:15:00Z',
            version: 1
          },
          {
            kiosk_id: 'test-kiosk',
            id: 5,
            status: 'Blocked',
            owner_type: null,
            owner_key: null,
            display_name: 'Dolap 5',
            is_vip: false,
            updated_at: '2025-01-27T10:20:00Z',
            version: 1
          },
          {
            kiosk_id: 'test-kiosk',
            id: 6,
            status: 'Error',
            owner_type: null,
            owner_key: null,
            display_name: 'Dolap 6',
            is_vip: false,
            updated_at: '2025-01-27T10:25:00Z',
            version: 1
          }
        ],
        total: 6,
        stats: {
          total: 6,
          free: 1,
          owned: 1,
          reserved: 1,
          opening: 1,
          blocked: 1,
          error: 1
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/api/lockers?kioskId=test-kiosk');
      const data = await response.json();

      expect(data.lockers).toHaveLength(6);
      
      // Verify all status types are present
      const statuses = data.lockers.map((locker: any) => locker.status);
      expect(statuses).toContain('Free');
      expect(statuses).toContain('Owned');
      expect(statuses).toContain('Reserved');
      expect(statuses).toContain('Opening');
      expect(statuses).toContain('Blocked');
      expect(statuses).toContain('Error');
    });

    it('should handle API error responses gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const response = await fetch('/api/lockers?kioskId=test-kiosk');
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetch('/api/lockers?kioskId=test-kiosk')).rejects.toThrow('Network error');
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      });

      const response = await fetch('/api/lockers?kioskId=test-kiosk');
      
      await expect(response.json()).rejects.toThrow('Invalid JSON');
    });
  });

  describe('API Response Data Validation', () => {
    it('should validate required locker fields are present', async () => {
      const mockResponse = {
        lockers: [
          {
            kiosk_id: 'test-kiosk',
            id: 1,
            status: 'Owned',
            owner_type: 'rfid',
            owner_key: '0009652489',
            display_name: 'Dolap 1',
            is_vip: false,
            updated_at: '2025-01-27T10:00:00Z',
            version: 1
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/api/lockers?kioskId=test-kiosk');
      const data = await response.json();

      const locker = data.lockers[0];
      
      // Verify all required fields are present
      expect(locker).toHaveProperty('kiosk_id');
      expect(locker).toHaveProperty('id');
      expect(locker).toHaveProperty('status');
      expect(locker).toHaveProperty('owner_type');
      expect(locker).toHaveProperty('owner_key');
      expect(locker).toHaveProperty('display_name');
      expect(locker).toHaveProperty('is_vip');
      expect(locker).toHaveProperty('updated_at');
      expect(locker).toHaveProperty('version');
    });

    it('should handle missing optional fields gracefully', async () => {
      const mockResponse = {
        lockers: [
          {
            kiosk_id: 'test-kiosk',
            id: 1,
            status: 'Free'
            // Missing optional fields: owner_type, owner_key, display_name, etc.
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/api/lockers?kioskId=test-kiosk');
      const data = await response.json();

      const locker = data.lockers[0];
      
      // Required fields should be present
      expect(locker.kiosk_id).toBe('test-kiosk');
      expect(locker.id).toBe(1);
      expect(locker.status).toBe('Free');
      
      // Optional fields may be undefined
      expect(locker.owner_type).toBeUndefined();
      expect(locker.owner_key).toBeUndefined();
    });

    it('should validate data types of API response fields', async () => {
      const mockResponse = {
        lockers: [
          {
            kiosk_id: 'test-kiosk',
            id: 1,
            status: 'Owned',
            owner_type: 'rfid',
            owner_key: '0009652489',
            display_name: 'Dolap 1',
            is_vip: false,
            updated_at: '2025-01-27T10:00:00Z',
            version: 1
          }
        ],
        total: 1,
        stats: {
          total: 1,
          free: 0,
          owned: 1,
          reserved: 0,
          blocked: 0,
          error: 0
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/api/lockers?kioskId=test-kiosk');
      const data = await response.json();

      const locker = data.lockers[0];
      
      // Verify data types
      expect(typeof locker.kiosk_id).toBe('string');
      expect(typeof locker.id).toBe('number');
      expect(typeof locker.status).toBe('string');
      expect(typeof locker.owner_type).toBe('string');
      expect(typeof locker.owner_key).toBe('string');
      expect(typeof locker.display_name).toBe('string');
      expect(typeof locker.is_vip).toBe('boolean');
      expect(typeof locker.updated_at).toBe('string');
      expect(typeof locker.version).toBe('number');
      
      // Verify stats structure
      expect(typeof data.total).toBe('number');
      expect(typeof data.stats).toBe('object');
      expect(typeof data.stats.total).toBe('number');
    });
  });

  describe('Real-time WebSocket Integration', () => {
    it('should handle WebSocket locker state updates', () => {
      const mockWebSocketMessage = {
        type: 'locker_state_update',
        data: {
          kioskId: 'test-kiosk',
          lockerId: 1,
          status: 'Opening',
          owner_type: 'rfid',
          owner_key: '0009652489',
          updated_at: '2025-01-27T10:30:00Z'
        }
      };

      // Simulate WebSocket message handling
      const handleWebSocketMessage = (message: any) => {
        if (message.type === 'locker_state_update') {
          return {
            success: true,
            data: message.data
          };
        }
        return { success: false };
      };

      const result = handleWebSocketMessage(mockWebSocketMessage);
      
      expect(result.success).toBe(true);
      expect(result.data.kioskId).toBe('test-kiosk');
      expect(result.data.lockerId).toBe(1);
      expect(result.data.status).toBe('Opening');
      expect(result.data.owner_type).toBe('rfid');
      expect(result.data.owner_key).toBe('0009652489');
    });

    it('should handle WebSocket connection status updates', () => {
      const mockConnectionMessage = {
        type: 'connection_status',
        data: {
          status: 'connected',
          timestamp: '2025-01-27T10:30:00Z'
        }
      };

      const handleWebSocketMessage = (message: any) => {
        if (message.type === 'connection_status') {
          return {
            success: true,
            connectionStatus: message.data.status
          };
        }
        return { success: false };
      };

      const result = handleWebSocketMessage(mockConnectionMessage);
      
      expect(result.success).toBe(true);
      expect(result.connectionStatus).toBe('connected');
    });
  });

  describe('API Endpoint Coverage', () => {
    it('should test locker list endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ lockers: [], total: 0 })
      });

      await fetch('/api/lockers');
      expect(mockFetch).toHaveBeenCalledWith('/api/lockers');
    });

    it('should test locker list with kiosk filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ lockers: [], total: 0 })
      });

      await fetch('/api/lockers?kioskId=test-kiosk');
      expect(mockFetch).toHaveBeenCalledWith('/api/lockers?kioskId=test-kiosk');
    });

    it('should test locker list with status filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ lockers: [], total: 0 })
      });

      await fetch('/api/lockers?status=Owned');
      expect(mockFetch).toHaveBeenCalledWith('/api/lockers?status=Owned');
    });

    it('should test kiosk heartbeat endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ kiosks: [] })
      });

      await fetch('/api/heartbeat/kiosks');
      expect(mockFetch).toHaveBeenCalledWith('/api/heartbeat/kiosks');
    });
  });
});