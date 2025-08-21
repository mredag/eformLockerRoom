import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AuthService, User } from '../services/auth-service.js';
import { SessionManager } from '../services/session-manager.js';
import { PermissionService, Permission } from '../services/permission-service.js';

interface AuthRouteOptions extends FastifyPluginOptions {
  authService: AuthService;
  sessionManager: SessionManager;
}

export async function authRoutes(fastify: FastifyInstance, options: AuthRouteOptions) {
  const { authService, sessionManager } = options;

  // Login endpoint
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string };

    try {
      const user = await authService.authenticateUser(username, password);
      if (!user) {
        reply.code(401).send({ error: 'Invalid credentials' });
        return;
      }

      // Check if password is expired
      const isExpired = await authService.isPasswordExpired(user.id);
      if (isExpired) {
        reply.code(403).send({ 
          error: 'Password expired', 
          requiresPasswordChange: true,
          userId: user.id 
        });
        return;
      }

      // Create session
      const session = sessionManager.createSession(user);

      // Set session cookie
      reply.setCookie('session', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 // 8 hours
      });

      reply.send({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: PermissionService.getPermissions(user.role)
        },
        csrfToken: session.csrfToken
      });
    } catch (error) {
      fastify.log.error('Login error:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Logout endpoint
  fastify.post('/logout', async (request, reply) => {
    const sessionToken = request.cookies.session;
    if (sessionToken) {
      sessionManager.destroySession(sessionToken);
    }

    reply.clearCookie('session');
    reply.send({ success: true });
  });

  // Change password endpoint
  fastify.post('/change-password', {
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'newPassword'],
        properties: {
          userId: { type: 'number' },
          newPassword: { type: 'string', minLength: 8 },
          csrfToken: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { userId, newPassword, csrfToken } = request.body as { 
      userId: number; 
      newPassword: string; 
      csrfToken?: string; 
    };

    const sessionToken = request.cookies.session;
    
    // For password changes, allow without full session validation but require CSRF token
    if (csrfToken && sessionToken) {
      const isValidCsrf = sessionManager.validateCsrfToken(sessionToken, csrfToken);
      if (!isValidCsrf) {
        reply.code(403).send({ error: 'Invalid CSRF token' });
        return;
      }
    }

    try {
      await authService.changePassword(userId, newPassword);
      reply.send({ success: true });
    } catch (error) {
      fastify.log.error('Password change error:', error);
      reply.code(500).send({ error: 'Failed to change password' });
    }
  });

  // Get CSRF token
  fastify.get('/csrf-token', async (request, reply) => {
    const sessionToken = request.cookies.session;
    if (!sessionToken) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }

    const session = sessionManager.validateSession(sessionToken);
    if (!session) {
      reply.code(401).send({ error: 'Invalid session' });
      return;
    }

    reply.send({
      token: session.csrfToken
    });
  });

  // Get current user info
  fastify.get('/me', async (request, reply) => {
    const sessionToken = request.cookies.session;
    if (!sessionToken) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }

    const session = sessionManager.validateSession(sessionToken);
    if (!session) {
      reply.code(401).send({ error: 'Invalid session' });
      return;
    }

    const isExpired = await authService.isPasswordExpired(session.user.id);

    reply.send({
      user: {
        id: session.user.id,
        username: session.user.username,
        role: session.user.role,
        permissions: PermissionService.getPermissions(session.user.role),
        passwordExpired: isExpired
      },
      csrfToken: session.csrfToken
    });
  });

  // Renew session endpoint
  fastify.post('/renew', async (request, reply) => {
    const sessionToken = request.cookies.session;
    if (!sessionToken) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }

    const renewedSession = sessionManager.renewSession(sessionToken);
    if (!renewedSession) {
      reply.code(401).send({ error: 'Session expired' });
      return;
    }

    reply.send({
      success: true,
      csrfToken: renewedSession.csrfToken
    });
  });

  // Admin-only: Create user
  fastify.post('/users', {
    preHandler: async (request, reply) => {
      const user = (request as any).user as User;
      if (!PermissionService.hasPermission(user.role, Permission.MANAGE_USERS)) {
        reply.code(403).send({ error: 'Insufficient permissions' });
        return;
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password', 'role'],
        properties: {
          username: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 8 },
          role: { type: 'string', enum: ['admin', 'staff'] }
        }
      }
    }
  }, async (request, reply) => {
    const { username, password, role } = request.body as {
      username: string;
      password: string;
      role: 'admin' | 'staff';
    };

    try {
      const newUser = await authService.createUser({ username, password, role });
      reply.send({
        success: true,
        user: {
          id: newUser.id,
          username: newUser.username,
          role: newUser.role,
          created_at: newUser.created_at
        }
      });
    } catch (error) {
      fastify.log.error('User creation error:', error);
      reply.code(500).send({ error: 'Failed to create user' });
    }
  });

  // Admin-only: List users
  fastify.get('/users', {
    preHandler: async (request, reply) => {
      const user = (request as any).user as User;
      if (!PermissionService.hasPermission(user.role, Permission.MANAGE_USERS)) {
        reply.code(403).send({ error: 'Insufficient permissions' });
        return;
      }
    }
  }, async (request, reply) => {
    try {
      const users = await authService.listUsers();
      reply.send({
        users: users.map(user => ({
          id: user.id,
          username: user.username,
          role: user.role,
          created_at: user.created_at,
          last_login: user.last_login,
          pin_expires_at: user.pin_expires_at
        }))
      });
    } catch (error) {
      fastify.log.error('List users error:', error);
      reply.code(500).send({ error: 'Failed to list users' });
    }
  });
}