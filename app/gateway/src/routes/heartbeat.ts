import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HeartbeatManager } from '../../../../shared/services/heartbeat-manager.js';
import { KioskStatus } from '../../../../src/types/core-entities.js';

interface HeartbeatRequest {
  kiosk_id: string;
  zone: string;
  version: string;
  config_hash?: string;
  hardware_id?: string;
}

interface CommandPollRequest {
  kiosk_id: string;
  limit?: number;
}

interface CommandCompleteRequest {
  command_id: string;
  success: boolean;
  error?: string;
}

export async function heartbeatRoutes(fastify: FastifyInstance) {
  const heartbeatManager = new HeartbeatManager();
  
  // Start the heartbeat manager
  await heartbeatManager.start();
  
  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await heartbeatManager.stop();
  });

  // Register a new kiosk
  fastify.post<{
    Body: HeartbeatRequest;
  }>('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { kiosk_id, zone, version, hardware_id } = request.body as HeartbeatRequest;

      if (!kiosk_id || !zone || !version) {
        return reply.code(400).send({
          success: false,
          error: 'Missing required fields: kiosk_id, zone, version'
        });
      }

      const kiosk = await heartbeatManager.registerKiosk(
        kiosk_id,
        zone,
        version,
        hardware_id
      );

      return reply.send({
        success: true,
        data: kiosk,
        message: `Kiosk ${kiosk_id} registered successfully`
      });
    } catch (error) {
      fastify.log.error('Failed to register kiosk:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  // Update heartbeat for existing kiosk
  fastify.post<{
    Body: HeartbeatRequest;
  }>('/heartbeat', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { kiosk_id, version, config_hash } = request.body as HeartbeatRequest;

      if (!kiosk_id) {
        return reply.code(400).send({
          success: false,
          error: 'Missing required field: kiosk_id'
        });
      }

      const kiosk = await heartbeatManager.updateHeartbeat(
        kiosk_id,
        version,
        config_hash
      );

      return reply.send({
        success: true,
        data: kiosk,
        polling_config: heartbeatManager.getPollingConfig()
      });
    } catch (error) {
      fastify.log.error('Failed to update heartbeat:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  // Poll for pending commands
  fastify.post<{
    Body: CommandPollRequest;
  }>('/commands/poll', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { kiosk_id, limit = 10 } = request.body as CommandPollRequest;

      if (!kiosk_id) {
        return reply.code(400).send({
          success: false,
          error: 'Missing required field: kiosk_id'
        });
      }

      const commands = await heartbeatManager.getPendingCommands(kiosk_id, limit);

      return reply.send({
        success: true,
        data: commands,
        count: commands.length
      });
    } catch (error) {
      fastify.log.error('Failed to poll commands:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  // Mark command as completed
  fastify.post<{
    Body: CommandCompleteRequest;
  }>('/commands/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { command_id, success, error } = request.body as CommandCompleteRequest;

      if (!command_id || success === undefined) {
        return reply.code(400).send({
          success: false,
          error: 'Missing required fields: command_id, success'
        });
      }

      let result: boolean;
      if (success) {
        result = await heartbeatManager.markCommandCompleted(command_id);
      } else {
        result = await heartbeatManager.markCommandFailed(command_id, error || 'Unknown error');
      }

      return reply.send({
        success: result,
        message: result ? 'Command status updated' : 'Failed to update command status'
      });
    } catch (error) {
      fastify.log.error('Failed to update command status:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  // Get all kiosks (for panel interface)
  fastify.get('/kiosks', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const kiosks = await heartbeatManager.getAllKiosks();
      const zones = await heartbeatManager.getAllZones();
      const statistics = await heartbeatManager.getStatistics();

      return reply.send({
        success: true,
        data: {
          kiosks,
          zones,
          statistics
        }
      });
    } catch (error) {
      fastify.log.error('Failed to get kiosks:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  // Get kiosks by zone
  fastify.get<{
    Querystring: { zone: string };
  }>('/kiosks/zone/:zone', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { zone } = request.params as { zone: string };
      
      if (!zone) {
        return reply.code(400).send({
          success: false,
          error: 'Missing zone parameter'
        });
      }

      const kiosks = await heartbeatManager.getKiosksByZone(zone);

      return reply.send({
        success: true,
        data: kiosks,
        zone
      });
    } catch (error) {
      fastify.log.error('Failed to get kiosks by zone:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  // Get kiosk health information
  fastify.get<{
    Params: { kioskId: string };
  }>('/kiosks/:kioskId/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params as { kioskId: string };

      if (!kioskId) {
        return reply.code(400).send({
          success: false,
          error: 'Missing kiosk ID parameter'
        });
      }

      const health = await heartbeatManager.getKioskHealth(kioskId);

      return reply.send({
        success: true,
        data: health
      });
    } catch (error) {
      fastify.log.error('Failed to get kiosk health:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  // Update kiosk status manually (for maintenance mode, etc.)
  fastify.put<{
    Params: { kioskId: string };
    Body: { status: KioskStatus };
  }>('/kiosks/:kioskId/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params as { kioskId: string };
      const { status } = request.body as { status: KioskStatus };

      if (!kioskId || !status) {
        return reply.code(400).send({
          success: false,
          error: 'Missing required fields: kioskId, status'
        });
      }

      const validStatuses: KioskStatus[] = ['online', 'offline', 'maintenance', 'error'];
      if (!validStatuses.includes(status)) {
        return reply.code(400).send({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      const kiosk = await heartbeatManager.updateKioskStatus(kioskId, status);

      return reply.send({
        success: true,
        data: kiosk,
        message: `Kiosk ${kioskId} status updated to ${status}`
      });
    } catch (error) {
      fastify.log.error('Failed to update kiosk status:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  // Clear pending commands for a kiosk (used on restart)
  fastify.post<{
    Params: { kioskId: string };
  }>('/kiosks/:kioskId/clear-commands', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params as { kioskId: string };

      if (!kioskId) {
        return reply.code(400).send({
          success: false,
          error: 'Missing kiosk ID parameter'
        });
      }

      const clearedCount = await heartbeatManager.clearPendingCommands(kioskId);

      return reply.send({
        success: true,
        data: { cleared_count: clearedCount },
        message: `Cleared ${clearedCount} pending commands for kiosk ${kioskId}`
      });
    } catch (error) {
      fastify.log.error('Failed to clear pending commands:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  // Get polling configuration for kiosks
  fastify.get('/config/polling', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = heartbeatManager.getPollingConfig();

      return reply.send({
        success: true,
        data: config
      });
    } catch (error) {
      fastify.log.error('Failed to get polling config:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });
}