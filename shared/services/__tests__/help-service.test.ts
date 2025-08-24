import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseConnection } from '../../database/connection.js';
import { 
  HelpService, 
  CreateHelpRequest, 
  HelpRequest,
  HelpRequestValidationError,
  HelpRequestNotFoundError,
  InvalidStatusTransitionError
} from '../help-service.js';

describe('HelpService', () => {
  let db: DatabaseConnection;
  let helpService: HelpService;
  let mockEventEmitter: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Use in-memory database for testing
    DatabaseConnection.resetInstance();
    db = DatabaseConnection.getInstance(':memory:');
    await db.waitForInitialization();

    // Create help_requests table (Simplified)
    await db.exec(`
      CREATE TABLE help_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kiosk_id TEXT NOT NULL,
        locker_no INTEGER,
        category TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        CHECK (status IN ('open', 'resolved')),
        CHECK (category IN ('lock_problem', 'other'))
      );
    `);

    // Mock event emitter
    mockEventEmitter = vi.fn().mockResolvedValue(undefined);
    helpService = new HelpService(db, mockEventEmitter);
  });

  afterEach(async () => {
    await db.close();
    DatabaseConnection.resetInstance();
  });

  describe('createHelpRequest', () => {
    it('should create a help request with valid data', async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        locker_no: 5,
        category: 'lock_problem',
        note: 'Cannot open locker'
      };

      const helpRequest = await helpService.createHelpRequest(request);

      expect(helpRequest).toMatchObject({
        id: expect.any(Number),
        kiosk_id: 'KIOSK001',
        locker_no: 5,
        category: 'lock_problem',
        note: 'Cannot open locker',
        status: 'open',
        created_at: expect.any(String)
      });

      expect(mockEventEmitter).toHaveBeenCalledWith('help_requested', expect.objectContaining({
        id: helpRequest.id,
        kiosk_id: 'KIOSK001',
        category: 'lock_problem',
        status: 'open'
      }));
    });

    it('should create a help request with minimal data', async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK002',
        category: 'other'
      };

      const helpRequest = await helpService.createHelpRequest(request);

      expect(helpRequest).toMatchObject({
        id: expect.any(Number),
        kiosk_id: 'KIOSK002',
        category: 'other',
        status: 'open',
        created_at: expect.any(String)
      });
      expect(helpRequest.locker_no).toBeNull();
      expect(helpRequest.note).toBeNull();
    });

    it('should throw validation error for missing kiosk_id', async () => {
      const request: CreateHelpRequest = {
        kiosk_id: '',
        category: 'lock_problem'
      };

      await expect(helpService.createHelpRequest(request))
        .rejects.toThrow(HelpRequestValidationError);
    });

    it('should throw validation error for invalid category', async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'invalid_category' as any
      };

      await expect(helpService.createHelpRequest(request))
        .rejects.toThrow(HelpRequestValidationError);
    });

    it('should throw validation error for invalid locker_no', async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'lock_problem',
        locker_no: 0
      };

      await expect(helpService.createHelpRequest(request))
        .rejects.toThrow(HelpRequestValidationError);
    });

    it('should throw validation error for note too long', async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'lock_problem',
        note: 'a'.repeat(1001)
      };

      await expect(helpService.createHelpRequest(request))
        .rejects.toThrow(HelpRequestValidationError);
    });
  });



  describe('resolveHelpRequest', () => {
    let helpRequestId: number;

    beforeEach(async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'lock_problem',
        note: 'Test request'
      };
      const helpRequest = await helpService.createHelpRequest(request);
      helpRequestId = helpRequest.id;
      mockEventEmitter.mockClear();
    });

    it('should resolve a help request', async () => {
      const updatedRequest = await helpService.resolveHelpRequest(helpRequestId);

      expect(updatedRequest.status).toBe('resolved');
      expect(updatedRequest.resolved_at).toBeDefined();

      expect(mockEventEmitter).toHaveBeenCalledWith('help_status_updated', expect.objectContaining({
        id: helpRequestId,
        old_status: 'open',
        new_status: 'resolved'
      }));
    });

    it('should throw error for non-existent help request', async () => {
      await expect(helpService.resolveHelpRequest(99999))
        .rejects.toThrow(HelpRequestNotFoundError);
    });

    it('should throw error when trying to resolve already resolved request', async () => {
      // First resolve the request
      await helpService.resolveHelpRequest(helpRequestId);
      
      // Then try to resolve it again
      await expect(helpService.resolveHelpRequest(helpRequestId))
        .rejects.toThrow(InvalidStatusTransitionError);
    });
  });

  describe('updateHelpRequest', () => {
    let helpRequestId: number;

    beforeEach(async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'lock_problem'
      };
      const helpRequest = await helpService.createHelpRequest(request);
      helpRequestId = helpRequest.id;
      mockEventEmitter.mockClear();
    });

    it('should update help request status and emit event', async () => {
      const updatedRequest = await helpService.updateHelpRequest(helpRequestId, {
        status: 'resolved'
      });

      expect(updatedRequest.status).toBe('resolved');

      expect(mockEventEmitter).toHaveBeenCalledWith('help_status_updated', expect.objectContaining({
        old_status: 'open',
        new_status: 'resolved'
      }));
    });

    it('should throw error for invalid status transition', async () => {
      // First resolve the request
      await helpService.resolveHelpRequest(helpRequestId);
      
      // Then try to resolve it again
      await expect(helpService.updateHelpRequest(helpRequestId, { status: 'resolved' }))
        .rejects.toThrow(InvalidStatusTransitionError);
    });

    it('should return unchanged request when no updates provided', async () => {
      const originalRequest = await helpService.getHelpRequestById(helpRequestId);
      const updatedRequest = await helpService.updateHelpRequest(helpRequestId, {});

      expect(updatedRequest).toEqual(originalRequest);
      expect(mockEventEmitter).not.toHaveBeenCalled();
    });
  });

  describe('getHelpRequestById', () => {
    it('should return help request by ID', async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'lock_problem',
        note: 'Test request'
      };
      const createdRequest = await helpService.createHelpRequest(request);

      const foundRequest = await helpService.getHelpRequestById(createdRequest.id);

      expect(foundRequest).toEqual(createdRequest);
    });

    it('should return null for non-existent ID', async () => {
      const foundRequest = await helpService.getHelpRequestById(99999);
      expect(foundRequest).toBeNull();
    });
  });

  describe('getHelpRequests', () => {
    beforeEach(async () => {
      // Create test data
      const requests: CreateHelpRequest[] = [
        {
          kiosk_id: 'KIOSK001',
          category: 'lock_problem',
          note: 'Lock problem request'
        },
        {
          kiosk_id: 'KIOSK002',
          category: 'other',
          note: 'Other request'
        },
        {
          kiosk_id: 'KIOSK001',
          category: 'lock_problem',
          note: 'Another lock problem'
        }
      ];

      for (const request of requests) {
        await helpService.createHelpRequest(request);
      }
      mockEventEmitter.mockClear();
    });

    it('should return all help requests when no filter provided', async () => {
      const requests = await helpService.getHelpRequests();
      expect(requests).toHaveLength(3);
    });

    it('should filter by status', async () => {
      const requests = await helpService.getHelpRequests({ status: 'open' });
      expect(requests).toHaveLength(3);
      expect(requests.every(r => r.status === 'open')).toBe(true);
    });

    it('should filter by kiosk_id', async () => {
      const requests = await helpService.getHelpRequests({ kiosk_id: 'KIOSK001' });
      expect(requests).toHaveLength(2);
      expect(requests.every(r => r.kiosk_id === 'KIOSK001')).toBe(true);
    });

    it('should filter by category', async () => {
      const requests = await helpService.getHelpRequests({ category: 'lock_problem' });
      expect(requests).toHaveLength(2);
      expect(requests.every(r => r.category === 'lock_problem')).toBe(true);
    });

    it('should filter by multiple criteria', async () => {
      const requests = await helpService.getHelpRequests({ 
        kiosk_id: 'KIOSK001',
        category: 'lock_problem'
      });
      expect(requests).toHaveLength(2);
      expect(requests.every(r => r.kiosk_id === 'KIOSK001' && r.category === 'lock_problem')).toBe(true);
    });


  });

  describe('getHelpHistory', () => {
    beforeEach(async () => {
      const requests: CreateHelpRequest[] = [
        { kiosk_id: 'KIOSK001', category: 'lock_problem' },
        { kiosk_id: 'KIOSK002', category: 'other' },
        { kiosk_id: 'KIOSK001', category: 'lock_problem' }
      ];

      for (const request of requests) {
        await helpService.createHelpRequest(request);
      }
      mockEventEmitter.mockClear();
    });

    it('should return all help requests when no kiosk ID provided', async () => {
      const history = await helpService.getHelpHistory();
      expect(history).toHaveLength(3);
    });

    it('should return help requests for specific kiosk', async () => {
      const history = await helpService.getHelpHistory('KIOSK001');
      expect(history).toHaveLength(2);
      expect(history.every(r => r.kiosk_id === 'KIOSK001')).toBe(true);
    });
  });



  describe('getHelpRequestStatistics', () => {
    beforeEach(async () => {
      // Create test data with different statuses and categories
      const requests: CreateHelpRequest[] = [
        { kiosk_id: 'KIOSK001', category: 'lock_problem' },
        { kiosk_id: 'KIOSK002', category: 'lock_problem' },
        { kiosk_id: 'KIOSK003', category: 'other' },
        { kiosk_id: 'KIOSK004', category: 'other' }
      ];

      for (const request of requests) {
        const helpRequest = await helpService.createHelpRequest(request);
        
        // Resolve some requests
        if (helpRequest.id % 2 === 0) {
          await helpService.resolveHelpRequest(helpRequest.id);
        }
      }
      mockEventEmitter.mockClear();
    });

    it('should return comprehensive statistics', async () => {
      const stats = await helpService.getHelpRequestStatistics();

      expect(stats.total).toBe(4);
      expect(stats.open + stats.resolved).toBe(4);
      expect(stats.by_category).toHaveProperty('lock_problem');
      expect(stats.by_category).toHaveProperty('other');
    });
  });

  describe('status transitions', () => {
    let helpRequestId: number;

    beforeEach(async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'lock_problem'
      };
      const helpRequest = await helpService.createHelpRequest(request);
      helpRequestId = helpRequest.id;
      mockEventEmitter.mockClear();
    });

    it('should allow valid status transitions', async () => {
      // open -> resolved
      await helpService.updateHelpRequest(helpRequestId, { status: 'resolved' });
      let request = await helpService.getHelpRequestById(helpRequestId);
      expect(request?.status).toBe('resolved');

      // resolved -> open (reopening)
      await helpService.updateHelpRequest(helpRequestId, { status: 'open' });
      request = await helpService.getHelpRequestById(helpRequestId);
      expect(request?.status).toBe('open');
    });

    it('should emit events for all status transitions', async () => {
      await helpService.updateHelpRequest(helpRequestId, { status: 'resolved' });
      await helpService.updateHelpRequest(helpRequestId, { status: 'open' });

      expect(mockEventEmitter).toHaveBeenCalledTimes(2);
      expect(mockEventEmitter).toHaveBeenNthCalledWith(1, 'help_status_updated', expect.objectContaining({
        old_status: 'open',
        new_status: 'resolved'
      }));
      expect(mockEventEmitter).toHaveBeenNthCalledWith(2, 'help_status_updated', expect.objectContaining({
        old_status: 'resolved',
        new_status: 'open'
      }));
    });
  });

  describe('event emission error handling', () => {
    it('should not fail when event emitter throws error', async () => {
      mockEventEmitter.mockRejectedValue(new Error('Event emission failed'));

      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'lock_problem'
      };

      // Should not throw despite event emission failure
      const helpRequest = await helpService.createHelpRequest(request);
      expect(helpRequest.id).toBeDefined();
    });

    it('should work without event emitter', async () => {
      const serviceWithoutEmitter = new HelpService(db);

      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'lock_problem'
      };

      const helpRequest = await serviceWithoutEmitter.createHelpRequest(request);
      expect(helpRequest.id).toBeDefined();
    });
  });
});