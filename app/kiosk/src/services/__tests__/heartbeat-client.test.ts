import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HeartbeatClient } from '../heartbeat-client';
import { Command, CommandType } from '../../../../../src/types/core-entities';

// Mock fetch globally
global.fetch = vi.fn();

describe('HeartbeatClient', () => {
  let heartbeatClient: HeartbeatClient;
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.mocked(fetch);
    mockFetch.mockClear();

    heartbeatClient = new HeartbeatClient({
      gatewayUrl: 'http://localhost:3000',
      kioskId: 'test-kiosk',
      zone: 'test-zone',
      version: '1.0.0',
      heartbeatIntervalMs: 100, // Fast for testing
      pollIntervalMs: 50,       // Fast for testing
      maxRetries: 2,
      retryDelayMs: 100
    });
  });

  afterEach(async () => {
    await heartbeatClient.stop();
    vi.clearAllTimers();
  });

  describe('Registration', () => {
    it('should register kiosk successfully', async () => {
      // Mock registration response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            kiosk_id: 'test-kiosk',
            zone: 'test-zone',
            status: 'online'
          }
        })
      });

      // Mock clear commands response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { cleared_count: 0 }
        })
      });

      await heartbeatClient.start();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/heartbeat/register',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"kiosk_id":"test-kiosk"')
        })
      );

      expect(heartbeatClient.isConnected()).toBe(true);
    });

    it('should handle registration failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await heartbeatClient.start();

      expect(heartbeatClient.isConnected()).toBe(false);
    });

    it('should retry registration on failure', async () => {
      // First call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { kiosk_id: 'test-kiosk' }
        })
      });

      await heartbeatClient.start();

      // Wait for retry
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Heartbeat', () => {
    beforeEach(async () => {
      // Mock successful registration
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { kiosk_id: 'test-kiosk' }
        })
      });

      await heartbeatClient.start();
      mockFetch.mockClear();
    });

    it('should send heartbeat periodically', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      // Wait for heartbeat interval
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/heartbeat/heartbeat',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"kiosk_id":"test-kiosk"')
        })
      );
    });

    it('should update config hash in heartbeat', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      await heartbeatClient.updateConfigHash('new-hash-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/heartbeat/heartbeat',
        expect.objectContaining({
          body: expect.stringContaining('"config_hash":"new-hash-123"')
        })
      );
    });
  });

  describe('Command Polling', () => {
    beforeEach(async () => {
      // Mock successful registration
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { kiosk_id: 'test-kiosk' }
        })
      });

      await heartbeatClient.start();
      mockFetch.mockClear();
    });

    it('should poll for commands periodically', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: []
        })
      });

      // Wait for poll interval
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/heartbeat/commands/poll',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"kiosk_id":"test-kiosk"')
        })
      );
    });

    it('should execute commands when received', async () => {
      const mockCommand: Command = {
        command_id: 'cmd-123',
        kiosk_id: 'test-kiosk',
        command_type: 'open_locker' as CommandType,
        payload: { open_locker: { locker_id: 5 } },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: new Date(),
        created_at: new Date()
      };

      let commandExecuted = false;
      heartbeatClient.registerCommandHandler('open_locker', async (command) => {
        commandExecuted = true;
        expect(command.command_id).toBe('cmd-123');
        return { success: true };
      });

      // Mock command polling response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockCommand]
        })
      });

      // Mock command completion response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      // Wait for poll interval
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(commandExecuted).toBe(true);
      
      // Should mark command as completed
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/heartbeat/commands/complete',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"command_id":"cmd-123"')
        })
      );
    });

    it('should handle command execution failure', async () => {
      const mockCommand: Command = {
        command_id: 'cmd-456',
        kiosk_id: 'test-kiosk',
        command_type: 'open_locker' as CommandType,
        payload: { open_locker: { locker_id: 5 } },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: new Date(),
        created_at: new Date()
      };

      heartbeatClient.registerCommandHandler('open_locker', async () => {
        return { success: false, error: 'Hardware failure' };
      });

      // Mock command polling response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockCommand]
        })
      });

      // Mock command failure response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      // Wait for poll interval
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should mark command as failed
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/heartbeat/commands/complete',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"success":false')
        })
      );
    });

    it('should handle unknown command types', async () => {
      const mockCommand: Command = {
        command_id: 'cmd-789',
        kiosk_id: 'test-kiosk',
        command_type: 'unknown_command' as CommandType,
        payload: {},
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: new Date(),
        created_at: new Date()
      };

      // Mock command polling response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockCommand]
        })
      });

      // Mock command failure response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      // Wait for poll interval
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should mark command as failed with appropriate error
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/heartbeat/commands/complete',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"error":"No handler for command type: unknown_command"')
        })
      );
    });
  });

  describe('Connection Management', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await heartbeatClient.start();

      expect(heartbeatClient.isConnected()).toBe(false);
    });

    it('should stop all timers when stopped', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      await heartbeatClient.start();
      await heartbeatClient.stop();

      expect(heartbeatClient.isConnected()).toBe(false);
    });
  });

  describe('Hardware ID Generation', () => {
    it('should generate consistent hardware ID', () => {
      const client1 = new HeartbeatClient({
        gatewayUrl: 'http://localhost:3000',
        kioskId: 'test-kiosk',
        zone: 'test-zone',
        version: '1.0.0',
        heartbeatIntervalMs: 10000,
        pollIntervalMs: 2000,
        maxRetries: 3,
        retryDelayMs: 5000
      });

      const client2 = new HeartbeatClient({
        gatewayUrl: 'http://localhost:3000',
        kioskId: 'test-kiosk',
        zone: 'test-zone',
        version: '1.0.0',
        heartbeatIntervalMs: 10000,
        pollIntervalMs: 2000,
        maxRetries: 3,
        retryDelayMs: 5000
      });

      // Hardware IDs should be consistent for same machine
      expect(typeof (client1 as any).getHardwareId()).toBe('string');
      expect((client1 as any).getHardwareId()).toBe((client2 as any).getHardwareId());
    });
  });
});