import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseConnection } from '../../../../../shared/database/connection.js';
import { HelpWebSocketService } from '../help-websocket-service.js';
import { WebSocketManager } from '../websocket-manager.js';
import { CreateHelpRequest } from '../../../../../shared/services/help-service.js';

// Mock WebSocketManager
const mockWebSocketManager = {
  emitHelpRequested: vi.fn().mockResolvedValue(undefined),
  emitHelpStatusUpdated: vi.fn().mockResolvedValue(undefined)
} as unknown as WebSocketManager;

describe('HelpWebSocketService', () => {
  let db: DatabaseConnection;
  let helpWebSocketService: HelpWebSocketService;

  beforeEach(async () => {
    // Use in-memory database for testing
    DatabaseConnection.resetInstance();
    db = DatabaseConnection.getInstance(':memory:');
    await db.waitForInitialization();

    // Create help_requests table
    await db.exec(`
      CREATE TABLE help_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kiosk_id TEXT NOT NULL,
        locker_no INTEGER,
        category TEXT NOT NULL,
        note TEXT,
        photo_url TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        agent_id TEXT,
        resolution_notes TEXT,
        priority TEXT NOT NULL DEFAULT 'medium',
        user_contact TEXT,
        CHECK (status IN ('open', 'assigned', 'resolved')),
        CHECK (category IN ('access_issue', 'hardware_problem', 'payment_issue', 'other')),
        CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
      );
    `);

    // Clear mock calls
    vi.clearAllMocks();

    helpWebSocketService = new HelpWebSocketService(db, mockWebSocketManager);
  });

  afterEach(async () => {
    await db.close();
    DatabaseConnection.resetInstance();
  });

  describe('createHelpRequest', () => {
    it('should create help request and emit WebSocket event', async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        locker_no: 5,
        category: 'access_issue',
        note: 'Cannot open locker',
        priority: 'high',
        user_contact: 'user@example.com'
      };

      const helpRequest = await helpWebSocketService.createHelpRequest(request);

      expect(helpRequest).toMatchObject({
        id: expect.any(Number),
        kiosk_id: 'KIOSK001',
        locker_no: 5,
        category: 'access_issue',
        note: 'Cannot open locker',
        status: 'open',
        priority: 'high',
        user_contact: 'user@example.com'
      });

      expect(mockWebSocketManager.emitHelpRequested).toHaveBeenCalledWith(
        expect.objectContaining({
          id: helpRequest.id,
          kiosk_id: 'KIOSK001',
          category: 'access_issue',
          status: 'open',
          priority: 'high'
        }),
        'high'
      );
    });

    it('should create help request with default priority', async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK002',
        category: 'hardware_problem'
      };

      const helpRequest = await helpWebSocketService.createHelpRequest(request);

      expect(helpRequest.priority).toBe('medium');
      expect(mockWebSocketManager.emitHelpRequested).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'medium'
        }),
        'medium'
      );
    });
  });

  describe('assignHelpRequest', () => {
    let helpRequestId: number;

    beforeEach(async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'access_issue'
      };
      const helpRequest = await helpWebSocketService.createHelpRequest(request);
      helpRequestId = helpRequest.id;
      vi.clearAllMocks(); // Clear the create event
    });

    it('should assign help request and emit status update event', async () => {
      const agentId = 'agent123';
      const updatedRequest = await helpWebSocketService.assignHelpRequest(helpRequestId, agentId);

      expect(updatedRequest.status).toBe('assigned');
      expect(updatedRequest.agent_id).toBe(agentId);

      expect(mockWebSocketManager.emitHelpStatusUpdated).toHaveBeenCalledWith(
        helpRequestId,
        'open',
        'assigned',
        {
          agentId: agentId,
          resolutionNotes: undefined
        }
      );
    });
  });

  describe('resolveHelpRequest', () => {
    let helpRequestId: number;

    beforeEach(async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'access_issue'
      };
      const helpRequest = await helpWebSocketService.createHelpRequest(request);
      helpRequestId = helpRequest.id;
      vi.clearAllMocks(); // Clear the create event
    });

    it('should resolve help request and emit status update event', async () => {
      const resolutionNotes = 'Issue resolved by restarting system';
      const agentId = 'agent123';
      
      const updatedRequest = await helpWebSocketService.resolveHelpRequest(
        helpRequestId, 
        resolutionNotes, 
        agentId
      );

      expect(updatedRequest.status).toBe('resolved');
      expect(updatedRequest.resolution_notes).toBe(resolutionNotes);
      expect(updatedRequest.agent_id).toBe(agentId);

      expect(mockWebSocketManager.emitHelpStatusUpdated).toHaveBeenCalledWith(
        helpRequestId,
        'open',
        'resolved',
        {
          agentId: agentId,
          resolutionNotes: resolutionNotes
        }
      );
    });
  });

  describe('updateHelpRequest', () => {
    let helpRequestId: number;

    beforeEach(async () => {
      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'access_issue',
        priority: 'medium'
      };
      const helpRequest = await helpWebSocketService.createHelpRequest(request);
      helpRequestId = helpRequest.id;
      vi.clearAllMocks(); // Clear the create event
    });

    it('should update help request priority without emitting status event', async () => {
      const updatedRequest = await helpWebSocketService.updateHelpRequest(helpRequestId, {
        priority: 'urgent'
      });

      expect(updatedRequest.priority).toBe('urgent');
      expect(mockWebSocketManager.emitHelpStatusUpdated).not.toHaveBeenCalled();
    });

    it('should update help request status and emit status update event', async () => {
      const updatedRequest = await helpWebSocketService.updateHelpRequest(helpRequestId, {
        status: 'assigned',
        agent_id: 'agent123'
      });

      expect(updatedRequest.status).toBe('assigned');
      expect(updatedRequest.agent_id).toBe('agent123');

      expect(mockWebSocketManager.emitHelpStatusUpdated).toHaveBeenCalledWith(
        helpRequestId,
        'open',
        'assigned',
        {
          agentId: 'agent123',
          resolutionNotes: undefined
        }
      );
    });
  });

  describe('read operations', () => {
    beforeEach(async () => {
      // Create test data
      const requests: CreateHelpRequest[] = [
        {
          kiosk_id: 'KIOSK001',
          category: 'access_issue',
          priority: 'high'
        },
        {
          kiosk_id: 'KIOSK002',
          category: 'hardware_problem',
          priority: 'medium'
        }
      ];

      for (const request of requests) {
        await helpWebSocketService.createHelpRequest(request);
      }
      vi.clearAllMocks(); // Clear create events
    });

    it('should get help request by ID without emitting events', async () => {
      const requests = await helpWebSocketService.getHelpRequests();
      const firstRequest = requests[0];

      const foundRequest = await helpWebSocketService.getHelpRequestById(firstRequest.id);

      expect(foundRequest).toEqual(firstRequest);
      expect(mockWebSocketManager.emitHelpRequested).not.toHaveBeenCalled();
      expect(mockWebSocketManager.emitHelpStatusUpdated).not.toHaveBeenCalled();
    });

    it('should get help requests with filtering without emitting events', async () => {
      const requests = await helpWebSocketService.getHelpRequests({ 
        kiosk_id: 'KIOSK001' 
      });

      expect(requests).toHaveLength(1);
      expect(requests[0].kiosk_id).toBe('KIOSK001');
      expect(mockWebSocketManager.emitHelpRequested).not.toHaveBeenCalled();
      expect(mockWebSocketManager.emitHelpStatusUpdated).not.toHaveBeenCalled();
    });

    it('should get help history without emitting events', async () => {
      const history = await helpWebSocketService.getHelpHistory('KIOSK001');

      expect(history).toHaveLength(1);
      expect(history[0].kiosk_id).toBe('KIOSK001');
      expect(mockWebSocketManager.emitHelpRequested).not.toHaveBeenCalled();
      expect(mockWebSocketManager.emitHelpStatusUpdated).not.toHaveBeenCalled();
    });

    it('should get help request statistics without emitting events', async () => {
      const stats = await helpWebSocketService.getHelpRequestStatistics();

      expect(stats.total).toBe(2);
      expect(stats.open).toBe(2);
      expect(stats.by_category).toHaveProperty('access_issue');
      expect(stats.by_category).toHaveProperty('hardware_problem');
      expect(mockWebSocketManager.emitHelpRequested).not.toHaveBeenCalled();
      expect(mockWebSocketManager.emitHelpStatusUpdated).not.toHaveBeenCalled();
    });
  });

  describe('photo upload', () => {
    it('should upload photo without emitting events', async () => {
      const mockBuffer = Buffer.from('test image data');
      const photoUrl = await helpWebSocketService.uploadPhoto(mockBuffer);
      
      expect(photoUrl).toMatch(/^\/uploads\/help-photos\/help-.+\.jpg$/);
      expect(mockWebSocketManager.emitHelpRequested).not.toHaveBeenCalled();
      expect(mockWebSocketManager.emitHelpStatusUpdated).not.toHaveBeenCalled();
    });
  });

  describe('service access', () => {
    it('should provide access to underlying help service', () => {
      const helpService = helpWebSocketService.getHelpService();
      expect(helpService).toBeDefined();
    });

    it('should provide access to WebSocket manager', () => {
      const wsManager = helpWebSocketService.getWebSocketManager();
      expect(wsManager).toBe(mockWebSocketManager);
    });
  });

  describe('WebSocket error handling', () => {
    it('should handle WebSocket emission errors gracefully', async () => {
      // Mock WebSocket manager to throw error
      vi.mocked(mockWebSocketManager.emitHelpRequested).mockRejectedValueOnce(
        new Error('WebSocket emission failed')
      );

      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'access_issue'
      };

      // Should not throw despite WebSocket error
      const helpRequest = await helpWebSocketService.createHelpRequest(request);
      expect(helpRequest.id).toBeDefined();
    });

    it('should work without WebSocket manager', async () => {
      const serviceWithoutWS = new HelpWebSocketService(db, undefined as any);

      const request: CreateHelpRequest = {
        kiosk_id: 'KIOSK001',
        category: 'access_issue'
      };

      const helpRequest = await serviceWithoutWS.createHelpRequest(request);
      expect(helpRequest.id).toBeDefined();
    });
  });
});