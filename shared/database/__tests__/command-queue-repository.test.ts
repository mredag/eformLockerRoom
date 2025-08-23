import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandQueueRepository } from '../command-queue-repository';
import { DatabaseConnection } from '../connection';
import { Command, CommandType, CommandStatus } from '../../types/core-entities';

// Mock the database connection
vi.mock('../connection.js');

describe('CommandQueueRepository', () => {
  let repository: CommandQueueRepository;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn()
    };

    repository = new CommandQueueRepository(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findById', () => {
    it('should find command by ID', async () => {
      const mockRow = {
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: '2024-01-01T10:00:00.000Z',
        last_error: null,
        created_at: '2024-01-01T10:00:00.000Z',
        executed_at: null,
        completed_at: null
      };

      mockDb.get.mockResolvedValue(mockRow);

      const command = await repository.findById('cmd-1');

      expect(command).toBeDefined();
      expect(command!.command_id).toBe('cmd-1');
      expect(command!.payload).toEqual({ open_locker: { locker_id: 5 } });
      expect(command!.status).toBe('pending');
      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT * FROM command_queue WHERE command_id = ?',
        ['cmd-1']
      );
    });

    it('should return null if command not found', async () => {
      mockDb.get.mockResolvedValue(null);

      const command = await repository.findById('nonexistent');

      expect(command).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all commands without filter', async () => {
      const mockRows = [
        {
          command_id: 'cmd-1',
          kiosk_id: 'kiosk-1',
          command_type: 'open_locker',
          payload: '{"open_locker":{"locker_id":5}}',
          status: 'pending',
          retry_count: 0,
          max_retries: 3,
          next_attempt_at: '2024-01-01T10:00:00.000Z',
          last_error: null,
          created_at: '2024-01-01T10:00:00.000Z',
          executed_at: null,
          completed_at: null
        }
      ];

      mockDb.all.mockResolvedValue(mockRows);

      const commands = await repository.findAll();

      expect(commands).toHaveLength(1);
      expect(commands[0].command_id).toBe('cmd-1');
      expect(mockDb.all).toHaveBeenCalledWith(
        'SELECT * FROM command_queue ORDER BY next_attempt_at ASC, created_at ASC',
        []
      );
    });

    it('should filter by kiosk_id', async () => {
      mockDb.all.mockResolvedValue([]);

      await repository.findAll({ kiosk_id: 'kiosk-1' });

      expect(mockDb.all).toHaveBeenCalledWith(
        'SELECT * FROM command_queue WHERE kiosk_id = ? ORDER BY next_attempt_at ASC, created_at ASC',
        ['kiosk-1']
      );
    });

    it('should filter by command_type array', async () => {
      mockDb.all.mockResolvedValue([]);

      await repository.findAll({ 
        command_type: ['open_locker', 'bulk_open'] as CommandType[]
      });

      expect(mockDb.all).toHaveBeenCalledWith(
        'SELECT * FROM command_queue WHERE command_type IN (?, ?) ORDER BY next_attempt_at ASC, created_at ASC',
        ['open_locker', 'bulk_open']
      );
    });

    it('should filter by status array', async () => {
      mockDb.all.mockResolvedValue([]);

      await repository.findAll({ 
        status: ['pending', 'failed'] as CommandStatus[]
      });

      expect(mockDb.all).toHaveBeenCalledWith(
        'SELECT * FROM command_queue WHERE status IN (?, ?) ORDER BY next_attempt_at ASC, created_at ASC',
        ['pending', 'failed']
      );
    });

    it('should filter by date ranges', async () => {
      mockDb.all.mockResolvedValue([]);

      const after = new Date('2024-01-01T00:00:00.000Z');
      const before = new Date('2024-01-02T00:00:00.000Z');

      await repository.findAll({ 
        created_after: after,
        created_before: before
      });

      expect(mockDb.all).toHaveBeenCalledWith(
        'SELECT * FROM command_queue WHERE created_at >= ? AND created_at <= ? ORDER BY next_attempt_at ASC, created_at ASC',
        [after.toISOString(), before.toISOString()]
      );
    });

    it('should apply limit', async () => {
      mockDb.all.mockResolvedValue([]);

      await repository.findAll({ limit: 10 });

      expect(mockDb.all).toHaveBeenCalledWith(
        'SELECT * FROM command_queue ORDER BY next_attempt_at ASC, created_at ASC LIMIT 10',
        []
      );
    });

    it('should combine multiple filters', async () => {
      mockDb.all.mockResolvedValue([]);

      await repository.findAll({
        kiosk_id: 'kiosk-1',
        status: 'pending',
        command_type: 'open_locker',
        limit: 5
      });

      expect(mockDb.all).toHaveBeenCalledWith(
        'SELECT * FROM command_queue WHERE kiosk_id = ? AND command_type = ? AND status = ? ORDER BY next_attempt_at ASC, created_at ASC LIMIT 5',
        ['kiosk-1', 'open_locker', 'pending']
      );
    });
  });

  describe('create', () => {
    it('should create a new command', async () => {
      const newCommand: Omit<Command, 'created_at'> = {
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: { open_locker: { locker_id: 5 } },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: new Date('2024-01-01T10:00:00.000Z'),
        last_error: undefined,
        executed_at: undefined,
        completed_at: undefined,
        version: 1
      };

      const createdCommand = {
        ...newCommand,
        created_at: new Date('2024-01-01T10:00:00.000Z')
      };

      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue({
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: '2024-01-01T10:00:00.000Z',
        last_error: null,
        created_at: '2024-01-01T10:00:00.000Z',
        executed_at: null,
        completed_at: null
      });

      const result = await repository.create(newCommand);

      expect(result.command_id).toBe('cmd-1');
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO command_queue'),
        [
          'cmd-1',
          'kiosk-1',
          'open_locker',
          '{"open_locker":{"locker_id":5}}',
          'pending',
          0,
          3,
          '2024-01-01T10:00:00.000Z',
          null,
          null,
          null
        ]
      );
    });

    it('should throw error if creation fails', async () => {
      const newCommand: Omit<Command, 'created_at'> = {
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: { open_locker: { locker_id: 5 } },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: new Date(),
        last_error: undefined,
        executed_at: undefined,
        completed_at: undefined,
        version: 1
      };

      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue(null); // Simulate creation failure

      await expect(repository.create(newCommand)).rejects.toThrow('Failed to create command');
    });
  });

  describe('update', () => {
    it('should update command fields', async () => {
      const updates = {
        status: 'executing' as CommandStatus,
        executed_at: new Date('2024-01-01T10:05:00.000Z')
      };

      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue({
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        status: 'executing',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: '2024-01-01T10:00:00.000Z',
        last_error: null,
        created_at: '2024-01-01T10:00:00.000Z',
        executed_at: '2024-01-01T10:05:00.000Z',
        completed_at: null
      });

      const result = await repository.update('cmd-1', updates);

      expect(result.status).toBe('executing');
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE command_queue'),
        ['executing', '2024-01-01T10:05:00.000Z', 'cmd-1']
      );
    });

    it('should skip immutable fields', async () => {
      const updates = {
        command_id: 'new-id', // Should be ignored
        created_at: new Date(), // Should be ignored
        status: 'completed' as CommandStatus
      };

      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue({
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        status: 'completed',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: '2024-01-01T10:00:00.000Z',
        last_error: null,
        created_at: '2024-01-01T10:00:00.000Z',
        executed_at: null,
        completed_at: null
      });

      await repository.update('cmd-1', updates);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE command_queue'),
        expect.not.arrayContaining(['new-id'])
      );
    });

    it('should throw error if no fields to update', async () => {
      const updates = {
        command_id: 'new-id', // Only immutable field
        created_at: new Date()
      };

      await expect(repository.update('cmd-1', updates)).rejects.toThrow('No valid fields to update');
    });

    it('should throw error if command not found', async () => {
      mockDb.run.mockResolvedValue({ changes: 0 });

      await expect(repository.update('nonexistent', { status: 'completed' }))
        .rejects.toThrow('Command with id nonexistent not found');
    });
  });

  describe('getPendingCommands', () => {
    it('should get pending commands for kiosk', async () => {
      const mockRows = [
        {
          command_id: 'cmd-1',
          kiosk_id: 'kiosk-1',
          command_type: 'open_locker',
          payload: '{"open_locker":{"locker_id":5}}',
          status: 'pending',
          retry_count: 0,
          max_retries: 3,
          next_attempt_at: '2024-01-01T10:00:00.000Z',
          last_error: null,
          created_at: '2024-01-01T10:00:00.000Z',
          executed_at: null,
          completed_at: null
        }
      ];

      mockDb.all.mockResolvedValue(mockRows);

      const commands = await repository.getPendingCommands('kiosk-1', 10);

      expect(commands).toHaveLength(1);
      expect(commands[0].status).toBe('pending');
    });
  });

  describe('markExecuting', () => {
    it('should mark command as executing', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue({
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        status: 'executing',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: '2024-01-01T10:00:00.000Z',
        last_error: null,
        created_at: '2024-01-01T10:00:00.000Z',
        executed_at: '2024-01-01T10:05:00.000Z',
        completed_at: null
      });

      const result = await repository.markExecuting('cmd-1');

      expect(result.status).toBe('executing');
      expect(result.executed_at).toBeDefined();
    });
  });

  describe('markCompleted', () => {
    it('should mark command as completed', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue({
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        status: 'completed',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: '2024-01-01T10:00:00.000Z',
        last_error: null,
        created_at: '2024-01-01T10:00:00.000Z',
        executed_at: null,
        completed_at: '2024-01-01T10:10:00.000Z'
      });

      const result = await repository.markCompleted('cmd-1');

      expect(result.status).toBe('completed');
      expect(result.completed_at).toBeDefined();
    });
  });

  describe('markFailed', () => {
    it('should mark command as failed with retry', async () => {
      const existingCommand = {
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        status: 'pending',
        retry_count: 1,
        max_retries: 3,
        next_attempt_at: '2024-01-01T10:00:00.000Z',
        last_error: null,
        created_at: '2024-01-01T10:00:00.000Z',
        executed_at: null,
        completed_at: null
      };

      mockDb.get.mockResolvedValueOnce(existingCommand);
      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValueOnce({
        ...existingCommand,
        retry_count: 2,
        status: 'pending',
        last_error: 'Test error'
      });

      const result = await repository.markFailed('cmd-1', 'Test error', 5000);

      expect(result.retry_count).toBe(2);
      expect(result.status).toBe('pending'); // Still pending for retry
      expect(result.last_error).toBe('Test error');
    });

    it('should mark command as permanently failed when max retries reached', async () => {
      const existingCommand = {
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        status: 'pending',
        retry_count: 2,
        max_retries: 3,
        next_attempt_at: '2024-01-01T10:00:00.000Z',
        last_error: null,
        created_at: '2024-01-01T10:00:00.000Z',
        executed_at: null,
        completed_at: null
      };

      mockDb.get.mockResolvedValueOnce(existingCommand);
      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValueOnce({
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        retry_count: 3,
        max_retries: 3,
        status: 'failed',
        last_error: 'Final error',
        next_attempt_at: '2024-01-01T10:00:00.000Z',
        created_at: '2024-01-01T10:00:00.000Z',
        executed_at: null,
        completed_at: null
      });

      const result = await repository.markFailed('cmd-1', 'Final error');

      expect(result.status).toBe('failed');
      expect(result.retry_count).toBe(3);
    });

    it('should throw error if command not found', async () => {
      mockDb.get.mockResolvedValue(null);

      await expect(repository.markFailed('nonexistent', 'Error'))
        .rejects.toThrow('Command nonexistent not found');
    });
  });

  describe('getStatistics', () => {
    it('should return command statistics', async () => {
      const mockRows = [
        { total: 5, status: 'pending', command_type: 'open_locker' },
        { total: 3, status: 'completed', command_type: 'open_locker' },
        { total: 2, status: 'failed', command_type: 'bulk_open' },
        { total: 1, status: 'executing', command_type: 'open_locker' }
      ];

      mockDb.all.mockResolvedValue(mockRows);

      const stats = await repository.getStatistics('kiosk-1');

      expect(stats.total).toBe(11);
      expect(stats.pending).toBe(5);
      expect(stats.completed).toBe(3);
      expect(stats.failed).toBe(2);
      expect(stats.executing).toBe(1);
      expect(stats.by_type).toEqual({
        'open_locker': 9,
        'bulk_open': 2
      });
    });

    it('should return statistics for all kiosks when no kiosk_id provided', async () => {
      mockDb.all.mockResolvedValue([]);

      await repository.getStatistics();

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.not.stringContaining('WHERE kiosk_id'),
        []
      );
    });
  });

  describe('clearPendingCommands', () => {
    it('should clear pending commands for kiosk', async () => {
      mockDb.run.mockResolvedValue({ changes: 3 });

      const clearedCount = await repository.clearPendingCommands('kiosk-1');

      expect(clearedCount).toBe(3);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE command_queue'),
        ['kiosk-1']
      );
    });
  });

  describe('cleanupOldCommands', () => {
    it('should cleanup old commands', async () => {
      mockDb.run.mockResolvedValue({ changes: 5 });

      const deletedCount = await repository.cleanupOldCommands(7);

      expect(deletedCount).toBe(5);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM command_queue')
      );
    });
  });

  describe('mapRowToEntity', () => {
    it('should correctly map database row to Command entity', async () => {
      const mockRow = {
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: '2024-01-01T10:00:00.000Z',
        last_error: 'Some error',
        created_at: '2024-01-01T10:00:00.000Z',
        executed_at: '2024-01-01T10:05:00.000Z',
        completed_at: null
      };

      mockDb.get.mockResolvedValue(mockRow);

      const command = await repository.findById('cmd-1');

      expect(command).toEqual({
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: { open_locker: { locker_id: 5 } },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: new Date('2024-01-01T10:00:00.000Z'),
        last_error: 'Some error',
        created_at: new Date('2024-01-01T10:00:00.000Z'),
        executed_at: new Date('2024-01-01T10:05:00.000Z'),
        completed_at: undefined
      });
    });

    it('should handle null optional fields', async () => {
      const mockRow = {
        command_id: 'cmd-1',
        kiosk_id: 'kiosk-1',
        command_type: 'open_locker',
        payload: '{"open_locker":{"locker_id":5}}',
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        next_attempt_at: '2024-01-01T10:00:00.000Z',
        last_error: null,
        created_at: '2024-01-01T10:00:00.000Z',
        executed_at: null,
        completed_at: null
      };

      mockDb.get.mockResolvedValue(mockRow);

      const command = await repository.findById('cmd-1');

      expect(command!.last_error).toBeNull();
      expect(command!.executed_at).toBeUndefined();
      expect(command!.completed_at).toBeUndefined();
    });
  });
});
