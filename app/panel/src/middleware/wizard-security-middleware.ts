import { FastifyRequest, FastifyReply } from 'fastify';
import { WizardSecurityService, WizardOperation, WizardSecurityContext } from '../../../../shared/services/wizard-security-service';
import { WizardInputValidator } from '../../../../shared/services/wizard-input-validator';
import { wizardSecurityMonitor } from '../../../../shared/services/wizard-security-monitor';
import { SessionManager } from '../services/session-manager';
import { User } from '../services/auth-service';

export interface WizardSecurityMiddlewareOptions {
  operation: WizardOperation;
  requireAuth?: boolean;
  requireCsrf?: boolean;
  validateInput?: boolean;
  auditLevel?: 'basic' | 'detailed' | 'comprehensive';
}

export class WizardSecurityMiddleware {
  constructor(
    private securityService: WizardSecurityService,
    private sessionManager: SessionManager
  ) {}

  /**
   * Create security middleware for wizard operations
   */
  createMiddleware(options: WizardSecurityMiddlewareOptions) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();
      let securityContext: WizardSecurityContext | null = null;

      try {
        // Extract client information
        const ipAddress = this.extractClientIp(request);
        const userAgent = request.headers['user-agent'] || 'unknown';

        // Authentication check
        if (options.requireAuth !== false) {
          const authResult = await this.authenticateRequest(request, ipAddress, userAgent);
          if (!authResult.success) {
            await this.logSecurityEvent(
              null,
              options.operation,
              'authentication',
              false,
              { reason: authResult.error, ipAddress, userAgent }
            );
            return reply.code(401).send({ error: authResult.error });
          }
          securityContext = authResult.context!;
        }

        // CSRF token validation
        if (options.requireCsrf && securityContext) {
          const csrfToken = request.headers['x-csrf-token'] as string || request.body?.csrfToken;
          if (!csrfToken || !this.securityService.validateCsrfToken(this.sessionManager, securityContext.sessionId, csrfToken)) {
            await this.logSecurityEvent(
              securityContext,
              options.operation,
              'csrf_validation',
              false,
              { reason: 'Invalid CSRF token' }
            );
            return reply.code(403).send({ error: 'Invalid CSRF token' });
          }
        }

        // Permission check
        if (securityContext && !this.securityService.canPerformOperation(securityContext, options.operation)) {
          await this.logSecurityEvent(
            securityContext,
            options.operation,
            'authorization',
            false,
            { reason: 'Insufficient permissions' }
          );
          return reply.code(403).send({ error: 'Insufficient permissions' });
        }

        // Rate limiting
        if (securityContext) {
          const rateLimitAllowed = this.securityService.checkRateLimit(securityContext, options.operation);
          if (!rateLimitAllowed) {
            wizardSecurityMonitor.checkRateLimit(securityContext, options.operation, false);
            await this.logSecurityEvent(
              securityContext,
              options.operation,
              'rate_limit',
              false,
              { reason: 'Rate limit exceeded' }
            );
            return reply.code(429).send({ error: 'Rate limit exceeded' });
          }
        }

        // Input validation
        if (options.validateInput && request.body) {
          const validationResult = WizardInputValidator.validateInput(options.operation, request.body);
          if (!validationResult.valid) {
            await this.logSecurityEvent(
              securityContext,
              options.operation,
              'input_validation',
              false,
              { errors: validationResult.errors, originalData: request.body }
            );
            return reply.code(400).send({ 
              error: 'Invalid input', 
              details: validationResult.errors 
            });
          }
          // Replace request body with sanitized data
          (request as any).body = validationResult.sanitizedData;
        }

        // Suspicious activity detection
        if (securityContext) {
          const suspiciousActivity = this.securityService.detectSuspiciousActivity(securityContext);
          if (suspiciousActivity.suspicious) {
            wizardSecurityMonitor.reportSuspiciousActivity(
              securityContext,
              suspiciousActivity.reasons,
              suspiciousActivity.riskScore
            );
            
            // Don't block the request, but log it for monitoring
            await this.logSecurityEvent(
              securityContext,
              options.operation,
              'suspicious_activity',
              true,
              { 
                reasons: suspiciousActivity.reasons, 
                riskScore: suspiciousActivity.riskScore 
              },
              'high'
            );
          }
        }

        // Add security context to request
        if (securityContext) {
          (request as any).securityContext = securityContext;
        }

        // Log successful security check
        await this.logSecurityEvent(
          securityContext,
          options.operation,
          'security_check',
          true,
          { 
            duration: Date.now() - startTime,
            auditLevel: options.auditLevel || 'basic'
          }
        );

      } catch (error) {
        console.error('Security middleware error:', error);
        await this.logSecurityEvent(
          securityContext,
          options.operation,
          'middleware_error',
          false,
          { error: error.message }
        );
        return reply.code(500).send({ error: 'Security check failed' });
      }
    };
  }

  /**
   * Create emergency stop middleware
   */
  createEmergencyStopMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const { reason } = request.body as { reason: string };
      
      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return reply.code(400).send({ error: 'Emergency stop reason is required' });
      }

      const securityContext = (request as any).securityContext as WizardSecurityContext;
      if (!securityContext) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      try {
        this.securityService.emergencyStop(securityContext, reason);
        wizardSecurityMonitor.reportEmergencyStop(securityContext, reason);
        
        reply.send({ 
          success: true, 
          message: 'Emergency stop activated',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        reply.code(403).send({ error: error.message });
      }
    };
  }

  /**
   * Authenticate request and create security context
   */
  private async authenticateRequest(
    request: FastifyRequest, 
    ipAddress: string, 
    userAgent: string
  ): Promise<{
    success: boolean;
    error?: string;
    context?: WizardSecurityContext;
  }> {
    const sessionToken = request.cookies.session;
    if (!sessionToken) {
      return { success: false, error: 'No session token provided' };
    }

    const session = this.sessionManager.validateSession(sessionToken, ipAddress, userAgent);
    if (!session) {
      return { success: false, error: 'Invalid or expired session' };
    }

    const context = this.securityService.createSecurityContext(
      session.user.id,
      session.user.username,
      session.user.role,
      session.id,
      ipAddress,
      userAgent,
      session.csrfToken
    );

    return { success: true, context };
  }

  /**
   * Extract client IP address
   */
  private extractClientIp(request: FastifyRequest): string {
    // Try multiple sources for IP address
    let ip = request.ip;

    // Check X-Forwarded-For header (proxy/load balancer)
    if (!ip || ip === "127.0.0.1" || ip === "::1") {
      const forwardedFor = request.headers["x-forwarded-for"];
      if (forwardedFor) {
        ip = forwardedFor.toString().split(",")[0]?.trim();
      }
    }

    // Check X-Real-IP header (nginx proxy)
    if (!ip || ip === "127.0.0.1" || ip === "::1") {
      const realIp = request.headers["x-real-ip"];
      if (realIp) {
        ip = realIp.toString().trim();
      }
    }

    // Clean up IPv6 mapped IPv4 addresses
    if (ip && ip.startsWith("::ffff:")) {
      ip = ip.substring(7);
    }

    return ip || "unknown";
  }

  /**
   * Log security event
   */
  private async logSecurityEvent(
    context: WizardSecurityContext | null,
    operation: WizardOperation,
    resource: string,
    success: boolean,
    details: any = {},
    riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ): Promise<void> {
    if (context) {
      this.securityService.logAuditEntry(
        context,
        operation,
        resource,
        success,
        details,
        riskLevel
      );
    } else {
      // Log system events without user context
      console.log(`🔒 WIZARD SECURITY: SYSTEM ${success ? 'SUCCESS' : 'FAILED'} ${operation} on ${resource} [${riskLevel.toUpperCase()}]`, details);
    }
  }
}

/**
 * Helper function to create wizard security middleware
 */
export function createWizardSecurityMiddleware(
  securityService: WizardSecurityService,
  sessionManager: SessionManager,
  options: WizardSecurityMiddlewareOptions
) {
  const middleware = new WizardSecurityMiddleware(securityService, sessionManager);
  return middleware.createMiddleware(options);
}

/**
 * Helper function to create emergency stop middleware
 */
export function createEmergencyStopMiddleware(
  securityService: WizardSecurityService,
  sessionManager: SessionManager
) {
  const middleware = new WizardSecurityMiddleware(securityService, sessionManager);
  return [
    middleware.createMiddleware({
      operation: WizardOperation.FINALIZE_WIZARD, // Using as emergency operation
      requireAuth: true,
      requireCsrf: true,
      validateInput: true,
      auditLevel: 'comprehensive'
    }),
    middleware.createEmergencyStopMiddleware()
  ];
}