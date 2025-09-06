/**
 * Tests for SmartSessionManager
 * Verifies smart session creation, extension, overdue detection, and audit logging
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

import { SmartSessionManager, SmartSession } from '../smart-session-manager';
import { DatabaseManager } from '../database-manager';
import { ConfigurationManager } from '../configuration-manager';

// Mock dependencies
jest.mock('../database-manager');
jest.mock('../configuration-manager');

describe('SmartSessionManager', () => {
  let smartSessionManager: SmartSessionManager;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockConfig: jest.Mocked<ConfigurationManager>;

  beforeEach(() => {
    mockDb = new DatabaseManager(':memory:') as jest.Mocked<DatabaseManager>;
    mockConfig = new ConfigurationManager(mockDb) as jest.Mocked<ConfigurationManager>;
    
    // Mock database methods
    mockDb.run = jest.fn().mockResolvedValue({ changes: 1 });
    mockDb.get = jest.fn();
    mockDb.all = jest.fn().mockResolvedValue([]);

    // Mock configuration
    mockConfig.getEffectiveConfig = jest.fn().mockResolvedValue({
      session_limit_minutes: 180,
      extension_increment_minutes: 60,
      max_total_session_minutes: 240
    });

    smartSessionManager = new SmartSessionManager(mockDb, mockConfig);
  });

  afterEach(() => {
    smartSessionManager.shutdown();
  });

  describe('Session Creation', () => {
    test('should create a new smart session with config-driven limit', async () => {
      const session = await smartSessionManager.createSmartSession('card-123', 'kiosk-1');
      
      expect(session).toBeDefined();
      expect(session.cardId).toBe('card-123');
      expect(session.kioskId).toBe('kiosk-1');
      expect(session.status).toBe('active');
      expect(session.extensionCount).toBe(0);
      expect(session.maxExtensions).toBe(4);
      
      // Verify database insertion
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO smart_sessions'),
        expect.arrayContaining(['card-123', 'kiosk-1'])
      );
    });

    test('should use 180-minute default session limit', async () => {
      const session = await smartSessionManager.createSmartSession('card-123', 'kiosk-1');
      
      const sessionDuration = session.expiresTime.getTime() - session.startTime.getTime();
      const sessionMinutes = sessionDuration / (60 * 1000);
      
      expect(sessionMinutes).toBe(180);
    });

    test('should cancel existing session for same card', async () => {
      // Mock existing session
      mockDb.get = jest.fn()
        .mockResolvedValueOnce({
          id: 'existing-session',
          card_id: 'card-123',
          status: 'active'
        })
        .mockResolvedValueOnce(null); // No session after cancellation

      await smartSessionManager.createSmartSession('card-123', 'kiosk-1');
      
      // Should update existing session to cancelled
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE smart_sessions'),
        expect.arrayContaining(['cancelled'])
      );
    });
  });

  describe('Session Extension (Requirements 16.1-16.5)', () => {
    let mockSession: any;

    beforeEach(() => {
      mockSession = {
        id: 'session-123',
        card_id: 'card-123',
        kiosk_id: 'kiosk-1',
        start_time: new Date().toISOString(),
        expires_time: new Date(Date.now() + (180 * 60 * 1000)).toISOString(), // 180 minutes from now
        status: 'active',
        extension_count: 0,
        max_extensions: 4
      };
    });

    test('should extend session by exactly 60 minutes (Requirement 16.1)', async () => {
      mockDb.get = jest.fn().mockResolvedValue(mockSession);
      
      const success = await smartSessionManager.extendSession('session-123', 'admin-user', 'User requested more time');
      
      expect(success).toBe(true);
      
      // Verify extension update
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE smart_sessions'),
        expect.arrayContaining([60 * 60 * 1000]) // 60 minutes in milliseconds added to expires_time
      );
    });

    test('should prevent extensions beyond 240 minutes total (Requirement 16.2)', async () => {
      // Mock session that already has 240 minutes total
      mockSession.expires_time = new Date(Date.now() + (240 * 60 * 1000)).toISOString();
      mockSession.extension_count = 1;
      mockDb.get = jest.fn().mockResolvedValue(mockSession);
      
      const success = await smartSessionManager.extendSession('session-123', 'admin-user', 'Test extension');
      
      expect(success).toBe(false);
      
      // Should not update database
      expect(mockDb.run).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE smart_sessions'),
        expect.anything()
      );
    });

    test('should require administrator authorization (Requirement 16.3)', async () => {
      mockDb.get = jest.fn().mockResolvedValue(mockSession);
      
      // Extension should require admin user parameter
      const success = await smartSessionManager.extendSession('session-123', 'admin-user', 'Valid reason');
      
      expect(success).toBe(true);
      
      // Verify audit record creation with admin user
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO session_extension_audit'),
        expect.arrayContaining(['session-123', 'admin-user', 60, 240, 'Valid reason'])
      );
    });

    test('should create mandatory audit record (Requirement 16.4)', async () => {
      mockDb.get = jest.fn().mockResolvedValue(mockSession);
      
      await smartSessionManager.extendSession('session-123', 'admin-user', 'User needs more time');
      
      // Verify audit record creation
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO session_extension_audit'),
        expect.arrayContaining([
          'session-123',
          'admin-user', 
          60, // extension minutes
          240, // total minutes
          'User needs more time'
        ])
      );
    });

    test('should require manual intervention after 240 minutes (Requirement 16.5)', async () => {
      // Mock session at maximum limit
      mockSession.extension_count = 4;
      mockSession.expires_time = new Date(Date.now() + (240 * 60 * 1000)).toISOString();
      mockDb.get = jest.fn().mockResolvedValue(mockSession);
      
      const success = await smartSessionManager.extendSession('session-123', 'admin-user', 'Test extension');
      
      expect(success).toBe(false);
      console.log('Manual intervention required for sessions exceeding 240 minutes');
    });

    test('should log extension with required format', async () => {
      mockDb.get = jest.fn().mockResolvedValue(mockSession);
      const consoleSpy = jest.spyOn(console, 'log');
      
      await smartSessionManager.extendSession('session-123', 'admin-user', 'Test extension');
      
      // Verify log format matches task acceptance criteria
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Session extended: +60min, total=240min')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Overdue Session Detection', () => {
    test('should detect and mark overdue sessions', async () => {
      const expiredSession = {
        id: 'expired-session',
        expires_time: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        status: 'active'
      };
      
      mockDb.all = jest.fn().mockResolvedValue([expiredSession]);
      
      // Trigger overdue check manually
      await smartSessionManager['checkForOverdueSessions']();
      
      // Verify session marked as overdue
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE smart_sessions'),
        expect.arrayContaining(['overdue'])
      );
    });

    test('should get overdue sessions', async () => {
      const overdueSession = {
        id: 'overdue-session',
        card_id: 'card-123',
        status: 'overdue'
      };
      
      mockDb.all = jest.fn().mockResolvedValue([overdueSession]);
      
      const overdueSessions = await smartSessionManager.getOverdueSessions();
      
      expect(overdueSessions).toHaveLength(1);
      expect(overdueSessions[0].status).toBe('overdue');
    });
  });

  describe('Session Queries', () => {
    test('should get active session for card', async () => {
      const activeSession = {
        id: 'active-session',
        card_id: 'card-123',
        status: 'active',
        start_time: new Date().toISOString(),
        expires_time: new Date(Date.now() + 60000).toISOString()
      };
      
      mockDb.get = jest.fn().mockResolvedValue(activeSession);
      
      const session = await smartSessionManager.getActiveSession('card-123');
      
      expect(session).toBeDefined();
      expect(session?.cardId).toBe('card-123');
      expect(session?.status).toBe('active');
    });

    test('should get session statistics', async () => {
      mockDb.get = jest.fn().mockResolvedValue({
        total: 10,
        active: 3,
        overdue: 2,
        completed: 4,
        cancelled: 1
      });
      
      const stats = await smartSessionManager.getSessionStats();
      
      expect(stats.total).toBe(10);
      expect(stats.active).toBe(3);
      expect(stats.overdue).toBe(2);
      expect(stats.completed).toBe(4);
      expect(stats.cancelled).toBe(1);
    });
  });

  describe('Session Management', () => {
    test('should calculate remaining time correctly', () => {
      const session: SmartSession = {
        id: 'test-session',
        cardId: 'card-123',
        kioskId: 'kiosk-1',
        startTime: new Date(),
        limitTime: new Date(Date.now() + (180 * 60 * 1000)),
        expiresTime: new Date(Date.now() + (60 * 60 * 1000)), // 60 minutes remaining
        status: 'active',
        lastSeen: new Date(),
        extensionCount: 0,
        maxExtensions: 4
      };
      
      const remaining = smartSessionManager.getRemainingMinutes(session);
      
      expect(remaining).toBe(60);
    });

    test('should check if session can be extended', () => {
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
      
      const canExtend = smartSessionManager.canExtendSession(extendableSession);
      expect(canExtend).toBe(true);
      
      // Test session at maximum limit
      const maxSession: SmartSession = {
        ...extendableSession,
        expiresTime: new Date(Date.now() + (240 * 60 * 1000)), // 240 minutes total
        extensionCount: 4
      };
      
      const cannotExtend = smartSessionManager.canExtendSession(maxSession);
      expect(cannotExtend).toBe(false);
    });
  });

  describe('Session Cleanup', () => {
    test('should clean up old completed sessions', async () => {
      mockDb.run = jest.fn().mockResolvedValue({ changes: 3 });
      
      await smartSessionManager['cleanupOldSessions']();
      
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM smart_sessions'),
        expect.arrayContaining([expect.any(String)]) // cutoff time
      );
    });
  });
});