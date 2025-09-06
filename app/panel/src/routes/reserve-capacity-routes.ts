import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ReserveCapacityManager } from '../../../../shared/services/reserve-capacity-manager';
import { ConfigurationManager } from '../../../../shared/services/configuration-manager';
import { DatabaseConnection } from '../../../../shared/database/connection';

interface ReserveCapacityParams {
  kioskId: string;
}

interface ReserveCapacityQuery {
  page?: number;
  limit?: number;
}

interface ReserveCapacityUpdateBody {
  reserve_ratio?: number;
  reserve_minimum?: number;
  updated_by: string;
}

/**
 * Reserve Capacity Admin Routes
 * 
 * Provides admin endpoints for reserve capacity management with:
 * - Admin authentication and CSRF protection
 * - Pagination for large datasets
 * - Bounds validation and hot-reload ≤ 3s
 * - Integration with existing alert system
 */
export async function reserveCapacityRoutes(fastify: FastifyInstance) {
  // Initialize services
  const dbConnection = new DatabaseConnection(fastify.sqlite);
  const configManager = new ConfigurationManager(dbConnection);
  const reserveManager = new ReserveCapacityManager(dbConnection, configManager);

  // Admin authentication middleware
  const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    // Check if user is authenticated (implement based on existing auth system)
    const isAuthenticated = request.session?.user?.role === 'admin';
    if (!isAuthenticated) {
      return reply.code(401).send({ error: 'Admin authentication required' });
    }
  };

  // CSRF protection middleware
  const requireCSRF = async (request: FastifyRequest, reply: FastifyReply) => {
    // Implement CSRF token validation (based on existing system)
    const csrfToken = request.headers['x-csrf-token'] || request.body?.csrf_token;
    if (!csrfToken || !request.session?.csrfToken || csrfToken !== request.session.csrfToken) {
      return reply.code(403).send({ error: 'CSRF token validation failed' });
    }
  };

  /**
   * GET /api/admin/reserve-capacity/status/:kioskId
   * Get reserve capacity status for a specific kiosk
   */
  fastify.get<{
    Params: ReserveCapacityParams;
    Querystring: ReserveCapacityQuery;
  }>('/api/admin/reserve-capacity/status/:kioskId', {
    preHandler: [requireAuth],
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
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { kioskId } = request.params;
      const status = await reserveManager.getReserveCapacityStatus(kioskId);
      
      return reply.send({
        success: true,
        data: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error('Failed to get reserve capacity status:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get reserve capacity status'
      });
    }
  });

  /**
   * GET /api/admin/reserve-capacity/alerts/:kioskId
   * Get reserve capacity alerts for a specific kiosk with pagination
   */
  fastify.get<{
    Params: ReserveCapacityParams;
    Querystring: ReserveCapacityQuery;
  }>('/api/admin/reserve-capacity/alerts/:kioskId', {
    preHandler: [requireAuth],
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
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { kioskId } = request.params;
      const { page = 1, limit = 20 } = request.query;
      
      const monitoring = await reserveManager.monitorReserveCapacity(kioskId);
      
      // Apply pagination to alerts
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedAlerts = monitoring.alerts.slice(startIndex, endIndex);
      
      return reply.send({
        success: true,
        data: {
          alerts: paginatedAlerts,
          status: monitoring.status,
          pagination: {
            page,
            limit,
            total: monitoring.alerts.length,
            totalPages: Math.ceil(monitoring.alerts.length / limit)
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error('Failed to get reserve capacity alerts:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get reserve capacity alerts'
      });
    }
  });

  /**
   * PUT /api/admin/reserve-capacity/config/:kioskId
   * Update reserve capacity configuration for a specific kiosk
   * Uses central ConfigurationManager with hot-reload ≤ 3s
   */
  fastify.put<{
    Params: ReserveCapacityParams;
    Body: ReserveCapacityUpdateBody;
  }>('/api/admin/reserve-capacity/config/:kioskId', {
    preHandler: [requireAuth, requireCSRF],
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
          reserve_ratio: { 
            type: 'number', 
            minimum: 0, 
            maximum: 0.5,
            description: 'Reserve ratio (0.0-0.5)'
          },
          reserve_minimum: { 
            type: 'number', 
            minimum: 0, 
            maximum: 10,
            description: 'Reserve minimum (0-10)'
          },
          updated_by: { type: 'string' }
        },
        required: ['updated_by']
      }
    }
  }, async (request, reply) => {
    try {
      const { kioskId } = request.params;
      const { reserve_ratio, reserve_minimum, updated_by } = request.body;
      
      // Update configuration using central ConfigurationManager
      if (reserve_ratio !== undefined) {
        // Apply bounds validation
        const clampedRatio = Math.max(0, Math.min(0.5, reserve_ratio));
        await configManager.setKioskOverride(kioskId, 'reserve_ratio', clampedRatio, updated_by);
      }
      
      if (reserve_minimum !== undefined) {
        // Apply bounds validation
        const clampedMinimum = Math.max(0, Math.min(10, Math.floor(reserve_minimum)));
        await configManager.setKioskOverride(kioskId, 'reserve_minimum', clampedMinimum, updated_by);
      }
      
      // Get updated status
      const status = await reserveManager.getReserveCapacityStatus(kioskId);
      
      return reply.send({
        success: true,
        message: 'Reserve capacity configuration updated',
        data: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error('Failed to update reserve capacity config:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to update reserve capacity configuration'
      });
    }
  });

  /**
   * DELETE /api/admin/reserve-capacity/config/:kioskId
   * Reset reserve capacity configuration to global defaults
   */
  fastify.delete<{
    Params: ReserveCapacityParams;
    Body: { updated_by: string; csrf_token: string };
  }>('/api/admin/reserve-capacity/config/:kioskId', {
    preHandler: [requireAuth, requireCSRF],
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
          updated_by: { type: 'string' },
          csrf_token: { type: 'string' }
        },
        required: ['updated_by', 'csrf_token']
      }
    }
  }, async (request, reply) => {
    try {
      const { kioskId } = request.params;
      const { updated_by } = request.body;
      
      // Reset to global defaults using central ConfigurationManager
      await configManager.removeKioskOverride(kioskId, 'reserve_ratio', updated_by);
      await configManager.removeKioskOverride(kioskId, 'reserve_minimum', updated_by);
      
      // Get updated status
      const status = await reserveManager.getReserveCapacityStatus(kioskId);
      
      return reply.send({
        success: true,
        message: 'Reserve capacity configuration reset to defaults',
        data: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error('Failed to reset reserve capacity config:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to reset reserve capacity configuration'
      });
    }
  });

  /**
   * GET /api/admin/reserve-capacity/global-config
   * Get global reserve capacity configuration
   */
  fastify.get('/api/admin/reserve-capacity/global-config', {
    preHandler: [requireAuth]
  }, async (request, reply) => {
    try {
      const globalConfig = await configManager.getGlobalConfig();
      
      return reply.send({
        success: true,
        data: {
          reserve_ratio: globalConfig.reserve_ratio,
          reserve_minimum: globalConfig.reserve_minimum
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error('Failed to get global reserve capacity config:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get global reserve capacity configuration'
      });
    }
  });

  /**
   * PUT /api/admin/reserve-capacity/global-config
   * Update global reserve capacity configuration
   */
  fastify.put<{
    Body: ReserveCapacityUpdateBody;
  }>('/api/admin/reserve-capacity/global-config', {
    preHandler: [requireAuth, requireCSRF],
    schema: {
      body: {
        type: 'object',
        properties: {
          reserve_ratio: { 
            type: 'number', 
            minimum: 0, 
            maximum: 0.5,
            description: 'Global reserve ratio (0.0-0.5, default 0.10)'
          },
          reserve_minimum: { 
            type: 'number', 
            minimum: 0, 
            maximum: 10,
            description: 'Global reserve minimum (0-10, default 2)'
          },
          updated_by: { type: 'string' }
        },
        required: ['updated_by']
      }
    }
  }, async (request, reply) => {
    try {
      const { reserve_ratio, reserve_minimum, updated_by } = request.body;
      
      // Update global configuration
      if (reserve_ratio !== undefined) {
        const clampedRatio = Math.max(0, Math.min(0.5, reserve_ratio));
        await configManager.updateGlobalConfig({ reserve_ratio: clampedRatio }, updated_by);
      }
      
      if (reserve_minimum !== undefined) {
        const clampedMinimum = Math.max(0, Math.min(10, Math.floor(reserve_minimum)));
        await configManager.updateGlobalConfig({ reserve_minimum: clampedMinimum }, updated_by);
      }
      
      const globalConfig = await configManager.getGlobalConfig();
      
      return reply.send({
        success: true,
        message: 'Global reserve capacity configuration updated',
        data: {
          reserve_ratio: globalConfig.reserve_ratio,
          reserve_minimum: globalConfig.reserve_minimum
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error('Failed to update global reserve capacity config:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to update global reserve capacity configuration'
      });
    }
  });
}