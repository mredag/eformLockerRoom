import { createHmac, timingSafeEqual } from 'crypto';
import { EventLogger } from './event-logger';
import { EventType } from '../types/core-entities';

/**
 * Represents a security violation event.
 */
export interface SecurityViolation {
  type: string;
  ip: string;
  details: Record<string, any>;
}

/**
 * Represents an authentication failure event.
 */
export interface AuthenticationFailure {
  username: string;
  ip: string;
  reason: string;
  attempts: number;
}

/**
 * Represents the result of a PIN validation check.
 */
export interface PinValidation {
  isValid: boolean;
  reason?: string;
}

/**
 * Provides a suite of security-related validation and utility functions.
 * This class is responsible for input sanitization, data format validation,
 * PIN strength checking, HMAC token generation/validation, and security event logging.
 */
export class SecurityValidator {
  /**
   * Creates an instance of SecurityValidator.
   * @param {EventLogger} eventLogger - The logger for recording security-related events.
   */
  constructor(private eventLogger: EventLogger) {}

  /**
   * Sanitizes a string input to mitigate risks of SQL injection and XSS attacks.
   * This is a basic sanitizer and should be used as part of a defense-in-depth strategy.
   * @param {any} input - The input to sanitize.
   * @returns {string} The sanitized string.
   */
  sanitizeInput(input: any): string {
    if (typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/['"]/g, '')
      .replace(/--/g, '')
      .replace(/\/\*.*?\*\//g, '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/DROP|DELETE|INSERT|UPDATE|SELECT|UNION|ALTER/gi, '')
      .trim();
  }

  /**
   * Validates an RFID card ID against a set of common formats.
   * @param {any} card - The card ID to validate.
   * @returns {boolean} True if the card ID format is valid.
   */
  validateRfidCard(card: any): boolean {
    if (!card || typeof card !== 'string') {
      return false;
    }

    const cleanCard = card.trim().toUpperCase();
    
    const validFormats = [
      /^[0-9A-F]{8}$/,
      /^[0-9A-F]{10}$/,
      /^[0-9]{10}$/,
      /^[0-9A-F]{14}$/,
      /^[0-9A-F]{16}$/
    ];
    
    return validFormats.some(format => format.test(cleanCard));
  }

  /**
   * Normalizes an RFID card ID to a consistent uppercase hex format.
   * @param {string} card - The card ID to normalize.
   * @returns {string} The normalized card ID.
   */
  normalizeRfidCard(card: string): string {
    if (!card || typeof card !== 'string') {
      return '';
    }

    return card.trim().toUpperCase();
  }

  /**
   * Validates a device ID against a set of common formats.
   * @param {any} deviceId - The device ID to validate.
   * @returns {boolean} True if the device ID format is valid.
   */
  validateDeviceId(deviceId: any): boolean {
    if (!deviceId || typeof deviceId !== 'string') {
      return false;
    }

    const cleanId = deviceId.trim();
    
    const validFormats = [
      /^KIOSK-[A-Z0-9]{4,8}$/,
      /^[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
      /^DEV[0-9]{6}$/,
      /^[A-F0-9]{12}$/,
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
    ];
    
    return validFormats.some(format => format.test(cleanId));
  }

  /**
   * Checks if a given IPv4 address falls within private network ranges.
   * @param {any} ip - The IP address to check.
   * @returns {boolean} True if the IP is a local network address.
   */
  isLocalNetworkIP(ip: any): boolean {
    if (typeof ip !== 'string') {
      return false;
    }

    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(ipv4Pattern);
    
    if (!match) {
      return false;
    }

    const octets = match.slice(1).map(Number);
    
    if (octets.some(octet => octet > 255)) {
      return false;
    }

    const [a, b] = octets;

    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  /**
   * Validates the strength of a PIN, checking for length, character types, and common weak patterns.
   * @param {string} pin - The PIN to validate.
   * @returns {PinValidation} An object indicating if the PIN is valid and a reason if it is not.
   */
  validatePinStrength(pin: string): PinValidation {
    if (!pin || typeof pin !== 'string') {
      return { isValid: false, reason: 'PIN is required' };
    }

    if (pin.length < 4 || pin.length > 8) {
      return { isValid: false, reason: 'PIN must be 4-8 digits' };
    }

    if (!/^\d+$/.test(pin)) {
      return { isValid: false, reason: 'PIN must contain only digits' };
    }

    const pattern = this.detectPinPattern(pin);
    if (pattern) {
      return { isValid: false, reason: `PIN contains weak pattern: ${pattern}` };
    }

    const commonPins = ['1234', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '123456', '000000', '111111'];
    if (commonPins.includes(pin)) {
      return { isValid: false, reason: 'PIN is too common' };
    }

    return { isValid: true };
  }

  /**
   * Detects common weak patterns in a PIN, such as sequential or repeated digits.
   * @param {string} pin - The PIN to check.
   * @returns {string | null} The name of the detected pattern, or null if no pattern is found.
   */
  detectPinPattern(pin: string): string | null {
    const isSequential = this.isSequentialPin(pin);
    if (isSequential) {
      return 'sequential';
    }

    const repeatLength = pin.length;
    const repeatPattern = new RegExp(`^(\\d)\\1{${repeatLength - 1}}$`);
    if (repeatPattern.test(pin)) {
      return 'repeated';
    }

    if (pin.length >= 4) {
      const alternatingPattern = new RegExp(`^(\\d)(\\d)(?:\\1\\2)+$`);
      if (alternatingPattern.test(pin) && pin.length % 2 === 0) {
        return 'alternating';
      }
    }

    return null;
  }

  /**
   * Checks if a PIN consists of sequential ascending or descending digits.
   * @private
   */
  private isSequentialPin(pin: string): boolean {
    const digits = pin.split('').map(Number);
    
    let isAscending = true;
    for (let i = 1; i < digits.length; i++) {
      if (digits[i] !== digits[i - 1] + 1) {
        isAscending = false;
        break;
      }
    }

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
   * Detects if a given rate of requests exceeds a threshold within a time window.
   * @param {number} requests - The number of requests.
   * @param {number} timeWindow - The time window in seconds.
   * @param {number} threshold - The request threshold for the time window.
   * @returns {boolean} True if the rate is suspicious.
   */
  detectSuspiciousRatePattern(requests: number, timeWindow: number, threshold: number): boolean {
    const rate = requests / (timeWindow / 60);
    const thresholdRate = threshold / (timeWindow / 60);
    
    return rate > thresholdRate;
  }

  /**
   * Generates a secure HMAC token for a given payload.
   * @param {Record<string, any>} payload - The data to include in the token.
   * @param {string} secret - The secret key for signing the token.
   * @returns {string} The generated HMAC token.
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
   * Validates an HMAC token against a payload and secret, checking its integrity and time-to-live (TTL).
   * @param {string} token - The HMAC token to validate.
   * @param {Record<string, any>} payload - The payload the token should correspond to.
   * @param {string} secret - The secret key used for signing.
   * @param {number} [ttlMs=5000] - The time-to-live for the token in milliseconds.
   * @returns {boolean} True if the token is valid and not expired.
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
   * Logs a security violation event.
   * @param {SecurityViolation} violation - The details of the security violation.
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
   * Logs an authentication failure event.
   * @param {AuthenticationFailure} failure - The details of the authentication failure.
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
   * Generates a Content Security Policy (CSP) string for a specific interface.
   * @param {'kiosk' | 'panel' | 'qr'} interfaceType - The type of interface to generate the CSP for.
   * @returns {string} The generated CSP string.
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
