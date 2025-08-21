import { DatabaseConnection } from '../database/connection.js';
import { EventLogger } from './event-logger.js';
import { EventType } from '../../src/types/core-entities.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/**
 * Log Retention and Anonymization Manager
 * Implements automatic log cleanup and privacy protection
 * Requirements: Log Retention Policy
 */
export class LogRetentionManager {
  private db: DatabaseConnection;
  private eventLogger: EventLogger;
  private config: RetentionConfig;

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
   * Run comprehensive log cleanup
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
      // Clean up old events
      result.events_deleted = await this.cleanupOldEvents();

      // Clean up old file logs
      result.files_deleted = await this.cleanupOldFileLogs();

      // Anonymize old records
      if (this.config.anonymization_enabled) {
        result.records_anonymized = await this.anonymizeOldRecords();
      }

      // Log cleanup activity
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
   * Clean up old events based on retention policy
   */
  async cleanupOldEvents(): Promise<number> {
    let totalDeleted = 0;

    // Clean up regular events
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

    // Clean up audit events (staff actions) with longer retention
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
   * Clean up old file logs
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
        // Directory might not exist, continue with other directories
        continue;
      }
    }

    return totalDeleted;
  }

  /**
   * Anonymize old records for privacy protection
   */
  async anonymizeOldRecords(): Promise<number> {
    let totalAnonymized = 0;

    // Anonymize device IDs in old events
    totalAnonymized += await this.anonymizeDeviceIds();

    // Anonymize RFID cards in old events (keep recent for operational needs)
    totalAnonymized += await this.anonymizeRfidCards();

    // Anonymize IP addresses in QR access logs
    totalAnonymized += await this.anonymizeIpAddresses();

    return totalAnonymized;
  }

  /**
   * Anonymize device IDs in old events
   */
  private async anonymizeDeviceIds(): Promise<number> {
    try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Anonymize after 7 days

    const sql = `
      UPDATE events 
      SET device_id = ?, details = ?
      WHERE device_id IS NOT NULL 
        AND timestamp < ?
        AND device_id NOT LIKE 'anon_%'
    `;

    // Get records to anonymize
    const records = await this.db.all(
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

      // Update device_hash in details if present
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
   * Anonymize RFID cards in old events
   */
  private async anonymizeRfidCards(): Promise<number> {
    try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // Anonymize after 30 days

    // Get records to anonymize
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
      const anonymizedCard = this.hashSensitiveData(record.rfid_card);
      
      await this.db.run(
        'UPDATE events SET rfid_card = ? WHERE id = ?',
        [anonymizedCard, record.id]
      );
      
      anonymized++;
    }

    return anonymized;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Anonymize IP addresses in event details
   */
  private async anonymizeIpAddresses(): Promise<number> {
    try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 1); // Anonymize IP addresses after 1 day

    // Get QR access events with IP addresses
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
        const details = JSON.parse(record.details || '{}');
        
        if (details.ip_address && !details.ip_address.startsWith('anon_')) {
          details.ip_address = this.hashSensitiveData(details.ip_address);
          
          await this.db.run(
            'UPDATE events SET details = ? WHERE id = ?',
            [JSON.stringify(details), record.id]
          );
          
          anonymized++;
        }
      } catch {
        // Skip records with invalid JSON
        continue;
      }
    }

    return anonymized;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Hash sensitive data for anonymization
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
   * Check if file is a log file
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
   * Get retention statistics
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

    // Get total events
    const totalResult = await this.db.get('SELECT COUNT(*) as count FROM events');
    stats.total_events = totalResult?.count || 0;

    // Get events by age ranges
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
      stats.events_by_age[range.label] = result?.count || 0;
      
      previousDays = range.days;
    }

    // Count anonymized records
    const anonymizedResult = await this.db.get(`
      SELECT COUNT(*) as count FROM events 
      WHERE device_id LIKE 'anon_%' 
         OR rfid_card LIKE 'anon_%'
         OR details LIKE '%"ip_address":"anon_%'
    `);
    stats.anonymized_records = anonymizedResult?.count || 0;

    // Estimate cleanup size (events older than retention period)
    const eventCutoff = new Date();
    eventCutoff.setDate(eventCutoff.getDate() - this.config.event_retention_days);
    
    const cleanupResult = await this.db.get(
      'SELECT COUNT(*) as count FROM events WHERE timestamp < ? AND event_type NOT LIKE \'staff_%\'',
      [eventCutoff.toISOString()]
    );
    stats.estimated_cleanup_size = cleanupResult?.count || 0;

    // Calculate next cleanup date
    stats.next_cleanup_date = new Date();
    stats.next_cleanup_date.setHours(stats.next_cleanup_date.getHours() + this.config.cleanup_interval_hours);

    return stats;
  }

  /**
   * Create anonymized data export for compliance
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

    exportData.data = records.map(record => ({
      timestamp: record.timestamp,
      kiosk_id: record.kiosk_id,
      locker_id: record.locker_id,
      event_type: record.event_type,
      rfid_card: record.rfid_card,
      device_id: record.device_id,
      staff_user: record.staff_user,
      details: this.anonymizeDetailsForExport(record.details)
    }));

    exportData.record_count = exportData.data.length;

    return exportData;
  }

  /**
   * Anonymize details object for export
   */
  private anonymizeDetailsForExport(detailsJson: string): Record<string, any> {
    try {
      const details = JSON.parse(detailsJson || '{}');
      
      // Anonymize IP addresses
      if (details.ip_address && !details.ip_address.startsWith('anon_')) {
        details.ip_address = 'anon_export_ip';
      }
      
      // Anonymize device hashes
      if (details.device_hash && !details.device_hash.startsWith('anon_')) {
        details.device_hash = 'anon_export_hash';
      }
      
      // Remove user agent strings
      if (details.user_agent) {
        details.user_agent = 'anon_user_agent';
      }
      
      return details;
    } catch {
      return {};
    }
  }

  /**
   * Generate unique export ID
   */
  private generateExportId(): string {
    return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Schedule automatic cleanup
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
   * Update retention configuration
   */
  updateConfig(newConfig: Partial<RetentionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): RetentionConfig {
    return { ...this.config };
  }
}

// Type definitions
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

export interface CleanupResult {
  timestamp: Date;
  events_deleted: number;
  files_deleted: number;
  records_anonymized: number;
  errors: string[];
  execution_time_ms: number;
}

export interface RetentionStatistics {
  total_events: number;
  events_by_age: Record<string, number>;
  anonymized_records: number;
  file_logs_count: number;
  estimated_cleanup_size: number;
  next_cleanup_date: Date;
  retention_config: RetentionConfig;
}

export interface AnonymizedExport {
  export_id: string;
  created_at: Date;
  from_date: Date;
  to_date: Date;
  record_count: number;
  anonymization_applied: boolean;
  data: AnonymizedRecord[];
}

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