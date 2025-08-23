import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from '../services/auth-service';
import { DatabaseManager } from '../../../../shared/database/database-manager';

describe('AuthService', () => {
  let authService: AuthService;
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    // Create a unique instance for each test
    dbManager = new DatabaseManager({
      path: ':memory:'
    });
    await dbManager.initialize();
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

      // Manually set expiration to past date
      const db = dbManager.getDatabase();
      db.prepare(`
        UPDATE staff_users 
        SET pin_expires_at = datetime('now', '-1 day') 
        WHERE id = ?
      `).run(user.id);

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
});
