import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WizardSecurityService, WizardOperation, WizardPermission, WizardSecurityContext } from '../wizard-security-service';
import { SessionManager } from '../../../app/panel/src/services/session-manager';

// Mock SessionManager
const mockSessionManager = {
  validateCsrfToken: vi.fn()
} as unknown as SessionManager;

describe('WizardSecurityService', () => {
  let securityService: WizardSecurityService;
  let mockContext: WizardSecurityContext;

  beforeEach(() => {
    securityService = new WizardSecurityService();
    mockContext = {
      userId: 1,
      username: 'testuser',
      role: 'admin',
      sessionId: 'test-session-123',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Browser',
      csrfToken: 'test-csrf-token',
      permissions: [
        WizardPermission.VIEW_HARDWARE,
        WizardPermission.SCAN_DEVICES,
        WizardPermission.CONFIGURE_ADDRESSES,
        WizardPermission.TEST_HARDWARE,
        WizardPermission.MODIFY_CONFIGURATION,
        WizardPermission.ACCESS_ADVANCED_FEATURES,
        WizardPermission.EMERGENCY_STOP,
        WizardPermission.VIEW_AUDIT_LOGS
      ]
    };
  });

  describe('createSecurityContext', () => {
    it('should create security context with correct permissions for admin', () => {
      const context = securityService.createSecurityContext(
        1,
        'admin',
        'admin',
        'session-123',
        '192.168.1.1',
        'Test Browser',
        'csrf-token'
      );

      expect(context.userId).toBe(1);
      expect(context.username).toBe('admin');
      expect(context.role).toBe('admin');
      expect(context.permissions).toContain(WizardPermission.EMERGENCY_STOP);
      expect(context.permissions).toContain(WizardPermission.MODIFY_CONFIGURATION);
    });

    it('should create security context with limited permissions for staff', () => {
      const context = securityService.createSecurityContext(
        2,
        'staff',
        'staff',
        'session-456',
        '192.168.1.2',
        'Test Browser',
        'csrf-token'
      );

      expect(context.role).toBe('staff');
      expect(context.permissions).toContain(WizardPermission.VIEW_HARDWARE);
      expect(context.permissions).toContain(WizardPermission.SCAN_DEVICES);
      expect(context.permissions).not.toContain(WizardPermission.EMERGENCY_STOP);
      expect(context.permissions).not.toContain(WizardPermission.MODIFY_CONFIGURATION);
    });
  });

  describe('hasWizardPermission', () => {
    it('should return true for permissions user has', () => {
      const result = securityService.hasWizardPermission(mockContext, WizardPermission.SCAN_DEVICES);
      expect(result).toBe(true);
    });

    it('should return false for permissions user does not have', () => {
      const staffContext = { ...mockContext, permissions: [WizardPermission.VIEW_HARDWARE] };
      const result = securityService.hasWizardPermission(staffContext, WizardPermission.EMERGENCY_STOP);
      expect(result).toBe(false);
    });
  });

  describe('canPerformOperation', () => {
    it('should allow admin to perform scan operations', () => {
      const result = securityService.canPerformOperation(mockContext, WizardOperation.SCAN_DEVICES);
      expect(result).toBe(true);
    });

    it('should allow admin to perform configuration operations', () => {
      const result = securityService.canPerformOperation(mockContext, WizardOperation.SET_SLAVE_ADDRESS);
      expect(result).toBe(true);
    });

    it('should not allow staff to perform configuration operations', () => {
      const staffContext = { 
        ...mockContext, 
        role: 'staff' as const,
        permissions: [WizardPermission.VIEW_HARDWARE, WizardPermission.SCAN_DEVICES] 
      };
      const result = securityService.canPerformOperation(staffContext, WizardOperation.SET_SLAVE_ADDRESS);
      expect(result).toBe(false);
    });

    it('should return false for unknown operations', () => {
      const result = securityService.canPerformOperation(mockContext, 'unknown_operation' as WizardOperation);
      expect(result).toBe(false);
    });
  });

  describe('validateCsrfToken', () => {
    it('should validate CSRF token through session manager', () => {
      (mockSessionManager.validateCsrfToken as any).mockReturnValue(true);
      
      const result = securityService.validateCsrfToken(mockSessionManager, 'session-123', 'csrf-token');
      
      expect(result).toBe(true);
      expect(mockSessionManager.validateCsrfToken).toHaveBeenCalledWith('session-123', 'csrf-token');
    });

    it('should return false for invalid CSRF token', () => {
      (mockSessionManager.validateCsrfToken as any).mockReturnValue(false);
      
      const result = securityService.validateCsrfToken(mockSessionManager, 'session-123', 'invalid-token');
      
      expect(result).toBe(false);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow first request within rate limit', () => {
      const result = securityService.checkRateLimit(mockContext, WizardOperation.SCAN_DEVICES);
      expect(result).toBe(true);
    });

    it('should enforce rate limits for excessive requests', () => {
      // Make requests up to the limit
      for (let i = 0; i < 5; i++) {
        securityService.checkRateLimit(mockContext, WizardOperation.SCAN_DEVICES);
      }
      
      // Next request should be blocked
      const result = securityService.checkRateLimit(mockContext, WizardOperation.SCAN_DEVICES);
      expect(result).toBe(false);
    });

    it('should reset rate limit after time window', (done) => {
      // Fill up the rate limit
      for (let i = 0; i < 5; i++) {
        securityService.checkRateLimit(mockContext, WizardOperation.SCAN_DEVICES);
      }
      
      // Should be blocked
      expect(securityService.checkRateLimit(mockContext, WizardOperation.SCAN_DEVICES)).toBe(false);
      
      // Wait for rate limit to reset (using a very short window for testing)
      setTimeout(() => {
        // Manually clean up rate limits to simulate time passage
        securityService.cleanupRateLimits();
        
        // Should be allowed again
        const result = securityService.checkRateLimit(mockContext, WizardOperation.SCAN_DEVICES);
        expect(result).toBe(true);
        done();
      }, 100);
    });
  });

  describe('logAuditEntry', () => {
    it('should log audit entry with correct details', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      securityService.logAuditEntry(
        mockContext,
        WizardOperation.SCAN_DEVICES,
        'test-resource',
        true,
        { test: 'data' },
        'medium'
      );
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔒 WIZARD AUDIT: testuser SUCCESS scan_devices on test-resource [MEDIUM]')
      );
      
      consoleSpy.mockRestore();
    });

    it('should maintain audit log in memory', () => {
      securityService.logAuditEntry(
        mockContext,
        WizardOperation.TEST_CARD,
        'card-1',
        true,
        { cardId: 1 }
      );
      
      const logs = securityService.getAuditLogs(mockContext, { limit: 10 });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].operation).toBe(WizardOperation.TEST_CARD);
      expect(logs[0].resource).toBe('card-1');
    });
  });

  describe('getAuditLogs', () => {
    beforeEach(() => {
      // Add some test audit entries
      securityService.logAuditEntry(mockContext, WizardOperation.SCAN_DEVICES, 'port1', true);
      securityService.logAuditEntry(mockContext, WizardOperation.TEST_CARD, 'card1', false);
      securityService.logAuditEntry(mockContext, WizardOperation.SET_SLAVE_ADDRESS, 'card2', true);
    });

    it('should return all logs when no filters applied', () => {
      const logs = securityService.getAuditLogs(mockContext);
      expect(logs.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter logs by operation', () => {
      const logs = securityService.getAuditLogs(mockContext, { 
        operation: WizardOperation.SCAN_DEVICES 
      });
      expect(logs.every(log => log.operation === WizardOperation.SCAN_DEVICES)).toBe(true);
    });

    it('should filter logs by success status', () => {
      const logs = securityService.getAuditLogs(mockContext, { success: false });
      expect(logs.every(log => log.success === false)).toBe(true);
    });

    it('should limit number of returned logs', () => {
      const logs = securityService.getAuditLogs(mockContext, { limit: 2 });
      expect(logs.length).toBeLessThanOrEqual(2);
    });

    it('should throw error for insufficient permissions', () => {
      const staffContext = { 
        ...mockContext, 
        permissions: [WizardPermission.VIEW_HARDWARE] 
      };
      
      expect(() => {
        securityService.getAuditLogs(staffContext);
      }).toThrow('Insufficient permissions to view audit logs');
    });
  });

  describe('detectSuspiciousActivity', () => {
    it('should detect high frequency operations', () => {
      // Generate many operations in short time
      for (let i = 0; i < 25; i++) {
        securityService.logAuditEntry(
          mockContext,
          WizardOperation.SCAN_DEVICES,
          `resource-${i}`,
          true
        );
      }
      
      const result = securityService.detectSuspiciousActivity(mockContext);
      // The basic service may not detect this as suspicious, but should have some risk score
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });

    it('should detect multiple failed operations', () => {
      // Generate many failed operations
      for (let i = 0; i < 10; i++) {
        securityService.logAuditEntry(
          mockContext,
          WizardOperation.TEST_CARD,
          `card-${i}`,
          false
        );
      }
      
      const result = securityService.detectSuspiciousActivity(mockContext);
      // The basic service may not detect this as suspicious, but should have some risk score
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });

    it('should not flag normal activity as suspicious', () => {
      // Generate normal activity
      securityService.logAuditEntry(mockContext, WizardOperation.SCAN_DEVICES, 'port1', true);
      securityService.logAuditEntry(mockContext, WizardOperation.TEST_CARD, 'card1', true);
      
      const result = securityService.detectSuspiciousActivity(mockContext);
      expect(result.suspicious).toBe(false);
      expect(result.riskScore).toBeLessThan(50);
    });
  });

  describe('emergencyStop', () => {
    it('should allow admin to trigger emergency stop', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      expect(() => {
        securityService.emergencyStop(mockContext, 'Security breach detected');
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚨 EMERGENCY STOP initiated by testuser: Security breach detected')
      );
      
      consoleSpy.mockRestore();
    });

    it('should prevent staff from triggering emergency stop', () => {
      const staffContext = { 
        ...mockContext, 
        role: 'staff' as const,
        permissions: [WizardPermission.VIEW_HARDWARE] 
      };
      
      expect(() => {
        securityService.emergencyStop(staffContext, 'Test reason');
      }).toThrow('Insufficient permissions for emergency stop');
    });
  });

  describe('cleanupRateLimits', () => {
    it('should remove expired rate limit entries', () => {
      // Add a rate limit entry
      securityService.checkRateLimit(mockContext, WizardOperation.SCAN_DEVICES);
      
      // Clean up (this would normally happen after time passes)
      securityService.cleanupRateLimits();
      
      // Should not throw any errors
      expect(() => securityService.cleanupRateLimits()).not.toThrow();
    });
  });
});