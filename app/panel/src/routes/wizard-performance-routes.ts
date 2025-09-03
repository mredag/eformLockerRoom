/**
 * Hardware Configuration Wizard - Performance Monitoring API Routes
 * 
 * Provides endpoints for wizard-specific performance metrics, alerts, and optimization
 * recommendations.
 * 
 * Requirements: 10.4, 10.5, 10.6
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Database } from 'sqlite3';
import { WizardPerformanceMonitor } from '../../../../shared/services/wizard-performance-monitor';
import { WizardCacheService } from '../../../../shared/services/wizard-cache-service';
import { WizardResourceManager } from '../../../../shared/services/wizard-resource-manager';
import { DatabaseManager } from '../../../../shared/database/database-manager';

interface WizardPerformanceParams {
  operationId?: string;
  alertId?: string;
  recommendationId?: string;
}

interface PerformanceQuery {
  hours?: string;
  days?: string;
  limit?: string;
}

interface StartOperationBody {
  operationId: string;
  operationType: 'device_scan' | 'address_config' | 'hardware_test' | 'system_integration' | 'full_wizard';
  metadata?: any;
}

interface CompleteOperationBody {
  operationId: string;
  success: boolean;
  errorMessage?: string;
}

interface ResourceUsageBody {
  timestamp: number;
  memoryUsage: {
    used: number;
    free: number;
    total: number;
    percentage: number;
  };
  cpuUsage: {
    user: number;
    system: number;
    idle: number;
    percentage: number;
  };
  networkStats: {
    latency: number;
    throughput: number;
    errors: number;
  };
}

export async function wizardPerformanceRoutes(fastify: FastifyInstance) {
  const dbManager = DatabaseManager.getInstance();
  const dbConnection = dbManager.getConnection();
  const db = dbConnection.getDatabase();
  
  const performanceMonitor = new WizardPerformanceMonitor(db);
  const cacheService = new WizardCacheService();
  const resourceManager = new WizardResourceManager();
  
  // Initialize services
  await performanceMonitor.initialize();

  // Performance dashboard page
  fastify.get('/wizard/performance', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.type('text/html').sendFile('wizard-performance-dashboard.html');
  });

  // Start operation tracking
  fastify.post('/api/wizard/performance/operation/start', {
    schema: {
      body: {
        type: 'object',
        properties: {
          operationId: { type: 'string' },
          operationType: { 
            type: 'string', 
            enum: ['device_scan', 'address_config', 'hardware_test', 'system_integration', 'full_wizard'] 
          },
          metadata: { type: 'object' }
        },
        required: ['operationId', 'operationType']
      }
    }
  }, async (request: FastifyRequest<{ Body: StartOperationBody }>, reply: FastifyReply) => {
    try {
      const { operationId, operationType, metadata } = request.body;

      performanceMonitor.startOperation(operationId, operationType, metadata);
      
      return reply.send({
        success: true,
        message: 'Operation tracking started',
        operationId,
        operationType,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error starting operation tracking:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to start operation tracking',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Complete operation tracking
  fastify.post('/api/wizard/performance/operation/complete', {
    schema: {
      body: {
        type: 'object',
        properties: {
          operationId: { type: 'string' },
          success: { type: 'boolean' },
          errorMessage: { type: 'string' }
        },
        required: ['operationId', 'success']
      }
    }
  }, async (request: FastifyRequest<{ Body: CompleteOperationBody }>, reply: FastifyReply) => {
    try {
      const { operationId, success, errorMessage } = request.body;

      performanceMonitor.completeOperation(operationId, success, errorMessage);
      
      return reply.send({
        success: true,
        message: 'Operation tracking completed',
        operationId,
        operationSuccess: success,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error completing operation tracking:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to complete operation tracking',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Record resource usage
  fastify.post('/api/wizard/performance/resource-usage', {
    schema: {
      body: {
        type: 'object',
        properties: {
          timestamp: { type: 'number' },
          memoryUsage: {
            type: 'object',
            properties: {
              used: { type: 'number' },
              free: { type: 'number' },
              total: { type: 'number' },
              percentage: { type: 'number' }
            },
            required: ['used', 'free', 'total', 'percentage']
          },
          cpuUsage: {
            type: 'object',
            properties: {
              user: { type: 'number' },
              system: { type: 'number' },
              idle: { type: 'number' },
              percentage: { type: 'number' }
            },
            required: ['user', 'system', 'idle', 'percentage']
          },
          networkStats: {
            type: 'object',
            properties: {
              latency: { type: 'number' },
              throughput: { type: 'number' },
              errors: { type: 'number' }
            },
            required: ['latency', 'throughput', 'errors']
          }
        },
        required: ['timestamp', 'memoryUsage', 'cpuUsage', 'networkStats']
      }
    }
  }, async (request: FastifyRequest<{ Body: ResourceUsageBody }>, reply: FastifyReply) => {
    try {
      await performanceMonitor.recordResourceUsage(request.body);
      
      return reply.send({
        success: true,
        message: 'Resource usage recorded',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error recording resource usage:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to record resource usage',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get current wizard performance metrics
  fastify.get('/api/wizard/performance/metrics', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          hours: { type: 'number', default: 24 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: PerformanceQuery }>, reply: FastifyReply) => {
    try {
      const hours = parseInt(request.query.hours || '24');
      const metrics = await performanceMonitor.getCurrentMetrics(hours);
      
      return reply.send({
        success: true,
        data: metrics,
        period: `${hours} hours`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching wizard performance metrics:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch performance metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get performance alerts
  fastify.get('/api/wizard/performance/alerts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const activeAlerts = performanceMonitor.getActiveAlerts();
      
      return reply.send({
        success: true,
        data: activeAlerts,
        count: activeAlerts.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching performance alerts:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch performance alerts',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Acknowledge performance alert
  fastify.post('/api/wizard/performance/alerts/:alertId/acknowledge', {
    schema: {
      params: {
        type: 'object',
        properties: {
          alertId: { type: 'string' }
        },
        required: ['alertId']
      }
    }
  }, async (request: FastifyRequest<{ Params: WizardPerformanceParams }>, reply: FastifyReply) => {
    try {
      const { alertId } = request.params;
      
      if (!alertId) {
        return reply.status(400).send({
          success: false,
          error: 'Alert ID is required'
        });
      }

      await performanceMonitor.acknowledgeAlert(alertId);
      
      return reply.send({
        success: true,
        message: 'Alert acknowledged',
        alertId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to acknowledge alert',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get optimization recommendations
  fastify.get('/api/wizard/performance/recommendations', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const recommendations = await performanceMonitor.generateRecommendations();
      
      return reply.send({
        success: true,
        data: recommendations,
        count: recommendations.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch recommendations',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Mark recommendation as implemented
  fastify.post('/api/wizard/performance/recommendations/:recommendationId/implement', {
    schema: {
      params: {
        type: 'object',
        properties: {
          recommendationId: { type: 'string' }
        },
        required: ['recommendationId']
      }
    }
  }, async (request: FastifyRequest<{ Params: WizardPerformanceParams }>, reply: FastifyReply) => {
    try {
      const { recommendationId } = request.params;
      
      if (!recommendationId) {
        return reply.status(400).send({
          success: false,
          error: 'Recommendation ID is required'
        });
      }

      await performanceMonitor.implementRecommendation(recommendationId);
      
      return reply.send({
        success: true,
        message: 'Recommendation marked as implemented',
        recommendationId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error implementing recommendation:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to implement recommendation',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get cache statistics
  fastify.get('/api/wizard/performance/cache/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cacheStats = cacheService.getStats();
      
      return reply.send({
        success: true,
        data: cacheStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching cache stats:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch cache statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Invalidate cache
  fastify.delete('/api/wizard/performance/cache/invalidate', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['device', 'session', 'config', 'all'] },
          key: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { type?: string; key?: string } }>, reply: FastifyReply) => {
    try {
      const { type, key } = request.query;
      
      switch (type) {
        case 'device':
          cacheService.invalidateDeviceCache(key);
          break;
        case 'session':
          cacheService.invalidateSessionCache(key);
          break;
        case 'config':
          // Would need to implement config cache invalidation
          break;
        case 'all':
        default:
          cacheService.invalidateDeviceCache();
          cacheService.invalidateSessionCache();
          break;
      }
      
      return reply.send({
        success: true,
        message: `Cache invalidated: ${type || 'all'}`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error invalidating cache:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to invalidate cache',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get resource manager statistics
  fastify.get('/api/wizard/performance/resources/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const resourceReport = resourceManager.generateUsageReport();
      
      return reply.send({
        success: true,
        data: resourceReport,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching resource stats:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch resource statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Optimize resources
  fastify.post('/api/wizard/performance/resources/optimize', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await resourceManager.optimize();
      
      return reply.send({
        success: true,
        message: 'Resource optimization completed',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error optimizing resources:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to optimize resources',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Trigger garbage collection
  fastify.post('/api/wizard/performance/gc', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      cacheService.performGarbageCollection();
      
      return reply.send({
        success: true,
        message: 'Garbage collection triggered',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error triggering garbage collection:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to trigger garbage collection',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Performance health check
  fastify.get('/api/wizard/performance/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = await performanceMonitor.getCurrentMetrics(1); // Last hour
      const cacheStats = cacheService.getStats();
      const resourceReport = resourceManager.generateUsageReport();
      const activeAlerts = performanceMonitor.getActiveAlerts();

      const health = {
        status: 'healthy',
        checks: {
          performance: {
            status: activeAlerts.filter(a => a.type === 'critical').length === 0 ? 'healthy' : 'unhealthy',
            criticalAlerts: activeAlerts.filter(a => a.type === 'critical').length,
            totalAlerts: activeAlerts.length
          },
          cache: {
            status: cacheStats.memoryUsage.total < 100 * 1024 * 1024 ? 'healthy' : 'warning', // 100MB threshold
            hitRate: (cacheStats.device.hitRate + cacheStats.session.hitRate + cacheStats.config.hitRate) / 3,
            memoryUsage: cacheStats.memoryUsage.total
          },
          resources: {
            status: resourceReport.memoryUsage.percentage < 80 ? 'healthy' : 'warning',
            memoryPercentage: resourceReport.memoryUsage.percentage,
            recommendations: resourceReport.recommendations.length
          }
        },
        timestamp: new Date().toISOString()
      };

      // Determine overall status
      const checkStatuses = Object.values(health.checks).map(check => check.status);
      if (checkStatuses.includes('unhealthy')) {
        health.status = 'unhealthy';
      } else if (checkStatuses.includes('warning')) {
        health.status = 'warning';
      }

      return reply.send({
        success: true,
        data: health
      });
    } catch (error) {
      console.error('Error checking performance health:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to check performance health',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Cleanup old performance data
  fastify.delete('/api/wizard/performance/cleanup', {
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
      await performanceMonitor.cleanup(retentionDays);
      
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

  // Shutdown hook to cleanup services
  fastify.addHook('onClose', async () => {
    performanceMonitor.shutdown();
    await cacheService.shutdown();
    await resourceManager.shutdown();
  });
}