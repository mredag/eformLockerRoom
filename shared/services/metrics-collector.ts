/**
 * Metrics Collector Service
 * 
 * Collects and aggregates real-time metrics for the dashboard
 * Integrates with AlertManager and PerformanceMonitor
 */

import { Database } from 'sqlite3';
import { EventEmitter } from 'events';
import { AlertManager, AlertType } from './alert-manager';
import { PerformanceMonitor } from './performance-monitor';

export interface RealTimeMetrics {
  timestamp: Date;
  kioskId: string;
  
  // Performance metrics
  avgOpenTime: number;
  errorRate: number;
  sessionsPerHour: number;
  uiLatency: number;
  
  // Alert metrics
  activeAlerts: number;
  alertsByType: Record<AlertType, number>;
  
  // System health
  systemHealth: number; // 0-100 score
  
  // Capacity metrics
  freeRatio: number;
  totalLockers: number;
  availableLockers: number;
  
  // Usage metrics
  operationsPerMinute: number;
  successRate: number;
}

export interface MetricThreshold {
  metric: string;
  warningThreshold: number;
  criticalThreshold: number;
  unit: string;
  direction: 'above' | 'below'; // Whether threshold is exceeded above or below value
}

export interface MetricAlert {
  metric: string;
  currentValue: number;
  threshold: number;
  severity: 'warning' | 'critical';
  message: string;
  timestamp: Date;
}

export class MetricsCollector extends EventEmitter {
  private db: Database;
  private alertManager: AlertManager;
  private performanceMonitor: PerformanceMonitor;
  private collectionInterval: NodeJS.Timeout | null = null;
  private metricsCache: Map<string, RealTimeMetrics> = new Map();
  private logger: any;

  // Default thresholds for metrics
  private readonly defaultThresholds: MetricThreshold[] = [
    { metric: 'avgOpenTime', warningThreshold: 2000, criticalThreshold: 5000, unit: 'ms', direction: 'above' },
    { metric: 'errorRate', warningThreshold: 2, criticalThreshold: 5, unit: '%', direction: 'above' },
    { metric: 'uiLatency', warningThreshold: 2000, criticalThreshold: 5000, unit: 'ms', direction: 'above' },
    { metric: 'systemHealth', warningThreshold: 80, criticalThreshold: 60, unit: '%', direction: 'below' },
    { metric: 'freeRatio', warningThreshold: 0.2, criticalThreshold: 0.1, unit: '%', direction: 'below' },
    { metric: 'successRate', warningThreshold: 95, criticalThreshold: 90, unit: '%', direction: 'below' }
  ];

  constructor(database: Database, alertManager: AlertManager, performanceMonitor: PerformanceMonitor, logger?: any) {
    super();
    this.db = database;
    this.alertManager = alertManager;
    this.performanceMonitor = performanceMonitor;
    this.logger = logger || console;
  }

  /**
   * Start collecting metrics at regular intervals
   */
  startCollection(intervalSeconds: number = 30): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }

    this.collectionInterval = setInterval(async () => {
      try {
        await this.collectAllMetrics();
      } catch (error) {
        this.logger.error('Error collecting metrics:', error);
      }
    }, intervalSeconds * 1000);

    this.logger.info(`📊 Metrics collection started (interval: ${intervalSeconds}s)`);
  }

  /**
   * Stop collecting metrics
   */
  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
    this.logger.info('📊 Metrics collection stopped');
  }

  /**
   * Collect metrics for all kiosks
   */
  async collectAllMetrics(): Promise<void> {
    const kiosks = await this.getActiveKiosks();
    
    for (const kioskId of kiosks) {
      try {
        const metrics = await this.collectKioskMetrics(kioskId);
        this.metricsCache.set(kioskId, metrics);
        
        // Check thresholds and emit alerts
        const alerts = this.checkThresholds(metrics);
        if (alerts.length > 0) {
          this.emit('metricAlerts', { kioskId, alerts });
        }
        
        // Emit metrics update
        this.emit('metricsUpdate', { kioskId, metrics });
      } catch (error) {
        this.logger.error(`Error collecting metrics for kiosk ${kioskId}:`, error);
      }
    }
  }

  /**
   * Collect metrics for a specific kiosk
   */
  async collectKioskMetrics(kioskId: string): Promise<RealTimeMetrics> {
    const now = new Date();
    
    // Get performance metrics (last hour)
    const performanceMetrics = await this.performanceMonitor.getCurrentMetrics(kioskId, 1);
    
    // Get alert metrics
    const activeAlertsResponse = await this.alertManager.getAlerts(kioskId, 'active', 1, 100);
    const activeAlerts = activeAlertsResponse.total;
    
    // Count alerts by type
    const alertsByType: Record<AlertType, number> = {
      no_stock: 0,
      conflict_rate: 0,
      open_fail_rate: 0,
      retry_rate: 0,
      overdue_share: 0
    };
    
    activeAlertsResponse.alerts.forEach(alert => {
      if (alertsByType.hasOwnProperty(alert.type)) {
        alertsByType[alert.type as AlertType]++;
      }
    });

    // Calculate performance metrics
    const avgOpenTime = performanceMetrics.timeToOpen.length > 0 
      ? Math.round(performanceMetrics.timeToOpen.reduce((a, b) => a + b, 0) / performanceMetrics.timeToOpen.length)
      : 0;

    const uiLatency = performanceMetrics.uiUpdateLatency.length > 0
      ? Math.round(performanceMetrics.uiUpdateLatency.reduce((a, b) => a + b, 0) / performanceMetrics.uiUpdateLatency.length)
      : 0;

    // Get capacity metrics
    const capacityMetrics = await this.getCapacityMetrics(kioskId);
    
    // Get usage metrics (last 10 minutes)
    const usageMetrics = await this.getUsageMetrics(kioskId, 10);
    
    // Calculate system health score
    const systemHealth = this.calculateSystemHealth({
      avgOpenTime,
      errorRate: performanceMetrics.errorRate,
      activeAlerts,
      freeRatio: capacityMetrics.freeRatio,
      successRate: usageMetrics.successRate
    });

    return {
      timestamp: now,
      kioskId,
      avgOpenTime,
      errorRate: performanceMetrics.errorRate,
      sessionsPerHour: performanceMetrics.sessionsPerHour,
      uiLatency,
      activeAlerts,
      alertsByType,
      systemHealth,
      freeRatio: capacityMetrics.freeRatio,
      totalLockers: capacityMetrics.totalLockers,
      availableLockers: capacityMetrics.availableLockers,
      operationsPerMinute: usageMetrics.operationsPerMinute,
      successRate: usageMetrics.successRate
    };
  }

  /**
   * Get current metrics from cache
   */
  getCurrentMetrics(kioskId: string): RealTimeMetrics | null {
    return this.metricsCache.get(kioskId) || null;
  }

  /**
   * Get metrics for all kiosks
   */
  getAllCurrentMetrics(): Map<string, RealTimeMetrics> {
    return new Map(this.metricsCache);
  }

  /**
   * Record a metric event for real-time tracking
   */
  async recordMetricEvent(kioskId: string, eventType: string, value: number, success: boolean = true): Promise<void> {
    try {
      // Record in alert manager for threshold monitoring
      await this.alertManager.recordMetric(kioskId, eventType, value, success ? 1 : 0);
      
      // Record in performance monitor if it's a performance event
      if (eventType.includes('open_time') || eventType.includes('ui_latency')) {
        await this.performanceMonitor.recordUIPerformance(
          kioskId,
          eventType as any,
          value,
          success
        );
      }
      
      // Emit real-time event
      this.emit('metricEvent', {
        kioskId,
        eventType,
        value,
        success,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error('Error recording metric event:', error);
    }
  }

  /**
   * Check metric thresholds and generate alerts
   */
  private checkThresholds(metrics: RealTimeMetrics): MetricAlert[] {
    const alerts: MetricAlert[] = [];
    
    for (const threshold of this.defaultThresholds) {
      const currentValue = this.getMetricValue(metrics, threshold.metric);
      if (currentValue === null) continue;
      
      const { severity, exceeded } = this.evaluateThreshold(currentValue, threshold);
      
      if (exceeded) {
        alerts.push({
          metric: threshold.metric,
          currentValue,
          threshold: severity === 'critical' ? threshold.criticalThreshold : threshold.warningThreshold,
          severity,
          message: this.generateThresholdMessage(threshold.metric, currentValue, threshold),
          timestamp: new Date()
        });
      }
    }
    
    return alerts;
  }

  /**
   * Get metric value by name
   */
  private getMetricValue(metrics: RealTimeMetrics, metricName: string): number | null {
    switch (metricName) {
      case 'avgOpenTime': return metrics.avgOpenTime;
      case 'errorRate': return metrics.errorRate;
      case 'uiLatency': return metrics.uiLatency;
      case 'systemHealth': return metrics.systemHealth;
      case 'freeRatio': return metrics.freeRatio * 100; // Convert to percentage
      case 'successRate': return metrics.successRate;
      default: return null;
    }
  }

  /**
   * Evaluate if a threshold is exceeded
   */
  private evaluateThreshold(value: number, threshold: MetricThreshold): { severity: 'warning' | 'critical' | null, exceeded: boolean } {
    const { warningThreshold, criticalThreshold, direction } = threshold;
    
    if (direction === 'above') {
      if (value >= criticalThreshold) return { severity: 'critical', exceeded: true };
      if (value >= warningThreshold) return { severity: 'warning', exceeded: true };
    } else {
      if (value <= criticalThreshold) return { severity: 'critical', exceeded: true };
      if (value <= warningThreshold) return { severity: 'warning', exceeded: true };
    }
    
    return { severity: null, exceeded: false };
  }

  /**
   * Generate threshold alert message
   */
  private generateThresholdMessage(metric: string, value: number, threshold: MetricThreshold): string {
    const metricNames: Record<string, string> = {
      avgOpenTime: 'Ortalama açılma süresi',
      errorRate: 'Hata oranı',
      uiLatency: 'UI gecikme süresi',
      systemHealth: 'Sistem sağlığı',
      freeRatio: 'Boş dolap oranı',
      successRate: 'Başarı oranı'
    };
    
    const metricName = metricNames[metric] || metric;
    const formattedValue = threshold.unit === '%' ? `${value.toFixed(1)}%` : `${value}${threshold.unit}`;
    const formattedThreshold = threshold.unit === '%' ? `${threshold.warningThreshold}%` : `${threshold.warningThreshold}${threshold.unit}`;
    
    return `${metricName} eşiği aşıldı: ${formattedValue} (eşik: ${formattedThreshold})`;
  }

  /**
   * Calculate overall system health score
   */
  private calculateSystemHealth(metrics: {
    avgOpenTime: number;
    errorRate: number;
    activeAlerts: number;
    freeRatio: number;
    successRate: number;
  }): number {
    let score = 100;
    
    // Deduct points for performance issues
    if (metrics.avgOpenTime > 2000) score -= Math.min(20, (metrics.avgOpenTime - 2000) / 100);
    if (metrics.errorRate > 2) score -= Math.min(25, (metrics.errorRate - 2) * 5);
    if (metrics.activeAlerts > 0) score -= Math.min(15, metrics.activeAlerts * 5);
    if (metrics.freeRatio < 0.2) score -= Math.min(20, (0.2 - metrics.freeRatio) * 100);
    if (metrics.successRate < 95) score -= Math.min(20, (95 - metrics.successRate));
    
    return Math.max(0, Math.round(score));
  }

  /**
   * Get active kiosks from database
   */
  private async getActiveKiosks(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT DISTINCT kiosk_id 
        FROM lockers 
        ORDER BY kiosk_id
      `, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows.map(row => row.kiosk_id));
      });
    });
  }

  /**
   * Get capacity metrics for a kiosk
   */
  private async getCapacityMetrics(kioskId: string): Promise<{
    totalLockers: number;
    availableLockers: number;
    freeRatio: number;
  }> {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'Free' THEN 1 END) as available
        FROM lockers 
        WHERE kiosk_id = ?
      `, [kioskId], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        
        const row = rows[0] || { total: 0, available: 0 };
        const totalLockers = row.total;
        const availableLockers = row.available;
        const freeRatio = totalLockers > 0 ? availableLockers / totalLockers : 0;
        
        resolve({
          totalLockers,
          availableLockers,
          freeRatio
        });
      });
    });
  }

  /**
   * Get usage metrics for a kiosk
   */
  private async getUsageMetrics(kioskId: string, periodMinutes: number): Promise<{
    operationsPerMinute: number;
    successRate: number;
  }> {
    return new Promise((resolve, reject) => {
      const since = new Date(Date.now() - periodMinutes * 60 * 1000).toISOString();
      
      this.db.all(`
        SELECT 
          COUNT(*) as total_operations,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_operations
        FROM command_queue 
        WHERE kiosk_id = ? AND created_at >= ?
      `, [kioskId, since], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        
        const row = rows[0] || { total_operations: 0, successful_operations: 0 };
        const operationsPerMinute = row.total_operations / periodMinutes;
        const successRate = row.total_operations > 0 
          ? (row.successful_operations / row.total_operations) * 100 
          : 100;
        
        resolve({
          operationsPerMinute,
          successRate
        });
      });
    });
  }

  /**
   * Cleanup resources
   */
  shutdown(): void {
    this.stopCollection();
    this.metricsCache.clear();
    this.removeAllListeners();
    this.logger.info('📊 MetricsCollector shutdown complete');
  }
}