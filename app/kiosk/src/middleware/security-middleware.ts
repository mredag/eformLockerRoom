import { FastifyRequest, FastifyReply } from 'fastify';

export interface KioskSecurityConfig {
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
  referrerPolicy: string;
  xFrameOptions: string;
  xContentTypeOptions: boolean;
  xXssProtection: boolean;
}

const DEFAULT_KIOSK_SECURITY_CONFIG: KioskSecurityConfig = {
  csp: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"], // Kiosk needs inline scripts for UI
    styleSrc: ["'self'", "'unsafe-inline'"], // Kiosk needs inline styles
    imgSrc: ["'self'", "data:", "blob:"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"]
  },
  referrerPolicy: 'strict-origin-when-cross-origin',
  xFrameOptions: 'DENY',
  xContentTypeOptions: true,
  xXssProtection: true
};

export class KioskSecurityMiddleware {
  private config: KioskSecurityConfig;

  constructor(config?: Partial<KioskSecurityConfig>) {
    this.config = { ...DEFAULT_KIOSK_SECURITY_CONFIG, ...config };
  }

  /**
   * Apply security headers to kiosk responses
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

    // Referrer Policy
    reply.header('Referrer-Policy', this.config.referrerPolicy);

    // X-Frame-Options
    reply.header('X-Frame-Options', this.config.xFrameOptions);

    // X-Content-Type-Options
    if (this.config.xContentTypeOptions) {
      reply.header('X-Content-Type-Options', 'nosniff');
    }

    // X-XSS-Protection
    if (this.config.xXssProtection) {
      reply.header('X-XSS-Protection', '1; mode=block');
    }

    // Remove server information
    reply.header('X-Powered-By', '');
    reply.header('Server', '');

    // Cache control for kiosk interface (allow some caching for performance)
    if (request.url?.includes('/static/') || request.url?.endsWith('.css') || request.url?.endsWith('.js')) {
      reply.header('Cache-Control', 'public, max-age=3600'); // 1 hour for static assets
    } else {
      reply.header('Cache-Control', 'no-cache, must-revalidate');
    }
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
  updateConfig(newConfig: Partial<KioskSecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current security configuration
   */
  getConfig(): KioskSecurityConfig {
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
 * Input validation for kiosk-specific inputs
 */
export class KioskInputValidator {
  /**
   * Validate master PIN input
   */
  static validateMasterPin(pin: string): { valid: boolean; error?: string } {
    if (typeof pin !== 'string') {
      return { valid: false, error: 'PIN must be a string' };
    }

    if (pin.length < 4) {
      return { valid: false, error: 'PIN must be at least 4 digits' };
    }

    if (pin.length > 10) {
      return { valid: false, error: 'PIN must be less than 10 digits' };
    }

    if (!/^\d+$/.test(pin)) {
      return { valid: false, error: 'PIN must contain only digits' };
    }

    return { valid: true };
  }

  /**
   * Validate QR action token
   */
  static validateActionToken(token: string): { valid: boolean; error?: string } {
    if (typeof token !== 'string') {
      return { valid: false, error: 'Token must be a string' };
    }

    if (token.length === 0) {
      return { valid: false, error: 'Token cannot be empty' };
    }

    if (token.length > 1000) {
      return { valid: false, error: 'Token too long' };
    }

    // Basic base64 validation
    try {
      const decoded = Buffer.from(token, 'base64').toString();
      JSON.parse(decoded);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid token format' };
    }
  }

  /**
   * Validate device ID
   */
  static validateDeviceId(deviceId: string): { valid: boolean; error?: string } {
    if (typeof deviceId !== 'string') {
      return { valid: false, error: 'Device ID must be a string' };
    }

    if (deviceId.length !== 32) {
      return { valid: false, error: 'Device ID must be 32 characters' };
    }

    if (!/^[a-f0-9]+$/.test(deviceId)) {
      return { valid: false, error: 'Device ID must be hexadecimal' };
    }

    return { valid: true };
  }

  /**
   * Sanitize user input for display
   */
  static sanitizeForDisplay(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}

/**
 * Rate limiting validation for kiosk requests
 */
export class KioskRateLimitValidator {
  /**
   * Validate IP address format
   */
  static validateIpAddress(ip: string): { valid: boolean; error?: string } {
    if (typeof ip !== 'string') {
      return { valid: false, error: 'IP address must be a string' };
    }

    // IPv4 validation
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (ipv4Regex.test(ip)) {
      return { valid: true };
    }

    // IPv6 validation (basic)
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    if (ipv6Regex.test(ip)) {
      return { valid: true };
    }

    return { valid: false, error: 'Invalid IP address format' };
  }

  /**
   * Check if IP is in allowed range for kiosk access
   */
  static isAllowedIpRange(ip: string): boolean {
    // Allow local network ranges
    if (ip === '127.0.0.1' || ip === 'localhost') {
      return true;
    }

    // Private IP ranges
    if (ip.startsWith('192.168.') || 
        ip.startsWith('10.') || 
        ip.startsWith('172.')) {
      return true;
    }

    // Allow specific public ranges if configured
    // This would be configurable in production
    return false;
  }
}

/**
 * Create validation middleware for kiosk routes
 */
export function createKioskValidationMiddleware() {
  return {
    /**
     * Validate QR request
     */
    validateQrRequest: () => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as any;
        
        if (body.token) {
          const tokenValidation = KioskInputValidator.validateActionToken(body.token);
          if (!tokenValidation.valid) {
            reply.code(400).send({
              success: false,
              action: 'network_required',
              message: tokenValidation.error
            });
            return;
          }
        }

        // Validate IP address
        const clientIp = request.ip || 'unknown';
        const ipValidation = KioskRateLimitValidator.validateIpAddress(clientIp);
        if (!ipValidation.valid) {
          reply.code(400).send({
            success: false,
            action: 'network_required',
            message: 'Invalid client IP'
          });
          return;
        }

        // Check if IP is in allowed range
        if (!KioskRateLimitValidator.isAllowedIpRange(clientIp)) {
          reply.code(403).send({
            success: false,
            action: 'network_required',
            message: 'Access denied from this network'
          });
          return;
        }
      };
    },

    /**
     * Validate master PIN request
     */
    validateMasterPinRequest: () => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as any;
        
        if (body.pin) {
          const pinValidation = KioskInputValidator.validateMasterPin(body.pin);
          if (!pinValidation.valid) {
            reply.code(400).send({
              success: false,
              error: pinValidation.error
            });
            return;
          }
        }
      };
    }
  };
}
