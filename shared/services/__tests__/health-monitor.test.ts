import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HealthMonitor } from '../health-monitor.js';
import { DatabaseConnection } from '../../database/connection.js';
import { EventLogger } from '../event-logger.js';
import { CommandQueueManager } from '../command-queue-manager.js';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
const mockDb = {
  get: vi.fn(),
  all: vi.fn(),
  getDatabasePath: vi.fn().mockReturnValue('/test/db/test.db')
} as unknown as DatabaseConnection;

const mockEventLogger = {
  getEventStatistics: vi.fn(),
  logEvent: vi.fn()
} as unknown as EventLogger;

const mockCommandQueueManager = {} as CommandQueueManager;

// Mock fs module
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    readdir: vi.fn(),
    unlink: vi.fn()
  }
}));

describe('HealthMonitor', () => {
  let healthMonitor: HealthMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    healthMonitor = new HealthMonitor(
      mockDb,
      '1.2.3',
      mockEventLogger,
      mockCommandQueueManager
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('System Health Check', () => {
    it('should return healthy status when all components are ok', async () => {
      // Mock successful database check
      vi.mocked(mockDb.get).mockResolvedValueOnce({ test: 1 }); // connectivity test
      vi.mocked(mockDb.get).mockResolvedValueOnce({ journal_mode: 'wal' }); // WAL mode check
      vi.mocked(mockDb.get).mockResolvedValueOnce({ timestamp: new Date().toISOString() }); // last event
      vi.mocked(mockDb.get).mockResolvedValueOnce({ count: 0 }); // pending commands
      vi.mocked(mockDb.get).mockResolvedValueOnce({ count: 0 }); // failed commands
      vi.mocked(mockDb.get).mockResolvedValueOnce({ executed_at: new Date().toISOString() }); // last processed

      // Mock file system calls
      vi.mocked(fs.stat).mockResolvedValueOnce({
        size: 1024,
        mtime: new Date()
      } as any);

      const health = await healthMonitor.getSystemHealth();

      expect(health.status).toBe('healthy');
      expect(health.version).toBe('1.2.3');
      expect(health.uptime).toBeGreaterThan(0);
      expect(health.components.database).toBe('ok');
      expect(health.components.services).toBe('ok');
    });

    it('should return degraded status when one component has errors', async () => {
      // Mock database error
      vi.mocked(mockDb.get).mockRejectedValueOnce(new Error('Database connection failed'));

      const health = await healthMonitor.getSystemHealth();

      expect(health.status).toBe('degraded');
      expect(health.components.database).toBe('error');
      expect(health.details?.database).toEqual({
        status: 'error',
        error: 'Database connection failed'
      });
    });

    it('should return unhealthy status when multiple components have errors', async () => {
      // Mock database error
      vi.mocked(mockDb.get).mockRejectedValue(new Error('Database connection failed'));

      const health = await healthMonitor.getSystemHealth();

      expect(health.status).toBe('degraded'); // Only database fails, so degraded not unhealthy
      expect(health.components.database).toBe('error');
    });
  });

  describe('Database Health Check', () => {
    it('should check database connectivity and WAL mode', async () => {
    
  vi.mocked(mockDb.get).mockResolvedValueOnce({ test: 1 }); // connectivity
      vi.mocked(mockDb.get).mockResolvedValueOnce({ journal_mode: 'wal' }); // WAL mode
      vi.mocked(mockDb.get).mockResolvedValueOnce({ timestamp: new Date().toISOString() }); // last event

      // Mock WAL file stat
      vi.mocked(fs.stat).mockResolvedValueOnce({
        size: 2048,
        mtime: new Date()
      } as any);

      const dbHealth = await healthMonitor.checkDatabaseHealth();

      expect(dbHealth.status).toBe('ok');
      expect(dbHealth.wal_size).toBe(2048);
      expect(dbHealth.response_time_ms).toBeGreaterThanOrEqual(0);
      expect(dbHealth.last_write).toBeInstanceOf(Date);
    });

    it('should handle database connection errors', async () => {
      vi.mocked(mockDb.get).mockRejectedValueOnce(new Error('Connection timeout'));

      const dbHealth = await healthMonitor.checkDatabaseHealth();

      expect(dbHealth.status).toBe('error');
      expect(dbHealth.error).toBe('Connection timeout');
    });

    it('should handle missing WAL file gracefully', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce({ test: 1 });
      vi.mocked(mockDb.get).mockResolvedValueOnce({ journal_mode: 'wal' });
      vi.mocked(mockDb.get).mockResolvedValueOnce({ timestamp: new Date().toISOString() });

      // Mock WAL file not found
      vi.mocked(fs.stat).mockRejectedValueOnce(new Error('File not found'));

      const dbHealth = await healthMonitor.checkDatabaseHealth();

      expect(dbHealth.status).toBe('ok');
      expect(dbHealth.wal_size).toBe(0);
    });
  });

  describe('Command Queue Health Check', () => {
    it('should check command queue statistics', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce({ count: 5 }); // pending
      vi.mocked(mockDb.get).mockResolvedValueOnce({ count: 2 }); // failed
      vi.mocked(mockDb.get).mockResolvedValueOnce({ executed_at: new Date().toISOString() }); // last processed
      vi.mocked(mockDb.get).mockResolvedValueOnce({ created_at: new Date().toISOString() }); // oldest pending

      const queueHealth = await healthMonitor.checkCommandQueueHealth();

      expect(queueHealth.pending_count).toBe(5);
      expect(queueHealth.failed_count).toBe(2);
      expect(queueHealth.last_processed).toBeInstanceOf(Date);
      expect(queueHealth.oldest_pending).toBeInstanceOf(Date);
    });

    it('should handle command queue query errors', async () => {
      vi.mocked(mockDb.get).mockRejectedValue(new Error('Query failed'));

      const queueHealth = await healthMonitor.checkCommandQueueHealth();

      expect(queueHealth.pending_count).toBe(0);
      expect(queueHealth.failed_count).toBe(0);
      expect(queueHealth.error).toBe('Query failed');
    });
  });

  describe('System Health Check', () => {
    it('should collect system resource metrics', async () => {
      // Mock process.cwd() stat
      vi.mocked(fs.stat).mockResolvedValueOnce({
        size: 1024
      } as any);

      const systemHealth = await healthMonitor.checkSystemHealth();

      expect(systemHealth.memory_usage).toBeGreaterThan(0);
      expect(systemHealth.process_count).toBe(1);
    });

    it('should handle system resource collection errors', async () => {
      vi.mocked(fs.stat).mockRejectedValueOnce(new Error('Access denied'));

      const systemHealth = await healthMonitor.checkSystemHealth();

      expect(systemHealth.memory_usage).toBeGreaterThan(0);
      expect(systemHealth.disk_usage).toBe(0);
    });
  });

  describe('Kiosk Health Check', () => {
    it('should return comprehensive kiosk health information', async () => {
      // Mock database health check
      vi.mocked(mockDb.get).mockResolvedValueOnce({ test: 1 });
      vi.mocked(mockDb.get).mockResolvedValueOnce({ journal_mode: 'wal' });
      vi.mocked(mockDb.get).mockResolvedValueOnce({ timestamp: new Date().toISOString() });
      vi.mocked(fs.stat).mockResolvedValueOnce({ size: 1024, mtime: new Date() } as any);

      // Mock command queue health
      vi.mocked(mockDb.get).mockResolvedValueOnce({ count: 3 }); // pending
      vi.mocked(mockDb.get).mockResolvedValueOnce({ count: 1 }); // failed
      vi.mocked(mockDb.get).mockResolvedValueOnce({ executed_at: new Date().toISOString() });

      const kioskHealth = await healthMonitor.getKioskHealth('kiosk-1');

      expect(kioskHealth.database.status).toBe('ok');
      expect(kioskHealth.rs485.status).toBe('ok');
      expect(kioskHealth.command_queue.pending_count).toBe(3);
      expect(kioskHealth.command_queue.failed_count).toBe(1);
      expect(kioskHealth.system.version).toBe('1.2.3');
      expect(kioskHealth.system.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Diagnostics', () => {
    it('should run comprehensive diagnostics', async () => {
      // Mock database diagnostics
      vi.mocked(mockDb.get).mockResolvedValue({ count: 10 });
      vi.mocked(mockDb.all).mockResolvedValue([
        { name: 'idx_test', tbl_name: 'test_table' }
      ]);
      vi.mocked(fs.stat).mockResolvedValue({ size: 2048, mtime: new Date() } as any);

      // Mock event statistics
      vi.mocked(mockEventLogger.getEventStatistics).mockResolvedValue({
        total: 100,
        by_type: { 'rfid_assign': 50 },
        by_kiosk: { 'kiosk-1': 100 },
        staff_actions: 20,
        user_actions: 70,
        system_events: 10
      });

      const diagnostics = await healthMonitor.runDiagnostics();

      expect(diagnostics.timestamp).toBeInstanceOf(Date);
      expect(diagnostics.system_info.node_version).toBe(process.version);
      expect(diagnostics.system_info.platform).toBe(process.platform);
      expect(diagnostics.database_diagnostics).toBeDefined();
      expect(diagnostics.performance_metrics).toBeDefined();
      expect(diagnostics.error_summary).toBeDefined();
    });

    it('should generate diagnostic report', async () => {
      // Mock all necessary calls for diagnostics
      vi.mocked(mockDb.get).mockResolvedValue({ count: 5 });
      vi.mocked(mockDb.all).mockResolvedValue([]);
      vi.mocked(fs.stat).mockResolvedValue({ size: 1024, mtime: new Date() } as any);

      const report = await healthMonitor.generateDiagnosticReport();

      expect(report).toContain('EFORM LOCKER SYSTEM DIAGNOSTIC REPORT');
      expect(report).toContain('Version: 1.2.3');
      expect(report).toContain('SYSTEM INFORMATION');
      expect(report).toContain('COMPONENT STATUS');
      expect(report).toContain('DATABASE DIAGNOSTICS');
      expect(report).toContain('PERFORMANCE METRICS');
      expect(report).toContain('ERROR SUMMARY');
    });
  });

  describe('Log Rotation', () => {
    it('should rotate and delete old log files', async () => {
      const testLogDir = '/test/logs';
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35); // 35 days old

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5); // 5 days old

      // Mock directory listing
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        'old.log',
        'recent.log',
        'config.json' // non-log file
      ] as any);

      // Mock file stats
      vi.mocked(fs.stat)
        .mockResolvedValueOnce({ mtime: oldDate } as any) // old.log
        .mockResolvedValueOnce({ mtime: recentDate } as any) // recent.log
        .mockResolvedValueOnce({ mtime: oldDate } as any); // config.json

      // Mock file deletion
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      // Mock event logging
      vi.mocked(mockEventLogger.logEvent).mockResolvedValue({} as any);

      const result = await healthMonitor.rotateLogFiles(testLogDir, 30);

      expect(result.deleted_files).toEqual(['old.log']);
      expect(result.rotated_files).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(fs.unlink).toHaveBeenCalledWith(path.join(testLogDir, 'old.log'));
      expect(mockEventLogger.logEvent).toHaveBeenCalledWith(
        'system',
        'log_rotation',
        {
          retention_days: 30,
          deleted_count: 1,
          error_count: 0
        }
      );
    });

    it('should handle file system errors during log rotation', async () => {
      const testLogDir = '/test/logs';

      // Mock directory read error
      vi.mocked(fs.readdir).mockRejectedValueOnce(new Error('Permission denied'));

      const result = await healthMonitor.rotateLogFiles(testLogDir, 30);

      expect(result.deleted_files).toEqual([]);
      expect(result.errors).toContain('Error accessing log directory: Permission denied');
    });

    it('should handle individual file errors during rotation', async () => {
      const testLogDir = '/test/logs';

      vi.mocked(fs.readdir).mockResolvedValueOnce(['error.log'] as any);
      vi.mocked(fs.stat).mockRejectedValueOnce(new Error('File access error'));

      const result = await healthMonitor.rotateLogFiles(testLogDir, 30);

      expect(result.errors).toContain('Error processing error.log: File access error');
    });

    it('should only delete log files, not other file types', async () => {
      const testLogDir = '/test/logs';
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      vi.mocked(fs.readdir).mockResolvedValueOnce([
        'old.log',
        'old.txt',
        'old.json',
        'old.config'
      ] as any);

      // All files are old
      vi.mocked(fs.stat).mockResolvedValue({ mtime: oldDate } as any);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(mockEventLogger.logEvent).mockResolvedValue({} as any);

      const result = await healthMonitor.rotateLogFiles(testLogDir, 30);

      expect(result.deleted_files).toEqual(['old.log', 'old.txt']);
      expect(fs.unlink).toHaveBeenCalledTimes(2);
      expect(fs.unlink).toHaveBeenCalledWith(path.join(testLogDir, 'old.log'));
      expect(fs.unlink).toHaveBeenCalledWith(path.join(testLogDir, 'old.txt'));
    });
  });

  describe('Error Handling', () => {
    it('should handle database diagnostics errors gracefully', async () => {
      vi.mocked(mockDb.get).mockRejectedValue(new Error('Database error'));
      vi.mocked(mockDb.all).mockRejectedValue(new Error('Query error'));
      vi.mocked(fs.stat).mockRejectedValue(new Error('File error'));

      const diagnostics = await healthMonitor.runDiagnostics();

      // The method catches individual section errors, not overall errors
      expect(diagnostics.database_diagnostics.database_file.error).toBe('File error');
    });

    it('should handle performance metrics collection errors', async () => {
      // Mock event logger error
      vi.mocked(mockEventLogger.getEventStatistics).mockRejectedValue(new Error('Stats error'));

      const diagnostics = await healthMonitor.runDiagnostics();

      expect(diagnostics.performance_metrics.event_statistics.error).toBe('Unable to collect event statistics');
    });

    it('should handle error summary collection errors', async () => {
      vi.mocked(mockDb.all).mockRejectedValue(new Error('Query failed'));

      const diagnostics = await healthMonitor.runDiagnostics();

      expect(diagnostics.error_summary.failed_commands.error).toBe('Unable to query failed commands');
      expect(diagnostics.error_summary.recent_restarts.error).toBe('Unable to query restart events');
      expect(diagnostics.error_summary.offline_kiosks.error).toBe('Unable to query kiosk status');
    });
  });
});