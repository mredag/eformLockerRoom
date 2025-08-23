import { FastifyRequest, FastifyReply } from 'fastify';
import { SessionManager } from '../services/session-manager';
import { PermissionService, Permission } from '../services/permission-service';
import { User } from '../services/auth-service';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
    session?: {
      id: string;
      csrfToken: string;
    };
  }
}

export interface AuthMiddlewareOptions {
  sessionManager: SessionManager;
  requiredPermission?: Permission;
  skipAuth?: boolean;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const { sessionManager, requiredPermission, skipAuth = false } = options;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip authentication for certain routes
    if (skipAuth || 
        request.url.startsWith('/auth/') || 
        request.url === '/health' ||
        request.url === '/setup' ||
        request.url === '/login.html' ||
        request.url.startsWith('/static/') ||
        request.url.endsWith('.css') ||
        request.url.endsWith('.js') ||
        request.url.endsWith('.ico')) {
      return;
    }

    const sessionToken = request.cookies.session;
    if (!sessionToken) {
      // Check if this is a browser request (accepts HTML)
      const acceptsHtml = request.headers.accept?.includes('text/html');
      if (acceptsHtml) {
        reply.redirect('/login.html');
        return;
      }
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    const ipAddress = request.ip || request.socket.remoteAddress || 'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';
    const session = sessionManager.validateSession(sessionToken, ipAddress, userAgent);
    if (!session) {
      reply.clearCookie('session');
      // Check if this is a browser request (accepts HTML)
      const acceptsHtml = request.headers.accept?.includes('text/html');
      if (acceptsHtml) {
        reply.redirect('/login.html');
        return;
      }
      reply.code(401).send({ error: 'Invalid or expired session' });
      return;
    }

    // Add user and session info to request
    request.user = session.user;
    request.session = {
      id: session.id,
      csrfToken: session.csrfToken
    };

    // Check specific permission if required
    if (requiredPermission) {
      if (!PermissionService.hasPermission(session.user.role, requiredPermission)) {
        reply.code(403).send({ 
          error: 'Insufficient permissions',
          required: requiredPermission,
          userRole: session.user.role
        });
        return;
      }
    }
  };
}

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    if (!PermissionService.hasPermission(user.role, permission)) {
      reply.code(403).send({ 
        error: 'Insufficient permissions',
        required: permission,
        userRole: user.role
      });
      return;
    }
  };
}

export function requireCsrfToken() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const session = request.session;
    if (!session) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    // Check for CSRF token in header or body
    const csrfToken = (request.headers && request.headers['x-csrf-token'] as string) || 
                     (request.body as any)?.csrfToken;

    if (!csrfToken || csrfToken !== session.csrfToken) {
      reply.code(403).send({ error: 'Invalid CSRF token' });
      return;
    }
  };
}
