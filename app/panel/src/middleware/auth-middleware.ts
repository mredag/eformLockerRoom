import { FastifyRequest, FastifyReply } from 'fastify';
import { SessionManager } from '../services/session-manager.js';
import { PermissionService, Permission } from '../services/permission-service.js';
import { User } from '../services/auth-service.js';

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
    if (skipAuth || request.url.startsWith('/auth/') || request.url === '/health') {
      return;
    }

    const sessionToken = request.cookies.session;
    if (!sessionToken) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    const session = sessionManager.validateSession(sessionToken);
    if (!session) {
      reply.clearCookie('session');
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