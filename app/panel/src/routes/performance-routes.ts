/**
 * Performance Monitoring API Routes
 * 
 * Provides endpoints for performance metrics and monitoring dashboard
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Database } from 'sqlite3';
import { PerformanceMonitor } from '../../../../shared/services/performance-monitor';
import { DatabaseManager } from '../../../../shared/database/database-manager';

interface PerformanceRouteParams {
  kioskId: string;
}

interface LockerStatsQuery {
  days?: string;
}

export async function performanceRoutes(fastify: FastifyInstance) {
  const dbManager = DatabaseManager.getInstance();
  const db = dbManager.getConnection();
  const performanceMonitor = new PerformanceMonitor(db);
  
  // Initialize performance monitoring
  await performanceMonitor.initialize();

  // Performance dashboard page
  fastify.get('/performance', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.type('text/html').sendFile('performance-dashboard.html');
  });

  // Get current performance metrics for a kiosk
  fastify.get('/api/performance/metrics/:kioskId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          kioskId: { type: 'string' }
        },
        required: ['kioskId']
      },
      querystring: {
        type: 'object',
        properties: {
          hours: { type: 'number', default: 24 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: PerformanceRouteParams; Querystring: { hours?: number } }>, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params;
      const hours = request.query.hours || 24;

      const metrics = await performanceMonitor.getCurrentMetrics(kioskId, hours);
      
      return reply.send({
        success: true,
        data: metrics,
        kioskId,
        period: `${hours} hours`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch performance metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get locker usage statistics
  fastify.get('/api/performance/locker-stats/:kioskId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          kioskId: { type: 'string' }
        },
        required: ['kioskId']
      },
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'number', default: 7 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: PerformanceRouteParams; Querystring: LockerStatsQuery }>, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params;
      const days = parseInt(request.query.days || '7');

      const stats = await performanceMonitor.getLockerUsageStats(kioskId, days);
      
      return reply.send({
        success: true,
        data: stats,
        kioskId,
        period: `${days} days`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching locker stats:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch locker statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Check performance criteria
  fastify.get('/api/performance/criteria/:kioskId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          kioskId: { type: 'string' }
        },
        required: ['kioskId']
      }
    }
  }, async (request: FastifyRequest<{ Params: PerformanceRouteParams }>, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params;

      const criteria = await performanceMonitor.checkPerformanceCriteria(kioskId);
      
      return reply.send({
        success: true,
        data: criteria,
        kioskId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error checking performance criteria:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to check performance criteria',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get performance trends
  fastify.get('/api/performance/trends/:kioskId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          kioskId: { type: 'string' }
        },
        required: ['kioskId']
      },
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'hour' },
          limit: { type: 'number', default: 24 }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Params: PerformanceRouteParams; 
    Querystring: { period?: 'hour' | 'day' | 'week' | 'month'; limit?: number } 
  }>, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params;
      const period = request.query.period || 'hour';
      const limit = request.query.limit || 24;

      const trends = await performanceMonitor.getPerformanceTrends(kioskId, period, limit);
      
      return reply.send({
        success: true,
        data: trends,
        kioskId,
        period,
        limit,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching performance trends:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch performance trends',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Create performance snapshot
  fastify.post('/api/performance/snapshot/:kioskId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          kioskId: { type: 'string' }
        },
        required: ['kioskId']
      },
      body: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['hour', 'day', 'week', 'month'] }
        },
        required: ['period']
      }
    }
  }, async (request: FastifyRequest<{ 
    Params: PerformanceRouteParams; 
    Body: { period: 'hour' | 'day' | 'week' | 'month' } 
  }>, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params;
      const { period } = request.body;

      await performanceMonitor.createPerformanceSnapshot(kioskId, period);
      
      return reply.send({
        success: true,
        message: `Performance snapshot created for ${kioskId} (${period})`,
        kioskId,
        period,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error creating performance snapshot:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to create performance snapshot',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Record UI performance event (for kiosk to report)
  fastify.post('/api/performance/ui-event', {
    schema: {
      body: {
        type: 'object',
        properties: {
          kioskId: { type: 'string' },
          eventType: { type: 'string', enum: ['state_update', 'session_start', 'locker_selection', 'ui_render'] },
          latency: { type: 'number' },
          success: { type: 'boolean' },
          errorMessage: { type: 'string' }
        },
        required: ['kioskId', 'eventType', 'latency', 'success']
      }
    }
  }, async (request: FastifyRequest<{ 
    Body: { 
      kioskId: string; 
      eventType: 'state_update' | 'session_start' | 'locker_selection' | 'ui_render';
      latency: number;
      success: boolean;
      errorMessage?: string;
    } 
  }>, reply: FastifyReply) => {
    try {
      const { kioskId, eventType, latency, success, errorMessage } = request.body;

      await performanceMonitor.recordUIPerformance(kioskId, eventType, latency, success, errorMessage);
      
      return reply.send({
        success: true,
        message: 'UI performance event recorded',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error recording UI performance event:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to record UI performance event',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Record session metrics (for session manager to report)
  fastify.post('/api/performance/session-start', {
    schema: {
      body: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          kioskId: { type: 'string' },
          cardId: { type: 'string' }
        },
        required: ['sessionId', 'kioskId', 'cardId']
      }
    }
  }, async (request: FastifyRequest<{ 
    Body: { sessionId: string; kioskId: string; cardId: string } 
  }>, reply: FastifyReply) => {
    try {
      const { sessionId, kioskId, cardId } = request.body;

      await performanceMonitor.recordSessionStart(sessionId, kioskId, cardId);
      
      return reply.send({
        success: true,
        message: 'Session start recorded',
        sessionId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error recording session start:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to record session start',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  fastify.post('/api/performance/session-end', {
    schema: {
      body: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          outcome: { type: 'string', enum: ['completed', 'timeout', 'cancelled', 'error'] },
          selectedLockerId: { type: 'number' },
          timeToSelection: { type: 'number' }
        },
        required: ['sessionId', 'outcome']
      }
    }
  }, async (request: FastifyRequest<{ 
    Body: { 
      sessionId: string; 
      outcome: 'completed' | 'timeout' | 'cancelled' | 'error';
      selectedLockerId?: number;
      timeToSelection?: number;
    } 
  }>, reply: FastifyReply) => {
    try {
      const { sessionId, outcome, selectedLockerId, timeToSelection } = request.body;

      await performanceMonitor.recordSessionEnd(sessionId, outcome, selectedLockerId, timeToSelection);
      
      return reply.send({
        success: true,
        message: 'Session end recorded',
        sessionId,
        outcome,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error recording session end:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to record session end',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Cleanup old performance data
  fastify.delete('/api/performance/cleanup', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          retentionDays: { type: 'number', default: 30 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { retentionDays?: number } }>, reply: FastifyReply) => {
    try {
      const retentionDays = request.query.retentionDays || 30;

      await performanceMonitor.cleanupOldData(retentionDays);
      
      return reply.send({
        success: true,
        message: `Performance data cleanup completed (${retentionDays} days retention)`,
        retentionDays,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error cleaning up performance data:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to cleanup performance data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}