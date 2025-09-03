import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WizardSecurityServiceEnhanced } from '../wizard-security-service-enhanced';
import { WizardOperation, WizardSecurityContext } from '../wizard-security-service';
import { Database } from 'sqlite3';
import fs from 'fs';
import path from 'path';

// Mock database for testing
const createTestDatabase = (): Database => {
  const db = new Database(':memory:');
  
  // Load and execute the migration SQL
  const migrationPath = path.join(__dirname, '../../../migrations/021_wizard_security_audit.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  
  // Execute migration (split by semicolon and filter out empty statements)
  const statements = migrationSQL.split(';').filter(stmt => stmt.trim().length > 0);
  statements.forEach(statement => {
    try {
      db.exec(statement);
    } catch (error) {
      // Ignore pragma and comment statements that might fail
      if (!statement.includes('PRAGMA') && !statement.trim().startsWith('--')) {
        console.warn('Failed to execute statement:', statement, error);
      }
    }
  });
  
  return db;
};

describe('WizardSecurityServiceEnhanced', () => {
  let securityService: WizardSecurityServiceEnhanced;
  let testDb: Database;
  let mockContext: WizardSecurityContext;

  beforeEach(() => {
    testDb = createTestDatabase();
    securityService = new WizardSecurityServiceEnhanced(testDb, {
      enableDatabaseAudit: true,
      enableRealTimeMonitoring: false, // Disable for testing
      enableAnomalyDetection: true,
      suspiciousActivityThreshold: 30,
      emergencyStopThreshold: 70
    });

    mockContext = {
      userId: 1,
      username: 'testuser',
      role: 'admin',
      sessionId: 'test-session-123',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Browser',
      csrfToken: 'test-csrf-token',
      permissions: securityService.getWizardPermissions('admin')
    };
  });

  afterEach((done) => {
    testDb.close(done);
  });

  describe('logAuditEntryEnhanced', () => {
    it('should store audit entry in database', async () => {
      await securityService.logAuditEntryEnhanced(
        mockContext,
        WizardOperation.SCAN_DEVICES,
        'test-resource',
        true,
        { test: 'data' },
        'medium'
      );

      // Verify entry was stored
      const entries = await securityService['securityDb'].getAuditEntries({
        userId: mockContext.userId,
        limit: 1
      });

      expect(entries.length).toBe(1);
      expect(entries[0].operation).toBe(WizardOperation.SCAN_DEVICES);
      expect(entries[0].resource).toBe('test-resource');
      expect(entries[0].success).toBe(true);
      expect(entries[0].risk_level).toBe('medium');
    });

    it('should handle database errors gracefully', async () => {
      // Close database to simulate error
      testDb.close();

      // Should not throw error
      await expect(
        securityService.logAuditEntryEnhanced(
          mockContext,
          WizardOperation.TEST_CARD,
          'test-resource',
          true
        )
      ).resolves.not.toThrow();
    });
  });

  describe('checkRateLimitEnhanced', () => {
    it('should allow operations within rate limit', async () => {
      const allowed = await securityService.checkRateLimitEnhanced(
        mockContext,
        WizardOperation.SCAN_DEVICES
      );

      expect(allowed).toBe(true);
    });

    it('should track rate limits in database', async () => {
      // Make several requests
      for (let i = 0; i < 3; i++) {
        await securityService.checkRateLimitEnhanced(
          mockContext,
          WizardOperation.SCAN_DEVICES
        );
      }

      // Check that rate limit was tracked
      const rateLimitResult = await securityService['securityDb'].updateRateLimit(
        mockContext.userId,
        WizardOperation.SCAN_DEVICES,
        60000
      );

      expect(rateLimitResult.currentCount).toBeGreaterThan(1);
    });

    it('should block operations when emergency stop is active', async () => {
      // Activate emergency stop
      await securityService.emergencyStopEnhanced(
        mockContext,
        'Test emergency stop'
      );

      const allowed = await securityService.checkRateLimitEnhanced(
        mockContext,
        WizardOperation.SCAN_DEVICES
      );

      expect(allowed).toBe(false);
    });

    it('should block operations for blocked sessions', async () => {
      // Block the session by triggering suspicious activity
      securityService['blockedSessions'].add(mockContext.sessionId);

      const allowed = await securityService.checkRateLimitEnhanced(
        mockContext,
        WizardOperation.SCAN_DEVICES
      );

      expect(allowed).toBe(false);
    });
  });

  describe('detectSuspiciousActivityEnhanced', () => {
    beforeEach(async () => {
      // Add some test audit entries
      for (let i = 0; i < 15; i++) {
        await securityService.logAuditEntryEnhanced(
          mockContext,
          WizardOperation.TEST_CARD,
          `card-${i}`,
          false, // Failed operations
          { attempt: i },
          'medium'
        );
      }
    });

    it('should detect high failure rates', async () => {
      const result = await securityService.detectSuspiciousActivityEnhanced(mockContext);

      expect(result.suspicious).toBe(true);
      expect(result.reasons).toContain(expect.stringContaining('High failure rate'));
      expect(result.riskScore).toBeGreaterThan(30);
    });

    it('should recommend appropriate actions based on risk score', async () => {
      const result = await securityService.detectSuspiciousActivityEnhanced(mockContext);

      expect(['monitor', 'warn', 'block', 'emergency_stop']).toContain(result.recommendedAction);
    });

    it('should handle database errors gracefully', async () => {
      // Close database to simulate error
      testDb.close();

      const result = await securityService.detectSuspiciousActivityEnhanced(mockContext);

      expect(result.suspicious).toBe(false);
      expect(result.riskScore).toBe(0);
      expect(result.recommendedAction).toBe('monitor');
    });
  });

  describe('emergencyStopEnhanced', () => {
    it('should activate emergency stop for admin users', async () => {
      await securityService.emergencyStopEnhanced(
        mockContext,
        'Security breach detected',
        ['session-1', 'session-2']
      );

      expect(securityService.isEmergencyStopActive()).toBe(true);
      expect(securityService.isSessionBlocked('session-1')).toBe(true);
      expect(securityService.isSessionBlocked('session-2')).toBe(true);
    });

    it('should prevent staff users from activating emergency stop', async () => {
      const staffContext = {
        ...mockContext,
        role: 'staff' as const,
        permissions: securityService.getWizardPermissions('staff')
      };

      await expect(
        securityService.emergencyStopEnhanced(
          staffContext,
          'Test reason'
        )
      ).rejects.toThrow('Insufficient permissions for emergency stop');
    });

    it('should store emergency stop in database', async () => {
      await securityService.emergencyStopEnhanced(
        mockContext,
        'Test emergency stop'
      );

      // Verify emergency stop was logged in audit
      const auditEntries = await securityService['securityDb'].getAuditEntries({
        userId: mockContext.userId,
        limit: 10
      });

      const emergencyEntry = auditEntries.find(entry => 
        entry.resource === 'emergency_stop'
      );

      expect(emergencyEntry).toBeDefined();
      expect(emergencyEntry?.risk_level).toBe('critical');
    });
  });

  describe('deactivateEmergencyStop', () => {
    beforeEach(async () => {
      await securityService.emergencyStopEnhanced(
        mockContext,
        'Test emergency stop'
      );
    });

    it('should deactivate emergency stop for admin users', async () => {
      await securityService.deactivateEmergencyStop(
        mockContext,
        'Threat resolved'
      );

      expect(securityService.isEmergencyStopActive()).toBe(false);
    });

    it('should clear blocked sessions', async () => {
      securityService['blockedSessions'].add('test-session');
      
      await securityService.deactivateEmergencyStop(
        mockContext,
        'Threat resolved'
      );

      expect(securityService.isSessionBlocked('test-session')).toBe(false);
    });

    it('should log deactivation', async () => {
      await securityService.deactivateEmergencyStop(
        mockContext,
        'Threat resolved'
      );

      const auditEntries = await securityService['securityDb'].getAuditEntries({
        userId: mockContext.userId,
        limit: 10
      });

      const deactivationEntry = auditEntries.find(entry => 
        entry.resource === 'emergency_stop_deactivated'
      );

      expect(deactivationEntry).toBeDefined();
    });
  });

  describe('getSecurityDashboardEnhanced', () => {
    beforeEach(async () => {
      // Add some test data
      await securityService.logAuditEntryEnhanced(
        mockContext,
        WizardOperation.SCAN_DEVICES,
        'port1',
        true,
        {},
        'low'
      );

      await securityService.logAuditEntryEnhanced(
        mockContext,
        WizardOperation.TEST_CARD,
        'card1',
        false,
        {},
        'high'
      );
    });

    it('should return comprehensive dashboard data', async () => {
      const dashboard = await securityService.getSecurityDashboardEnhanced();

      expect(dashboard.summary).toBeDefined();
      expect(dashboard.recentAlerts).toBeDefined();
      expect(dashboard.auditSummary).toBeDefined();
      expect(dashboard.riskAnalysis).toBeDefined();
      expect(dashboard.systemStatus).toBeDefined();
    });

    it('should include system status information', async () => {
      const dashboard = await securityService.getSecurityDashboardEnhanced();

      expect(dashboard.systemStatus.emergencyStopActive).toBe(false);
      expect(dashboard.systemStatus.blockedSessions).toBe(0);
      expect(dashboard.systemStatus.totalAuditEntries).toBeGreaterThan(0);
    });

    it('should calculate audit summary correctly', async () => {
      const dashboard = await securityService.getSecurityDashboardEnhanced();

      expect(dashboard.auditSummary.totalEntries).toBeGreaterThan(0);
      expect(dashboard.auditSummary.successRate).toBeGreaterThanOrEqual(0);
      expect(dashboard.auditSummary.successRate).toBeLessThanOrEqual(100);
      expect(dashboard.auditSummary.topOperations).toBeDefined();
      expect(dashboard.auditSummary.riskDistribution).toBeDefined();
    });
  });

  describe('logConfigurationChange', () => {
    it('should store configuration changes', async () => {
      const oldConfig = { address: 1, enabled: true };
      const newConfig = { address: 2, enabled: true };

      await securityService.logConfigurationChange(
        mockContext,
        'update_address',
        'relay_card',
        'card-1',
        oldConfig,
        newConfig,
        true
      );

      const configChanges = await securityService['securityDb'].getConfigChanges({
        userId: mockContext.userId,
        limit: 1
      });

      expect(configChanges.length).toBe(1);
      expect(configChanges[0].change_type).toBe('update_address');
      expect(configChanges[0].resource_type).toBe('relay_card');
      expect(configChanges[0].success).toBe(true);
    });

    it('should store failed configuration changes with error message', async () => {
      await securityService.logConfigurationChange(
        mockContext,
        'update_address',
        'relay_card',
        'card-1',
        { address: 1 },
        { address: 2 },
        false,
        'Address conflict detected'
      );

      const configChanges = await securityService['securityDb'].getConfigChanges({
        success: false,
        limit: 1
      });

      expect(configChanges.length).toBe(1);
      expect(configChanges[0].success).toBe(false);
      expect(configChanges[0].error_message).toBe('Address conflict detected');
    });
  });

  describe('session and emergency stop status', () => {
    it('should track emergency stop status', () => {
      expect(securityService.isEmergencyStopActive()).toBe(false);
    });

    it('should track blocked sessions', () => {
      expect(securityService.isSessionBlocked('test-session')).toBe(false);
      
      securityService['blockedSessions'].add('test-session');
      expect(securityService.isSessionBlocked('test-session')).toBe(true);
    });
  });

  describe('automatic security actions', () => {
    it('should automatically block sessions with high risk scores', async () => {
      // Create many failed operations to trigger high risk score
      for (let i = 0; i < 20; i++) {
        await securityService.logAuditEntryEnhanced(
          mockContext,
          WizardOperation.FINALIZE_WIZARD,
          'system',
          false,
          { attempt: i },
          'high'
        );
      }

      const result = await securityService.detectSuspiciousActivityEnhanced(mockContext);
      
      // Should recommend blocking or emergency stop
      expect(['block', 'emergency_stop']).toContain(result.recommendedAction);
    });

    it('should handle automatic actions without errors', async () => {
      // This tests the private takeAutomaticSecurityAction method indirectly
      await expect(
        securityService.detectSuspiciousActivityEnhanced(mockContext)
      ).resolves.not.toThrow();
    });
  });
});