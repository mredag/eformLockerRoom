import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HeartbeatManager } from '../../../../shared/services/heartbeat-manager';
import { TelemetryService } from '../../../../shared/services/telemetry-service.js';
import { KioskStatus } from '../../../../src/types/core-entities';

interface HeartbeatRequest {
  kiosk_id: string;
  zone: string;
  version: string;
  config_hash?: string;
  hardware_id?: string;
}

interface KioskTelemetryData {
  voltage?: {
    main_power?: number;      // Main power supply voltage (V)
    backup_power?: number;    // Backup power voltage (V)
    rs485_line_a?: number;    // RS485 A line voltage (V)
    rs485_line_b?: number;    // RS485 B line voltage (V)
  };
  system_status?: {
    cpu_usage?: number;       // CPU usage percentage
    memory_usage?: number;    // Memory usage percentage
    disk_usage?: number;      // Disk usage percentage
    temperature?: number;     // System temperature (°C)
    uptime?: number;          // System uptime in seconds
  };
  hardware_status?: {
    relay_board_connected?: boolean;
    rfid_reader_connected?: boolean;
    display_connected?: boolean;
    network_connected?: boolean;
  };
  locker_status?: {
    total_lockers?: number;
    available_lockers?: number;
    occupied_lockers?: number;
    error_lockers?: number;
  };
}

interface EnhancedHeartbeatRequest extends HeartbeatRequest {
  telemetry?: KioskTelemetryData;
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
  const telemetryService = new TelemetryService();
  
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

  // Update heartbeat for existing kiosk (enhanced with telemetry)
  fastify.post<{
    Body: EnhancedHeartbeatRequest;
  }>('/heartbeat', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { kiosk_id, version, config_hash, telemetry } = request.body as EnhancedHeartbeatRequest;

      if (!kiosk_id) {
        return reply.code(400).send({
          success: false,
          error: 'Missing required field: kiosk_id'
        });
      }

      // Validate and process telemetry data if provided
      let telemetryValidation = null;
      if (telemetry) {
        telemetryValidation = telemetryService.validateTelemetryData(telemetry);
        
        if (!telemetryValidation.isValid) {
          return reply.code(400).send({
            success: false,
            error: 'Invalid telemetry data',
            details: telemetryValidation.errors
          });
        }

        // Store telemetry data
        try {
          await telemetryService.storeTelemetryData(kiosk_id, telemetryValidation.sanitizedData);
        } catch (telemetryError) {
          fastify.log.warn(`Failed to store telemetry data for kiosk ${kiosk_id}:`, telemetryError);
          // Continue with heartbeat update even if telemetry storage fails
        }
      }

      const kiosk = await heartbeatManager.updateHeartbeat(
        kiosk_id,
        version,
        config_hash
      );

      const response: any = {
        success: true,
        data: kiosk,
        polling_config: heartbeatManager.getPollingConfig()
      };

      // Include telemetry validation warnings if any
      if (telemetryValidation?.warnings.length) {
        response.telemetry_warnings = telemetryValidation.warnings;
      }

      return reply.send(response);
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

  // Get telemetry data for a specific kiosk
  fastify.get<{
    Params: { kioskId: string };
    Querystring: { hours?: string };
  }>('/kiosks/:kioskId/telemetry', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params as { kioskId: string };
      const { hours } = request.query as { hours?: string };

      if (!kioskId) {
        return reply.code(400).send({
          success: false,
          error: 'Missing kiosk ID parameter'
        });
      }

      const hoursNum = hours ? parseInt(hours, 10) : 24;
      if (isNaN(hoursNum) || hoursNum < 1 || hoursNum > 168) { // Max 1 week
        return reply.code(400).send({
          success: false,
          error: 'Hours parameter must be between 1 and 168'
        });
      }

      const [currentTelemetry, telemetryHistory] = await Promise.all([
        telemetryService.getTelemetryData(kioskId),
        telemetryService.getTelemetryHistory(kioskId, hoursNum)
      ]);

      return reply.send({
        success: true,
        data: {
          kiosk_id: kioskId,
          current: currentTelemetry,
          history: telemetryHistory,
          history_hours: hoursNum
        }
      });
    } catch (error) {
      fastify.log.error('Failed to get telemetry data:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  // Get telemetry summary for all kiosks
  fastify.get('/telemetry/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const kiosks = await heartbeatManager.getAllKiosks();
      const telemetrySummary = await Promise.all(
        kiosks.map(async (kiosk) => {
          const telemetry = await telemetryService.getTelemetryData(kiosk.kiosk_id);
          return {
            kiosk_id: kiosk.kiosk_id,
            zone: kiosk.zone,
            status: kiosk.status,
            last_seen: kiosk.last_seen,
            telemetry: telemetry
          };
        })
      );

      return reply.send({
        success: true,
        data: telemetrySummary
      });
    } catch (error) {
      fastify.log.error('Failed to get telemetry summary:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  // Cleanup old telemetry data (maintenance endpoint)
  fastify.post<{
    Body: { retention_days?: number };
  }>('/telemetry/cleanup', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { retention_days = 7 } = request.body as { retention_days?: number };

      if (retention_days < 1 || retention_days > 365) {
        return reply.code(400).send({
          success: false,
          error: 'Retention days must be between 1 and 365'
        });
      }

      const deletedCount = await telemetryService.cleanupOldTelemetry(retention_days);

      return reply.send({
        success: true,
        data: {
          deleted_records: deletedCount,
          retention_days: retention_days
        },
        message: `Cleaned up ${deletedCount} old telemetry records`
      });
    } catch (error) {
      fastify.log.error('Failed to cleanup telemetry data:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });
}
