import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { EventRepository } from '../../../../shared/database/event-repository';
import { CommandQueueManager } from '../../../../shared/services/command-queue-manager';
import { requirePermission, requireCsrfToken } from '../middleware/auth-middleware';
import { Permission } from '../services/permission-service';
import { User } from '../services/auth-service';
import { webSocketService } from '../../../../shared/services/websocket-service';

interface LockerRouteOptions extends FastifyPluginOptions {
  dbManager: DatabaseManager;
}

// Per-locker command lock to prevent concurrent operations with TTL fail-safe
const lockerCommandLocks = new Map<string, { locked: boolean; timestamp: number }>();
const LOCK_TTL_MS = 90 * 1000; // 90 seconds fail-safe

function getLockerLockKey(kioskId: string, lockerId: number): string {
  return `${kioskId}:${lockerId}`;
}

function isLockerLocked(kioskId: string, lockerId: number): boolean {
  const key = getLockerLockKey(kioskId, lockerId);
  const lockInfo = lockerCommandLocks.get(key);
  
  if (!lockInfo) return false;
  
  // Check if lock has expired (TTL fail-safe)
  if (Date.now() - lockInfo.timestamp > LOCK_TTL_MS) {
    lockerCommandLocks.delete(key);
    return false;
  }
  
  return lockInfo.locked;
}

function lockLocker(kioskId: string, lockerId: number): void {
  const key = getLockerLockKey(kioskId, lockerId);
  lockerCommandLocks.set(key, { locked: true, timestamp: Date.now() });
}

function unlockLocker(kioskId: string, lockerId: number): void {
  lockerCommandLocks.delete(getLockerLockKey(kioskId, lockerId));
}

// Helper function to broadcast locker state updates via WebSocket
async function broadcastLockerUpdate(lockerStateManager: LockerStateManager, kioskId: string, lockerId: number): Promise<void> {
  try {
    const updatedLocker = await lockerStateManager.getLocker(kioskId, lockerId);
    if (updatedLocker) {
      webSocketService.broadcastStateUpdate({
        type: 'locker_update',
        kioskId,
        lockerId,
        status: updatedLocker.status,
        ownerKey: updatedLocker.owner_key,
        timestamp: new Date()
      });
    }
  } catch (error) {
    console.error('Failed to broadcast locker update:', error);
  }
}

export async function lockerRoutes(fastify: FastifyInstance, options: LockerRouteOptions) {
  const { dbManager } = options;
  const lockerStateManager = new LockerStateManager(dbManager);
  const eventRepository = new EventRepository(dbManager);
  const commandQueue = new CommandQueueManager();

  // Validation helper functions
  async function validateKioskExists(kioskId: string): Promise<boolean> {
    try {
      const { KioskHeartbeatRepository } = require('../../../../shared/database/kiosk-heartbeat-repository');
      const heartbeatRepo = new KioskHeartbeatRepository(dbManager.getConnection());
      const kiosk = await heartbeatRepo.findById(kioskId);
      return kiosk !== null;
    } catch (error) {
      fastify.log.error('Error validating kiosk existence:', error);
      return false;
    }
  }

  function validateLockerId(lockerId: number): { valid: boolean; error?: string } {
    if (!Number.isInteger(lockerId)) {
      return { valid: false, error: 'Locker ID must be an integer' };
    }
    if (lockerId < 1) {
      return { valid: false, error: 'Locker ID must be a positive number' };
    }
    if (lockerId > 32) {
      return { valid: false, error: 'Locker ID must be between 1 and 32' };
    }
    return { valid: true };
  }

  function validateIntervalMs(intervalMs: number): { valid: boolean; error?: string } {
    if (!Number.isInteger(intervalMs)) {
      return { valid: false, error: 'Interval must be an integer' };
    }
    if (intervalMs < 100) {
      return { valid: false, error: 'Interval must be at least 100ms' };
    }
    if (intervalMs > 5000) {
      return { valid: false, error: 'Interval must be at most 5000ms' };
    }
    return { valid: true };
  }

  // Idempotency check - prevent duplicate commands for same locker
  async function checkDuplicateCommand(kioskId: string, lockerId: number): Promise<boolean> {
    try {
      const pendingCommands = await commandQueue.getPendingCommands(kioskId);
      return pendingCommands.some(cmd => 
        (cmd.command_type === 'open_locker' && cmd.payload.locker_id === lockerId) ||
        (cmd.command_type === 'bulk_open' && cmd.payload.locker_ids?.includes(lockerId))
      );
    } catch (error) {
      fastify.log.error('Error checking duplicate commands:', error);
      return false;
    }
  }

  // Get all lockers with filtering
  fastify.get('/', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)]
  }, async (request, reply) => {
    const query = request.query as {
      kioskId?: string;
      status?: string;
      zone?: string;
    };

    const requestId = (request as any).id || 'unknown';

    try {
      fastify.log.info({
        requestId,
        route: '/api/lockers',
        query: query,
        message: '🔍 Locker API request received'
      });

      // Validate required kioskId parameter
      if (!query.kioskId) {
        fastify.log.warn({
          requestId,
          route: '/api/lockers',
          error: 'Missing kioskId parameter'
        });
        return reply.code(400).send({
          code: 'bad_request',
          message: 'kioskId required'
        });
      }

      fastify.log.info({
        requestId,
        kioskId: query.kioskId,
        status: query.status,
        message: '📊 Calling lockerStateManager.getAllLockers...'
      });

      const lockers = await lockerStateManager.getAllLockers(query.kioskId, query.status);
      
      fastify.log.info({
        requestId,
        kioskId: query.kioskId,
        lockersCount: lockers ? lockers.length : 'null/undefined',
        lockersType: typeof lockers,
        isArray: Array.isArray(lockers),
        message: '📊 lockerStateManager.getAllLockers result'
      });
      
      // Ensure lockers is always an array
      let filteredLockers;
      if (!Array.isArray(lockers)) {
        fastify.log.warn({
          requestId,
          kioskId: query.kioskId,
          lockersType: typeof lockers,
          lockersValue: lockers,
          message: '⚠️ lockers is not an array, converting to empty array'
        });
        // Convert to empty array if not an array
        filteredLockers = [];
      } else {
        // Add zone filtering if needed (would need kiosk heartbeat data)
        filteredLockers = lockers;
        if (query.zone) {
          // This would require joining with kiosk_heartbeat table
          // For now, just return all lockers
        }
      }

      // Structured logging with requestId, kioskId, and locker count
      fastify.log.info({
        requestId,
        kioskId: query.kioskId,
        lockerCount: filteredLockers.length,
        route: '/api/lockers',
        message: 'Lockers retrieved successfully'
      });

      // Final safety check: ensure filteredLockers is an array
      if (!Array.isArray(filteredLockers)) {
        fastify.log.error({
          requestId,
          kioskId: query.kioskId,
          filteredLockersType: typeof filteredLockers,
          filteredLockersValue: filteredLockers,
          message: '❌ filteredLockers is still not an array, forcing empty array'
        });
        filteredLockers = [];
      }

      const responseData = {
        lockers: filteredLockers,
        total: filteredLockers.length
      };

      fastify.log.info({
        requestId,
        kioskId: query.kioskId,
        responseData: responseData,
        filteredLockersIsArray: Array.isArray(filteredLockers),
        message: '📤 Sending response to client'
      });

      reply.send(responseData);
    } catch (error) {
      fastify.log.error({
        requestId,
        kioskId: query.kioskId,
        route: '/api/lockers',
        error: error.message,
        message: 'Failed to retrieve lockers'
      });
      reply.code(500).send({
        code: 'server_error',
        message: 'try again'
      });
    }
  });

  // Get locker status by ID
  fastify.get('/:kioskId/:lockerId', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)]
  }, async (request, reply) => {
    const { kioskId, lockerId } = request.params as { kioskId: string; lockerId: string };
    const requestId = (request as any).id || 'unknown';

    try {
      const locker = await lockerStateManager.getLocker(kioskId, parseInt(lockerId));
      if (!locker) {
        fastify.log.warn({
          requestId,
          kioskId,
          lockerId,
          route: '/api/lockers/:kioskId/:lockerId',
          message: 'Locker not found'
        });
        return reply.code(404).send({
          code: 'not_found',
          message: 'Locker not found'
        });
      }

      fastify.log.info({
        requestId,
        kioskId,
        lockerId,
        route: '/api/lockers/:kioskId/:lockerId',
        message: 'Locker retrieved successfully'
      });

      reply.send({ locker });
    } catch (error) {
      fastify.log.error({
        requestId,
        kioskId,
        lockerId,
        route: '/api/lockers/:kioskId/:lockerId',
        error: error.message,
        message: 'Failed to retrieve locker'
      });
      reply.code(500).send({
        code: 'server_error',
        message: 'try again'
      });
    }
  });

  // Open individual locker
  fastify.post('/:kioskId/:lockerId/open', {
    preHandler: [requirePermission(Permission.OPEN_LOCKER), requireCsrfToken()],
    schema: {
      params: {
        type: 'object',
        required: ['kioskId', 'lockerId'],
        properties: {
          kioskId: { type: 'string', minLength: 1 },
          lockerId: { type: 'string', pattern: '^[0-9]+$' }
        }
      },
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
    const requestId = (request as any).id || 'unknown';

    try {
      const lockerId_num = parseInt(lockerId);
      
      // Validate kioskId exists and is accessible to the staff user
      const kioskExists = await validateKioskExists(kioskId);
      if (!kioskExists) {
        return reply.code(400).send({
          code: 'bad_request',
          message: 'Invalid kiosk ID - kiosk not found or not accessible'
        });
      }

      // Validate lockerId is numeric and within valid range
      const lockerValidation = validateLockerId(lockerId_num);
      if (!lockerValidation.valid) {
        return reply.code(400).send({
          code: 'bad_request',
          message: lockerValidation.error
        });
      }

      // Add idempotency check to reject duplicate open commands for same locker
      const hasDuplicateCommand = await checkDuplicateCommand(kioskId, lockerId_num);
      if (hasDuplicateCommand) {
        return reply.code(409).send({
          code: 'conflict',
          message: 'Duplicate command - locker already has a pending open operation'
        });
      }

      // Check per-locker command lock
      if (isLockerLocked(kioskId, lockerId_num)) {
        return reply.code(409).send({
          code: 'conflict',
          message: 'Locker operation already in progress'
        });
      }

      // Lock the locker for this operation
      lockLocker(kioskId, lockerId_num);

      try {
        // Check if locker exists and is accessible
        const locker = await lockerStateManager.getLocker(kioskId, lockerId_num);
        if (!locker) {
          return reply.code(404).send({
            code: 'not_found',
            message: 'Locker not found'
          });
        }

        // Skip release for VIP lockers unless override is true
        if (locker.is_vip && !override) {
          return reply.code(423).send({
            code: 'locked',
            message: 'VIP locker cannot be opened without override'
          });
        }

        // Enqueue 'open_locker' command instead of direct database update
        const commandId = await commandQueue.enqueueCommand(kioskId, 'open_locker', {
          open_locker: {
            locker_id: lockerId_num,
            staff_user: user.username,
            reason: reason || 'Manual open',
            force: override || false
          }
        });

        // Log with required fields: command_id, kiosk_id, locker_id, staff_user, reason, req_id
        fastify.log.info({
          command_id: commandId,
          kiosk_id: kioskId,
          locker_id: lockerId_num,
          staff_user: user.username,
          reason: reason || 'Manual open',
          req_id: requestId,
          message: 'Single locker open command enqueued'
        });

        // Return 202 with command_id only (no internal fields)
        return reply.code(202).send({
          command_id: commandId
        });

      } finally {
        // Always unlock the locker after operation
        unlockLocker(kioskId, lockerId_num);
      }

    } catch (error) {
      fastify.log.error({
        requestId,
        kioskId,
        lockerId,
        staffUser: user.username,
        error: error.message,
        message: 'Failed to queue locker open command'
      });
      
      // Ensure locker is unlocked on error
      unlockLocker(kioskId, parseInt(lockerId));
      
      return reply.code(500).send({
        code: 'server_error',
        message: 'Failed to queue open command'
      });
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

        // Broadcast locker state update via WebSocket
        await broadcastLockerUpdate(lockerStateManager, kioskId, lockerId_num);

        reply.send({ 
          success: true, 
          message: `Locker ${lockerId} blocked successfully` 
        });
      } else {
        reply.code(400).send({
          code: 'bad_request',
          message: 'Failed to block locker'
        });
      }
    } catch (error) {
      fastify.log.error('Failed to block locker:', error);
      reply.code(500).send({
        code: 'server_error',
        message: 'try again'
      });
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

        // Broadcast locker state update via WebSocket
        await broadcastLockerUpdate(lockerStateManager, kioskId, lockerId_num);

        reply.send({ 
          success: true, 
          message: `Locker ${lockerId} unblocked successfully` 
        });
      } else {
        reply.code(400).send({
          code: 'bad_request',
          message: 'Failed to unblock locker'
        });
      }
    } catch (error) {
      fastify.log.error('Failed to unblock locker:', error);
      reply.code(500).send({
        code: 'server_error',
        message: 'try again'
      });
    }
  });

  // Release locker
  fastify.post('/:kioskId/:lockerId/release', {
    preHandler: [requirePermission(Permission.OPEN_LOCKER), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { kioskId, lockerId } = request.params as { kioskId: string; lockerId: string };
    const { reason } = request.body as { reason?: string };
    const user = (request as any).user as User;

    try {
      const lockerId_num = parseInt(lockerId);
      
      const success = await lockerStateManager.releaseLocker(kioskId, lockerId_num);
      
      if (success) {
        await eventRepository.logEvent({
          kiosk_id: kioskId,
          locker_id: lockerId_num,
          event_type: 'staff_release',
          staff_user: user.username,
          details: { reason: reason || 'Manual release' }
        });

        // Broadcast locker state update via WebSocket
        await broadcastLockerUpdate(lockerStateManager, kioskId, lockerId_num);

        reply.send({ 
          success: true, 
          message: `Locker ${lockerId} released successfully` 
        });
      } else {
        reply.code(400).send({
          code: 'bad_request',
          message: 'Failed to release locker'
        });
      }
    } catch (error) {
      fastify.log.error('Failed to release locker:', error);
      reply.code(500).send({
        code: 'server_error',
        message: 'try again'
      });
    }
  });

  // Bulk operations
  fastify.post('/bulk/open', {
    preHandler: [requirePermission(Permission.BULK_OPEN), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        required: ['kioskId', 'lockerIds'],
        properties: {
          kioskId: { type: 'string', minLength: 1 },
          lockerIds: { 
            type: 'array', 
            items: { type: 'number', minimum: 1 },
            minItems: 1,
            maxItems: 100
          },
          reason: { type: 'string', default: 'Bulk open operation' },
          exclude_vip: { type: 'boolean', default: true },
          interval_ms: { type: 'number', default: 1000, minimum: 100, maximum: 5000 }
        }
      }
    }
  }, async (request, reply) => {
    const { kioskId, lockerIds, reason, exclude_vip = true, interval_ms = 1000 } = request.body as {
      kioskId: string;
      lockerIds: number[];
      reason?: string;
      exclude_vip?: boolean;
      interval_ms?: number;
    };
    const user = (request as any).user as User;
    const requestId = (request as any).id || 'unknown';

    try {
      // Validate kioskId exists and is accessible to the staff user
      const kioskExists = await validateKioskExists(kioskId);
      if (!kioskExists) {
        return reply.code(400).send({
          code: 'bad_request',
          message: 'Invalid kiosk ID - kiosk not found or not accessible'
        });
      }

      // Validate intervalMs is between 100-5000ms for bulk operations
      const intervalValidation = validateIntervalMs(interval_ms);
      if (!intervalValidation.valid) {
        return reply.code(400).send({
          code: 'bad_request',
          message: intervalValidation.error
        });
      }

      // Filter invalid locker IDs and remove duplicates from lockerIds array
      const uniqueLockerIds = [...new Set(lockerIds)].filter(id => {
        const validation = validateLockerId(id);
        return validation.valid;
      });
      
      if (uniqueLockerIds.length === 0) {
        return reply.code(400).send({
          code: 'bad_request',
          message: 'No valid locker IDs provided - locker IDs must be integers between 1 and 32'
        });
      }

      // Check for any invalid locker IDs and provide clear error message
      const invalidLockerIds = lockerIds.filter(id => {
        const validation = validateLockerId(id);
        return !validation.valid;
      });
      
      if (invalidLockerIds.length > 0) {
        return reply.code(400).send({
          code: 'bad_request',
          message: `Invalid locker IDs: ${invalidLockerIds.join(', ')} - locker IDs must be integers between 1 and 32`
        });
      }

      // Add idempotency check to reject duplicate open commands for any of the lockers
      const duplicateLockers: number[] = [];
      for (const lockerId of uniqueLockerIds) {
        const hasDuplicateCommand = await checkDuplicateCommand(kioskId, lockerId);
        if (hasDuplicateCommand) {
          duplicateLockers.push(lockerId);
        }
      }
      
      if (duplicateLockers.length > 0) {
        return reply.code(409).send({
          code: 'conflict',
          message: `Duplicate commands - lockers ${duplicateLockers.join(', ')} already have pending open operations`
        });
      }

      // When exclude_vip is true, filter out VIP lockers from the operation
      const validLockerIds: number[] = [];
      const lockedLockers: number[] = [];
      
      for (const lockerId of uniqueLockerIds) {
        try {
          // Check per-locker command locks and reject if any selected locker has pending command
          if (isLockerLocked(kioskId, lockerId)) {
            lockedLockers.push(lockerId);
            continue;
          }

          const locker = await lockerStateManager.getLocker(kioskId, lockerId);
          if (!locker) {
            // Skip invalid lockers
            continue;
          }

          // Filter out VIP lockers if exclude_vip is true
          if (exclude_vip && locker.is_vip) {
            continue;
          }

          validLockerIds.push(lockerId);
        } catch (error) {
          // Skip invalid lockers
          continue;
        }
      }

      // Reject if any selected locker has pending command
      if (lockedLockers.length > 0) {
        return reply.code(409).send({
          code: 'conflict',
          message: `Lockers ${lockedLockers.join(', ')} have pending operations`
        });
      }

      if (validLockerIds.length === 0) {
        const message = exclude_vip ? 'No valid non-VIP lockers found' : 'No valid lockers found';
        return reply.code(400).send({
          code: 'bad_request',
          message
        });
      }

      // Enqueue 'bulk_open' command with locker_ids, staff_user, reason, exclude_vip, interval_ms
      const commandId = await commandQueue.enqueueCommand(kioskId, 'bulk_open', {
        bulk_open: {
          locker_ids: validLockerIds,
          staff_user: user.username,
          reason: reason || 'Bulk open operation',
          exclude_vip,
          interval_ms
        }
      });

      // Log staff_user, reason, and command_id when enqueuing bulk command
      fastify.log.info({
        command_id: commandId,
        kiosk_id: kioskId,
        locker_ids: validLockerIds,
        staff_user: user.username,
        reason: reason || 'Bulk open operation',
        req_id: requestId,
        processed_count: validLockerIds.length,
        message: 'Bulk open command enqueued'
      });

      // Return 202 Accepted with command_id and processed locker count for status polling
      return reply.code(202).send({
        command_id: commandId,
        processed: validLockerIds.length
      });

    } catch (error) {
      fastify.log.error({
        kiosk_id: kioskId,
        staff_user: user.username,
        req_id: requestId,
        error: error.message,
        message: 'Failed to queue bulk open command'
      });
      
      return reply.code(500).send({
        code: 'server_error',
        message: 'Failed to queue bulk open command'
      });
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
      reply.code(500).send({
        code: 'server_error',
        message: 'try again'
      });
    }
  });

  // Get command status by ID
  fastify.get('/commands/:id', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const requestId = (request as any).id || 'unknown';

    try {
      const command = await commandQueue.getCommand(id);
      
      if (!command) {
        return reply.code(404).send({
          code: 'not_found',
          message: 'Command not found'
        });
      }

      fastify.log.info({
        requestId,
        commandId: id,
        status: command.status,
        message: 'Command status retrieved'
      });

      // Extract locker information from payload
      let lockerInfo = {};
      if (command.payload.locker_id) {
        lockerInfo = { locker_id: command.payload.locker_id };
      } else if (command.payload.locker_ids) {
        lockerInfo = { locker_ids: command.payload.locker_ids };
      }

      return reply.send({
        command_id: command.command_id,
        status: command.status,
        command_type: command.command_type,
        created_at: command.created_at,
        executed_at: command.executed_at,
        completed_at: command.completed_at,
        last_error: command.last_error,
        retry_count: command.retry_count,
        ...lockerInfo
      });

    } catch (error) {
      fastify.log.error({
        requestId,
        commandId: id,
        error: error.message,
        message: 'Failed to retrieve command status'
      });
      
      return reply.code(500).send({
        code: 'server_error',
        message: 'Failed to retrieve command status'
      });
    }
  });

  // Get all kiosks
  fastify.get('/kiosks', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)]
  }, async (request, reply) => {
    try {
      const { KioskHeartbeatRepository } = require('../../../../shared/database/kiosk-heartbeat-repository');
      const heartbeatRepo = new KioskHeartbeatRepository(dbManager.getConnection());
      const kiosks = await heartbeatRepo.findAll();
      
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
      reply.code(500).send({
        code: 'server_error',
        message: 'try again'
      });
    }
  });
}
