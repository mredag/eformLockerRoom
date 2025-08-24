import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LockerWebSocketService } from '../services/locker-websocket-service.js';
import { DatabaseManager } from '../../../../shared/database/database-manager.js';

interface LockerParams {
  kioskId: string;
  lockerId: string;
}

interface LockerActionBody {
  action: 'assign' | 'release' | 'block' | 'unblock' | 'force_transition';
  ownerType?: 'rfid' | 'device' | 'vip';
  ownerKey?: string;
  staffUser?: string;
  reason?: string;
  newStatus?: string;
}

interface KioskParams {
  kioskId: string;
}

export async function lockerRoutes(fastify: FastifyInstance) {
  const dbManager = new DatabaseManager();
  const lockerService = new LockerWebSocketService(
    dbManager,
    (fastify as any).webSocketManager
  );

  // Get all lockers with optional filtering
  fastify.get('/api/lockers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { kioskId, status } = request.query as { kioskId?: string; status?: string };
      const lockers = await lockerService.getAllLockers(kioskId, status);
      
      return {
        success: true,
        data: lockers,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Error fetching lockers:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch lockers',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get lockers for a specific kiosk
  fastify.get('/api/kiosks/:kioskId/lockers', async (request: FastifyRequest<{ Params: KioskParams }>, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params;
      const lockers = await lockerService.getAllLockers(kioskId);
      
      return {
        success: true,
        data: lockers,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Error fetching kiosk lockers:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch kiosk lockers',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get specific locker
  fastify.get('/api/kiosks/:kioskId/lockers/:lockerId', async (request: FastifyRequest<{ Params: LockerParams }>, reply: FastifyReply) => {
    try {
      const { kioskId, lockerId } = request.params;
      const locker = await lockerService.getLocker(kioskId, parseInt(lockerId));
      
      if (!locker) {
        return reply.status(404).send({
          success: false,
          error: 'Locker not found',
          timestamp: new Date().toISOString()
        });
      }

      return {
        success: true,
        data: locker,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Error fetching locker:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch locker',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get kiosk statistics
  fastify.get('/api/kiosks/:kioskId/stats', async (request: FastifyRequest<{ Params: KioskParams }>, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params;
      const stats = await lockerService.getKioskStats(kioskId);
      
      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Error fetching kiosk stats:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch kiosk stats',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get available lockers for a kiosk
  fastify.get('/api/kiosks/:kioskId/lockers/available', async (request: FastifyRequest<{ Params: KioskParams }>, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params;
      const lockers = await lockerService.getAvailableLockers(kioskId);
      
      return {
        success: true,
        data: lockers,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Error fetching available lockers:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch available lockers',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Perform locker action
  fastify.post('/api/kiosks/:kioskId/lockers/:lockerId/action', async (
    request: FastifyRequest<{ Params: LockerParams; Body: LockerActionBody }>,
    reply: FastifyReply
  ) => {
    try {
      const { kioskId, lockerId } = request.params;
      const { action, ownerType, ownerKey, staffUser, reason, newStatus } = request.body;
      const lockerIdNum = parseInt(lockerId);

      let result: boolean;

      switch (action) {
        case 'assign':
          if (!ownerType || !ownerKey) {
            return reply.status(400).send({
              success: false,
              error: 'ownerType and ownerKey are required for assign action',
              timestamp: new Date().toISOString()
            });
          }
          result = await lockerService.assignLocker(kioskId, lockerIdNum, ownerType, ownerKey);
          break;

        case 'release':
          result = await lockerService.releaseLocker(kioskId, lockerIdNum, ownerKey);
          break;

        case 'block':
          result = await lockerService.blockLocker(kioskId, lockerIdNum, staffUser, reason);
          break;

        case 'unblock':
          result = await lockerService.unblockLocker(kioskId, lockerIdNum, staffUser);
          break;

        case 'force_transition':
          if (!newStatus || !staffUser || !reason) {
            return reply.status(400).send({
              success: false,
              error: 'newStatus, staffUser, and reason are required for force_transition action',
              timestamp: new Date().toISOString()
            });
          }
          result = await lockerService.forceStateTransition(kioskId, lockerIdNum, newStatus, staffUser, reason);
          break;

        default:
          return reply.status(400).send({
            success: false,
            error: 'Invalid action. Supported actions: assign, release, block, unblock, force_transition',
            timestamp: new Date().toISOString()
          });
      }

      return {
        success: result,
        message: result ? `Locker ${action} successful` : `Locker ${action} failed`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Error performing locker action:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to perform locker action',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Cleanup expired reservations (manual trigger)
  fastify.post('/api/lockers/cleanup', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cleanedCount = await lockerService.cleanupExpiredReservations();
      
      return {
        success: true,
        data: { cleanedCount },
        message: `Cleaned up ${cleanedCount} expired reservations`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Error cleaning up expired reservations:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to cleanup expired reservations',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Initialize lockers for a kiosk
  fastify.post('/api/kiosks/:kioskId/lockers/initialize', async (
    request: FastifyRequest<{ Params: KioskParams; Body: { lockerCount?: number } }>,
    reply: FastifyReply
  ) => {
    try {
      const { kioskId } = request.params;
      const { lockerCount = 30 } = request.body || {};
      
      await lockerService.initializeKioskLockers(kioskId, lockerCount);
      
      return {
        success: true,
        message: `Initialized ${lockerCount} lockers for kiosk ${kioskId}`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Error initializing kiosk lockers:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to initialize kiosk lockers',
        timestamp: new Date().toISOString()
      });
    }
  });
}