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

function extractClientIp(request: FastifyRequest): string {
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

export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const { sessionManager, requiredPermission, skipAuth = false } = options;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip authentication for certain routes
    if (skipAuth || 
        request.url === '/auth/login' ||
        request.url === '/auth/logout' ||
        request.url === '/auth/me' ||
        request.url === '/auth/csrf-token' ||
        request.url.startsWith('/auth/change-password') ||
        request.url === '/health' ||
        request.url === '/setup' ||
        request.url === '/login.html' ||
        request.url.startsWith('/static/') ||
        request.url.startsWith('/api/i18n/') ||
        request.url.startsWith('/api/relay/') ||  // Allow all relay API routes
        request.url.startsWith('/api/heartbeat/') ||  // Allow all heartbeat API routes
        request.url.startsWith('/api/maksi/') ||  // Allow Maksisoft API routes (public access)
        request.url.endsWith('.css') ||
        request.url.endsWith('.js') ||
        request.url.endsWith('.ico')) {
      return;
    }

    console.log(`🔍 Auth middleware: Processing request to ${request.url}`);
    console.log(`🔍 Auth middleware: Cookies received:`, request.cookies);
    console.log(`🔍 Auth middleware: Cookie header:`, request.headers.cookie);
    
    const sessionToken = request.cookies.session;
    console.log(`🔍 Auth middleware: Session token:`, sessionToken?.substring(0, 16) + '...' || 'NONE');
    
    if (!sessionToken) {
      console.log(`❌ Auth middleware: No session token found`);
      // Check if this is a browser request (accepts HTML)
      const acceptsHtml = request.headers.accept?.includes('text/html');
      if (acceptsHtml) {
        reply.redirect('/login.html');
        return;
      }
      reply.code(401).send({
        code: 'unauthorized',
        message: 'login required'
      });
      return;
    }

    // Extract IP address with comprehensive fallbacks for different network configurations
    const ipAddress = extractClientIp(request);
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
      reply.code(401).send({
        code: 'unauthorized',
        message: 'login required'
      });
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
          code: 'forbidden',
          message: 'Insufficient permissions'
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
      reply.code(401).send({
        code: 'unauthorized',
        message: 'login required'
      });
      return;
    }

    if (!PermissionService.hasPermission(user.role, permission)) {
      reply.code(403).send({
        code: 'forbidden',
        message: 'Insufficient permissions'
      });
      return;
    }
  };
}

export function requireCsrfToken() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const session = request.session;
    if (!session) {
      reply.code(401).send({
        code: 'unauthorized',
        message: 'login required'
      });
      return;
    }

    // Check for CSRF token in header or body
    const csrfToken = (request.headers && request.headers['x-csrf-token'] as string) || 
                     (request.body as any)?.csrfToken;

    if (!csrfToken || csrfToken !== session.csrfToken) {
      reply.code(403).send({
        code: 'forbidden',
        message: 'Invalid CSRF token'
      });
      return;
    }
  };
}
