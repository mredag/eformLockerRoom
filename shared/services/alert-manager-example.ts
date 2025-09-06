/**
 * AlertManager Usage Example
 * 
 * This example demonstrates how to use the AlertManager service
 * for monitoring and alerting in the smart locker assignment system.
 */

import { Database } from 'sqlite3';
import { AlertManager, AlertType } from './alert-manager';

export class AlertManagerExample {
  private alertManager: AlertManager;
  private db: Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.alertManager = new AlertManager(this.db);
    
    // Set up event listeners
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.alertManager.on('alertTriggered', (alert) => {
      console.log(`🚨 Alert triggered: ${alert.type} for kiosk ${alert.kioskId}`);
      console.log(`   Severity: ${alert.severity}`);
      console.log(`   Message: ${alert.message}`);
      
      // In a real implementation, you might:
      // - Send notifications to administrators
      // - Update admin dashboard
      // - Log to external monitoring system
      // - Trigger automated responses
    });

    this.alertManager.on('alertCleared', (alert) => {
      console.log(`✅ Alert cleared: ${alert.type} for kiosk ${alert.kioskId}`);
      
      // In a real implementation, you might:
      // - Send all-clear notifications
      // - Update dashboard status
      // - Log resolution time
    });
  }

  /**
   * Example: Record a no-stock event and check thresholds
   */
  async handleNoStockEvent(kioskId: string): Promise<void> {
    console.log(`📊 Recording no-stock event for kiosk ${kioskId}`);
    
    // Record the metric
    await this.alertManager.recordMetric(kioskId, 'no_stock_events', 1, 1);
    
    // Check if threshold is exceeded
    await this.alertManager.monitorNoStock(kioskId);
  }

  /**
   * Example: Record assignment conflict and monitor rate
   */
  async handleAssignmentConflict(kioskId: string, conflictRate: number): Promise<void> {
    console.log(`📊 Recording assignment conflict for kiosk ${kioskId}, rate: ${(conflictRate * 100).toFixed(1)}%`);
    
    // Record the metric
    await this.alertManager.recordMetric(kioskId, 'conflict_rate', conflictRate, 1);
    
    // Check if threshold is exceeded
    await this.alertManager.monitorConflictRate(kioskId);
  }

  /**
   * Example: Record locker open failure
   */
  async handleOpenFailure(kioskId: string, failureRate: number): Promise<void> {
    console.log(`📊 Recording open failure for kiosk ${kioskId}, rate: ${(failureRate * 100).toFixed(1)}%`);
    
    // Record the metric
    await this.alertManager.recordMetric(kioskId, 'open_fail_rate', failureRate, 1);
    
    // Check if threshold is exceeded
    await this.alertManager.monitorOpenFailRate(kioskId);
  }

  /**
   * Example: Record retry event
   */
  async handleRetryEvent(kioskId: string, retryRate: number): Promise<void> {
    console.log(`📊 Recording retry event for kiosk ${kioskId}, rate: ${(retryRate * 100).toFixed(1)}%`);
    
    // Record the metric
    await this.alertManager.recordMetric(kioskId, 'retry_rate', retryRate, 1);
    
    // Check if threshold is exceeded
    await this.alertManager.monitorRetryRate(kioskId);
  }

  /**
   * Example: Monitor overdue locker share
   */
  async handleOverdueCheck(kioskId: string, overdueShare: number): Promise<void> {
    console.log(`📊 Checking overdue share for kiosk ${kioskId}, share: ${(overdueShare * 100).toFixed(1)}%`);
    
    // Record the metric
    await this.alertManager.recordMetric(kioskId, 'overdue_share', overdueShare, 1);
    
    // Check if threshold is exceeded
    await this.alertManager.monitorOverdueShare(kioskId);
  }

  /**
   * Example: Start continuous monitoring for a kiosk
   */
  startKioskMonitoring(kioskId: string): void {
    console.log(`🔄 Starting continuous monitoring for kiosk ${kioskId}`);
    
    // Start monitoring with 60-second intervals
    this.alertManager.startMonitoring(kioskId, 60);
  }

  /**
   * Example: Get current alert status
   */
  async getAlertStatus(kioskId: string): Promise<void> {
    console.log(`📋 Alert status for kiosk ${kioskId}:`);
    
    // Get active alerts
    const activeAlerts = await this.alertManager.checkAlerts(kioskId);
    console.log(`   Active alerts: ${activeAlerts.length}`);
    
    activeAlerts.forEach(alert => {
      console.log(`   - ${alert.type}: ${alert.severity} (${alert.message})`);
    });

    // Get alert history
    const history = await this.alertManager.getAlertHistory(kioskId, 10);
    console.log(`   Recent alerts: ${history.length}`);
    
    history.slice(0, 3).forEach(alert => {
      const status = alert.clearedAt ? 'cleared' : 'active';
      console.log(`   - ${alert.type}: ${status} (${alert.triggeredAt.toISOString()})`);
    });
  }

  /**
   * Example: Manually clear an alert
   */
  async clearAlert(alertId: string): Promise<void> {
    console.log(`🔧 Manually clearing alert ${alertId}`);
    await this.alertManager.clearAlert(alertId);
  }

  /**
   * Example: Cleanup old data
   */
  async performMaintenance(): Promise<void> {
    console.log(`🧹 Performing alert system maintenance`);
    
    // Cleanup alerts older than 30 days
    await this.alertManager.cleanupOldAlerts(30);
  }

  /**
   * Example: Simulate a complete monitoring scenario
   */
  async simulateMonitoringScenario(): Promise<void> {
    const kioskId = 'kiosk-demo';
    
    console.log(`🎭 Simulating monitoring scenario for ${kioskId}`);
    
    // Start monitoring
    this.startKioskMonitoring(kioskId);
    
    // Simulate some events that might trigger alerts
    await this.handleNoStockEvent(kioskId);
    await this.handleNoStockEvent(kioskId);
    await this.handleNoStockEvent(kioskId);
    await this.handleNoStockEvent(kioskId); // This should trigger alert
    
    await this.handleAssignmentConflict(kioskId, 0.025); // Above 2% threshold
    
    await this.handleOpenFailure(kioskId, 0.015); // Above 1% threshold
    
    await this.handleRetryEvent(kioskId, 0.06); // Above 5% threshold
    
    await this.handleOverdueCheck(kioskId, 0.22); // Above 20% threshold
    
    // Check status
    await this.getAlertStatus(kioskId);
    
    // Get all active alerts and clear them
    const activeAlerts = this.alertManager.getActiveAlerts();
    console.log(`🔧 Clearing ${activeAlerts.length} active alerts`);
    
    for (const alert of activeAlerts) {
      await this.clearAlert(alert.id);
    }
    
    // Final status check
    await this.getAlertStatus(kioskId);
    
    console.log(`✅ Monitoring scenario complete`);
  }

  /**
   * Shutdown the example
   */
  shutdown(): void {
    console.log(`🛑 Shutting down AlertManager example`);
    this.alertManager.shutdown();
    this.db.close();
  }
}

// Example usage:
/*
async function runExample() {
  const example = new AlertManagerExample('./data/eform.db');
  
  try {
    await example.simulateMonitoringScenario();
  } catch (error) {
    console.error('Example failed:', error);
  } finally {
    example.shutdown();
  }
}

// Uncomment to run the example
// runExample().catch(console.error);
*/