import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { DatabaseManager } from '../../../../shared/database/database-manager.js';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager.js';
import { EventRepository } from '../../../../shared/database/event-repository.js';
import { requirePermission, requireCsrfToken } from '../middleware/auth-middleware.js';
import { Permission } from '../services/permission-service.js';
import { User } from '../services/auth-service.js';

interface LockerRouteOptions extends FastifyPluginOptions {
  dbManager: DatabaseManager;
}

export async function lockerRoutes(fastify: FastifyInstance, options: LockerRouteOptions) {
  const { dbManager } = options;
  const lockerStateManager = new LockerStateManager(dbManager);
  const eventRepository = new EventRepository(dbManager);

  // Get all lockers with filtering
  fastify.get('/', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)]
  }, async (request, reply) => {
    const query = request.query as {
      kioskId?: string;
      status?: string;
      zone?: string;
    };

    try {
      const lockers = await lockerStateManager.getAllLockers(query.kioskId, query.status);
      
      // Add zone filtering if needed (would need kiosk heartbeat data)
      let filteredLockers = lockers;
      if (query.zone) {
        // This would require joining with kiosk_heartbeat table
        // For now, just return all lockers
      }

      reply.send({
        lockers: filteredLockers,
        total: filteredLockers.length
      });
    } catch (error) {
      fastify.log.error('Failed to get lockers:', error);
      reply.code(500).send({ error: 'Failed to retrieve lockers' });
    }
  });

  // Get locker status by ID
  fastify.get('/:kioskId/:lockerId', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)]
  }, async (request, reply) => {
    const { kioskId, lockerId } = request.params as { kioskId: string; lockerId: string };

    try {
      const locker = await lockerStateManager.getLocker(kioskId, parseInt(lockerId));
      if (!locker) {
        reply.code(404).send({ error: 'Locker not found' });
        return;
      }

      reply.send({ locker });
    } catch (error) {
      fastify.log.error('Failed to get locker:', error);
      reply.code(500).send({ error: 'Failed to retrieve locker' });
    }
  });

  // Open individual locker
  fastify.post('/:kioskId/:lockerId/open', {
    preHandler: [requirePermission(Permission.OPEN_LOCKER), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          override: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request, reply) => {
    const { kioskId, lockerId } = request.params as { kioskId: string; lockerId: string };
    const { reason, override } = request.body as { reason?: string; override?: boolean };
    const user = (request as any).user as User;

    try {
      const lockerId_num = parseInt(lockerId);
      
      // Check if locker exists
      const locker = await lockerStateManager.getLocker(kioskId, lockerId_num);
      if (!locker) {
        reply.code(404).send({ error: 'Locker not found' });
        return;
      }

      // Skip release for VIP lockers unless override is true
      if (locker.is_vip && !override) {
        reply.code(423).send({ error: 'VIP locker cannot be opened without override' });
        return;
      }

      // Release the locker (this will open it and set to Free)
      const success = await lockerStateManager.releaseLocker(kioskId, lockerId_num);
      
      if (success) {
        // Log the staff operation
        await eventRepository.logEvent({
          kiosk_id: kioskId,
          locker_id: lockerId_num,
          event_type: 'staff_open',
          staff_user: user.username,
          details: {
            reason: reason || 'Manual staff open',
            override: override || false,
            previous_status: locker.status,
            is_vip: locker.is_vip
          }
        });

        reply.send({ 
          success: true, 
          message: `Locker ${lockerId} opened successfully` 
        });
      } else {
        reply.code(400).send({ error: 'Failed to open locker' });
      }
    } catch (error) {
      fastify.log.error('Failed to open locker:', error);
      reply.code(500).send({ error: 'Failed to open locker' });
    }
  });

  // Block locker
  fastify.post('/:kioskId/:lockerId/block', {
    preHandler: [requirePermission(Permission.BLOCK_LOCKER), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { kioskId, lockerId } = request.params as { kioskId: string; lockerId: string };
    const { reason } = request.body as { reason: string };
    const user = (request as any).user as User;

    try {
      const lockerId_num = parseInt(lockerId);
      
      const success = await lockerStateManager.blockLocker(kioskId, lockerId_num);
      
      if (success) {
        await eventRepository.logEvent({
          kiosk_id: kioskId,
          locker_id: lockerId_num,
          event_type: 'staff_block',
          staff_user: user.username,
          details: { reason }
        });

        reply.send({ 
          success: true, 
          message: `Locker ${lockerId} blocked successfully` 
        });
      } else {
        reply.code(400).send({ error: 'Failed to block locker' });
      }
    } catch (error) {
      fastify.log.error('Failed to block locker:', error);
      reply.code(500).send({ error: 'Failed to block locker' });
    }
  });

  // Unblock locker
  fastify.post('/:kioskId/:lockerId/unblock', {
    preHandler: [requirePermission(Permission.BLOCK_LOCKER), requireCsrfToken()]
  }, async (request, reply) => {
    const { kioskId, lockerId } = request.params as { kioskId: string; lockerId: string };
    const user = (request as any).user as User;

    try {
      const lockerId_num = parseInt(lockerId);
      
      const success = await lockerStateManager.unblockLocker(kioskId, lockerId_num);
      
      if (success) {
        await eventRepository.logEvent({
          kiosk_id: kioskId,
          locker_id: lockerId_num,
          event_type: 'staff_unblock',
          staff_user: user.username,
          details: {}
        });

        reply.send({ 
          success: true, 
          message: `Locker ${lockerId} unblocked successfully` 
        });
      } else {
        reply.code(400).send({ error: 'Failed to unblock locker' });
      }
    } catch (error) {
      fastify.log.error('Failed to unblock locker:', error);
      reply.code(500).send({ error: 'Failed to unblock locker' });
    }
  });

  // Bulk operations
  fastify.post('/bulk/open', {
    preHandler: [requirePermission(Permission.BULK_OPEN), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        properties: {
          lockers: {
            type: 'array',
            items: {
              type: 'object',
              required: ['kioskId', 'lockerId'],
              properties: {
                kioskId: { type: 'string' },
                lockerId: { type: 'number' }
              }
            }
          },
          intervalMs: { type: 'number', default: 300 },
          reason: { type: 'string', default: 'Bulk open operation' },
          excludeVip: { type: 'boolean', default: true }
        }
      }
    }
  }, async (request, reply) => {
    const { lockers, intervalMs = 300, reason, excludeVip = true } = request.body as {
      lockers: Array<{ kioskId: string; lockerId: number }>;
      intervalMs?: number;
      reason?: string;
      excludeVip?: boolean;
    };
    const user = (request as any).user as User;

    try {
      const results = [];
      let successCount = 0;
      const failedLockers = [];

      for (const { kioskId, lockerId } of lockers) {
        try {
          // Fetch locker to check VIP status
          const locker = await lockerStateManager.getLocker(kioskId, lockerId);
          if (!locker) {
            failedLockers.push({ kioskId, lockerId, reason: 'not_found' });
            results.push({ kioskId, lockerId, success: false, error: 'Locker not found' });
            continue;
          }

          // Skip VIP lockers if excludeVip is true
          if (locker.is_vip && excludeVip) {
            failedLockers.push({ kioskId, lockerId, reason: 'vip' });
            results.push({ kioskId, lockerId, success: false, error: 'VIP locker excluded' });
            continue;
          }

          const success = await lockerStateManager.releaseLocker(kioskId, lockerId);
          
          if (success) {
            successCount++;
            await eventRepository.logEvent({
              kiosk_id: kioskId,
              locker_id: lockerId,
              event_type: 'staff_open',
              staff_user: user.username,
              details: { reason, bulk_operation: true, is_vip: locker.is_vip }
            });
          } else {
            failedLockers.push({ kioskId, lockerId, reason: 'release_failed' });
          }

          results.push({ kioskId, lockerId, success });

          // Wait between operations
          if (intervalMs > 0) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
          }
        } catch (error) {
          failedLockers.push({ kioskId, lockerId, reason: 'error' });
          results.push({ kioskId, lockerId, success: false, error: error.message });
        }
      }

      // Log bulk operation summary
      await eventRepository.logEvent({
        kiosk_id: 'bulk',
        event_type: 'bulk_open',
        staff_user: user.username,
        details: {
          total_count: lockers.length,
          success_count: successCount,
          failed_lockers: failedLockers,
          reason,
          exclude_vip: excludeVip
        }
      });

      reply.send({
        success: true,
        totalCount: lockers.length,
        successCount,
        failedCount: failedLockers.length,
        failedLockers,
        results
      });
    } catch (error) {
      fastify.log.error('Bulk open failed:', error);
      reply.code(500).send({ error: 'Bulk open operation failed' });
    }
  });

  // End of day opening with CSV report
  fastify.post('/end-of-day', {
    preHandler: [requirePermission(Permission.BULK_OPEN), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        properties: {
          excludeVip: { type: 'boolean', default: true },
          kioskId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { excludeVip = true, kioskId } = request.body as {
      excludeVip?: boolean;
      kioskId?: string;
    };
    const user = (request as any).user as User;

    try {
      // Get all Owned and Reserved lockers
      const lockers = await lockerStateManager.getAllLockers(kioskId);
      const targetLockers = lockers.filter(locker => {
        if (excludeVip && locker.is_vip) return false;
        return locker.status === 'Owned' || locker.status === 'Reserved';
      });

      const csvRows = ['kiosk_id,locker_id,timestamp,result'];
      let successCount = 0;

      for (const locker of targetLockers) {
        const timestamp = new Date().toISOString();
        try {
          const success = await lockerStateManager.releaseLocker(locker.kiosk_id, locker.id);
          const result = success ? 'success' : 'failed';
          
          csvRows.push(`${locker.kiosk_id},${locker.id},${timestamp},${result}`);
          
          if (success) {
            successCount++;
            await eventRepository.logEvent({
              kiosk_id: locker.kiosk_id,
              locker_id: locker.id,
              event_type: 'staff_open',
              staff_user: user.username,
              details: { reason: 'End of day opening', end_of_day: true }
            });
          }

          // Wait between operations
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          csvRows.push(`${locker.kiosk_id},${locker.id},${timestamp},error`);
        }
      }

      const csvContent = csvRows.join('\n');

      // Log end of day operation
      await eventRepository.logEvent({
        kiosk_id: kioskId || 'all',
        event_type: 'end_of_day_open',
        staff_user: user.username,
        details: {
          total_count: targetLockers.length,
          success_count: successCount,
          exclude_vip: excludeVip
        }
      });

      reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="end-of-day-${new Date().toISOString().split('T')[0]}.csv"`)
        .send(csvContent);
    } catch (error) {
      fastify.log.error('End of day operation failed:', error);
      reply.code(500).send({ error: 'End of day operation failed' });
    }
  });

  // Get all kiosks
  fastify.get('/kiosks', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)]
  }, async (request, reply) => {
    try {
      const { KioskHeartbeatRepository } = await import('../../../../shared/database/kiosk-heartbeat-repository.js');
      const heartbeatRepo = new KioskHeartbeatRepository(dbManager);
      const kiosks = await heartbeatRepo.getAllKiosks();
      
      reply.send({
        kiosks: kiosks.map(kiosk => ({
          kiosk_id: kiosk.kiosk_id,
          zone: kiosk.zone,
          status: kiosk.status,
          last_seen: kiosk.last_seen
        }))
      });
    } catch (error) {
      fastify.log.error('Failed to get kiosks:', error);
      reply.code(500).send({ error: 'Failed to retrieve kiosks' });
    }
  });
}