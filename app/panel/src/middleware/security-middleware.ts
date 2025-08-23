import { FastifyRequest, FastifyReply } from 'fastify';

export interface SecurityConfig {
  csp: {
    defaultSrc: string[];
    scriptSrc: string[];
    styleSrc: string[];
    imgSrc: string[];
    connectSrc: string[];
    fontSrc: string[];
    objectSrc: string[];
    mediaSrc: string[];
    frameSrc: string[];
  };
  hsts: {
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
  };
  referrerPolicy: string;
  xFrameOptions: string;
  xContentTypeOptions: boolean;
  xXssProtection: boolean;
  permissionsPolicy: Record<string, string[]>;
}

const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  csp: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for dynamic content
    styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles
    imgSrc: ["'self'", "data:", "blob:"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"]
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: 'strict-origin-when-cross-origin',
  xFrameOptions: 'DENY',
  xContentTypeOptions: true,
  xXssProtection: true,
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    payment: [],
    usb: [],
    magnetometer: [],
    accelerometer: [],
    gyroscope: []
  }
};

export class SecurityMiddleware {
  private config: SecurityConfig;

  constructor(config?: Partial<SecurityConfig>) {
    this.config = { ...DEFAULT_SECURITY_CONFIG, ...config };
  }

  /**
   * Apply security headers to response
   */
  applySecurityHeaders(request: FastifyRequest, reply: FastifyReply): void {
    // Content Security Policy
    const cspDirectives = Object.entries(this.config.csp)
      .map(([directive, sources]) => {
        const directiveName = this.camelToKebab(directive);
        return `${directiveName} ${sources.join(' ')}`;
      })
      .join('; ');
    
    reply.header('Content-Security-Policy', cspDirectives);

    // HTTP Strict Transport Security (HSTS)
    if (request.protocol === 'https') {
      let hstsValue = `max-age=${this.config.hsts.maxAge}`;
      if (this.config.hsts.includeSubDomains) {
        hstsValue += '; includeSubDomains';
      }
      if (this.config.hsts.preload) {
        hstsValue += '; preload';
      }
      reply.header('Strict-Transport-Security', hstsValue);
    }

    // Referrer Policy
    reply.header('Referrer-Policy', this.config.referrerPolicy);

    // X-Frame-Options
    reply.header('X-Frame-Options', this.config.xFrameOptions);

    // X-Content-Type-Options
    if (this.config.xContentTypeOptions) {
      reply.header('X-Content-Type-Options', 'nosniff');
    }

    // X-XSS-Protection (legacy, but still useful for older browsers)
    if (this.config.xXssProtection) {
      reply.header('X-XSS-Protection', '1; mode=block');
    }

    // Permissions Policy
    const permissionsPolicyDirectives = Object.entries(this.config.permissionsPolicy)
      .map(([feature, allowlist]) => {
        if (allowlist.length === 0) {
          return `${feature}=()`;
        }
        return `${feature}=(${allowlist.map(origin => `"${origin}"`).join(' ')})`;
      })
      .join(', ');
    
    if (permissionsPolicyDirectives) {
      reply.header('Permissions-Policy', permissionsPolicyDirectives);
    }

    // Additional security headers
    reply.header('X-Powered-By', ''); // Remove server information
    reply.header('Server', ''); // Remove server information
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
  }

  /**
   * Create Fastify hook for applying security headers
   */
  createSecurityHook() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      this.applySecurityHeaders(request, reply);
    };
  }

  /**
   * Update security configuration
   */
  updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current security configuration
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  /**
   * Convert camelCase to kebab-case for CSP directives
   */
  private camelToKebab(str: string): string {
    return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
  }
}

/**
 * Input validation and sanitization utilities
 */
export class InputValidator {
  /**
   * Sanitize HTML input to prevent XSS
   */
  static sanitizeHtml(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Validate and sanitize username
   */
  static validateUsername(username: string): { valid: boolean; sanitized: string; error?: string } {
    if (typeof username !== 'string') {
      return { valid: false, sanitized: '', error: 'Username must be a string' };
    }

    const sanitized = username.trim();
    
    if (sanitized.length < 3) {
      return { valid: false, sanitized, error: 'Username must be at least 3 characters' };
    }

    if (sanitized.length > 50) {
      return { valid: false, sanitized, error: 'Username must be less than 50 characters' };
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
      return { valid: false, sanitized, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
    }

    return { valid: true, sanitized };
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): { valid: boolean; error?: string; strength: 'weak' | 'medium' | 'strong' } {
    if (typeof password !== 'string') {
      return { valid: false, error: 'Password must be a string', strength: 'weak' };
    }

    if (password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters', strength: 'weak' };
    }

    if (password.length > 128) {
      return { valid: false, error: 'Password must be less than 128 characters', strength: 'weak' };
    }

    let strength: 'weak' | 'medium' | 'strong' = 'weak';
    let score = 0;

    // Check for different character types
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    // Check length bonus
    if (password.length >= 12) score++;

    if (score >= 3) strength = 'medium';
    if (score >= 4) strength = 'strong';

    const valid = score >= 3; // Require at least medium strength

    return {
      valid,
      error: valid ? undefined : 'Password must contain at least 3 of: lowercase, uppercase, numbers, special characters',
      strength
    };
  }

  /**
   * Validate locker ID
   */
  static validateLockerId(lockerId: any): { valid: boolean; value: number; error?: string } {
    const num = parseInt(lockerId, 10);
    
    if (isNaN(num)) {
      return { valid: false, value: 0, error: 'Locker ID must be a number' };
    }

    if (num < 1 || num > 100) {
      return { valid: false, value: num, error: 'Locker ID must be between 1 and 100' };
    }

    return { valid: true, value: num };
  }

  /**
   * Validate kiosk ID
   */
  static validateKioskId(kioskId: string): { valid: boolean; sanitized: string; error?: string } {
    if (typeof kioskId !== 'string') {
      return { valid: false, sanitized: '', error: 'Kiosk ID must be a string' };
    }

    const sanitized = kioskId.trim();
    
    if (sanitized.length === 0) {
      return { valid: false, sanitized, error: 'Kiosk ID cannot be empty' };
    }

    if (sanitized.length > 50) {
      return { valid: false, sanitized, error: 'Kiosk ID must be less than 50 characters' };
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
      return { valid: false, sanitized, error: 'Kiosk ID can only contain letters, numbers, underscores, and hyphens' };
    }

    return { valid: true, sanitized };
  }

  /**
   * Validate RFID card ID
   */
  static validateRfidCard(cardId: string): { valid: boolean; sanitized: string; error?: string } {
    if (typeof cardId !== 'string') {
      return { valid: false, sanitized: '', error: 'RFID card ID must be a string' };
    }

    const sanitized = cardId.trim().toLowerCase();
    
    if (sanitized.length === 0) {
      return { valid: false, sanitized, error: 'RFID card ID cannot be empty' };
    }

    if (sanitized.length > 100) {
      return { valid: false, sanitized, error: 'RFID card ID must be less than 100 characters' };
    }

    // Allow hexadecimal characters and some common separators
    if (!/^[a-f0-9:-]+$/.test(sanitized)) {
      return { valid: false, sanitized, error: 'RFID card ID contains invalid characters' };
    }

    return { valid: true, sanitized };
  }

  /**
   * Validate date input
   */
  static validateDate(dateInput: any): { valid: boolean; date: Date | null; error?: string } {
    if (!dateInput) {
      return { valid: false, date: null, error: 'Date is required' };
    }

    let date: Date;
    
    if (dateInput instanceof Date) {
      date = dateInput;
    } else if (typeof dateInput === 'string') {
      date = new Date(dateInput);
    } else {
      return { valid: false, date: null, error: 'Invalid date format' };
    }

    if (isNaN(date.getTime())) {
      return { valid: false, date: null, error: 'Invalid date' };
    }

    // Check if date is reasonable (not too far in past or future)
    const now = new Date();
    const minDate = new Date(now.getFullYear() - 10, 0, 1);
    const maxDate = new Date(now.getFullYear() + 10, 11, 31);

    if (date < minDate || date > maxDate) {
      return { valid: false, date, error: 'Date must be within reasonable range' };
    }

    return { valid: true, date };
  }

  /**
   * Validate and sanitize reason text
   */
  static validateReason(reason: string): { valid: boolean; sanitized: string; error?: string } {
    if (typeof reason !== 'string') {
      return { valid: false, sanitized: '', error: 'Reason must be a string' };
    }

    const sanitized = this.sanitizeHtml(reason.trim());
    
    if (sanitized.length === 0) {
      return { valid: false, sanitized, error: 'Reason cannot be empty' };
    }

    if (sanitized.length > 500) {
      return { valid: false, sanitized, error: 'Reason must be less than 500 characters' };
    }

    return { valid: true, sanitized };
  }

  /**
   * Validate pagination parameters
   */
  static validatePagination(page: any, limit: any): { 
    valid: boolean; 
    page: number; 
    limit: number; 
    error?: string 
  } {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;

    if (pageNum < 1) {
      return { valid: false, page: 1, limit: limitNum, error: 'Page must be at least 1' };
    }

    if (pageNum > 1000) {
      return { valid: false, page: pageNum, limit: limitNum, error: 'Page must be less than 1000' };
    }

    if (limitNum < 1) {
      return { valid: false, page: pageNum, limit: 20, error: 'Limit must be at least 1' };
    }

    if (limitNum > 100) {
      return { valid: false, page: pageNum, limit: 100, error: 'Limit must be less than 100' };
    }

    return { valid: true, page: pageNum, limit: limitNum };
  }
}

/**
 * Audit logging for staff operations
 */
export interface AuditLogEntry {
  timestamp: Date;
  user_id: number;
  username: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details: Record<string, any>;
  ip_address: string;
  user_agent: string;
  session_id: string;
}

export class AuditLogger {
  private eventRepository: any; // EventRepository

  constructor(eventRepository: any) {
    this.eventRepository = eventRepository;
  }

  /**
   * Log staff operation with full audit details
   */
  async logStaffOperation(
    request: FastifyRequest,
    action: string,
    resourceType: string,
    resourceId?: string,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      const user = (request as any).user;
      const session = (request as any).session;

      if (!user || !session) {
        console.warn('Attempted to log staff operation without user/session context');
        return;
      }

      const auditEntry: AuditLogEntry = {
        timestamp: new Date(),
        user_id: user.id,
        username: user.username,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details: details || {},
        ip_address: this.getClientIp(request),
        user_agent: request.headers['user-agent'] || 'unknown',
        session_id: session.session_id
      };

      // Log to events table
      await this.eventRepository.createEvent({
        kiosk_id: 'panel',
        event_type: 'staff_audit',
        staff_user: user.username,
        details: {
          audit_log: auditEntry
        }
      });

      // Also log to console for immediate visibility
      console.log(`AUDIT: ${user.username} performed ${action} on ${resourceType}${resourceId ? ` (${resourceId})` : ''}`);

    } catch (error) {
      console.error('Failed to log staff operation:', error);
      // Don't throw - audit logging failure shouldn't break the operation
    }
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(request: FastifyRequest): string {
    const forwarded = request.headers['x-forwarded-for'] as string;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    const realIp = request.headers['x-real-ip'] as string;
    if (realIp) {
      return realIp;
    }
    
    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}

/**
 * Create validation middleware for Fastify routes
 */
export function createValidationMiddleware() {
  return {
    /**
     * Validate request body against schema
     */
    validateBody: (schema: Record<string, any>) => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as any;
        const errors: string[] = [];

        for (const [field, rules] of Object.entries(schema)) {
          const value = body[field];
          
          if (rules.required && (value === undefined || value === null || value === '')) {
            errors.push(`${field} is required`);
            continue;
          }

          if (value !== undefined && value !== null && value !== '') {
            if (rules.type === 'string' && typeof value !== 'string') {
              errors.push(`${field} must be a string`);
            } else if (rules.type === 'number' && typeof value !== 'number') {
              errors.push(`${field} must be a number`);
            } else if (rules.type === 'boolean' && typeof value !== 'boolean') {
              errors.push(`${field} must be a boolean`);
            }

            if (rules.minLength && value.length < rules.minLength) {
              errors.push(`${field} must be at least ${rules.minLength} characters`);
            }

            if (rules.maxLength && value.length > rules.maxLength) {
              errors.push(`${field} must be less than ${rules.maxLength} characters`);
            }

            if (rules.pattern && !rules.pattern.test(value)) {
              errors.push(`${field} format is invalid`);
            }
          }
        }

        if (errors.length > 0) {
          reply.code(400).send({
            success: false,
            error: 'Validation failed',
            details: errors
          });
          return;
        }
      };
    }
  };
}
