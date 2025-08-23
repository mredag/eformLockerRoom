import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAuthMiddleware, requirePermission, requireCsrfToken } from '../middleware/auth-middleware';
import { SessionManager } from '../services/session-manager';
import { Permission } from '../services/permission-service';
import { User } from '../services/auth-service';

describe('AuthMiddleware', () => {
  let sessionManager: SessionManager;
  let mockRequest: any;
  let mockReply: any;
  let mockUser: User;

  beforeEach(() => {
    sessionManager = new SessionManager();
    mockUser = {
      id: 1,
      username: 'testuser',
      role: 'staff',
      created_at: new Date(),
      last_login: new Date()
    };

    mockRequest = {
      url: '/api/test',
      cookies: {},
      user: undefined,
      session: undefined
    };

    mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      clearCookie: vi.fn().mockReturnThis()
    };
  });

  describe('createAuthMiddleware', () => {
    it('should skip authentication for auth routes', async () => {
      const middleware = createAuthMiddleware({ sessionManager });
      mockRequest.url = '/auth/login';

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should skip authentication for health endpoint', async () => {
      const middleware = createAuthMiddleware({ sessionManager });
      mockRequest.url = '/health';

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should skip authentication when skipAuth is true', async () => {
      const middleware = createAuthMiddleware({ sessionManager, skipAuth: true });

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should return 401 when no session token provided', async () => {
      const middleware = createAuthMiddleware({ sessionManager });

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 401 for invalid session token', async () => {
      const middleware = createAuthMiddleware({ sessionManager });
      mockRequest.cookies.session = 'invalid-token';

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid or expired session' });
      expect(mockReply.clearCookie).toHaveBeenCalledWith('session');
    });

    it('should set user and session for valid token', async () => {
      const session = sessionManager.createSession(mockUser);
      const middleware = createAuthMiddleware({ sessionManager });
      mockRequest.cookies.session = session.id;

      await middleware(mockRequest, mockReply);

      expect(mockRequest.user).toBe(mockUser);
      expect(mockRequest.session).toEqual({
        id: session.id,
        csrfToken: session.csrfToken
      });
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should check required permission', async () => {
      const session = sessionManager.createSession(mockUser);
      const middleware = createAuthMiddleware({ 
        sessionManager, 
        requiredPermission: Permission.MANAGE_VIP 
      });
      mockRequest.cookies.session = session.id;

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        required: Permission.MANAGE_VIP,
        userRole: 'staff'
      });
    });

    it('should allow access with sufficient permission', async () => {
      const adminUser: User = { ...mockUser, role: 'admin' };
      const session = sessionManager.createSession(adminUser);
      const middleware = createAuthMiddleware({ 
        sessionManager, 
        requiredPermission: Permission.MANAGE_VIP 
      });
      mockRequest.cookies.session = session.id;

      await middleware(mockRequest, mockReply);

      expect(mockRequest.user).toBe(adminUser);
      expect(mockReply.code).not.toHaveBeenCalled();
    });
  });

  describe('requirePermission', () => {
    it('should return 401 when no user', async () => {
      const middleware = requirePermission(Permission.VIEW_LOCKERS);

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 403 for insufficient permissions', async () => {
      mockRequest.user = mockUser;
      const middleware = requirePermission(Permission.MANAGE_VIP);

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        required: Permission.MANAGE_VIP,
        userRole: 'staff'
      });
    });

    it('should allow access with sufficient permissions', async () => {
      mockRequest.user = mockUser;
      const middleware = requirePermission(Permission.VIEW_LOCKERS);

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });
  });

  describe('requireCsrfToken', () => {
    it('should return 401 when no session', async () => {
      const middleware = requireCsrfToken();

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 403 for missing CSRF token', async () => {
      mockRequest.session = { id: 'session-id', csrfToken: 'valid-token' };
      mockRequest.headers = {};
      const middleware = requireCsrfToken();

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid CSRF token' });
    });

    it('should return 403 for invalid CSRF token', async () => {
      mockRequest.session = { id: 'session-id', csrfToken: 'valid-token' };
      mockRequest.headers = { 'x-csrf-token': 'invalid-token' };
      const middleware = requireCsrfToken();

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid CSRF token' });
    });

    it('should allow access with valid CSRF token in header', async () => {
      mockRequest.session = { id: 'session-id', csrfToken: 'valid-token' };
      mockRequest.headers = { 'x-csrf-token': 'valid-token' };
      const middleware = requireCsrfToken();

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should allow access with valid CSRF token in body', async () => {
      mockRequest.session = { id: 'session-id', csrfToken: 'valid-token' };
      mockRequest.headers = {};
      mockRequest.body = { csrfToken: 'valid-token' };
      const middleware = requireCsrfToken();

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });
  });
});
