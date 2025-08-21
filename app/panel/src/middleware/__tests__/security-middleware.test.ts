import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import { 
  SecurityMiddleware, 
  InputValidator, 
  AuditLogger,
  createValidationMiddleware 
} from '../security-middleware.js';

// Mock Fastify request and reply
const createMockRequest = (overrides: Partial<FastifyRequest> = {}): FastifyRequest => ({
  protocol: 'https',
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'x-forwarded-for': '192.168.1.100'
  },
  ip: '192.168.1.100',
  socket: { remoteAddress: '192.168.1.100' },
  body: {},
  ...overrides
} as FastifyRequest);

const createMockReply = (): FastifyReply => {
  const headers: Record<string, string> = {};
  return {
    header: vi.fn((name: string, value: string) => {
      headers[name] = value;
      return {} as FastifyReply;
    }),
    code: vi.fn(() => ({} as FastifyReply)),
    send: vi.fn(),
    getHeaders: () => headers
  } as unknown as FastifyReply;
};

describe('SecurityMiddleware', () => {
  let securityMiddleware: SecurityMiddleware;
  let mockRequest: FastifyRequest;
  let mockReply: FastifyReply;

  beforeEach(() => {
    securityMiddleware = new SecurityMiddleware();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
  });

  describe('Security Headers', () => {
    it('should apply Content Security Policy header', () => {
      securityMiddleware.applySecurityHeaders(mockRequest, mockReply);
      
      expect(mockReply.header).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("default-src 'self'")
      );
      expect(mockReply.header).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("object-src 'none'")
      );
    });

    it('should apply HSTS header for HTTPS requests', () => {
      mockRequest.protocol = 'https';
      securityMiddleware.applySecurityHeaders(mockRequest, mockReply);
      
      expect(mockReply.header).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    });

    it('should not apply HSTS header for HTTP requests', () => {
      mockRequest.protocol = 'http';
      securityMiddleware.applySecurityHeaders(mockRequest, mockReply);
      
      expect(mockReply.header).not.toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.any(String)
      );
    });

    it('should apply X-Frame-Options header', () => {
      securityMiddleware.applySecurityHeaders(mockRequest, mockReply);
      
      expect(mockReply.header).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    });

    it('should apply X-Content-Type-Options header', () => {
      securityMiddleware.applySecurityHeaders(mockRequest, mockReply);
      
      expect(mockReply.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('should apply Referrer-Policy header', () => {
      securityMiddleware.applySecurityHeaders(mockRequest, mockReply);
      
      expect(mockReply.header).toHaveBeenCalledWith(
        'Referrer-Policy', 
        'strict-origin-when-cross-origin'
      );
    });

    it('should apply Permissions-Policy header', () => {
      securityMiddleware.applySecurityHeaders(mockRequest, mockReply);
      
      expect(mockReply.header).toHaveBeenCalledWith(
        'Permissions-Policy',
        expect.stringContaining('camera=()')
      );
    });

    it('should remove server information headers', () => {
      securityMiddleware.applySecurityHeaders(mockRequest, mockReply);
      
      expect(mockReply.header).toHaveBeenCalledWith('X-Powered-By', '');
      expect(mockReply.header).toHaveBeenCalledWith('Server', '');
    });

    it('should apply cache control headers', () => {
      securityMiddleware.applySecurityHeaders(mockRequest, mockReply);
      
      expect(mockReply.header).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private'
      );
    });
  });

  describe('Configuration', () => {
    it('should allow custom configuration', () => {
      const customConfig = {
        xFrameOptions: 'SAMEORIGIN',
        referrerPolicy: 'no-referrer'
      };
      
      const customMiddleware = new SecurityMiddleware(customConfig);
      customMiddleware.applySecurityHeaders(mockRequest, mockReply);
      
      expect(mockReply.header).toHaveBeenCalledWith('X-Frame-Options', 'SAMEORIGIN');
      expect(mockReply.header).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
    });

    it('should update configuration', () => {
      securityMiddleware.updateConfig({
        xFrameOptions: 'SAMEORIGIN'
      });
      
      const config = securityMiddleware.getConfig();
      expect(config.xFrameOptions).toBe('SAMEORIGIN');
    });
  });

  describe('Fastify Hook', () => {
    it('should create security hook', async () => {
      const hook = securityMiddleware.createSecurityHook();
      
      await hook(mockRequest, mockReply);
      
      expect(mockReply.header).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.any(String)
      );
    });
  });
});

describe('InputValidator', () => {
  describe('HTML Sanitization', () => {
    it('should sanitize HTML entities', () => {
      const input = '<script>alert("xss")</script>';
      const sanitized = InputValidator.sanitizeHtml(input);
      
      expect(sanitized).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('should handle non-string input', () => {
      const sanitized = InputValidator.sanitizeHtml(null as any);
      expect(sanitized).toBe('');
    });
  });

  describe('Username Validation', () => {
    it('should validate correct username', () => {
      const result = InputValidator.validateUsername('admin123');
      
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('admin123');
      expect(result.error).toBeUndefined();
    });

    it('should reject short username', () => {
      const result = InputValidator.validateUsername('ab');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 3 characters');
    });

    it('should reject long username', () => {
      const result = InputValidator.validateUsername('a'.repeat(51));
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('less than 50 characters');
    });

    it('should reject invalid characters', () => {
      const result = InputValidator.validateUsername('admin@123');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('letters, numbers, underscores, and hyphens');
    });

    it('should handle non-string input', () => {
      const result = InputValidator.validateUsername(123 as any);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });
  });

  describe('Password Validation', () => {
    it('should validate strong password', () => {
      const result = InputValidator.validatePassword('StrongPass123!');
      
      expect(result.valid).toBe(true);
      expect(result.strength).toBe('strong');
      expect(result.error).toBeUndefined();
    });

    it('should validate medium password', () => {
      const result = InputValidator.validatePassword('GoodPass123');
      
      expect(result.valid).toBe(true);
      expect(result.strength).toBe('medium');
    });

    it('should reject weak password', () => {
      const result = InputValidator.validatePassword('password');
      
      expect(result.valid).toBe(false);
      expect(result.strength).toBe('weak');
      expect(result.error).toContain('at least 3 of');
    });

    it('should reject short password', () => {
      const result = InputValidator.validatePassword('Pass1!');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 8 characters');
    });

    it('should reject very long password', () => {
      const result = InputValidator.validatePassword('a'.repeat(129));
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('less than 128 characters');
    });
  });

  describe('Locker ID Validation', () => {
    it('should validate correct locker ID', () => {
      const result = InputValidator.validateLockerId('15');
      
      expect(result.valid).toBe(true);
      expect(result.value).toBe(15);
    });

    it('should reject non-numeric locker ID', () => {
      const result = InputValidator.validateLockerId('abc');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a number');
    });

    it('should reject out-of-range locker ID', () => {
      const result = InputValidator.validateLockerId('150');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('between 1 and 100');
    });
  });

  describe('Kiosk ID Validation', () => {
    it('should validate correct kiosk ID', () => {
      const result = InputValidator.validateKioskId('kiosk-01');
      
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('kiosk-01');
    });

    it('should reject empty kiosk ID', () => {
      const result = InputValidator.validateKioskId('   ');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject invalid characters', () => {
      const result = InputValidator.validateKioskId('kiosk@01');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('letters, numbers, underscores, and hyphens');
    });
  });

  describe('RFID Card Validation', () => {
    it('should validate correct RFID card', () => {
      const result = InputValidator.validateRfidCard('AB:CD:EF:12:34:56');
      
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('ab:cd:ef:12:34:56');
    });

    it('should reject invalid characters', () => {
      const result = InputValidator.validateRfidCard('GHIJ1234');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });
  });

  describe('Date Validation', () => {
    it('should validate correct date', () => {
      const date = new Date('2024-12-01');
      const result = InputValidator.validateDate(date);
      
      expect(result.valid).toBe(true);
      expect(result.date).toEqual(date);
    });

    it('should validate date string', () => {
      const result = InputValidator.validateDate('2024-12-01');
      
      expect(result.valid).toBe(true);
      expect(result.date).toBeInstanceOf(Date);
    });

    it('should reject invalid date', () => {
      const result = InputValidator.validateDate('invalid-date');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid date');
    });

    it('should reject date too far in future', () => {
      const result = InputValidator.validateDate('2050-01-01');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reasonable range');
    });
  });

  describe('Reason Validation', () => {
    it('should validate and sanitize reason', () => {
      const result = InputValidator.validateReason('User assistance <script>');
      
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('User assistance &lt;script&gt;');
    });

    it('should reject empty reason', () => {
      const result = InputValidator.validateReason('   ');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject very long reason', () => {
      const result = InputValidator.validateReason('a'.repeat(501));
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('less than 500 characters');
    });
  });

  describe('Pagination Validation', () => {
    it('should validate correct pagination', () => {
      const result = InputValidator.validatePagination('2', '25');
      
      expect(result.valid).toBe(true);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(25);
    });

    it('should use defaults for invalid input', () => {
      const result = InputValidator.validatePagination('invalid', 'invalid');
      
      expect(result.valid).toBe(true);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should reject page too high', () => {
      const result = InputValidator.validatePagination('1001', '20');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('less than 1000');
    });

    it('should reject limit too high', () => {
      const result = InputValidator.validatePagination('1', '101');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('less than 100');
    });
  });
});

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;
  let mockEventRepository: any;
  let mockRequest: FastifyRequest;

  beforeEach(() => {
    mockEventRepository = {
      createEvent: vi.fn().mockResolvedValue({ id: 1 })
    };
    
    auditLogger = new AuditLogger(mockEventRepository);
    
    mockRequest = createMockRequest({
      user: { id: 1, username: 'admin' },
      session: { session_id: 'session123' }
    } as any);
  });

  it('should log staff operation', async () => {
    await auditLogger.logStaffOperation(
      mockRequest,
      'open_locker',
      'locker',
      '15',
      { reason: 'user assistance' }
    );

    expect(mockEventRepository.createEvent).toHaveBeenCalledWith({
      kiosk_id: 'panel',
      event_type: 'staff_audit',
      staff_user: 'admin',
      details: {
        audit_log: expect.objectContaining({
          action: 'open_locker',
          resource_type: 'locker',
          resource_id: '15',
          username: 'admin',
          details: { reason: 'user assistance' }
        })
      }
    });
  });

  it('should handle missing user context gracefully', async () => {
    const requestWithoutUser = createMockRequest();
    
    await auditLogger.logStaffOperation(
      requestWithoutUser,
      'open_locker',
      'locker'
    );

    expect(mockEventRepository.createEvent).not.toHaveBeenCalled();
  });

  it('should handle repository errors gracefully', async () => {
    mockEventRepository.createEvent.mockRejectedValue(new Error('DB error'));
    
    // Should not throw
    await expect(auditLogger.logStaffOperation(
      mockRequest,
      'open_locker',
      'locker'
    )).resolves.toBeUndefined();
  });
});

describe('Validation Middleware', () => {
  let validationMiddleware: any;
  let mockRequest: FastifyRequest;
  let mockReply: FastifyReply;

  beforeEach(() => {
    validationMiddleware = createValidationMiddleware();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
  });

  it('should validate required fields', async () => {
    mockRequest.body = { username: '' };
    
    const validator = validationMiddleware.validateBody({
      username: { required: true, type: 'string' },
      password: { required: true, type: 'string' }
    });

    await validator(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(400);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      error: 'Validation failed',
      details: expect.arrayContaining([
        'username is required',
        'password is required'
      ])
    });
  });

  it('should validate field types', async () => {
    mockRequest.body = { 
      username: 123,
      age: 'not-a-number'
    };
    
    const validator = validationMiddleware.validateBody({
      username: { required: true, type: 'string' },
      age: { required: true, type: 'number' }
    });

    await validator(mockRequest, mockReply);

    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      error: 'Validation failed',
      details: expect.arrayContaining([
        'username must be a string',
        'age must be a number'
      ])
    });
  });

  it('should validate string length', async () => {
    mockRequest.body = { 
      username: 'ab',
      description: 'a'.repeat(101)
    };
    
    const validator = validationMiddleware.validateBody({
      username: { required: true, type: 'string', minLength: 3 },
      description: { required: true, type: 'string', maxLength: 100 }
    });

    await validator(mockRequest, mockReply);

    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      error: 'Validation failed',
      details: expect.arrayContaining([
        'username must be at least 3 characters',
        'description must be less than 100 characters'
      ])
    });
  });

  it('should validate patterns', async () => {
    mockRequest.body = { 
      email: 'invalid-email'
    };
    
    const validator = validationMiddleware.validateBody({
      email: { 
        required: true, 
        type: 'string', 
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ 
      }
    });

    await validator(mockRequest, mockReply);

    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      error: 'Validation failed',
      details: ['email format is invalid']
    });
  });

  it('should pass valid input', async () => {
    mockRequest.body = { 
      username: 'admin',
      password: 'password123'
    };
    
    const validator = validationMiddleware.validateBody({
      username: { required: true, type: 'string', minLength: 3 },
      password: { required: true, type: 'string', minLength: 8 }
    });

    await validator(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });
});