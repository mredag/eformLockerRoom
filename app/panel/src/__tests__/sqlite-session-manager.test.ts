import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SQLiteSessionManager } from '../services/sqlite-session-manager';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { User } from '../services/auth-service';

describe('SQLiteSessionManager', () => {
  let sessionManager: SQLiteSessionManager;
  let dbManager: DatabaseManager;
  let mockUser: User;

  beforeEach(async () => {
    // Create in-memory database for testing
    dbManager = DatabaseManager.getInstance({ path: ':memory:' });
    await dbManager.initialize();

    // Run migrations to set up schema
    const db = dbManager.getConnection();
    
    // Create staff_users table
    await db.exec(`
      CREATE TABLE staff_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'staff',
        active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        pin_expires_at DATETIME,
        CHECK (role IN ('admin', 'staff')),
        CHECK (active IN (0, 1))
      );
    `);

    // Create sessions table
    await db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        user_agent TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        csrf_token TEXT NOT NULL,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        renewal_count INTEGER DEFAULT 0,
        max_renewals INTEGER DEFAULT 5,
        FOREIGN KEY (user_id) REFERENCES staff_users(id) ON DELETE CASCADE
      );
    `);

    // Create indexes
    await db.exec(`
      CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX idx_sessions_last_activity ON sessions(last_activity);
    `);

    // Insert test user
    await db.run(`
      INSERT INTO staff_users (id, username, password_hash, role, created_at, pin_expires_at)
      VALUES (1, 'testuser', 'hash123', 'staff', datetime('now'), datetime('now', '+90 days'))
    `);

    sessionManager = new SQLiteSessionManager(dbManager, {
      sessionTimeout: 60 * 60 * 1000, // 1 hour for testing
      maxIdleTime: 30 * 60 * 1000, // 30 minutes
      maxConcurrentSessions: 2,
      pinRotationDays: 90,
      autoRenewalEnabled: true,
      cleanupInterval: 5 * 60 * 1000 // 5 minutes
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

  afterEach(async () => {
    sessionManager.shutdown();
    await dbManager.close();
    DatabaseManager.resetInstance({ path: ':memory:' });
  });

  describe('createSession', () => {
    it('should create a new session in SQLite database', async () => {
      const session = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');

      expect(session.id).toBeTypeOf('string');
      expect(session.id.length).toBeGreaterThan(0);
      expect(session.csrfToken).toBeTypeOf('string');
      expect(session.csrfToken.length).toBeGreaterThan(0);
      expect(session.user).toBe(mockUser);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivity).toBeInstanceOf(Date);
      expect(session.ipAddress).toBe('192.168.1.100');
      expect(session.userAgent).toBe('Mozilla/5.0');
      expect(session.renewalCount).toBe(0);

      // Verify session exists in database
      const db = dbManager.getConnection();
      const dbSession = await db.get('SELECT * FROM sessions WHERE id = ?', [session.id]);
      expect(dbSession).toBeTruthy();
      expect(dbSession.user_id).toBe(mockUser.id);
      expect(dbSession.ip_address).toBe('192.168.1.100');
    });

    it('should create sessions with different IDs', async () => {
      const session1 = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      const session2 = await sessionManager.createSession(mockUser, '192.168.1.101', 'Chrome/1.0');

      expect(session1.id).not.toBe(session2.id);
      expect(session1.csrfToken).not.toBe(session2.csrfToken);
    });

    it('should enforce concurrent session limit', async () => {
      // Create maximum allowed sessions
      const session1 = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      const session2 = await sessionManager.createSession(mockUser, '192.168.1.101', 'Chrome/1.0');

      // Verify both sessions exist
      const count1 = await sessionManager.getActiveSessionCount();
      expect(count1).toBe(2);

      // Create third session - should remove oldest
      const session3 = await sessionManager.createSession(mockUser, '192.168.1.102', 'Safari/1.0');

      // Should still have 2 sessions, but first one should be gone
      const count2 = await sessionManager.getActiveSessionCount();
      expect(count2).toBe(2);

      // Verify first session is gone
      const validatedSession1 = await sessionManager.validateSession(session1.id);
      expect(validatedSession1).toBeNull();

      // Verify third session exists
      const validatedSession3 = await sessionManager.validateSession(session3.id);
      expect(validatedSession3).toBeTruthy();
    });
  });

  describe('validateSession', () => {
    it('should validate existing session and update last activity', async () => {
      const originalSession = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      
      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const validatedSession = await sessionManager.validateSession(originalSession.id, '192.168.1.100', 'Mozilla/5.0');

      expect(validatedSession).toBeTruthy();
      expect(validatedSession!.id).toBe(originalSession.id);
      expect(validatedSession!.user.id).toBe(mockUser.id);
      expect(validatedSession!.lastActivity.getTime()).toBeGreaterThan(originalSession.lastActivity.getTime());
    });

    it('should return null for non-existent session', async () => {
      const result = await sessionManager.validateSession('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return null for expired session', async () => {
      // Create session with very short timeout
      const shortTimeoutManager = new SQLiteSessionManager(dbManager, {
        sessionTimeout: 1, // 1ms timeout
        maxIdleTime: 30 * 60 * 1000
      });

      const session = await shortTimeoutManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = await shortTimeoutManager.validateSession(session.id);
      expect(result).toBeNull();

      shortTimeoutManager.shutdown();
    });

    it('should handle IP address changes within local network', async () => {
      const session = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      
      // Validate with different IP in same subnet
      const result = await sessionManager.validateSession(session.id, '192.168.1.101', 'Mozilla/5.0');
      
      expect(result).toBeTruthy();
      expect(result!.ipAddress).toBe('192.168.1.101'); // Should update to new IP
    });

    it('should reject session with IP change outside local network', async () => {
      const session = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      
      // Try to validate with completely different IP
      const result = await sessionManager.validateSession(session.id, '203.0.113.1', 'Mozilla/5.0');
      
      expect(result).toBeNull();
    });
  });

  describe('renewSession', () => {
    it('should renew session with new CSRF token', async () => {
      const originalSession = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      const originalCsrf = originalSession.csrfToken;
      
      const renewedSession = await sessionManager.renewSession(originalSession.id, '192.168.1.100', 'Mozilla/5.0');
      
      expect(renewedSession).toBeTruthy();
      expect(renewedSession!.id).toBe(originalSession.id);
      expect(renewedSession!.csrfToken).not.toBe(originalCsrf);
      expect(renewedSession!.renewalCount).toBe(1);
    });

    it('should reject renewal when max renewals exceeded', async () => {
      const session = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      
      // Exhaust all renewals
      for (let i = 0; i < 5; i++) {
        const renewed = await sessionManager.renewSession(session.id);
        expect(renewed).toBeTruthy();
      }
      
      // Next renewal should fail
      const failedRenewal = await sessionManager.renewSession(session.id);
      expect(failedRenewal).toBeNull();
    });
  });

  describe('validateCsrfToken', () => {
    it('should validate correct CSRF token', async () => {
      const session = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      
      const isValid = await sessionManager.validateCsrfToken(session.id, session.csrfToken);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect CSRF token', async () => {
      const session = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      
      const isValid = await sessionManager.validateCsrfToken(session.id, 'wrong-token');
      expect(isValid).toBe(false);
    });

    it('should reject CSRF token for non-existent session', async () => {
      const isValid = await sessionManager.validateCsrfToken('non-existent', 'any-token');
      expect(isValid).toBe(false);
    });
  });

  describe('destroySession', () => {
    it('should remove session from database', async () => {
      const session = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      
      await sessionManager.destroySession(session.id);
      
      const result = await sessionManager.validateSession(session.id);
      expect(result).toBeNull();
      
      // Verify removed from database
      const db = dbManager.getConnection();
      const dbSession = await db.get('SELECT * FROM sessions WHERE id = ?', [session.id]);
      expect(dbSession).toBeUndefined();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions', async () => {
      // Create session with short timeout
      const shortTimeoutManager = new SQLiteSessionManager(dbManager, {
        sessionTimeout: 1, // 1ms timeout
        maxIdleTime: 1
      });

      const session = await shortTimeoutManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const cleanedCount = await shortTimeoutManager.cleanupExpiredSessions();
      expect(cleanedCount).toBe(1);
      
      // Verify session is gone
      const result = await shortTimeoutManager.validateSession(session.id);
      expect(result).toBeNull();

      shortTimeoutManager.shutdown();
    });
  });

  describe('getUserSessions', () => {
    it('should return all active sessions for user', async () => {
      const session1 = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      const session2 = await sessionManager.createSession(mockUser, '192.168.1.101', 'Chrome/1.0');
      
      const userSessions = await sessionManager.getUserSessions(mockUser.id);
      
      expect(userSessions).toHaveLength(2);
      expect(userSessions.map(s => s.id)).toContain(session1.id);
      expect(userSessions.map(s => s.id)).toContain(session2.id);
    });
  });

  describe('destroyUserSessions', () => {
    it('should remove all sessions for user', async () => {
      await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      await sessionManager.createSession(mockUser, '192.168.1.101', 'Chrome/1.0');
      
      await sessionManager.destroyUserSessions(mockUser.id);
      
      const userSessions = await sessionManager.getUserSessions(mockUser.id);
      expect(userSessions).toHaveLength(0);
    });
  });

  describe('getStatistics', () => {
    it('should return session statistics', async () => {
      await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      await sessionManager.createSession(mockUser, '192.168.1.101', 'Chrome/1.0');
      
      const stats = await sessionManager.getStatistics();
      
      expect(stats.totalSessions).toBe(2);
      expect(stats.userCount).toBe(1);
      expect(stats.averageSessionAge).toBeGreaterThan(0);
    });
  });
});