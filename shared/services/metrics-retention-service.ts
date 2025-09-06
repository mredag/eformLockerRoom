/**
 * Metrics Retention Service
 * 
 * Handles 30-day data retention and daily purge jobs for metrics tables
 */

import { Database } from 'sqlite3';
import { promisify } from 'util';

export class MetricsRetentionService {
  private db: Database;
  private dbRun: (sql: string, params?: any[]) => Promise<any>;
  private dbGet: (sql: string, params?: any[]) => Promise<any>;
  private purgeInterval: NodeJS.Timeout | null = null;
  private logger: any;
  private retentionDays: number;

  constructor(database: Database, retentionDays: number = 30, logger?: any) {
    this.db = database;
    this.retentionDays = retentionDays;
    this.logger = logger || console;
    this.dbRun = promisify(this.db.run.bind(this.db));
    this.dbGet = promisify(this.db.get.bind(this.db));
  }

  /**
   * Start daily purge job
   */
  startDailyPurge(): void {
    // Run purge immediately on startup
    this.performPurge();

    // Schedule daily purge at 2 AM
    const now = new Date();
    const tomorrow2AM = new Date(now);
    tomorrow2AM.setDate(tomorrow2AM.getDate() + 1);
    tomorrow2AM.setHours(2, 0, 0, 0);

    const msUntil2AM = tomorrow2AM.getTime() - now.getTime();

    // Set initial timeout to 2 AM, then repeat every 24 hours
    setTimeout(() => {
      this.performPurge();
      
      // Set up daily interval
      this.purgeInterval = setInterval(() => {
        this.performPurge();
      }, 24 * 60 * 60 * 1000); // 24 hours
      
    }, msUntil2AM);

    this.logger.info(`Metrics retention service started with ${this.retentionDays}-day retention`);
  }

  /**
   * Stop daily purge job
   */
  stopDailyPurge(): void {
    if (this.purgeInterval) {
      clearInterval(this.purgeInterval);
      this.purgeInterval = null;
    }
    this.logger.info('Metrics retention service stopped');
  }

  /**
   * Perform data purge for all metrics tables
   */
  async performPurge(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
      const cutoffIso = cutoffDate.toISOString();

      this.logger.info(`Starting metrics data purge for data older than ${cutoffDate.toISOString()}`);

      // Purge alert_metrics table
      const alertMetricsResult = await this.dbRun(`
        DELETE FROM alert_metrics 
        WHERE created_at < ?
      `, [cutoffIso]);

      // Purge session_metrics table
      const sessionMetricsResult = await this.dbRun(`
        DELETE FROM session_metrics 
        WHERE created_at < ?
      `, [cutoffIso]);

      // Purge ui_performance_metrics table
      const uiMetricsResult = await this.dbRun(`
        DELETE FROM ui_performance_metrics 
        WHERE created_at < ?
      `, [cutoffIso]);

      // Purge performance_snapshots table
      const snapshotsResult = await this.dbRun(`
        DELETE FROM performance_snapshots 
        WHERE created_at < ?
      `, [cutoffIso]);

      // Purge old cleared alerts (keep active alerts regardless of age)
      const alertsResult = await this.dbRun(`
        DELETE FROM alerts 
        WHERE status = 'cleared' AND created_at < ?
      `, [cutoffIso]);

      // Log purge results
      const totalPurged = (alertMetricsResult?.changes || 0) + 
                         (sessionMetricsResult?.changes || 0) + 
                         (uiMetricsResult?.changes || 0) + 
                         (snapshotsResult?.changes || 0) + 
                         (alertsResult?.changes || 0);

      this.logger.info(`Metrics data purge completed: ${totalPurged} records removed`, {
        alert_metrics: alertMetricsResult?.changes || 0,
        session_metrics: sessionMetricsResult?.changes || 0,
        ui_performance_metrics: uiMetricsResult?.changes || 0,
        performance_snapshots: snapshotsResult?.changes || 0,
        cleared_alerts: alertsResult?.changes || 0,
        retention_days: this.retentionDays
      });

      // Vacuum database to reclaim space after large deletions
      if (totalPurged > 1000) {
        await this.vacuumDatabase();
      }

    } catch (error) {
      this.logger.error('Error during metrics data purge:', error);
    }
  }

  /**
   * Get retention statistics
   */
  async getRetentionStats(): Promise<{
    retentionDays: number;
    oldestRecord: string | null;
    recordCounts: {
      alert_metrics: number;
      session_metrics: number;
      ui_performance_metrics: number;
      performance_snapshots: number;
      alerts: number;
    };
    estimatedPurgeCount: number;
  }> {
    try {
      const cutoffDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
      const cutoffIso = cutoffDate.toISOString();

      // Get record counts
      const alertMetricsCount = await this.dbGet(`SELECT COUNT(*) as count FROM alert_metrics`);
      const sessionMetricsCount = await this.dbGet(`SELECT COUNT(*) as count FROM session_metrics`);
      const uiMetricsCount = await this.dbGet(`SELECT COUNT(*) as count FROM ui_performance_metrics`);
      const snapshotsCount = await this.dbGet(`SELECT COUNT(*) as count FROM performance_snapshots`);
      const alertsCount = await this.dbGet(`SELECT COUNT(*) as count FROM alerts`);

      // Get oldest record
      const oldestRecord = await this.dbGet(`
        SELECT MIN(created_at) as oldest FROM (
          SELECT created_at FROM alert_metrics
          UNION ALL
          SELECT created_at FROM session_metrics
          UNION ALL
          SELECT created_at FROM ui_performance_metrics
          UNION ALL
          SELECT created_at FROM performance_snapshots
          UNION ALL
          SELECT created_at FROM alerts
        )
      `);

      // Estimate purge count
      const purgeEstimates = await Promise.all([
        this.dbGet(`SELECT COUNT(*) as count FROM alert_metrics WHERE created_at < ?`, [cutoffIso]),
        this.dbGet(`SELECT COUNT(*) as count FROM session_metrics WHERE created_at < ?`, [cutoffIso]),
        this.dbGet(`SELECT COUNT(*) as count FROM ui_performance_metrics WHERE created_at < ?`, [cutoffIso]),
        this.dbGet(`SELECT COUNT(*) as count FROM performance_snapshots WHERE created_at < ?`, [cutoffIso]),
        this.dbGet(`SELECT COUNT(*) as count FROM alerts WHERE status = 'cleared' AND created_at < ?`, [cutoffIso])
      ]);

      const estimatedPurgeCount = purgeEstimates.reduce((sum, result) => sum + (result?.count || 0), 0);

      return {
        retentionDays: this.retentionDays,
        oldestRecord: oldestRecord?.oldest || null,
        recordCounts: {
          alert_metrics: alertMetricsCount?.count || 0,
          session_metrics: sessionMetricsCount?.count || 0,
          ui_performance_metrics: uiMetricsCount?.count || 0,
          performance_snapshots: snapshotsCount?.count || 0,
          alerts: alertsCount?.count || 0
        },
        estimatedPurgeCount
      };
    } catch (error) {
      this.logger.error('Error getting retention stats:', error);
      throw error;
    }
  }

  /**
   * Vacuum database to reclaim space
   */
  private async vacuumDatabase(): Promise<void> {
    try {
      this.logger.info('Starting database vacuum to reclaim space');
      await this.dbRun('VACUUM');
      this.logger.info('Database vacuum completed');
    } catch (error) {
      this.logger.error('Error during database vacuum:', error);
    }
  }

  /**
   * Manual purge trigger (for testing or emergency cleanup)
   */
  async manualPurge(customRetentionDays?: number): Promise<void> {
    const originalRetention = this.retentionDays;
    
    if (customRetentionDays !== undefined) {
      this.retentionDays = customRetentionDays;
    }

    try {
      await this.performPurge();
    } finally {
      this.retentionDays = originalRetention;
    }
  }

  /**
   * Shutdown the retention service
   */
  shutdown(): void {
    this.stopDailyPurge();
    this.logger.info('MetricsRetentionService shutdown complete');
  }
}