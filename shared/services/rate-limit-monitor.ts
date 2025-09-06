/**
 * Rate Limit Monitoring Service
 * 
 * Provides monitoring and alerting capabilities for rate limiting violations
 */

import { getRateLimiter, RateLimitViolation } from './rate-limiter';

export interface RateLimitAlert {
  id: string;
  type: 'high_violation_rate' | 'card_abuse' | 'locker_abuse' | 'system_overload';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  data: any;
  triggeredAt: Date;
  acknowledged: boolean;
}

export interface RateLimitMetrics {
  totalViolations: number;
  violationsByType: Record<string, number>;
  violationsByKey: Record<string, number>;
  violationsPerMinute: number;
  topViolators: Array<{ key: string; count: number; type: string }>;
  systemHealth: 'healthy' | 'warning' | 'critical';
}

export class RateLimitMonitor {
  private alerts: RateLimitAlert[] = [];
  private alertThresholds = {
    violationsPerMinute: 10,
    cardViolationsPerHour: 50,
    lockerViolationsPerHour: 30,
    systemOverloadThreshold: 100
  };

  /**
   * Get current rate limiting metrics
   */
  getMetrics(windowMinutes: number = 60): RateLimitMetrics {
    const rateLimiter = getRateLimiter();
    const violations = rateLimiter.getRecentViolations(windowMinutes);
    
    const totalViolations = violations.length;
    const violationsByType: Record<string, number> = {};
    const violationsByKey: Record<string, number> = {};
    
    // Analyze violations
    violations.forEach(violation => {
      violationsByType[violation.type] = (violationsByType[violation.type] || 0) + 1;
      violationsByKey[violation.key] = (violationsByKey[violation.key] || 0) + 1;
    });
    
    // Calculate violations per minute
    const violationsPerMinute = totalViolations / windowMinutes;
    
    // Find top violators
    const topViolators = Object.entries(violationsByKey)
      .map(([key, count]) => {
        const violation = violations.find(v => v.key === key);
        return { key, count, type: violation?.type || 'unknown' };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Determine system health
    let systemHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (violationsPerMinute > this.alertThresholds.violationsPerMinute) {
      systemHealth = 'warning';
    }
    if (violationsPerMinute > this.alertThresholds.systemOverloadThreshold) {
      systemHealth = 'critical';
    }
    
    return {
      totalViolations,
      violationsByType,
      violationsByKey,
      violationsPerMinute,
      topViolators,
      systemHealth
    };
  }

  /**
   * Check for alert conditions and generate alerts
   */
  checkAlerts(): RateLimitAlert[] {
    const newAlerts: RateLimitAlert[] = [];
    const metrics = this.getMetrics(60);
    
    // High violation rate alert
    if (metrics.violationsPerMinute > this.alertThresholds.violationsPerMinute) {
      const severity = metrics.violationsPerMinute > this.alertThresholds.systemOverloadThreshold ? 'critical' : 'high';
      
      newAlerts.push({
        id: `high_violation_rate_${Date.now()}`,
        type: 'high_violation_rate',
        severity,
        message: `High rate limit violation rate: ${metrics.violationsPerMinute.toFixed(1)} violations/minute`,
        data: { violationsPerMinute: metrics.violationsPerMinute },
        triggeredAt: new Date(),
        acknowledged: false
      });
    }
    
    // Card abuse alerts
    Object.entries(metrics.violationsByKey).forEach(([key, count]) => {
      if (key.startsWith('card') && count > this.alertThresholds.cardViolationsPerHour) {
        newAlerts.push({
          id: `card_abuse_${key}_${Date.now()}`,
          type: 'card_abuse',
          severity: 'medium',
          message: `Card ${key} has ${count} violations in the last hour`,
          data: { cardId: key, violationCount: count },
          triggeredAt: new Date(),
          acknowledged: false
        });
      }
    });
    
    // Locker abuse alerts
    Object.entries(metrics.violationsByKey).forEach(([key, count]) => {
      if (key.match(/^\d+$/) && count > this.alertThresholds.lockerViolationsPerHour) {
        newAlerts.push({
          id: `locker_abuse_${key}_${Date.now()}`,
          type: 'locker_abuse',
          severity: 'medium',
          message: `Locker ${key} has ${count} violations in the last hour`,
          data: { lockerId: key, violationCount: count },
          triggeredAt: new Date(),
          acknowledged: false
        });
      }
    });
    
    // Add new alerts to the list
    this.alerts.push(...newAlerts);
    
    // Clean up old alerts (keep last 24 hours)
    const cutoff = new Date(Date.now() - (24 * 60 * 60 * 1000));
    this.alerts = this.alerts.filter(alert => alert.triggeredAt > cutoff);
    
    return newAlerts;
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): RateLimitAlert[] {
    return this.alerts.filter(alert => !alert.acknowledged);
  }

  /**
   * Get all alerts (including acknowledged)
   */
  getAllAlerts(): RateLimitAlert[] {
    return [...this.alerts];
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Get rate limit status summary
   */
  getStatusSummary(): {
    status: 'healthy' | 'warning' | 'critical';
    activeAlerts: number;
    recentViolations: number;
    systemLoad: string;
  } {
    const metrics = this.getMetrics(10); // Last 10 minutes
    const activeAlerts = this.getActiveAlerts().length;
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (activeAlerts > 0 || metrics.violationsPerMinute > 5) {
      status = 'warning';
    }
    if (activeAlerts > 5 || metrics.violationsPerMinute > 20) {
      status = 'critical';
    }
    
    return {
      status,
      activeAlerts,
      recentViolations: metrics.totalViolations,
      systemLoad: metrics.violationsPerMinute < 1 ? 'low' : 
                  metrics.violationsPerMinute < 5 ? 'medium' : 'high'
    };
  }

  /**
   * Generate rate limit report
   */
  generateReport(hours: number = 24): {
    summary: RateLimitMetrics;
    alerts: RateLimitAlert[];
    recommendations: string[];
  } {
    const summary = this.getMetrics(hours * 60);
    const alerts = this.alerts.filter(
      alert => alert.triggeredAt > new Date(Date.now() - (hours * 60 * 60 * 1000))
    );
    
    const recommendations: string[] = [];
    
    // Generate recommendations based on metrics
    if (summary.violationsPerMinute > 10) {
      recommendations.push('Consider increasing rate limit thresholds or investigating system abuse');
    }
    
    if (summary.violationsByType.card_rate > summary.totalViolations * 0.5) {
      recommendations.push('High card rate violations - consider user education or adjusting card rate limits');
    }
    
    if (summary.violationsByType.locker_rate > summary.totalViolations * 0.3) {
      recommendations.push('High locker rate violations - check for hardware issues or adjust locker limits');
    }
    
    if (summary.violationsByType.command_cooldown > summary.totalViolations * 0.2) {
      recommendations.push('High command cooldown violations - check system performance or adjust cooldown period');
    }
    
    if (summary.topViolators.length > 0 && summary.topViolators[0].count > 20) {
      recommendations.push(`Top violator ${summary.topViolators[0].key} has ${summary.topViolators[0].count} violations - investigate potential abuse`);
    }
    
    return {
      summary,
      alerts,
      recommendations
    };
  }

  /**
   * Update alert thresholds
   */
  updateThresholds(thresholds: Partial<typeof this.alertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
  }

  /**
   * Get current thresholds
   */
  getThresholds(): typeof this.alertThresholds {
    return { ...this.alertThresholds };
  }
}

// Singleton instance
let rateLimitMonitorInstance: RateLimitMonitor | null = null;

export function getRateLimitMonitor(): RateLimitMonitor {
  if (!rateLimitMonitorInstance) {
    rateLimitMonitorInstance = new RateLimitMonitor();
  }
  return rateLimitMonitorInstance;
}

export function resetRateLimitMonitor(): void {
  rateLimitMonitorInstance = null;
}