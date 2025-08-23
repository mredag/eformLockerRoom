import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../services/session-manager';
import { User } from '../services/auth-service';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockUser: User;

  beforeEach(() => {
    sessionManager = new SessionManager({
      sessionTimeout: 60 * 60 * 1000, // 1 hour for testing
      maxIdleTime: 30 * 60 * 1000, // 30 minutes
      maxConcurrentSessions: 2,
      pinRotationDays: 90,
      autoRenewalEnabled: true,
      maxRenewals: 3
    });
    
    mockUser = {
      id: 1,
      username: 'testuser',
      role: 'staff',
      created_at: new Date(),
      last_login: new Date(),
      pin_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days from now
    };
  });

  describe('createSession', () => {
    it('should create a new session with unique ID and CSRF token', () => {
      const session = sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');

      expect(session.id).toBeTypeOf('string');
      expect(session.id.length).toBeGreaterThan(0);
      expect(session.csrfToken).toBeTypeOf('string');
      expect(session.csrfToken.length).toBeGreaterThan(0);
      expect(session.user).toBe(mockUser);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivity).toBeInstanceOf(Date);
      expect(session.ipAddress).toBe('192.168.1.100');
      expect(session.userAgent).toBe('Mozilla/5.0');
    });

    it('should create sessions with different IDs', () => {
      const session1 = sessionManager.createSession(mockUser);
      const session2 = sessionManager.createSession(mockUser);

      expect(session1.id).not.toBe(session2.id);
      expect(session1.csrfToken).not.toBe(session2.csrfToken);
    });
  });

  describe('validateSession', () => {
    it('should validate existing session and update last activity', () => {
      const session = sessionManager.createSession(mockUser);
      const originalLastActivity = session.lastActivity;

      // Wait a bit to ensure time difference
      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);

      const validatedSession = sessionManager.validateSession(session.id);

      expect(validatedSession).toBeDefined();
      expect(validatedSession!.id).toBe(session.id);
      expect(validatedSession!.lastActivity.getTime()).toBeGreaterThan(originalLastActivity.getTime());

      vi.useRealTimers();
    });

    it('should return null for non-existent session', () => {
      const result = sessionManager.validateSession('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return null and cleanup expired session', () => {
      const session = sessionManager.createSession(mockUser);

      // Mock time to simulate session expiration (8+ hours)
      vi.useFakeTimers();
      vi.advanceTimersByTime(9 * 60 * 60 * 1000); // 9 hours

      const result = sessionManager.validateSession(session.id);
      expect(result).toBeNull();

      // Session should be removed
      const result2 = sessionManager.validateSession(session.id);
      expect(result2).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('validateCsrfToken', () => {
    it('should validate correct CSRF token', () => {
      const session = sessionManager.createSession(mockUser);
      const isValid = sessionManager.validateCsrfToken(session.id, session.csrfToken);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect CSRF token', () => {
      const session = sessionManager.createSession(mockUser);
      const isValid = sessionManager.validateCsrfToken(session.id, 'wrong-token');
      expect(isValid).toBe(false);
    });

    it('should reject CSRF token for non-existent session', () => {
      const isValid = sessionManager.validateCsrfToken('non-existent', 'any-token');
      expect(isValid).toBe(false);
    });
  });

  describe('destroySession', () => {
    it('should remove session', () => {
      const session = sessionManager.createSession(mockUser);
      
      sessionManager.destroySession(session.id);
      
      const result = sessionManager.validateSession(session.id);
      expect(result).toBeNull();
    });
  });

  describe('renewSession', () => {
    it('should renew session with new CSRF token', () => {
      const session = sessionManager.createSession(mockUser);
      const originalCsrfToken = session.csrfToken;
      const originalLastActivity = session.lastActivity.getTime();

      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);

      const renewedSession = sessionManager.renewSession(session.id);

      expect(renewedSession).toBeDefined();
      expect(renewedSession!.id).toBe(session.id);
      expect(renewedSession!.csrfToken).not.toBe(originalCsrfToken);
      expect(renewedSession!.lastActivity.getTime()).toBeGreaterThanOrEqual(originalLastActivity + 1000);

      vi.useRealTimers();
    });

    it('should return null for expired session', () => {
      const session = sessionManager.createSession(mockUser);

      vi.useFakeTimers();
      vi.advanceTimersByTime(9 * 60 * 60 * 1000); // 9 hours

      const result = sessionManager.renewSession(session.id);
      expect(result).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('getActiveSessionCount', () => {
    it('should return correct count of active sessions', () => {
      expect(sessionManager.getActiveSessionCount()).toBe(0);

      const session1 = sessionManager.createSession(mockUser);
      expect(sessionManager.getActiveSessionCount()).toBe(1);

      const session2 = sessionManager.createSession(mockUser);
      expect(sessionManager.getActiveSessionCount()).toBe(2);

      sessionManager.destroySession(session1.id);
      expect(sessionManager.getActiveSessionCount()).toBe(1);
    });
  });
});  des
cribe('Enhanced Session Management', () => {
    it('should enforce concurrent session limits', () => {
      // Create maximum allowed sessions
      const session1 = sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      const session2 = sessionManager.createSession(mockUser, '192.168.1.101', 'Mozilla/5.0');
      
      expect(sessionManager.getUserSessions(mockUser.id)).toHaveLength(2);
      
      // Creating a third session should remove the oldest
      const session3 = sessionManager.createSession(mockUser, '192.168.1.102', 'Mozilla/5.0');
      
      expect(sessionManager.getUserSessions(mockUser.id)).toHaveLength(2);
      expect(sessionManager.validateSession(session1.id)).toBeNull(); // Oldest should be removed
      expect(sessionManager.validateSession(session2.id)).not.toBeNull();
      expect(sessionManager.validateSession(session3.id)).not.toBeNull();
    });

    it('should detect PIN change requirement', () => {
      const userWithExpiredPin = {
        ...mockUser,
        pin_expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000) // Expired yesterday
      };
      
      const session = sessionManager.createSession(userWithExpiredPin, '192.168.1.100', 'Mozilla/5.0');
      
      expect(session.requiresPinChange).toBe(true);
    });

    it('should handle session renewal with limits', () => {
      const session = sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      
      // Renew session multiple times
      let renewedSession = sessionManager.renewSession(session.id);
      expect(renewedSession).not.toBeNull();
      expect(renewedSession!.renewalCount).toBe(1);
      
      renewedSession = sessionManager.renewSession(session.id);
      expect(renewedSession!.renewalCount).toBe(2);
      
      renewedSession = sessionManager.renewSession(session.id);
      expect(renewedSession!.renewalCount).toBe(3);
      
      // Should fail after max renewals
      renewedSession = sessionManager.renewSession(session.id);
      expect(renewedSession).toBeNull();
    });

    it('should provide session statistics', () => {
      sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      sessionManager.createSession({ ...mockUser, id: 2 }, '192.168.1.101', 'Mozilla/5.0');
      
      const stats = sessionManager.getStatistics();
      
      expect(stats.totalSessions).toBe(2);
      expect(stats.userCount).toBe(2);
      expect(stats.averageSessionAge).toBeGreaterThan(0);
    });

    it('should destroy all user sessions', () => {
      const session1 = sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      const session2 = sessionManager.createSession(mockUser, '192.168.1.101', 'Mozilla/5.0');
      
      expect(sessionManager.getUserSessions(mockUser.id)).toHaveLength(2);
      
      sessionManager.destroyUserSessions(mockUser.id);
      
      expect(sessionManager.getUserSessions(mockUser.id)).toHaveLength(0);
      expect(sessionManager.validateSession(session1.id)).toBeNull();
      expect(sessionManager.validateSession(session2.id)).toBeNull();
    });

    it('should mark PIN as changed for user sessions', () => {
      const userWithExpiredPin = {
        ...mockUser,
        pin_expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000)
      };
      
      const session = sessionManager.createSession(userWithExpiredPin, '192.168.1.100', 'Mozilla/5.0');
      expect(session.requiresPinChange).toBe(true);
      
      sessionManager.markPinChanged(mockUser.id);
      
      const updatedSession = sessionManager.validateSession(session.id);
      expect(updatedSession!.requiresPinChange).toBe(false);
    });

    it('should force PIN change for user sessions', () => {
      const session = sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      expect(session.requiresPinChange).toBe(false);
      
      sessionManager.forcePinChange(mockUser.id);
      
      const updatedSession = sessionManager.validateSession(session.id);
      expect(updatedSession!.requiresPinChange).toBe(true);
    });

    it('should validate session with IP consistency check', () => {
      const session = sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      
      // Same IP should work
      let validatedSession = sessionManager.validateSession(session.id, '192.168.1.100');
      expect(validatedSession).not.toBeNull();
      
      // Different IP should log warning but still work (for now)
      validatedSession = sessionManager.validateSession(session.id, '192.168.1.200');
      expect(validatedSession).not.toBeNull();
    });

    it('should handle auto-renewal on idle timeout', () => {
      const session = sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      
      // Manually set last activity to trigger idle timeout
      session.lastActivity = new Date(Date.now() - 35 * 60 * 1000); // 35 minutes ago
      
      // Should auto-renew
      const validatedSession = sessionManager.validateSession(session.id);
      expect(validatedSession).not.toBeNull();
      expect(validatedSession!.renewalCount).toBe(1);
    });

    it('should update configuration', () => {
      const newConfig = {
        maxConcurrentSessions: 5,
        sessionTimeout: 2 * 60 * 60 * 1000 // 2 hours
      };
      
      sessionManager.updateConfig(newConfig);
      
      // Should allow more concurrent sessions now
      for (let i = 0; i < 5; i++) {
        sessionManager.createSession({ ...mockUser, id: i + 1 }, `192.168.1.${100 + i}`, 'Mozilla/5.0');
      }
      
      expect(sessionManager.getActiveSessionCount()).toBe(5);
    });
  });
});
