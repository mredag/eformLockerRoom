import { FastifyRequest, FastifyReply } from 'fastify';
import { HealthMonitor } from '../services/health-monitor';
import { HealthCheckResponse } from '../types/core-entities';

/**
 * Manages health check endpoints for all services.
 * This class provides standardized endpoints to monitor service health,
 * run diagnostics, and perform maintenance tasks like log rotation.
 * It integrates with a HealthMonitor to fetch the underlying health data.
 * @see HealthMonitor
 * @see {@link ../docs/SYSTEM_DOCUMENTATION.md#health-checks}
 */
export class HealthController {
  private healthMonitor: HealthMonitor;

  /**
   * Creates an instance of HealthController.
   * @param {HealthMonitor} healthMonitor - The service responsible for performing health checks.
   */
  constructor(healthMonitor: HealthMonitor) {
    this.healthMonitor = healthMonitor;
  }

  /**
   * Retrieves the basic health status of the system.
   * Responds with a 200 status for 'healthy' or 'degraded' states, and 503 for 'unhealthy'.
   * @route GET /health
   * @param {FastifyRequest} request - The request object from Fastify.
   * @param {FastifyReply} reply - The reply object from Fastify.
   * @returns {Promise<HealthCheckResponse>} A promise that resolves to the system's health status.
   */
  async getHealth(request: FastifyRequest, reply: FastifyReply): Promise<HealthCheckResponse> {
    try {
      const health = await this.healthMonitor.getSystemHealth();
      
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;
      
      reply.code(statusCode);
      return health;
    } catch (error) {
      reply.code(503);
      return {
        status: 'unhealthy',
        version: '1.0.0', // Consider making version dynamic
        uptime: process.uptime(),
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
   * Retrieves a detailed health status including diagnostic information.
   * @route GET /health/detailed
   * @param {FastifyRequest} request - The request object from Fastify.
   * @param {FastifyReply} reply - The reply object from Fastify.
   * @returns {Promise<any>} A promise that resolves to a detailed health report.
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
   * Retrieves the health status for a specific kiosk.
   * @route GET /health/kiosk/:kioskId
   * @param {FastifyRequest<{ Params: { kioskId: string } }>} request - The request, containing the kioskId parameter.
   * @param {FastifyReply} reply - The reply object from Fastify.
   * @returns {Promise<any>} A promise that resolves to the kiosk's health status.
   */
  async getKioskHealth(
    request: FastifyRequest<{ Params: { kioskId: string } }>, 
    reply: FastifyReply
  ): Promise<any> {
    try {
      const { kioskId } = request.params;
      const kioskHealth = await this.healthMonitor.getKioskHealth(kioskId);
      
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
   * Generates and returns a plain-text diagnostic report.
   * @route GET /health/diagnostics/report
   * @param {FastifyRequest} request - The request object from Fastify.
   * @param {FastifyReply} reply - The reply object from Fastify.
   * @returns {Promise<any>} A promise that resolves to the diagnostic report as a string.
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
   * Triggers a log file rotation and cleanup process.
   * The log directory and retention days can be specified in the request body.
   * @route POST /health/maintenance/rotate-logs
   * @param {FastifyRequest<{ Body: { log_directory?: string; retention_days?: number; } }>} request - The request, optionally containing log directory and retention settings.
   * @param {FastifyReply} reply - The reply object from Fastify.
   * @returns {Promise<any>} A promise that resolves to the result of the log rotation process.
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
   * Registers all health-related routes with a Fastify instance.
   * This static method centralizes route registration for the controller.
   * @param {any} fastify - The Fastify instance to register routes with.
   * @param {HealthController} healthController - The instance of the controller whose methods will handle the routes.
   */
  static registerRoutes(fastify: any, healthController: HealthController): void {
    // Basic health check
    fastify.get('/health', {
      schema: {
        description: 'Get basic system health status.',
        tags: ['Health'],
        response: {
          200: {
            description: 'Successful response for healthy or degraded status.',
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
          },
          503: {
            description: 'Service is unhealthy.',
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['unhealthy'] }
            }
          }
        }
      }
    }, healthController.getHealth.bind(healthController));

    // Detailed health check
    fastify.get('/health/detailed', {
      schema: {
        description: 'Get detailed system health including diagnostics.',
        tags: ['Health'],
        response: {
          200: {
            description: 'Successful response.',
            type: 'object',
            additionalProperties: true
          },
          503: {
            description: 'Service is unhealthy.'
          }
        }
      }
    }, healthController.getDetailedHealth.bind(healthController));

    // Kiosk-specific health
    fastify.get('/health/kiosk/:kioskId', {
      schema: {
        description: 'Get health status for a specific kiosk.',
        tags: ['Health', 'Kiosk'],
        params: {
          type: 'object',
          properties: {
            kioskId: { type: 'string', description: 'The unique identifier for the kiosk.' }
          },
          required: ['kioskId']
        },
        response: {
          200: { description: 'Kiosk is healthy.'},
          503: { description: 'Kiosk is unhealthy.'}
        }
      }
    }, healthController.getKioskHealth.bind(healthController));

    // Diagnostic report
    fastify.get('/health/diagnostics/report', {
      schema: {
        description: 'Generate and retrieve a plain-text diagnostic report.',
        tags: ['Health', 'Diagnostics'],
        response: {
          200: {
            description: 'A plain-text diagnostic report.',
            type: 'string'
          },
          500: {
            description: 'Failed to generate report.'
          }
        }
      }
    }, healthController.getDiagnosticReport.bind(healthController));

    // Log rotation endpoint
    fastify.post('/health/maintenance/rotate-logs', {
      schema: {
        description: 'Trigger log file rotation and cleanup.',
        tags: ['Health', 'Maintenance'],
        body: {
          type: 'object',
          properties: {
            log_directory: { type: 'string', description: 'The directory where logs are stored.', default: './logs' },
            retention_days: { type: 'number', minimum: 1, maximum: 365, description: 'How many days of logs to keep.', default: 30 }
          }
        },
        response: {
          200: {
            description: 'Log rotation completed successfully.',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              rotated: { type: 'array', items: { type: 'string' } },
              deleted: { type: 'array', items: { type: 'string' } }
            }
          },
          500: {
            description: 'Log rotation failed.'
          }
        }
      }
    }, healthController.rotateLogFiles.bind(healthController));
  }
}
