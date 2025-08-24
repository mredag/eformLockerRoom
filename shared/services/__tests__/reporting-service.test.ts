/**
 * Unit tests for ReportingService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReportingService } from '../reporting-service';

// Mock sqlite3 Database
const mockDb = {
  get: vi.fn(),
  all: vi.fn(),
};

describe('ReportingService', () => {
  let reportingService: ReportingService;

  beforeEach(() => {
    vi.clearAllMocks();
    reportingService = new ReportingService(mockDb as any);
  });

  describe('getDailyUsage', () => {
    it('should return daily usage statistics', async () => {
      const mockRow = {
        date: '2024-01-15',
        total_opens: 25,
        rfid_opens: 15,
        qr_opens: 8,
        staff_opens: 2,
        unique_users: 18,
      };

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, mockRow);
      });

      const result = await reportingService.getDailyUsage('2024-01-15');

      expect(result).toEqual({
        date: '2024-01-15',
        total_opens: 25,
        rfid_opens: 15,
        qr_opens: 8,
        staff_opens: 2,
        unique_users: 18,
      });

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['2024-01-15'],
        expect.any(Function)
      );
    });

    it('should return zero stats when no data found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const result = await reportingService.getDailyUsage('2024-01-15');

      expect(result).toEqual({
        date: '2024-01-15',
        total_opens: 0,
        rfid_opens: 0,
        qr_opens: 0,
        staff_opens: 0,
        unique_users: 0,
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(error, null);
      });

      await expect(reportingService.getDailyUsage('2024-01-15')).rejects.toThrow('Database error');
    });
  });

  describe('getLockerStatusOverview', () => {
    it('should return locker status overview with utilization rate', async () => {
      const mockRow = {
        total_lockers: 100,
        free_lockers: 25,
        owned_lockers: 70,
        blocked_lockers: 5,
        vip_lockers: 15,
      };

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, mockRow);
      });

      const result = await reportingService.getLockerStatusOverview();

      expect(result).toEqual({
        total_lockers: 100,
        free_lockers: 25,
        owned_lockers: 70,
        blocked_lockers: 5,
        vip_lockers: 15,
        utilization_rate: 70, // 70/100 * 100
      });
    });

    it('should handle zero lockers without division error', async () => {
      const mockRow = {
        total_lockers: 0,
        free_lockers: 0,
        owned_lockers: 0,
        blocked_lockers: 0,
        vip_lockers: 0,
      };

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, mockRow);
      });

      const result = await reportingService.getLockerStatusOverview();

      expect(result.utilization_rate).toBe(0);
    });
  });

  describe('exportDailyEventsCSV', () => {
    it('should export daily events as CSV data', async () => {
      const mockRows = [
        {
          timestamp: '2024-01-15 10:30:00',
          kiosk_id: 'kiosk1',
          locker_id: 5,
          event_type: 'rfid_assign',
          rfid_card: 'CARD123',
          device_id: null,
          staff_user: null,
          details: '{}',
        },
        {
          timestamp: '2024-01-15 11:15:00',
          kiosk_id: 'kiosk1',
          locker_id: 12,
          event_type: 'staff_open',
          rfid_card: null,
          device_id: null,
          staff_user: 'admin',
          details: '{"reason":"maintenance"}',
        },
      ];

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, mockRows);
      });

      const result = await reportingService.exportDailyEventsCSV('2024-01-15');

      expect(result.filename).toBe('daily-events-2024-01-15.csv');
      expect(result.headers).toEqual([
        'Timestamp',
        'Kiosk ID',
        'Locker ID',
        'Event Type',
        'RFID Card',
        'Device ID',
        'Staff User',
        'Details'
      ]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual([
        '2024-01-15 10:30:00',
        'kiosk1',
        5,
        'rfid_assign',
        'CARD123',
        '',
        '',
        '{}'
      ]);
    });
  });

  describe('formatCSV', () => {
    it('should format CSV data correctly', () => {
      const csvData = {
        filename: 'test.csv',
        headers: ['Name', 'Value', 'Description'],
        rows: [
          ['Test Item', '123', 'Simple description'],
          ['Complex Item', '456', 'Description with, comma'],
          ['Quote Item', '789', 'Description with "quotes"'],
        ],
        generated_at: new Date(),
      };

      const result = reportingService.formatCSV(csvData);

      const lines = result.split('\n');
      expect(lines[0]).toBe('Name,Value,Description');
      expect(lines[1]).toBe('Test Item,123,Simple description');
      expect(lines[2]).toBe('Complex Item,456,"Description with, comma"');
      expect(lines[3]).toBe('Quote Item,789,"Description with ""quotes"""');
    });
  });
});