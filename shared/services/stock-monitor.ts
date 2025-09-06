import { DatabaseConnection } from '../database/connection';
import { ConfigurationManager } from './configuration-manager';
import { EventEmitter } from 'events';

export interface StockLevel {
  kioskId: string;
  totalLockers: number;
  freeLockers: number;
  ownedLockers: number;
  blockedLockers: number;
  errorLockers: number;
  vipLockers: number;
  freeRatio: number;
  category: 'high' | 'medium' | 'low';
  timestamp: Date;
}

export interface StockAlert {
  id: string;
  type: 'no_stock' | 'low_stock' | 'critical_stock';
  kioskId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  data: any;
  triggeredAt: Date;
  clearedAt?: Date;
  autoCleared: boolean;
}

export interface StockMetrics {
  kioskId: string;
  averageFreeRatio: number;
  minFreeRatio: number;
  maxFreeRatio: number;
  stockEvents: number;
  alertCount: number;
  lastUpdated: Date;
}

export interface StockBehaviorAdjustments {
  quarantineMinutes: number;
  hotWindowMinutes: number;
  reserveDisabled: boolean;
  assignmentRestricted: boolean;
}

export class StockMonitor extends EventEmitter {
  private db: DatabaseConnection;
  private configManager: ConfigurationManager;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastAlerts: Map<string, Date> = new Map();
  private isShuttingDown = false;

  constructor(db?: DatabaseConnection, configManager?: ConfigurationManager) {
    super();
    this.db = db || DatabaseConnection.getInstance();
    this.configManager = configManager || new ConfigurationManager(this.db);
    this.startMonitoring();
  }

  /**
   * Calculate free ratio for a specific kiosk
   * Requirements: 17.1 - Implement free_ratio calculation and tracking
   */
  async calculateFreeRatio(kioskId: string): Promise<number> {
    const stockLevel = await this.getStockLevel(kioskId);
    return stockLevel.freeRatio;
  }

  /**
   * Get current stock level for a kiosk
   * Requirements: 17.1, 17.2 - Free ratio calculation and stock level categorization
   */
  async getStockLevel(kioskId: string): Promise<StockLevel> {
    const config = await this.configManager.getEffectiveConfig(kioskId);
    const freeRatioLow = config.free_ratio_low || 0.1;
    const freeRatioHigh = config.free_ratio_high || 0.5;
    // Get locker counts by status
    const lockerCounts = await this.db.get<{
      total: number;
      free: number;
      owned: number;
      blocked: number;
      error: number;
      vip: number;
    }>(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Free' AND is_vip = 0 THEN 1 ELSE 0 END) as free,
        SUM(CASE WHEN status = 'Owned' THEN 1 ELSE 0 END) as owned,
        SUM(CASE WHEN status = 'Blocked' THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN status = 'Error' THEN 1 ELSE 0 END) as error,
        SUM(CASE WHEN is_vip = 1 THEN 1 ELSE 0 END) as vip
       FROM lockers 
       WHERE kiosk_id = ?`,
      [kioskId]
    );

    if (!lockerCounts || lockerCounts.total === 0) {
      throw new Error(`No lockers found for kiosk ${kioskId}`);
    }

    // Calculate free ratio (excluding VIP lockers from total available pool)
    const availablePool = lockerCounts.total - lockerCounts.vip;
    const freeRatio = availablePool > 0 ? lockerCounts.free / availablePool : 0;
    
    // Clamp free ratio to [0, 1] range
    const clampedFreeRatio = Math.max(0, Math.min(1, freeRatio));

    // Categorize stock level using configuration thresholds
    let category: 'high' | 'medium' | 'low';
    if (clampedFreeRatio >= freeRatioHigh) {
      category = 'high';
    } else if (clampedFreeRatio <= freeRatioLow) {
      category = 'low';
    } else {
      category = 'medium';
    }

    const stockLevel: StockLevel = {
      kioskId,
      totalLockers: lockerCounts.total,
      freeLockers: lockerCounts.free,
      ownedLockers: lockerCounts.owned,
      blockedLockers: lockerCounts.blocked,
      errorLockers: lockerCounts.error,
      vipLockers: lockerCounts.vip,
      freeRatio: clampedFreeRatio,
      category,
      timestamp: new Date()
    };

    // Log stock level as required
    console.log(`Stock level: ratio=${clampedFreeRatio.toFixed(3)}, category=${category}.`);

    return stockLevel;
  }

  /**
   * Get stock-based behavior adjustments
   * Requirements: 17.3 - Add stock-based behavior adjustments (quarantine, hot window, reserve)
   */
  async getStockBehaviorAdjustments(kioskId: string): Promise<StockBehaviorAdjustments> {
    const stockLevel = await this.getStockLevel(kioskId);
    const config = await this.configManager.getEffectiveConfig(kioskId);
    const freeRatio = stockLevel.freeRatio;

    // Use configuration values for thresholds
    const freeRatioLow = config.free_ratio_low || 0.1;
    const freeRatioHigh = config.free_ratio_high || 0.5;
    const quarantineMinFloor = config.quarantine_min_floor || 5;
    const quarantineMinCeiling = config.quarantine_min_ceiling || 20;
    const hotWindowMin = config.owner_hot_window_min || 10;
    const hotWindowMax = config.owner_hot_window_max || 30;

    // Calculate dynamic quarantine duration
    let quarantineMinutes: number;
    if (freeRatio >= freeRatioHigh) {
      quarantineMinutes = quarantineMinCeiling; // High capacity: maximum quarantine
    } else if (freeRatio <= freeRatioLow) {
      quarantineMinutes = quarantineMinFloor;  // Low capacity: minimum quarantine
    } else {
      // Linear interpolation between thresholds
      const ratio = (freeRatio - freeRatioLow) / (freeRatioHigh - freeRatioLow);
      quarantineMinutes = quarantineMinFloor + ratio * (quarantineMinCeiling - quarantineMinFloor);
    }

    // Calculate dynamic hot window duration
    // Rule: Linear from 10 min at free_ratio=0.10 to 30 min at 0.50; disabled at ≤0.10
    // This keeps 0.30 → 20 min and 0.333 → 22 min consistent with tests
    let hotWindowMinutes: number;
    if (freeRatio <= freeRatioLow) {
      hotWindowMinutes = 0; // Disabled when ≤ free_ratio_low (0.10)
    } else if (freeRatio >= freeRatioHigh) {
      hotWindowMinutes = hotWindowMax; // Maximum at ≥ free_ratio_high (0.50)
    } else {
      // Linear interpolation: 10 + ((ratio - 0.10) / (0.50 - 0.10)) * (30 - 10)
      const ratio = (freeRatio - freeRatioLow) / (freeRatioHigh - freeRatioLow);
      hotWindowMinutes = hotWindowMin + ratio * (hotWindowMax - hotWindowMin);
    }

    // Reserve capacity and assignment management
    const stockReserveDisableThreshold = config.stock_reserve_disable_threshold || 0.2;
    const stockAssignmentRestrictThreshold = config.stock_assignment_restrict_threshold || 0.05;
    
    const reserveDisabled = freeRatio <= stockReserveDisableThreshold;
    const assignmentRestricted = freeRatio <= stockAssignmentRestrictThreshold;

    return {
      quarantineMinutes: Math.round(quarantineMinutes),
      hotWindowMinutes: Math.round(hotWindowMinutes),
      reserveDisabled,
      assignmentRestricted
    };
  }

  /**
   * Check and trigger stock alerts
   * Requirements: 17.4 - Implement stock alerts and notifications
   */
  async checkStockAlerts(kioskId: string): Promise<StockAlert[]> {
    const stockLevel = await this.getStockLevel(kioskId);
    const config = await this.configManager.getEffectiveConfig(kioskId);
    const alerts: StockAlert[] = [];

    // Get alert thresholds from configuration
    const stockNoStockThreshold = config.stock_alert_no_stock_threshold || 0.05;
    const stockCriticalThreshold = config.stock_alert_critical_threshold || 0.1;
    const stockLowThreshold = config.stock_alert_low_threshold || 0.2;

    // Check for no stock alert
    if (stockLevel.freeRatio <= stockNoStockThreshold) {
      const alertKey = `no_stock_${kioskId}`;
      if (await this.shouldTriggerAlert(alertKey)) {
        const alert: StockAlert = {
          id: `${alertKey}_${Date.now()}`,
          type: 'no_stock',
          kioskId,
          severity: 'critical',
          message: `No available lockers (${Math.round(stockLevel.freeRatio * 100)}% free)`,
          data: {
            freeRatio: stockLevel.freeRatio,
            freeLockers: stockLevel.freeLockers,
            totalLockers: stockLevel.totalLockers
          },
          triggeredAt: new Date(),
          autoCleared: false
        };
        
        alerts.push(alert);
        await this.persistAlert(alert);
        this.lastAlerts.set(alertKey, new Date());
        
        console.log(`Alert triggered: type=no_stock, severity=critical.`);
      }
    }

    // Check for critical stock alert
    if (stockLevel.freeRatio <= stockCriticalThreshold && stockLevel.freeRatio > stockNoStockThreshold) {
      const alertKey = `critical_stock_${kioskId}`;
      if (await this.shouldTriggerAlert(alertKey)) {
        const alert: StockAlert = {
          id: `${alertKey}_${Date.now()}`,
          type: 'critical_stock',
          kioskId,
          severity: 'high',
          message: `Critical stock level (${Math.round(stockLevel.freeRatio * 100)}% free)`,
          data: {
            freeRatio: stockLevel.freeRatio,
            freeLockers: stockLevel.freeLockers,
            totalLockers: stockLevel.totalLockers
          },
          triggeredAt: new Date(),
          autoCleared: false
        };
        
        alerts.push(alert);
        await this.persistAlert(alert);
        this.lastAlerts.set(alertKey, new Date());
        
        console.log(`Alert triggered: type=critical_stock, severity=high.`);
      }
    }

    // Check for low stock alert
    if (stockLevel.freeRatio <= stockLowThreshold && stockLevel.freeRatio > stockCriticalThreshold) {
      const alertKey = `low_stock_${kioskId}`;
      if (await this.shouldTriggerAlert(alertKey)) {
        const alert: StockAlert = {
          id: `${alertKey}_${Date.now()}`,
          type: 'low_stock',
          kioskId,
          severity: 'medium',
          message: `Low stock level (${Math.round(stockLevel.freeRatio * 100)}% free)`,
          data: {
            freeRatio: stockLevel.freeRatio,
            freeLockers: stockLevel.freeLockers,
            totalLockers: stockLevel.totalLockers
          },
          triggeredAt: new Date(),
          autoCleared: false
        };
        
        alerts.push(alerts);
        await this.persistAlert(alert);
        this.lastAlerts.set(alertKey, new Date());
        
        console.log(`Alert triggered: type=low_stock, severity=medium.`);
      }
    }

    return alerts;
  }

  /**
   * Get basic stock metrics for a kiosk
   * Requirements: 17.5 - Create basic stock metrics (no trend analysis in MVP)
   */
  async getStockMetrics(kioskId: string, periodHours: number = 24): Promise<StockMetrics> {
    const since = new Date(Date.now() - periodHours * 60 * 60 * 1000);
    
    // Get stock events from the last period
    const stockEvents = await this.db.all<{ free_ratio: number; timestamp: string }>(
      `SELECT free_ratio, timestamp FROM stock_history 
       WHERE kiosk_id = ? AND timestamp >= ? 
       ORDER BY timestamp DESC`,
      [kioskId, since.toISOString()]
    );

    // Get alert count from the last period
    const alertCount = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM stock_alerts 
       WHERE kiosk_id = ? AND triggered_at >= ?`,
      [kioskId, since.toISOString()]
    );

    // Calculate metrics
    let averageFreeRatio = 0;
    let minFreeRatio = 1;
    let maxFreeRatio = 0;

    if (stockEvents && stockEvents.length > 0) {
      const ratios = stockEvents.map(e => e.free_ratio);
      averageFreeRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
      minFreeRatio = Math.min(...ratios);
      maxFreeRatio = Math.max(...ratios);
    }

    return {
      kioskId,
      averageFreeRatio,
      minFreeRatio,
      maxFreeRatio,
      stockEvents: stockEvents?.length || 0,
      alertCount: alertCount?.count || 0,
      lastUpdated: new Date()
    };
  }

  /**
   * Start continuous stock monitoring
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    const monitor = async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        // Get monitoring configuration
        const config = await this.configManager.getGlobalConfig();
        const monitoringIntervalMs = (config.stock_monitoring_interval_sec || 30) * 1000;
        const alertCooldownMs = (config.stock_alert_cooldown_min || 5) * 60 * 1000;

        // Get all kiosks
        const kiosks = await this.db.all<{ kiosk_id: string }>(
          'SELECT DISTINCT kiosk_id FROM lockers'
        );

        for (const kiosk of kiosks || []) {
          try {
            // Update stock level and check alerts
            const stockLevel = await this.getStockLevel(kiosk.kiosk_id);
            await this.recordStockHistory(stockLevel);
            await this.checkStockAlerts(kiosk.kiosk_id);
            
            // Emit stock level update event
            this.emit('stockLevelUpdate', stockLevel);
            
          } catch (error) {
            console.error(`Error monitoring stock for kiosk ${kiosk.kiosk_id}:`, error);
          }
        }

        // Schedule next monitoring cycle with configured interval
        if (!this.isShuttingDown) {
          this.monitoringInterval = setTimeout(monitor, monitoringIntervalMs);
        }
      } catch (error) {
        console.error('Error in stock monitoring:', error);
        // Fallback to default interval on error
        if (!this.isShuttingDown) {
          this.monitoringInterval = setTimeout(monitor, 30000);
        }
      }
    };

    // Start monitoring
    monitor();
    console.log('Stock monitoring started.');
  }

  /**
   * Stop stock monitoring
   */
  stopMonitoring(): void {
    this.isShuttingDown = true;
    if (this.monitoringInterval) {
      clearTimeout(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    console.log('Stock monitoring stopped.');
  }

  /**
   * Check if an alert should be triggered (respects cooldown)
   */
  private async shouldTriggerAlert(alertKey: string): Promise<boolean> {
    const lastAlert = this.lastAlerts.get(alertKey);
    if (!lastAlert) {
      return true; // No previous alert
    }

    // Get cooldown from configuration
    const config = await this.configManager.getGlobalConfig();
    const alertCooldownMs = (config.stock_alert_cooldown_min || 5) * 60 * 1000;

    const timeSinceLastAlert = Date.now() - lastAlert.getTime();
    return timeSinceLastAlert >= alertCooldownMs;
  }

  /**
   * Persist alert to database
   */
  private async persistAlert(alert: StockAlert): Promise<void> {
    try {
      await this.db.run(
        `INSERT INTO stock_alerts (id, type, kiosk_id, severity, message, data, triggered_at, auto_cleared)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          alert.id,
          alert.type,
          alert.kioskId,
          alert.severity,
          alert.message,
          JSON.stringify(alert.data),
          alert.triggeredAt.toISOString(),
          alert.autoCleared ? 1 : 0
        ]
      );
    } catch (error) {
      console.error('Error persisting stock alert:', error);
    }
  }

  /**
   * Record stock level history for metrics
   */
  private async recordStockHistory(stockLevel: StockLevel): Promise<void> {
    try {
      await this.db.run(
        `INSERT INTO stock_history (kiosk_id, total_lockers, free_lockers, owned_lockers, 
         blocked_lockers, error_lockers, vip_lockers, free_ratio, category, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stockLevel.kioskId,
          stockLevel.totalLockers,
          stockLevel.freeLockers,
          stockLevel.ownedLockers,
          stockLevel.blockedLockers,
          stockLevel.errorLockers,
          stockLevel.vipLockers,
          stockLevel.freeRatio,
          stockLevel.category,
          stockLevel.timestamp.toISOString()
        ]
      );
    } catch (error) {
      console.error('Error recording stock history:', error);
    }
  }

  /**
   * Clear old stock history (cleanup)
   */
  async cleanupOldHistory(daysToKeep: number = 7): Promise<void> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    try {
      const result = await this.db.run(
        'DELETE FROM stock_history WHERE timestamp < ?',
        [cutoffDate.toISOString()]
      );
      
      console.log(`Cleaned up ${result.changes || 0} old stock history records.`);
    } catch (error) {
      console.error('Error cleaning up stock history:', error);
    }
  }

  /**
   * Get active alerts for a kiosk
   */
  async getActiveAlerts(kioskId: string): Promise<StockAlert[]> {
    const alerts = await this.db.all<any>(
      `SELECT * FROM stock_alerts 
       WHERE kiosk_id = ? AND cleared_at IS NULL 
       ORDER BY triggered_at DESC`,
      [kioskId]
    );

    return (alerts || []).map(row => ({
      id: row.id,
      type: row.type,
      kioskId: row.kiosk_id,
      severity: row.severity,
      message: row.message,
      data: JSON.parse(row.data || '{}'),
      triggeredAt: new Date(row.triggered_at),
      clearedAt: row.cleared_at ? new Date(row.cleared_at) : undefined,
      autoCleared: Boolean(row.auto_cleared)
    }));
  }

  /**
   * Clear an alert
   */
  async clearAlert(alertId: string): Promise<void> {
    try {
      await this.db.run(
        'UPDATE stock_alerts SET cleared_at = ?, auto_cleared = 1 WHERE id = ?',
        [new Date().toISOString(), alertId]
      );
      
      console.log(`Alert cleared: ${alertId}.`);
    } catch (error) {
      console.error('Error clearing alert:', error);
    }
  }
}