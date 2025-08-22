import { DatabaseConnection } from '../database/connection';
import { KioskHealth, HealthCheckResponse } from '../types/core-entities';
import { EventLogger } from './event-logger';
import { CommandQueueManager } from './command-queue-manager';
import fs from 'fs/promises';
import path from 'path';

/**
 * Health Monitoring and Diagnostics System
 * Provides comprehensive system health monitoring with detailed status reporting
 * Requirements: 10.3, 10.5
 */
export class HealthMonitor {
  private db: DatabaseConnection;
  private eventLogger?: EventLogger;
  private commandQueueManager?: CommandQueueManager;
  private startTime: Date;
  private version: string;

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
   * Get comprehensive system health status
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
      // Check database health
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
      // Check command queue health
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
      // Check system resources
      const systemHealth = await this.checkSystemHealth();
      details.system = systemHealth;
      if (systemHealth.memory_usage > 90) {
        components.services = 'error';
      }
    } catch (error) {
      components.services = 'error';
      details.system = { status: 'error', error: (error as Error).message };
    }

    // Determine overall status
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
   * Get kiosk-specific health information
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
        status: 'ok', // Will be updated by hardware-specific implementations
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
   * Check database health and performance
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
      
      // Test basic connectivity
      await this.db.get('SELECT 1 as test');
      
      const responseTime = Date.now() - startTime;

      // Check WAL mode status
      const walInfo = await this.db.get('PRAGMA journal_mode');
      const isWalMode = walInfo?.journal_mode === 'wal';

      // Get WAL file size if in WAL mode
      let walSize = 0;
      if (isWalMode) {
        try {
          const dbPath = this.db.getDatabasePath();
          const walPath = dbPath + '-wal';
          const stats = await fs.stat(walPath);
          walSize = stats.size;
        } catch {
          // WAL file might not exist yet
        }
      }

      // Get last write time from events table
      let lastWrite = new Date();
      try {
        const lastEvent = await this.db.get(
          'SELECT timestamp FROM events ORDER BY timestamp DESC LIMIT 1'
        );
        if (lastEvent) {
          lastWrite = new Date(lastEvent.timestamp);
        }
      } catch {
        // Events table might not exist yet
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
   * Check command queue health
   */
  async checkCommandQueueHealth(): Promise<{
    pending_count: number;
    failed_count: number;
    last_processed: Date;
    oldest_pending?: Date;
    error?: string;
  }> {
    try {
      // Get pending commands count
      const pendingResult = await this.db.get(
        "SELECT COUNT(*) as count FROM command_queue WHERE status = 'pending'"
      );
      const pendingCount = pendingResult?.count || 0;

      // Get failed commands count
      const failedResult = await this.db.get(
        "SELECT COUNT(*) as count FROM command_queue WHERE status = 'failed'"
      );
      const failedCount = failedResult?.count || 0;

      // Get last processed command
      let lastProcessed = new Date();
      const lastProcessedResult = await this.db.get(
        "SELECT executed_at FROM command_queue WHERE executed_at IS NOT NULL ORDER BY executed_at DESC LIMIT 1"
      );
      if (lastProcessedResult?.executed_at) {
        lastProcessed = new Date(lastProcessedResult.executed_at);
      }

      // Get oldest pending command
      let oldestPending: Date | undefined;
      const oldestPendingResult = await this.db.get(
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
   * Check system resource health
   */
  async checkSystemHealth(): Promise<{
    memory_usage: number;
    disk_usage?: number;
    cpu_load?: number;
    process_count?: number;
    error?: string;
  }> {
    try {
      // Get memory usage
      const memUsage = process.memoryUsage();
      const memoryUsagePercent = Math.round(
        (memUsage.heapUsed / memUsage.heapTotal) * 100
      );

      // Get disk usage (simplified)
      let diskUsage: number | undefined;
      try {
        const stats = await fs.stat(process.cwd());
        // This is a simplified disk usage check
        diskUsage = 0; // Would need platform-specific implementation
      } catch {
        // Disk usage check failed
      }

      return {
        memory_usage: memoryUsagePercent,
        disk_usage: diskUsage || 0,
        process_count: 1 // Current process
      };
    } catch (error) {
      return {
        memory_usage: 0,
        error: (error as Error).message
      };
    }
  }

  /**
   * Run comprehensive diagnostics
   */
  async runDiagnostics(): Promise<{
    timestamp: Date;
    system_info: Record<string, any>;
    database_diagnostics: Record<string, any>;
    performance_metrics: Record<string, any>;
    error_summary: Record<string, any>;
  }> {
    const timestamp = new Date();
    
    // System information
    const systemInfo = {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      pid: process.pid,
      working_directory: process.cwd(),
      environment: process.env.NODE_ENV || 'development'
    };

    // Database diagnostics
    const dbDiagnostics = await this.runDatabaseDiagnostics();
    
    // Performance metrics
    const performanceMetrics = await this.collectPerformanceMetrics();
    
    // Error summary
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
   * Run database-specific diagnostics
   */
  private async runDatabaseDiagnostics(): Promise<Record<string, any>> {
    const diagnostics: Record<string, any> = {};
    
    try {

      // Database file info
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

      // Table statistics
      try {
        const tables = ['lockers', 'events', 'command_queue', 'kiosk_heartbeat', 'vip_contracts'];
        diagnostics.table_stats = {};
        
        for (const table of tables) {
          try {
            const countResult = await this.db.get(`SELECT COUNT(*) as count FROM ${table}`);
            diagnostics.table_stats[table] = { row_count: countResult?.count || 0 };
          } catch {
            diagnostics.table_stats[table] = { error: 'Table not found or inaccessible' };
          }
        }
      } catch (error) {
        diagnostics.table_stats = { error: (error as Error).message };
      }

      // Index usage
      try {
        const indexes = await this.db.all("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index'");
        diagnostics.indexes = indexes.map(idx => ({
          name: idx.name,
          table: idx.tbl_name
        }));
      } catch (error) {
        diagnostics.indexes = { error: (error as Error).message };
      }

      // PRAGMA information
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
   * Collect performance metrics
   */
  private async collectPerformanceMetrics(): Promise<Record<string, any>> {
    try {
      const metrics: Record<string, any> = {};

      // Memory metrics
      const memUsage = process.memoryUsage();
      metrics.memory = {
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
        external_mb: Math.round(memUsage.external / 1024 / 1024),
        rss_mb: Math.round(memUsage.rss / 1024 / 1024)
      };

      // CPU metrics (simplified)
      const cpuUsage = process.cpuUsage();
      metrics.cpu = {
        user_microseconds: cpuUsage.user,
        system_microseconds: cpuUsage.system
      };

      // Database performance test
      const dbPerfStart = Date.now();
      await this.db.get('SELECT COUNT(*) FROM sqlite_master');
      const dbPerfTime = Date.now() - dbPerfStart;
      metrics.database_response_time_ms = dbPerfTime;

      // Event log statistics (if available)
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
   * Collect error summary from recent events
   */
  private async collectErrorSummary(): Promise<Record<string, any>> {
    try {
      const errorSummary: Record<string, any> = {};

      // Recent failed commands
      try {
        const failedCommands = await this.db.all(
          "SELECT command_type, last_error, retry_count FROM command_queue WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10"
        );
        errorSummary.failed_commands = failedCommands;
      } catch {
        errorSummary.failed_commands = { error: 'Unable to query failed commands' };
      }

      // System restart events
      try {
        const restartEvents = await this.db.all(
          "SELECT timestamp, details FROM events WHERE event_type = 'restarted' ORDER BY timestamp DESC LIMIT 5"
        );
        errorSummary.recent_restarts = restartEvents.map(event => ({
          timestamp: event.timestamp,
          details: JSON.parse(event.details || '{}')
        }));
      } catch {
        errorSummary.recent_restarts = { error: 'Unable to query restart events' };
      }

      // Offline kiosks
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
   * Implement log rotation with configurable retention
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

          // Check if file is older than retention period
          if (stats.mtime < cutoffDate) {
            // Check if it's a log file
            if (file.endsWith('.log') || file.endsWith('.txt')) {
              await fs.unlink(filePath);
              result.deleted_files.push(file);
            }
          }
        } catch (error) {
          result.errors.push(`Error processing ${file}: ${(error as Error).message}`);
        }
      }

      // Log the rotation activity
      if (this.eventLogger) {
        await this.eventLogger.logEvent('system', 'log_rotation', {
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
   * Generate diagnostic report
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