import { Database } from 'sqlite3';
import { EventEmitter } from 'events';
import { ConfigurationManager } from './configuration-manager';

export interface Alert {
  id: string;
  type: AlertType;
  kioskId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  data: AlertData;
  status: 'active' | 'cleared';
  triggeredAt: Date;
  clearedAt?: Date;
  autoClearCondition?: string;
}

export type AlertType = 'no_stock' | 'conflict_rate' | 'open_fail_rate' | 'retry_rate' | 'overdue_share';

export interface AlertData {
  [key: string]: any;
  threshold?: number;
  actualValue?: number;
  windowMinutes?: number;
  eventCount?: number;
}

export interface AlertMetric {
  id?: number;
  kioskId: string;
  metricType: string;
  metricValue: number;
  eventCount: number;
  timestamp: Date;
  createdAt: Date;
}

export interface AlertListResponse {
  alerts: Alert[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface AlertErrorResponse {
  error: string;
  code: string;
  details?: any;
}

export class AlertManager extends EventEmitter {
  private db: Database;
  private configManager: ConfigurationManager;
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertClearTimers: Map<string, NodeJS.Timeout> = new Map();
  private logger: any;

  constructor(database: Database, configManager?: ConfigurationManager, logger?: any) {
    super();
    this.db = database;
    this.configManager = configManager || new ConfigurationManager();
    this.logger = logger || console;
    this.loadActiveAlerts();
  }

  /**
   * Load active alerts from database on startup
   */
  private async loadActiveAlerts(): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id, type, kiosk_id, severity, message, data, status,
               triggered_at, cleared_at, auto_clear_condition
        FROM alerts 
        WHERE status = 'active'
        ORDER BY triggered_at DESC
      `;

      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          this.logger.error('Failed to load active alerts:', err);
          reject(err);
          return;
        }

        rows.forEach(row => {
          const alert: Alert = {
            id: row.id,
            type: row.type as AlertType,
            kioskId: row.kiosk_id,
            severity: row.severity as Alert['severity'],
            message: row.message,
            data: JSON.parse(row.data || '{}'),
            status: row.status as Alert['status'],
            triggeredAt: new Date(row.triggered_at),
            clearedAt: row.cleared_at ? new Date(row.cleared_at) : undefined,
            autoClearCondition: row.auto_clear_condition
          };

          this.activeAlerts.set(alert.id, alert);
        });

        this.logger.info(`Loaded ${this.activeAlerts.size} active alerts`);
        resolve();
      });
    });
  }

  /**
   * Get alerts with pagination and filtering
   */
  async getAlerts(kioskId?: string, status?: string, page: number = 1, limit: number = 50): Promise<AlertListResponse> {
    return new Promise((resolve, reject) => {
      const offset = (page - 1) * limit;
      let whereClause = '';
      const params: any[] = [];

      const conditions: string[] = [];
      if (kioskId) {
        conditions.push('kiosk_id = ?');
        params.push(kioskId);
      }
      if (status) {
        conditions.push('status = ?');
        params.push(status);
      }

      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM alerts ${whereClause}`;
      this.db.get(countQuery, params, (err, countRow: any) => {
        if (err) {
          reject(err);
          return;
        }

        const total = countRow.total;

        // Get paginated results
        const dataQuery = `
          SELECT id, type, kiosk_id, severity, message, data, status,
                 triggered_at, cleared_at, auto_clear_condition
          FROM alerts 
          ${whereClause}
          ORDER BY triggered_at DESC 
          LIMIT ? OFFSET ?
        `;

        this.db.all(dataQuery, [...params, limit, offset], (err, rows: any[]) => {
          if (err) {
            reject(err);
            return;
          }

          const alerts: Alert[] = rows.map(row => ({
            id: row.id,
            type: row.type as AlertType,
            kioskId: row.kiosk_id,
            severity: row.severity as Alert['severity'],
            message: row.message,
            data: JSON.parse(row.data || '{}'),
            status: row.status as Alert['status'],
            triggeredAt: new Date(row.triggered_at),
            clearedAt: row.cleared_at ? new Date(row.cleared_at) : undefined,
            autoClearCondition: row.auto_clear_condition
          }));

          resolve({
            alerts,
            total,
            page,
            limit,
            hasMore: offset + alerts.length < total
          });
        });
      });
    });
  }

  /**
   * Get alert history with pagination
   */
  async getAlertHistory(kioskId?: string, page: number = 1, limit: number = 50): Promise<AlertListResponse> {
    return this.getAlerts(kioskId, undefined, page, limit);
  }

  /**
   * Trigger a new alert with single alert per breach enforcement
   */
  async triggerAlert(type: AlertType, data: AlertData): Promise<void> {
    const kioskId = data.kioskId || 'global';
    
    // Enforce single alert per breach - check if alert already exists for this type and kiosk
    let existingAlert: Alert | undefined;
    this.activeAlerts.forEach(alert => {
      if (alert.type === type && alert.kioskId === kioskId && alert.status === 'active') {
        existingAlert = alert;
      }
    });

    if (existingAlert) {
      return; // Single alert per breach - don't create duplicate
    }

    const alertId = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const severity = this.calculateSeverity(type, data);
    const message = this.generateAlertMessage(type, data);

    const alert: Alert = {
      id: alertId,
      type,
      kioskId,
      severity,
      message,
      data: this.sanitizeAlertData(data), // Remove PII
      status: 'active',
      triggeredAt: new Date(),
      autoClearCondition: await this.generateAutoClearCondition(type, kioskId)
    };

    // Store in database
    await this.persistAlert(alert);
    
    // Store in memory
    this.activeAlerts.set(alertId, alert);

    // Log alert trigger with exact format
    this.logger.info(`Alert triggered: type=${type}, severity=${severity}.`);

    // Set up auto-clear timer with hysteresis
    await this.setupAutoClearTimer(alert);

    // Emit event for admin interface
    this.emit('alertTriggered', alert);
  }

  /**
   * Clear an alert
   */
  async clearAlert(alertId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    const clearedAt = new Date();
    
    // Update database
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE alerts 
        SET status = 'cleared', cleared_at = ? 
        WHERE id = ?
      `;

      this.db.run(query, [clearedAt.toISOString(), alertId], (err) => {
        if (err) {
          this.logger.error('Failed to clear alert in database:', err);
          reject(err);
          return;
        }

        // Update memory
        alert.status = 'cleared';
        alert.clearedAt = clearedAt;
        this.activeAlerts.delete(alertId);

        // Clear auto-clear timer
        const timer = this.alertClearTimers.get(alertId);
        if (timer) {
          clearTimeout(timer);
          this.alertClearTimers.delete(alertId);
        }

        // Emit event for admin interface
        this.emit('alertCleared', alert);
        
        resolve();
      });
    });
  }

  /**
   * Monitor no stock events with hysteresis
   * Trigger: >3 events/10min, Clear: <2 events/10min after 20min
   */
  async monitorNoStock(kioskId: string): Promise<void> {
    const triggerThreshold = 3; // >3 events per spec
    const triggerWindow = 10; // 10 minutes per spec
    
    const windowStart = new Date(Date.now() - triggerWindow * 60 * 1000);
    const eventCount = await this.getEventCount(kioskId, 'no_stock_events', windowStart);

    if (eventCount > triggerThreshold) {
      await this.triggerAlert('no_stock', {
        kioskId,
        threshold: triggerThreshold,
        actualValue: eventCount,
        windowMinutes: triggerWindow,
        eventCount
      });
    }
  }

  /**
   * Monitor conflict rate with hysteresis
   * Trigger: >2%/5min, Clear: <1%/10min
   */
  async monitorConflictRate(kioskId: string): Promise<void> {
    const triggerThreshold = 0.02; // >2% per spec
    const triggerWindow = 5; // 5 minutes per spec
    
    const windowStart = new Date(Date.now() - triggerWindow * 60 * 1000);
    const rate = await this.getMetricRate(kioskId, 'conflict_rate', windowStart);

    if (rate > triggerThreshold) {
      await this.triggerAlert('conflict_rate', {
        kioskId,
        threshold: triggerThreshold,
        actualValue: rate,
        windowMinutes: triggerWindow
      });
    }
  }

  /**
   * Monitor open failure rate with hysteresis
   * Trigger: >1%/10min, Clear: <0.5%/20min
   */
  async monitorOpenFailRate(kioskId: string): Promise<void> {
    const triggerThreshold = 0.01; // >1% per spec
    const triggerWindow = 10; // 10 minutes per spec
    
    const windowStart = new Date(Date.now() - triggerWindow * 60 * 1000);
    const rate = await this.getMetricRate(kioskId, 'open_fail_rate', windowStart);

    if (rate > triggerThreshold) {
      await this.triggerAlert('open_fail_rate', {
        kioskId,
        threshold: triggerThreshold,
        actualValue: rate,
        windowMinutes: triggerWindow
      });
    }
  }

  /**
   * Monitor retry rate with hysteresis
   * Trigger: >5%/5min, Clear: <3%/10min
   */
  async monitorRetryRate(kioskId: string): Promise<void> {
    const triggerThreshold = 0.05; // >5% per spec
    const triggerWindow = 5; // 5 minutes per spec
    
    const windowStart = new Date(Date.now() - triggerWindow * 60 * 1000);
    const rate = await this.getMetricRate(kioskId, 'retry_rate', windowStart);

    if (rate > triggerThreshold) {
      await this.triggerAlert('retry_rate', {
        kioskId,
        threshold: triggerThreshold,
        actualValue: rate,
        windowMinutes: triggerWindow
      });
    }
  }

  /**
   * Monitor overdue share with hysteresis
   * Trigger: ≥20%/10min, Clear: <10%/20min
   */
  async monitorOverdueShare(kioskId: string): Promise<void> {
    const triggerThreshold = 0.20; // ≥20% per spec
    const triggerWindow = 10; // 10 minutes per spec
    
    const windowStart = new Date(Date.now() - triggerWindow * 60 * 1000);
    const share = await this.getMetricRate(kioskId, 'overdue_share', windowStart);

    if (share >= triggerThreshold) {
      await this.triggerAlert('overdue_share', {
        kioskId,
        threshold: triggerThreshold,
        actualValue: share,
        windowMinutes: triggerWindow
      });
    }
  }

  /**
   * Record a metric event for threshold monitoring
   */
  async recordMetric(kioskId: string, metricType: string, value: number, eventCount: number = 1): Promise<void> {
    const now = new Date();
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO alert_metrics (kiosk_id, metric_type, metric_value, event_count, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `;

      this.db.run(query, [
        kioskId,
        metricType,
        value,
        eventCount,
        now.toISOString()
      ], (err) => {
        if (err) {
          this.logger.error('Failed to record metric:', err);
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Start monitoring for a specific kiosk
   */
  startMonitoring(kioskId: string, intervalSeconds: number = 60): void {
    const existingInterval = this.monitoringIntervals.get(kioskId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const interval = setInterval(async () => {
      try {
        await Promise.all([
          this.monitorNoStock(kioskId),
          this.monitorConflictRate(kioskId),
          this.monitorOpenFailRate(kioskId),
          this.monitorRetryRate(kioskId),
          this.monitorOverdueShare(kioskId)
        ]);
      } catch (error) {
        this.logger.error(`Error monitoring alerts for kiosk ${kioskId}:`, error);
      }
    }, intervalSeconds * 1000);

    this.monitoringIntervals.set(kioskId, interval);
    this.logger.info(`Started alert monitoring for kiosk ${kioskId} (interval: ${intervalSeconds}s)`);
  }

  /**
   * Stop monitoring for a specific kiosk
   */
  stopMonitoring(kioskId: string): void {
    const interval = this.monitoringIntervals.get(kioskId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(kioskId);
      this.logger.info(`Stopped alert monitoring for kiosk ${kioskId}`);
    }
  }

  /**
   * Cleanup old alert records
   */
  async cleanupOldAlerts(retentionDays: number = 30): Promise<void> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    
    return new Promise((resolve, reject) => {
      const queries = [
        'DELETE FROM alerts WHERE triggered_at < ?',
        'DELETE FROM alert_metrics WHERE created_at < ?'
      ];

      let completed = 0;
      const cutoffIso = cutoffDate.toISOString();

      queries.forEach(query => {
        this.db.run(query, [cutoffIso], (err) => {
          if (err) {
            this.logger.error('Failed to cleanup old alerts:', err);
            reject(err);
            return;
          }

          completed++;
          if (completed === queries.length) {
            this.logger.info(`Cleaned up alerts older than ${retentionDays} days`);
            resolve();
          }
        });
      });
    });
  }

  // Private helper methods

  private async persistAlert(alert: Alert): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO alerts (id, type, kiosk_id, severity, message, data, status, triggered_at, auto_clear_condition)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(query, [
        alert.id,
        alert.type,
        alert.kioskId,
        alert.severity,
        alert.message,
        JSON.stringify(alert.data),
        alert.status,
        alert.triggeredAt.toISOString(),
        alert.autoClearCondition
      ], (err) => {
        if (err) {
          this.logger.error('Failed to persist alert:', err);
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  private calculateSeverity(type: AlertType, data: AlertData): Alert['severity'] {
    const actualValue = data.actualValue || 0;
    const threshold = data.threshold || 0;

    if (actualValue >= threshold * 2) return 'critical';
    if (actualValue >= threshold * 1.5) return 'high';
    if (actualValue >= threshold * 1.2) return 'medium';
    return 'low';
  }

  private generateAlertMessage(type: AlertType, data: AlertData): string {
    const threshold = data.threshold || 0;
    const actualValue = data.actualValue || 0;
    const windowMinutes = data.windowMinutes || 0;

    switch (type) {
      case 'no_stock':
        return `No stock events exceeded threshold: ${actualValue} events in ${windowMinutes} minutes (threshold: ${threshold})`;
      case 'conflict_rate':
        return `Assignment conflict rate exceeded: ${(actualValue * 100).toFixed(1)}% in ${windowMinutes} minutes (threshold: ${(threshold * 100).toFixed(1)}%)`;
      case 'open_fail_rate':
        return `Locker open failure rate exceeded: ${(actualValue * 100).toFixed(1)}% in ${windowMinutes} minutes (threshold: ${(threshold * 100).toFixed(1)}%)`;
      case 'retry_rate':
        return `Retry rate exceeded: ${(actualValue * 100).toFixed(1)}% in ${windowMinutes} minutes (threshold: ${(threshold * 100).toFixed(1)}%)`;
      case 'overdue_share':
        return `Overdue locker share exceeded: ${(actualValue * 100).toFixed(1)}% in ${windowMinutes} minutes (threshold: ${(threshold * 100).toFixed(1)}%)`;
      default:
        return `Alert triggered for ${type}`;
    }
  }

  private async generateAutoClearCondition(type: AlertType, kioskId: string): Promise<string> {
    switch (type) {
      case 'no_stock':
        return `<2 events in 10 minutes after 20 minutes`;
      case 'conflict_rate':
        return `<1.0% in 10 minutes`;
      case 'open_fail_rate':
        return `<0.5% in 20 minutes`;
      case 'retry_rate':
        return `<3.0% in 10 minutes`;
      case 'overdue_share':
        return `<10.0% in 20 minutes`;
      default:
        return 'Manual clear required';
    }
  }

  /**
   * Format clear condition message for logging
   */
  private formatClearCondition(type: AlertType, currentValue: number, threshold: number, windowMinutes: number): string {
    switch (type) {
      case 'no_stock':
        return `${currentValue} events < ${threshold} events in ${windowMinutes} minutes`;
      case 'conflict_rate':
        return `${(currentValue * 100).toFixed(1)}% < ${(threshold * 100).toFixed(1)}% in ${windowMinutes} minutes`;
      case 'open_fail_rate':
        return `${(currentValue * 100).toFixed(1)}% < ${(threshold * 100).toFixed(1)}% in ${windowMinutes} minutes`;
      case 'retry_rate':
        return `${(currentValue * 100).toFixed(1)}% < ${(threshold * 100).toFixed(1)}% in ${windowMinutes} minutes`;
      case 'overdue_share':
        return `${(currentValue * 100).toFixed(1)}% < ${(threshold * 100).toFixed(1)}% in ${windowMinutes} minutes`;
      default:
        return 'condition met';
    }
  }

  private async setupAutoClearTimer(alert: Alert): Promise<void> {
    // Implement hysteresis with exact auto-clear windows as per spec
    let clearCheckInterval: number;
    let clearThreshold: number;
    let clearWindow: number;
    let waitTime: number = 0;

    switch (alert.type) {
      case 'no_stock':
        // Clear: <2 events/10min after 20min
        clearThreshold = 2;
        clearWindow = 10;
        waitTime = 20 * 60 * 1000; // 20 minutes wait
        clearCheckInterval = 60 * 1000; // Check every minute
        break;
      case 'conflict_rate':
        // Clear: <1%/10min
        clearThreshold = 0.01;
        clearWindow = 10;
        clearCheckInterval = 60 * 1000;
        break;
      case 'open_fail_rate':
        // Clear: <0.5%/20min
        clearThreshold = 0.005;
        clearWindow = 20;
        clearCheckInterval = 60 * 1000;
        break;
      case 'retry_rate':
        // Clear: <3%/10min
        clearThreshold = 0.03;
        clearWindow = 10;
        clearCheckInterval = 60 * 1000;
        break;
      case 'overdue_share':
        // Clear: <10%/20min
        clearThreshold = 0.10;
        clearWindow = 20;
        clearCheckInterval = 60 * 1000;
        break;
      default:
        return;
    }

    // Set up timer to check auto-clear condition
    const checkAutoClear = async () => {
      try {
        const windowStart = new Date(Date.now() - clearWindow * 60 * 1000);
        let currentValue: number;

        if (alert.type === 'no_stock') {
          currentValue = await this.getEventCount(alert.kioskId, 'no_stock_events', windowStart);
        } else {
          currentValue = await this.getMetricRate(alert.kioskId, alert.type, windowStart);
        }

        const waitTimeElapsed = waitTime === 0 || 
          (Date.now() - alert.triggeredAt.getTime()) >= waitTime;

        if (currentValue < clearThreshold && waitTimeElapsed) {
          // Log alert clear with exact format as required
          this.logger.info(`Alert cleared: type=${alert.type}, condition=${this.formatClearCondition(alert.type, currentValue, clearThreshold, clearWindow)}`);
          await this.clearAlert(alert.id);
        } else {
          // Schedule next check
          const timer = setTimeout(checkAutoClear, clearCheckInterval);
          this.alertClearTimers.set(alert.id, timer);
        }
      } catch (error) {
        this.logger.error(`Error checking auto-clear for alert ${alert.id}:`, error);
      }
    };

    // Start checking after initial wait time
    const initialTimer = setTimeout(checkAutoClear, waitTime || clearCheckInterval);
    this.alertClearTimers.set(alert.id, initialTimer);
  }

  private async getEventCount(kioskId: string, metricType: string, windowStart: Date): Promise<number> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT COALESCE(SUM(event_count), 0) as total_count
        FROM alert_metrics 
        WHERE kiosk_id = ? AND metric_type = ? AND timestamp >= ?
      `;

      this.db.get(query, [kioskId, metricType, windowStart.toISOString()], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row?.total_count || 0);
      });
    });
  }

  private async getMetricRate(kioskId: string, metricType: string, windowStart: Date): Promise<number> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT AVG(metric_value) as avg_rate
        FROM alert_metrics 
        WHERE kiosk_id = ? AND metric_type = ? AND timestamp >= ?
      `;

      this.db.get(query, [kioskId, metricType, windowStart.toISOString()], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row?.avg_rate || 0);
      });
    });
  }

  private sanitizeAlertData(data: AlertData): AlertData {
    // Remove PII - never log card ids, seeds, or raw payloads
    const sanitized = { ...data };
    
    // Remove common PII fields
    delete sanitized.cardId;
    delete sanitized.rfidCard;
    delete sanitized.seed;
    delete sanitized.payload;
    delete sanitized.rawData;
    delete sanitized.userKey;
    delete sanitized.ownerKey;
    
    return sanitized;
  }

  /**
   * Shutdown the alert manager with proper cleanup
   */
  shutdown(): void {
    // Clear all monitoring intervals
    this.monitoringIntervals.forEach((interval, kioskId) => {
      clearInterval(interval);
    });
    this.monitoringIntervals.clear();
    
    // Clear all auto-clear timers
    this.alertClearTimers.forEach((timer, alertId) => {
      clearTimeout(timer);
    });
    this.alertClearTimers.clear();
    
    // Remove all listeners
    this.removeAllListeners();
    
    this.logger.info('AlertManager shutdown complete');
  }
}