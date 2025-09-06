import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ConfigurationManager } from '../../../../shared/services/configuration-manager';
import { DatabaseConnection } from '../../../../shared/database/connection';
import { requirePermission, requireCsrfToken } from '../middleware/auth-middleware';
import { Permission } from '../services/permission-service';
import { User } from '../services/auth-service';

interface SmartConfigRouteOptions extends FastifyPluginOptions {
  // No additional options needed
}

// Valid configuration keys for strict validation
const VALID_CONFIG_KEYS = new Set([
  'smart_assignment_enabled',
  'allow_reclaim_during_quarantine',
  'base_score',
  'score_factor_a',
  'score_factor_b',
  'score_factor_g',
  'score_factor_d',
  'top_k_candidates',
  'selection_temperature',
  'quarantine_min_floor',
  'quarantine_min_ceiling',
  'exit_quarantine_minutes',
  'return_hold_trigger_sec',
  'return_hold_min',
  'session_limit_minutes',
  'retrieve_window_minutes',
  'reclaim_min',
  'reserve_ratio',
  'reserve_minimum',
  'pulse_ms',
  'open_window_sec',
  'retry_count',
  'retry_backoff_ms',
  'card_rate_limit_seconds',
  'locker_opens_window_sec',
  'locker_opens_max_per_window',
  'command_cooldown_sec',
  'user_report_daily_cap',
  'free_ratio_low',
  'free_ratio_high',
  'reclaim_low_min',
  'reclaim_high_min',
  'owner_hot_window_min',
  'owner_hot_window_max',
  'alert_no_stock_trigger_count',
  'alert_no_stock_trigger_window_min',
  'alert_conflict_rate_trigger',
  'alert_conflict_rate_window_min',
  'alert_open_fail_rate_trigger',
  'alert_retry_rate_trigger',
  'alert_overdue_share_trigger',
  'session_extension_minutes',
  'session_max_total_minutes',
  'session_max_extensions',
  'user_report_window_sec',
  'suspect_ttl_min'
]);

export async function smartConfigRoutes(fastify: FastifyInstance, options: SmartConfigRouteOptions) {
  // Initialize configuration manager
  const db = DatabaseConnection.getInstance();
  const configManager = new ConfigurationManager(db);

  // GET /api/admin/config/effective - Get effective configuration for a kiosk
  fastify.get('/effective', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)],
    schema: {
      querystring: {
        type: 'object',
        required: ['kiosk_id'],
        properties: {
          kiosk_id: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { kiosk_id } = request.query as { kiosk_id: string };
    const requestId = (request as any).id || 'unknown';

    try {
      const effectiveConfig = await configManager.getEffectiveConfig(kiosk_id);
      
      fastify.log.info({
        requestId,
        kioskId: kiosk_id,
        route: '/api/admin/config/effective',
        message: 'Effective configuration retrieved successfully.'
      });

      return reply.send({
        success: true,
        kiosk_id,
        config: effectiveConfig,
        version: effectiveConfig._version,
        loaded_at: effectiveConfig._loadedAt
      });

    } catch (error) {
      fastify.log.error({
        requestId,
        kioskId: kiosk_id,
        route: '/api/admin/config/effective',
        error: error.message,
        message: 'Failed to retrieve effective configuration.'
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve effective configuration'
      });
    }
  });

  // GET /api/admin/config/global - Get global configuration
  fastify.get('/global', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)]
  }, async (request, reply) => {
    const requestId = (request as any).id || 'unknown';

    try {
      const globalConfig = await configManager.getGlobalConfig();
      
      fastify.log.info({
        requestId,
        route: '/api/admin/config/global',
        message: 'Global configuration retrieved successfully.'
      });

      return reply.send({
        success: true,
        config: globalConfig
      });

    } catch (error) {
      fastify.log.error({
        requestId,
        route: '/api/admin/config/global',
        error: error.message,
        message: 'Failed to retrieve global configuration.'
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve global configuration'
      });
    }
  });

  // PUT /api/admin/config/global - Update global configuration
  fastify.put('/global', {
    preHandler: [requirePermission(Permission.SYSTEM_CONFIG), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        properties: {
          updates: { type: 'object' },
          reason: { type: 'string' }
        },
        required: ['updates']
      }
    }
  }, async (request, reply) => {
    const { updates, reason } = request.body as { updates: any; reason?: string };
    const user = (request as any).user as User;
    const requestId = (request as any).id || 'unknown';

    try {
      // Validate that updates is an object
      if (!updates || typeof updates !== 'object') {
        return reply.code(400).send({
          success: false,
          error: 'Updates must be a valid object'
        });
      }

      // Strict key validation - reject unknown keys
      const unknownKeys = Object.keys(updates).filter(key => !VALID_CONFIG_KEYS.has(key));
      if (unknownKeys.length > 0) {
        return reply.code(400).send({
          success: false,
          error: `Unknown configuration keys: ${unknownKeys.join(', ')}`
        });
      }

      // Get current config to check for actual changes
      const currentConfig = await configManager.getGlobalConfig();
      const actualUpdates: any = {};
      
      for (const [key, value] of Object.entries(updates)) {
        if (currentConfig[key as keyof typeof currentConfig] !== value) {
          actualUpdates[key] = value;
        }
      }

      // Only update and bump version if there are actual changes
      if (Object.keys(actualUpdates).length === 0) {
        fastify.log.info({
          requestId,
          route: '/api/admin/config/global',
          updatedBy: user.username,
          message: 'No-op update, no changes detected.'
        });

        return reply.send({
          success: true,
          message: 'No changes detected',
          updated_keys: []
        });
      }

      // Update global configuration with only changed values
      await configManager.updateGlobalConfig(actualUpdates, user.username);

      // Log the configuration update
      const updatedKeys = Object.keys(actualUpdates);
      for (const key of updatedKeys) {
        fastify.log.info({
          requestId,
          route: '/api/admin/config/global',
          updatedBy: user.username,
          key,
          reason: reason || 'No reason provided',
          message: `Config updated: key=${key}, by=${user.username}.`
        });
      }

      return reply.send({
        success: true,
        message: 'Global configuration updated successfully',
        updated_keys: updatedKeys
      });

    } catch (error) {
      fastify.log.error({
        requestId,
        route: '/api/admin/config/global',
        updatedBy: user.username,
        error: error.message,
        message: 'Failed to update global configuration.'
      });

      return reply.code(400).send({
        success: false,
        error: error.message || 'Failed to update global configuration'
      });
    }
  });

  // PUT /api/admin/config/override/{kioskId} - Set kiosk-specific override
  fastify.put('/override/:kioskId', {
    preHandler: [requirePermission(Permission.SYSTEM_CONFIG), requireCsrfToken()],
    schema: {
      params: {
        type: 'object',
        required: ['kioskId'],
        properties: {
          kioskId: { type: 'string', minLength: 1 }
        }
      },
      body: {
        type: 'object',
        properties: {
          key: { type: 'string', minLength: 1 },
          value: {}, // Allow any type
          reason: { type: 'string' }
        },
        required: ['key', 'value']
      }
    }
  }, async (request, reply) => {
    const { kioskId } = request.params as { kioskId: string };
    const { key, value, reason } = request.body as { key: string; value: any; reason?: string };
    const user = (request as any).user as User;
    const requestId = (request as any).id || 'unknown';

    try {
      // Strict key validation - reject unknown keys
      if (!VALID_CONFIG_KEYS.has(key)) {
        return reply.code(400).send({
          success: false,
          error: `Unknown configuration key: ${key}`
        });
      }

      // Get current override to check for actual changes
      const currentOverrides = await configManager.getKioskOverrides(kioskId);
      const currentValue = currentOverrides[key];

      // Only update and bump version if there are actual changes
      if (currentValue === value) {
        fastify.log.info({
          requestId,
          kioskId,
          route: '/api/admin/config/override/:kioskId',
          updatedBy: user.username,
          key,
          message: 'No-op update, no changes detected.'
        });

        return reply.send({
          success: true,
          message: 'No changes detected',
          kiosk_id: kioskId,
          key,
          value
        });
      }

      // Set kiosk override
      await configManager.setKioskOverride(kioskId, key, value, user.username);

      // Log the configuration update
      fastify.log.info({
        requestId,
        kioskId,
        route: '/api/admin/config/override/:kioskId',
        updatedBy: user.username,
        key,
        reason: reason || 'No reason provided',
        message: `Config updated: key=${key}, by=${user.username}.`
      });

      return reply.send({
        success: true,
        message: `Kiosk override set successfully for ${kioskId}`,
        kiosk_id: kioskId,
        key,
        value
      });

    } catch (error) {
      fastify.log.error({
        requestId,
        kioskId,
        route: '/api/admin/config/override/:kioskId',
        updatedBy: user.username,
        key,
        error: error.message,
        message: 'Failed to set kiosk override.'
      });

      return reply.code(400).send({
        success: false,
        error: error.message || 'Failed to set kiosk override'
      });
    }
  });

  // DELETE /api/admin/config/override/{kioskId} - Remove kiosk-specific overrides
  fastify.delete('/override/:kioskId', {
    preHandler: [requirePermission(Permission.SYSTEM_CONFIG), requireCsrfToken()],
    schema: {
      params: {
        type: 'object',
        required: ['kioskId'],
        properties: {
          kioskId: { type: 'string', minLength: 1 }
        }
      },
      body: {
        type: 'object',
        properties: {
          keys: { 
            type: 'array',
            items: { type: 'string', minLength: 1 }
          },
          reason: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { kioskId } = request.params as { kioskId: string };
    const { keys, reason } = (request.body as { keys?: string[]; reason?: string }) || {};
    const user = (request as any).user as User;
    const requestId = (request as any).id || 'unknown';

    try {
      let keysToRemove: string[] = [];
      
      if (keys && keys.length > 0) {
        // Validate all keys are known
        const unknownKeys = keys.filter(key => !VALID_CONFIG_KEYS.has(key));
        if (unknownKeys.length > 0) {
          return reply.code(400).send({
            success: false,
            error: `Unknown configuration keys: ${unknownKeys.join(', ')}`
          });
        }
        keysToRemove = keys;
      } else {
        // Remove all overrides for this kiosk
        const currentOverrides = await configManager.getKioskOverrides(kioskId);
        keysToRemove = Object.keys(currentOverrides);
      }

      if (keysToRemove.length === 0) {
        return reply.send({
          success: true,
          message: 'No overrides to remove',
          kiosk_id: kioskId,
          removed_count: 0,
          version: await configManager.getConfigVersion()
        });
      }

      // Remove overrides one by one
      let removedCount = 0;
      for (const key of keysToRemove) {
        try {
          await configManager.removeKioskOverride(kioskId, key, user.username);
          removedCount++;
          
          // Log each removal
          fastify.log.info({
            requestId,
            kioskId,
            route: '/api/admin/config/override/:kioskId',
            updatedBy: user.username,
            key,
            reason: reason || 'No reason provided',
            message: `Config updated: key=${key}, by=${user.username}.`
          });
        } catch (error) {
          // Continue with other keys if one fails
          fastify.log.warn({
            requestId,
            kioskId,
            key,
            error: error.message,
            message: 'Failed to remove individual override.'
          });
        }
      }

      const currentVersion = await configManager.getConfigVersion();

      return reply.send({
        success: true,
        message: `Removed ${removedCount} overrides for ${kioskId}`,
        kiosk_id: kioskId,
        removed_count: removedCount,
        version: currentVersion
      });

    } catch (error) {
      fastify.log.error({
        requestId,
        kioskId,
        route: '/api/admin/config/override/:kioskId',
        updatedBy: user.username,
        error: error.message,
        message: 'Failed to remove kiosk overrides.'
      });

      return reply.code(400).send({
        success: false,
        error: error.message || 'Failed to remove kiosk overrides'
      });
    }
  });

  // GET /api/admin/config/history - Get configuration audit history with pagination
  fastify.get('/history', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string', pattern: '^[0-9]+$' },
          limit: { type: 'string', pattern: '^[0-9]+$' },
          kiosk_id: { type: 'string' },
          key: { type: 'string' },
          updated_after: { type: 'string' },
          updated_before: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { 
      page, 
      limit, 
      kiosk_id, 
      key, 
      updated_after, 
      updated_before 
    } = request.query as { 
      page?: string; 
      limit?: string; 
      kiosk_id?: string; 
      key?: string;
      updated_after?: string;
      updated_before?: string;
    };
    const requestId = (request as any).id || 'unknown';

    try {
      const db = DatabaseConnection.getInstance();
      
      // Parse pagination parameters
      const pageNum = page ? Math.max(1, parseInt(page)) : 1;
      const pageSizeNum = limit ? Math.min(200, Math.max(1, parseInt(limit))) : 50;
      const offset = (pageNum - 1) * pageSizeNum;

      // Build query with optional filters
      let whereClause = 'WHERE 1=1';
      let countWhereClause = 'WHERE 1=1';
      const params: any[] = [];
      const countParams: any[] = [];

      if (kiosk_id) {
        whereClause += ' AND kiosk_id = ?';
        countWhereClause += ' AND kiosk_id = ?';
        params.push(kiosk_id);
        countParams.push(kiosk_id);
      }

      if (key) {
        whereClause += ' AND key = ?';
        countWhereClause += ' AND key = ?';
        params.push(key);
        countParams.push(key);
      }

      if (updated_after) {
        whereClause += ' AND changed_at >= ?';
        countWhereClause += ' AND changed_at >= ?';
        params.push(updated_after);
        countParams.push(updated_after);
      }

      if (updated_before) {
        whereClause += ' AND changed_at <= ?';
        countWhereClause += ' AND changed_at <= ?';
        params.push(updated_before);
        countParams.push(updated_before);
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM config_history ${countWhereClause}`;
      const countResult = await db.get(countQuery, countParams) as { total: number };
      const totalRecords = countResult.total;

      // Get paginated results
      const dataQuery = `
        SELECT 
          id,
          kiosk_id,
          key,
          old_value,
          new_value,
          data_type,
          changed_by,
          changed_at
        FROM config_history
        ${whereClause}
        ORDER BY changed_at DESC
        LIMIT ? OFFSET ?
      `;
      params.push(pageSizeNum, offset);

      const history = await db.all(dataQuery, params);

      const totalPages = Math.ceil(totalRecords / pageSizeNum);

      // Get current configuration version
      const version = await configManager.getConfigVersion();

      fastify.log.info({
        requestId,
        route: '/api/admin/config/history',
        historyCount: history.length,
        totalRecords,
        page: pageNum,
        pageSize: pageSizeNum,
        filters: { kiosk_id, key, updated_after, updated_before },
        message: 'Configuration history retrieved successfully.'
      });

      return reply.send({
        success: true,
        history,
        pagination: {
          page: pageNum,
          limit: pageSizeNum,
          total_records: totalRecords,
          total_pages: totalPages,
          has_next: pageNum < totalPages,
          has_previous: pageNum > 1
        },
        version,
        filters: { kiosk_id, key, updated_after, updated_before }
      });

    } catch (error) {
      fastify.log.error({
        requestId,
        route: '/api/admin/config/history',
        error: error.message,
        message: 'Failed to retrieve configuration history.'
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve configuration history'
      });
    }
  });

  // GET /api/admin/config/version - Get current configuration version
  fastify.get('/version', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)]
  }, async (request, reply) => {
    const requestId = (request as any).id || 'unknown';

    try {
      const version = await configManager.getConfigVersion();
      
      fastify.log.info({
        requestId,
        route: '/api/admin/config/version',
        version,
        message: 'Configuration version retrieved successfully.'
      });

      return reply.send({
        success: true,
        version
      });

    } catch (error) {
      fastify.log.error({
        requestId,
        route: '/api/admin/config/version',
        error: error.message,
        message: 'Failed to retrieve configuration version.'
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve configuration version'
      });
    }
  });

  // POST /api/admin/config/reload - Trigger configuration reload (no version bump)
  fastify.post('/reload', {
    preHandler: [requirePermission(Permission.SYSTEM_CONFIG), requireCsrfToken()]
  }, async (request, reply) => {
    const user = (request as any).user as User;
    const requestId = (request as any).id || 'unknown';

    try {
      // Clear cache without bumping version - just re-read existing config
      const configManager = new ConfigurationManager();
      configManager.invalidateCache();

      fastify.log.info({
        requestId,
        route: '/api/admin/config/reload',
        triggeredBy: user.username,
        message: 'Configuration reload triggered successfully.'
      });

      return reply.send({
        success: true,
        message: 'Configuration reload triggered successfully'
      });

    } catch (error) {
      fastify.log.error({
        requestId,
        route: '/api/admin/config/reload',
        triggeredBy: user.username,
        error: error.message,
        message: 'Failed to trigger configuration reload.'
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to trigger configuration reload'
      });
    }
  });
}