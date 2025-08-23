import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AuthService, User } from '../services/auth-service';
import { SessionManager } from '../services/session-manager';
import { PermissionService, Permission } from '../services/permission-service';

interface AuthRouteOptions extends FastifyPluginOptions {
  authService: AuthService;
  sessionManager: SessionManager;
}

function extractClientIp(request: any): string {
  // Try multiple sources for IP address
  let ip = request.ip;
  
  // Check X-Forwarded-For header (proxy/load balancer)
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      // Take the first IP from the comma-separated list
      ip = forwardedFor.toString().split(',')[0]?.trim();
    }
  }
  
  // Check X-Real-IP header (nginx proxy)
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      ip = realIp.toString().trim();
    }
  }
  
  // Check CF-Connecting-IP (Cloudflare)
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    const cfIp = request.headers['cf-connecting-ip'];
    if (cfIp) {
      ip = cfIp.toString().trim();
    }
  }
  
  // Fallback to socket remote address
  if (!ip) {
    ip = request.socket.remoteAddress;
  }
  
  // Clean up IPv6 mapped IPv4 addresses
  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  
  return ip || 'unknown';
}

export async function authRoutes(fastify: FastifyInstance, options: AuthRouteOptions) {
  const { authService, sessionManager } = options;

  // Helper function to determine if we should use secure cookies
  const shouldUseSecureCookies = () => {
    // Don't use secure cookies on localhost or when explicitly disabled
    const serverAddress = fastify.server.address();
    const isLocalhost = serverAddress && 
      (typeof serverAddress === 'object' && 
       (serverAddress.address === '127.0.0.1' || serverAddress.address === '::1'));
    
    // Only use secure cookies in production AND when not on localhost AND when HTTPS is available
    return process.env.NODE_ENV === 'production' && !isLocalhost && process.env.HTTPS_ENABLED === 'true';
  };

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

      // Create session with flexible IP extraction
      const ipAddress = extractClientIp(request);
      const userAgent = request.headers['user-agent'] || 'unknown';
      const session = sessionManager.createSession(user, ipAddress, userAgent);

      // Set session cookie
      reply.setCookie('session', session.id, {
        path: '/',          // Make cookie available to all routes
        httpOnly: true,
        secure: shouldUseSecureCookies(),
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

    const ipAddress = extractClientIp(request);
    const userAgent = request.headers['user-agent'] || 'unknown';
    const session = sessionManager.validateSession(sessionToken, ipAddress, userAgent);
    if (!session) {
      reply.clearCookie('session');
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

    const ipAddress = request.ip || request.socket.remoteAddress || 'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';
    const renewedSession = sessionManager.renewSession(sessionToken, ipAddress, userAgent);
    if (!renewedSession) {
      reply.clearCookie('session');
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
