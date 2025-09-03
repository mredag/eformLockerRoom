import { describe, it, expect, beforeEach } from 'vitest';
import { WizardSecurityMonitor, SecurityAlert } from '../wizard-security-monitor';
import { WizardSecurityContext, WizardOperation, AuditLogEntry } from '../wizard-security-service';

describe('WizardSecurityMonitor', () => {
  let monitor: WizardSecurityMonitor;
  let mockContext: WizardSecurityContext;

  beforeEach(() => {
    monitor = new WizardSecurityMonitor();
    mockContext = {
      userId: 1,
      username: 'testuser',
      role: 'admin',
      sessionId: 'test-session-123',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Browser',
      csrfToken: 'test-csrf-token',
      permissions: []
    };
  });

  describe('createAlert', () => {
    it('should create security alert with correct properties', () => {
      const alert = monitor.createAlert(
        'suspicious_activity',
        'high',
        'Test suspicious activity',
        mockContext,
        { testData: 'value' }
      );

      expect(alert.id).toBeDefined();
      expect(alert.type).toBe('suspicious_activity');
      expect(alert.severity).toBe('high');
      expect(alert.message).toBe('Test suspicious activity');
      expect(alert.context.userId).toBe(1);
      expect(alert.details.testData).toBe('value');
      expect(alert.resolved).toBe(false);
    });

    it('should emit securityAlert event', (done) => {
      monitor.on('securityAlert', (alert: SecurityAlert) => {
        expect(alert.type).toBe('rate_limit');
        expect(alert.severity).toBe('medium');
        done();
      });

      monitor.createAlert(
        'rate_limit',
        'medium',
        'Rate limit exceeded',
        mockContext
      );
    });

    it('should log critical alerts to console', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      monitor.createAlert(
        'unauthorized_access',
        'critical',
        'Critical security breach',
        mockContext
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚨 CRITICAL SECURITY ALERT: Critical security breach'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('should update active alerts count', () => {
      const initialMetrics = monitor.getSecurityMetrics();
      const initialCount = initialMetrics.activeAlerts;

      monitor.createAlert('system_anomaly', 'low', 'Test alert', mockContext);

      const updatedMetrics = monitor.getSecurityMetrics();
      expect(updatedMetrics.activeAlerts).toBe(initialCount + 1);
    });
  });

  describe('resolveAlert', () => {
    it('should resolve existing alert', () => {
      const alert = monitor.createAlert(
        'suspicious_activity',
        'medium',
        'Test alert',
        mockContext
      );

      const resolved = monitor.resolveAlert(alert.id, 'admin');

      expect(resolved).toBe(true);
      expect(alert.resolved).toBe(true);
      expect(alert.resolvedBy).toBe('admin');
      expect(alert.resolvedAt).toBeDefined();
    });

    it('should not resolve non-existent alert', () => {
      const resolved = monitor.resolveAlert('non-existent-id', 'admin');
      expect(resolved).toBe(false);
    });

    it('should not resolve already resolved alert', () => {
      const alert = monitor.createAlert(
        'suspicious_activity',
        'medium',
        'Test alert',
        mockContext
      );

      monitor.resolveAlert(alert.id, 'admin');
      const secondResolve = monitor.resolveAlert(alert.id, 'admin');

      expect(secondResolve).toBe(false);
    });

    it('should emit alertResolved event', (done) => {
      const alert = monitor.createAlert(
        'suspicious_activity',
        'medium',
        'Test alert',
        mockContext
      );

      monitor.on('alertResolved', (resolvedAlert: SecurityAlert) => {
        expect(resolvedAlert.id).toBe(alert.id);
        expect(resolvedAlert.resolved).toBe(true);
        done();
      });

      monitor.resolveAlert(alert.id, 'admin');
    });

    it('should decrease active alerts count', () => {
      const alert = monitor.createAlert('system_anomaly', 'low', 'Test alert', mockContext);
      const beforeResolve = monitor.getSecurityMetrics().activeAlerts;

      monitor.resolveAlert(alert.id, 'admin');

      const afterResolve = monitor.getSecurityMetrics().activeAlerts;
      expect(afterResolve).toBe(beforeResolve - 1);
    });
  });

  describe('getActiveAlerts', () => {
    beforeEach(() => {
      monitor.createAlert('rate_limit', 'low', 'Low severity alert', mockContext);
      monitor.createAlert('suspicious_activity', 'high', 'High severity alert', mockContext);
      monitor.createAlert('system_anomaly', 'medium', 'Medium severity alert', mockContext);
    });

    it('should return all active alerts', () => {
      const alerts = monitor.getActiveAlerts();
      expect(alerts.length).toBe(3);
      expect(alerts.every(alert => !alert.resolved)).toBe(true);
    });

    it('should filter alerts by severity', () => {
      const highAlerts = monitor.getActiveAlerts('high');
      expect(highAlerts.length).toBe(1);
      expect(highAlerts[0].severity).toBe('high');
    });

    it('should not return resolved alerts', () => {
      const alerts = monitor.getActiveAlerts();
      const alertToResolve = alerts[0];
      
      monitor.resolveAlert(alertToResolve.id, 'admin');
      
      const activeAlerts = monitor.getActiveAlerts();
      expect(activeAlerts.length).toBe(2);
      expect(activeAlerts.find(a => a.id === alertToResolve.id)).toBeUndefined();
    });

    it('should sort alerts by timestamp (newest first)', () => {
      const alerts = monitor.getActiveAlerts();
      
      for (let i = 1; i < alerts.length; i++) {
        expect(alerts[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(
          alerts[i].timestamp.getTime()
        );
      }
    });
  });

  describe('monitorAuditEntry', () => {
    it('should update metrics when monitoring audit entry', () => {
      const auditEntry: AuditLogEntry = {
        id: 'test-entry-1',
        timestamp: new Date(),
        userId: 1,
        username: 'testuser',
        operation: WizardOperation.SCAN_DEVICES,
        resource: 'test-resource',
        success: true,
        details: {},
        ipAddress: '192.168.1.100',
        userAgent: 'Test Browser',
        sessionId: 'test-session',
        riskLevel: 'low'
      };

      const initialMetrics = monitor.getSecurityMetrics();
      
      monitor.monitorAuditEntry(auditEntry);
      
      const updatedMetrics = monitor.getSecurityMetrics();
      expect(updatedMetrics.totalOperations).toBe(initialMetrics.totalOperations + 1);
    });

    it('should emit auditEntry event', (done) => {
      const auditEntry: AuditLogEntry = {
        id: 'test-entry-1',
        timestamp: new Date(),
        userId: 1,
        username: 'testuser',
        operation: WizardOperation.TEST_CARD,
        resource: 'card-1',
        success: true,
        details: {},
        ipAddress: '192.168.1.100',
        userAgent: 'Test Browser',
        sessionId: 'test-session',
        riskLevel: 'low'
      };

      monitor.on('auditEntry', (entry: AuditLogEntry) => {
        expect(entry.operation).toBe(WizardOperation.TEST_CARD);
        expect(entry.resource).toBe('card-1');
        done();
      });

      monitor.monitorAuditEntry(auditEntry);
    });

    it('should create alerts for critical operations', () => {
      const auditEntry: AuditLogEntry = {
        id: 'test-entry-1',
        timestamp: new Date(),
        userId: 1,
        username: 'testuser',
        operation: WizardOperation.FINALIZE_WIZARD,
        resource: 'system',
        success: false, // Failed critical operation
        details: {},
        ipAddress: '192.168.1.100',
        userAgent: 'Test Browser',
        sessionId: 'test-session',
        riskLevel: 'high'
      };

      const initialAlerts = monitor.getActiveAlerts().length;
      
      monitor.monitorAuditEntry(auditEntry);
      
      const finalAlerts = monitor.getActiveAlerts().length;
      expect(finalAlerts).toBeGreaterThan(initialAlerts);
    });
  });

  describe('analyzeAnomalies', () => {
    it('should detect rapid failed attempts', () => {
      const auditEntries: AuditLogEntry[] = [];
      
      // Create many failed entries in short time
      for (let i = 0; i < 15; i++) {
        auditEntries.push({
          id: `entry-${i}`,
          timestamp: new Date(),
          userId: 1,
          username: 'testuser',
          operation: WizardOperation.TEST_CARD,
          resource: `card-${i}`,
          success: false,
          details: {},
          ipAddress: '192.168.1.100',
          userAgent: 'Test Browser',
          sessionId: 'test-session',
          riskLevel: 'low'
        });
      }

      const alerts = monitor.analyzeAnomalies(auditEntries);
      
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some(alert => alert.details.pattern === 'rapid_failed_attempts')).toBe(true);
    });

    it('should detect privilege escalation attempts', () => {
      const auditEntries: AuditLogEntry[] = [];
      
      // Create failed privileged operations
      for (let i = 0; i < 5; i++) {
        auditEntries.push({
          id: `entry-${i}`,
          timestamp: new Date(),
          userId: 1,
          username: 'testuser',
          operation: WizardOperation.FINALIZE_WIZARD,
          resource: 'system',
          success: false,
          details: {},
          ipAddress: '192.168.1.100',
          userAgent: 'Test Browser',
          sessionId: 'test-session',
          riskLevel: 'high'
        });
      }

      const alerts = monitor.analyzeAnomalies(auditEntries);
      
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some(alert => alert.details.pattern === 'privilege_escalation')).toBe(true);
    });

    it('should not create alerts for normal activity', () => {
      const auditEntries: AuditLogEntry[] = [
        {
          id: 'entry-1',
          timestamp: new Date(),
          userId: 1,
          username: 'testuser',
          operation: WizardOperation.SCAN_DEVICES,
          resource: 'port1',
          success: true,
          details: {},
          ipAddress: '192.168.1.100',
          userAgent: 'Test Browser',
          sessionId: 'test-session',
          riskLevel: 'low'
        }
      ];

      const alerts = monitor.analyzeAnomalies(auditEntries);
      expect(alerts.length).toBe(0);
    });
  });

  describe('checkRateLimit', () => {
    it('should update rate limit violations metric', () => {
      const initialMetrics = monitor.getSecurityMetrics();
      
      monitor.checkRateLimit(mockContext, WizardOperation.SCAN_DEVICES, false);
      
      const updatedMetrics = monitor.getSecurityMetrics();
      expect(updatedMetrics.rateLimitViolations).toBe(initialMetrics.rateLimitViolations + 1);
    });

    it('should create rate limit alert', () => {
      const initialAlerts = monitor.getActiveAlerts().length;
      
      monitor.checkRateLimit(mockContext, WizardOperation.SCAN_DEVICES, false);
      
      const finalAlerts = monitor.getActiveAlerts().length;
      expect(finalAlerts).toBe(initialAlerts + 1);
      
      const rateLimitAlert = monitor.getActiveAlerts().find(alert => alert.type === 'rate_limit');
      expect(rateLimitAlert).toBeDefined();
      expect(rateLimitAlert!.severity).toBe('medium');
    });
  });

  describe('reportSuspiciousActivity', () => {
    it('should update suspicious activities metric', () => {
      const initialMetrics = monitor.getSecurityMetrics();
      
      monitor.reportSuspiciousActivity(mockContext, ['High frequency'], 70);
      
      const updatedMetrics = monitor.getSecurityMetrics();
      expect(updatedMetrics.suspiciousActivities).toBe(initialMetrics.suspiciousActivities + 1);
    });

    it('should create appropriate severity alert based on risk score', () => {
      monitor.reportSuspiciousActivity(mockContext, ['Critical issue'], 90);
      
      const alerts = monitor.getActiveAlerts();
      const suspiciousAlert = alerts.find(alert => alert.type === 'suspicious_activity');
      
      expect(suspiciousAlert).toBeDefined();
      expect(suspiciousAlert!.severity).toBe('critical');
    });
  });

  describe('reportEmergencyStop', () => {
    it('should update emergency stops metric', () => {
      const initialMetrics = monitor.getSecurityMetrics();
      
      monitor.reportEmergencyStop(mockContext, 'Security breach');
      
      const updatedMetrics = monitor.getSecurityMetrics();
      expect(updatedMetrics.emergencyStops).toBe(initialMetrics.emergencyStops + 1);
    });

    it('should create critical emergency stop alert', () => {
      monitor.reportEmergencyStop(mockContext, 'System compromise detected');
      
      const alerts = monitor.getActiveAlerts();
      const emergencyAlert = alerts.find(alert => alert.type === 'emergency_stop');
      
      expect(emergencyAlert).toBeDefined();
      expect(emergencyAlert!.severity).toBe('critical');
      expect(emergencyAlert!.message).toContain('System compromise detected');
    });
  });

  describe('getSecurityDashboard', () => {
    beforeEach(() => {
      // Create some test data
      monitor.createAlert('rate_limit', 'medium', 'Test alert 1', mockContext);
      monitor.createAlert('suspicious_activity', 'high', 'Test alert 2', mockContext);
      monitor.reportSuspiciousActivity(mockContext, ['Test reason'], 60);
    });

    it('should return dashboard data with metrics', () => {
      const dashboard = monitor.getSecurityDashboard();
      
      expect(dashboard.metrics).toBeDefined();
      expect(dashboard.recentAlerts).toBeDefined();
      expect(dashboard.topThreats).toBeDefined();
      expect(dashboard.riskTrends).toBeDefined();
    });

    it('should include recent alerts', () => {
      const dashboard = monitor.getSecurityDashboard();
      
      expect(dashboard.recentAlerts.length).toBeGreaterThan(0);
      expect(dashboard.recentAlerts[0].timestamp).toBeDefined();
    });

    it('should calculate top threats', () => {
      const dashboard = monitor.getSecurityDashboard();
      
      expect(dashboard.topThreats.length).toBeGreaterThan(0);
      expect(dashboard.topThreats[0]).toHaveProperty('type');
      expect(dashboard.topThreats[0]).toHaveProperty('count');
    });

    it('should provide risk trends by hour', () => {
      const dashboard = monitor.getSecurityDashboard();
      
      expect(dashboard.riskTrends).toHaveLength(24);
      expect(dashboard.riskTrends[0]).toHaveProperty('hour');
      expect(dashboard.riskTrends[0]).toHaveProperty('riskScore');
    });
  });

  describe('exportSecurityReport', () => {
    beforeEach(() => {
      monitor.createAlert('rate_limit', 'medium', 'Test alert', mockContext);
      monitor.reportSuspiciousActivity(mockContext, ['Test'], 50);
    });

    it('should export security report for date range', () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const endDate = new Date();
      
      const report = monitor.exportSecurityReport(startDate, endDate);
      
      expect(report.summary).toBeDefined();
      expect(report.alerts).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    it('should include recommendations based on metrics', () => {
      // Create conditions that should trigger recommendations
      for (let i = 0; i < 15; i++) {
        monitor.checkRateLimit(mockContext, WizardOperation.SCAN_DEVICES, false);
      }
      
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      const report = monitor.exportSecurityReport(startDate, endDate);
      
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(rec => 
        rec.includes('rate limiting')
      )).toBe(true);
    });
  });
});