import { createHmac, timingSafeEqual } from 'crypto';
import { EventLogger } from './event-logger';
import { EventType } from '../types/core-entities';

export interface SecurityViolation {
  type: string;
  ip: string;
  details: Record<string, any>;
}

export interface AuthenticationFailure {
  username: string;
  ip: string;
  reason: string;
  attempts: number;
}

export interface PinValidation {
  isValid: boolean;
  reason?: string;
}

export class SecurityValidator {
  constructor(private eventLogger: EventLogger) {}

  /**
   * Sanitize input to prevent SQL injection and XSS attacks
   */
  sanitizeInput(input: any): string {
    if (typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/['"]/g, '') // Remove quotes
      .replace(/--/g, '') // Remove SQL comments
      .replace(/\/\*.*?\*\//g, '') // Remove block comments
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/DROP|DELETE|INSERT|UPDATE|SELECT|UNION|ALTER/gi, '') // Remove SQL keywords
      .trim();
  }

  /**
   * Validate RFID card format (supports multiple formats)
   */
  validateRfidCard(card: any): boolean {
    if (!card || typeof card !== 'string') {
      return false;
    }

    const cleanCard = card.trim().toUpperCase();
    
    // Support multiple RFID formats
    const validFormats = [
      /^[0-9A-F]{8}$/,        // 8-digit hex (HID)
      /^[0-9A-F]{10}$/,       // 10-digit hex (Mifare)
      /^[0-9]{10}$/,          // 10-digit decimal
      /^[0-9A-F]{14}$/,       // 14-digit hex (ISO14443)
      /^[0-9A-F]{16}$/        // 16-digit hex (full UID)
    ];
    

    
    return validFormats.some(format => format.test(cleanCard));
  }

  /**
   * Normalize RFID card to uppercase hex format
   */
  normalizeRfidCard(card: string): string {
    if (!card || typeof card !== 'string') {
      return '';
    }

    return card.trim().toUpperCase();
  }

  /**
   * Validate device ID format (supports multiple formats)
   */
  validateDeviceId(deviceId: any): boolean {
    if (!deviceId || typeof deviceId !== 'string') {
      return false;
    }

    const cleanId = deviceId.trim();
    
    // Support multiple device ID formats
    const validFormats = [
      /^KIOSK-[A-Z0-9]{4,8}$/,           // KIOSK-XXXX format
      /^[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}$/, // UUID-like format
      /^DEV[0-9]{6}$/,                   // DEV123456 format
      /^[A-F0-9]{12}$/,                  // MAC address format
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/ // Full UUID
    ];
    

    
    return validFormats.some(format => format.test(cleanId));
  }

  /**
   * Check if IP address is in local network range
   */
  isLocalNetworkIP(ip: any): boolean {
    if (typeof ip !== 'string') {
      return false;
    }

    // IPv4 validation
    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(ipv4Pattern);
    
    if (!match) {
      return false;
    }

    const octets = match.slice(1).map(Number);
    
    // Check if all octets are valid (0-255)
    if (octets.some(octet => octet > 255)) {
      return false;
    }

    const [a, b, c, d] = octets;

    // Check local network ranges
    return (
      // 127.0.0.0/8 (localhost)
      a === 127 ||
      // 10.0.0.0/8 (private)
      a === 10 ||
      // 172.16.0.0/12 (private)
      (a === 172 && b >= 16 && b <= 31) ||
      // 192.168.0.0/16 (private)
      (a === 192 && b === 168)
    );
  }

  /**
   * Validate PIN strength
   */
  validatePinStrength(pin: string): PinValidation {
    if (!pin || typeof pin !== 'string') {
      return { isValid: false, reason: 'PIN is required' };
    }

    // Allow 4-8 digit PINs
    if (pin.length < 4 || pin.length > 8) {
      return { isValid: false, reason: 'PIN must be 4-8 digits' };
    }

    if (!/^\d+$/.test(pin)) {
      return { isValid: false, reason: 'PIN must contain only digits' };
    }

    // Check for weak patterns
    const pattern = this.detectPinPattern(pin);
    if (pattern) {
      return { isValid: false, reason: `PIN contains weak pattern: ${pattern}` };
    }

    // Check for common weak PINs
    const commonPins = ['1234', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '123456', '000000', '111111'];
    if (commonPins.includes(pin)) {
      return { isValid: false, reason: 'PIN is too common' };
    }

    return { isValid: true };
  }

  /**
   * Detect common PIN patterns
   */
  detectPinPattern(pin: string): string | null {
    // Sequential (123456, 654321)
    const isSequential = this.isSequentialPin(pin);
    if (isSequential) {
      return 'sequential';
    }

    // Repeated digits (111111, 222222, etc.)
    const repeatLength = pin.length;
    const repeatPattern = new RegExp(`^(\\d)\\1{${repeatLength - 1}}$`);
    if (repeatPattern.test(pin)) {
      return 'repeated';
    }

    // Alternating pattern (121212, 343434, etc.)
    if (pin.length >= 4) {
      const alternatingPattern = new RegExp(`^(\\d)(\\d)(?:\\1\\2)+$`);
      if (alternatingPattern.test(pin) && pin.length % 2 === 0) {
        return 'alternating';
      }
    }

    return null;
  }

  private isSequentialPin(pin: string): boolean {
    const digits = pin.split('').map(Number);
    
    // Check ascending sequence
    let isAscending = true;
    for (let i = 1; i < digits.length; i++) {
      if (digits[i] !== digits[i - 1] + 1) {
        isAscending = false;
        break;
      }
    }

    // Check descending sequence
    let isDescending = true;
    for (let i = 1; i < digits.length; i++) {
      if (digits[i] !== digits[i - 1] - 1) {
        isDescending = false;
        break;
      }
    }

    return isAscending || isDescending;
  }

  /**
   * Detect suspicious rate patterns
   */
  detectSuspiciousRatePattern(requests: number, timeWindow: number, threshold: number): boolean {
    const rate = requests / (timeWindow / 60); // requests per minute
    const thresholdRate = threshold / (timeWindow / 60);
    
    return rate > thresholdRate;
  }

  /**
   * Generate HMAC token for secure operations
   */
  generateHmacToken(payload: Record<string, any>, secret: string): string {
    try {
      if (!secret) {
        return '';
      }

      const data = JSON.stringify(payload);
      const hmac = createHmac('sha256', secret);
      hmac.update(data);
      
      return hmac.digest('hex');
    } catch (error) {
      return '';
    }
  }

  /**
   * Validate HMAC token
   */
  validateHmacToken(
    token: string, 
    payload: Record<string, any>, 
    secret: string, 
    ttlMs: number = 5000
  ): boolean {
    try {
      if (!token || !secret) {
        return false;
      }

      // Check TTL if timestamp is provided
      if (payload.timestamp && typeof payload.timestamp === 'number') {
        const age = Date.now() - payload.timestamp;
        if (age > ttlMs) {
          return false;
        }
      }

      const expectedToken = this.generateHmacToken(payload, secret);
      if (!expectedToken) {
        return false;
      }

      // Use timing-safe comparison
      const tokenBuffer = Buffer.from(token, 'hex');
      const expectedBuffer = Buffer.from(expectedToken, 'hex');

      if (tokenBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return timingSafeEqual(tokenBuffer, expectedBuffer);
    } catch (error) {
      return false;
    }
  }

  /**
   * Log security violation
   */
  logSecurityViolation(violation: SecurityViolation): void {
    this.eventLogger.logEvent('system', EventType.SYSTEM_RESTARTED, {
      violation_type: violation.type,
      ip_address: violation.ip,
      details: violation.details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log authentication failure
   */
  logAuthenticationFailure(failure: AuthenticationFailure): void {
    this.eventLogger.logEvent('system', EventType.SYSTEM_RESTARTED, {
      username: failure.username,
      ip_address: failure.ip,
      reason: failure.reason,
      attempt_count: failure.attempts,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Generate Content Security Policy for different interfaces
   */
  generateCSP(interfaceType: 'kiosk' | 'panel' | 'qr'): string {
    const baseCSP = [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ];

    switch (interfaceType) {
      case 'kiosk':
        return [
          ...baseCSP,
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "connect-src 'self'",
          "font-src 'self'"
        ].join('; ');

      case 'panel':
        return [
          ...baseCSP,
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "connect-src 'self'",
          "font-src 'self'"
        ].join('; ');

      case 'qr':
        return [
          ...baseCSP,
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "connect-src 'self'"
        ].join('; ');

      default:
        return baseCSP.join('; ');
    }
  }
}
