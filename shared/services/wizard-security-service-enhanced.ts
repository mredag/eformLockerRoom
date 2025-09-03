import { WizardSecurityService, WizardSecurityContext, WizardOperation, AuditLogEntry } from './wizard-security-service';
import { WizardSecurityDatabase } from './wizard-security-database';
import { wizardSecurityMonitor, SecurityAlert } from './wizard-security-monitor';
import { Database } from 'sqlite3';
import crypto from 'crypto';

export interface SecurityConfiguration {
  enableDatabaseAudit: boolean;
  enableRealTimeMonitoring: boolean;
  enableAnomalyDetection: boolean;
  auditRetentionDays: number;
  maxRiskScore: number;
  emergencyStopThreshold: number;
  rateLimitWindowMs: number;
  suspiciousActivityThreshold: number;
}

export class WizardSecurityServiceEnhanced extends WizardSecurityService {
  private securityDb: WizardSecurityDatabase;
  private config: SecurityConfiguration;
  private emergencyStopActive: boolean = false;
  private blockedSessions: Set<string> = new Set();

  constructor(database: Database, config: Partial<SecurityConfiguration> = {}) {
    super();
    this.securityDb = new WizardSecurityDatabase(database);
    this.config = {
      enableDatabaseAudit: true,
      enableRealTimeMonitoring: true,
      enableAnomalyDetection: true,
      auditRetentionDays: 90,
      maxRiskScore: 100,
      emergencyStopThreshold: 80,
      rateLimitWindowMs: 60000,
      suspiciousActivityThreshold: 50,
      ...config
    };

    // Set up real-time monitoring
    if (this.config.enableRealTimeMonitoring) {
      this.setupRealTimeMonitoring();
    }
  }

  /**
   * Enhanced audit logging with database persistence
   */
  async logAuditEntryEnhanced(
    context: WizardSecurityContext,
    operation: WizardOperation,
    resource: string,
    success: boolean,
    details: any = {},
    riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ): Promise<void> {
    // Call parent method for in-memory logging
    this.logAuditEntry(context, operation, resource, success, details, riskLevel);

    // Store in database if enabled
    if (this.config.enableDatabaseAudit) {
      const auditEntry: AuditLogEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        userId: context.userId,
        username: context.username,
        operation,
        resource,
        success,
        details,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        sessionId: context.sessionId,
        riskLevel
      };

      try {
        await this.securityDb.storeAuditEntry(auditEntry);
        
        // Monitor the audit entry for security issues
        if (this.config.enableRealTimeMonitoring) {
          wizardSecurityMonitor.monitorAuditEntry(auditEntry);
        }
      } catch (error) {
        console.error('Failed to store audit entry in database:', error);
      }
    }

    // Check for emergency conditions
    await this.checkEmergencyConditions(context, operation, success, riskLevel);
  }

  /**
   * Enhanced rate limiting with database tracking
   */
  async checkRateLimitEnhanced(
    context: WizardSecurityContext, 
    operation: WizardOperation
  ): Promise<boolean> {
    // Check if emergency stop is active
    if (this.emergencyStopActive) {
      return false;
    }

    // Check if session is blocked
    if (this.blockedSessions.has(context.sessionId)) {
      return false;
    }

    try {
      // Use database-backed rate limiting
      const rateLimitResult = await this.securityDb.updateRateLimit(
        context.userId,
        operation,
        this.config.rateLimitWindowMs
      );

      // Get rate limit configuration for this operation
      const limits = this.getOperationRateLimit(operation);
      const allowed = rateLimitResult.currentCount <= limits.maxRequests;

      if (!allowed) {
        // Log rate limit violation
        await this.logAuditEntryEnhanced(
          context,
          operation,
          'rate_limit',
          false,
          { 
            currentCount: rateLimitResult.currentCount,
            maxRequests: limits.maxRequests,
            resetTime: rateLimitResult.resetTime
          },
          'medium'
        );

        // Create security alert
        const alert = wizardSecurityMonitor.createAlert(
          'rate_limit',
          'medium',
          `Rate limit exceeded for ${operation}: ${rateLimitResult.currentCount}/${limits.maxRequests}`,
          context,
          { operation, rateLimitResult }
        );

        // Store alert in database
        await this.securityDb.storeSecurityAlert(alert);
      }

      return allowed;
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Fail safe - allow the operation but log the error
      await this.logAuditEntryEnhanced(
        context,
        operation,
        'rate_limit_error',
        false,
        { error: error.message },
        'high'
      );
      return true;
    }
  }

  /**
   * Enhanced suspicious activity detection
   */
  async detectSuspiciousActivityEnhanced(context: WizardSecurityContext): Promise<{
    suspicious: boolean;
    reasons: string[];
    riskScore: number;
    recommendedAction: 'monitor' | 'warn' | 'block' | 'emergency_stop';
  }> {
    try {
      // Get recent audit entries from database
      const recentEntries = await this.securityDb.getAuditEntries({
        userId: context.userId,
        startDate: new Date(Date.now() - 3600000), // Last hour
        limit: 100
      });

      const reasons: string[] = [];
      let riskScore = 0;

      // Analyze patterns
      const failedOperations = recentEntries.filter(e => !e.success);
      const sensitiveOperations = recentEntries.filter(e => 
        ['finalize_wizard', 'bulk_configuration', 'manual_configuration'].includes(e.operation)
      );
      const uniqueIPs = new Set(recentEntries.map(e => e.ip_address));
      const operationFrequency = new Map<string, number>();

      recentEntries.forEach(entry => {
        operationFrequency.set(entry.operation, (operationFrequency.get(entry.operation) || 0) + 1);
      });

      // Check for high failure rate
      if (failedOperations.length > 10) {
        reasons.push(`High failure rate: ${failedOperations.length} failed operations`);
        riskScore += 30;
      }

      // Check for excessive sensitive operations
      if (sensitiveOperations.length > 5) {
        reasons.push(`Excessive sensitive operations: ${sensitiveOperations.length}`);
        riskScore += 40;
      }

      // Check for IP hopping
      if (uniqueIPs.size > 3) {
        reasons.push(`Multiple IP addresses: ${uniqueIPs.size} different IPs`);
        riskScore += 35;
      }

      // Check for operation frequency anomalies
      for (const [operation, count] of operationFrequency.entries()) {
        const normalLimit = this.getOperationRateLimit(operation as WizardOperation).maxRequests;
        if (count > normalLimit * 2) {
          reasons.push(`Excessive ${operation} operations: ${count}`);
          riskScore += 25;
        }
      }

      // Check for unusual timing
      const nightOperations = recentEntries.filter(e => {
        const hour = e.timestamp.getHours();
        return hour < 6 || hour > 22;
      });
      if (nightOperations.length > 10) {
        reasons.push(`Unusual timing: ${nightOperations.length} operations outside business hours`);
        riskScore += 20;
      }

      // Determine recommended action
      let recommendedAction: 'monitor' | 'warn' | 'block' | 'emergency_stop' = 'monitor';
      if (riskScore > this.config.emergencyStopThreshold) {
        recommendedAction = 'emergency_stop';
      } else if (riskScore > 60) {
        recommendedAction = 'block';
      } else if (riskScore > this.config.suspiciousActivityThreshold) {
        recommendedAction = 'warn';
      }

      const suspicious = riskScore > this.config.suspiciousActivityThreshold;

      if (suspicious) {
        // Log suspicious activity
        await this.logAuditEntryEnhanced(
          context,
          WizardOperation.SCAN_DEVICES, // Using as monitoring operation
          'suspicious_activity',
          true,
          { reasons, riskScore, recommendedAction, analysisData: { failedOperations: failedOperations.length, sensitiveOperations: sensitiveOperations.length } },
          riskScore > 70 ? 'critical' : riskScore > 50 ? 'high' : 'medium'
        );

        // Report to security monitor
        wizardSecurityMonitor.reportSuspiciousActivity(context, reasons, riskScore);

        // Take automatic action if needed
        await this.takeAutomaticSecurityAction(context, recommendedAction, reasons, riskScore);
      }

      return { suspicious, reasons, riskScore, recommendedAction };
    } catch (error) {
      console.error('Suspicious activity detection failed:', error);
      return { suspicious: false, reasons: [], riskScore: 0, recommendedAction: 'monitor' };
    }
  }

  /**
   * Enhanced emergency stop with database logging
   */
  async emergencyStopEnhanced(
    context: WizardSecurityContext, 
    reason: string,
    affectedSessions?: string[]
  ): Promise<void> {
    if (!this.hasWizardPermission(context, this.getWizardPermissions('admin')[7])) { // EMERGENCY_STOP permission
      throw new Error('Insufficient permissions for emergency stop');
    }

    this.emergencyStopActive = true;

    // Store emergency stop in database
    const stopId = crypto.randomUUID();
    try {
      await this.securityDb.storeEmergencyStop({
        stopId,
        userId: context.userId,
        username: context.username,
        sessionId: context.sessionId,
        reason,
        affectedSessions,
        recoveryActions: ['block_all_operations', 'notify_administrators']
      });

      // Log the emergency stop
      await this.logAuditEntryEnhanced(
        context,
        WizardOperation.FINALIZE_WIZARD, // Using as emergency operation
        'emergency_stop',
        true,
        { stopId, reason, affectedSessions },
        'critical'
      );

      // Report to security monitor
      wizardSecurityMonitor.reportEmergencyStop(context, reason);

      // Block affected sessions
      if (affectedSessions) {
        affectedSessions.forEach(sessionId => this.blockedSessions.add(sessionId));
      }

      console.log(`🚨 EMERGENCY STOP ACTIVATED by ${context.username}: ${reason}`);
      console.log(`🔒 Blocked sessions: ${this.blockedSessions.size}`);

    } catch (error) {
      console.error('Failed to store emergency stop:', error);
      throw error;
    }
  }

  /**
   * Deactivate emergency stop
   */
  async deactivateEmergencyStop(context: WizardSecurityContext, reason: string): Promise<void> {
    if (!this.hasWizardPermission(context, this.getWizardPermissions('admin')[7])) { // EMERGENCY_STOP permission
      throw new Error('Insufficient permissions to deactivate emergency stop');
    }

    this.emergencyStopActive = false;
    this.blockedSessions.clear();

    await this.logAuditEntryEnhanced(
      context,
      WizardOperation.FINALIZE_WIZARD, // Using as emergency operation
      'emergency_stop_deactivated',
      true,
      { reason },
      'high'
    );

    console.log(`✅ EMERGENCY STOP DEACTIVATED by ${context.username}: ${reason}`);
  }

  /**
   * Get security dashboard with database data
   */
  async getSecurityDashboardEnhanced(): Promise<{
    summary: any;
    recentAlerts: SecurityAlert[];
    auditSummary: any;
    riskAnalysis: any;
    systemStatus: {
      emergencyStopActive: boolean;
      blockedSessions: number;
      totalAuditEntries: number;
      activeAlerts: number;
    };
  }> {
    try {
      const [summary, recentAlerts] = await Promise.all([
        this.securityDb.getSecuritySummary(),
        this.securityDb.getSecurityAlerts({ resolved: false, limit: 10 })
      ]);

      // Get recent audit entries for analysis
      const recentAudit = await this.securityDb.getAuditEntries({
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        limit: 100
      });

      // Analyze risk trends
      const riskAnalysis = this.analyzeRiskTrends(recentAudit);

      return {
        summary,
        recentAlerts: recentAlerts.map(alert => ({
          id: alert.alert_id,
          timestamp: alert.timestamp,
          severity: alert.severity as any,
          type: alert.type as any,
          message: alert.message,
          context: {
            userId: alert.user_id || 0,
            username: alert.username || 'system',
            role: 'admin' as any,
            sessionId: alert.session_id || '',
            ipAddress: alert.ip_address || 'unknown',
            userAgent: alert.user_agent || 'unknown',
            csrfToken: '',
            permissions: []
          },
          details: alert.details,
          resolved: alert.resolved,
          resolvedAt: alert.resolved_at,
          resolvedBy: alert.resolved_by
        })),
        auditSummary: {
          totalEntries: recentAudit.length,
          successRate: recentAudit.length > 0 ? 
            (recentAudit.filter(e => e.success).length / recentAudit.length) * 100 : 100,
          topOperations: this.getTopOperations(recentAudit),
          riskDistribution: this.getRiskDistribution(recentAudit)
        },
        riskAnalysis,
        systemStatus: {
          emergencyStopActive: this.emergencyStopActive,
          blockedSessions: this.blockedSessions.size,
          totalAuditEntries: recentAudit.length,
          activeAlerts: recentAlerts.length
        }
      };
    } catch (error) {
      console.error('Failed to get enhanced security dashboard:', error);
      throw error;
    }
  }

  /**
   * Store configuration change with audit trail
   */
  async logConfigurationChange(
    context: WizardSecurityContext,
    changeType: string,
    resourceType: string,
    resourceId: string,
    oldValue: any,
    newValue: any,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const changeId = crypto.randomUUID();

    try {
      await this.securityDb.storeConfigChange({
        changeId,
        userId: context.userId,
        username: context.username,
        sessionId: context.sessionId,
        changeType,
        resourceType,
        resourceId,
        oldValue,
        newValue,
        success,
        errorMessage,
        rollbackData: success ? oldValue : undefined
      });

      // Log as audit entry
      await this.logAuditEntryEnhanced(
        context,
        WizardOperation.FINALIZE_WIZARD, // Using as configuration operation
        `${resourceType}:${resourceId}`,
        success,
        { changeType, changeId, oldValue, newValue, errorMessage },
        success ? 'medium' : 'high'
      );
    } catch (error) {
      console.error('Failed to log configuration change:', error);
    }
  }

  /**
   * Private helper methods
   */
  private setupRealTimeMonitoring(): void {
    // Set up periodic anomaly detection
    setInterval(async () => {
      try {
        const recentEntries = await this.securityDb.getAuditEntries({
          startDate: new Date(Date.now() - 300000), // Last 5 minutes
          limit: 1000
        });

        if (recentEntries.length > 0) {
          const alerts = wizardSecurityMonitor.analyzeAnomalies(
            recentEntries.map(entry => ({
              id: entry.audit_id,
              timestamp: entry.timestamp,
              userId: entry.user_id,
              username: entry.username,
              operation: entry.operation as WizardOperation,
              resource: entry.resource,
              success: entry.success,
              details: entry.details,
              ipAddress: entry.ip_address,
              userAgent: entry.user_agent,
              sessionId: entry.session_id,
              riskLevel: entry.risk_level as any
            }))
          );

          // Store new alerts in database
          for (const alert of alerts) {
            await this.securityDb.storeSecurityAlert(alert);
          }
        }
      } catch (error) {
        console.error('Real-time monitoring error:', error);
      }
    }, 60000); // Run every minute
  }

  private async checkEmergencyConditions(
    context: WizardSecurityContext,
    operation: WizardOperation,
    success: boolean,
    riskLevel: string
  ): Promise<void> {
    if (riskLevel === 'critical' && !success) {
      const suspiciousActivity = await this.detectSuspiciousActivityEnhanced(context);
      
      if (suspiciousActivity.riskScore > this.config.emergencyStopThreshold) {
        await this.emergencyStopEnhanced(
          context,
          `Automatic emergency stop triggered: ${suspiciousActivity.reasons.join(', ')}`,
          [context.sessionId]
        );
      }
    }
  }

  private async takeAutomaticSecurityAction(
    context: WizardSecurityContext,
    action: 'monitor' | 'warn' | 'block' | 'emergency_stop',
    reasons: string[],
    riskScore: number
  ): Promise<void> {
    switch (action) {
      case 'block':
        this.blockedSessions.add(context.sessionId);
        console.log(`🔒 BLOCKED SESSION: ${context.sessionId} (Risk: ${riskScore})`);
        break;
      
      case 'emergency_stop':
        await this.emergencyStopEnhanced(
          context,
          `Automatic emergency stop: ${reasons.join(', ')}`,
          [context.sessionId]
        );
        break;
      
      case 'warn':
        console.log(`⚠️  WARNING: Suspicious activity detected for ${context.username} (Risk: ${riskScore})`);
        break;
      
      default:
        // Monitor - no action needed
        break;
    }
  }

  private getOperationRateLimit(operation: WizardOperation): { maxRequests: number; windowMs: number } {
    // Use the same rate limits as the parent class
    const defaultLimits = {
      [WizardOperation.SCAN_PORTS]: { maxRequests: 10, windowMs: 60000 },
      [WizardOperation.SCAN_DEVICES]: { maxRequests: 5, windowMs: 60000 },
      [WizardOperation.SET_SLAVE_ADDRESS]: { maxRequests: 20, windowMs: 60000 },
      [WizardOperation.TEST_CARD]: { maxRequests: 30, windowMs: 60000 },
      [WizardOperation.FINALIZE_WIZARD]: { maxRequests: 5, windowMs: 60000 }
    };

    return defaultLimits[operation] || { maxRequests: 10, windowMs: 60000 };
  }

  private analyzeRiskTrends(auditEntries: any[]): any {
    const hourlyRisk = new Map<number, number>();
    
    auditEntries.forEach(entry => {
      const hour = entry.timestamp.getHours();
      const riskValue = this.getRiskValue(entry.risk_level);
      hourlyRisk.set(hour, (hourlyRisk.get(hour) || 0) + riskValue);
    });

    return {
      hourlyTrends: Array.from(hourlyRisk.entries()).map(([hour, risk]) => ({ hour, risk })),
      averageRisk: auditEntries.length > 0 ? 
        auditEntries.reduce((sum, entry) => sum + this.getRiskValue(entry.risk_level), 0) / auditEntries.length : 0,
      peakRiskHour: hourlyRisk.size > 0 ? 
        Array.from(hourlyRisk.entries()).reduce((max, [hour, risk]) => risk > max.risk ? { hour, risk } : max, { hour: 0, risk: 0 }) : null
    };
  }

  private getTopOperations(auditEntries: any[]): { operation: string; count: number }[] {
    const operationCounts = new Map<string, number>();
    
    auditEntries.forEach(entry => {
      operationCounts.set(entry.operation, (operationCounts.get(entry.operation) || 0) + 1);
    });

    return Array.from(operationCounts.entries())
      .map(([operation, count]) => ({ operation, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private getRiskDistribution(auditEntries: any[]): { [key: string]: number } {
    const distribution = { low: 0, medium: 0, high: 0, critical: 0 };
    
    auditEntries.forEach(entry => {
      distribution[entry.risk_level as keyof typeof distribution]++;
    });

    return distribution;
  }

  private getRiskValue(riskLevel: string): number {
    const values = { low: 1, medium: 5, high: 15, critical: 50 };
    return values[riskLevel as keyof typeof values] || 1;
  }

  /**
   * Check if emergency stop is active
   */
  isEmergencyStopActive(): boolean {
    return this.emergencyStopActive;
  }

  /**
   * Check if session is blocked
   */
  isSessionBlocked(sessionId: string): boolean {
    return this.blockedSessions.has(sessionId);
  }
}

// Export enhanced service instance
export const wizardSecurityServiceEnhanced = (database: Database, config?: Partial<SecurityConfiguration>) => 
  new WizardSecurityServiceEnhanced(database, config);