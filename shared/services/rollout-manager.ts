import { DatabaseManager } from '../database/database-manager';
import { ConfigurationManager } from './configuration-manager';
import { AlertManager } from './alert-manager';

export interface RolloutStatus {
  kioskId: string;
  enabled: boolean;
  enabledAt?: Date;
  enabledBy?: string;
  rollbackAt?: Date;
  rollbackBy?: string;
  rollbackReason?: string;
  phase: 'disabled' | 'enabled' | 'monitoring' | 'rolled_back';
  metrics?: RolloutMetrics;
}

export interface RolloutMetrics {
  totalAssignments: number;
  successfulAssignments: number;
  failedAssignments: number;
  noStockEvents: number;
  retryEvents: number;
  conflictEvents: number;
  averageAssignmentTime: number;
  successRate: number;
  lastUpdated: Date;
}

export interface RolloutDecision {
  kioskId: string;
  recommendation: 'enable' | 'disable' | 'monitor' | 'rollback';
  confidence: number;
  reasons: string[];
  metrics: RolloutMetrics;
  thresholds: RolloutThresholds;
}

export interface RolloutThresholds {
  minSuccessRate: number; // 0.95 (95%)
  maxNoStockRate: number; // 0.05 (5%)
  maxRetryRate: number; // 0.10 (10%)
  maxConflictRate: number; // 0.02 (2%)
  maxAssignmentTimeMs: number; // 2000ms
  minSampleSize: number; // 50 assignments
}

export class RolloutManager {
  private db: DatabaseManager;
  private configManager: ConfigurationManager;
  private alertManager: AlertManager;
  private defaultThresholds: RolloutThresholds;

  constructor(
    db: DatabaseManager,
    configManager: ConfigurationManager,
    alertManager: AlertManager
  ) {
    this.db = db;
    this.configManager = configManager;
    this.alertManager = alertManager;
    
    this.defaultThresholds = {
      minSuccessRate: 0.90,
      maxNoStockRate: 0.05,
      maxRetryRate: 0.10,
      maxConflictRate: 0.02,
      maxAssignmentTimeMs: 2000,
      minSampleSize: 50
    };
  }

  /**
   * Load thresholds from database configuration
   */
  async loadThresholds(kioskId?: string): Promise<RolloutThresholds> {
    try {
      // Try to get kiosk-specific thresholds first
      let thresholds = null;
      if (kioskId) {
        const kioskThresholds = await this.db.query(`
          SELECT * FROM rollout_thresholds WHERE kiosk_id = ?
        `, [kioskId]);
        if (kioskThresholds.length > 0) {
          thresholds = kioskThresholds[0];
        }
      }
      
      // Fall back to global thresholds
      if (!thresholds) {
        const globalThresholds = await this.db.query(`
          SELECT * FROM rollout_thresholds WHERE kiosk_id IS NULL
        `);
        if (globalThresholds.length > 0) {
          thresholds = globalThresholds[0];
        }
      }
      
      if (thresholds) {
        return {
          minSuccessRate: thresholds.min_success_rate,
          maxNoStockRate: thresholds.max_no_stock_rate,
          maxRetryRate: thresholds.max_retry_rate,
          maxConflictRate: thresholds.max_conflict_rate,
          maxAssignmentTimeMs: thresholds.max_assignment_time_ms,
          minSampleSize: thresholds.min_sample_size
        };
      }
    } catch (error) {
      console.error('Error loading thresholds from database:', error);
    }
    
    return this.defaultThresholds;
  }

  /**
   * Enable smart assignment for a specific kiosk
   */
  async enableKiosk(kioskId: string, enabledBy: string, reason?: string): Promise<void> {
    const timestamp = new Date();
    
    // Update feature flag for this kiosk
    await this.configManager.setKioskOverride(kioskId, 'smart_assignment_enabled', true);
    
    // Record rollout status
    await this.db.query(`
      INSERT OR REPLACE INTO rollout_status (
        kiosk_id, enabled, enabled_at, enabled_by, phase, reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [kioskId, 1, timestamp, enabledBy, 'enabled', reason, timestamp, timestamp]);
    
    // Log the rollout action
    console.log(`Rollout enabled: kiosk=${kioskId}.`);
    
    // Create alert for monitoring
    await this.alertManager.triggerAlert('rollout_enabled', {
      kioskId,
      enabledBy,
      timestamp: timestamp.toISOString(),
      reason
    });
  }

  /**
   * Disable smart assignment for a specific kiosk (rollback)
   */
  async disableKiosk(kioskId: string, disabledBy: string, reason: string): Promise<void> {
    const timestamp = new Date();
    
    // Update feature flag for this kiosk
    await this.configManager.setKioskOverride(kioskId, 'smart_assignment_enabled', false);
    
    // Update rollout status
    await this.db.query(`
      UPDATE rollout_status 
      SET enabled = ?, rollback_at = ?, rollback_by = ?, rollback_reason = ?, 
          phase = ?, updated_at = ?
      WHERE kiosk_id = ?
    `, [0, timestamp, disabledBy, reason, 'rolled_back', timestamp, kioskId]);
    
    // Log the rollback action
    console.log(`Rollout disabled: kiosk=${kioskId}, reason=${reason}.`);
    
    // Create alert for rollback
    await this.alertManager.triggerAlert('rollout_disabled', {
      kioskId,
      disabledBy,
      reason,
      timestamp: timestamp.toISOString()
    });
  }

  /**
   * Emergency disable across all kiosks
   */
  async emergencyDisableAll(disabledBy: string, reason: string): Promise<void> {
    const timestamp = new Date();
    
    // Execute in transaction for consistency
    await this.db.query('BEGIN TRANSACTION');
    
    try {
      // Get all enabled kiosks
      const enabledKiosks = await this.db.query(`
        SELECT kiosk_id FROM rollout_status WHERE enabled = 1
      `);
      
      // Disable globally first
      await this.configManager.updateGlobalConfig({
        smart_assignment_enabled: false
      });
      
      // Disable each kiosk individually
      for (const kiosk of enabledKiosks) {
        await this.disableKiosk(kiosk.kiosk_id, disabledBy, `EMERGENCY: ${reason}`);
      }
      
      // Log and audit in same transaction
      await this.db.query(`
        INSERT INTO rollout_events (kiosk_id, event_type, event_data, triggered_by)
        VALUES (?, ?, ?, ?)
      `, [
        null, // Global event
        'emergency_disable',
        JSON.stringify({
          reason,
          kioskCount: enabledKiosks.length,
          timestamp: timestamp.toISOString()
        }),
        disabledBy
      ]);
      
      await this.db.query('COMMIT');
      
      console.log(`Emergency disable executed.`);
      
      // Create critical alert after successful transaction
      await this.alertManager.triggerAlert('emergency_rollback', {
        disabledBy,
        reason,
        kioskCount: enabledKiosks.length,
        timestamp: timestamp.toISOString()
      });
      
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get rollout status for a specific kiosk
   */
  async getKioskStatus(kioskId: string): Promise<RolloutStatus | null> {
    const result = await this.db.query(`
      SELECT * FROM rollout_status WHERE kiosk_id = ?
    `, [kioskId]);
    
    if (result.length === 0) {
      return null;
    }
    
    const row = result[0];
    const metrics = await this.calculateMetrics(kioskId);
    
    return {
      kioskId: row.kiosk_id,
      enabled: row.enabled === 1,
      enabledAt: row.enabled_at ? new Date(row.enabled_at) : undefined,
      enabledBy: row.enabled_by,
      rollbackAt: row.rollback_at ? new Date(row.rollback_at) : undefined,
      rollbackBy: row.rollback_by,
      rollbackReason: row.rollback_reason,
      phase: row.phase,
      metrics
    };
  }

  /**
   * Get rollout status for all kiosks
   */
  async getAllKioskStatus(): Promise<RolloutStatus[]> {
    const results = await this.db.query(`
      SELECT * FROM rollout_status ORDER BY kiosk_id
    `);
    
    const statuses: RolloutStatus[] = [];
    
    for (const row of results) {
      const metrics = await this.calculateMetrics(row.kiosk_id);
      
      statuses.push({
        kioskId: row.kiosk_id,
        enabled: row.enabled === 1,
        enabledAt: row.enabled_at ? new Date(row.enabled_at) : undefined,
        enabledBy: row.enabled_by,
        rollbackAt: row.rollback_at ? new Date(row.rollback_at) : undefined,
        rollbackBy: row.rollback_by,
        rollbackReason: row.rollback_reason,
        phase: row.phase,
        metrics
      });
    }
    
    return statuses;
  }

  /**
   * Calculate rollout metrics for a kiosk
   */
  async calculateMetrics(kioskId: string, windowHours: number = 24): Promise<RolloutMetrics> {
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    
    // Get assignment metrics
    const assignmentResults = await this.db.query(`
      SELECT 
        COUNT(*) as total_assignments,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_assignments,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_assignments,
        SUM(CASE WHEN error_code = 'no_stock' THEN 1 ELSE 0 END) as no_stock_events,
        AVG(duration_ms) as avg_duration
      FROM assignment_metrics 
      WHERE kiosk_id = ? AND assignment_time >= ?
    `, [kioskId, windowStart.toISOString()]);
    
    // Get retry events
    const retryResults = await this.db.query(`
      SELECT COUNT(*) as retry_events
      FROM assignment_metrics 
      WHERE kiosk_id = ? AND assignment_time >= ? 
        AND (error_code LIKE '%retry%' OR action_type LIKE '%retry%')
    `, [kioskId, windowStart.toISOString()]);
    
    // Get conflict events
    const conflictResults = await this.db.query(`
      SELECT COUNT(*) as conflict_events
      FROM assignment_metrics 
      WHERE kiosk_id = ? AND assignment_time >= ? 
        AND error_code = 'assignment_conflict'
    `, [kioskId, windowStart.toISOString()]);
    
    const assignment = assignmentResults[0] || {};
    const retry = retryResults[0] || {};
    const conflict = conflictResults[0] || {};
    
    const totalAssignments = assignment.total_assignments || 0;
    const successfulAssignments = assignment.successful_assignments || 0;
    const failedAssignments = assignment.failed_assignments || 0;
    const noStockEvents = assignment.no_stock_events || 0;
    const retryEvents = retry.retry_events || 0;
    const conflictEvents = conflict.conflict_events || 0;
    const averageAssignmentTime = assignment.avg_duration || 0;
    
    return {
      totalAssignments,
      successfulAssignments,
      failedAssignments,
      noStockEvents,
      retryEvents,
      conflictEvents,
      averageAssignmentTime,
      successRate: totalAssignments > 0 ? successfulAssignments / totalAssignments : 0,
      lastUpdated: new Date()
    };
  }

  /**
   * Analyze rollout decision for a kiosk
   */
  async analyzeRolloutDecision(kioskId: string, customThresholds?: Partial<RolloutThresholds>): Promise<RolloutDecision> {
    const configThresholds = await this.loadThresholds(kioskId);
    const thresholds = { ...configThresholds, ...customThresholds };
    const metrics = await this.calculateMetrics(kioskId);
    const status = await this.getKioskStatus(kioskId);
    
    const reasons: string[] = [];
    let recommendation: 'enable' | 'disable' | 'monitor' | 'rollback' = 'monitor';
    let confidence = 0.5;
    
    // Check if we have enough data
    if (metrics.totalAssignments < thresholds.minSampleSize) {
      reasons.push(`Insufficient data: ${metrics.totalAssignments} < ${thresholds.minSampleSize} assignments`);
      recommendation = status?.enabled ? 'monitor' : 'disable';
      confidence = 0.3;
    } else {
      // Clamp metrics to valid ranges
      const clampedSuccessRate = Math.max(0, Math.min(1, metrics.successRate));
      const clampedNoStockRate = Math.max(0, Math.min(1, metrics.totalAssignments > 0 ? metrics.noStockEvents / metrics.totalAssignments : 0));
      const clampedRetryRate = Math.max(0, Math.min(1, metrics.totalAssignments > 0 ? metrics.retryEvents / metrics.totalAssignments : 0));
      const clampedConflictRate = Math.max(0, Math.min(1, metrics.totalAssignments > 0 ? metrics.conflictEvents / metrics.totalAssignments : 0));
      // Analyze success rate
      if (clampedSuccessRate < thresholds.minSuccessRate) {
        reasons.push(`Low success rate: ${(clampedSuccessRate * 100).toFixed(1)}% < ${(thresholds.minSuccessRate * 100).toFixed(1)}%`);
        recommendation = 'rollback';
        confidence = 0.9;
      }
      
      // Analyze no-stock rate
      if (clampedNoStockRate > thresholds.maxNoStockRate) {
        reasons.push(`High no-stock rate: ${(clampedNoStockRate * 100).toFixed(1)}% > ${(thresholds.maxNoStockRate * 100).toFixed(1)}%`);
        if (recommendation !== 'rollback') recommendation = 'monitor';
        confidence = Math.max(confidence, 0.7);
      }
      
      // Analyze retry rate
      if (clampedRetryRate > thresholds.maxRetryRate) {
        reasons.push(`High retry rate: ${(clampedRetryRate * 100).toFixed(1)}% > ${(thresholds.maxRetryRate * 100).toFixed(1)}%`);
        if (recommendation !== 'rollback') recommendation = 'monitor';
        confidence = Math.max(confidence, 0.6);
      }
      
      // Analyze conflict rate
      if (clampedConflictRate > thresholds.maxConflictRate) {
        reasons.push(`High conflict rate: ${(clampedConflictRate * 100).toFixed(1)}% > ${(thresholds.maxConflictRate * 100).toFixed(1)}%`);
        if (recommendation !== 'rollback') recommendation = 'monitor';
        confidence = Math.max(confidence, 0.8);
      }
      
      // Analyze assignment time
      if (metrics.averageAssignmentTime > thresholds.maxAssignmentTimeMs) {
        reasons.push(`Slow assignments: ${metrics.averageAssignmentTime.toFixed(0)}ms > ${thresholds.maxAssignmentTimeMs}ms`);
        if (recommendation !== 'rollback') recommendation = 'monitor';
        confidence = Math.max(confidence, 0.6);
      }
      
      // If all metrics are good
      if (reasons.length === 0) {
        reasons.push('All metrics within acceptable thresholds');
        recommendation = status?.enabled ? 'monitor' : 'enable';
        confidence = 0.9;
      }
    }
    
    return {
      kioskId,
      recommendation,
      confidence,
      reasons,
      metrics,
      thresholds
    };
  }

  /**
   * Check for automated rollback triggers
   */
  async checkAutomatedRollback(): Promise<void> {
    const enabledKiosks = await this.db.query(`
      SELECT kiosk_id FROM rollout_status WHERE enabled = 1 AND phase = 'enabled'
    `);
    
    for (const kiosk of enabledKiosks) {
      const decision = await this.analyzeRolloutDecision(kiosk.kiosk_id);
      
      // Trigger automated rollback if confidence is high and recommendation is rollback
      if (decision.recommendation === 'rollback' && decision.confidence >= 0.8) {
        console.log(`Automated rollback executed: kiosk=${kiosk.kiosk_id}.`);
        
        // Execute rollback in transaction with audit
        await this.db.query('BEGIN TRANSACTION');
        
        try {
          // Disable kiosk
          await this.disableKiosk(
            kiosk.kiosk_id,
            'automated-system',
            `Automated rollback: ${decision.reasons.join(', ')}`
          );
          
          // Write audit row
          await this.db.query(`
            INSERT INTO rollout_decisions (
              kiosk_id, recommendation, confidence, reasons, metrics, thresholds,
              acted_upon, acted_by, acted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            kiosk.kiosk_id,
            'rollback',
            decision.confidence,
            JSON.stringify(decision.reasons),
            JSON.stringify(decision.metrics),
            JSON.stringify(decision.thresholds),
            1,
            'automated-system',
            new Date().toISOString()
          ]);
          
          // Emit single event
          await this.db.query(`
            INSERT INTO rollout_events (kiosk_id, event_type, event_data, triggered_by)
            VALUES (?, ?, ?, ?)
          `, [
            kiosk.kiosk_id,
            'automated_rollback',
            JSON.stringify({
              confidence: decision.confidence,
              reasons: decision.reasons,
              metrics: decision.metrics
            }),
            'automated-system'
          ]);
          
          await this.db.query('COMMIT');
          
          // Create alert after successful transaction
          await this.alertManager.triggerAlert('automated_rollback', {
            kioskId: kiosk.kiosk_id,
            reasons: decision.reasons,
            confidence: decision.confidence,
            metrics: decision.metrics
          });
          
        } catch (error) {
          await this.db.query('ROLLBACK');
          throw error;
        }
      }
    }
  }

  /**
   * Get rollout summary statistics
   */
  async getRolloutSummary(): Promise<{
    totalKiosks: number;
    enabledKiosks: number;
    disabledKiosks: number;
    monitoringKiosks: number;
    rolledBackKiosks: number;
    overallSuccessRate: number;
    criticalIssues: number;
  }> {
    const summary = await this.db.query(`
      SELECT 
        COUNT(*) as total_kiosks,
        SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled_kiosks,
        SUM(CASE WHEN enabled = 0 AND phase != 'rolled_back' THEN 1 ELSE 0 END) as disabled_kiosks,
        SUM(CASE WHEN enabled = 1 AND phase = 'monitoring' THEN 1 ELSE 0 END) as monitoring_kiosks,
        SUM(CASE WHEN phase = 'rolled_back' THEN 1 ELSE 0 END) as rolled_back_kiosks
      FROM rollout_status
    `);
    
    // Calculate overall success rate
    const metricsResult = await this.db.query(`
      SELECT 
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as total_success,
        COUNT(*) as total_assignments
      FROM assignment_metrics 
      WHERE assignment_time >= datetime('now', '-24 hours')
    `);
    
    const criticalAlerts = await this.db.query(`
      SELECT COUNT(*) as critical_count
      FROM alerts 
      WHERE severity = 'critical' AND cleared_at IS NULL
    `);
    
    const row = summary[0] || {};
    const metrics = metricsResult[0] || {};
    const alerts = criticalAlerts[0] || {};
    
    return {
      totalKiosks: row.total_kiosks || 0,
      enabledKiosks: row.enabled_kiosks || 0,
      disabledKiosks: row.disabled_kiosks || 0,
      monitoringKiosks: row.monitoring_kiosks || 0,
      rolledBackKiosks: row.rolled_back_kiosks || 0,
      overallSuccessRate: metrics.total_assignments > 0 ? 
        (metrics.total_success || 0) / metrics.total_assignments : 0,
      criticalIssues: alerts.critical_count || 0
    };
  }
}