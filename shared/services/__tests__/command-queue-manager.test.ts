import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandQueueManager } from '../command-queue-manager';
import { DatabaseConnection } from '../../database/connection';
import { CommandType, CommandStatus } from '../../types/core-entities';

// Mock the database connection
vi.mock('../../database/connection.js');

describe('CommandQueueManager', () => {
  let commandQueue: CommandQueueManager;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn()
    };

    // Mock DatabaseConnection.getInstance()
    vi.mocked(DatabaseConnection.getInstance).mockReturnValue(mockDb);
    
    commandQueue = new CommandQueueManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('enqueueCommand', () => {
    it('should enqueue a command with UUID and return command ID', async () => {
      const mockResult = { changes: 1 };
      mockDb.run.mockResolvedValue(mockResult);

      const commandId = await commandQueue.enqueueCommand(
        'kiosk-1',
        'open_locker',
        { open_locker: { locker_id: 5, staff_user: 'admin', reason: 'test' } }
      );

      expect(commandId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO command_queue'),
        expect.arrayContaining([
          commandId,
          'kiosk-1',
          'open_locker',
          expect.stringContaining('locker_id'),
          3, // default max_retries
          expect.any(String), // created_at
          expect.any(String)  // next_attempt_at
        ])
      );
    });

    it('should use custom max_retries when provided', async () => {
      const mockResult = { changes: 1 };
      mockDb.run.mockResolvedValue(mockResult);

      await commandQueue.enqueueCommand(
        'kiosk-1',
        'open_locker',
        { open_locker: { locker_id: 5 } },
        5
      );

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO command_queue'),
        expect.arrayContaining([
          expect.any(String),
          'kiosk-1',
          'open_locker',
          expect.any(String),
          5, // custom max_retries
          expect.any(String),
          expect.any(String)
        ])
      );
    });
  });

  describe('getPendingCommands', () => {
    it('should return pending commands for a kiosk', async () => {
      const mockCommands = [
        {
          command_id: 'cmd-1',
          kiosk_id: 'kiosk-1',
          command_type: 'open_locker',
          payload: '{"open_locker":{"locker_id":5}}',
          status: 'pending',
          retry_count: 0,
          max_retries: 3,
          next_attempt_at: new Date().toISOString(),
          last_error: null,
          created_at: new Date().toISOString(),
          executed_at: null,
          completed_at: null
        }
      ];

      mockDb.all.mockResolvedValue(mockCommands);

      const commands = await commandQueue.getPendingCommands('kiosk-1');

      expect(commands).toHaveLength(1);
      expect(commands[0].command_id).toBe('cmd-1');
      expect(commands[0].payload).toEqual({ open_locker: { locker_id: 5 } });
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE kiosk_id = ? AND status = \'pending\''),
        ['kiosk-1', expect.any(String), 10]
      );
    });

    it('should respect limit parameter', async () => {
      mockDb.all.mockResolvedValue([]);

      await commandQueue.getPendingCommands('kiosk-1', 5);

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ?'),
        ['kiosk-1', expect.any(String), 5]
      );
    });
  });

  describe('markCommandCompleted', () => {
    it('should mark command as completed and return true', async () => {
      const mockResult = { changes: 1 };
      mockDb.run.mockResolvedValue(mockResult);

      const result = await commandQueue.markCommandCompleted('cmd-1');

      expect(result).toBe(true);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE command_queue'),
        expect.arrayContaining(['cmd-1'])
      );
    });

    it('should return false if command not found', async () => {
      const mockResult = { changes: 0 };
      mockDb.run.mockResolvedValue(mockResult);

      const result = await commandQueue.markCommandCompleted('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('markCommandFailed', () => {
    it('should schedule retry with exponential backoff when retries remaining', async () => {
      const mockCommand = {
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        status: 'pending',
        retry_count: 1,
        max_retries: 3,
        next_attempt_at: new Date().toISOString(),
        last_error: null,
        created_at: new Date().toISOString(),
        executed_at: null,
        completed_at: null
      };

      mockDb.get.mockResolvedValue(mockCommand);
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await commandQueue.markCommandFailed('cmd-1', 'Test error');

      expect(result).toBe(true);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'pending\''),
        expect.arrayContaining([
          2, // retry_count + 1
          'Test error',
          expect.any(String), // next_attempt_at with backoff
          'cmd-1'
        ])
      );
    });

    it('should mark as permanently failed when max retries reached', async () => {
      const mockCommand = {
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        status: 'pending',
        retry_count: 2,
        max_retries: 3,
        next_attempt_at: new Date().toISOString(),
        last_error: null,
        created_at: new Date().toISOString(),
        executed_at: null,
        completed_at: null
      };

      mockDb.get.mockResolvedValue(mockCommand);
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await commandQueue.markCommandFailed('cmd-1', 'Final error');

      expect(result).toBe(true);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'failed\''),
        expect.arrayContaining([
          3, // retry_count + 1
          'Final error',
          expect.any(String), // completed_at
          'cmd-1'
        ])
      );
    });

    it('should return false if command not found', async () => {
      mockDb.get.mockResolvedValue(null);

      const result = await commandQueue.markCommandFailed('nonexistent', 'Error');

      expect(result).toBe(false);
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics for a kiosk', async () => {
      const mockStats = {
        pending: 2,
        executing: 1,
        completed: 10,
        failed: 1,
        cancelled: 0
      };

      mockDb.get.mockResolvedValue(mockStats);

      const stats = await commandQueue.getQueueStats('kiosk-1');

      expect(stats).toEqual(mockStats);
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SUM(CASE WHEN status'),
        ['kiosk-1']
      );
    });

    it('should handle null values in statistics', async () => {
      const mockStats = {
        pending: null,
        executing: null,
        completed: 5,
        failed: null,
        cancelled: null
      };

      mockDb.get.mockResolvedValue(mockStats);

      const stats = await commandQueue.getQueueStats('kiosk-1');

      expect(stats).toEqual({
        pending: 0,
        executing: 0,
        completed: 5,
        failed: 0,
        cancelled: 0
      });
    });
  });

  describe('cleanupOldCommands', () => {
    it('should clean up old completed/failed commands', async () => {
      const mockResult = { changes: 5 };
      mockDb.run.mockResolvedValue(mockResult);

      const deletedCount = await commandQueue.cleanupOldCommands(7);

      expect(deletedCount).toBe(5);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM command_queue'),
        [expect.any(String)] // cutoff date
      );
    });

    it('should use custom retention days', async () => {
      const mockResult = { changes: 3 };
      mockDb.run.mockResolvedValue(mockResult);

      await commandQueue.cleanupOldCommands(14);

      // Verify the cutoff date is approximately 14 days ago
      const callArgs = mockDb.run.mock.calls[0][1];
      const cutoffDate = new Date(callArgs[0]);
      const expectedCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      
      // Allow 1 minute tolerance for test execution time
      expect(Math.abs(cutoffDate.getTime() - expectedCutoff.getTime())).toBeLessThan(60000);
    });
  });

  describe('clearPendingCommands', () => {
    it('should clear all pending commands for a kiosk', async () => {
      const mockResult = { changes: 3 };
      mockDb.run.mockResolvedValue(mockResult);

      const clearedCount = await commandQueue.clearPendingCommands('kiosk-1');

      expect(clearedCount).toBe(3);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE command_queue'),
        expect.arrayContaining([
          expect.any(String), // timestamp
          'kiosk-1'
        ])
      );
    });
  });

  describe('enqueueBulkCommands', () => {
    it('should enqueue multiple commands with same type', async () => {
      const mockResult = { changes: 1 };
      mockDb.run.mockResolvedValue(mockResult);

      const payloads = [
        { open_locker: { locker_id: 1 } },
        { open_locker: { locker_id: 2 } },
        { open_locker: { locker_id: 3 } }
      ];

      const commandIds = await commandQueue.enqueueBulkCommands(
        'kiosk-1',
        'open_locker',
        payloads
      );

      expect(commandIds).toHaveLength(3);
      expect(mockDb.run).toHaveBeenCalledTimes(3);
      
      // Verify each command was inserted
      commandIds.forEach((id, index) => {
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(mockDb.run).toHaveBeenNthCalledWith(
          index + 1,
          expect.stringContaining('INSERT INTO command_queue'),
          expect.arrayContaining([
            id,
            'kiosk-1',
            'open_locker',
            JSON.stringify(payloads[index])
          ])
        );
      });
    });
  });

  describe('getCommandHistory', () => {
    it('should return command history for a kiosk', async () => {
      const mockCommands = [
        {
          command_id: 'cmd-1',
          kiosk_id: 'kiosk-1',
          command_type: 'open_locker',
          payload: '{"open_locker":{"locker_id":5}}',
          status: 'completed',
          retry_count: 0,
          max_retries: 3,
          next_attempt_at: new Date().toISOString(),
          last_error: null,
          created_at: new Date().toISOString(),
          executed_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        }
      ];

      mockDb.all.mockResolvedValue(mockCommands);

      const history = await commandQueue.getCommandHistory('kiosk-1', 25);

      expect(history).toHaveLength(1);
      expect(history[0].command_id).toBe('cmd-1');
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC LIMIT ?'),
        ['kiosk-1', 25]
      );
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDb.run.mockRejectedValue(new Error('Database error'));

      await expect(commandQueue.enqueueCommand(
        'kiosk-1',
        'open_locker',
        { open_locker: { locker_id: 5 } }
      )).rejects.toThrow('Database error');
    });

    it('should handle malformed JSON in payload', async () => {
      const mockCommand = {
        command_id: 'cmd-1',
        payload: 'invalid-json'
      };

      mockDb.get.mockResolvedValue(mockCommand);

      await expect(commandQueue.getCommand('cmd-1')).rejects.toThrow();
    });
  });

  describe('idempotency', () => {
    it('should generate unique UUIDs for each command', async () => {
      const mockResult = { changes: 1 };
      mockDb.run.mockResolvedValue(mockResult);

      const id1 = await commandQueue.enqueueCommand('kiosk-1', 'open_locker', {});
      const id2 = await commandQueue.enqueueCommand('kiosk-1', 'open_locker', {});

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  describe('exponential backoff', () => {
    it('should calculate correct backoff delays', async () => {
      const mockCommand = {
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: new Date().toISOString(),
        last_error: null,
        created_at: new Date().toISOString(),
        executed_at: null,
        completed_at: null
      };

      mockDb.get.mockResolvedValue(mockCommand);
      mockDb.run.mockResolvedValue({ changes: 1 });

      const startTime = Date.now();
      await commandQueue.markCommandFailed('cmd-1', 'Error');

      // Verify the next_attempt_at is set with exponential backoff
      const callArgs = mockDb.run.mock.calls[0][1];
      const nextAttemptStr = callArgs[2]; // next_attempt_at parameter
      const nextAttempt = new Date(nextAttemptStr);
      
      // First retry should be ~30 seconds (2^1 * 30)
      const expectedDelay = Math.pow(2, 1) * 30 * 1000; // 60 seconds
      const actualDelay = nextAttempt.getTime() - startTime;
      
      // Allow some tolerance for test execution time
      expect(actualDelay).toBeGreaterThan(expectedDelay - 1000);
      expect(actualDelay).toBeLessThan(expectedDelay + 1000);
    });
  });
});