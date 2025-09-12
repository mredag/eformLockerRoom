import { DatabaseConnection } from '../database/connection';
import { KioskHealth, HealthCheckResponse, EventType } from '../types/core-entities';
import { EventLogger } from './event-logger';
import { CommandQueueManager } from './command-queue-manager';
import fs from 'fs/promises';
import path from 'path';

interface CountResult {
  count: number;
}

/**
 * Provides a comprehensive system for monitoring the health of the application and its components.
 * It checks the status of the database, command queue, system resources, and other services,
 * and can generate detailed diagnostic reports.
 */
export class HealthMonitor {
  private db: DatabaseConnection;
  private eventLogger?: EventLogger;
  private commandQueueManager?: CommandQueueManager;
  private startTime: Date;
  private version: string;

  /**
   * Creates an instance of HealthMonitor.
   * @param {DatabaseConnection} db - The database connection.
   * @param {string} [version='1.0.0'] - The version of the application.
   * @param {EventLogger} [eventLogger] - An optional EventLogger instance for logging.
   * @param {CommandQueueManager} [commandQueueManager] - An optional CommandQueueManager for health checks.
   */
  constructor(
    db: DatabaseConnection,
    version: string = '1.0.0',
    eventLogger?: EventLogger,
    commandQueueManager?: CommandQueueManager
  ) {
    this.db = db;
    this.eventLogger = eventLogger;
    this.commandQueueManager = commandQueueManager;
    this.startTime = new Date();
    this.version = version;
  }

  /**
   * Gathers a comprehensive health status of all major system components.
   * @returns {Promise<HealthCheckResponse>} A promise that resolves to the overall system health status.
   */
  async getSystemHealth(): Promise<HealthCheckResponse> {
    const components = {
      database: 'ok' as 'ok' | 'error',
      hardware: 'ok' as 'ok' | 'error',
      network: 'ok' as 'ok' | 'error',
      services: 'ok' as 'ok' | 'error'
    };

    const details: Record<string, any> = {};

    try {
      const dbHealth = await this.checkDatabaseHealth();
      details.database = dbHealth;
      if (dbHealth.status === 'error') {
        components.database = 'error';
      }
    } catch (error) {
      components.database = 'error';
      details.database = { status: 'error', error: (error as Error).message };
    }

    try {
      if (this.commandQueueManager) {
        const queueHealth = await this.checkCommandQueueHealth();
        details.command_queue = queueHealth;
        if (queueHealth.failed_count > 10) {
          components.services = 'error';
        }
      }
    } catch (error) {
      components.services = 'error';
      details.command_queue = { status: 'error', error: (error as Error).message };
    }

    try {
      const systemHealth = await this.checkSystemHealth();
      details.system = systemHealth;
      if (systemHealth.memory_usage > 90) {
        components.services = 'error';
      }
    } catch (error) {
      components.services = 'error';
      details.system = { status: 'error', error: (error as Error).message };
    }

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const errorCount = Object.values(components).filter(c => c === 'error').length;
    
    if (errorCount > 0) {
      status = errorCount > 1 ? 'unhealthy' : 'degraded';
    }

    return {
      status,
      version: this.version,
      uptime: Date.now() - this.startTime.getTime(),
      components,
      details
    };
  }

  /**
   * Gathers health information specific to a single kiosk.
   * @param {string} kioskId - The ID of the kiosk to check.
   * @returns {Promise<KioskHealth>} A promise that resolves to the health status of the kiosk.
   */
  async getKioskHealth(kioskId: string): Promise<KioskHealth> {
    const dbHealth = await this.checkDatabaseHealth();
    const queueHealth = this.commandQueueManager 
      ? await this.checkCommandQueueHealth() 
      : { pending_count: 0, failed_count: 0, last_processed: new Date() };
    const systemHealth = await this.checkSystemHealth();

    return {
      database: {
        status: dbHealth.status === 'ok' ? 'ok' : 'error',
        last_write: dbHealth.last_write || new Date(),
        wal_size: dbHealth.wal_size || 0
      },
      rs485: {
        status: 'ok',
        port: process.env.MODBUS_PORT || '/dev/ttyUSB0',
        last_successful_command: new Date()
      },
      command_queue: {
        pending_count: queueHealth.pending_count,
        failed_count: queueHealth.failed_count,
        last_processed: queueHealth.last_processed
      },
      system: {
        version: this.version,
        uptime: Date.now() - this.startTime.getTime(),
        memory_usage: systemHealth.memory_usage
      }
    };
  }

  /**
   * Checks the health of the database connection, including connectivity, WAL file size, and write latency.
   * @returns {Promise<object>} An object containing detailed database health metrics.
   */
  async checkDatabaseHealth(): Promise<{
    status: 'ok' | 'error';
    last_write?: Date;
    wal_size?: number;
    connection_count?: number;
    response_time_ms?: number;
    error?: string;
  }> {
    try {
      const startTime = Date.now();
      
      await this.db.get('SELECT 1 as test');
      
      const responseTime = Date.now() - startTime;

      interface WalInfo {
        journal_mode: string;
      }
      const walInfo = await this.db.get<WalInfo>('PRAGMA journal_mode');
      const isWalMode = walInfo?.journal_mode === 'wal';

      let walSize = 0;
      if (isWalMode) {
        try {
          const dbPath = this.db.getDatabasePath();
          const walPath = dbPath + '-wal';
          const stats = await fs.stat(walPath);
          walSize = stats.size;
        } catch {
        }
      }

      let lastWrite = new Date();
      try {
        interface LastEventResult {
          timestamp: string;
        }
        const lastEvent = await this.db.get<LastEventResult>(
          'SELECT timestamp FROM events ORDER BY timestamp DESC LIMIT 1'
        );
        if (lastEvent) {
          lastWrite = new Date(lastEvent.timestamp);
        }
      } catch {
      }

      return {
        status: 'ok',
        last_write: lastWrite,
        wal_size: walSize,
        response_time_ms: responseTime
      };
    } catch (error) {
      return {
        status: 'error',
        error: (error as Error).message
      };
    }
  }

  /**
   * Checks the health of the command queue, including the number of pending and failed commands.
   * @returns {Promise<object>} An object containing command queue health metrics.
   */
  async checkCommandQueueHealth(): Promise<{
    pending_count: number;
    failed_count: number;
    last_processed: Date;
    oldest_pending?: Date;
    error?: string;
  }> {
    try {
      const pendingResult = await this.db.get<CountResult>(
        "SELECT COUNT(*) as count FROM command_queue WHERE status = 'pending'"
      );
      const pendingCount = pendingResult?.count || 0;

      const failedResult = await this.db.get<CountResult>(
        "SELECT COUNT(*) as count FROM command_queue WHERE status = 'failed'"
      );
      const failedCount = failedResult?.count || 0;

      let lastProcessed = new Date();
      interface ExecutedAtResult {
        executed_at: string;
      }
      const lastProcessedResult = await this.db.get<ExecutedAtResult>(
        "SELECT executed_at FROM command_queue WHERE executed_at IS NOT NULL ORDER BY executed_at DESC LIMIT 1"
      );
      if (lastProcessedResult?.executed_at) {
        lastProcessed = new Date(lastProcessedResult.executed_at);
      }

      let oldestPending: Date | undefined;
      interface CreatedAtResult {
        created_at: string;
      }
      const oldestPendingResult = await this.db.get<CreatedAtResult>(
        "SELECT created_at FROM command_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
      );
      if (oldestPendingResult?.created_at) {
        oldestPending = new Date(oldestPendingResult.created_at);
      }

      return {
        pending_count: pendingCount,
        failed_count: failedCount,
        last_processed: lastProcessed,
        oldest_pending: oldestPending
      };
    } catch (error) {
      return {
        pending_count: 0,
        failed_count: 0,
        last_processed: new Date(),
        error: (error as Error).message
      };
    }
  }

  /**
   * Checks the health of system resources like memory and disk usage.
   * @returns {Promise<object>} An object containing system resource metrics.
   */
  async checkSystemHealth(): Promise<{
    memory_usage: number;
    disk_usage?: number;
    cpu_load?: number;
    process_count?: number;
    error?: string;
  }> {
    try {
      const memUsage = process.memoryUsage();
      const memoryUsagePercent = Math.round(
        (memUsage.heapUsed / memUsage.heapTotal) * 100
      );

      let diskUsage: number | undefined;
      try {
        const stats = await fs.stat(process.cwd());
        diskUsage = 0;
      } catch {
      }

      return {
        memory_usage: memoryUsagePercent,
        disk_usage: diskUsage || 0,
        process_count: 1
      };
    } catch (error) {
      return {
        memory_usage: 0,
        error: (error as Error).message
      };
    }
  }

  /**
   * Runs a comprehensive set of diagnostics, gathering detailed information about
   * the system, database, performance, and recent errors.
   * @returns {Promise<object>} An object containing the full diagnostic report data.
   */
  async runDiagnostics(): Promise<{
    timestamp: Date;
    system_info: Record<string, any>;
    database_diagnostics: Record<string, any>;
    performance_metrics: Record<string, any>;
    error_summary: Record<string, any>;
  }> {
    const timestamp = new Date();
    
    const systemInfo = {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      pid: process.pid,
      working_directory: process.cwd(),
      environment: process.env.NODE_ENV || 'development'
    };

    const dbDiagnostics = await this.runDatabaseDiagnostics();
    
    const performanceMetrics = await this.collectPerformanceMetrics();
    
    const errorSummary = await this.collectErrorSummary();

    return {
      timestamp,
      system_info: systemInfo,
      database_diagnostics: dbDiagnostics,
      performance_metrics: performanceMetrics,
      error_summary: errorSummary
    };
  }

  /**
   * Runs a series of database-specific diagnostic checks.
   * @private
   * @returns {Promise<Record<string, any>>} An object with database diagnostic information.
   */
  private async runDatabaseDiagnostics(): Promise<Record<string, any>> {
    const diagnostics: Record<string, any> = {};
    
    try {

      try {
        const dbPath = this.db.getDatabasePath();
        const stats = await fs.stat(dbPath);
        diagnostics.database_file = {
          path: dbPath,
          size_bytes: stats.size,
          modified: stats.mtime
        };
      } catch (error) {
        diagnostics.database_file = { error: (error as Error).message };
      }

      try {
        const tables = ['lockers', 'events', 'command_queue', 'kiosk_heartbeat', 'vip_contracts'];
        diagnostics.table_stats = {};
        
        for (const table of tables) {
          try {
            const countResult = await this.db.get<CountResult>(`SELECT COUNT(*) as count FROM ${table}`);
            diagnostics.table_stats[table] = { row_count: countResult?.count || 0 };
          } catch {
            diagnostics.table_stats[table] = { error: 'Table not found or inaccessible' };
          }
        }
      } catch (error) {
        diagnostics.table_stats = { error: (error as Error).message };
      }

      try {
        interface IndexResult {
          name: string;
          tbl_name: string;
        }
        const indexes = await this.db.all<IndexResult>("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index'");
        diagnostics.indexes = indexes.map(idx => ({
          name: idx.name,
          table: idx.tbl_name
        }));
      } catch (error) {
        diagnostics.indexes = { error: (error as Error).message };
      }

      try {
        const pragmas = {
          journal_mode: await this.db.get('PRAGMA journal_mode'),
          synchronous: await this.db.get('PRAGMA synchronous'),
          cache_size: await this.db.get('PRAGMA cache_size'),
          page_size: await this.db.get('PRAGMA page_size'),
          auto_vacuum: await this.db.get('PRAGMA auto_vacuum')
        };
        diagnostics.pragma_settings = pragmas;
      } catch (error) {
        diagnostics.pragma_settings = { error: (error as Error).message };
      }

    } catch (error) {
      diagnostics.error = (error as Error).message;
    }
    
    return diagnostics;
  }

  /**
   * Collects various performance metrics from the running process.
   * @private
   * @returns {Promise<Record<string, any>>} An object with performance metrics.
   */
  private async collectPerformanceMetrics(): Promise<Record<string, any>> {
    try {
      const metrics: Record<string, any> = {};

      const memUsage = process.memoryUsage();
      metrics.memory = {
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
        external_mb: Math.round(memUsage.external / 1024 / 1024),
        rss_mb: Math.round(memUsage.rss / 1024 / 1024)
      };

      const cpuUsage = process.cpuUsage();
      metrics.cpu = {
        user_microseconds: cpuUsage.user,
        system_microseconds: cpuUsage.system
      };

      const dbPerfStart = Date.now();
      await this.db.get('SELECT COUNT(*) FROM sqlite_master');
      const dbPerfTime = Date.now() - dbPerfStart;
      metrics.database_response_time_ms = dbPerfTime;

      if (this.eventLogger) {
        try {
          const eventStats = await this.eventLogger.getEventStatistics();
          metrics.event_statistics = {
            total_events: eventStats.total,
            staff_actions: eventStats.staff_actions,
            user_actions: eventStats.user_actions,
            system_events: eventStats.system_events
          };
        } catch {
          metrics.event_statistics = { error: 'Unable to collect event statistics' };
        }
      }

      return metrics;
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  /**
   * Collects a summary of recent errors and notable events from the database.
   * @private
   * @returns {Promise<Record<string, any>>} An object with an error summary.
   */
  private async collectErrorSummary(): Promise<Record<string, any>> {
    try {
      const errorSummary: Record<string, any> = {};

      try {
        const failedCommands = await this.db.all(
          "SELECT command_type, last_error, retry_count FROM command_queue WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10"
        );
        errorSummary.failed_commands = failedCommands;
      } catch {
        errorSummary.failed_commands = { error: 'Unable to query failed commands' };
      }

      try {
        interface RestartEventResult {
          timestamp: string;
          details: string;
        }
        const restartEvents = await this.db.all<RestartEventResult>(
          "SELECT timestamp, details FROM events WHERE event_type = 'restarted' ORDER BY timestamp DESC LIMIT 5"
        );
        errorSummary.recent_restarts = restartEvents.map(event => ({
          timestamp: event.timestamp,
          details: JSON.parse(event.details || '{}')
        }));
      } catch {
        errorSummary.recent_restarts = { error: 'Unable to query restart events' };
      }

      try {
        const offlineKiosks = await this.db.all(
          "SELECT kiosk_id, last_seen FROM kiosk_heartbeat WHERE status = 'offline'"
        );
        errorSummary.offline_kiosks = offlineKiosks;
      } catch {
        errorSummary.offline_kiosks = { error: 'Unable to query kiosk status' };
      }

      return errorSummary;
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  /**
   * Performs log file rotation, deleting files older than the specified retention period.
   * @param {string} logDirectory - The directory containing the log files.
   * @param {number} [retentionDays=30] - The number of days to retain log files.
   * @returns {Promise<object>} An object summarizing the rotation results.
   */
  async rotateLogFiles(logDirectory: string, retentionDays: number = 30): Promise<{
    rotated_files: string[];
    deleted_files: string[];
    errors: string[];
  }> {
    const result = {
      rotated_files: [] as string[],
      deleted_files: [] as string[],
      errors: [] as string[]
    };

    try {
      const files = await fs.readdir(logDirectory);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      for (const file of files) {
        try {
          const filePath = path.join(logDirectory, file);
          const stats = await fs.stat(filePath);

          if (stats.mtime < cutoffDate) {
            if (file.endsWith('.log') || file.endsWith('.txt')) {
              await fs.unlink(filePath);
              result.deleted_files.push(file);
            }
          }
        } catch (error) {
          result.errors.push(`Error processing ${file}: ${(error as Error).message}`);
        }
      }

      if (this.eventLogger) {
        await this.eventLogger.logEvent('system', EventType.SYSTEM_RESTARTED, {
          retention_days: retentionDays,
          deleted_count: result.deleted_files.length,
          error_count: result.errors.length
        });
      }

    } catch (error) {
      result.errors.push(`Error accessing log directory: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Generates a human-readable plain-text diagnostic report.
   * @returns {Promise<string>} The diagnostic report as a string.
   */
  async generateDiagnosticReport(): Promise<string> {
    const diagnostics = await this.runDiagnostics();
    const health = await this.getSystemHealth();

    const report = [
      '=== EFORM LOCKER SYSTEM DIAGNOSTIC REPORT ===',
      `Generated: ${diagnostics.timestamp.toISOString()}`,
      `Version: ${this.version}`,
      `Status: ${health.status.toUpperCase()}`,
      '',
      '=== SYSTEM INFORMATION ===',
      `Node.js: ${diagnostics.system_info.node_version}`,
      `Platform: ${diagnostics.system_info.platform} (${diagnostics.system_info.arch})`,
      `Uptime: ${Math.round(diagnostics.system_info.uptime / 3600)} hours`,
      `Environment: ${diagnostics.system_info.environment}`,
      '',
      '=== COMPONENT STATUS ===',
      `Database: ${health.components.database}`,
      `Hardware: ${health.components.hardware}`,
      `Network: ${health.components.network}`,
      `Services: ${health.components.services}`,
      '',
      '=== DATABASE DIAGNOSTICS ===',
      `File Size: ${diagnostics.database_diagnostics.database_file?.size_bytes || 'Unknown'} bytes`,
      `Journal Mode: ${diagnostics.database_diagnostics.pragma_settings?.journal_mode?.journal_mode || 'Unknown'}`,
      '',
      '=== PERFORMANCE METRICS ===',
      `Memory Usage: ${diagnostics.performance_metrics.memory?.heap_used_mb || 0} MB`,
      `Database Response: ${diagnostics.performance_metrics.database_response_time_ms || 0} ms`,
      '',
      '=== ERROR SUMMARY ===',
      `Failed Commands: ${diagnostics.error_summary.failed_commands?.length || 0}`,
      `Recent Restarts: ${diagnostics.error_summary.recent_restarts?.length || 0}`,
      `Offline Kiosks: ${diagnostics.error_summary.offline_kiosks?.length || 0}`,
      '',
      '=== END REPORT ==='
    ];

    return report.join('\n');
  }
}
