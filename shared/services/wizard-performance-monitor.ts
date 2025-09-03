/**
 * Hardware Configuration Wizard - Performance Monitoring Service
 * 
 * Implements comprehensive performance monitoring, metrics collection, and optimization
 * recommendations for wizard operations.
 * 
 * Requirements: 10.4, 10.5, 10.6
 */

import { EventEmitter } from 'events';
import { Database } from 'sqlite3';
import { promisify } from 'util';

export interface WizardPerformanceMetrics {
  // Operation timing metrics
  deviceScanTime: number[];
  addressConfigTime: number[];
  hardwareTestTime: number[];
  systemIntegrationTime: number[];
  totalWizardTime: number[];

  // Success rates
  deviceDetectionSuccessRate: number;
  addressConfigSuccessRate: number;
  hardwareTestSuccessRate: number;
  wizardCompletionRate: number;

  // Resource usage
  memoryUsage: number[];
  cpuUsage: number[];
  networkLatency: number[];

  // User experience metrics
  stepNavigationTime: number[];
  userWaitTime: number[];
  errorRecoveryTime: number[];
}

export interface WizardOperationMetric {
  operationId: string;
  operationType: 'device_scan' | 'address_config' | 'hardware_test' | 'system_integration' | 'full_wizard';
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  errorMessage?: string;
  metadata?: any;
}

export interface PerformanceAlert {
  id: string;
  type: 'warning' | 'error' | 'critical';
  metric: string;
  threshold: number;
  currentValue: number;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface OptimizationRecommendation {
  id: string;
  category: 'performance' | 'reliability' | 'user_experience';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  implementation: string;
  estimatedImprovement: string;
  timestamp: number;
}

export interface ResourceUsageSnapshot {
  timestamp: number;
  memoryUsage: {
    used: number;
    free: number;
    total: number;
    percentage: number;
  };
  cpuUsage: {
    user: number;
    system: number;
    idle: number;
    percentage: number;
  };
  networkStats: {
    latency: number;
    throughput: number;
    errors: number;
  };
}

/**
 * Performance monitoring service for hardware wizard operations
 */
export class WizardPerformanceMonitor extends EventEmitter {
  private db: Database;
  private dbRun: (sql: string, params?: any[]) => Promise<any>;
  private dbGet: (sql: string, params?: any[]) => Promise<any>;
  private dbAll: (sql: string, params?: any[]) => Promise<any[]>;
  
  private activeOperations = new Map<string, WizardOperationMetric>();
  private performanceAlerts = new Map<string, PerformanceAlert>();
  private recommendations = new Map<string, OptimizationRecommendation>();
  
  private monitoringInterval: NodeJS.Timeout;
  private alertCheckInterval: NodeJS.Timeout;
  
  // Performance thresholds
  private thresholds = {
    deviceScanTime: 30000, // 30 seconds
    addressConfigTime: 10000, // 10 seconds
    hardwareTestTime: 15000, // 15 seconds
    systemIntegrationTime: 20000, // 20 seconds
    totalWizardTime: 300000, // 5 minutes
    memoryUsagePercent: 80, // 80%
    cpuUsagePercent: 90, // 90%
    networkLatency: 2000, // 2 seconds
    errorRate: 5 // 5%
  };

  constructor(database: Database) {
    super();
    this.db = database;
    this.dbRun = promisify(this.db.run.bind(this.db));
    this.dbGet = promisify(this.db.get.bind(this.db));
    this.dbAll = promisify(this.db.all.bind(this.db));
    
    // Start monitoring intervals
    this.monitoringInterval = setInterval(() => this.collectResourceMetrics(), 10000); // Every 10 seconds
    this.alertCheckInterval = setInterval(() => this.checkPerformanceAlerts(), 30000); // Every 30 seconds
  }

  /**
   * Initialize performance monitoring tables
   */
  async initialize(): Promise<void> {
    await this.createTables();
    console.log('📊 Wizard Performance Monitor initialized');
  }

  /**
   * Create performance monitoring tables
   */
  private async createTables(): Promise<void> {
    // Wizard operation metrics table
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS wizard_operation_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT UNIQUE NOT NULL,
        operation_type TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration_ms INTEGER,
        success BOOLEAN NOT NULL DEFAULT 0,
        error_message TEXT,
        metadata TEXT, -- JSON
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CHECK (operation_type IN ('device_scan', 'address_config', 'hardware_test', 'system_integration', 'full_wizard'))
      )
    `);

    // Performance alerts table
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS wizard_performance_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_id TEXT UNIQUE NOT NULL,
        alert_type TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        threshold_value REAL NOT NULL,
        current_value REAL NOT NULL,
        message TEXT NOT NULL,
        acknowledged BOOLEAN NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        acknowledged_at DATETIME,
        CHECK (alert_type IN ('warning', 'error', 'critical'))
      )
    `);

    // Resource usage snapshots table
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS wizard_resource_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        memory_used INTEGER NOT NULL,
        memory_total INTEGER NOT NULL,
        cpu_percentage REAL NOT NULL,
        network_latency INTEGER,
        active_operations INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Optimization recommendations table
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS wizard_optimization_recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recommendation_id TEXT UNIQUE NOT NULL,
        category TEXT NOT NULL,
        priority TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        impact TEXT NOT NULL,
        implementation TEXT NOT NULL,
        estimated_improvement TEXT NOT NULL,
        implemented BOOLEAN NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        implemented_at DATETIME,
        CHECK (category IN ('performance', 'reliability', 'user_experience')),
        CHECK (priority IN ('low', 'medium', 'high', 'critical'))
      )
    `);

    // Create indexes for performance
    await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_wizard_operations_type_time ON wizard_operation_metrics(operation_type, start_time)`);
    await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_wizard_operations_success ON wizard_operation_metrics(success)`);
    await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_wizard_alerts_type ON wizard_performance_alerts(alert_type, acknowledged)`);
    await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_wizard_resources_timestamp ON wizard_resource_snapshots(timestamp)`);
    await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_wizard_recommendations_priority ON wizard_optimization_recommendations(priority, implemented)`);
  }

  /**
   * Start tracking a wizard operation
   */
  startOperation(
    operationId: string, 
    operationType: 'device_scan' | 'address_config' | 'hardware_test' | 'system_integration' | 'full_wizard',
    metadata?: any
  ): void {
    const metric: WizardOperationMetric = {
      operationId,
      operationType,
      startTime: Date.now(),
      success: false,
      metadata
    };

    this.activeOperations.set(operationId, metric);
    
    // Store in database
    this.dbRun(`
      INSERT INTO wizard_operation_metrics (operation_id, operation_type, start_time, metadata)
      VALUES (?, ?, ?, ?)
    `, [operationId, operationType, metric.startTime, JSON.stringify(metadata || {})]);

    this.emit('operationStarted', metric);
  }

  /**
   * Complete tracking a wizard operation
   */
  completeOperation(operationId: string, success: boolean, errorMessage?: string): void {
    const metric = this.activeOperations.get(operationId);
    if (!metric) {
      console.warn(`⚠️ Operation ${operationId} not found in active operations`);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - metric.startTime;

    metric.endTime = endTime;
    metric.duration = duration;
    metric.success = success;
    metric.errorMessage = errorMessage;

    // Update database
    this.dbRun(`
      UPDATE wizard_operation_metrics 
      SET end_time = ?, duration_ms = ?, success = ?, error_message = ?
      WHERE operation_id = ?
    `, [endTime, duration, success, errorMessage, operationId]);

    // Check if operation exceeded thresholds
    this.checkOperationThresholds(metric);

    // Remove from active operations
    this.activeOperations.delete(operationId);

    this.emit('operationCompleted', metric);
  }

  /**
   * Record resource usage snapshot
   */
  async recordResourceUsage(snapshot: ResourceUsageSnapshot): Promise<void> {
    await this.dbRun(`
      INSERT INTO wizard_resource_snapshots 
      (timestamp, memory_used, memory_total, cpu_percentage, network_latency, active_operations)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      snapshot.timestamp,
      snapshot.memoryUsage.used,
      snapshot.memoryUsage.total,
      snapshot.cpuUsage.percentage,
      snapshot.networkStats.latency,
      this.activeOperations.size
    ]);

    // Check resource thresholds
    this.checkResourceThresholds(snapshot);
  }

  /**
   * Get current performance metrics
   */
  async getCurrentMetrics(periodHours: number = 24): Promise<WizardPerformanceMetrics> {
    const since = Date.now() - (periodHours * 60 * 60 * 1000);

    // Get operation timing metrics
    const operations = await this.dbAll(`
      SELECT operation_type, duration_ms, success 
      FROM wizard_operation_metrics 
      WHERE start_time >= ? AND end_time IS NOT NULL
    `, [since]);

    const deviceScanTime = operations
      .filter(op => op.operation_type === 'device_scan' && op.success)
      .map(op => op.duration_ms);

    const addressConfigTime = operations
      .filter(op => op.operation_type === 'address_config' && op.success)
      .map(op => op.duration_ms);

    const hardwareTestTime = operations
      .filter(op => op.operation_type === 'hardware_test' && op.success)
      .map(op => op.duration_ms);

    const systemIntegrationTime = operations
      .filter(op => op.operation_type === 'system_integration' && op.success)
      .map(op => op.duration_ms);

    const totalWizardTime = operations
      .filter(op => op.operation_type === 'full_wizard' && op.success)
      .map(op => op.duration_ms);

    // Calculate success rates
    const deviceDetectionOps = operations.filter(op => op.operation_type === 'device_scan');
    const deviceDetectionSuccessRate = deviceDetectionOps.length > 0 ? 
      (deviceDetectionOps.filter(op => op.success).length / deviceDetectionOps.length) * 100 : 100;

    const addressConfigOps = operations.filter(op => op.operation_type === 'address_config');
    const addressConfigSuccessRate = addressConfigOps.length > 0 ? 
      (addressConfigOps.filter(op => op.success).length / addressConfigOps.length) * 100 : 100;

    const hardwareTestOps = operations.filter(op => op.operation_type === 'hardware_test');
    const hardwareTestSuccessRate = hardwareTestOps.length > 0 ? 
      (hardwareTestOps.filter(op => op.success).length / hardwareTestOps.length) * 100 : 100;

    const wizardCompletionOps = operations.filter(op => op.operation_type === 'full_wizard');
    const wizardCompletionRate = wizardCompletionOps.length > 0 ? 
      (wizardCompletionOps.filter(op => op.success).length / wizardCompletionOps.length) * 100 : 100;

    // Get resource usage metrics
    const resourceSnapshots = await this.dbAll(`
      SELECT memory_used, memory_total, cpu_percentage, network_latency
      FROM wizard_resource_snapshots 
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT 100
    `, [since]);

    const memoryUsage = resourceSnapshots.map(s => (s.memory_used / s.memory_total) * 100);
    const cpuUsage = resourceSnapshots.map(s => s.cpu_percentage);
    const networkLatency = resourceSnapshots.map(s => s.network_latency).filter(l => l !== null);

    return {
      deviceScanTime,
      addressConfigTime,
      hardwareTestTime,
      systemIntegrationTime,
      totalWizardTime,
      deviceDetectionSuccessRate,
      addressConfigSuccessRate,
      hardwareTestSuccessRate,
      wizardCompletionRate,
      memoryUsage,
      cpuUsage,
      networkLatency,
      stepNavigationTime: [], // Would be populated from UI metrics
      userWaitTime: [], // Would be populated from UI metrics
      errorRecoveryTime: [] // Would be populated from error handling metrics
    };
  }

  /**
   * Generate optimization recommendations
   */
  async generateRecommendations(): Promise<OptimizationRecommendation[]> {
    const metrics = await this.getCurrentMetrics(24);
    const recommendations: OptimizationRecommendation[] = [];

    // Check device scan performance
    if (metrics.deviceScanTime.length > 0) {
      const avgScanTime = metrics.deviceScanTime.reduce((a, b) => a + b, 0) / metrics.deviceScanTime.length;
      if (avgScanTime > this.thresholds.deviceScanTime * 0.8) {
        recommendations.push({
          id: `device-scan-optimization-${Date.now()}`,
          category: 'performance',
          priority: 'high',
          title: 'Optimize Device Scanning Performance',
          description: `Average device scan time is ${(avgScanTime / 1000).toFixed(1)}s, approaching the ${this.thresholds.deviceScanTime / 1000}s threshold.`,
          impact: 'Reduces user wait time during hardware detection phase',
          implementation: 'Implement parallel port scanning and cache frequently scanned ports',
          estimatedImprovement: '40-60% reduction in scan time',
          timestamp: Date.now()
        });
      }
    }

    // Check memory usage
    if (metrics.memoryUsage.length > 0) {
      const avgMemoryUsage = metrics.memoryUsage.reduce((a, b) => a + b, 0) / metrics.memoryUsage.length;
      if (avgMemoryUsage > this.thresholds.memoryUsagePercent * 0.8) {
        recommendations.push({
          id: `memory-optimization-${Date.now()}`,
          category: 'performance',
          priority: 'medium',
          title: 'Optimize Memory Usage',
          description: `Average memory usage is ${avgMemoryUsage.toFixed(1)}%, approaching the ${this.thresholds.memoryUsagePercent}% threshold.`,
          impact: 'Prevents system slowdown and improves overall responsiveness',
          implementation: 'Implement more aggressive cache cleanup and reduce object retention',
          estimatedImprovement: '20-30% reduction in memory usage',
          timestamp: Date.now()
        });
      }
    }

    // Check success rates
    if (metrics.wizardCompletionRate < 95) {
      recommendations.push({
        id: `completion-rate-improvement-${Date.now()}`,
        category: 'reliability',
        priority: 'critical',
        title: 'Improve Wizard Completion Rate',
        description: `Wizard completion rate is ${metrics.wizardCompletionRate.toFixed(1)}%, below the 95% target.`,
        impact: 'Reduces user frustration and support requests',
        implementation: 'Enhance error handling, add more recovery options, and improve user guidance',
        estimatedImprovement: 'Increase completion rate to 98%+',
        timestamp: Date.now()
      });
    }

    // Store recommendations in database
    for (const rec of recommendations) {
      await this.dbRun(`
        INSERT OR IGNORE INTO wizard_optimization_recommendations 
        (recommendation_id, category, priority, title, description, impact, implementation, estimated_improvement)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [rec.id, rec.category, rec.priority, rec.title, rec.description, rec.impact, rec.implementation, rec.estimatedImprovement]);
      
      this.recommendations.set(rec.id, rec);
    }

    return recommendations;
  }

  /**
   * Check operation performance thresholds
   */
  private checkOperationThresholds(metric: WizardOperationMetric): void {
    if (!metric.duration || !metric.success) return;

    const thresholdKey = `${metric.operationType}Time` as keyof typeof this.thresholds;
    const threshold = this.thresholds[thresholdKey];

    if (threshold && metric.duration > threshold) {
      this.createAlert(
        `${metric.operationType}-slow-${Date.now()}`,
        'warning',
        metric.operationType,
        threshold,
        metric.duration,
        `${metric.operationType} operation took ${metric.duration}ms, exceeding ${threshold}ms threshold`
      );
    }
  }

  /**
   * Check resource usage thresholds
   */
  private checkResourceThresholds(snapshot: ResourceUsageSnapshot): void {
    // Check memory usage
    if (snapshot.memoryUsage.percentage > this.thresholds.memoryUsagePercent) {
      this.createAlert(
        `memory-high-${Date.now()}`,
        'warning',
        'memory_usage',
        this.thresholds.memoryUsagePercent,
        snapshot.memoryUsage.percentage,
        `Memory usage is ${snapshot.memoryUsage.percentage.toFixed(1)}%, exceeding ${this.thresholds.memoryUsagePercent}% threshold`
      );
    }

    // Check CPU usage
    if (snapshot.cpuUsage.percentage > this.thresholds.cpuUsagePercent) {
      this.createAlert(
        `cpu-high-${Date.now()}`,
        'error',
        'cpu_usage',
        this.thresholds.cpuUsagePercent,
        snapshot.cpuUsage.percentage,
        `CPU usage is ${snapshot.cpuUsage.percentage.toFixed(1)}%, exceeding ${this.thresholds.cpuUsagePercent}% threshold`
      );
    }

    // Check network latency
    if (snapshot.networkStats.latency > this.thresholds.networkLatency) {
      this.createAlert(
        `network-slow-${Date.now()}`,
        'warning',
        'network_latency',
        this.thresholds.networkLatency,
        snapshot.networkStats.latency,
        `Network latency is ${snapshot.networkStats.latency}ms, exceeding ${this.thresholds.networkLatency}ms threshold`
      );
    }
  }

  /**
   * Create performance alert
   */
  private async createAlert(
    alertId: string,
    type: 'warning' | 'error' | 'critical',
    metric: string,
    threshold: number,
    currentValue: number,
    message: string
  ): Promise<void> {
    const alert: PerformanceAlert = {
      id: alertId,
      type,
      metric,
      threshold,
      currentValue,
      message,
      timestamp: Date.now(),
      acknowledged: false
    };

    this.performanceAlerts.set(alertId, alert);

    // Store in database
    await this.dbRun(`
      INSERT OR IGNORE INTO wizard_performance_alerts 
      (alert_id, alert_type, metric_name, threshold_value, current_value, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [alertId, type, metric, threshold, currentValue, message]);

    this.emit('performanceAlert', alert);
    console.warn(`⚠️ Performance Alert [${type.toUpperCase()}]: ${message}`);
  }

  /**
   * Collect resource metrics
   */
  private async collectResourceMetrics(): Promise<void> {
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Calculate CPU percentage (simplified)
      const totalCpuTime = cpuUsage.user + cpuUsage.system;
      const cpuPercentage = Math.min((totalCpuTime / 1000000) / 10, 100); // Rough estimate

      const snapshot: ResourceUsageSnapshot = {
        timestamp: Date.now(),
        memoryUsage: {
          used: memoryUsage.heapUsed,
          free: memoryUsage.heapTotal - memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
        },
        cpuUsage: {
          user: cpuUsage.user,
          system: cpuUsage.system,
          idle: 0, // Not available in Node.js
          percentage: cpuPercentage
        },
        networkStats: {
          latency: 0, // Would be measured from actual network operations
          throughput: 0,
          errors: 0
        }
      };

      await this.recordResourceUsage(snapshot);
    } catch (error) {
      console.error('Error collecting resource metrics:', error);
    }
  }

  /**
   * Check for performance alerts
   */
  private async checkPerformanceAlerts(): Promise<void> {
    // Generate recommendations if we have enough data
    const metrics = await this.getCurrentMetrics(1); // Last hour
    if (metrics.deviceScanTime.length > 0 || metrics.memoryUsage.length > 0) {
      await this.generateRecommendations();
    }
  }

  /**
   * Get active performance alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.performanceAlerts.values()).filter(alert => !alert.acknowledged);
  }

  /**
   * Acknowledge performance alert
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    const alert = this.performanceAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      await this.dbRun(`
        UPDATE wizard_performance_alerts 
        SET acknowledged = 1, acknowledged_at = CURRENT_TIMESTAMP
        WHERE alert_id = ?
      `, [alertId]);
      
      this.emit('alertAcknowledged', alert);
    }
  }

  /**
   * Get optimization recommendations
   */
  getRecommendations(): OptimizationRecommendation[] {
    return Array.from(this.recommendations.values());
  }

  /**
   * Mark recommendation as implemented
   */
  async implementRecommendation(recommendationId: string): Promise<void> {
    const recommendation = this.recommendations.get(recommendationId);
    if (recommendation) {
      await this.dbRun(`
        UPDATE wizard_optimization_recommendations 
        SET implemented = 1, implemented_at = CURRENT_TIMESTAMP
        WHERE recommendation_id = ?
      `, [recommendationId]);
      
      this.emit('recommendationImplemented', recommendation);
    }
  }

  /**
   * Cleanup old performance data
   */
  async cleanup(retentionDays: number = 30): Promise<void> {
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    await this.dbRun(`DELETE FROM wizard_operation_metrics WHERE start_time < ?`, [cutoff]);
    await this.dbRun(`DELETE FROM wizard_performance_alerts WHERE created_at < datetime(?, 'unixepoch')`, [cutoff / 1000]);
    await this.dbRun(`DELETE FROM wizard_resource_snapshots WHERE timestamp < ?`, [cutoff]);
    
    console.log(`🧹 Cleaned up wizard performance data older than ${retentionDays} days`);
  }

  /**
   * Shutdown performance monitor
   */
  shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
    }
    
    this.emit('shutdown');
    console.log('✅ Wizard Performance Monitor shutdown complete');
  }
}