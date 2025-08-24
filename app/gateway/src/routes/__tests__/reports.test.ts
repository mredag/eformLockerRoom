/**
 * Unit tests for Reports API Routes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { reportsRoutes } from '../reports';

// Mock ReportingService
vi.mock('../../../../../shared/services/reporting-service', () => ({
  ReportingService: vi.fn().mockImplementation(() => ({
    getBasicStatistics: vi.fn(),
    getDailyUsage: vi.fn(),
    getLockerStatusOverview: vi.fn(),
    exportDailyEventsCSV: vi.fn(),
    formatCSV: vi.fn(),
    getWeeklyUsage: vi.fn(),
  })),
}));

describe('Reports Routes', () => {
  let fastify: FastifyInstance;
  let mockReportingService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    fastify = Fastify();
    
    // Mock sqlite database
    const mockDb = {};
    fastify.decorate('sqlite', mockDb);
    
    // Get the mocked ReportingService constructor
    const { ReportingService } = await import('../../../../../shared/services/reporting-service');
    mockReportingService = new (ReportingService as any)();
    
    await fastify.register(reportsRoutes);
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /api/reports/statistics', () => {
    it('should return basic statistics', async () => {
      const mockStats = {
        today: {
          date: '2024-01-15',
          total_opens: 25,
          rfid_opens: 15,
          qr_opens: 8,
          staff_opens: 2,
          unique_users: 18,
        },
        this_week: {
          date: '2024-01-09 to 2024-01-15',
          total_opens: 150,
          rfid_opens: 90,
          qr_opens: 45,
          staff_opens: 15,
          unique_users: 85,
        },
        locker_overview: {
          total_lockers: 100,
          free_lockers: 25,
          owned_lockers: 70,
          blocked_lockers: 5,
          vip_lockers: 15,
          utilization_rate: 70,
        },
      };

      mockReportingService.getBasicStatistics.mockResolvedValue(mockStats);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/reports/statistics',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockStats);
      expect(body.timestamp).toBeDefined();
    });

    it('should handle service errors', async () => {
      mockReportingService.getBasicStatistics.mockRejectedValue(new Error('Database error'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/reports/statistics',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Failed to retrieve statistics');
    });
  });

  describe('GET /api/reports/daily-usage', () => {
    it('should return daily usage for specified date', async () => {
      const mockUsage = {
        date: '2024-01-15',
        total_opens: 25,
        rfid_opens: 15,
        qr_opens: 8,
        staff_opens: 2,
        unique_users: 18,
      };

      mockReportingService.getDailyUsage.mockResolvedValue(mockUsage);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/reports/daily-usage?date=2024-01-15',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockUsage);
      expect(mockReportingService.getDailyUsage).toHaveBeenCalledWith('2024-01-15');
    });

    it('should use current date when no date specified', async () => {
      const today = new Date().toISOString().split('T')[0];
      const mockUsage = {
        date: today,
        total_opens: 10,
        rfid_opens: 8,
        qr_opens: 2,
        staff_opens: 0,
        unique_users: 9,
      };

      mockReportingService.getDailyUsage.mockResolvedValue(mockUsage);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/reports/daily-usage',
      });

      expect(response.statusCode).toBe(200);
      expect(mockReportingService.getDailyUsage).toHaveBeenCalledWith(today);
    });
  });

  describe('GET /api/reports/locker-status', () => {
    it('should return locker status overview', async () => {
      const mockStatus = {
        total_lockers: 100,
        free_lockers: 25,
        owned_lockers: 70,
        blocked_lockers: 5,
        vip_lockers: 15,
        utilization_rate: 70,
      };

      mockReportingService.getLockerStatusOverview.mockResolvedValue(mockStatus);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/reports/locker-status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockStatus);
    });
  });

  describe('GET /api/reports/export/daily-events', () => {
    it('should export daily events as CSV', async () => {
      const mockCsvData = {
        filename: 'daily-events-2024-01-15.csv',
        headers: ['Timestamp', 'Kiosk ID', 'Event Type'],
        rows: [
          ['2024-01-15 10:30:00', 'kiosk1', 'rfid_assign'],
          ['2024-01-15 11:15:00', 'kiosk1', 'staff_open'],
        ],
        generated_at: new Date(),
      };

      const mockCsvContent = 'Timestamp,Kiosk ID,Event Type\n2024-01-15 10:30:00,kiosk1,rfid_assign\n2024-01-15 11:15:00,kiosk1,staff_open';

      mockReportingService.exportDailyEventsCSV.mockResolvedValue(mockCsvData);
      mockReportingService.formatCSV.mockReturnValue(mockCsvContent);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/reports/export/daily-events?date=2024-01-15',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/csv');
      expect(response.headers['content-disposition']).toBe('attachment; filename="daily-events-2024-01-15.csv"');
      expect(response.body).toBe(mockCsvContent);
    });
  });

  describe('GET /api/reports/weekly-usage', () => {
    it('should return weekly usage for specified date range', async () => {
      const mockWeeklyUsage = {
        date: '2024-01-09 to 2024-01-15',
        total_opens: 150,
        rfid_opens: 90,
        qr_opens: 45,
        staff_opens: 15,
        unique_users: 85,
      };

      mockReportingService.getWeeklyUsage.mockResolvedValue(mockWeeklyUsage);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/reports/weekly-usage?start_date=2024-01-09&end_date=2024-01-15',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockWeeklyUsage);
      expect(mockReportingService.getWeeklyUsage).toHaveBeenCalledWith('2024-01-09', '2024-01-15');
    });

    it('should use default date range when not specified', async () => {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const mockWeeklyUsage = {
        date: `${startDate} to ${endDate}`,
        total_opens: 100,
        rfid_opens: 60,
        qr_opens: 30,
        staff_opens: 10,
        unique_users: 55,
      };

      mockReportingService.getWeeklyUsage.mockResolvedValue(mockWeeklyUsage);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/reports/weekly-usage',
      });

      expect(response.statusCode).toBe(200);
      expect(mockReportingService.getWeeklyUsage).toHaveBeenCalledWith(startDate, endDate);
    });
  });
});