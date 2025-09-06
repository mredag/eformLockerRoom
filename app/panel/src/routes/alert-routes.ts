import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AlertManager, AlertListResponse, AlertErrorResponse } from '../../../../shared/services/alert-manager';
import { Database } from 'sqlite3';

interface AlertQueryParams {
  kiosk_id?: string;
  status?: string;
  page?: string;
  limit?: string;
}

interface AlertClearParams {
  id: string;
}

interface AlertHistoryQueryParams {
  kiosk_id?: string;
  page?: string;
  limit?: string;
}

export async function alertRoutes(fastify: FastifyInstance) {
  const db = new Database('./data/eform.db');
  const alertManager = new AlertManager(db);

  // CSRF protection middleware
  const csrfProtection = async (request: FastifyRequest, reply: FastifyReply) => {
    const csrfToken = request.headers['x-csrf-token'] || request.body?.['_csrf'];
    const sessionCsrf = request.session?.csrfToken;
    
    if (!csrfToken || csrfToken !== sessionCsrf) {
      const error: AlertErrorResponse = {
        error: 'CSRF token validation failed',
        code: 'CSRF_ERROR'
      };
      reply.code(403).send(error);
      return;
    }
  };

  // Authentication middleware
  const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.session?.authenticated) {
      const error: AlertErrorResponse = {
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      };
      reply.code(401).send(error);
      return;
    }
  };

  // Apply middleware to all routes
  fastify.addHook('preHandler', requireAuth);
  fastify.addHook('preHandler', csrfProtection);

  /**
   * GET /api/admin/alerts
   * Get alerts with pagination and filtering
   */
  fastify.get<{
    Querystring: AlertQueryParams;
    Reply: AlertListResponse | AlertErrorResponse;
  }>('/api/admin/alerts', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          kiosk_id: { type: 'string' },
          status: { type: 'string', enum: ['active', 'cleared'] },
          page: { type: 'string', pattern: '^[1-9][0-9]*$' },
          limit: { type: 'string', pattern: '^[1-9][0-9]*$' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            alerts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  kioskId: { type: 'string' },
                  severity: { type: 'string' },
                  message: { type: 'string' },
                  data: { type: 'object' },
                  status: { type: 'string' },
                  triggeredAt: { type: 'string' },
                  clearedAt: { type: 'string', nullable: true },
                  autoClearCondition: { type: 'string', nullable: true }
                }
              }
            },
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
            hasMore: { type: 'boolean' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'object' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' }
          }
        },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { kiosk_id, status, page = '1', limit = '50' } = request.query;
      
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      
      // Validate pagination parameters
      if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
        const error: AlertErrorResponse = {
          error: 'Invalid pagination parameters',
          code: 'INVALID_PARAMS',
          details: { page: pageNum, limit: limitNum }
        };
        reply.code(400).send(error);
        return;
      }

      const result = await alertManager.getAlerts(kiosk_id, status, pageNum, limitNum);
      reply.send(result);
    } catch (error) {
      fastify.log.error('Error fetching alerts:', error);
      const errorResponse: AlertErrorResponse = {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
      reply.code(500).send(errorResponse);
    }
  });

  /**
   * GET /api/admin/alerts/history
   * Get alert history with pagination
   */
  fastify.get<{
    Querystring: AlertHistoryQueryParams;
    Reply: AlertListResponse | AlertErrorResponse;
  }>('/api/admin/alerts/history', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          kiosk_id: { type: 'string' },
          page: { type: 'string', pattern: '^[1-9][0-9]*$' },
          limit: { type: 'string', pattern: '^[1-9][0-9]*$' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            alerts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  kioskId: { type: 'string' },
                  severity: { type: 'string' },
                  message: { type: 'string' },
                  data: { type: 'object' },
                  status: { type: 'string' },
                  triggeredAt: { type: 'string' },
                  clearedAt: { type: 'string', nullable: true },
                  autoClearCondition: { type: 'string', nullable: true }
                }
              }
            },
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
            hasMore: { type: 'boolean' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { kiosk_id, page = '1', limit = '50' } = request.query;
      
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      
      // Validate pagination parameters
      if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
        const error: AlertErrorResponse = {
          error: 'Invalid pagination parameters',
          code: 'INVALID_PARAMS',
          details: { page: pageNum, limit: limitNum }
        };
        reply.code(400).send(error);
        return;
      }

      const result = await alertManager.getAlertHistory(kiosk_id, pageNum, limitNum);
      reply.send(result);
    } catch (error) {
      fastify.log.error('Error fetching alert history:', error);
      const errorResponse: AlertErrorResponse = {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
      reply.code(500).send(errorResponse);
    }
  });

  /**
   * POST /api/admin/alerts/:id/clear
   * Clear a specific alert
   */
  fastify.post<{
    Params: AlertClearParams;
    Reply: { success: boolean } | AlertErrorResponse;
  }>('/api/admin/alerts/:id/clear', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1 }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'object' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      
      await alertManager.clearAlert(id);
      
      fastify.log.info(`Alert cleared by admin: ${id}`);
      reply.send({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        const errorResponse: AlertErrorResponse = {
          error: 'Alert not found',
          code: 'ALERT_NOT_FOUND'
        };
        reply.code(404).send(errorResponse);
        return;
      }

      fastify.log.error('Error clearing alert:', error);
      const errorResponse: AlertErrorResponse = {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
      reply.code(500).send(errorResponse);
    }
  });

  // Cleanup on server shutdown
  fastify.addHook('onClose', async () => {
    alertManager.shutdown();
    db.close();
  });
}