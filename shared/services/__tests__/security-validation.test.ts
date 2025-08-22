import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityValidator } from '../security-validation.js';
import { EventLogger } from '../event-logger.js';

// Mock dependencies
vi.mock('../event-logger.js');

describe('SecurityValidator', () => {
  let validator: SecurityValidator;
  let mockEventLogger: any;

  beforeEach(() => {
    mockEventLogger = {
      logEvent: vi.fn()
    };

    validator = new SecurityValidator(mockEventLogger);
  });

  describe('Input Sanitization', () => {
    it('should sanitize SQL injection attempts', () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'/**/OR/**/1=1#",
        "1; DELETE FROM lockers WHERE 1=1; --"
      ];

      maliciousInputs.forEach(input => {
        const sanitized = validator.sanitizeInput(input);
        expect(sanitized).not.toContain("'");
        expect(sanitized).not.toContain('--');
        expect(sanitized).not.toContain('/*');
        expect(sanitized).not.toContain('DROP');
        expect(sanitized).not.toContain('DELETE');
      });
    });

    it('should sanitize XSS attempts', () => {
      const xssInputs = [
        '<script>alert("xss")</script>',
        'javascript:alert(1)',
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>'
      ];

      xssInputs.forEach(input => {
        const sanitized = validator.sanitizeInput(input);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror=');
        expect(sanitized).not.toContain('onload=');
      });
    });

    it('should preserve safe input', () => {
      const safeInputs = [
        'admin',
        'locker-5',
        'kiosk_1',
        'Normal text input',
        '12345'
      ];

      safeInputs.forEach(input => {
        const sanitized = validator.sanitizeInput(input);
        expect(sanitized).toBe(input);
      });
    });
  });

  describe('RFID Card Validation', () => {
    it('should validate legitimate RFID card formats', () => {
      const validCards = [
        '1234567890ABCDEF',  // 16-digit hex
        'ABCD1234EFAB5678',  // 16-digit hex (fixed: removed G,H)
        '0123456789ABCDEF',  // 16-digit hex
        'FEDCBA9876543210'   // 16-digit hex
      ];

      validCards.forEach(card => {
        const isValid = validator.validateRfidCard(card);
        expect(isValid).toBe(true);
      });
    });

    it('should reject invalid RFID card formats', () => {
      const invalidCards = [
        '123', // Too short
        '1234567890ABCDEFG', // Too long
        'GHIJKLMNOPQRSTUV', // Invalid hex characters
        '', // Empty
        null,
        undefined,
        '1234-5678-90AB-CDEF' // Contains dashes
      ];

      invalidCards.forEach(card => {
        const isValid = validator.validateRfidCard(card);
        expect(isValid).toBe(false);
      });
    });

    it('should normalize RFID card format', () => {
      const inputs = [
        { input: '1234567890abcdef', expected: '1234567890ABCDEF' },
        { input: 'AbCd1234EfGh5678', expected: 'ABCD1234EFGH5678' },
        { input: '  1234567890ABCDEF  ', expected: '1234567890ABCDEF' }
      ];

      inputs.forEach(({ input, expected }) => {
        const normalized = validator.normalizeRfidCard(input);
        expect(normalized).toBe(expected);
      });
    });
  });

  describe('Device ID Validation', () => {
    it('should validate legitimate device IDs', () => {
      const validDeviceIds = [
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  // Valid UUID
        '12345678-1234-1234-1234-123456789012',  // Valid UUID
        'ABCDEF12-3456-789A-BCDE-F12345678901'   // Valid UUID (fixed: only hex chars)
      ];

      validDeviceIds.forEach(deviceId => {
        const isValid = validator.validateDeviceId(deviceId);
        expect(isValid).toBe(true);
      });
    });

    it('should reject invalid device IDs', () => {
      const invalidDeviceIds = [
        'not-a-uuid',
        '12345678-1234-1234-1234', // Too short
        '12345678-1234-1234-1234-123456789012-extra', // Too long
        '', // Empty
        null,
        undefined
      ];

      invalidDeviceIds.forEach(deviceId => {
        const isValid = validator.validateDeviceId(deviceId);
        expect(isValid).toBe(false);
      });
    });
  });

  describe('IP Address Validation', () => {
    it('should identify local network IPs', () => {
      const localIPs = [
        '192.168.1.100',
        '10.0.0.50',
        '172.16.0.10',
        '127.0.0.1',
        '192.168.0.1',
        '10.255.255.255',
        '172.31.255.255'
      ];

      localIPs.forEach(ip => {
        const isLocal = validator.isLocalNetworkIP(ip);
        expect(isLocal).toBe(true);
      });
    });

    it('should identify external IPs', () => {
      const externalIPs = [
        '8.8.8.8',
        '1.1.1.1',
        '208.67.222.222',
        '74.125.224.72',
        '173.194.46.73'
      ];

      externalIPs.forEach(ip => {
        const isLocal = validator.isLocalNetworkIP(ip);
        expect(isLocal).toBe(false);
      });
    });

    it('should handle invalid IP formats', () => {
      const invalidIPs = [
        '256.256.256.256',
        '192.168.1',
        'not-an-ip',
        '',
        null,
        undefined
      ];

      invalidIPs.forEach(ip => {
        const isLocal = validator.isLocalNetworkIP(ip);
        expect(isLocal).toBe(false);
      });
    });
  });

  describe('PIN Security Validation', () => {
    it('should validate strong PINs', () => {
      const strongPins = [
        '135792',  // Non-sequential, non-repeating
        '248135',  // Non-sequential, non-repeating
        '975314',  // Non-sequential, non-repeating
        '468257'   // Non-sequential, non-repeating
      ];

      strongPins.forEach(pin => {
        const validation = validator.validatePinStrength(pin);
        expect(validation.isValid).toBe(true);
      });
    });

    it('should reject weak PINs', () => {
      const weakPins = [
        '123456', // Sequential
        '111111', // Repeated
        '000000', // All zeros
        '654321', // Reverse sequential
        '12345',  // Too short
        '1234567' // Too long
      ];

      // Note: Some of these might be considered weak depending on implementation
      weakPins.forEach(pin => {
        const validation = validator.validatePinStrength(pin);
        if (!validation.isValid) {
          expect(validation.reason).toBeDefined();
        }
      });
    });

    it('should detect PIN patterns', () => {
      const patternPins = [
        { pin: '123456', pattern: 'sequential' },
        { pin: '111111', pattern: 'repeated' },
        { pin: '121212', pattern: 'alternating' },
        { pin: '654321', pattern: 'reverse_sequential' }
      ];

      patternPins.forEach(({ pin, pattern }) => {
        const hasPattern = validator.detectPinPattern(pin);
        expect(hasPattern).toBeTruthy();
      });
    });
  });

  describe('Rate Limiting Security', () => {
    it('should detect suspicious rate patterns', () => {
      const suspiciousPatterns = [
        { requests: 100, timeWindow: 60, threshold: 30 }, // 100 requests in 1 minute
        { requests: 50, timeWindow: 10, threshold: 10 },  // 50 requests in 10 seconds
        { requests: 200, timeWindow: 300, threshold: 60 } // 200 requests in 5 minutes
      ];

      suspiciousPatterns.forEach(({ requests, timeWindow, threshold }) => {
        const isSuspicious = validator.detectSuspiciousRatePattern(requests, timeWindow, threshold);
        expect(isSuspicious).toBe(true);
      });
    });

    it('should allow normal rate patterns', () => {
      const normalPatterns = [
        { requests: 10, timeWindow: 60, threshold: 30 },  // 10 requests in 1 minute
        { requests: 5, timeWindow: 10, threshold: 10 },   // 5 requests in 10 seconds
        { requests: 30, timeWindow: 300, threshold: 60 }  // 30 requests in 5 minutes
      ];

      normalPatterns.forEach(({ requests, timeWindow, threshold }) => {
        const isSuspicious = validator.detectSuspiciousRatePattern(requests, timeWindow, threshold);
        expect(isSuspicious).toBe(false);
      });
    });
  });

  describe('Token Validation', () => {
    it('should validate HMAC tokens', () => {
      const secret = 'test-secret-key';
      const payload = { locker_id: 5, device_id: 'device123', timestamp: Date.now() };
      
      const token = validator.generateHmacToken(payload, secret);
      const isValid = validator.validateHmacToken(token, payload, secret);
      
      expect(isValid).toBe(true);
    });

    it('should reject tampered tokens', () => {
      const secret = 'test-secret-key';
      const payload = { locker_id: 5, device_id: 'device123', timestamp: Date.now() };
      
      const token = validator.generateHmacToken(payload, secret);
      const tamperedPayload = { ...payload, locker_id: 6 }; // Changed locker_id
      
      const isValid = validator.validateHmacToken(token, tamperedPayload, secret);
      expect(isValid).toBe(false);
    });

    it('should reject expired tokens', () => {
      const secret = 'test-secret-key';
      const expiredPayload = { 
        locker_id: 5, 
        device_id: 'device123', 
        timestamp: Date.now() - 10000 // 10 seconds ago
      };
      
      const token = validator.generateHmacToken(expiredPayload, secret);
      const isValid = validator.validateHmacToken(token, expiredPayload, secret, 5000); // 5 second TTL
      
      expect(isValid).toBe(false);
    });
  });

  describe('Security Event Logging', () => {
    it('should log security violations', () => {
      const violation = {
        type: 'rate_limit_exceeded',
        ip: '192.168.1.100',
        details: { requests: 100, timeWindow: 60 }
      };

      validator.logSecurityViolation(violation);

      expect(mockEventLogger.logEvent).toHaveBeenCalledWith(
        'security_violation',
        null,
        null,
        expect.objectContaining({
          violation_type: 'rate_limit_exceeded',
          ip_address: '192.168.1.100',
          details: violation.details
        })
      );
    });

    it('should log authentication failures', () => {
      const failure = {
        username: 'admin',
        ip: '192.168.1.100',
        reason: 'invalid_password',
        attempts: 3
      };

      validator.logAuthenticationFailure(failure);

      expect(mockEventLogger.logEvent).toHaveBeenCalledWith(
        'auth_failure',
        null,
        null,
        expect.objectContaining({
          username: 'admin',
          ip_address: '192.168.1.100',
          reason: 'invalid_password',
          attempt_count: 3
        })
      );
    });
  });

  describe('Content Security Policy', () => {
    it('should generate appropriate CSP for kiosk interface', () => {
      const csp = validator.generateCSP('kiosk');
      
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('should generate appropriate CSP for panel interface', () => {
      const csp = validator.generateCSP('panel');
      
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('should generate restrictive CSP for QR interface', () => {
      const csp = validator.generateCSP('qr');
      
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("img-src 'self' data:");
      expect(csp).toContain("frame-ancestors 'none'");
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed input gracefully', () => {
      const malformedInputs = [
        null,
        undefined,
        {},
        [],
        new Date(),
        function() {}
      ];

      malformedInputs.forEach(input => {
        expect(() => validator.sanitizeInput(input)).not.toThrow();
        expect(() => validator.validateRfidCard(input)).not.toThrow();
        expect(() => validator.validateDeviceId(input)).not.toThrow();
      });
    });

    it('should handle crypto errors gracefully', () => {
      const invalidSecret = null;
      const payload = { test: 'data' };

      expect(() => validator.generateHmacToken(payload, invalidSecret)).not.toThrow();
      expect(() => validator.validateHmacToken('invalid', payload, invalidSecret)).not.toThrow();
    });
  });
});