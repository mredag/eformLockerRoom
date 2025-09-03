import { WizardSecurityContext, WizardOperation, AuditLogEntry } from './wizard-security-service';
import { EventEmitter } from 'events';

export interface SecurityAlert {
  id: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'rate_limit' | 'suspicious_activity' | 'unauthorized_access' | 'system_anomaly' | 'emergency_stop';
  message: string;
  context: WizardSecurityContext;
  details: any;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface SecurityMetrics {
  totalOperations: number;
  failedOperations: number;
  suspiciousActivities: number;
  rateLimitViolations: number;
  emergencyStops: number;
  activeAlerts: number;
  averageResponseTime: number;
  uniqueUsers: number;
  uniqueIPs: number;
}

export interface AnomalyPattern {
  pattern: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detector: (entries: AuditLogEntry[]) => boolean;
}

export class WizardSecurityMonitor extends EventEmitter {
  private alerts: SecurityAlert[] = [];
  private metrics: SecurityMetrics = {
    totalOperations: 0,
    failedOperations: 0,
    suspiciousActivities: 0,
    rateLimitViolations: 0,
    emergencyStops: 0,
    activeAlerts: 0,
    averageResponseTime: 0,
    uniqueUsers: 0,
    uniqueIPs: 0
  };

  private anomalyPatterns: AnomalyPattern[] = [
    {
      pattern: 'rapid_failed_attempts',
      description: 'Multiple failed operations in short time',
      severity: 'high',
      detector: (entries) => {
        const recentFailures = entries.filter(e => 
          !e.success && 
          e.timestamp > new Date(Date.now() - 60000) // Last minute
        );
        return recentFailures.length > 10;
      }
    },
    {
      pattern: 'privilege_escalation',
      description: 'Attempting operations beyond user permissions',
      severity: 'critical',
      detector: (entries) => {
        const recentEntries = entries.filter(e => 
          e.timestamp > new Date(Date.now() - 300000) // Last 5 minutes
        );
        const failedPrivilegedOps = recentEntries.filter(e => 
          !e.success && 
          [WizardOperation.FINALIZE_WIZARD, WizardOperation.BULK_CONFIGURATION].includes(e.operation)
        );
        return failedPrivilegedOps.length > 3;
      }
    },
    {
      pattern: 'unusual_timing',
      description: 'Operations at unusual hours',
      severity: 'medium',
      detector: (entries) => {
        const recentEntries = entries.filter(e => 
          e.timestamp > new Date(Date.now() - 3600000) // Last hour
        );
        const nightOperations = recentEntries.filter(e => {
          const hour = e.timestamp.getHours();
          return hour < 6 || hour > 22; // Between 10 PM and 6 AM
        });
        return nightOperations.length > 5;
      }
    },
    {
      pattern: 'ip_hopping',
      description: 'Rapid IP address changes',
      severity: 'high',
      detector: (entries) => {
        const recentEntries = entries.filter(e => 
          e.timestamp > new Date(Date.now() - 600000) // Last 10 minutes
        );
        const uniqueIPs = new Set(recentEntries.map(e => e.ipAddress));
        return uniqueIPs.size > 5;
      }
    },
    {
      pattern: 'bulk_operations',
      description: 'Excessive bulk configuration operations',
      severity: 'medium',
      detector: (entries) => {
        const recentBulkOps = entries.filter(e => 
          e.operation === WizardOperation.BULK_CONFIGURATION &&
          e.timestamp > new Date(Date.now() - 3600000) // Last hour
        );
        return recentBulkOps.length > 10;
      }
    }
  ];

  /**
   * Monitor audit log entry for security issues
   */
  monitorAuditEntry(entry: AuditLogEntry): void {
    // Update metrics
    this.updateMetrics(entry);

    // Check for immediate threats
    this.checkImmediateThreats(entry);

    // Emit event for real-time monitoring
    this.emit('auditEntry', entry);
  }

  /**
   * Analyze audit logs for anomalies
   */
  analyzeAnomalies(auditLog: AuditLogEntry[]): SecurityAlert[] {
    const newAlerts: SecurityAlert[] = [];

    for (const pattern of this.anomalyPatterns) {
      if (pattern.detector(auditLog)) {
        const alert = this.createAlert(
          'system_anomaly',
          pattern.severity,
          `Anomaly detected: ${pattern.description}`,
          auditLog[0]?.userId ? {
            userId: auditLog[0].userId,
            username: auditLog[0].username,
            role: 'admin' as any, // We don't have role in audit log
            sessionId: auditLog[0].sessionId,
            ipAddress: auditLog[0].ipAddress,
            userAgent: auditLog[0].userAgent,
            csrfToken: '',
            permissions: []
          } : null,
          { pattern: pattern.pattern, entries: auditLog.slice(0, 10) }
        );
        newAlerts.push(alert);
      }
    }

    return newAlerts;
  }

  /**
   * Create security alert
   */
  createAlert(
    type: SecurityAlert['type'],
    severity: SecurityAlert['severity'],
    message: string,
    context: WizardSecurityContext | null,
    details: any = {}
  ): SecurityAlert {
    const alert: SecurityAlert = {
      id: this.generateAlertId(),
      timestamp: new Date(),
      severity,
      type,
      message,
      context: context || this.createEmptyContext(),
      details,
      resolved: false
    };

    this.alerts.push(alert);
    this.metrics.activeAlerts++;

    // Emit alert event
    this.emit('securityAlert', alert);

    // Log critical alerts immediately
    if (severity === 'critical') {
      console.error(`🚨 CRITICAL SECURITY ALERT: ${message}`, details);
    }

    return alert;
  }

  /**
   * Resolve security alert
   */
  resolveAlert(alertId: string, resolvedBy: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert || alert.resolved) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();
    alert.resolvedBy = resolvedBy;
    this.metrics.activeAlerts--;

    this.emit('alertResolved', alert);
    return true;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(severity?: SecurityAlert['severity']): SecurityAlert[] {
    let alerts = this.alerts.filter(a => !a.resolved);
    
    if (severity) {
      alerts = alerts.filter(a => a.severity === severity);
    }

    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): SecurityMetrics {
    return { ...this.metrics };
  }

  /**
   * Check for rate limit violations
   */
  checkRateLimit(context: WizardSecurityContext, operation: WizardOperation, allowed: boolean): void {
    if (!allowed) {
      this.metrics.rateLimitViolations++;
      
      this.createAlert(
        'rate_limit',
        'medium',
        `Rate limit exceeded for operation ${operation}`,
        context,
        { operation, timestamp: new Date() }
      );
    }
  }

  /**
   * Report suspicious activity
   */
  reportSuspiciousActivity(
    context: WizardSecurityContext,
    reasons: string[],
    riskScore: number
  ): void {
    this.metrics.suspiciousActivities++;

    const severity: SecurityAlert['severity'] = 
      riskScore > 80 ? 'critical' :
      riskScore > 60 ? 'high' :
      riskScore > 40 ? 'medium' : 'low';

    this.createAlert(
      'suspicious_activity',
      severity,
      `Suspicious activity detected: ${reasons.join(', ')}`,
      context,
      { reasons, riskScore, timestamp: new Date() }
    );
  }

  /**
   * Report emergency stop
   */
  reportEmergencyStop(context: WizardSecurityContext, reason: string): void {
    this.metrics.emergencyStops++;

    this.createAlert(
      'emergency_stop',
      'critical',
      `Emergency stop activated: ${reason}`,
      context,
      { reason, timestamp: new Date() }
    );
  }

  /**
   * Get security dashboard data
   */
  getSecurityDashboard(): {
    metrics: SecurityMetrics;
    recentAlerts: SecurityAlert[];
    topThreats: { type: string; count: number }[];
    riskTrends: { hour: number; riskScore: number }[];
  } {
    const recentAlerts = this.alerts
      .filter(a => a.timestamp > new Date(Date.now() - 86400000)) // Last 24 hours
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);

    // Count threat types
    const threatCounts = new Map<string, number>();
    for (const alert of recentAlerts) {
      threatCounts.set(alert.type, (threatCounts.get(alert.type) || 0) + 1);
    }

    const topThreats = Array.from(threatCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate risk trends by hour
    const riskTrends: { hour: number; riskScore: number }[] = [];
    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(Date.now() - i * 3600000);
      const hourEnd = new Date(hourStart.getTime() + 3600000);
      
      const hourAlerts = this.alerts.filter(a => 
        a.timestamp >= hourStart && a.timestamp < hourEnd
      );
      
      const riskScore = hourAlerts.reduce((sum, alert) => {
        const severityScore = {
          low: 10,
          medium: 25,
          high: 50,
          critical: 100
        }[alert.severity];
        return sum + severityScore;
      }, 0);

      riskTrends.push({
        hour: hourStart.getHours(),
        riskScore
      });
    }

    return {
      metrics: this.getSecurityMetrics(),
      recentAlerts,
      topThreats,
      riskTrends
    };
  }

  /**
   * Export security report
   */
  exportSecurityReport(startDate: Date, endDate: Date): {
    summary: SecurityMetrics;
    alerts: SecurityAlert[];
    recommendations: string[];
  } {
    const alerts = this.alerts.filter(a => 
      a.timestamp >= startDate && a.timestamp <= endDate
    );

    const recommendations: string[] = [];

    // Analyze patterns and generate recommendations
    if (this.metrics.rateLimitViolations > 10) {
      recommendations.push('Consider implementing stricter rate limiting');
    }

    if (this.metrics.suspiciousActivities > 5) {
      recommendations.push('Review user access patterns and consider additional authentication');
    }

    if (this.metrics.failedOperations / this.metrics.totalOperations > 0.1) {
      recommendations.push('High failure rate detected - review system stability');
    }

    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      recommendations.push('Critical security alerts require immediate attention');
    }

    return {
      summary: this.getSecurityMetrics(),
      alerts,
      recommendations
    };
  }

  /**
   * Update metrics based on audit entry
   */
  private updateMetrics(entry: AuditLogEntry): void {
    this.metrics.totalOperations++;
    
    if (!entry.success) {
      this.metrics.failedOperations++;
    }

    // Update unique users and IPs (simplified - in production use a time window)
    // This is a basic implementation - in production you'd want to track these properly
  }

  /**
   * Check for immediate security threats
   */
  private checkImmediateThreats(entry: AuditLogEntry): void {
    // Check for critical operations
    if (entry.operation === WizardOperation.FINALIZE_WIZARD && !entry.success) {
      this.createAlert(
        'unauthorized_access',
        'high',
        'Failed attempt to finalize wizard configuration',
        this.createContextFromAuditEntry(entry),
        { operation: entry.operation, details: entry.details }
      );
    }

    // Check for emergency operations
    if (entry.details?.emergencyStop) {
      this.reportEmergencyStop(
        this.createContextFromAuditEntry(entry),
        entry.details.reason || 'Unknown reason'
      );
    }
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create empty security context
   */
  private createEmptyContext(): WizardSecurityContext {
    return {
      userId: 0,
      username: 'system',
      role: 'admin',
      sessionId: '',
      ipAddress: 'unknown',
      userAgent: 'system',
      csrfToken: '',
      permissions: []
    };
  }

  /**
   * Create security context from audit entry
   */
  private createContextFromAuditEntry(entry: AuditLogEntry): WizardSecurityContext {
    return {
      userId: entry.userId,
      username: entry.username,
      role: 'admin', // We don't store role in audit log
      sessionId: entry.sessionId,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      csrfToken: '',
      permissions: []
    };
  }
}

export const wizardSecurityMonitor = new WizardSecurityMonitor();