import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionCleanupService } from '../services/session-cleanup-service';
import { SQLiteSessionManager } from '../services/sqlite-session-manager';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { User } from '../services/auth-service';

describe('SessionCleanupService', () => {
  let cleanupService: SessionCleanupService;
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
      sessionTimeout: 60 * 60 * 1000, // 1 hour
      maxIdleTime: 30 * 60 * 1000, // 30 minutes
      maxConcurrentSessions: 5,
      cleanupInterval: 1000 // 1 second for testing
    });

    cleanupService = new SessionCleanupService(sessionManager, {
      intervalMinutes: 0.1, // 6 seconds for testing
      enabled: true,
      logCleanup: false // Disable logging for tests
    });

    mockUser = {
      id: 1,
      username: 'testuser',
      role: 'staff',
      created_at: new Date(),
      last_login: new Date(),
      pin_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    };
  });

  afterEach(async () => {
    cleanupService.stop();
    sessionManager.shutdown();
    await dbManager.close();
    DatabaseManager.resetInstance({ path: ':memory:' });
  });

  describe('start and stop', () => {
    it('should start and stop cleanup service', () => {
      expect(cleanupService.getStatus().isRunning).toBe(false);
      
      cleanupService.start();
      expect(cleanupService.getStatus().isRunning).toBe(true);
      
      cleanupService.stop();
      expect(cleanupService.getStatus().isRunning).toBe(false);
    });

    it('should not start if already running', () => {
      cleanupService.start();
      expect(cleanupService.getStatus().isRunning).toBe(true);
      
      // Try to start again
      cleanupService.start();
      expect(cleanupService.getStatus().isRunning).toBe(true);
    });

    it('should not start if disabled', () => {
      cleanupService.updateConfig({ enabled: false });
      
      cleanupService.start();
      expect(cleanupService.getStatus().isRunning).toBe(false);
    });
  });

  describe('runCleanup', () => {
    it('should clean up expired sessions', async () => {
      // Create a session with very short timeout
      const shortTimeoutManager = new SQLiteSessionManager(dbManager, {
        sessionTimeout: 1, // 1ms timeout
        maxIdleTime: 1
      });

      const session = await shortTimeoutManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const shortTimeoutCleanupService = new SessionCleanupService(shortTimeoutManager);
      const cleanedCount = await shortTimeoutCleanupService.runCleanup();
      
      expect(cleanedCount).toBe(1);
      
      // Verify session is gone
      const result = await shortTimeoutManager.validateSession(session.id);
      expect(result).toBeNull();

      shortTimeoutManager.shutdown();
    });

    it('should return 0 when no sessions to clean', async () => {
      const cleanedCount = await cleanupService.runCleanup();
      expect(cleanedCount).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return correct status when stopped', () => {
      const status = cleanupService.getStatus();
      
      expect(status.isRunning).toBe(false);
      expect(status.intervalMinutes).toBe(0.1);
      expect(status.enabled).toBe(true);
      expect(status.nextCleanupIn).toBeUndefined();
    });

    it('should return correct status when running', () => {
      cleanupService.start();
      const status = cleanupService.getStatus();
      
      expect(status.isRunning).toBe(true);
      expect(status.intervalMinutes).toBe(0.1);
      expect(status.enabled).toBe(true);
      expect(status.nextCleanupIn).toBeDefined();
    });
  });

  describe('updateConfig', () => {
    it('should update configuration and restart if running', () => {
      cleanupService.start();
      expect(cleanupService.getStatus().isRunning).toBe(true);
      expect(cleanupService.getStatus().intervalMinutes).toBe(0.1);
      
      cleanupService.updateConfig({ intervalMinutes: 0.2 });
      
      expect(cleanupService.getStatus().isRunning).toBe(true);
      expect(cleanupService.getStatus().intervalMinutes).toBe(0.2);
    });

    it('should stop service when disabled via config update', () => {
      cleanupService.start();
      expect(cleanupService.getStatus().isRunning).toBe(true);
      
      cleanupService.updateConfig({ enabled: false });
      
      expect(cleanupService.getStatus().isRunning).toBe(false);
      expect(cleanupService.getStatus().enabled).toBe(false);
    });
  });

  describe('getStatistics', () => {
    it('should return session statistics', async () => {
      // Create some sessions
      await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
      await sessionManager.createSession(mockUser, '192.168.1.101', 'Chrome/1.0');
      
      const stats = await cleanupService.getStatistics();
      
      expect(stats.totalActiveSessions).toBe(2);
      expect(stats.sessionStatistics.totalSessions).toBe(2);
      expect(stats.sessionStatistics.userCount).toBe(1);
    });
  });

  describe('periodic cleanup', () => {
    it('should run cleanup periodically when started', async () => {
      // Mock the runCleanup method to track calls
      const runCleanupSpy = vi.spyOn(cleanupService, 'runCleanup');
      
      cleanupService.start();
      
      // Wait for at least one cleanup cycle
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(runCleanupSpy).toHaveBeenCalled();
      
      runCleanupSpy.mockRestore();
    });
  });
});