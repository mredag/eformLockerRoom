/**
 * Reports API Routes
 * Provides basic reporting endpoints for daily usage, locker status, and CSV export
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ReportingService } from '../../../../shared/services/reporting-service';
import { Database } from 'sqlite3';

interface ReportsQueryParams {
  date?: string;
  start_date?: string;
  end_date?: string;
}

export async function reportsRoutes(fastify: FastifyInstance) {
  const db = fastify.sqlite as Database;
  const reportingService = new ReportingService(db);

  // Get basic statistics for dashboard
  fastify.get('/api/reports/statistics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const statistics = await reportingService.getBasicStatistics();
      
      reply.send({
        success: true,
        data: statistics,
        timestamp: new Date(),
      });
    } catch (error) {
      fastify.log.error('Failed to get basic statistics:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve statistics',
        timestamp: new Date(),
      });
    }
  });

  // Get daily usage statistics
  fastify.get<{ Querystring: ReportsQueryParams }>(
    '/api/reports/daily-usage',
    async (request: FastifyRequest<{ Querystring: ReportsQueryParams }>, reply: FastifyReply) => {
      try {
        const { date } = request.query;
        const targetDate = date || new Date().toISOString().split('T')[0];
        
        const dailyUsage = await reportingService.getDailyUsage(targetDate);
        
        reply.send({
          success: true,
          data: dailyUsage,
          timestamp: new Date(),
        });
      } catch (error) {
        fastify.log.error('Failed to get daily usage:', error);
        reply.status(500).send({
          success: false,
          error: 'Failed to retrieve daily usage statistics',
          timestamp: new Date(),
        });
      }
    }
  );

  // Get locker status overview
  fastify.get('/api/reports/locker-status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const lockerStatus = await reportingService.getLockerStatusOverview();
      
      reply.send({
        success: true,
        data: lockerStatus,
        timestamp: new Date(),
      });
    } catch (error) {
      fastify.log.error('Failed to get locker status:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve locker status overview',
        timestamp: new Date(),
      });
    }
  });

  // Export daily events as CSV
  fastify.get<{ Querystring: ReportsQueryParams }>(
    '/api/reports/export/daily-events',
    async (request: FastifyRequest<{ Querystring: ReportsQueryParams }>, reply: FastifyReply) => {
      try {
        const { date } = request.query;
        const targetDate = date || new Date().toISOString().split('T')[0];
        
        const csvData = await reportingService.exportDailyEventsCSV(targetDate);
        const csvContent = reportingService.formatCSV(csvData);
        
        reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', `attachment; filename="${csvData.filename}"`)
          .send(csvContent);
      } catch (error) {
        fastify.log.error('Failed to export daily events:', error);
        reply.status(500).send({
          success: false,
          error: 'Failed to export daily events',
          timestamp: new Date(),
        });
      }
    }
  );

  // Get weekly usage statistics
  fastify.get<{ Querystring: ReportsQueryParams }>(
    '/api/reports/weekly-usage',
    async (request: FastifyRequest<{ Querystring: ReportsQueryParams }>, reply: FastifyReply) => {
      try {
        const { start_date, end_date } = request.query;
        
        // Default to last 7 days if not specified
        const endDate = end_date || new Date().toISOString().split('T')[0];
        const startDate = start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const weeklyUsage = await reportingService.getWeeklyUsage(startDate, endDate);
        
        reply.send({
          success: true,
          data: weeklyUsage,
          timestamp: new Date(),
        });
      } catch (error) {
        fastify.log.error('Failed to get weekly usage:', error);
        reply.status(500).send({
          success: false,
          error: 'Failed to retrieve weekly usage statistics',
          timestamp: new Date(),
        });
      }
    }
  );
}