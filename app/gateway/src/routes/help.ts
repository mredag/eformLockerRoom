import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HelpService, CreateHelpRequest, HelpRequestValidationError, HelpRequestNotFoundError } from '../../../../shared/services/help-service.js';
import { HelpWebSocketService } from '../services/help-websocket-service.js';
import { DatabaseConnection } from '../../../../shared/database/connection.js';
import { WebSocketManager } from '../services/websocket-manager.js';

interface HelpRequestBody {
  kiosk_id: string;
  locker_no?: number;
  category: 'lock_problem' | 'other';
  note?: string;
}

interface UpdateHelpRequestBody {
  status?: 'open' | 'resolved';
}

interface HelpRequestParams {
  id: string;
}

interface HelpRequestQuery {
  status?: 'open' | 'resolved';
  kiosk_id?: string;
  category?: 'lock_problem' | 'other';
}

/**
 * Register help request routes
 */
export async function registerHelpRoutes(fastify: FastifyInstance, webSocketManager: WebSocketManager) {
  const db = DatabaseConnection.getInstance();
  const helpWebSocketService = new HelpWebSocketService(db, webSocketManager);
  const helpService = helpWebSocketService.getHelpService();

  // Create help request
  fastify.post<{
    Body: HelpRequestBody;
  }>('/api/help', async (request: FastifyRequest<{ Body: HelpRequestBody }>, reply: FastifyReply) => {
    try {
      const createRequest: CreateHelpRequest = {
        kiosk_id: request.body.kiosk_id,
        locker_no: request.body.locker_no,
        category: request.body.category,
        note: request.body.note
      };

      const helpRequest = await helpService.createHelpRequest(createRequest);

      reply.code(201).send({
        success: true,
        data: helpRequest
      });
    } catch (error) {
      if (error instanceof HelpRequestValidationError) {
        reply.code(400).send({
          success: false,
          error: error.message,
          field: error.field
        });
      } else {
        fastify.log.error('Failed to create help request:', error);
        reply.code(500).send({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  });

  // Get help requests with filtering
  fastify.get<{
    Querystring: HelpRequestQuery;
  }>('/api/help', async (request: FastifyRequest<{ Querystring: HelpRequestQuery }>, reply: FastifyReply) => {
    try {
      const filter: any = {};

      if (request.query.status) filter.status = request.query.status;
      if (request.query.kiosk_id) filter.kiosk_id = request.query.kiosk_id;
      if (request.query.category) filter.category = request.query.category;

      const helpRequests = await helpService.getHelpRequests(filter);

      reply.send({
        success: true,
        data: helpRequests
      });
    } catch (error) {
      fastify.log.error('Failed to get help requests:', error);
      reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Get help request by ID
  fastify.get<{
    Params: HelpRequestParams;
  }>('/api/help/:id', async (request: FastifyRequest<{ Params: HelpRequestParams }>, reply: FastifyReply) => {
    try {
      const id = parseInt(request.params.id);
      if (isNaN(id)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid help request ID'
        });
      }

      const helpRequest = await helpService.getHelpRequestById(id);
      if (!helpRequest) {
        return reply.code(404).send({
          success: false,
          error: 'Help request not found'
        });
      }

      reply.send({
        success: true,
        data: helpRequest
      });
    } catch (error) {
      fastify.log.error('Failed to get help request:', error);
      reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Resolve help request (Simplified)
  fastify.post<{
    Params: HelpRequestParams;
  }>('/api/help/:id/resolve', async (request: FastifyRequest<{ Params: HelpRequestParams }>, reply: FastifyReply) => {
    try {
      const id = parseInt(request.params.id);
      if (isNaN(id)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid help request ID'
        });
      }

      const helpRequest = await helpService.resolveHelpRequest(id);

      reply.send({
        success: true,
        data: helpRequest
      });
    } catch (error) {
      if (error instanceof HelpRequestNotFoundError) {
        reply.code(404).send({
          success: false,
          error: error.message
        });
      } else {
        fastify.log.error('Failed to resolve help request:', error);
        reply.code(500).send({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  });

  // Update help request
  fastify.put<{
    Params: HelpRequestParams;
    Body: UpdateHelpRequestBody;
  }>('/api/help/:id', async (request: FastifyRequest<{ Params: HelpRequestParams; Body: UpdateHelpRequestBody }>, reply: FastifyReply) => {
    try {
      const id = parseInt(request.params.id);
      if (isNaN(id)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid help request ID'
        });
      }

      const helpRequest = await helpService.updateHelpRequest(id, request.body);

      reply.send({
        success: true,
        data: helpRequest
      });
    } catch (error) {
      if (error instanceof HelpRequestNotFoundError) {
        reply.code(404).send({
          success: false,
          error: error.message
        });
      } else if (error instanceof HelpRequestValidationError) {
        reply.code(400).send({
          success: false,
          error: error.message,
          field: error.field
        });
      } else {
        fastify.log.error('Failed to update help request:', error);
        reply.code(500).send({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  });

  // Get help request statistics
  fastify.get('/api/help/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await helpService.getHelpRequestStatistics();

      reply.send({
        success: true,
        data: stats
      });
    } catch (error) {
      fastify.log.error('Failed to get help request statistics:', error);
      reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });


}