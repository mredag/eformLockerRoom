import { DatabaseConnection } from '../database/connection';
import { EventLogger } from './event-logger';
import { EventType } from '../types/core-entities';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/**
 * Manages the retention and anonymization of logs and database records
 * to maintain system performance and protect user privacy.
 */
export class LogRetentionManager {
  private db: DatabaseConnection;
  private eventLogger: EventLogger;
  private config: RetentionConfig;

  /**
   * Creates an instance of LogRetentionManager.
   * @param {DatabaseConnection} db - The database connection.
   * @param {EventLogger} eventLogger - The logger for recording cleanup events.
   * @param {Partial<RetentionConfig>} [config={}] - Optional configuration overrides.
   */
  constructor(
    db: DatabaseConnection,
    eventLogger: EventLogger,
    config: Partial<RetentionConfig> = {}
  ) {
    this.db = db;
    this.eventLogger = eventLogger;
    this.config = {
      event_retention_days: 30,
      audit_retention_days: 90,
      system_log_retention_days: 7,
      file_log_retention_days: 30,
      anonymization_enabled: true,
      hash_salt: 'eform_locker_salt_2024',
      cleanup_interval_hours: 24,
      batch_size: 1000,
      ...config
    };
  }

  /**
   * Runs a comprehensive cleanup process, including deleting old events and files,
   * and anonymizing old records.
   * @returns {Promise<CleanupResult>} A summary of the cleanup operation.
   */
  async runCleanup(): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      timestamp: new Date(),
      events_deleted: 0,
      files_deleted: 0,
      records_anonymized: 0,
      errors: [],
      execution_time_ms: 0
    };

    try {
      result.events_deleted = await this.cleanupOldEvents();
      result.files_deleted = await this.cleanupOldFileLogs();
      if (this.config.anonymization_enabled) {
        result.records_anonymized = await this.anonymizeOldRecords();
      }

      await this.eventLogger.logEvent(
        'system',
        'log_cleanup_completed' as EventType,
        {
          events_deleted: result.events_deleted,
          files_deleted: result.files_deleted,
          records_anonymized: result.records_anonymized,
          execution_time_ms: Date.now() - startTime
        }
      );

    } catch (error) {
      result.errors.push((error as Error).message);
      
      await this.eventLogger.logEvent(
        'system',
        'log_cleanup_error' as EventType,
        {
          error: (error as Error).message,
          partial_results: result
        }
      );
    }

    result.execution_time_ms = Date.now() - startTime;
    return result;
  }

  /**
   * Deletes old event records from the database based on the configured retention periods.
   * @returns {Promise<number>} The total number of event records deleted.
   */
  async cleanupOldEvents(): Promise<number> {
    let totalDeleted = 0;

    const eventCutoff = new Date();
    eventCutoff.setDate(eventCutoff.getDate() - this.config.event_retention_days);

    const eventDeleteSql = `
      DELETE FROM events 
      WHERE timestamp < ? 
        AND event_type NOT LIKE 'staff_%'
        AND event_type NOT LIKE 'vip_%'
        AND event_type != 'bulk_open'
    `;

    const eventResult = await this.db.run(eventDeleteSql, [eventCutoff.toISOString()]);
    totalDeleted += eventResult.changes;

    const auditCutoff = new Date();
    auditCutoff.setDate(auditCutoff.getDate() - this.config.audit_retention_days);

    const auditDeleteSql = `
      DELETE FROM events 
      WHERE timestamp < ? 
        AND (
          event_type LIKE 'staff_%' 
          OR event_type LIKE 'vip_%' 
          OR event_type = 'bulk_open'
        )
    `;

    const auditResult = await this.db.run(auditDeleteSql, [auditCutoff.toISOString()]);
    totalDeleted += auditResult.changes;

    return totalDeleted;
  }

  /**
   * Deletes old log files from the file system based on the configured retention period.
   * @returns {Promise<number>} The total number of files deleted.
   */
  async cleanupOldFileLogs(): Promise<number> {
    const logDirectories = [
      './logs',
      './logs/system',
      './logs/error',
      './logs/access'
    ];

    let totalDeleted = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.file_log_retention_days);

    for (const logDir of logDirectories) {
      try {
        const files = await fs.readdir(logDir);
        
        for (const file of files) {
          if (this.isLogFile(file)) {
            const filePath = path.join(logDir, file);
            const stats = await fs.stat(filePath);
            
            if (stats.mtime < cutoffDate) {
              await fs.unlink(filePath);
              totalDeleted++;
            }
          }
        }
      } catch (error) {
        continue;
      }
    }

    return totalDeleted;
  }

  /**
   * Anonymizes sensitive data in old database records to protect user privacy.
   * @returns {Promise<number>} The total number of records anonymized.
   */
  async anonymizeOldRecords(): Promise<number> {
    let totalAnonymized = 0;
    totalAnonymized += await this.anonymizeDeviceIds();
    totalAnonymized += await this.anonymizeRfidCards();
    totalAnonymized += await this.anonymizeIpAddresses();
    return totalAnonymized;
  }

  /**
   * Anonymizes device IDs in old event records.
   * @private
   */
  private async anonymizeDeviceIds(): Promise<number> {
    try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    const sql = `
      UPDATE events 
      SET device_id = ?, details = ?
      WHERE device_id IS NOT NULL 
        AND timestamp < ?
        AND device_id NOT LIKE 'anon_%'
    `;

    interface DeviceRecord {
      id: number;
      device_id: string;
      details: string;
    }
    const records = await this.db.all<DeviceRecord>(
      `SELECT id, device_id, details FROM events 
       WHERE device_id IS NOT NULL 
         AND timestamp < ?
         AND device_id NOT LIKE 'anon_%'
       LIMIT ?`,
      [cutoffDate.toISOString(), this.config.batch_size]
    );

    let anonymized = 0;
    for (const record of records) {
      const anonymizedDeviceId = this.hashSensitiveData(record.device_id);
      let details = {};
      
      try {
        details = JSON.parse(record.details || '{}');
      } catch {
        details = {};
      }

      if ((details as any).device_hash) {
        (details as any).device_hash = anonymizedDeviceId;
      }

      await this.db.run(
        'UPDATE events SET device_id = ?, details = ? WHERE id = ?',
        [anonymizedDeviceId, JSON.stringify(details), record.id]
      );
      
      anonymized++;
    }

    return anonymized;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Anonymizes RFID card numbers in old event records.
   * @private
   */
  private async anonymizeRfidCards(): Promise<number> {
    try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const records = await this.db.all(
      `SELECT id, rfid_card FROM events 
       WHERE rfid_card IS NOT NULL 
         AND timestamp < ?
         AND rfid_card NOT LIKE 'anon_%'
       LIMIT ?`,
      [cutoffDate.toISOString(), this.config.batch_size]
    );

    let anonymized = 0;
    for (const record of records) {
      const anonymizedCard = this.hashSensitiveData((record as any).rfid_card);
      
      await this.db.run(
        'UPDATE events SET rfid_card = ? WHERE id = ?',
        [anonymizedCard, (record as any).id]
      );
      
      anonymized++;
    }

    return anonymized;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Anonymizes IP addresses stored in the details of old event records.
   * @private
   */
  private async anonymizeIpAddresses(): Promise<number> {
    try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 1);

    const records = await this.db.all(
      `SELECT id, details FROM events 
       WHERE (event_type = 'qr_assign' OR event_type = 'qr_release')
         AND timestamp < ?
         AND details LIKE '%ip_address%'
       LIMIT ?`,
      [cutoffDate.toISOString(), this.config.batch_size]
    );

    let anonymized = 0;
    for (const record of records) {
      try {
        const details = JSON.parse((record as any).details || '{}');
        
        if (details.ip_address && !details.ip_address.startsWith('anon_')) {
          details.ip_address = this.hashSensitiveData(details.ip_address);
          
          await this.db.run(
            'UPDATE events SET details = ? WHERE id = ?',
            [JSON.stringify(details), (record as any).id]
          );
          
          anonymized++;
        }
      } catch {
        continue;
      }
    }

    return anonymized;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Hashes sensitive data using a salted SHA-256 algorithm for anonymization.
   * @private
   * @param {string} data - The data to hash.
   * @returns {string} The anonymized (hashed) string.
   */
  private hashSensitiveData(data: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(data + this.config.hash_salt)
      .digest('hex')
      .substring(0, 16);
    
    return `anon_${hash}`;
  }

  /**
   * Checks if a filename matches common log file patterns.
   * @private
   * @param {string} filename - The filename to check.
   * @returns {boolean} True if the file is identified as a log file.
   */
  private isLogFile(filename: string): boolean {
    const logExtensions = ['.log', '.txt', '.out'];
    const logPatterns = [
      /\.log$/,
      /\.log\.\d+$/,
      /\.log\.\d{4}-\d{2}-\d{2}$/,
      /error\.txt$/,
      /access\.log$/,
      /system\.log$/
    ];

    return logPatterns.some(pattern => pattern.test(filename)) ||
           logExtensions.some(ext => filename.endsWith(ext));
  }

  /**
   * Retrieves statistics about data retention, including record counts by age and estimated cleanup size.
   * @returns {Promise<RetentionStatistics>} An object containing retention statistics.
   */
  async getRetentionStatistics(): Promise<RetentionStatistics> {
    const stats: RetentionStatistics = {
      total_events: 0,
      events_by_age: {},
      anonymized_records: 0,
      file_logs_count: 0,
      estimated_cleanup_size: 0,
      next_cleanup_date: new Date(),
      retention_config: this.config
    };

    const totalResult = await this.db.get('SELECT COUNT(*) as count FROM events');
    stats.total_events = (totalResult as any)?.count || 0;

    const ageRanges = [
      { label: '0-7 days', days: 7 },
      { label: '8-30 days', days: 30 },
      { label: '31-90 days', days: 90 },
      { label: '90+ days', days: 999999 }
    ];

    let previousDays = 0;
    for (const range of ageRanges) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - range.days);
      
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - previousDays);

      const sql = previousDays === 0 
        ? 'SELECT COUNT(*) as count FROM events WHERE timestamp >= ?'
        : 'SELECT COUNT(*) as count FROM events WHERE timestamp >= ? AND timestamp < ?';
      
      const params = previousDays === 0 ? [startDate.toISOString()] : [startDate.toISOString(), endDate.toISOString()];
      
      const result = await this.db.get(sql, params);
      stats.events_by_age[range.label] = (result as any)?.count || 0;
      
      previousDays = range.days;
    }

    const anonymizedResult = await this.db.get(`
      SELECT COUNT(*) as count FROM events 
      WHERE device_id LIKE 'anon_%' 
         OR rfid_card LIKE 'anon_%'
         OR details LIKE '%"ip_address":"anon_%'
    `);
    stats.anonymized_records = (anonymizedResult as any)?.count || 0;

    const eventCutoff = new Date();
    eventCutoff.setDate(eventCutoff.getDate() - this.config.event_retention_days);
    
    const cleanupResult = await this.db.get(
      'SELECT COUNT(*) as count FROM events WHERE timestamp < ? AND event_type NOT LIKE \'staff_%\'',
      [eventCutoff.toISOString()]
    );
    stats.estimated_cleanup_size = (cleanupResult as any)?.count || 0;

    stats.next_cleanup_date = new Date();
    stats.next_cleanup_date.setHours(stats.next_cleanup_date.getHours() + this.config.cleanup_interval_hours);

    return stats;
  }

  /**
   * Creates an anonymized export of event data for compliance or analysis purposes.
   * @param {Date} fromDate - The start date for the export.
   * @param {Date} toDate - The end date for the export.
   * @param {string[]} [includeTypes=[]] - An optional array of event types to include.
   * @returns {Promise<AnonymizedExport>} The exported data.
   */
  async createAnonymizedExport(
    fromDate: Date,
    toDate: Date,
    includeTypes: string[] = []
  ): Promise<AnonymizedExport> {
    const exportData: AnonymizedExport = {
      export_id: this.generateExportId(),
      created_at: new Date(),
      from_date: fromDate,
      to_date: toDate,
      record_count: 0,
      anonymization_applied: true,
      data: []
    };

    let sql = `
      SELECT 
        timestamp,
        kiosk_id,
        locker_id,
        event_type,
        CASE 
          WHEN rfid_card LIKE 'anon_%' THEN rfid_card
          ELSE ? 
        END as rfid_card,
        CASE 
          WHEN device_id LIKE 'anon_%' THEN device_id
          ELSE ?
        END as device_id,
        staff_user,
        details
      FROM events 
      WHERE timestamp >= ? AND timestamp <= ?
    `;

    const params = [
      'anon_export_card',
      'anon_export_device',
      fromDate.toISOString(),
      toDate.toISOString()
    ];

    if (includeTypes.length > 0) {
      sql += ` AND event_type IN (${includeTypes.map(() => '?').join(', ')})`;
      params.push(...includeTypes);
    }

    sql += ' ORDER BY timestamp DESC';

    const records = await this.db.all(sql, params);

    exportData.data = records.map((record: any) => ({
      timestamp: (record as any).timestamp,
      kiosk_id: (record as any).kiosk_id,
      locker_id: (record as any).locker_id,
      event_type: (record as any).event_type,
      rfid_card: (record as any).rfid_card,
      device_id: (record as any).device_id,
      staff_user: (record as any).staff_user,
      details: this.anonymizeDetailsForExport((record as any).details)
    }));

    exportData.record_count = exportData.data.length;

    return exportData;
  }

  /**
   * Anonymizes the details of an event record for export.
   * @private
   * @param {string} detailsJson - The JSON string of the event details.
   * @returns {Record<string, any>} The anonymized details object.
   */
  private anonymizeDetailsForExport(detailsJson: string): Record<string, any> {
    try {
      const details = JSON.parse(detailsJson || '{}');
      
      if (details.ip_address && !details.ip_address.startsWith('anon_')) {
        details.ip_address = 'anon_export_ip';
      }
      
      if (details.device_hash && !details.device_hash.startsWith('anon_')) {
        details.device_hash = 'anon_export_hash';
      }
      
      if (details.user_agent) {
        details.user_agent = 'anon_user_agent';
      }
      
      return details;
    } catch {
      return {};
    }
  }

  /**
   * Generates a unique ID for a data export.
   * @private
   * @returns {string} The unique export ID.
   */
  private generateExportId(): string {
    return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Schedules the automatic cleanup process to run at a regular interval.
   * @returns {NodeJS.Timeout} The timer object for the scheduled task.
   */
  startAutomaticCleanup(): NodeJS.Timeout {
    const intervalMs = this.config.cleanup_interval_hours * 60 * 60 * 1000;
    
    return setInterval(async () => {
      try {
        await this.runCleanup();
      } catch (error) {
        console.error('Automatic cleanup failed:', error);
      }
    }, intervalMs);
  }

  /**
   * Updates the retention configuration settings.
   * @param {Partial<RetentionConfig>} newConfig - The new configuration values to apply.
   */
  updateConfig(newConfig: Partial<RetentionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Gets the current retention configuration.
   * @returns {RetentionConfig} The current configuration object.
   */
  getConfig(): RetentionConfig {
    return { ...this.config };
  }
}

/**
 * Defines the configuration options for the log retention and anonymization service.
 */
export interface RetentionConfig {
  event_retention_days: number;
  audit_retention_days: number;
  system_log_retention_days: number;
  file_log_retention_days: number;
  anonymization_enabled: boolean;
  hash_salt: string;
  cleanup_interval_hours: number;
  batch_size: number;
}

/**
 * Represents the result of a single cleanup operation.
 */
export interface CleanupResult {
  timestamp: Date;
  events_deleted: number;
  files_deleted: number;
  records_anonymized: number;
  errors: string[];
  execution_time_ms: number;
}

/**
 * Represents statistics about the current data retention state.
 */
export interface RetentionStatistics {
  total_events: number;
  events_by_age: Record<string, number>;
  anonymized_records: number;
  file_logs_count: number;
  estimated_cleanup_size: number;
  next_cleanup_date: Date;
  retention_config: RetentionConfig;
}

/**
 * Represents the structure of an anonymized data export.
 */
export interface AnonymizedExport {
  export_id: string;
  created_at: Date;
  from_date: Date;
  to_date: Date;
  record_count: number;
  anonymization_applied: boolean;
  data: AnonymizedRecord[];
}

/**
 * Represents a single anonymized record within a data export.
 */
export interface AnonymizedRecord {
  timestamp: string;
  kiosk_id: string;
  locker_id?: number;
  event_type: string;
  rfid_card?: string;
  device_id?: string;
  staff_user?: string;
  details: Record<string, any>;
}
