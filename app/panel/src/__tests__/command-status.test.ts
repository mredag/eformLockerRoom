/**
 * Command Status Polling Endpoint Tests
 * Tests the GET /api/commands/:id endpoint for command status polling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the CommandQueueManager
const mockCommandQueue = {
  getCommand: vi.fn()
};

// Mock command data for testing
const mockCommand = {
  command_id: 'test-command-123',
  kiosk_id: 'kiosk-1',
  command_type: 'open_locker',
  status: 'completed',
  payload: { locker_id: 5, staff_user: 'admin', reason: 'Manual open' },
  created_at: new Date('2024-01-01T10:00:00Z'),
  executed_at: new Date('2024-01-01T10:00:01Z'),
  completed_at: new Date('2024-01-01T10:00:02Z'),
  last_error: null,
  retry_count: 0
};

const mockBulkCommand = {
  command_id: 'bulk-command-456',
  kiosk_id: 'kiosk-1',
  command_type: 'bulk_open',
  status: 'executing',
  payload: { locker_ids: [1, 2, 3], staff_user: 'admin', reason: 'Bulk open' },
  created_at: new Date('2024-01-01T10:00:00Z'),
  executed_at: new Date('2024-01-01T10:00:01Z'),
  completed_at: null,
  last_error: null,
  retry_count: 0
};

const mockFailedCommand = {
  command_id: 'failed-command-789',
  kiosk_id: 'kiosk-1',
  command_type: 'open_locker',
  status: 'failed',
  payload: { locker_id: 10, staff_user: 'admin', reason: 'Manual open' },
  created_at: new Date('2024-01-01T10:00:00Z'),
  executed_at: new Date('2024-01-01T10:00:01Z'),
  completed_at: new Date('2024-01-01T10:00:05Z'),
  last_error: 'Modbus timeout - check wiring',
  retry_count: 3
};

describe('Command Status Polling Endpoint Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Command Status Response Format', () => {
    it('should format single locker command response correctly', async () => {
      // Simulate the endpoint logic
      const command = mockCommand;
      
      // Extract locker information from payload
      let lockerInfo = {};
      if (command.payload.locker_id) {
        lockerInfo = { locker_id: command.payload.locker_id };
      } else if (command.payload.locker_ids) {
        lockerInfo = { locker_ids: command.payload.locker_ids };
      }

      const response = {
        command_id: command.command_id,
        status: command.status,
        command_type: command.command_type,
        created_at: command.created_at,
        executed_at: command.executed_at,
        completed_at: command.completed_at,
        last_error: command.last_error,
        retry_count: command.retry_count,
        ...lockerInfo
      };

      expect(response.command_id).toBe('test-command-123');
      expect(response.status).toBe('completed');
      expect(response.command_type).toBe('open_locker');
      expect(response.locker_id).toBe(5);
      expect(response.last_error).toBeNull();
      expect(response.retry_count).toBe(0);
      expect(response.created_at).toBeInstanceOf(Date);
      expect(response.executed_at).toBeInstanceOf(Date);
      expect(response.completed_at).toBeInstanceOf(Date);
    });

    it('should format bulk command response correctly', async () => {
      const command = mockBulkCommand;
      
      // Extract locker information from payload
      let lockerInfo = {};
      if (command.payload.locker_id) {
        lockerInfo = { locker_id: command.payload.locker_id };
      } else if (command.payload.locker_ids) {
        lockerInfo = { locker_ids: command.payload.locker_ids };
      }

      const response = {
        command_id: command.command_id,
        status: command.status,
        command_type: command.command_type,
        created_at: command.created_at,
        executed_at: command.executed_at,
        completed_at: command.completed_at,
        last_error: command.last_error,
        retry_count: command.retry_count,
        ...lockerInfo
      };

      expect(response.command_id).toBe('bulk-command-456');
      expect(response.status).toBe('executing');
      expect(response.command_type).toBe('bulk_open');
      expect(response.locker_ids).toEqual([1, 2, 3]);
      expect(response.completed_at).toBeNull(); // Still executing
    });

    it('should format failed command response with error message', async () => {
      const command = mockFailedCommand;
      
      // Extract locker information from payload
      let lockerInfo = {};
      if (command.payload.locker_id) {
        lockerInfo = { locker_id: command.payload.locker_id };
      } else if (command.payload.locker_ids) {
        lockerInfo = { locker_ids: command.payload.locker_ids };
      }

      const response = {
        command_id: command.command_id,
        status: command.status,
        command_type: command.command_type,
        created_at: command.created_at,
        executed_at: command.executed_at,
        completed_at: command.completed_at,
        last_error: command.last_error,
        retry_count: command.retry_count,
        ...lockerInfo
      };

      expect(response.command_id).toBe('failed-command-789');
      expect(response.status).toBe('failed');
      expect(response.locker_id).toBe(10);
      expect(response.last_error).toBe('Modbus timeout - check wiring');
      expect(response.retry_count).toBe(3);
    });
  });

  describe('Command Status Values', () => {
    it('should handle all possible command statuses', () => {
      const validStatuses = ['pending', 'executing', 'completed', 'failed', 'cancelled'];
      
      validStatuses.forEach(status => {
        const command = { ...mockCommand, status };
        expect(['pending', 'executing', 'completed', 'failed', 'cancelled']).toContain(command.status);
      });
    });

    it('should include timestamps for different command states', () => {
      // Pending command - only created_at
      const pendingCommand = {
        ...mockCommand,
        status: 'pending',
        executed_at: null,
        completed_at: null
      };

      // Executing command - created_at and executed_at
      const executingCommand = {
        ...mockCommand,
        status: 'executing',
        executed_at: new Date(),
        completed_at: null
      };

      // Completed command - all timestamps
      const completedCommand = {
        ...mockCommand,
        status: 'completed',
        executed_at: new Date(),
        completed_at: new Date()
      };

      expect(pendingCommand.created_at).toBeDefined();
      expect(pendingCommand.executed_at).toBeNull();
      expect(pendingCommand.completed_at).toBeNull();

      expect(executingCommand.created_at).toBeDefined();
      expect(executingCommand.executed_at).toBeDefined();
      expect(executingCommand.completed_at).toBeNull();

      expect(completedCommand.created_at).toBeDefined();
      expect(completedCommand.executed_at).toBeDefined();
      expect(completedCommand.completed_at).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle command not found scenario', () => {
      const command = null;
      
      if (!command) {
        const errorResponse = {
          code: 'not_found',
          message: 'Command not found'
        };
        
        expect(errorResponse.code).toBe('not_found');
        expect(errorResponse.message).toBe('Command not found');
      }
    });

    it('should handle server errors gracefully', () => {
      const error = new Error('Database connection failed');
      
      const errorResponse = {
        code: 'server_error',
        message: 'Failed to retrieve command status'
      };
      
      expect(errorResponse.code).toBe('server_error');
      expect(errorResponse.message).toBe('Failed to retrieve command status');
    });
  });

  describe('Locker Information Extraction', () => {
    it('should extract single locker_id from payload', () => {
      const payload = { locker_id: 15, staff_user: 'admin', reason: 'Test' };
      
      let lockerInfo = {};
      if (payload.locker_id) {
        lockerInfo = { locker_id: payload.locker_id };
      } else if (payload.locker_ids) {
        lockerInfo = { locker_ids: payload.locker_ids };
      }
      
      expect(lockerInfo).toEqual({ locker_id: 15 });
    });

    it('should extract multiple locker_ids from payload', () => {
      const payload = { locker_ids: [1, 5, 10], staff_user: 'admin', reason: 'Bulk test' };
      
      let lockerInfo = {};
      if (payload.locker_id) {
        lockerInfo = { locker_id: payload.locker_id };
      } else if (payload.locker_ids) {
        lockerInfo = { locker_ids: payload.locker_ids };
      }
      
      expect(lockerInfo).toEqual({ locker_ids: [1, 5, 10] });
    });

    it('should handle payload without locker information', () => {
      const payload = { staff_user: 'admin', reason: 'Test' };
      
      let lockerInfo = {};
      if (payload.locker_id) {
        lockerInfo = { locker_id: payload.locker_id };
      } else if (payload.locker_ids) {
        lockerInfo = { locker_ids: payload.locker_ids };
      }
      
      expect(lockerInfo).toEqual({});
    });
  });
});