import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../../app/kiosk/src/controllers/session-manager';
import { LockerStateManager } from '../../shared/services/locker-state-manager';
import { WebSocketService } from '../../shared/services/websocket-service';

describe('Session Management Lifecycle Integration Tests', () => {
  let sessionManager: SessionManager;
  let lockerStateManager: LockerStateManager;
  let wsService: WebSocketService;
  let mockDatabase: any;

  beforeEach(() => {
    // Mock database
    mockDatabase = {
      get: vi.fn(),
      run: vi.fn(),
      all: vi.fn()
    };

    // Initialize services with proper mocking
    lockerStateManager = new LockerStateManager();
    wsService = new WebSocketService();
    sessionManager = new SessionManager('kiosk-1', lockerStateManager, wsService);

    // Mock WebSocket broadcasting
    vi.spyOn(wsService, 'broadcast').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('RFID Session Creation and Management', () => {
    it('should create session when RFID card is scanned', async () => {
      const cardId = '0009652489';
      
      const session = await sessionManager.createSession(cardId);
      
      expect(session).toBeDefined();
      expect(session.cardId).toBe(cardId);
      expect(session.kioskId).toBe('kiosk-1');
      expect(session.status).toBe('active');
      expect(session.timeoutSeconds).toBe(20);
    });

    it('should cancel existing session when new card is scanned', async () => {
      const firstCard = '0009652489';
      const secondCard = '0009652490';
      
      // Create first session
      const firstSession = await sessionManager.createSession(firstCard);
      expect(firstSession.status).toBe('active');
      
      // Scan second card
      const secondSession = await sessionManager.createSession(secondCard);
      
      // First session should be cancelled
      const cancelledSession = sessionManager.getSession(firstSession.id);
      expect(cancelledSession?.status).toBe('cancelled');
      
      // Second session should be active
      expect(secondSession.status).toBe('active');
      expect(secondSession.cardId).toBe(secondCard);
    });

    it('should handle session timeout correctly', async () => {
      const cardId = '0009652489';
      
      // Create session with short timeout for testing
      const session = await sessionManager.createSession(cardId, 1); // 1 second
      expect(session.status).toBe('active');
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Trigger cleanup
      sessionManager.cleanup();
      
      const expiredSession = sessionManager.getSession(session.id);
      expect(expiredSession?.status).toBe('expired');
    });

    it('should complete session when locker is selected', async () => {
      const cardId = '0009652489';
      const lockerId = 5;
      
      // Mock available locker
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 5,
        status: 'Free',
        kiosk_id: 'kiosk-1'
      });
      
      const session = await sessionManager.createSession(cardId);
      
      // Select locker
      const result = await sessionManager.selectLocker(session.id, lockerId);
      
      expect(result.success).toBe(true);
      expect(session.status).toBe('completed');
    });
  });

  describe('Multi-User Session Support', () => {
    it('should support multiple sessions on different kiosks', async () => {
      const kiosk2SessionManager = new SessionManager('kiosk-2', lockerStateManager, wsService);
      
      const card1 = '0009652489';
      const card2 = '0009652490';
      
      // Create sessions on different kiosks
      const session1 = await sessionManager.createSession(card1);
      const session2 = await kiosk2SessionManager.createSession(card2);
      
      expect(session1.kioskId).toBe('kiosk-1');
      expect(session2.kioskId).toBe('kiosk-2');
      expect(session1.status).toBe('active');
      expect(session2.status).toBe('active');
    });

    it('should enforce one session per kiosk rule', async () => {
      const card1 = '0009652489';
      const card2 = '0009652490';
      
      // Create first session
      const session1 = await sessionManager.createSession(card1);
      expect(session1.status).toBe('active');
      
      // Create second session on same kiosk
      const session2 = await sessionManager.createSession(card2);
      
      // First session should be cancelled
      expect(session1.status).toBe('cancelled');
      expect(session2.status).toBe('active');
    });
  });

  describe('Session State Broadcasting', () => {
    it('should broadcast session creation events', async () => {
      const cardId = '0009652489';
      
      await sessionManager.createSession(cardId);
      
      expect(wsService.broadcast).toHaveBeenCalledWith({
        type: 'session_update',
        timestamp: expect.any(Date),
        data: {
          sessionId: expect.any(String),
          kioskId: 'kiosk-1',
          cardId,
          status: 'active'
        }
      });
    });

    it('should broadcast session completion events', async () => {
      const cardId = '0009652489';
      const lockerId = 5;
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 5,
        status: 'Free',
        kiosk_id: 'kiosk-1'
      });
      
      const session = await sessionManager.createSession(cardId);
      await sessionManager.selectLocker(session.id, lockerId);
      
      expect(wsService.broadcast).toHaveBeenCalledWith({
        type: 'session_update',
        timestamp: expect.any(Date),
        data: {
          sessionId: session.id,
          status: 'completed',
          selectedLocker: lockerId
        }
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database errors gracefully', async () => {
      mockDatabase.get.mockImplementation(() => {
        throw new Error('Database connection failed');
      });
      
      const cardId = '0009652489';
      
      await expect(sessionManager.createSession(cardId)).rejects.toThrow('Database connection failed');
    });

    it('should recover from WebSocket connection failures', async () => {
      vi.spyOn(wsService, 'broadcast').mockImplementation(() => {
        throw new Error('WebSocket connection lost');
      });
      
      const cardId = '0009652489';
      
      // Should not throw error even if WebSocket fails
      const session = await sessionManager.createSession(cardId);
      expect(session).toBeDefined();
    });

    it('should handle invalid locker selection', async () => {
      const cardId = '0009652489';
      const invalidLockerId = 999;
      
      mockDatabase.get.mockReturnValue(null); // Locker not found
      
      const session = await sessionManager.createSession(cardId);
      const result = await sessionManager.selectLocker(session.id, invalidLockerId);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Locker not found');
    });
  });

  describe('Performance and Timing Requirements', () => {
    it('should complete session creation under 2 seconds', async () => {
      const cardId = '0009652489';
      const startTime = Date.now();
      
      await sessionManager.createSession(cardId);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(2000);
    });

    it('should handle rapid card scanning without conflicts', async () => {
      const cards = ['0009652489', '0009652490', '0009652491'];
      const sessions = [];
      
      // Rapid succession scanning
      for (const cardId of cards) {
        const session = await sessionManager.createSession(cardId);
        sessions.push(session);
      }
      
      // Only the last session should be active
      expect(sessions[0].status).toBe('cancelled');
      expect(sessions[1].status).toBe('cancelled');
      expect(sessions[2].status).toBe('active');
    });

    it('should maintain session state consistency during concurrent operations', async () => {
      const cardId = '0009652489';
      const session = await sessionManager.createSession(cardId);
      
      // Simulate concurrent operations
      const operations = [
        sessionManager.extendSession(session.id),
        sessionManager.getSession(session.id),
        sessionManager.cleanup()
      ];
      
      await Promise.all(operations);
      
      // Session should still be valid
      const finalSession = sessionManager.getSession(session.id);
      expect(finalSession).toBeDefined();
    });
  });

  describe('Session Lifecycle Validation', () => {
    it('should validate complete session lifecycle from creation to completion', async () => {
      const cardId = '0009652489';
      const lockerId = 3;
      
      // Mock available locker
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 3,
        status: 'Free',
        kiosk_id: 'kiosk-1'
      });
      
      // 1. Create session
      const session = await sessionManager.createSession(cardId);
      expect(session.status).toBe('active');
      expect(session.cardId).toBe(cardId);
      
      // 2. Verify session is retrievable
      const retrievedSession = sessionManager.getSession(session.id);
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession!.id).toBe(session.id);
      
      // 3. Select locker
      const result = await sessionManager.selectLocker(session.id, lockerId);
      expect(result.success).toBe(true);
      
      // 4. Verify session is completed
      expect(session.status).toBe('completed');
      
      // 5. Verify WebSocket notifications were sent
      expect(wsService.broadcast).toHaveBeenCalledTimes(2); // Creation + completion
    });

    it('should validate session timeout and cleanup behavior', async () => {
      const cardId = '0009652489';
      
      // Create session with very short timeout
      const session = await sessionManager.createSession(cardId, 0.1); // 100ms
      expect(session.status).toBe('active');
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Trigger cleanup
      sessionManager.cleanup();
      
      // Session should be expired
      const expiredSession = sessionManager.getSession(session.id);
      expect(expiredSession?.status).toBe('expired');
    });

    it('should validate session cancellation behavior', async () => {
      const firstCard = '0009652489';
      const secondCard = '0009652490';
      
      // Create first session
      const firstSession = await sessionManager.createSession(firstCard);
      expect(firstSession.status).toBe('active');
      
      // Create second session (should cancel first)
      const secondSession = await sessionManager.createSession(secondCard);
      
      // Verify first session was cancelled
      expect(firstSession.status).toBe('cancelled');
      expect(secondSession.status).toBe('active');
      
      // Verify WebSocket notifications
      expect(wsService.broadcast).toHaveBeenCalledWith({
        type: 'session_update',
        timestamp: expect.any(Date),
        data: {
          sessionId: firstSession.id,
          status: 'cancelled',
          reason: 'New card detected'
        }
      });
    });
  });
});