/**
 * Tests for SessionManager
 * Verifies session creation, timeout, cancellation, and cleanup functionality
 */

import { SessionManager, RfidSession } from '../session-manager';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      defaultTimeoutSeconds: 2, // Short timeout for testing
      cleanupIntervalMs: 1000,
      maxSessionsPerKiosk: 1
    });
  });

  afterEach(() => {
    sessionManager.shutdown();
  });

  describe('Session Creation', () => {
    test('should create a new session', () => {
      const session = sessionManager.createSession('kiosk-1', 'card-123', [1, 2, 3]);
      
      expect(session).toBeDefined();
      expect(session.kioskId).toBe('kiosk-1');
      expect(session.cardId).toBe('card-123');
      expect(session.status).toBe('active');
      expect(session.timeoutSeconds).toBe(2);
      expect(session.availableLockers).toEqual([1, 2, 3]);
    });

    test('should generate unique session IDs', () => {
      const session1 = sessionManager.createSession('kiosk-1', 'card-123');
      const session2 = sessionManager.createSession('kiosk-2', 'card-456');
      
      expect(session1.id).not.toBe(session2.id);
    });

    test('should enforce one-session-per-kiosk rule', () => {
      const session1 = sessionManager.createSession('kiosk-1', 'card-123');
      const session2 = sessionManager.createSession('kiosk-1', 'card-456');
      
      // First session should be cancelled
      expect(sessionManager.getSession(session1.id)).toBeNull();
      // Second session should be active
      expect(sessionManager.getSession(session2.id)).toBeDefined();
    });
  });

  describe('Session Retrieval', () => {
    test('should retrieve active session by ID', () => {
      const session = sessionManager.createSession('kiosk-1', 'card-123');
      const retrieved = sessionManager.getSession(session.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(session.id);
    });

    test('should retrieve kiosk session', () => {
      const session = sessionManager.createSession('kiosk-1', 'card-123');
      const kioskSession = sessionManager.getKioskSession('kiosk-1');
      
      expect(kioskSession).toBeDefined();
      expect(kioskSession?.id).toBe(session.id);
    });

    test('should return null for non-existent session', () => {
      const retrieved = sessionManager.getSession('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('Session Completion', () => {
    test('should complete a session', () => {
      const session = sessionManager.createSession('kiosk-1', 'card-123');
      const completed = sessionManager.completeSession(session.id);
      
      expect(completed).toBe(true);
      expect(sessionManager.getSession(session.id)).toBeNull();
      expect(sessionManager.getKioskSession('kiosk-1')).toBeNull();
    });

    test('should not complete non-existent session', () => {
      const completed = sessionManager.completeSession('non-existent');
      expect(completed).toBe(false);
    });
  });

  describe('Session Cancellation', () => {
    test('should cancel a session', () => {
      const session = sessionManager.createSession('kiosk-1', 'card-123');
      const cancelled = sessionManager.cancelSession(session.id, 'Test cancellation');
      
      expect(cancelled).toBe(true);
      expect(sessionManager.getSession(session.id)).toBeNull();
      expect(sessionManager.getKioskSession('kiosk-1')).toBeNull();
    });

    test('should not cancel non-existent session', () => {
      const cancelled = sessionManager.cancelSession('non-existent');
      expect(cancelled).toBe(false);
    });
  });

  describe('Session Timeout', () => {
    test('should expire session after timeout', (done) => {
      const session = sessionManager.createSession('kiosk-1', 'card-123');
      
      // Listen for expiration event
      sessionManager.once('session_expired', (event) => {
        expect(event.sessionId).toBe(session.id);
        expect(sessionManager.getSession(session.id)).toBeNull();
        done();
      });
      
      // Wait for timeout (2 seconds + buffer)
    }, 3000);

    test('should emit countdown updates', (done) => {
      const session = sessionManager.createSession('kiosk-1', 'card-123');
      let countdownReceived = false;
      
      sessionManager.on('countdown_update', (event) => {
        if (event.sessionId === session.id) {
          expect(event.data.remainingSeconds).toBeGreaterThanOrEqual(0);
          expect(event.data.remainingSeconds).toBeLessThanOrEqual(2);
          countdownReceived = true;
        }
      });
      
      setTimeout(() => {
        expect(countdownReceived).toBe(true);
        done();
      }, 1500);
    });
  });

  describe('Session Extension', () => {
    test('should extend session timeout', () => {
      const session = sessionManager.createSession('kiosk-1', 'card-123');
      const extended = sessionManager.extendSession(session.id, 5);
      
      expect(extended).toBe(true);
      
      // Check remaining time is approximately 5 seconds
      const remaining = sessionManager.getRemainingTime(session.id);
      expect(remaining).toBeGreaterThan(4);
      expect(remaining).toBeLessThanOrEqual(5);
    });

    test('should not extend non-existent session', () => {
      const extended = sessionManager.extendSession('non-existent', 5);
      expect(extended).toBe(false);
    });
  });

  describe('Session Validation', () => {
    test('should validate session ownership', () => {
      const session = sessionManager.createSession('kiosk-1', 'card-123');
      
      expect(sessionManager.validateSession(session.id, 'card-123')).toBe(true);
      expect(sessionManager.validateSession(session.id, 'card-456')).toBe(false);
      expect(sessionManager.validateSession('non-existent', 'card-123')).toBe(false);
    });
  });

  describe('Session Statistics', () => {
    test('should provide session statistics', () => {
      sessionManager.createSession('kiosk-1', 'card-123');
      sessionManager.createSession('kiosk-2', 'card-456');
      
      const stats = sessionManager.getSessionStats();
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);
      expect(stats.completed).toBe(0);
      expect(stats.expired).toBe(0);
      expect(stats.cancelled).toBe(0);
    });

    test('should list active sessions', () => {
      const session1 = sessionManager.createSession('kiosk-1', 'card-123');
      const session2 = sessionManager.createSession('kiosk-2', 'card-456');
      
      const activeSessions = sessionManager.getActiveSessions();
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.map(s => s.id)).toContain(session1.id);
      expect(activeSessions.map(s => s.id)).toContain(session2.id);
    });
  });

  describe('Kiosk Management', () => {
    test('should clear all sessions for a kiosk', () => {
      sessionManager.createSession('kiosk-1', 'card-123');
      sessionManager.createSession('kiosk-2', 'card-456');
      
      sessionManager.clearKioskSessions('kiosk-1');
      
      expect(sessionManager.getKioskSession('kiosk-1')).toBeNull();
      expect(sessionManager.getKioskSession('kiosk-2')).toBeDefined();
    });
  });

  describe('Event Emission', () => {
    test('should emit session_created event', (done) => {
      sessionManager.once('session_created', (event) => {
        expect(event.type).toBe('session_created');
        expect(event.sessionId).toBeDefined();
        expect(event.data.session).toBeDefined();
        expect(event.data.message).toBe('Kart okundu. Seçim için dokunun');
        done();
      });
      
      sessionManager.createSession('kiosk-1', 'card-123');
    });

    test('should emit session_completed event', (done) => {
      const session = sessionManager.createSession('kiosk-1', 'card-123');
      
      sessionManager.once('session_completed', (event) => {
        expect(event.type).toBe('session_completed');
        expect(event.sessionId).toBe(session.id);
        expect(event.data.message).toBe('Oturum tamamlandı');
        done();
      });
      
      sessionManager.completeSession(session.id);
    });

    test('should emit session_cancelled event', (done) => {
      const session = sessionManager.createSession('kiosk-1', 'card-123');
      
      sessionManager.once('session_cancelled', (event) => {
        expect(event.type).toBe('session_cancelled');
        expect(event.sessionId).toBe(session.id);
        expect(event.data.reason).toBe('Test reason');
        done();
      });
      
      sessionManager.cancelSession(session.id, 'Test reason');
    });
  });
});