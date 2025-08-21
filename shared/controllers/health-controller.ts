import { FastifyRequest, FastifyReply } from 'fastify';
import { HealthMonitor } from '../services/health-monitor.js';
import { HealthCheckResponse } from '../../src/types/core-entities.js';

/**
 * Health Check Controller
 * Provides standardized health endpoints for all services
 * Requirements: 10.3, 10.5
 */
export class HealthController {
  private healthMonitor: HealthMonitor;

  constructor(healthMonitor: HealthMonitor) {
    this.healthMonitor = healthMonitor;
  }

  /**
   * Basic health check endpoint
   * GET /health
   */
  async getHealth(request: FastifyRequest, reply: FastifyReply): Promise<HealthCheckResponse> {
    try {
      const health = await this.healthMonitor.getSystemHealth();
      
      // Set appropriate HTTP status based on health
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;
      
      reply.code(statusCode);
      return health;
    } catch (error) {
      reply.code(503);
      return {
        status: 'unhealthy',
        version: '1.0.0',
        uptime: 0,
        components: {
          database: 'error',
          hardware: 'error',
          network: 'error',
          services: 'error'
        },
        details: {
          error: (error as Error).message
        }
      };
    }
  }

  /**
   * Detailed health check with diagnostics
   * GET /health/detailed
   */
  async getDetailedHealth(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    try {
      const [health, diagnostics] = await Promise.all([
        this.healthMonitor.getSystemHealth(),
        this.healthMonitor.runDiagnostics()
      ]);

      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;
      
      reply.code(statusCode);
      return {
        ...health,
        diagnostics
      };
    } catch (error) {
      reply.code(503);
      return {
        status: 'unhealthy',
        error: (error as Error).message
      };
    }
  }

  /**
   * Kiosk-specific health check
   * GET /health/kiosk/:kioskId
   */
  async getKioskHealth(
    request: FastifyRequest<{ Params: { kioskId: string } }>, 
    reply: FastifyReply
  ): Promise<any> {
    try {
      const { kioskId } = request.params;
      const kioskHealth = await this.healthMonitor.getKioskHealth(kioskId);
      
      // Determine status based on component health
      const hasErrors = kioskHealth.database.status === 'error' || 
                       kioskHealth.rs485.status === 'error';
      
      const statusCode = hasErrors ? 503 : 200;
      reply.code(statusCode);
      
      return {
        kiosk_id: kioskId,
        status: hasErrors ? 'unhealthy' : 'healthy',
        timestamp: new Date(),
        ...kioskHealth
      };
    } catch (error) {
      reply.code(503);
      return {
        kiosk_id: request.params.kioskId,
        status: 'unhealthy',
        error: (error as Error).message
      };
    }
  }

  /**
   * Generate diagnostic report
   * GET /health/diagnostics/report
   */
  async getDiagnosticReport(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    try {
      const report = await this.healthMonitor.generateDiagnosticReport();
      
      reply.type('text/plain');
      return report;
    } catch (error) {
      reply.code(500);
      return {
        error: 'Failed to generate diagnostic report',
        message: (error as Error).message
      };
    }
  }

  /**
   * Trigger log rotation
   * POST /health/maintenance/rotate-logs
   */
  async rotateLogFiles(
    request: FastifyRequest<{ 
      Body: { 
        log_directory?: string; 
        retention_days?: number; 
      } 
    }>, 
    reply: FastifyReply
  ): Promise<any> {
    try {
      const { log_directory = './logs', retention_days = 30 } = request.body || {};
      
      const result = await this.healthMonitor.rotateLogFiles(log_directory, retention_days);
      
      return {
        success: true,
        timestamp: new Date(),
        ...result
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Register health routes with Fastify instance
   */
  static registerRoutes(fastify: any, healthController: HealthController): void {
    // Basic health check
    fastify.get('/health', {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
              version: { type: 'string' },
              uptime: { type: 'number' },
              components: {
                type: 'object',
                properties: {
                  database: { type: 'string', enum: ['ok', 'error'] },
                  hardware: { type: 'string', enum: ['ok', 'error'] },
                  network: { type: 'string', enum: ['ok', 'error'] },
                  services: { type: 'string', enum: ['ok', 'error'] }
                }
              }
            }
          }
        }
      }
    }, healthController.getHealth.bind(healthController));

    // Detailed health check
    fastify.get('/health/detailed', {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: true
          }
        }
      }
    }, healthController.getDetailedHealth.bind(healthController));

    // Kiosk-specific health
    fastify.get('/health/kiosk/:kioskId', {
      schema: {
        params: {
          type: 'object',
          properties: {
            kioskId: { type: 'string' }
          },
          required: ['kioskId']
        }
      }
    }, healthController.getKioskHealth.bind(healthController));

    // Diagnostic report
    fastify.get('/health/diagnostics/report', {
      schema: {
        response: {
          200: {
            type: 'string'
          }
        }
      }
    }, healthController.getDiagnosticReport.bind(healthController));

    // Log rotation endpoint
    fastify.post('/health/maintenance/rotate-logs', {
      schema: {
        body: {
          type: 'object',
          properties: {
            log_directory: { type: 'string' },
            retention_days: { type: 'number', minimum: 1, maximum: 365 }
          }
        }
      }
    }, healthController.rotateLogFiles.bind(healthController));
  }
}