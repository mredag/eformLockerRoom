/**
 * Command Bus Service Tests
 * 
 * Tests for command validation, authorization, queuing, and execution tracking
 * Requirements: 8.1, 8.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandBus, RemoteCommand, RemoteCommandType } from '../command-bus';
import { CommandQueueManager } from '../../../../../shared/services/command-queue-manager';
import { EventService } from '../event-service';
import { WebSocketManager } from '../websocket-manager';
import { DatabaseConnection } from '../../../../../shared/database/connection';

// Mock dependencies
vi.mock('../../../../../shared/services/command-queue-manager');
vi.mock('../event-service');
vi.mock('../websocket-manager');
vi.mock('../../../../../shared/database/connection');

describe('CommandBus', () => {
  let commandBus: CommandBus;
  let mockCommandQueue: CommandQueueManager;
  let mockEventService: EventService;
  let mockWebSocketManager: WebSocketManager;
  let mockDb: DatabaseConnection;

  beforeEach(() => {
    // Create mock instances
    mockDb = {
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn()
    } as any;

    mockCommandQueue = {
      enqueueCommand: vi.fn(),
      markCommandCompleted: vi.fn(),
      markCommandFailed: vi.fn()
    } as any;

    mockEventService = {
      emitEvent: vi.fn()
    } as any;

    mockWebSocketManager = {
      broadcast: vi.fn()
    } as any;

    // Create command bus with mocked dependencies
    commandBus = new CommandBus({
      commandQueue: mockCommandQueue,
      eventService: mockEventService,
      webSocketManager: mockWebSocketManager,
      db: mockDb
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Command Validation', () => {
    it('should validate required fields', async () => {
      const invalidCommand: Partial<RemoteCommand> = {
        type: 'open',
        // Missing required fields
      };

      await expect(
        commandBus.executeCommand(invalidCommand as RemoteCommand)
      ).rejects.toThrow('Command validation failed');
    });

    it('should validate command type', async () => {
      const invalidCommand: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'invalid' as RemoteCommandType,
        kioskId: 'kiosk-1',
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      await expect(
        commandBus.executeCommand(invalidCommand)
      ).rejects.toThrow('Unsupported command type');
    });

    it('should validate locker ID for open command', async () => {
      const invalidCommand: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 31, // Invalid locker ID (max is 30)
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      await expect(
        commandBus.executeCommand(invalidCommand)
      ).rejects.toThrow('Valid locker ID (1-30) is required');
    });

    it('should validate kiosk exists and is online', async () => {
      // Mock kiosk not found
      mockDb.get.mockResolvedValue(null);

      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'open',
        kioskId: 'nonexistent-kiosk',
        lockerId: 1,
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      await expect(
        commandBus.executeCommand(command)
      ).rejects.toThrow('Kiosk nonexistent-kiosk not found or offline');
    });

    it('should pass validation for valid open command', async () => {
      // Mock successful validation
      mockDb.get
        .mockResolvedValueOnce({ kiosk_id: 'kiosk-1' }) // Kiosk exists
        .mockResolvedValueOnce({ id: 1 }) // User exists
        .mockResolvedValueOnce({ status: 'online' }) // Kiosk status
        .mockResolvedValueOnce({ status: 'Free' }); // Locker status

      mockCommandQueue.enqueueCommand.mockResolvedValue('queue-cmd-1');
      mockDb.run.mockResolvedValue({ changes: 1 });

      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 1,
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      const result = await commandBus.executeCommand(command);
      expect(result.queued).toBe(true);
      expect(result.commandId).toBe('test-cmd-1');
    });
  });

  describe('Command Authorization', () => {
    it('should reject command if user has no permission', async () => {
      // Mock user not found (no permission)
      mockDb.get
        .mockResolvedValueOnce({ kiosk_id: 'kiosk-1' }) // Kiosk exists (validation)
        .mockResolvedValueOnce(null); // User not found (authorization)

      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 1,
        issuedBy: 'unauthorized-user',
        issuedAt: new Date()
      };

      await expect(
        commandBus.executeCommand(command)
      ).rejects.toThrow('User does not have remote control permissions');
    });

    it('should reject command if kiosk is in maintenance', async () => {
      mockDb.get
        .mockResolvedValueOnce({ kiosk_id: 'kiosk-1' }) // Kiosk exists (validation)
        .mockResolvedValueOnce({ id: 1 }) // User exists (authorization)
        .mockResolvedValueOnce({ status: 'maintenance' }); // Kiosk in maintenance (authorization)

      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 1,
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      await expect(
        commandBus.executeCommand(command)
      ).rejects.toThrow('Kiosk is in maintenance state');
    });

    it('should reject open command if locker is already opening', async () => {
      mockDb.get
        .mockResolvedValueOnce({ kiosk_id: 'kiosk-1' }) // Kiosk exists (validation)
        .mockResolvedValueOnce({ id: 1 }) // User exists (authorization)
        .mockResolvedValueOnce({ status: 'online' }) // Kiosk status (authorization)
        .mockResolvedValueOnce({ status: 'Opening' }); // Locker already opening (authorization)

      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 1,
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      await expect(
        commandBus.executeCommand(command)
      ).rejects.toThrow('Locker is already opening');
    });
  });

  describe('Command Execution', () => {
    beforeEach(() => {
      // Mock successful validation and authorization
      mockDb.get
        .mockResolvedValueOnce({ kiosk_id: 'kiosk-1' }) // Kiosk exists
        .mockResolvedValueOnce({ id: 1 }) // User exists
        .mockResolvedValueOnce({ status: 'online' }) // Kiosk status
        .mockResolvedValueOnce({ status: 'Free' }); // Locker status

      mockCommandQueue.enqueueCommand.mockResolvedValue('queue-cmd-1');
      mockDb.run.mockResolvedValue({ changes: 1 });
    });

    it('should execute open command successfully', async () => {
      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 1,
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      const result = await commandBus.executeCommand(command);

      expect(result.queued).toBe(true);
      expect(result.result?.success).toBe(true);
      expect(result.result?.message).toContain('Locker 1 opened successfully');
      expect(mockCommandQueue.markCommandCompleted).toHaveBeenCalledWith('queue-cmd-1');
    });

    it('should execute buzzer command successfully', async () => {
      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'buzzer',
        kioskId: 'kiosk-1',
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      const result = await commandBus.executeCommand(command);

      expect(result.queued).toBe(true);
      expect(result.result?.success).toBe(true);
      expect(result.result?.message).toContain('Buzzer activated successfully');
    });

    it('should handle command execution failure', async () => {
      // Mock command queue to throw error
      mockCommandQueue.markCommandCompleted.mockRejectedValue(new Error('Execution failed'));

      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 1,
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      await expect(
        commandBus.executeCommand(command)
      ).rejects.toThrow('Execution failed');

      expect(mockCommandQueue.markCommandFailed).toHaveBeenCalledWith('queue-cmd-1', 'Execution failed');
    });
  });

  describe('Command Logging', () => {
    beforeEach(() => {
      // Mock successful validation and authorization
      mockDb.get
        .mockResolvedValueOnce({ kiosk_id: 'kiosk-1' }) // Kiosk exists
        .mockResolvedValueOnce({ id: 1 }) // User exists
        .mockResolvedValueOnce({ status: 'online' }) // Kiosk status
        .mockResolvedValueOnce({ status: 'Free' }); // Locker status

      mockCommandQueue.enqueueCommand.mockResolvedValue('queue-cmd-1');
      mockDb.run.mockResolvedValue({ changes: 1 });
    });

    it('should log command execution to database', async () => {
      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 1,
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      await commandBus.executeCommand(command);

      // Should log both queuing and execution
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO command_log'),
        expect.arrayContaining([
          'test-cmd-1',
          'kiosk-1',
          1,
          'open',
          'admin'
        ])
      );
    });

    it('should broadcast command applied event', async () => {
      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 1,
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      await commandBus.executeCommand(command);

      expect(mockWebSocketManager.broadcast).toHaveBeenCalledWith(
        '/ws/events',
        'command_applied',
        expect.objectContaining({
          type: 'command_applied',
          data: expect.objectContaining({
            command: expect.objectContaining({
              id: 'test-cmd-1',
              type: 'open'
            }),
            result: expect.objectContaining({
              success: true
            })
          })
        })
      );
    });
  });

  describe('Command History and Statistics', () => {
    it('should retrieve command history', async () => {
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

      mockDb.all.mockResolvedValue(mockHistory);

      const history = await commandBus.getCommandHistory('kiosk-1', 10);

      expect(history).toEqual(mockHistory);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM command_log WHERE kiosk_id = ?'),
        ['kiosk-1', 10]
      );
    });

    it('should retrieve command statistics', async () => {
      const mockStats = {
        total: 10,
        successful: 8,
        failed: 2,
        queued: 0
      };

      mockDb.get.mockResolvedValue(mockStats);

      const stats = await commandBus.getCommandStats('kiosk-1');

      expect(stats.total).toBe(10);
      expect(stats.successful).toBe(8);
      expect(stats.failed).toBe(2);
      expect(stats.successRate).toBe(80);
    });

    it('should handle empty statistics gracefully', async () => {
      mockDb.get.mockResolvedValue(null);

      const stats = await commandBus.getCommandStats();

      expect(stats.total).toBe(0);
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('Command Types', () => {
    beforeEach(() => {
      // Mock successful validation and authorization
      mockDb.get
        .mockResolvedValueOnce({ kiosk_id: 'kiosk-1' }) // Kiosk exists
        .mockResolvedValueOnce({ id: 1 }) // User exists
        .mockResolvedValueOnce({ status: 'online' }) // Kiosk status
        .mockResolvedValueOnce({ status: 'Owned' }); // Locker status (for close command)

      mockCommandQueue.enqueueCommand.mockResolvedValue('queue-cmd-1');
      mockDb.run.mockResolvedValue({ changes: 1 });
    });

    it('should handle close command', async () => {
      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'close',
        kioskId: 'kiosk-1',
        lockerId: 1,
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      const result = await commandBus.executeCommand(command);
      expect(result.queued).toBe(true);
      expect(result.commandId).toBe('test-cmd-1');
      // Close commands are not immediate, so no result
      expect(result.result).toBeUndefined();
    });

    it('should handle reset command with locker ID', async () => {
      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'reset',
        kioskId: 'kiosk-1',
        lockerId: 1,
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      const result = await commandBus.executeCommand(command);
      expect(result.queued).toBe(true);
      expect(result.commandId).toBe('test-cmd-1');
      // Reset commands are not immediate, so no result
      expect(result.result).toBeUndefined();
    });

    it('should handle reset command without locker ID (kiosk reset)', async () => {
      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'reset',
        kioskId: 'kiosk-1',
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      const result = await commandBus.executeCommand(command);
      expect(result.queued).toBe(true);
      expect(result.commandId).toBe('test-cmd-1');
      // Reset commands are not immediate, so no result
      expect(result.result).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDb.get.mockRejectedValue(new Error('Database connection failed'));

      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 1,
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      await expect(
        commandBus.executeCommand(command)
      ).rejects.toThrow('Command validation failed');
    });

    it('should handle command queue errors', async () => {
      // Mock successful validation and authorization
      mockDb.get
        .mockResolvedValueOnce({ kiosk_id: 'kiosk-1' }) // Kiosk exists
        .mockResolvedValueOnce({ id: 1 }) // User exists
        .mockResolvedValueOnce({ status: 'online' }) // Kiosk status
        .mockResolvedValueOnce({ status: 'Free' }); // Locker status

      mockCommandQueue.enqueueCommand.mockRejectedValue(new Error('Queue is full'));

      const command: RemoteCommand = {
        id: 'test-cmd-1',
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 1,
        issuedBy: 'admin',
        issuedAt: new Date()
      };

      await expect(
        commandBus.executeCommand(command)
      ).rejects.toThrow('Queue is full');
    });
  });
});