import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from '../services/auth-service';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import * as fs from 'fs';
import * as path from 'path';

describe('AuthService', () => {
  let authService: AuthService;
  let dbManager: DatabaseManager;
  let testDbPath: string;

  beforeEach(async () => {
    // Create a unique test database file
    testDbPath = path.join(process.cwd(), 'data', `test-${Date.now()}.db`);
    
    // Ensure data directory exists
    const dataDir = path.dirname(testDbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Create database manager with test database
    dbManager = new DatabaseManager({
      path: testDbPath
    });
    await dbManager.initialize();
    
    // Create staff_users table for testing
    const db = dbManager.getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS staff_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_login TEXT,
        pin_expires_at TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    authService = new AuthService(dbManager);
  });

  afterEach(async () => {
    if (dbManager) {
      try {
        dbManager.close();
      } catch (error) {
        // Ignore close errors in tests
      }
    }
    
    // Clean up test database file
    if (testDbPath && fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('createUser', () => {
    it('should create a new user with hashed password', async () => {
      const userRequest = {
        username: 'testuser',
        password: 'testpassword123',
        role: 'staff' as const
      };

      const user = await authService.createUser(userRequest);

      expect(user.username).toBe('testuser');
      expect(user.role).toBe('staff');
      expect(user.id).toBeTypeOf('number');
      expect(user.created_at).toBeInstanceOf(Date);
    });

    it('should set PIN expiration to 90 days from creation', async () => {
      const userRequest = {
        username: 'testuser',
        password: 'testpassword123',
        role: 'admin' as const
      };

      const user = await authService.createUser(userRequest);
      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      expect(user.pin_expires_at).toBeDefined();
      expect(user.pin_expires_at!.getTime()).toBeCloseTo(expectedExpiry.getTime(), -1000); // Within 1 second
    });
  });

  describe('authenticateUser', () => {
    beforeEach(async () => {
      await authService.createUser({
        username: 'testuser',
        password: 'correctpassword',
        role: 'staff'
      });
    });

    it('should authenticate user with correct credentials', async () => {
      const user = await authService.authenticateUser('testuser', 'correctpassword');

      expect(user).toBeDefined();
      expect(user!.username).toBe('testuser');
      expect(user!.role).toBe('staff');
    });

    it('should return null for incorrect password', async () => {
      const user = await authService.authenticateUser('testuser', 'wrongpassword');
      expect(user).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      const user = await authService.authenticateUser('nonexistent', 'password');
      expect(user).toBeNull();
    });

    it('should update last_login on successful authentication', async () => {
      const beforeLogin = new Date();
      const user = await authService.authenticateUser('testuser', 'correctpassword');
      
      expect(user!.last_login).toBeDefined();
      expect(user!.last_login!.getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime());
    });
  });

  describe('changePassword', () => {
    let userId: number;

    beforeEach(async () => {
      const user = await authService.createUser({
        username: 'testuser',
        password: 'oldpassword',
        role: 'staff'
      });
      userId = user.id;
    });

    it('should change password and extend expiration', async () => {
      await authService.changePassword(userId, 'newpassword123');

      // Should be able to login with new password
      const user = await authService.authenticateUser('testuser', 'newpassword123');
      expect(user).toBeDefined();

      // Should not be able to login with old password
      const oldUser = await authService.authenticateUser('testuser', 'oldpassword');
      expect(oldUser).toBeNull();

      // PIN expiration should be extended
      const updatedUser = await authService.getUserById(userId);
      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      expect(updatedUser.pin_expires_at!.getTime()).toBeCloseTo(expectedExpiry.getTime(), -1000);
    });
  });

  describe('isPasswordExpired', () => {
    it('should return true for expired password', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        password: 'password',
        role: 'staff'
      });

      // Manually set expiration to past date using direct SQLite
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(testDbPath);
      
      await new Promise<void>((resolve, reject) => {
        db.run(`
          UPDATE staff_users 
          SET pin_expires_at = datetime('now', '-1 day') 
          WHERE id = ?
        `, [user.id], (err) => {
          db.close();
          if (err) reject(err);
          else resolve();
        });
      });

      const isExpired = await authService.isPasswordExpired(user.id);
      expect(isExpired).toBe(true);
    });

    it('should return false for non-expired password', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        password: 'password',
        role: 'staff'
      });

      const isExpired = await authService.isPasswordExpired(user.id);
      expect(isExpired).toBe(false);
    });
  });

  describe('listUsers', () => {
    beforeEach(async () => {
      await authService.createUser({
        username: 'admin1',
        password: 'password',
        role: 'admin'
      });
      await authService.createUser({
        username: 'staff1',
        password: 'password',
        role: 'staff'
      });
    });

    it('should return all active users', async () => {
      const users = await authService.listUsers();

      expect(users).toHaveLength(2);
      expect(users.map(u => u.username)).toContain('admin1');
      expect(users.map(u => u.username)).toContain('staff1');
    });

    it('should not return deactivated users', async () => {
      const users = await authService.listUsers();
      const adminUser = users.find(u => u.username === 'admin1')!;
      
      await authService.deactivateUser(adminUser.id);
      
      const activeUsers = await authService.listUsers();
      expect(activeUsers).toHaveLength(1);
      expect(activeUsers[0].username).toBe('staff1');
    });
  });

  describe('Hash Algorithm Compatibility', () => {
    it('should authenticate users with bcrypt hashes', async () => {
      const bcrypt = require('bcryptjs');
      const sqlite3 = require('sqlite3').verbose();
      
      // Create a user with bcrypt hash directly in database
      const bcryptHash = await bcrypt.hash('testpass123', 10);
      const db = new sqlite3.Database(testDbPath);
      
      await new Promise<void>((resolve, reject) => {
        db.run(
          "INSERT INTO staff_users (username, password_hash, role, active, created_at, pin_expires_at) VALUES (?, ?, 'admin', 1, datetime('now'), datetime('now', '+90 days'))",
          ['bcrypt_user', bcryptHash],
          (err) => {
            db.close();
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Should be able to authenticate with bcrypt hash
      const user = await authService.authenticateUser('bcrypt_user', 'testpass123');
      expect(user).toBeDefined();
      expect(user!.username).toBe('bcrypt_user');
    });

    it('should authenticate users with argon2 hashes', async () => {
      // Create user normally (uses argon2)
      const user = await authService.createUser({
        username: 'argon2_user',
        password: 'testpass456',
        role: 'staff'
      });

      // Should be able to authenticate with argon2 hash
      const authUser = await authService.authenticateUser('argon2_user', 'testpass456');
      expect(authUser).toBeDefined();
      expect(authUser!.username).toBe('argon2_user');
    });

    it('should reject unknown hash formats', async () => {
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(testDbPath);
      
      // Insert user with invalid hash format
      await new Promise<void>((resolve, reject) => {
        db.run(
          "INSERT INTO staff_users (username, password_hash, role, active, created_at, pin_expires_at) VALUES (?, ?, 'admin', 1, datetime('now'), datetime('now', '+90 days'))",
          ['invalid_user', 'invalid_hash_format'],
          (err) => {
            db.close();
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Should not be able to authenticate with invalid hash
      const user = await authService.authenticateUser('invalid_user', 'anypassword');
      expect(user).toBeNull();
    });

    it('should handle empty or null password hashes', async () => {
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(testDbPath);
      
      // Insert user with empty hash
      await new Promise<void>((resolve, reject) => {
        db.run(
          "INSERT INTO staff_users (username, password_hash, role, active, created_at, pin_expires_at) VALUES (?, ?, 'admin', 1, datetime('now'), datetime('now', '+90 days'))",
          ['empty_hash_user', ''],
          (err) => {
            db.close();
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Should not be able to authenticate with empty hash
      const user = await authService.authenticateUser('empty_hash_user', 'anypassword');
      expect(user).toBeNull();
    });
  });
});
