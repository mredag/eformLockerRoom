import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { EventRepository } from '../../../../shared/database/event-repository';
import { requirePermission, requireCsrfToken } from '../middleware/auth-middleware';
import { Permission } from '../services/permission-service';
import { User } from '../services/auth-service';
import { webSocketService } from '../../../../shared/services/websocket-service';
import crypto from 'crypto';

interface OverdueSuspectedRouteOptions extends FastifyPluginOptions {
  dbManager: DatabaseManager;
}

// Standard JSON error response schema
interface ApiError {
  code: string;
  message: string;
  details?: any;
}

// PII sanitization helper
function sanitizeOwnerKey(ownerKey: string | null): string {
  if (!ownerKey) return 'none';
  const hash = crypto.createHash('sha256').update(ownerKey).digest('hex');
  return `***${hash.substring(0, 6)}`;
}

interface OverdueLocker {
  kiosk_id: string;
  locker_id: number;
  status: string;
  owner_hash: string;
  owner_type: string | null;
  overdue_from: string | null;
  overdue_reason: string | null;
  display_name: string | null;
  overdue_duration_minutes: number;
  version: number;
}

interface SuspectedLocker {
  kiosk_id: string;
  locker_id: number;
  status: string;
  owner_hash: string;
  owner_type: string | null;
  suspected_occupied: number;
  display_name: string | null;
  last_report_time: string | null;
  report_count: number;
  version: number;
}

export async function overdueSuspectedRoutes(fastify: FastifyInstance, options: OverdueSuspectedRouteOptions) {
  const { dbManager } = options;
  const lockerStateManager = new LockerStateManager(dbManager);
  const eventRepository = new EventRepository(dbManager);

  // Helper function to broadcast sanitized locker state updates via WebSocket
  async function broadcastLockerUpdate(kioskId: string, lockerId: number): Promise<void> {
    try {
      const updatedLocker = await lockerStateManager.getLocker(kioskId, lockerId);
      if (updatedLocker) {
        webSocketService.broadcastStateUpdate({
          type: 'locker_update',
          kioskId,
          lockerId,
          status: updatedLocker.status,
          ownerHash: sanitizeOwnerKey(updatedLocker.owner_key),
          ownerType: updatedLocker.owner_type,
          displayName: updatedLocker.display_name,
          isVip: updatedLocker.is_vip,
          updatedAt: updatedLocker.updated_at,
          timestamp: new Date()
        });
      }
    } catch (error) {
      fastify.log.error('Overdue suspected WebSocket broadcast failed.', { kioskId, lockerId, error: error.message });
    }
  }

  // Helper function to create audit record in transaction
  async function createAuditRecord(
    db: any,
    kioskId: string,
    lockerId: number,
    action: string,
    adminUser: string,
    oldValue: any,
    newValue: any,
    reason?: string
  ): Promise<void> {
    const auditStmt = db.prepare(`
      INSERT INTO audit_log (
        kiosk_id, locker_id, action, editor, old_value, new_value, 
        reason, timestamp, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
    `);
    
    auditStmt.run(
      kioskId,
      lockerId,
      action,
      adminUser,
      JSON.stringify(oldValue),
      JSON.stringify(newValue),
      reason || null
    );
  }

  // Get all overdue lockers (admin read access)
  fastify.get('/overdue', {
    preHandler: [requirePermission(Permission.MANAGE_LOCKERS)]
  }, async (request, reply) => {
    const query = request.query as { kioskId?: string };

    try {
      const db = dbManager.getConnection();
      
      let sql = `
        SELECT 
          l.kiosk_id,
          l.id as locker_id,
          l.status,
          l.owner_key,
          l.owner_type,
          l.overdue_from,
          l.overdue_reason,
          l.display_name,
          l.version,
          CASE 
            WHEN l.overdue_from IS NOT NULL 
            THEN CAST((julianday('now') - julianday(l.overdue_from)) * 24 * 60 AS INTEGER)
            ELSE 0 
          END as overdue_duration_minutes
        FROM lockers l
        WHERE l.overdue_from IS NOT NULL
      `;
      
      const params: any[] = [];
      
      if (query.kioskId) {
        sql += ' AND l.kiosk_id = ?';
        params.push(query.kioskId);
      }
      
      sql += ' ORDER BY l.overdue_from ASC';

      const rawLockers = db.prepare(sql).all(...params);
      
      // Sanitize PII in response
      const overdueLockers: OverdueLocker[] = rawLockers.map(locker => ({
        ...locker,
        owner_hash: sanitizeOwnerKey(locker.owner_key),
        owner_key: undefined // Remove PII field
      }));

      fastify.log.info(`Overdue retrieval executed: count=${overdueLockers.length}, kiosk=${query.kioskId || 'all'}.`);

      reply.send({
        lockers: overdueLockers,
        total: overdueLockers.length
      });
    } catch (error) {
      fastify.log.error(`Overdue retrieval failed: error=${error.message}.`);
      const apiError: ApiError = {
        code: 'server_error',
        message: 'Failed to retrieve overdue lockers'
      };
      reply.code(500).send(apiError);
    }
  });

  // Get all suspected occupied lockers (admin read access)
  fastify.get('/suspected', {
    preHandler: [requirePermission(Permission.MANAGE_LOCKERS)]
  }, async (request, reply) => {
    const query = request.query as { kioskId?: string };

    try {
      const db = dbManager.getConnection();
      
      let sql = `
        SELECT 
          l.kiosk_id,
          l.id as locker_id,
          l.status,
          l.owner_key,
          l.owner_type,
          l.suspected_occupied,
          l.display_name,
          l.version,
          (
            SELECT MAX(ur.reported_at)
            FROM user_reports ur 
            WHERE ur.kiosk_id = l.kiosk_id 
              AND ur.locker_id = l.id 
              AND ur.report_type = 'suspected_occupied'
          ) as last_report_time,
          (
            SELECT COUNT(*)
            FROM user_reports ur 
            WHERE ur.kiosk_id = l.kiosk_id 
              AND ur.locker_id = l.id 
              AND ur.report_type = 'suspected_occupied'
              AND DATE(ur.reported_at) = DATE('now')
          ) as report_count
        FROM lockers l
        WHERE l.suspected_occupied = 1
      `;
      
      const params: any[] = [];
      
      if (query.kioskId) {
        sql += ' AND l.kiosk_id = ?';
        params.push(query.kioskId);
      }
      
      sql += ' ORDER BY last_report_time DESC';

      const rawLockers = db.prepare(sql).all(...params);
      
      // Sanitize PII in response
      const suspectedLockers: SuspectedLocker[] = rawLockers.map(locker => ({
        ...locker,
        owner_hash: sanitizeOwnerKey(locker.owner_key),
        owner_key: undefined // Remove PII field
      }));

      fastify.log.info(`Suspected retrieval executed: count=${suspectedLockers.length}, kiosk=${query.kioskId || 'all'}.`);

      reply.send({
        lockers: suspectedLockers,
        total: suspectedLockers.length
      });
    } catch (error) {
      fastify.log.error(`Suspected retrieval failed: error=${error.message}.`);
      const apiError: ApiError = {
        code: 'server_error',
        message: 'Failed to retrieve suspected lockers'
      };
      reply.code(500).send(apiError);
    }
  });

  // Force open overdue locker (admin write access)
  fastify.post('/overdue/:kioskId/:lockerId/force-open', {
    preHandler: [requirePermission(Permission.MANAGE_LOCKERS), requireCsrfToken()],
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
          reason: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { kioskId, lockerId } = request.params as { kioskId: string; lockerId: string };
    const { reason } = request.body as { reason?: string };
    const user = (request as any).user as User;

    const db = dbManager.getConnection();
    
    try {
      const lockerId_num = parseInt(lockerId);
      
      // Start transaction for atomic operation
      db.exec('BEGIN TRANSACTION');
      
      try {
        // Get current locker state with version for optimistic locking
        const currentLocker = db.prepare(`
          SELECT overdue_from, overdue_reason, owner_key, status, version
          FROM lockers 
          WHERE kiosk_id = ? AND id = ? AND overdue_from IS NOT NULL
        `).get(kioskId, lockerId_num);

        if (!currentLocker) {
          db.exec('ROLLBACK');
          const apiError: ApiError = {
            code: 'not_found',
            message: 'Locker not found or not overdue'
          };
          return reply.code(404).send(apiError);
        }

        const oldValue = {
          overdue_from: currentLocker.overdue_from,
          overdue_reason: currentLocker.overdue_reason,
          status: currentLocker.status
        };

        // Force open the locker (release ownership)
        const success = await lockerStateManager.releaseLocker(kioskId, lockerId_num);
        
        if (!success) {
          db.exec('ROLLBACK');
          const apiError: ApiError = {
            code: 'operation_failed',
            message: 'Failed to force open locker'
          };
          return reply.code(400).send(apiError);
        }

        // Clear overdue status with version increment
        const updateResult = db.prepare(`
          UPDATE lockers 
          SET overdue_from = NULL, 
              overdue_reason = NULL,
              cleared_by = ?,
              cleared_at = CURRENT_TIMESTAMP,
              version = version + 1
          WHERE kiosk_id = ? AND id = ? AND version = ?
        `).run(user.username, kioskId, lockerId_num, currentLocker.version);

        if (updateResult.changes === 0) {
          db.exec('ROLLBACK');
          const apiError: ApiError = {
            code: 'version_conflict',
            message: 'Locker was modified by another operation'
          };
          return reply.code(409).send(apiError);
        }

        const newValue = {
          overdue_from: null,
          overdue_reason: null,
          status: 'Free'
        };

        // Create audit record in same transaction
        await createAuditRecord(
          db, kioskId, lockerId_num, 'force_clear_overdue', 
          user.username, oldValue, newValue, reason
        );

        // Log the action
        await eventRepository.logEvent({
          kiosk_id: kioskId,
          locker_id: lockerId_num,
          event_type: 'force_clear_overdue',
          staff_user: user.username,
          details: { 
            reason: reason || 'Force opened overdue locker',
            overdue_reason: currentLocker.overdue_reason,
            overdue_from: currentLocker.overdue_from
          }
        });

        db.exec('COMMIT');

        // Broadcast locker state update
        await broadcastLockerUpdate(kioskId, lockerId_num);

        fastify.log.info(`Overdue force cleared: locker=${kioskId}-${lockerId_num}, admin=${user.username}.`);

        reply.send({ 
          success: true, 
          message: `Gecikmiş dolap ${lockerId} zorla açıldı ve temizlendi`,
          version: currentLocker.version + 1,
          affected_count: 1
        });
        
      } catch (innerError) {
        db.exec('ROLLBACK');
        throw innerError;
      }
      
    } catch (error) {
      fastify.log.error(`Overdue force clear failed: locker=${kioskId}-${lockerId}, error=${error.message}.`);
      const apiError: ApiError = {
        code: 'server_error',
        message: 'Failed to force open overdue locker'
      };
      reply.code(500).send(apiError);
    }
  });

  // Mark overdue locker as cleared (without opening) (admin write access)
  fastify.post('/overdue/:kioskId/:lockerId/mark-cleared', {
    preHandler: [requirePermission(Permission.MANAGE_LOCKERS), requireCsrfToken()],
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
          reason: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { kioskId, lockerId } = request.params as { kioskId: string; lockerId: string };
    const { reason } = request.body as { reason?: string };
    const user = (request as any).user as User;

    const db = dbManager.getConnection();
    
    try {
      const lockerId_num = parseInt(lockerId);
      
      // Start transaction for atomic operation
      db.exec('BEGIN TRANSACTION');
      
      try {
        // Get current locker state with version
        const currentLocker = db.prepare(`
          SELECT overdue_from, overdue_reason, status, version
          FROM lockers 
          WHERE kiosk_id = ? AND id = ? AND overdue_from IS NOT NULL
        `).get(kioskId, lockerId_num);

        if (!currentLocker) {
          db.exec('ROLLBACK');
          const apiError: ApiError = {
            code: 'not_found',
            message: 'Locker not found or not overdue'
          };
          return reply.code(404).send(apiError);
        }

        const oldValue = {
          overdue_from: currentLocker.overdue_from,
          overdue_reason: currentLocker.overdue_reason
        };

        // Clear overdue status only with version increment
        const updateResult = db.prepare(`
          UPDATE lockers 
          SET overdue_from = NULL, 
              overdue_reason = NULL,
              cleared_by = ?,
              cleared_at = CURRENT_TIMESTAMP,
              version = version + 1
          WHERE kiosk_id = ? AND id = ? AND version = ?
        `).run(user.username, kioskId, lockerId_num, currentLocker.version);

        if (updateResult.changes === 0) {
          db.exec('ROLLBACK');
          const apiError: ApiError = {
            code: 'version_conflict',
            message: 'Locker was modified by another operation'
          };
          return reply.code(409).send(apiError);
        }

        const newValue = {
          overdue_from: null,
          overdue_reason: null
        };

        // Create audit record in same transaction
        await createAuditRecord(
          db, kioskId, lockerId_num, 'mark_cleared_overdue', 
          user.username, oldValue, newValue, reason
        );

        // Log the action
        await eventRepository.logEvent({
          kiosk_id: kioskId,
          locker_id: lockerId_num,
          event_type: 'mark_cleared_overdue',
          staff_user: user.username,
          details: { 
            reason: reason || 'Marked overdue locker as cleared',
            overdue_reason: currentLocker.overdue_reason,
            overdue_from: currentLocker.overdue_from
          }
        });

        db.exec('COMMIT');

        // Broadcast locker state update
        await broadcastLockerUpdate(kioskId, lockerId_num);

        fastify.log.info(`Overdue marked cleared: locker=${kioskId}-${lockerId_num}, admin=${user.username}.`);

        reply.send({ 
          success: true, 
          message: `Gecikmiş dolap ${lockerId} temizlendi olarak işaretlendi`,
          version: currentLocker.version + 1,
          affected_count: 1
        });
        
      } catch (innerError) {
        db.exec('ROLLBACK');
        throw innerError;
      }
      
    } catch (error) {
      fastify.log.error(`Overdue mark cleared failed: locker=${kioskId}-${lockerId}, error=${error.message}.`);
      const apiError: ApiError = {
        code: 'server_error',
        message: 'Failed to mark overdue locker as cleared'
      };
      reply.code(500).send(apiError);
    }
  });

  // Clear suspected occupied flag (admin write access)
  fastify.post('/suspected/:kioskId/:lockerId/clear', {
    preHandler: [requirePermission(Permission.MANAGE_LOCKERS), requireCsrfToken()],
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
          reason: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { kioskId, lockerId } = request.params as { kioskId: string; lockerId: string };
    const { reason } = request.body as { reason?: string };
    const user = (request as any).user as User;

    const db = dbManager.getConnection();
    
    try {
      const lockerId_num = parseInt(lockerId);
      
      // Start transaction for atomic operation
      db.exec('BEGIN TRANSACTION');
      
      try {
        // Get current locker state with version
        const currentLocker = db.prepare(`
          SELECT suspected_occupied, status, version
          FROM lockers 
          WHERE kiosk_id = ? AND id = ? AND suspected_occupied = 1
        `).get(kioskId, lockerId_num);

        if (!currentLocker) {
          db.exec('ROLLBACK');
          const apiError: ApiError = {
            code: 'not_found',
            message: 'Locker not found or not marked as suspected occupied'
          };
          return reply.code(404).send(apiError);
        }

        const oldValue = {
          suspected_occupied: currentLocker.suspected_occupied
        };

        // Clear suspected occupied flag with version increment
        const updateResult = db.prepare(`
          UPDATE lockers 
          SET suspected_occupied = 0,
              cleared_by = ?,
              cleared_at = CURRENT_TIMESTAMP,
              version = version + 1
          WHERE kiosk_id = ? AND id = ? AND version = ?
        `).run(user.username, kioskId, lockerId_num, currentLocker.version);

        if (updateResult.changes === 0) {
          db.exec('ROLLBACK');
          const apiError: ApiError = {
            code: 'version_conflict',
            message: 'Locker was modified by another operation'
          };
          return reply.code(409).send(apiError);
        }

        const newValue = {
          suspected_occupied: 0
        };

        // Create audit record in same transaction
        await createAuditRecord(
          db, kioskId, lockerId_num, 'clear_suspected', 
          user.username, oldValue, newValue, reason
        );

        // Log the action
        await eventRepository.logEvent({
          kiosk_id: kioskId,
          locker_id: lockerId_num,
          event_type: 'clear_suspected',
          staff_user: user.username,
          details: { 
            reason: reason || 'Cleared suspected occupied flag'
          }
        });

        db.exec('COMMIT');

        // Broadcast locker state update
        await broadcastLockerUpdate(kioskId, lockerId_num);

        fastify.log.info(`Suspected cleared: locker=${kioskId}-${lockerId_num}, admin=${user.username}.`);

        reply.send({ 
          success: true, 
          message: `Şüpheli dolap ${lockerId} bayrağı temizlendi`,
          version: currentLocker.version + 1,
          affected_count: 1
        });
        
      } catch (innerError) {
        db.exec('ROLLBACK');
        throw innerError;
      }
      
    } catch (error) {
      fastify.log.error(`Suspected clear failed: locker=${kioskId}-${lockerId}, error=${error.message}.`);
      const apiError: ApiError = {
        code: 'server_error',
        message: 'Failed to clear suspected occupied flag'
      };
      reply.code(500).send(apiError);
    }
  });

  // Bulk operations for overdue lockers (admin write access)
  fastify.post('/overdue/bulk/force-open', {
    preHandler: [requirePermission(Permission.MANAGE_LOCKERS), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        required: ['lockers'],
        properties: {
          lockers: {
            type: 'array',
            items: {
              type: 'object',
              required: ['kioskId', 'lockerId'],
              properties: {
                kioskId: { type: 'string', minLength: 1 },
                lockerId: { type: 'number', minimum: 1 }
              }
            },
            minItems: 1,
            maxItems: 50
          },
          reason: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { lockers, reason } = request.body as {
      lockers: Array<{ kioskId: string; lockerId: number }>;
      reason?: string;
    };
    const user = (request as any).user as User;

    try {
      const results: Array<{ kioskId: string; lockerId: number; success: boolean; error?: string }> = [];
      const db = dbManager.getConnection();

      for (const { kioskId, lockerId } of lockers) {
        try {
          // Check if locker is overdue
          const overdueCheck = db.prepare(`
            SELECT overdue_from, overdue_reason 
            FROM lockers 
            WHERE kiosk_id = ? AND id = ? AND overdue_from IS NOT NULL
          `).get(kioskId, lockerId);

          if (!overdueCheck) {
            results.push({ kioskId, lockerId, success: false, error: 'Not overdue' });
            continue;
          }

          // Force open the locker
          const success = await lockerStateManager.releaseLocker(kioskId, lockerId);
          
          if (success) {
            // Clear overdue status
            db.prepare(`
              UPDATE lockers 
              SET overdue_from = NULL, 
                  overdue_reason = NULL,
                  cleared_by = ?,
                  cleared_at = CURRENT_TIMESTAMP
              WHERE kiosk_id = ? AND id = ?
            `).run(user.username, kioskId, lockerId);

            // Log the action
            await eventRepository.logEvent({
              kiosk_id: kioskId,
              locker_id: lockerId,
              event_type: 'bulk_force_clear_overdue',
              staff_user: user.username,
              details: { 
                reason: reason || 'Bulk force opened overdue locker',
                overdue_reason: overdueCheck.overdue_reason,
                overdue_from: overdueCheck.overdue_from
              }
            });

            // Broadcast locker state update
            await broadcastLockerUpdate(kioskId, lockerId);

            results.push({ kioskId, lockerId, success: true });
          } else {
            results.push({ kioskId, lockerId, success: false, error: 'Failed to open' });
          }

          // Small delay between operations
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          results.push({ kioskId, lockerId, success: false, error: 'Operation failed' });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      fastify.log.info({
        staffUser: user.username,
        totalCount: results.length,
        successCount,
        failureCount,
        reason: reason || 'Bulk force opened overdue lockers',
        message: 'Bulk overdue force open completed'
      });

      reply.send({
        success: true,
        message: `${successCount} dolap zorla açıldı, ${failureCount} başarısız`,
        results,
        summary: {
          total: results.length,
          success: successCount,
          failed: failureCount
        }
      });
    } catch (error) {
      fastify.log.error('Failed to bulk force open overdue lockers:', error);
      reply.code(500).send({
        code: 'server_error',
        message: 'Failed to bulk force open overdue lockers'
      });
    }
  });

  // Bulk clear suspected occupied flags (admin write access)
  fastify.post('/suspected/bulk/clear', {
    preHandler: [requirePermission(Permission.MANAGE_LOCKERS), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        required: ['lockers'],
        properties: {
          lockers: {
            type: 'array',
            items: {
              type: 'object',
              required: ['kioskId', 'lockerId'],
              properties: {
                kioskId: { type: 'string', minLength: 1 },
                lockerId: { type: 'number', minimum: 1 }
              }
            },
            minItems: 1,
            maxItems: 50
          },
          reason: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { lockers, reason } = request.body as {
      lockers: Array<{ kioskId: string; lockerId: number }>;
      reason?: string;
    };
    const user = (request as any).user as User;

    try {
      const results: Array<{ kioskId: string; lockerId: number; success: boolean; error?: string }> = [];
      const db = dbManager.getConnection();

      for (const { kioskId, lockerId } of lockers) {
        try {
          // Check if locker is suspected occupied
          const suspectedCheck = db.prepare(`
            SELECT suspected_occupied 
            FROM lockers 
            WHERE kiosk_id = ? AND id = ? AND suspected_occupied = 1
          `).get(kioskId, lockerId);

          if (!suspectedCheck) {
            results.push({ kioskId, lockerId, success: false, error: 'Not suspected' });
            continue;
          }

          // Clear suspected occupied flag
          db.prepare(`
            UPDATE lockers 
            SET suspected_occupied = 0,
                cleared_by = ?,
                cleared_at = CURRENT_TIMESTAMP
            WHERE kiosk_id = ? AND id = ?
          `).run(user.username, kioskId, lockerId);

          // Log the action
          await eventRepository.logEvent({
            kiosk_id: kioskId,
            locker_id: lockerId,
            event_type: 'bulk_clear_suspected',
            staff_user: user.username,
            details: { 
              reason: reason || 'Bulk cleared suspected occupied flag'
            }
          });

          // Broadcast locker state update
          await broadcastLockerUpdate(kioskId, lockerId);

          results.push({ kioskId, lockerId, success: true });

          // Small delay between operations
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          results.push({ kioskId, lockerId, success: false, error: 'Operation failed' });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      fastify.log.info({
        staffUser: user.username,
        totalCount: results.length,
        successCount,
        failureCount,
        reason: reason || 'Bulk cleared suspected occupied flags',
        message: 'Bulk suspected clear completed'
      });

      reply.send({
        success: true,
        message: `${successCount} şüpheli dolap temizlendi, ${failureCount} başarısız`,
        results,
        summary: {
          total: results.length,
          success: successCount,
          failed: failureCount
        }
      });
    } catch (error) {
      fastify.log.error('Failed to bulk clear suspected occupied flags:', error);
      reply.code(500).send({
        code: 'server_error',
        message: 'Failed to bulk clear suspected occupied flags'
      });
    }
  });

  // Get overdue and suspected analytics/reporting (admin read access)
  fastify.get('/analytics', {
    preHandler: [requirePermission(Permission.MANAGE_LOCKERS)]
  }, async (request, reply) => {
    const query = request.query as { 
      kioskId?: string; 
      days?: string;
    };

    try {
      const db = dbManager.getConnection();
      const days = parseInt(query.days || '7');
      
      // Overdue analytics
      let overdueAnalyticsSql = `
        SELECT 
          DATE(overdue_from) as date,
          overdue_reason,
          COUNT(*) as count,
          AVG(CAST((julianday('now') - julianday(overdue_from)) * 24 * 60 AS INTEGER)) as avg_duration_minutes
        FROM lockers 
        WHERE overdue_from IS NOT NULL 
          AND DATE(overdue_from) >= DATE('now', '-${days} days')
      `;
      
      const overdueParams: any[] = [];
      if (query.kioskId) {
        overdueAnalyticsSql += ' AND kiosk_id = ?';
        overdueParams.push(query.kioskId);
      }
      
      overdueAnalyticsSql += ' GROUP BY DATE(overdue_from), overdue_reason ORDER BY date DESC';

      // Suspected analytics
      let suspectedAnalyticsSql = `
        SELECT 
          DATE(ur.reported_at) as date,
          COUNT(DISTINCT ur.locker_id) as unique_lockers,
          COUNT(*) as total_reports
        FROM user_reports ur
        WHERE ur.report_type = 'suspected_occupied'
          AND DATE(ur.reported_at) >= DATE('now', '-${days} days')
      `;
      
      const suspectedParams: any[] = [];
      if (query.kioskId) {
        suspectedAnalyticsSql += ' AND ur.kiosk_id = ?';
        suspectedParams.push(query.kioskId);
      }
      
      suspectedAnalyticsSql += ' GROUP BY DATE(ur.reported_at) ORDER BY date DESC';

      // Current status summary
      let statusSummarySql = `
        SELECT 
          COUNT(CASE WHEN overdue_from IS NOT NULL THEN 1 END) as current_overdue,
          COUNT(CASE WHEN suspected_occupied = 1 THEN 1 END) as current_suspected,
          COUNT(CASE WHEN status = 'Free' THEN 1 END) as free_lockers,
          COUNT(CASE WHEN status = 'Owned' THEN 1 END) as owned_lockers,
          COUNT(*) as total_lockers
        FROM lockers
      `;
      
      const statusParams: any[] = [];
      if (query.kioskId) {
        statusSummarySql += ' WHERE kiosk_id = ?';
        statusParams.push(query.kioskId);
      }

      const overdueAnalytics = db.prepare(overdueAnalyticsSql).all(...overdueParams);
      const suspectedAnalytics = db.prepare(suspectedAnalyticsSql).all(...suspectedParams);
      const statusSummary = db.prepare(statusSummarySql).get(...statusParams);

      // Top problematic lockers
      let problematicLockersSql = `
        SELECT 
          l.kiosk_id,
          l.id as locker_id,
          l.display_name,
          COUNT(CASE WHEN ur.report_type = 'suspected_occupied' THEN 1 END) as suspected_reports,
          COUNT(CASE WHEN l.overdue_from IS NOT NULL THEN 1 END) as overdue_incidents,
          MAX(ur.reported_at) as last_report
        FROM lockers l
        LEFT JOIN user_reports ur ON l.kiosk_id = ur.kiosk_id AND l.id = ur.locker_id
        WHERE (ur.reported_at >= DATE('now', '-${days} days') OR l.overdue_from >= DATE('now', '-${days} days'))
      `;
      
      const problematicParams: any[] = [];
      if (query.kioskId) {
        problematicLockersSql += ' AND l.kiosk_id = ?';
        problematicParams.push(query.kioskId);
      }
      
      problematicLockersSql += `
        GROUP BY l.kiosk_id, l.id, l.display_name
        HAVING (suspected_reports > 0 OR overdue_incidents > 0)
        ORDER BY (suspected_reports + overdue_incidents) DESC
        LIMIT 10
      `;

      const problematicLockers = db.prepare(problematicLockersSql).all(...problematicParams);

      reply.send({
        period_days: days,
        kiosk_id: query.kioskId || 'all',
        overdue_analytics: overdueAnalytics,
        suspected_analytics: suspectedAnalytics,
        status_summary: statusSummary,
        problematic_lockers: problematicLockers,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error('Failed to retrieve analytics:', error);
      reply.code(500).send({
        code: 'server_error',
        message: 'Failed to retrieve analytics'
      });
    }
  });
}