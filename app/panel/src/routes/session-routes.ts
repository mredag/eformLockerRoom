/**
 * Session Management Routes for Smart Locker Assignment
 * Implements task 25: Build live session monitoring
 * 
 * API: /api/admin/sessions/*
 * Actions: POST /{id}/extend, POST /{id}/end
 * Features:
 * - Live sessions dashboard with real-time updates (≤1 Hz WebSocket)
 * - Session extension interface (60-minute increments, max 240min)
 * - PII protection with card_hash_suffix
 * - Turkish-only UI labels
 * - Admin-only write access with CSRF protection
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { requirePermission, requireCsrfToken } from '../middleware/auth-middleware';
import { Permission } from '../services/permission-service';
import { User } from '../services/auth-service';
import { webSocketService } from '../../../../shared/services/websocket-service';

interface SessionRouteOptions extends FastifyPluginOptions {
  dbManager: DatabaseManager;
}

// WebSocket throttling - max 1 Hz
let lastWebSocketBroadcast = 0;
const WEBSOCKET_THROTTLE_MS = 1000;

function throttledWebSocketBroadcast(data: any) {
  const now = Date.now();
  if (now - lastWebSocketBroadcast >= WEBSOCKET_THROTTLE_MS) {
    webSocketService.broadcastStateUpdate(data);
    lastWebSocketBroadcast = now;
  }
}

// Standard error response schema
function createErrorResponse(code: string, message: string) {
  return { code, message };
}

// Generate card hash suffix (last 4 chars of hash for PII protection)
function generateCardHashSuffix(cardId: string): string {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(cardId).digest('hex');
  return hash.slice(-4);
}

export async function sessionRoutes(fastify: FastifyInstance, options: SessionRouteOptions) {
  const { dbManager } = options;

  // Get sessions with pagination and filtering
  fastify.get('/', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['Active', 'Expired'] },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { status, page = 1, limit = 50 } = request.query as {
        status?: 'Active' | 'Expired';
        page?: number;
        limit?: number;
      };

      const offset = (page - 1) * limit;
      
      // Build WHERE clause
      let whereClause = '';
      const params: any[] = [];
      
      if (status) {
        whereClause = 'WHERE s.status = ?';
        params.push(status.toLowerCase());
      }

      // Get sessions with PII protection
      const sessions = await dbManager.all(`
        SELECT 
          s.id,
          s.card_hash_suffix,
          s.kiosk_id,
          s.locker_id,
          s.status,
          s.created_at,
          s.expires_at,
          s.extension_count,
          s.version,
          l.display_name as locker_display_name,
          l.status as locker_status
        FROM sessions s
        LEFT JOIN lockers l ON s.kiosk_id = l.kiosk_id AND s.locker_id = l.id
        ${whereClause}
        ORDER BY s.created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]);

      // Get total count
      const totalResult = await dbManager.get(`
        SELECT COUNT(*) as total
        FROM sessions s
        ${whereClause}
      `, params);

      const total = totalResult?.total || 0;

      // Calculate remaining minutes for active sessions
      const now = new Date();
      const formattedSessions = sessions.map(row => {
        const expiresAt = new Date(row.expires_at);
        const remainingMinutes = row.status === 'active' 
          ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (60 * 1000)))
          : 0;
        
        const canExtend = row.status === 'active' && 
          remainingMinutes > 0 && 
          (row.extension_count || 0) < 4; // Max 4 extensions (240 min total)

        return {
          id: row.id,
          cardHashSuffix: row.card_hash_suffix,
          kioskId: row.kiosk_id,
          lockerId: row.locker_id,
          lockerDisplayName: row.locker_display_name || (row.locker_id ? `Dolap ${row.locker_id}` : null),
          lockerStatus: row.locker_status,
          status: row.status,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          remainingMinutes,
          extensionCount: row.extension_count || 0,
          maxExtensions: 4,
          canExtend,
          version: row.version
        };
      });

      reply.send({
        sessions: formattedSessions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + limit < total,
          hasPrev: page > 1
        }
      });
    } catch (error) {
      fastify.log.error('Failed to get sessions:', error);
      reply.code(500).send(createErrorResponse('server_error', 'Oturum listesi alınamadı'));
    }
  });

  // Get session details by ID
  fastify.get('/:sessionId', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)]
  }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    try {
      const session = await dbManager.get(`
        SELECT 
          s.*,
          l.display_name as locker_display_name,
          l.status as locker_status
        FROM sessions s
        LEFT JOIN lockers l ON s.kiosk_id = l.kiosk_id AND s.locker_id = l.id
        WHERE s.id = ?
      `, [sessionId]);

      if (!session) {
        return reply.code(404).send(createErrorResponse('not_found', 'Oturum bulunamadı'));
      }

      // Get extension history
      const extensionHistory = await dbManager.all(`
        SELECT admin_user, extension_minutes, total_minutes, reason, timestamp
        FROM session_extension_audit
        WHERE session_id = ?
        ORDER BY timestamp DESC
      `, [sessionId]);

      const now = new Date();
      const expiresAt = new Date(session.expires_at);
      const remainingMinutes = session.status === 'active' 
        ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (60 * 1000)))
        : 0;
      
      const canExtend = session.status === 'active' && 
        remainingMinutes > 0 && 
        (session.extension_count || 0) < 4;

      reply.send({
        session: {
          id: session.id,
          cardHashSuffix: session.card_hash_suffix,
          kioskId: session.kiosk_id,
          lockerId: session.locker_id,
          lockerDisplayName: session.locker_display_name || (session.locker_id ? `Dolap ${session.locker_id}` : null),
          lockerStatus: session.locker_status,
          status: session.status,
          createdAt: session.created_at,
          expiresAt: session.expires_at,
          remainingMinutes,
          extensionCount: session.extension_count || 0,
          maxExtensions: 4,
          canExtend,
          version: session.version,
          extensionHistory
        }
      });
    } catch (error) {
      fastify.log.error('Failed to get session details:', error);
      reply.code(500).send(createErrorResponse('server_error', 'Oturum detayları alınamadı'));
    }
  });

  // Extend session by 60 minutes (admin-only)
  fastify.post('/:sessionId/extend', {
    preHandler: [requirePermission(Permission.OPEN_LOCKER), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 1, maxLength: 255 }
        }
      }
    }
  }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { reason } = request.body as { reason: string };
    const user = (request as any).user as User;

    try {
      // Start transaction for atomic operation
      await dbManager.run('BEGIN TRANSACTION');

      try {
        // Get current session with lock
        const session = await dbManager.get(`
          SELECT * FROM sessions WHERE id = ? AND status = 'active'
        `, [sessionId]);

        if (!session) {
          await dbManager.run('ROLLBACK');
          return reply.code(404).send(createErrorResponse('not_found', 'Aktif oturum bulunamadı'));
        }

        // Enforce bounds: max 4 extensions (240 minutes total)
        const currentExtensions = session.extension_count || 0;
        if (currentExtensions >= 4) {
          await dbManager.run('ROLLBACK');
          return reply.code(400).send(createErrorResponse('limit_exceeded', 'Maksimum uzatma sınırına ulaşıldı (240 dakika)'));
        }

        // Calculate new expiration time (+60 minutes)
        const currentExpires = new Date(session.expires_at);
        const newExpires = new Date(currentExpires.getTime() + (60 * 60 * 1000));
        const newExtensionCount = currentExtensions + 1;
        const newVersion = session.version + 1;

        // Update session
        const updateResult = await dbManager.run(`
          UPDATE sessions 
          SET expires_at = ?, extension_count = ?, version = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND version = ?
        `, [newExpires.toISOString(), newExtensionCount, newVersion, sessionId, session.version]);

        if (updateResult.changes === 0) {
          await dbManager.run('ROLLBACK');
          return reply.code(409).send(createErrorResponse('version_conflict', 'Oturum başka bir işlemle değiştirildi'));
        }

        // Write audit record in same transaction
        await dbManager.run(`
          INSERT INTO session_extension_audit (
            session_id, admin_user, extension_minutes, total_minutes, 
            reason, timestamp, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          sessionId,
          user.username,
          60, // Always 60 minutes
          180 + (newExtensionCount * 60), // Base 180 + extensions
          reason,
          new Date().toISOString(),
          new Date().toISOString()
        ]);

        await dbManager.run('COMMIT');

        // Calculate remaining minutes
        const now = new Date();
        const remainingMinutes = Math.max(0, Math.ceil((newExpires.getTime() - now.getTime()) / (60 * 1000)));

        // Throttled WebSocket broadcast
        throttledWebSocketBroadcast({
          type: 'session_extended',
          sessionId,
          remainingMinutes,
          extensionCount: newExtensionCount,
          adminUser: user.username,
          timestamp: new Date()
        });

        reply.send({
          success: true,
          message: 'Oturum 60 dakika uzatıldı',
          remainingMinutes,
          extensionCount: newExtensionCount,
          version: newVersion,
          affectedRows: updateResult.changes
        });

      } catch (txError) {
        await dbManager.run('ROLLBACK');
        throw txError;
      }
    } catch (error) {
      fastify.log.error('Failed to extend session:', error);
      reply.code(500).send(createErrorResponse('server_error', 'Oturum uzatma işlemi başarısız'));
    }
  });

  // End session (admin-only) - replaces cancel/complete semantics
  fastify.post('/:sessionId/end', {
    preHandler: [requirePermission(Permission.OPEN_LOCKER), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string', maxLength: 255 }
        }
      }
    }
  }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { reason } = request.body as { reason?: string };
    const user = (request as any).user as User;

    try {
      // Start transaction for atomic operation
      await dbManager.run('BEGIN TRANSACTION');

      try {
        // Get current session with lock
        const session = await dbManager.get(`
          SELECT * FROM sessions WHERE id = ? AND status = 'active'
        `, [sessionId]);

        if (!session) {
          await dbManager.run('ROLLBACK');
          return reply.code(404).send(createErrorResponse('not_found', 'Aktif oturum bulunamadı'));
        }

        const newVersion = session.version + 1;

        // End session (set status to 'ended')
        const updateResult = await dbManager.run(`
          UPDATE sessions 
          SET status = 'ended', version = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND version = ?
        `, [newVersion, sessionId, session.version]);

        if (updateResult.changes === 0) {
          await dbManager.run('ROLLBACK');
          return reply.code(409).send(createErrorResponse('version_conflict', 'Oturum başka bir işlemle değiştirildi'));
        }

        // Write audit record in same transaction
        await dbManager.run(`
          INSERT INTO session_extension_audit (
            session_id, admin_user, extension_minutes, total_minutes, 
            reason, timestamp, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          sessionId,
          user.username,
          0, // No extension, this is an end action
          0, // Total doesn't matter for end action
          `Oturum sonlandırıldı: ${reason || 'Yönetici tarafından sonlandırıldı'}`,
          new Date().toISOString(),
          new Date().toISOString()
        ]);

        await dbManager.run('COMMIT');

        // Throttled WebSocket broadcast
        throttledWebSocketBroadcast({
          type: 'session_ended',
          sessionId,
          adminUser: user.username,
          reason: reason || 'Yönetici tarafından sonlandırıldı',
          timestamp: new Date()
        });

        reply.send({
          success: true,
          message: 'Oturum sonlandırıldı',
          version: newVersion,
          affectedRows: updateResult.changes
        });

      } catch (txError) {
        await dbManager.run('ROLLBACK');
        throw txError;
      }
    } catch (error) {
      fastify.log.error('Failed to end session:', error);
      reply.code(500).send(createErrorResponse('server_error', 'Oturum sonlandırma işlemi başarısız'));
    }
  });

}