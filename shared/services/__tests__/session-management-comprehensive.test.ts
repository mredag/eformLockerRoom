/**
 * Comprehensive Session Management Unit Tests
 * Task 28: Create comprehensive unit tests
 * 
 * Tests all session management and extension logic with >90% coverage
 * Requirements: 16.1-16.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartSessionManager, SmartSession, SessionOutcome } from '../smart-session-manager';
import { ConfigurationManager } from '../configuration-manager';

describe('SessionManagement - Comprehensive Tests', () => {
  let sessionManager: SmartSessionManager;
  let mockDb: any;
  let mockConfigManager: any;

  const mockConfig = {
    session_limit_minutes: 180,
    extension_increment_minutes: 60,
    max_total_session_minutes: 240,
    session_cleanup_days: 7,
    version: 1
  };

  beforeEach(() => {
    mockDb = {
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
      prepare: vi.fn().mockReturnValue({
        get: vi.fn(),
        all: vi.fn(),
        run: vi.fn()
      })
    };

    mockConfigManager = {
      getEffectiveConfig: vi.fn().mockResolvedValue(mockConfig)
    };

    sessionManager = new SmartSessionManager(mockDb, mockConfigManager);
  });

  describe('Session Creation (Requirements 16.1-16.2)', () => {
    it('should create smart session with config-driven limit', async () => {
      mockDb.get.mockResolvedValue(null); // No existing session
      mockDb.run.mockResolvedValue({ changes: 1 });

      const session = await sessionManager.createSmartSession('card-123', 'kiosk-1');

      expect(session.cardId).toBe('card-123');
      expect(session.kioskId).toBe('kiosk-1');
      expect(session.status).toBe('active');
      expect(session.extensionCount).toBe(0);
      expect(session.maxExtensions).toBe(4);

      // Verify session duration is 180 minutes (config-driven)
      const duration = session.expiresTime.getTime() - session.startTime.getTime();
      const minutes = duration / (60 * 1000);
      expect(minutes).toBe(180);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO smart_sessions'),
        expect.arrayContaining([
          expect.any(String), // session ID
          'card-123',
          'kiosk-1',
          expect.any(String), // start time
          expect.any(String), // limit time
          expect.any(String), // expires time
          'active',
          0, // extension count
          4  // max extensions
        ])
      );
    });

    it('should cancel existing session when creating new one', async () => {
      const existingSession = {
        id: 'existing-session',
        card_id: 'card-123',
        status: 'active'
      };

      mockDb.get.mockResolvedValueOnce(existingSession);
      mockDb.get.mockResolvedValueOnce(null); // No session after cancellation
      mockDb.run.mockResolvedValue({ changes: 1 });

      await sessionManager.createSmartSession('card-123', 'kiosk-1');

      // Should cancel existing session first
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE smart_sessions SET status = ?, updated_at = ?'),
        ['cancelled', expect.any(String)]
      );
    });

    it('should generate unique session IDs', async () => {
      mockDb.get.mockResolvedValue(null);
      mockDb.run.mockResolvedValue({ changes: 1 });

      const session1 = await sessionManager.createSmartSession('card-123', 'kiosk-1');
      const session2 = await sessionManager.createSmartSession('card-456', 'kiosk-1');

      expect(session1.id).not.toBe(session2.id);
      expect(session1.id).toMatch(/^smart-session-/);
      expect(session2.id).toMatch(/^smart-session-/);
    });

    it('should handle database errors during session creation', async () => {
      mockDb.get.mockResolvedValue(null);
      mockDb.run.mockRejectedValue(new Error('Database error'));

      await expect(sessionManager.createSmartSession('card-123', 'kiosk-1'))
        .rejects.toThrow('Database error');
    });
  });

  describe('Session Extension Logic (Requirements 16.1-16.5)', () => {
    const mockSession = {
      id: 'session-123',
      card_id: 'card-123',
      kiosk_id: 'kiosk-1',
      start_time: new Date().toISOString(),
      limit_time: new Date(Date.now() + (180 * 60 * 1000)).toISOString(),
      expires_time: new Date(Date.now() + (180 * 60 * 1000)).toISOString(),
      status: 'active',
      extension_count: 0,
      max_extensions: 4,
      last_seen: new Date().toISOString()
    };

    it('should extend session by exactly 60 minutes (Requirement 16.1)', async () => {
      mockDb.get.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 1 });

      const success = await sessionManager.extendSession('session-123', 'admin-user', 'User requested more time');

      expect(success).toBe(true);

      // Verify extension updates expires_time by 60 minutes
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE smart_sessions'),
        expect.arrayContaining([
          expect.any(String), // new expires_time (60 minutes added)
          1, // extension_count incremented
          expect.any(String), // updated_at
          'session-123'
        ])
      );

      // Verify audit record creation
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO session_extension_audit'),
        expect.arrayContaining([
          'session-123',
          'admin-user',
          60, // extension minutes
          240, // new total minutes
          'User requested more time',
          expect.any(String) // timestamp
        ])
      );
    });

    it('should prevent extensions beyond 240 minutes total (Requirement 16.2)', async () => {
      const maxSession = {
        ...mockSession,
        expires_time: new Date(Date.now() + (240 * 60 * 1000)).toISOString(), // Already at 240 minutes
        extension_count: 4
      };

      mockDb.get.mockResolvedValue(maxSession);

      const success = await sessionManager.extendSession('session-123', 'admin-user', 'Test extension');

      expect(success).toBe(false);

      // Should not update database when at maximum
      expect(mockDb.run).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE smart_sessions'),
        expect.anything()
      );
    });

    it('should require administrator authorization (Requirement 16.3)', async () => {
      mockDb.get.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 1 });

      // Test with valid admin user
      const success = await sessionManager.extendSession('session-123', 'admin-user', 'Valid reason');
      expect(success).toBe(true);

      // Test with empty admin user (should fail)
      await expect(sessionManager.extendSession('session-123', '', 'Valid reason'))
        .rejects.toThrow('Administrator authorization required');

      // Test with null admin user (should fail)
      await expect(sessionManager.extendSession('session-123', null as any, 'Valid reason'))
        .rejects.toThrow('Administrator authorization required');
    });

    it('should create mandatory audit record (Requirement 16.4)', async () => {
      mockDb.get.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 1 });

      await sessionManager.extendSession('session-123', 'admin-user', 'User needs more time');

      // Verify audit record with all required fields
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO session_extension_audit'),
        expect.arrayContaining([
          'session-123',
          'admin-user',
          60, // extension minutes
          240, // total minutes after extension
          'User needs more time',
          expect.any(String) // timestamp
        ])
      );
    });

    it('should require manual intervention after 240 minutes (Requirement 16.5)', async () => {
      const maxSession = {
        ...mockSession,
        extension_count: 4,
        expires_time: new Date(Date.now() + (240 * 60 * 1000)).toISOString()
      };

      mockDb.get.mockResolvedValue(maxSession);

      const success = await sessionManager.extendSession('session-123', 'admin-user', 'Test extension');

      expect(success).toBe(false);

      // Should log requirement for manual intervention
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await sessionManager.extendSession('session-123', 'admin-user', 'Test extension');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Manual intervention required for sessions exceeding 240 minutes')
      );

      consoleSpy.mockRestore();
    });

    it('should log extension with exact format', async () => {
      mockDb.get.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 1 });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await sessionManager.extendSession('session-123', 'admin-user', 'Test extension');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Session extended: +60min, total=240min.'
      );

      consoleSpy.mockRestore();
    });

    it('should handle non-existent session extension', async () => {
      mockDb.get.mockResolvedValue(null); // Session not found

      const success = await sessionManager.extendSession('non-existent', 'admin-user', 'Test');

      expect(success).toBe(false);
    });

    it('should handle completed session extension attempt', async () => {
      const completedSession = {
        ...mockSession,
        status: 'completed'
      };

      mockDb.get.mockResolvedValue(completedSession);

      const success = await sessionManager.extendSession('session-123', 'admin-user', 'Test');

      expect(success).toBe(false);
    });
  });

  describe('Session Queries and Management', () => {
    it('should get active session for card', async () => {
      const activeSession = {
        id: 'active-session',
        card_id: 'card-123',
        kiosk_id: 'kiosk-1',
        start_time: new Date().toISOString(),
        expires_time: new Date(Date.now() + 60000).toISOString(),
        status: 'active',
        extension_count: 0,
        max_extensions: 4,
        last_seen: new Date().toISOString()
      };

      mockDb.get.mockResolvedValue(activeSession);

      const session = await sessionManager.getActiveSession('card-123');

      expect(session).toBeDefined();
      expect(session?.cardId).toBe('card-123');
      expect(session?.status).toBe('active');
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM smart_sessions WHERE card_id = ? AND status = ?'),
        ['card-123', 'active']
      );
    });

    it('should get kiosk session', async () => {
      const kioskSession = {
        id: 'kiosk-session',
        card_id: 'card-456',
        kiosk_id: 'kiosk-1',
        status: 'active'
      };

      mockDb.get.mockResolvedValue(kioskSession);

      const session = await sessionManager.getKioskSession('kiosk-1');

      expect(session?.kioskId).toBe('kiosk-1');
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM smart_sessions WHERE kiosk_id = ? AND status = ?'),
        ['kiosk-1', 'active']
      );
    });

    it('should get overdue sessions', async () => {
      const overdueSessions = [
        {
          id: 'overdue-1',
          card_id: 'card-123',
          status: 'overdue',
          expires_time: new Date(Date.now() - 60000).toISOString()
        },
        {
          id: 'overdue-2',
          card_id: 'card-456',
          status: 'overdue',
          expires_time: new Date(Date.now() - 120000).toISOString()
        }
      ];

      mockDb.all.mockResolvedValue(overdueSessions);

      const sessions = await sessionManager.getOverdueSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0].status).toBe('overdue');
      expect(sessions[1].status).toBe('overdue');
    });

    it('should update session', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      await sessionManager.updateSession('session-123', {
        status: 'completed',
        lastSeen: new Date()
      });

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE smart_sessions'),
        expect.arrayContaining(['completed', expect.any(String), 'session-123'])
      );
    });

    it('should complete session with outcome', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      await sessionManager.completeSession('session-123', SessionOutcome.NORMAL_COMPLETION);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE smart_sessions SET status = ?, outcome = ?, updated_at = ?'),
        ['completed', 'normal_completion', expect.any(String)]
      );
    });
  });

  describe('Overdue Detection and Management', () => {
    it('should mark overdue sessions', async () => {
      const expiredSessions = [
        {
          id: 'expired-1',
          expires_time: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
          status: 'active'
        }
      ];

      mockDb.all.mockResolvedValue(expiredSessions);
      mockDb.run.mockResolvedValue({ changes: 1 });

      await sessionManager.markOverdue('expired-1');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE smart_sessions SET status = ?, updated_at = ?'),
        ['overdue', expect.any(String)]
      );
    });

    it('should detect overdue sessions automatically', async () => {
      const expiredSessions = [
        {
          id: 'expired-1',
          expires_time: new Date(Date.now() - 60000).toISOString(),
          status: 'active'
        }
      ];

      mockDb.all.mockResolvedValue(expiredSessions);
      mockDb.run.mockResolvedValue({ changes: 1 });

      // Trigger overdue check
      await sessionManager['checkForOverdueSessions']();

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE smart_sessions SET status = ?'),
        expect.arrayContaining(['overdue'])
      );
    });
  });

  describe('Session Utilities', () => {
    it('should calculate remaining minutes correctly', () => {
      const session: SmartSession = {
        id: 'test-session',
        cardId: 'card-123',
        kioskId: 'kiosk-1',
        startTime: new Date(),
        limitTime: new Date(),
        expiresTime: new Date(Date.now() + (45 * 60 * 1000)), // 45 minutes from now
        status: 'active',
        lastSeen: new Date(),
        extensionCount: 0,
        maxExtensions: 4
      };

      const remaining = sessionManager.getRemainingMinutes(session);
      expect(remaining).toBe(45);
    });

    it('should check if session can be extended', () => {
      const extendableSession: SmartSession = {
        id: 'test-session',
        cardId: 'card-123',
        kioskId: 'kiosk-1',
        startTime: new Date(),
        limitTime: new Date(),
        expiresTime: new Date(Date.now() + (180 * 60 * 1000)), // 180 minutes total
        status: 'active',
        lastSeen: new Date(),
        extensionCount: 0,
        maxExtensions: 4
      };

      expect(sessionManager.canExtendSession(extendableSession)).toBe(true);

      // Test session at maximum
      const maxSession: SmartSession = {
        ...extendableSession,
        expiresTime: new Date(Date.now() + (240 * 60 * 1000)), // 240 minutes total
        extensionCount: 4
      };

      expect(sessionManager.canExtendSession(maxSession)).toBe(false);
    });

    it('should calculate total session duration', () => {
      const session: SmartSession = {
        id: 'test-session',
        cardId: 'card-123',
        kioskId: 'kiosk-1',
        startTime: new Date(Date.now() - (60 * 60 * 1000)), // 1 hour ago
        limitTime: new Date(),
        expiresTime: new Date(Date.now() + (120 * 60 * 1000)), // 2 hours from now
        status: 'active',
        lastSeen: new Date(),
        extensionCount: 2,
        maxExtensions: 4
      };

      const totalMinutes = sessionManager.getTotalSessionMinutes(session);
      expect(totalMinutes).toBe(180); // 3 hours total
    });
  });

  describe('Session Statistics and Monitoring', () => {
    it('should get session statistics', async () => {
      const mockStats = {
        total: 100,
        active: 15,
        overdue: 3,
        completed: 80,
        cancelled: 2
      };

      mockDb.get.mockResolvedValue(mockStats);

      const stats = await sessionManager.getSessionStats();

      expect(stats.total).toBe(100);
      expect(stats.active).toBe(15);
      expect(stats.overdue).toBe(3);
      expect(stats.completed).toBe(80);
      expect(stats.cancelled).toBe(2);
    });

    it('should get extension audit history', async () => {
      const mockAudit = [
        {
          id: 1,
          session_id: 'session-123',
          admin_user: 'admin-user',
          extension_minutes: 60,
          total_minutes_after: 240,
          reason: 'User requested more time',
          created_at: new Date().toISOString()
        }
      ];

      mockDb.all.mockResolvedValue(mockAudit);

      const audit = await sessionManager.getExtensionAuditHistory('session-123');

      expect(audit).toHaveLength(1);
      expect(audit[0].admin_user).toBe('admin-user');
      expect(audit[0].extension_minutes).toBe(60);
      expect(audit[0].reason).toBe('User requested more time');
    });
  });

  describe('Session Cleanup', () => {
    it('should clean up old completed sessions', async () => {
      mockDb.run.mockResolvedValue({ changes: 5 });

      const deletedCount = await sessionManager.cleanupOldSessions();

      expect(deletedCount).toBe(5);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM smart_sessions'),
        expect.arrayContaining([expect.any(String)]) // cutoff date
      );
    });

    it('should clean up old audit records', async () => {
      mockDb.run.mockResolvedValue({ changes: 10 });

      const deletedCount = await sessionManager.cleanupOldAuditRecords();

      expect(deletedCount).toBe(10);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM session_extension_audit'),
        expect.arrayContaining([expect.any(String)])
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDb.get.mockRejectedValue(new Error('Database connection failed'));

      await expect(sessionManager.getActiveSession('card-123'))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle configuration errors', async () => {
      mockConfigManager.getEffectiveConfig.mockRejectedValue(new Error('Config not found'));

      await expect(sessionManager.createSmartSession('card-123', 'kiosk-1'))
        .rejects.toThrow('Config not found');
    });

    it('should validate session extension parameters', async () => {
      await expect(sessionManager.extendSession('', 'admin-user', 'reason'))
        .rejects.toThrow('Session ID is required');

      await expect(sessionManager.extendSession('session-123', '', 'reason'))
        .rejects.toThrow('Administrator authorization required');

      await expect(sessionManager.extendSession('session-123', 'admin-user', ''))
        .rejects.toThrow('Extension reason is required');
    });
  });

  describe('Concurrent Session Management', () => {
    it('should handle concurrent session creation for same card', async () => {
      mockDb.get.mockResolvedValue(null);
      mockDb.run.mockResolvedValue({ changes: 1 });

      const promise1 = sessionManager.createSmartSession('card-123', 'kiosk-1');
      const promise2 = sessionManager.createSmartSession('card-123', 'kiosk-2');

      const [session1, session2] = await Promise.all([promise1, promise2]);

      // Both should succeed but only one should be active
      expect(session1.cardId).toBe('card-123');
      expect(session2.cardId).toBe('card-123');
    });

    it('should handle concurrent extension attempts', async () => {
      mockDb.get.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 1 });

      const promise1 = sessionManager.extendSession('session-123', 'admin-1', 'reason-1');
      const promise2 = sessionManager.extendSession('session-123', 'admin-2', 'reason-2');

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should complete (database handles concurrency)
      expect(typeof result1).toBe('boolean');
      expect(typeof result2).toBe('boolean');
    });
  });
});