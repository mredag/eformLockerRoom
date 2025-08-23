import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthorizationService } from '../authorization-service';
import { PermissionService } from '../permission-service';
import { SessionManager } from '../session-manager';

// Mock dependencies
vi.mock('../permission-service.js');
vi.mock('../session-manager.js');

describe('AuthorizationService', () => {
  let authService: AuthorizationService;
  let mockPermissionService: any;
  let mockSessionManager: any;

  beforeEach(() => {
    mockPermissionService = {
      getUserPermissions: vi.fn(),
      hasPermission: vi.fn(),
      validatePermissionMatrix: vi.fn()
    };

    mockSessionManager = {
      getSession: vi.fn(),
      validateSession: vi.fn(),
      isSessionExpired: vi.fn()
    };

    authService = new AuthorizationService(
      mockPermissionService,
      mockSessionManager
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Role-Based Access Control', () => {
    it('should allow admin access to all operations', async () => {
      const sessionId = 'session123';
      const operation = 'manage_vip';

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 1,
        username: 'admin',
        role: 'admin',
        expires_at: new Date(Date.now() + 3600000)
      });

      mockPermissionService.hasPermission.mockReturnValue(true);

      const result = await authService.checkPermission(sessionId, operation);

      expect(result.allowed).toBe(true);
      expect(result.role).toBe('admin');
      expect(mockPermissionService.hasPermission).toHaveBeenCalledWith('admin', operation);
    });

    it('should restrict staff access to limited operations', async () => {
      const sessionId = 'session456';
      const operation = 'manage_vip';

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 2,
        username: 'staff1',
        role: 'staff',
        expires_at: new Date(Date.now() + 3600000)
      });

      mockPermissionService.hasPermission.mockReturnValue(false);

      const result = await authService.checkPermission(sessionId, operation);

      expect(result.allowed).toBe(false);
      expect(result.role).toBe('staff');
      expect(result.reason).toContain('Insufficient permissions');
    });

    it('should allow staff access to permitted operations', async () => {
      const sessionId = 'session456';
      const operation = 'open_locker';

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 2,
        username: 'staff1',
        role: 'staff',
        expires_at: new Date(Date.now() + 3600000)
      });

      mockPermissionService.hasPermission.mockReturnValue(true);

      const result = await authService.checkPermission(sessionId, operation);

      expect(result.allowed).toBe(true);
      expect(result.role).toBe('staff');
    });
  });

  describe('Session Validation', () => {
    it('should reject expired sessions', async () => {
      const sessionId = 'expired-session';
      const operation = 'view_lockers';

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 1,
        username: 'admin',
        role: 'admin',
        expires_at: new Date(Date.now() - 1000) // Expired 1 second ago
      });

      mockSessionManager.isSessionExpired.mockReturnValue(true);

      const result = await authService.checkPermission(sessionId, operation);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Session expired');
    });

    it('should reject invalid sessions', async () => {
      const sessionId = 'invalid-session';
      const operation = 'view_lockers';

      mockSessionManager.getSession.mockResolvedValue(null);

      const result = await authService.checkPermission(sessionId, operation);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid session');
    });

    it('should validate session integrity', async () => {
      const sessionId = 'session123';
      const operation = 'view_lockers';

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 1,
        username: 'admin',
        role: 'admin',
        expires_at: new Date(Date.now() + 3600000)
      });

      mockSessionManager.validateSession.mockReturnValue(false);

      const result = await authService.checkPermission(sessionId, operation);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Session validation failed');
    });
  });

  describe('Permission Matrix Validation', () => {
    it('should validate complex permission combinations', async () => {
      const sessionId = 'session123';
      const operations = ['view_lockers', 'open_locker', 'bulk_open'];

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 1,
        username: 'admin',
        role: 'admin',
        expires_at: new Date(Date.now() + 3600000)
      });

      mockPermissionService.hasPermission
        .mockReturnValueOnce(true)  // view_lockers
        .mockReturnValueOnce(true)  // open_locker
        .mockReturnValueOnce(true); // bulk_open

      const results = await Promise.all(
        operations.map(op => authService.checkPermission(sessionId, op))
      );

      expect(results.every(r => r.allowed)).toBe(true);
    });

    it('should handle permission inheritance correctly', async () => {
      const sessionId = 'session123';
      const operation = 'system_config';

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 1,
        username: 'admin',
        role: 'admin',
        expires_at: new Date(Date.now() + 3600000)
      });

      // Admin should inherit all permissions
      mockPermissionService.hasPermission.mockReturnValue(true);

      const result = await authService.checkPermission(sessionId, operation);

      expect(result.allowed).toBe(true);
      expect(mockPermissionService.hasPermission).toHaveBeenCalledWith('admin', operation);
    });
  });

  describe('Audit Logging', () => {
    it('should log successful authorization attempts', async () => {
      const sessionId = 'session123';
      const operation = 'open_locker';

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 1,
        username: 'admin',
        role: 'admin',
        expires_at: new Date(Date.now() + 3600000)
      });

      mockPermissionService.hasPermission.mockReturnValue(true);

      const result = await authService.checkPermission(sessionId, operation);

      expect(result.allowed).toBe(true);
      expect(result.auditInfo).toBeDefined();
      expect(result.auditInfo.username).toBe('admin');
      expect(result.auditInfo.operation).toBe(operation);
      expect(result.auditInfo.timestamp).toBeDefined();
    });

    it('should log failed authorization attempts', async () => {
      const sessionId = 'session456';
      const operation = 'manage_vip';

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 2,
        username: 'staff1',
        role: 'staff',
        expires_at: new Date(Date.now() + 3600000)
      });

      mockPermissionService.hasPermission.mockReturnValue(false);

      const result = await authService.checkPermission(sessionId, operation);

      expect(result.allowed).toBe(false);
      expect(result.auditInfo).toBeDefined();
      expect(result.auditInfo.username).toBe('staff1');
      expect(result.auditInfo.operation).toBe(operation);
      expect(result.auditInfo.reason).toContain('Insufficient permissions');
    });
  });

  describe('Bulk Authorization', () => {
    it('should efficiently check multiple permissions', async () => {
      const sessionId = 'session123';
      const operations = [
        'view_lockers',
        'open_locker',
        'block_locker',
        'view_events'
      ];

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 2,
        username: 'staff1',
        role: 'staff',
        expires_at: new Date(Date.now() + 3600000)
      });

      // Staff can do first 3 but not view_events
      mockPermissionService.hasPermission
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const results = await authService.checkMultiplePermissions(sessionId, operations);

      expect(results).toHaveLength(4);
      expect(results.slice(0, 3).every(r => r.allowed)).toBe(true);
      expect(results[3].allowed).toBe(false);
    });
  });

  describe('Context-Aware Authorization', () => {
    it('should consider operation context for authorization', async () => {
      const sessionId = 'session123';
      const operation = 'open_locker';
      const context = {
        locker_id: 5,
        kiosk_id: 'kiosk1',
        is_vip: true
      };

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 2,
        username: 'staff1',
        role: 'staff',
        expires_at: new Date(Date.now() + 3600000)
      });

      // Staff cannot open VIP lockers
      mockPermissionService.hasPermission.mockReturnValue(false);

      const result = await authService.checkPermissionWithContext(sessionId, operation, context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('VIP locker access denied');
    });

    it('should allow admin access regardless of context', async () => {
      const sessionId = 'session123';
      const operation = 'open_locker';
      const context = {
        locker_id: 5,
        kiosk_id: 'kiosk1',
        is_vip: true
      };

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 1,
        username: 'admin',
        role: 'admin',
        expires_at: new Date(Date.now() + 3600000)
      });

      mockPermissionService.hasPermission.mockReturnValue(true);

      const result = await authService.checkPermissionWithContext(sessionId, operation, context);

      expect(result.allowed).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle session service errors gracefully', async () => {
      const sessionId = 'session123';
      const operation = 'view_lockers';

      mockSessionManager.getSession.mockRejectedValue(new Error('Session service unavailable'));

      const result = await authService.checkPermission(sessionId, operation);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Authorization service error');
    });

    it('should handle permission service errors gracefully', async () => {
      const sessionId = 'session123';
      const operation = 'view_lockers';

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 1,
        username: 'admin',
        role: 'admin',
        expires_at: new Date(Date.now() + 3600000)
      });

      mockPermissionService.hasPermission.mockImplementation(() => {
        throw new Error('Permission service error');
      });

      const result = await authService.checkPermission(sessionId, operation);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Permission check failed');
    });
  });

  describe('Security Edge Cases', () => {
    it('should reject null or undefined session IDs', async () => {
      const result1 = await authService.checkPermission(null, 'view_lockers');
      const result2 = await authService.checkPermission(undefined, 'view_lockers');

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(false);
      expect(result1.reason).toContain('Invalid session');
      expect(result2.reason).toContain('Invalid session');
    });

    it('should reject empty or invalid operations', async () => {
      const sessionId = 'session123';

      mockSessionManager.getSession.mockResolvedValue({
        user_id: 1,
        username: 'admin',
        role: 'admin',
        expires_at: new Date(Date.now() + 3600000)
      });

      const result1 = await authService.checkPermission(sessionId, '');
      const result2 = await authService.checkPermission(sessionId, null);

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(false);
    });

    it('should handle role escalation attempts', async () => {
      const sessionId = 'session123';
      const operation = 'system_config';

      // Session claims admin but permission service says staff
      mockSessionManager.getSession.mockResolvedValue({
        user_id: 2,
        username: 'staff1',
        role: 'admin', // Potentially tampered
        expires_at: new Date(Date.now() + 3600000)
      });

      // Permission service correctly identifies as staff
      mockPermissionService.hasPermission.mockReturnValue(false);

      const result = await authService.checkPermission(sessionId, operation);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient permissions');
    });
  });
});
