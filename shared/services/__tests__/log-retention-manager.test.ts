import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LogRetentionManager, RetentionConfig, CleanupResult } from '../log-retention-manager.js';
import { DatabaseConnection } from '../../database/connection.js';
import { EventLogger } from '../event-logger.js';
import fs from 'fs/promises';

// Mock dependencies
const mockDb = {
  run: vi.fn(),
  get: vi.fn(),
  all: vi.fn()
} as unknown as DatabaseConnection;

const mockEventLogger = {
  logEvent: vi.fn()
} as unknown as EventLogger;

// Mock fs module
vi.mock('fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn()
  }
}));

describe('LogRetentionManager', () => {
  let retentionManager: LogRetentionManager;
  let config: Partial<RetentionConfig>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      event_retention_days: 30,
      audit_retention_days: 90,
      file_log_retention_days: 7,
      anonymization_enabled: true,
      batch_size: 100
    };
    retentionManager = new LogRetentionManager(mockDb, mockEventLogger, config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runCleanup', () => {
    it('should run comprehensive cleanup successfully', async () => {
      // Mock database operations
      vi.mocked(mockDb.run)
        .mockResolvedValueOnce({ changes: 50 } as any) // regular events
        .mockResolvedValueOnce({ changes: 10 } as any) // audit events
        .mockResolvedValueOnce({ changes: 5 } as any); // anonymization updates

      vi.mocked(mockDb.all)
        .mockResolvedValueOnce([
          { id: 1, device_id: 'device123', details: '{}' },
          { id: 2, device_id: 'device456', details: '{"device_hash":"hash123"}' }
        ]) // device IDs to anonymize
        .mockResolvedValueOnce([
          { id: 3, rfid_card: 'card123' }
        ]) // RFID cards to anonymize
        .mockResolvedValueOnce([
          { id: 4, details: '{"ip_address":"192.168.1.100"}' }
        ]); // IP addresses to anonymize

      // Mock file system operations
      vi.mocked(fs.readdir).mockResolvedValue(['old.log', 'recent.log', 'config.json'] as any);
      vi.mocked(fs.stat)
        .mockResolvedValueOnce({ mtime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } as any) // old.log - 10 days old
        .mockResolvedValueOnce({ mtime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) } as any) // recent.log - 1 day old
        .mockResolvedValueOnce({ mtime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } as any); // config.json - 10 days old

      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(mockEventLogger.logEvent).mockResolvedValue({} as any);

      const result = await retentionManager.runCleanup();

      expect(result.events_deleted).toBe(60); // 50 + 10
      expect(result.files_deleted).toBe(2); // old.log and debug.log (config.json is not a log file)
      expect(result.records_anonymized).toBe(4); // 2 device IDs + 1 RFID card + 1 IP address
      expect(result.errors).toEqual([]);
      expect(result.execution_time_ms).toBeGreaterThan(0);

      expect(mockEventLogger.logEvent).toHaveBeenCalledWith(
        'system',
        'log_cleanup_completed',
        expect.objectContaining({
          events_deleted: 60,
          files_deleted: 2,
          records_anonymized: 4
        })
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      vi.mocked(mockDb.run).mockRejectedValue(new Error('Database error'));
      vi.mocked(mockEventLogger.logEvent).mockResolvedValue({} as any);

      const result = await retentionManager.runCleanup();

      expect(result.errors).toContain('Database error');
      expect(mockEventLogger.logEvent).toHaveBeenCalledWith(
        'system',
        'log_cleanup_error',
        expect.objectContaining({
          error: 'Database error'
        })
      );
    });
  });

  describe('cleanupOldEvents', () => {
    it('should delete old regular events and audit events separately', async () => {
      vi.mocked(mockDb.run)
        .mockResolvedValueOnce({ changes: 100 } as any) // regular events
        .mockResolvedValueOnce({ changes: 25 } as any); // audit events

      const deleted = await retentionManager.cleanupOldEvents();

      expect(deleted).toBe(125);
      expect(mockDb.run).toHaveBeenCalledTimes(2);

      // Check regular events deletion
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM events'),
        expect.arrayContaining([expect.any(String)])
      );

      // Check audit events deletion with longer retention
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('event_type LIKE \'staff_%\''),
        expect.arrayContaining([expect.any(String)])
      );
    });
  });

  describe('cleanupOldFileLogs', () => {
    it('should delete old log files from multiple directories', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['system.log', 'error.log', 'config.json'] as any) // ./logs
        .mockResolvedValueOnce(['access.log'] as any) // ./logs/system
        .mockRejectedValueOnce(new Error('Directory not found')) // ./logs/error
        .mockResolvedValueOnce(['debug.log'] as any); // ./logs/access

      vi.mocked(fs.stat)
        .mockResolvedValueOnce({ mtime: oldDate } as any) // system.log
        .mockResolvedValueOnce({ mtime: recentDate } as any) // error.log
        .mockResolvedValueOnce({ mtime: oldDate } as any) // config.json
        .mockResolvedValueOnce({ mtime: oldDate } as any) // access.log
        .mockResolvedValueOnce({ mtime: recentDate } as any); // debug.log

      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const deleted = await retentionManager.cleanupOldFileLogs();

      expect(deleted).toBe(3); // system.log, access.log, and debug.log (config.json is not a log file)
      expect(fs.unlink).toHaveBeenCalledTimes(3);
    });

    it('should handle directory access errors gracefully', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'));

      const deleted = await retentionManager.cleanupOldFileLogs();

      expect(deleted).toBe(0);
    });
  });

  describe('anonymizeOldRecords', () => {
    it('should anonymize device IDs, RFID cards, and IP addresses', async () => {
      // Mock device ID records
      vi.mocked(mockDb.all)
        .mockResolvedValueOnce([
          { id: 1, device_id: 'device123', details: '{"device_hash":"hash123"}' },
          { id: 2, device_id: 'device456', details: '{}' }
        ])
        .mockResolvedValueOnce([
          { id: 3, rfid_card: 'card123' }
        ])
        .mockResolvedValueOnce([
          { id: 4, details: '{"ip_address":"192.168.1.100"}' }
        ]);

      vi.mocked(mockDb.run).mockResolvedValue({ changes: 1 } as any);

      const anonymized = await retentionManager.anonymizeOldRecords();

      expect(anonymized).toBe(4); // 2 device IDs + 1 RFID card + 1 IP address
      expect(mockDb.run).toHaveBeenCalledTimes(4); // 2 device updates + 1 RFID update + 1 IP update
    });
  });

  describe('getRetentionStatistics', () => {
    it('should return comprehensive retention statistics', async () => {
      vi.mocked(mockDb.get)
        .mockResolvedValueOnce({ count: 1000 }) // total events
        .mockResolvedValueOnce({ count: 200 }) // 0-7 days
        .mockResolvedValueOnce({ count: 300 }) // 8-30 days
        .mockResolvedValueOnce({ count: 400 }) // 31-90 days
        .mockResolvedValueOnce({ count: 100 }) // 90+ days
        .mockResolvedValueOnce({ count: 50 }) // anonymized records
        .mockResolvedValueOnce({ count: 150 }); // estimated cleanup

      const stats = await retentionManager.getRetentionStatistics();

      expect(stats.total_events).toBe(1000);
      expect(stats.events_by_age['0-7 days']).toBe(200);
      expect(stats.events_by_age['8-30 days']).toBe(300);
      expect(stats.events_by_age['31-90 days']).toBe(400);
      expect(stats.events_by_age['90+ days']).toBe(100);
      expect(stats.anonymized_records).toBe(50);
      expect(stats.estimated_cleanup_size).toBe(150);
      expect(stats.next_cleanup_date).toBeInstanceOf(Date);
      expect(stats.retention_config).toBeDefined();
    });
  });

  describe('createAnonymizedExport', () => {
    it('should create anonymized data export', async () => {
      const fromDate = new Date('2024-01-01');
      const toDate = new Date('2024-01-31');

      const mockRecords = [
        {
          timestamp: '2024-01-15T10:00:00Z',
          kiosk_id: 'kiosk-1',
          locker_id: 5,
          event_type: 'rfid_assign',
          rfid_card: 'anon_export_card', // Simulating the CASE statement result
          device_id: 'anon_export_device', // Simulating the CASE statement result
          staff_user: null,
          details: '{"ip_address":"192.168.1.100","user_agent":"Mozilla/5.0"}'
        },
        {
          timestamp: '2024-01-16T11:00:00Z',
          kiosk_id: 'kiosk-1',
          locker_id: 6,
          event_type: 'staff_open',
          rfid_card: null,
          device_id: null,
          staff_user: 'admin1',
          details: '{"reason":"user assistance"}'
        }
      ];

      vi.mocked(mockDb.all).mockResolvedValue(mockRecords);

      const exportData = await retentionManager.createAnonymizedExport(fromDate, toDate);

      expect(exportData.export_id).toMatch(/^export_/);
      expect(exportData.from_date).toEqual(fromDate);
      expect(exportData.to_date).toEqual(toDate);
      expect(exportData.record_count).toBe(2);
      expect(exportData.anonymization_applied).toBe(true);
      expect(exportData.data).toHaveLength(2);

      // Check anonymization
      const firstRecord = exportData.data[0];
      expect(firstRecord.rfid_card).toBe('anon_export_card');
      expect(firstRecord.device_id).toBe('anon_export_device');
      expect(firstRecord.details.ip_address).toBe('anon_export_ip');
      expect(firstRecord.details.user_agent).toBe('anon_user_agent');

      // Staff user should be preserved
      const secondRecord = exportData.data[1];
      expect(secondRecord.staff_user).toBe('admin1');
    });

    it('should filter by event types when specified', async () => {
      const fromDate = new Date('2024-01-01');
      const toDate = new Date('2024-01-31');
      const includeTypes = ['rfid_assign', 'rfid_release'];

      vi.mocked(mockDb.all).mockResolvedValue([]);

      await retentionManager.createAnonymizedExport(fromDate, toDate, includeTypes);

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('AND event_type IN (?, ?)'),
        expect.arrayContaining(['rfid_assign', 'rfid_release'])
      );
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      const newConfig = {
        event_retention_days: 60,
        anonymization_enabled: false
      };

      retentionManager.updateConfig(newConfig);
      const currentConfig = retentionManager.getConfig();

      expect(currentConfig.event_retention_days).toBe(60);
      expect(currentConfig.anonymization_enabled).toBe(false);
      expect(currentConfig.audit_retention_days).toBe(90); // Should preserve other values
    });

    it('should return current configuration', () => {
      const currentConfig = retentionManager.getConfig();

      expect(currentConfig.event_retention_days).toBe(30);
      expect(currentConfig.audit_retention_days).toBe(90);
      expect(currentConfig.file_log_retention_days).toBe(7);
      expect(currentConfig.anonymization_enabled).toBe(true);
    });
  });

  describe('Automatic Cleanup', () => {
    it('should start automatic cleanup with correct interval', () => {
      const mockSetInterval = vi.spyOn(global, 'setInterval');
      
      const timer = retentionManager.startAutomaticCleanup();

      expect(mockSetInterval).toHaveBeenCalledWith(
        expect.any(Function),
        24 * 60 * 60 * 1000 // 24 hours in milliseconds
      );

      clearInterval(timer);
      mockSetInterval.mockRestore();
    });
  });

  describe('Data Anonymization', () => {
    it('should hash sensitive data consistently', async () => {
      const hashMethod = (retentionManager as any).hashSensitiveData.bind(retentionManager);
      
      const hash1 = hashMethod('sensitive_data');
      const hash2 = hashMethod('sensitive_data');
      const hash3 = hashMethod('different_data');

      expect(hash1).toBe(hash2); // Same input should produce same hash
      expect(hash1).not.toBe(hash3); // Different input should produce different hash
      expect(hash1).toMatch(/^anon_[a-f0-9]{16}$/); // Should match expected format
    });

    it('should identify log files correctly', () => {
      const isLogFile = (retentionManager as any).isLogFile.bind(retentionManager);

      expect(isLogFile('system.log')).toBe(true);
      expect(isLogFile('error.log.2024-01-01')).toBe(true);
      expect(isLogFile('access.log.1')).toBe(true);
      expect(isLogFile('error.txt')).toBe(true);
      expect(isLogFile('debug.out')).toBe(true);
      
      expect(isLogFile('config.json')).toBe(false);
      expect(isLogFile('data.db')).toBe(false);
      expect(isLogFile('readme.md')).toBe(false);
    });

    it('should anonymize details for export correctly', () => {
      const anonymizeDetails = (retentionManager as any).anonymizeDetailsForExport.bind(retentionManager);

      const details = anonymizeDetails('{"ip_address":"192.168.1.100","device_hash":"hash123","user_agent":"Mozilla/5.0","other_field":"keep_this"}');

      expect(details.ip_address).toBe('anon_export_ip');
      expect(details.device_hash).toBe('anon_export_hash');
      expect(details.user_agent).toBe('anon_user_agent');
      expect(details.other_field).toBe('keep_this');
    });

    it('should handle invalid JSON in details gracefully', () => {
      const anonymizeDetails = (retentionManager as any).anonymizeDetailsForExport.bind(retentionManager);

      const details = anonymizeDetails('invalid json');

      expect(details).toEqual({});
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors during anonymization', async () => {
      vi.mocked(mockDb.all)
        .mockResolvedValueOnce([
          { id: 1, device_id: 'device123', details: '{}' }
        ])
        .mockResolvedValueOnce([]) // RFID cards
        .mockResolvedValueOnce([]); // IP addresses
      
      vi.mocked(mockDb.run).mockRejectedValue(new Error('Database error'));

      // Should not throw, but continue processing
      const anonymized = await retentionManager.anonymizeOldRecords();
      
      expect(anonymized).toBe(0); // No records successfully anonymized due to error
    });

    it('should handle file system errors during log cleanup', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['test.log'] as any);
      vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date(0) } as any); // Very old file
      vi.mocked(fs.unlink).mockRejectedValue(new Error('Permission denied'));

      // Should not throw, but continue processing
      const deleted = await retentionManager.cleanupOldFileLogs();
      
      expect(deleted).toBe(0); // No files successfully deleted
    });
  });

  describe('Export ID Generation', () => {
    it('should generate unique export IDs', () => {
      const generateId = (retentionManager as any).generateExportId.bind(retentionManager);

      const id1 = generateId();
      const id2 = generateId();

      expect(id1).toMatch(/^export_\d+_[a-z0-9]{9}$/);
      expect(id2).toMatch(/^export_\d+_[a-z0-9]{9}$/);
      expect(id1).not.toBe(id2);
    });
  });
});