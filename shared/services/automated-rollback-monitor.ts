import { RolloutManager } from './rollout-manager';
import { DatabaseManager } from '../database/database-manager';
import { ConfigurationManager } from './configuration-manager';
import { AlertManager } from './alert-manager';

export interface MonitoringConfig {
  checkIntervalMinutes: number;
  enableAutomatedRollback: boolean;
  criticalThresholds: {
    minSuccessRate: number;
    maxFailureRate: number;
    maxResponseTimeMs: number;
    minSampleSize: number;
  };
  alertThresholds: {
    warningSuccessRate: number;
    criticalSuccessRate: number;
    maxConsecutiveFailures: number;
  };
}

export interface MonitoringMetrics {
  kioskId: string;
  timestamp: Date;
  successRate: number;
  failureRate: number;
  averageResponseTime: number;
  totalAssignments: number;
  consecutiveFailures: number;
  lastFailureTime?: Date;
  alertLevel: 'none' | 'warning' | 'critical';
  recommendedAction: 'continue' | 'monitor' | 'rollback';
}

export class AutomatedRollbackMonitor {
  private rolloutManager: RolloutManager;
  private db: DatabaseManager;
  private configManager: ConfigurationManager;
  private alertManager: AlertManager;
  private monitoringInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  private defaultConfig: MonitoringConfig = {
    checkIntervalMinutes: 5,
    enableAutomatedRollback: true,
    criticalThresholds: {
      minSuccessRate: 0.90, // 90%
      maxFailureRate: 0.10, // 10%
      maxResponseTimeMs: 3000, // 3 seconds
      minSampleSize: 20 // minimum assignments to consider
    },
    alertThresholds: {
      warningSuccessRate: 0.95, // 95%
      criticalSuccessRate: 0.90, // 90%
      maxConsecutiveFailures: 5
    }
  };

  constructor(
    rolloutManager: RolloutManager,
    db: DatabaseManager,
    configManager: ConfigurationManager,
    alertManager: AlertManager
  ) {
    this.rolloutManager = rolloutManager;
    this.db = db;
    this.configManager = configManager;
    this.alertManager = alertManager;
  }

  /**
   * Start automated monitoring
   */
  async startMonitoring(config?: Partial<MonitoringConfig>): Promise<void> {
    if (this.isRunning) {
      console.log('Automated rollback monitor is already running');
      return;
    }

    const monitoringConfig = { ...this.defaultConfig, ...config };
    
    console.log(`Starting automated rollback monitor with ${monitoringConfig.checkIntervalMinutes}min intervals`);
    
    this.isRunning = true;
    
    // Run initial check
    await this.performMonitoringCheck(monitoringConfig);
    
    // Set up periodic monitoring
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performMonitoringCheck(monitoringConfig);
      } catch (error) {
        console.error('Error in automated monitoring check:', error);
        
        // Create alert for monitoring failure
        await this.alertManager.triggerAlert('monitoring_failure', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }, monitoringConfig.checkIntervalMinutes * 60 * 1000);
  }

  /**
   * Stop automated monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    this.isRunning = false;
    console.log('Automated rollback monitor stopped');
  }

  /**
   * Perform a single monitoring check cycle
   */
  async performMonitoringCheck(config: MonitoringConfig): Promise<void> {
    console.log('Performing automated rollback monitoring check...');
    
    // Get all enabled kiosks
    const enabledKiosks = await this.db.query(`
      SELECT kiosk_id FROM rollout_status 
      WHERE enabled = 1 AND phase IN ('enabled', 'monitoring')
    `);
    
    const monitoringResults: MonitoringMetrics[] = [];
    
    for (const kiosk of enabledKiosks) {
      try {
        const metrics = await this.analyzeKioskMetrics(kiosk.kiosk_id, config);
        monitoringResults.push(metrics);
        
        // Store monitoring metrics
        await this.storeMonitoringMetrics(metrics);
        
        // Check for automated rollback triggers
        if (config.enableAutomatedRollback && metrics.recommendedAction === 'rollback') {
          await this.executeAutomatedRollback(kiosk.kiosk_id, metrics, config);
        }
        
        // Generate alerts based on metrics
        await this.generateAlertsForMetrics(metrics, config);
        
      } catch (error) {
        console.error(`Error analyzing kiosk ${kiosk.kiosk_id}:`, error);
      }
    }
    
    // Log monitoring summary
    const criticalCount = monitoringResults.filter(m => m.alertLevel === 'critical').length;
    const warningCount = monitoringResults.filter(m => m.alertLevel === 'warning').length;
    
    console.log(`Monitoring check completed: ${enabledKiosks.length} kiosks, ${criticalCount} critical, ${warningCount} warnings`);
  }

  /**
   * Analyze metrics for a specific kiosk
   */
  async analyzeKioskMetrics(kioskId: string, config: MonitoringConfig): Promise<MonitoringMetrics> {
    const windowStart = new Date(Date.now() - 60 * 60 * 1000); // Last hour
    
    // Get assignment metrics
    const metricsResult = await this.db.query(`
      SELECT 
        COUNT(*) as total_assignments,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_assignments,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_assignments,
        AVG(duration_ms) as avg_duration,
        MAX(assignment_time) as last_assignment_time
      FROM assignment_metrics 
      WHERE kiosk_id = ? AND assignment_time >= ?
    `, [kioskId, windowStart.toISOString()]);
    
    // Get consecutive failures
    const failureResult = await this.db.query(`
      SELECT COUNT(*) as consecutive_failures
      FROM (
        SELECT success, ROW_NUMBER() OVER (ORDER BY assignment_time DESC) as rn
        FROM assignment_metrics 
        WHERE kiosk_id = ? AND assignment_time >= ?
        ORDER BY assignment_time DESC
        LIMIT 10
      ) recent
      WHERE success = 0 AND rn <= (
        SELECT MIN(rn) FROM (
          SELECT success, ROW_NUMBER() OVER (ORDER BY assignment_time DESC) as rn
          FROM assignment_metrics 
          WHERE kiosk_id = ? AND assignment_time >= ?
          ORDER BY assignment_time DESC
          LIMIT 10
        ) WHERE success = 1
      )
    `, [kioskId, windowStart.toISOString(), kioskId, windowStart.toISOString()]);
    
    // Get last failure time
    const lastFailureResult = await this.db.query(`
      SELECT assignment_time as last_failure_time
      FROM assignment_metrics 
      WHERE kiosk_id = ? AND success = 0
      ORDER BY assignment_time DESC
      LIMIT 1
    `, [kioskId]);
    
    const metrics = metricsResult[0] || {};
    const failure = failureResult[0] || {};
    const lastFailure = lastFailureResult[0] || {};
    
    const totalAssignments = metrics.total_assignments || 0;
    const successfulAssignments = metrics.successful_assignments || 0;
    const failedAssignments = metrics.failed_assignments || 0;
    const averageResponseTime = metrics.avg_duration || 0;
    const consecutiveFailures = failure.consecutive_failures || 0;
    
    const successRate = totalAssignments > 0 ? successfulAssignments / totalAssignments : 1.0;
    const failureRate = totalAssignments > 0 ? failedAssignments / totalAssignments : 0.0;
    
    // Determine alert level and recommended action
    let alertLevel: 'none' | 'warning' | 'critical' = 'none';
    let recommendedAction: 'continue' | 'monitor' | 'rollback' = 'continue';
    
    if (totalAssignments >= config.criticalThresholds.minSampleSize) {
      if (successRate < config.criticalThresholds.minSuccessRate ||
          failureRate > config.criticalThresholds.maxFailureRate ||
          averageResponseTime > config.criticalThresholds.maxResponseTimeMs ||
          consecutiveFailures >= config.alertThresholds.maxConsecutiveFailures) {
        alertLevel = 'critical';
        recommendedAction = 'rollback';
      } else if (successRate < config.alertThresholds.warningSuccessRate) {
        alertLevel = 'warning';
        recommendedAction = 'monitor';
      }
    } else if (totalAssignments > 0 && successRate < config.alertThresholds.criticalSuccessRate) {
      alertLevel = 'warning';
      recommendedAction = 'monitor';
    }
    
    return {
      kioskId,
      timestamp: new Date(),
      successRate,
      failureRate,
      averageResponseTime,
      totalAssignments,
      consecutiveFailures,
      lastFailureTime: lastFailure.last_failure_time ? new Date(lastFailure.last_failure_time) : undefined,
      alertLevel,
      recommendedAction
    };
  }

  /**
   * Store monitoring metrics in database
   */
  async storeMonitoringMetrics(metrics: MonitoringMetrics): Promise<void> {
    await this.db.query(`
      INSERT INTO monitoring_metrics (
        kiosk_id, timestamp, success_rate, failure_rate, avg_response_time,
        total_assignments, consecutive_failures, last_failure_time,
        alert_level, recommended_action
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      metrics.kioskId,
      metrics.timestamp.toISOString(),
      metrics.successRate,
      metrics.failureRate,
      metrics.averageResponseTime,
      metrics.totalAssignments,
      metrics.consecutiveFailures,
      metrics.lastFailureTime?.toISOString(),
      metrics.alertLevel,
      metrics.recommendedAction
    ]);
  }

  /**
   * Execute automated rollback for a kiosk
   */
  async executeAutomatedRollback(
    kioskId: string, 
    metrics: MonitoringMetrics, 
    config: MonitoringConfig
  ): Promise<void> {
    const reasons = [];
    
    if (metrics.successRate < config.criticalThresholds.minSuccessRate) {
      reasons.push(`Low success rate: ${(metrics.successRate * 100).toFixed(1)}%`);
    }
    
    if (metrics.failureRate > config.criticalThresholds.maxFailureRate) {
      reasons.push(`High failure rate: ${(metrics.failureRate * 100).toFixed(1)}%`);
    }
    
    if (metrics.averageResponseTime > config.criticalThresholds.maxResponseTimeMs) {
      reasons.push(`Slow response time: ${Math.round(metrics.averageResponseTime)}ms`);
    }
    
    if (metrics.consecutiveFailures >= config.alertThresholds.maxConsecutiveFailures) {
      reasons.push(`Consecutive failures: ${metrics.consecutiveFailures}`);
    }
    
    const reason = `Automated rollback: ${reasons.join(', ')}`;
    
    console.log(`Executing automated rollback for kiosk ${kioskId}: ${reason}`);
    
    try {
      await this.rolloutManager.disableKiosk(kioskId, 'automated-monitor', reason);
      
      // Log rollback event
      await this.db.query(`
        INSERT INTO rollout_events (kiosk_id, event_type, event_data, triggered_by)
        VALUES (?, ?, ?, ?)
      `, [
        kioskId,
        'automated_rollback',
        JSON.stringify({
          metrics,
          reasons,
          config: config.criticalThresholds
        }),
        'automated-monitor'
      ]);
      
      console.log(`Automated rollback completed for kiosk ${kioskId}`);
      
    } catch (error) {
      console.error(`Failed to execute automated rollback for kiosk ${kioskId}:`, error);
      
      // Create alert for rollback failure
      await this.alertManager.triggerAlert('rollback_failure', {
        kioskId,
        error: error.message,
        metrics,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Generate alerts based on monitoring metrics
   */
  async generateAlertsForMetrics(metrics: MonitoringMetrics, config: MonitoringConfig): Promise<void> {
    if (metrics.alertLevel === 'none') {
      return;
    }
    
    const alertType = metrics.alertLevel === 'critical' ? 'performance_critical' : 'performance_warning';
    const severity = metrics.alertLevel === 'critical' ? 'critical' : 'medium';
    
    await this.alertManager.triggerAlert(alertType, {
      kioskId: metrics.kioskId,
      successRate: metrics.successRate,
      failureRate: metrics.failureRate,
      averageResponseTime: metrics.averageResponseTime,
      consecutiveFailures: metrics.consecutiveFailures,
      recommendedAction: metrics.recommendedAction,
      timestamp: metrics.timestamp.toISOString()
    });
  }

  /**
   * Get monitoring status
   */
  getMonitoringStatus(): {
    isRunning: boolean;
    startTime?: Date;
    lastCheckTime?: Date;
    monitoredKiosks: number;
  } {
    return {
      isRunning: this.isRunning,
      startTime: this.monitoringInterval ? new Date() : undefined,
      lastCheckTime: new Date(), // This would be tracked in real implementation
      monitoredKiosks: 0 // This would be tracked in real implementation
    };
  }

  /**
   * Get recent monitoring metrics for a kiosk
   */
  async getKioskMonitoringHistory(
    kioskId: string, 
    hours: number = 24
  ): Promise<MonitoringMetrics[]> {
    const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const results = await this.db.query(`
      SELECT * FROM monitoring_metrics 
      WHERE kiosk_id = ? AND timestamp >= ?
      ORDER BY timestamp DESC
    `, [kioskId, windowStart.toISOString()]);
    
    return results.map(row => ({
      kioskId: row.kiosk_id,
      timestamp: new Date(row.timestamp),
      successRate: row.success_rate,
      failureRate: row.failure_rate,
      averageResponseTime: row.avg_response_time,
      totalAssignments: row.total_assignments,
      consecutiveFailures: row.consecutive_failures,
      lastFailureTime: row.last_failure_time ? new Date(row.last_failure_time) : undefined,
      alertLevel: row.alert_level,
      recommendedAction: row.recommended_action
    }));
  }

  /**
   * Update monitoring configuration
   */
  async updateMonitoringConfig(config: Partial<MonitoringConfig>): Promise<void> {
    // Store config in database
    await this.db.query(`
      INSERT OR REPLACE INTO monitoring_config (
        key, value, updated_at
      ) VALUES (?, ?, ?)
    `, ['automated_rollback_config', JSON.stringify(config), new Date().toISOString()]);
    
    console.log('Monitoring configuration updated:', config);
  }
}