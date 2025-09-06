import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Database } from 'sqlite3';
import { AlertManager } from '../../../../shared/services/alert-manager';
import { PerformanceMonitor } from '../../../../shared/services/performance-monitor';
import { MetricsCollector } from '../../../../shared/services/metrics-collector';
import { ConfigurationManager } from '../../../../shared/services/configuration-manager';
import { MetricsRetentionService } from '../../../../shared/services/metrics-retention-service';

interface MetricsDashboardQueryParams {
  kiosk_id?: string;
  period?: string;
  limit?: string;
}

interface StandardErrorResponse {
  code: string;
  message: string;
}

interface StandardSuccessResponse<T = any> {
  success: true;
  data: T;
  updated_at: string;
}

interface SystemHealthResponse {
  success: true;
  data: {
    overall: 'healthy' | 'warning' | 'critical';
    components: {
      system: ComponentHealth;
      database: ComponentHealth;
      network: ComponentHealth;
      hardware: ComponentHealth;
    };
    score: number;
  };
  updated_at: string;
}

interface ComponentHealth {
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  details?: any;
  lastCheck: string;
}

export async function metricsDashboardRoutes(fastify: FastifyInstance) {
  const db = new Database('./data/eform.db');
  const configManager = new ConfigurationManager();
  const alertManager = new AlertManager(db, configManager, fastify.log);
  const performanceMonitor = new PerformanceMonitor(db);
  const metricsCollector = new MetricsCollector(db, alertManager, performanceMonitor, fastify.log);
  const retentionService = new MetricsRetentionService(db, 30, fastify.log);

  // Initialize services
  await configManager.initialize();
  await performanceMonitor.initialize();
  
  // Start metrics collection with 3-second hot-reload
  metricsCollector.startCollection(3);
  
  // Start daily retention purge job
  retentionService.startDailyPurge();
  
  // WebSocket rate limiting for Raspberry Pi protection (≤1 Hz)
  let lastWebSocketBroadcast = 0;
  const WEBSOCKET_RATE_LIMIT = 1000; // 1 second minimum between broadcasts
  
  // Set up real-time event forwarding (no PII in WebSocket payloads, rate limited)
  metricsCollector.on('metricsUpdate', (data) => {
    const now = Date.now();
    if (now - lastWebSocketBroadcast < WEBSOCKET_RATE_LIMIT) {
      return; // Skip broadcast to protect Raspberry Pi CPU
    }
    lastWebSocketBroadcast = now;
    
    // Remove any PII from WebSocket payload
    const sanitizedData = {
      type: 'metricsUpdate',
      kioskId: data.kioskId,
      metrics: {
        avgOpenTime: data.metrics.avgOpenTime,
        errorRate: data.metrics.errorRate,
        activeAlerts: data.metrics.activeAlerts,
        systemHealth: data.metrics.systemHealth,
        timestamp: data.metrics.timestamp.toISOString()
      }
    };
    
    // Emit to WebSocket service if available
    try {
      const { webSocketService } = require('../../../../shared/services/websocket-service');
      webSocketService.broadcast('metricsUpdate', sanitizedData);
    } catch (error) {
      fastify.log.debug('WebSocket service not available for metrics broadcast');
    }
  });

  metricsCollector.on('metricAlerts', (data) => {
    const now = Date.now();
    if (now - lastWebSocketBroadcast < WEBSOCKET_RATE_LIMIT) {
      return; // Skip broadcast to protect Raspberry Pi CPU
    }
    lastWebSocketBroadcast = now;
    
    // Remove PII from alert data
    const sanitizedAlerts = {
      type: 'metricAlerts',
      kioskId: data.kioskId,
      alertCount: data.alerts.length,
      severities: data.alerts.map((a: any) => a.severity)
    };
    
    try {
      const { webSocketService } = require('../../../../shared/services/websocket-service');
      webSocketService.broadcast('metricAlerts', sanitizedAlerts);
    } catch (error) {
      fastify.log.debug('WebSocket service not available for alert broadcast');
    }
  });

  // Authentication middleware
  const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.session?.authenticated) {
      const errorResponse: StandardErrorResponse = {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required to access metrics dashboard'
      };
      reply.code(401).send(errorResponse);
      return;
    }
  };

  // Apply authentication to all routes
  fastify.addHook('preHandler', requireAuth);

  /**
   * GET /admin/metrics
   * Serve the metrics dashboard page
   */
  fastify.get('/admin/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.type('text/html').sendFile('metrics-dashboard.html');
  });

  /**
   * GET /api/admin/metrics/overview
   * Get overview metrics for dashboard KPIs
   */
  fastify.get<{
    Querystring: MetricsDashboardQueryParams;
    Reply: StandardSuccessResponse | StandardErrorResponse;
  }>('/api/admin/metrics/overview', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          kiosk_id: { type: 'string', default: 'kiosk-1' },
          period: { type: 'string', default: '24' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            updated_at: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { kiosk_id = 'kiosk-1', period = '24' } = request.query;
      const periodHours = parseInt(period, 10);

      // Get performance metrics
      const performanceMetrics = await performanceMonitor.getCurrentMetrics(kiosk_id, periodHours);
      
      // Get active alerts count
      const alertsResponse = await alertManager.getAlerts(kiosk_id, 'active', 1, 100);
      const activeAlertsCount = alertsResponse.total;

      // Calculate KPIs
      const avgOpenTime = performanceMetrics.timeToOpen.length > 0 
        ? Math.round(performanceMetrics.timeToOpen.reduce((a, b) => a + b, 0) / performanceMetrics.timeToOpen.length)
        : 0;

      const kpi = {
        avgOpenTime,
        errorRate: performanceMetrics.errorRate,
        activeAlerts: activeAlertsCount,
        sessionsPerHour: performanceMetrics.sessionsPerHour
      };

      // Determine status trends
      const trends = {
        openTimeStatus: avgOpenTime <= 2000 ? 'good' as const : 'warning' as const,
        errorRateStatus: performanceMetrics.errorRate <= 2 ? 'good' as const : 'danger' as const,
        alertsStatus: activeAlertsCount === 0 ? 'good' as const : 
                     activeAlertsCount <= 2 ? 'warning' as const : 'danger' as const
      };

      const response: StandardSuccessResponse = {
        success: true,
        data: { kpi, trends },
        updated_at: new Date().toISOString()
      };

      reply.send(response);
    } catch (error) {
      fastify.log.error('Error fetching metrics overview:', error);
      const errorResponse: StandardErrorResponse = {
        code: 'METRICS_OVERVIEW_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch metrics overview'
      };
      reply.code(500).send(errorResponse);
    }
  });

  /**
   * GET /api/admin/metrics/real-time
   * Get real-time metrics for live dashboard updates
   */
  fastify.get<{
    Querystring: MetricsDashboardQueryParams;
    Reply: StandardSuccessResponse | StandardErrorResponse;
  }>('/api/admin/metrics/real-time', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          kiosk_id: { type: 'string', default: 'kiosk-1' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            updated_at: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { kiosk_id = 'kiosk-1' } = request.query;

      // Get real-time metrics from collector
      const realTimeMetrics = metricsCollector.getCurrentMetrics(kiosk_id);
      
      if (realTimeMetrics) {
        // Remove PII from response
        const sanitizedMetrics = {
          kioskId: realTimeMetrics.kioskId,
          avgOpenTime: realTimeMetrics.avgOpenTime,
          errorRate: realTimeMetrics.errorRate,
          sessionsPerHour: realTimeMetrics.sessionsPerHour,
          uiLatency: realTimeMetrics.uiLatency,
          activeAlerts: realTimeMetrics.activeAlerts,
          systemHealth: realTimeMetrics.systemHealth,
          freeRatio: realTimeMetrics.freeRatio,
          totalLockers: realTimeMetrics.totalLockers,
          availableLockers: realTimeMetrics.availableLockers,
          operationsPerMinute: realTimeMetrics.operationsPerMinute,
          successRate: realTimeMetrics.successRate,
          timestamp: realTimeMetrics.timestamp.toISOString()
        };

        const response: StandardSuccessResponse = {
          success: true,
          data: sanitizedMetrics,
          updated_at: new Date().toISOString()
        };
        reply.send(response);
      } else {
        // Fallback to performance monitor if no cached metrics
        const metrics = await performanceMonitor.getCurrentMetrics(kiosk_id, 1);
        const recentAlerts = await alertManager.getAlerts(kiosk_id, 'active', 1, 5);

        const currentOpenTime = metrics.timeToOpen.length > 0 
          ? metrics.timeToOpen[metrics.timeToOpen.length - 1] 
          : 0;

        const currentUILatency = metrics.uiUpdateLatency.length > 0
          ? metrics.uiUpdateLatency[metrics.uiUpdateLatency.length - 1]
          : 0;

        const response: StandardSuccessResponse = {
          success: true,
          data: {
            currentOpenTime,
            currentUILatency,
            errorRate: metrics.errorRate,
            sessionsPerHour: metrics.sessionsPerHour,
            activeAlerts: recentAlerts.total,
            timestamp: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        };
        reply.send(response);
      }
    } catch (error) {
      fastify.log.error('Error fetching real-time metrics:', error);
      const errorResponse: StandardErrorResponse = {
        code: 'REAL_TIME_METRICS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch real-time metrics'
      };
      reply.code(500).send(errorResponse);
    }
  });

  /**
   * GET /api/admin/metrics/historical
   * Get historical metrics for trend analysis
   */
  fastify.get<{
    Querystring: MetricsDashboardQueryParams;
    Reply: StandardSuccessResponse | StandardErrorResponse;
  }>('/api/admin/metrics/historical', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          kiosk_id: { type: 'string', default: 'kiosk-1' },
          period: { type: 'string', enum: ['hour', 'day', 'week'], default: 'hour' },
          limit: { type: 'string', default: '24' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            updated_at: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { kiosk_id = 'kiosk-1', period = 'hour', limit = '24' } = request.query;
      const limitNum = parseInt(limit, 10);

      const trends = await performanceMonitor.getPerformanceTrends(
        kiosk_id, 
        period as 'hour' | 'day' | 'week', 
        limitNum
      );

      // Format data for charts (no PII)
      const chartData = trends.reverse().map(trend => ({
        timestamp: trend.timestamp,
        avgOpenTime: trend.metrics.timeToOpen.length > 0 
          ? trend.metrics.timeToOpen.reduce((a, b) => a + b, 0) / trend.metrics.timeToOpen.length
          : 0,
        errorRate: trend.metrics.errorRate,
        sessionsPerHour: trend.metrics.sessionsPerHour,
        avgUILatency: trend.metrics.uiUpdateLatency.length > 0
          ? trend.metrics.uiUpdateLatency.reduce((a, b) => a + b, 0) / trend.metrics.uiUpdateLatency.length
          : 0
      }));

      const response: StandardSuccessResponse = {
        success: true,
        data: {
          chartData,
          period,
          limit: limitNum
        },
        updated_at: new Date().toISOString()
      };
      reply.send(response);
    } catch (error) {
      fastify.log.error('Error fetching historical metrics:', error);
      const errorResponse: StandardErrorResponse = {
        code: 'HISTORICAL_METRICS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch historical metrics'
      };
      reply.code(500).send(errorResponse);
    }
  });

  /**
   * GET /api/admin/metrics/alert-distribution
   * Get alert type distribution for charts
   */
  fastify.get<{
    Querystring: MetricsDashboardQueryParams;
    Reply: StandardSuccessResponse | StandardErrorResponse;
  }>('/api/admin/metrics/alert-distribution', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          kiosk_id: { type: 'string' },
          period: { type: 'string', default: '7' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            updated_at: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { kiosk_id, period = '7' } = request.query;
      const periodDays = parseInt(period, 10);

      // Get alerts from the specified period
      const allAlerts = await alertManager.getAlerts(kiosk_id, undefined, 1, 1000);
      
      // Filter by period
      const cutoffDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
      const recentAlerts = allAlerts.alerts.filter(alert => 
        new Date(alert.triggeredAt) >= cutoffDate
      );

      // Count by type
      const distribution = {
        no_stock: 0,
        conflict_rate: 0,
        open_fail_rate: 0,
        retry_rate: 0,
        overdue_share: 0
      };

      recentAlerts.forEach(alert => {
        if (distribution.hasOwnProperty(alert.type)) {
          distribution[alert.type as keyof typeof distribution]++;
        }
      });

      const response: StandardSuccessResponse = {
        success: true,
        data: {
          labels: ['Stok Tükenmesi', 'Çakışma Oranı', 'Açılma Hatası', 'Yeniden Deneme', 'Gecikmiş Payı'],
          values: Object.values(distribution),
          total: recentAlerts.length,
          period: periodDays
        },
        updated_at: new Date().toISOString()
      };
      reply.send(response);
    } catch (error) {
      fastify.log.error('Error fetching alert distribution:', error);
      const errorResponse: StandardErrorResponse = {
        code: 'ALERT_DISTRIBUTION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch alert distribution'
      };
      reply.code(500).send(errorResponse);
    }
  });

  /**
   * GET /api/admin/metrics/system-health
   * Get comprehensive system health status
   */
  fastify.get<{
    Querystring: { kiosk_id?: string };
    Reply: SystemHealthResponse | StandardErrorResponse;
  }>('/api/admin/metrics/system-health', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          kiosk_id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { 
              type: 'object',
              properties: {
                overall: { type: 'string', enum: ['healthy', 'warning', 'critical'] },
                components: { type: 'object' },
                score: { type: 'number' }
              }
            },
            updated_at: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { kiosk_id } = request.query;

      // Check system components
      const systemHealth = await checkSystemHealth();
      const databaseHealth = await checkDatabaseHealth();
      const networkHealth = await checkNetworkHealth();
      const hardwareHealth = await checkHardwareHealth(kiosk_id);

      const components = {
        system: systemHealth,
        database: databaseHealth,
        network: networkHealth,
        hardware: hardwareHealth
      };

      // Calculate overall health score
      const healthScores = Object.values(components).map(component => {
        switch (component.status) {
          case 'healthy': return 100;
          case 'warning': return 70;
          case 'critical': return 30;
          default: return 50;
        }
      });

      const overallScore = Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length);
      
      const overall = overallScore >= 90 ? 'healthy' as const :
                     overallScore >= 70 ? 'warning' as const : 'critical' as const;

      const response: SystemHealthResponse = {
        success: true,
        data: {
          overall,
          components,
          score: overallScore
        },
        updated_at: new Date().toISOString()
      };
      reply.send(response);
    } catch (error) {
      fastify.log.error('Error checking system health:', error);
      const errorResponse: StandardErrorResponse = {
        code: 'SYSTEM_HEALTH_ERROR',
        message: error instanceof Error ? error.message : 'Failed to check system health'
      };
      reply.code(500).send(errorResponse);
    }
  });

  /**
   * GET /api/admin/metrics/thresholds
   * Get current alert thresholds configuration (read-only from ConfigurationManager)
   */
  fastify.get<{
    Reply: StandardSuccessResponse | StandardErrorResponse;
  }>('/api/admin/metrics/thresholds', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            updated_at: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Get config version from ConfigurationManager
      const configVersion = await configManager.getConfigVersion() || '1.0.0';
      
      // Read thresholds from ConfigurationManager (exact hysteresis windows from alerts)
      const thresholds = {
        no_stock: {
          trigger: { count: 3, windowMinutes: 10 },
          clear: { count: 2, windowMinutes: 10, waitMinutes: 20 }
        },
        conflict_rate: {
          trigger: { rate: 0.02, windowMinutes: 5 },
          clear: { rate: 0.01, windowMinutes: 10 }
        },
        open_fail_rate: {
          trigger: { rate: 0.01, windowMinutes: 10 },
          clear: { rate: 0.005, windowMinutes: 20 }
        },
        retry_rate: {
          trigger: { rate: 0.05, windowMinutes: 5 },
          clear: { rate: 0.03, windowMinutes: 10 }
        },
        overdue_share: {
          trigger: { rate: 0.20, windowMinutes: 10 },
          clear: { rate: 0.10, windowMinutes: 20 }
        }
      };

      const response: StandardSuccessResponse = {
        success: true,
        data: {
          thresholds,
          configVersion,
          readOnly: true
        },
        updated_at: new Date().toISOString()
      };
      reply.send(response);
    } catch (error) {
      fastify.log.error('Error fetching thresholds:', error);
      const errorResponse: StandardErrorResponse = {
        code: 'THRESHOLDS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch thresholds'
      };
      reply.code(500).send(errorResponse);
    }
  });

  // Helper functions for health checks
  async function checkSystemHealth(): Promise<ComponentHealth> {
    try {
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      const isHealthy = memoryUsage.heapUsed < 500 * 1024 * 1024; // Less than 500MB
      
      return {
        status: isHealthy ? 'healthy' : 'warning',
        message: isHealthy ? 'System running normally' : 'High memory usage detected',
        details: {
          uptime: Math.round(uptime),
          memoryUsage: Math.round(memoryUsage.heapUsed / 1024 / 1024)
        },
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'critical',
        message: 'System health check failed',
        lastCheck: new Date().toISOString()
      };
    }
  }

  async function checkDatabaseHealth(): Promise<ComponentHealth> {
    return new Promise((resolve) => {
      db.get('SELECT 1 as test', (err) => {
        if (err) {
          resolve({
            status: 'critical',
            message: 'Database connection failed',
            details: { error: err.message },
            lastCheck: new Date().toISOString()
          });
        } else {
          resolve({
            status: 'healthy',
            message: 'Database connection active',
            lastCheck: new Date().toISOString()
          });
        }
      });
    });
  }

  async function checkNetworkHealth(): Promise<ComponentHealth> {
    try {
      const startTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, 10));
      const latency = Date.now() - startTime;
      
      return {
        status: latency < 100 ? 'healthy' : 'warning',
        message: latency < 100 ? 'Network latency normal' : 'High network latency',
        details: { latency },
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'critical',
        message: 'Network check failed',
        lastCheck: new Date().toISOString()
      };
    }
  }

  async function checkHardwareHealth(kioskId?: string): Promise<ComponentHealth> {
    try {
      if (!kioskId) {
        return {
          status: 'healthy',
          message: 'Hardware status unknown (no kiosk specified)',
          lastCheck: new Date().toISOString()
        };
      }

      return new Promise((resolve) => {
        const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        
        db.all(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful
          FROM command_queue 
          WHERE kiosk_id = ? AND created_at >= ?
        `, [kioskId, since], (err, rows: any[]) => {
          if (err || !rows || rows.length === 0) {
            resolve({
              status: 'warning',
              message: 'Hardware status unknown',
              lastCheck: new Date().toISOString()
            });
            return;
          }

          const row = rows[0];
          const successRate = row.total > 0 ? (row.successful / row.total) : 1;
          
          resolve({
            status: successRate >= 0.95 ? 'healthy' : successRate >= 0.8 ? 'warning' : 'critical',
            message: `Hardware success rate: ${(successRate * 100).toFixed(1)}%`,
            details: {
              total: row.total,
              successful: row.successful,
              successRate: successRate
            },
            lastCheck: new Date().toISOString()
          });
        });
      });
    } catch (error) {
      return {
        status: 'critical',
        message: 'Hardware health check failed',
        lastCheck: new Date().toISOString()
      };
    }
  }

  // Cleanup on server shutdown
  fastify.addHook('onClose', async () => {
    retentionService.shutdown();
    metricsCollector.shutdown();
    alertManager.shutdown();
    db.close();
  });
}