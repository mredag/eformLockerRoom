/**
 * Basic Reporting Service
 * Provides simple daily usage counts, locker status overview, and CSV export
 */

import { Database } from 'sqlite3';
import { EventType } from '../types/core-entities';

export interface DailyUsageStats {
  date: string;
  total_opens: number;
  rfid_opens: number;
  qr_opens: number;
  staff_opens: number;
  unique_users: number;
}

export interface LockerStatusOverview {
  total_lockers: number;
  free_lockers: number;
  owned_lockers: number;
  blocked_lockers: number;
  vip_lockers: number;
  utilization_rate: number;
}

export interface BasicStatistics {
  today: DailyUsageStats;
  this_week: DailyUsageStats;
  locker_overview: LockerStatusOverview;
}

export interface CsvExportData {
  filename: string;
  headers: string[];
  rows: string[][];
  generated_at: Date;
}

export class ReportingService {
  constructor(private db: Database) {}

  /**
   * Get basic daily usage statistics
   */
  async getDailyUsage(date: string): Promise<DailyUsageStats> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          DATE(timestamp) as date,
          COUNT(*) as total_opens,
          COUNT(CASE WHEN event_type = 'rfid_assign' THEN 1 END) as rfid_opens,
          COUNT(CASE WHEN event_type = 'qr_assign' THEN 1 END) as qr_opens,
          COUNT(CASE WHEN event_type = 'staff_open' THEN 1 END) as staff_opens,
          COUNT(DISTINCT COALESCE(rfid_card, device_id)) as unique_users
        FROM events 
        WHERE DATE(timestamp) = ? 
          AND event_type IN ('rfid_assign', 'qr_assign', 'staff_open')
        GROUP BY DATE(timestamp)
      `;

      this.db.get(query, [date], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          date,
          total_opens: row?.total_opens || 0,
          rfid_opens: row?.rfid_opens || 0,
          qr_opens: row?.qr_opens || 0,
          staff_opens: row?.staff_opens || 0,
          unique_users: row?.unique_users || 0,
        });
      });
    });
  }

  /**
   * Get weekly usage statistics (sum of daily stats)
   */
  async getWeeklyUsage(startDate: string, endDate: string): Promise<DailyUsageStats> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as total_opens,
          COUNT(CASE WHEN event_type = 'rfid_assign' THEN 1 END) as rfid_opens,
          COUNT(CASE WHEN event_type = 'qr_assign' THEN 1 END) as qr_opens,
          COUNT(CASE WHEN event_type = 'staff_open' THEN 1 END) as staff_opens,
          COUNT(DISTINCT COALESCE(rfid_card, device_id)) as unique_users
        FROM events 
        WHERE DATE(timestamp) BETWEEN ? AND ?
          AND event_type IN ('rfid_assign', 'qr_assign', 'staff_open')
      `;

      this.db.get(query, [startDate, endDate], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          date: `${startDate} to ${endDate}`,
          total_opens: row?.total_opens || 0,
          rfid_opens: row?.rfid_opens || 0,
          qr_opens: row?.qr_opens || 0,
          staff_opens: row?.staff_opens || 0,
          unique_users: row?.unique_users || 0,
        });
      });
    });
  }

  /**
   * Get current locker status overview
   */
  async getLockerStatusOverview(): Promise<LockerStatusOverview> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as total_lockers,
          COUNT(CASE WHEN status = 'Free' THEN 1 END) as free_lockers,
          COUNT(CASE WHEN status = 'Owned' THEN 1 END) as owned_lockers,
          COUNT(CASE WHEN status = 'Blocked' THEN 1 END) as blocked_lockers,
          COUNT(CASE WHEN is_vip = 1 THEN 1 END) as vip_lockers
        FROM lockers
      `;

      this.db.get(query, [], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        const total = row?.total_lockers || 0;
        const owned = row?.owned_lockers || 0;
        const utilization_rate = total > 0 ? Math.round((owned / total) * 100) : 0;

        resolve({
          total_lockers: total,
          free_lockers: row?.free_lockers || 0,
          owned_lockers: owned,
          blocked_lockers: row?.blocked_lockers || 0,
          vip_lockers: row?.vip_lockers || 0,
          utilization_rate,
        });
      });
    });
  }

  /**
   * Get basic statistics for dashboard
   */
  async getBasicStatistics(): Promise<BasicStatistics> {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [todayStats, weekStats, lockerOverview] = await Promise.all([
      this.getDailyUsage(today),
      this.getWeeklyUsage(weekAgo, today),
      this.getLockerStatusOverview(),
    ]);

    return {
      today: todayStats,
      this_week: weekStats,
      locker_overview: lockerOverview,
    };
  }

  /**
   * Export daily events as CSV
   */
  async exportDailyEventsCSV(date: string): Promise<CsvExportData> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          timestamp,
          kiosk_id,
          locker_id,
          event_type,
          rfid_card,
          device_id,
          staff_user,
          details
        FROM events 
        WHERE DATE(timestamp) = ?
        ORDER BY timestamp DESC
      `;

      this.db.all(query, [date], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const headers = [
          'Timestamp',
          'Kiosk ID',
          'Locker ID',
          'Event Type',
          'RFID Card',
          'Device ID',
          'Staff User',
          'Details'
        ];

        const csvRows = rows.map(row => [
          row.timestamp,
          row.kiosk_id || '',
          row.locker_id || '',
          row.event_type,
          row.rfid_card || '',
          row.device_id || '',
          row.staff_user || '',
          row.details || ''
        ]);

        resolve({
          filename: `daily-events-${date}.csv`,
          headers,
          rows: csvRows,
          generated_at: new Date(),
        });
      });
    });
  }

  /**
   * Convert CSV data to string format
   */
  formatCSV(csvData: CsvExportData): string {
    const lines = [csvData.headers.join(',')];
    
    csvData.rows.forEach(row => {
      const escapedRow = row.map(cell => {
        const cellStr = String(cell);
        // Escape quotes and wrap in quotes if contains comma or quote
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      });
      lines.push(escapedRow.join(','));
    });

    return lines.join('\n');
  }
}