import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RolloutManager, RolloutThresholds } from '../../../../shared/services/rollout-manager';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { ConfigurationManager } from '../../../../shared/services/configuration-manager';
import { AlertManager } from '../../../../shared/services/alert-manager';

interface EnableKioskRequest {
  Body: {
    kioskId: string;
    enabledBy: string;
    reason?: string;
  };
}

interface DisableKioskRequest {
  Body: {
    kioskId: string;
    disabledBy: string;
    reason: string;
  };
}

interface EmergencyDisableRequest {
  Body: {
    disabledBy: string;
    reason: string;
    confirmationCode: string; // Must be "EMERGENCY_DISABLE"
  };
}

interface UpdateThresholdsRequest {
  Body: {
    kioskId?: string; // null for global
    thresholds: Partial<RolloutThresholds>;
    updatedBy: string;
  };
}

interface AnalyzeDecisionRequest {
  Params: {
    kioskId: string;
  };
  Querystring: {
    customThresholds?: string; // JSON string
  };
}

export async function rolloutRoutes(fastify: FastifyInstance) {
  const db = new DatabaseManager();
  const configManager = new ConfigurationManager(db);
  const alertManager = new AlertManager(db);
  const rolloutManager = new RolloutManager(db, configManager, alertManager);

  // Standard error response schema
  const errorResponse = {
    type: 'object',
    properties: {
      success: { type: 'boolean', const: false },
      error: { type: 'string' }
    }
  };

  // Success response schema
  const successResponse = {
    type: 'object',
    properties: {
      success: { type: 'boolean', const: true },
      message: { type: 'string' },
      data: { type: 'object' }
    }
  };

  // Get rollout status for all kiosks
  fastify.get('/api/admin/rollout/status', {
    preHandler: fastify.auth([fastify.verifyAdmin]),
    schema: {
      response: {
        200: successResponse,
        500: errorResponse
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const statuses = await rolloutManager.getAllKioskStatus();
      const summary = await rolloutManager.getRolloutSummary();
      
      return {
        success: true,
        data: {
          kiosks: statuses,
          summary
        }
      };
    } catch (error) {
      console.error('Error getting rollout status:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get rollout status'
      });
    }
  });

  // Get rollout status for specific kiosk
  fastify.get('/api/admin/rollout/status/:kioskId', async (request: FastifyRequest<{ Params: { kioskId: string } }>, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params;
      const status = await rolloutManager.getKioskStatus(kioskId);
      
      if (!status) {
        return reply.status(404).send({
          success: false,
          error: 'Kiosk not found'
        });
      }
      
      return {
        success: true,
        data: status
      };
    } catch (error) {
      console.error('Error getting kiosk rollout status:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get kiosk rollout status'
      });
    }
  });

  // Enable smart assignment for a kiosk
  fastify.post('/api/admin/rollout/enable', {
    preHandler: [fastify.auth([fastify.verifyAdmin]), fastify.csrfProtection],
    schema: {
      body: {
        type: 'object',
        required: ['kioskId', 'enabledBy'],
        properties: {
          kioskId: { type: 'string', minLength: 1 },
          enabledBy: { type: 'string', minLength: 1 },
          reason: { type: 'string' }
        }
      },
      response: {
        200: successResponse,
        400: errorResponse,
        500: errorResponse
      }
    }
  }, async (request: FastifyRequest<EnableKioskRequest>, reply: FastifyReply) => {
    try {
      const { kioskId, enabledBy, reason } = request.body;
      
      if (!kioskId || !enabledBy) {
        return reply.status(400).send({
          success: false,
          error: 'kioskId and enabledBy are required'
        });
      }
      
      await rolloutManager.enableKiosk(kioskId, enabledBy, reason);
      
      return {
        success: true,
        message: `Smart assignment enabled for kiosk ${kioskId}`
      };
    } catch (error) {
      console.error('Error enabling kiosk:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to enable kiosk'
      });
    }
  });

  // Disable smart assignment for a kiosk (rollback)
  fastify.post('/api/admin/rollout/disable', {
    preHandler: [fastify.auth([fastify.verifyAdmin]), fastify.csrfProtection],
    schema: {
      body: {
        type: 'object',
        required: ['kioskId', 'disabledBy', 'reason'],
        properties: {
          kioskId: { type: 'string', minLength: 1 },
          disabledBy: { type: 'string', minLength: 1 },
          reason: { type: 'string', minLength: 1 }
        }
      },
      response: {
        200: successResponse,
        400: errorResponse,
        500: errorResponse
      }
    }
  }, async (request: FastifyRequest<DisableKioskRequest>, reply: FastifyReply) => {
    try {
      const { kioskId, disabledBy, reason } = request.body;
      
      if (!kioskId || !disabledBy || !reason) {
        return reply.status(400).send({
          success: false,
          error: 'kioskId, disabledBy, and reason are required'
        });
      }
      
      await rolloutManager.disableKiosk(kioskId, disabledBy, reason);
      
      return {
        success: true,
        message: `Smart assignment disabled for kiosk ${kioskId}`
      };
    } catch (error) {
      console.error('Error disabling kiosk:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to disable kiosk'
      });
    }
  });

  // Emergency disable all kiosks
  fastify.post('/api/admin/rollout/emergency-disable', {
    preHandler: [fastify.auth([fastify.verifyAdmin]), fastify.csrfProtection],
    schema: {
      body: {
        type: 'object',
        required: ['disabledBy', 'reason', 'confirmationCode'],
        properties: {
          disabledBy: { type: 'string', minLength: 1 },
          reason: { type: 'string', minLength: 1 },
          confirmationCode: { type: 'string', const: 'EMERGENCY_DISABLE' }
        }
      },
      response: {
        200: successResponse,
        400: errorResponse,
        500: errorResponse
      }
    }
  }, async (request: FastifyRequest<EmergencyDisableRequest>, reply: FastifyReply) => {
    try {
      const { disabledBy, reason, confirmationCode } = request.body;
      
      if (!disabledBy || !reason || !confirmationCode) {
        return reply.status(400).send({
          success: false,
          error: 'disabledBy, reason, and confirmationCode are required'
        });
      }
      
      if (confirmationCode !== 'EMERGENCY_DISABLE') {
        return reply.status(400).send({
          success: false,
          error: 'Invalid confirmation code'
        });
      }
      
      await rolloutManager.emergencyDisableAll(disabledBy, reason);
      
      return {
        success: true,
        message: 'Emergency disable completed for all kiosks'
      };
    } catch (error) {
      console.error('Error in emergency disable:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to execute emergency disable'
      });
    }
  });

  // Analyze rollout decision for a kiosk
  fastify.get('/api/admin/rollout/analyze/:kioskId', async (request: FastifyRequest<AnalyzeDecisionRequest>, reply: FastifyReply) => {
    try {
      const { kioskId } = request.params;
      const { customThresholds } = request.query;
      
      let thresholds = undefined;
      if (customThresholds) {
        try {
          thresholds = JSON.parse(customThresholds);
        } catch (error) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid customThresholds JSON'
          });
        }
      }
      
      const decision = await rolloutManager.analyzeRolloutDecision(kioskId, thresholds);
      
      return {
        success: true,
        data: decision
      };
    } catch (error) {
      console.error('Error analyzing rollout decision:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to analyze rollout decision'
      });
    }
  });

  // Get rollout thresholds
  fastify.get('/api/admin/rollout/thresholds', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const results = await db.query(`
        SELECT * FROM rollout_thresholds ORDER BY kiosk_id NULLS FIRST
      `);
      
      return {
        success: true,
        data: results
      };
    } catch (error) {
      console.error('Error getting rollout thresholds:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get rollout thresholds'
      });
    }
  });

  // Update rollout thresholds
  fastify.put('/api/admin/rollout/thresholds', async (request: FastifyRequest<UpdateThresholdsRequest>, reply: FastifyReply) => {
    try {
      const { kioskId, thresholds, updatedBy } = request.body;
      
      if (!thresholds || !updatedBy) {
        return reply.status(400).send({
          success: false,
          error: 'thresholds and updatedBy are required'
        });
      }
      
      // Build update query dynamically based on provided thresholds
      const updates: string[] = [];
      const values: any[] = [];
      
      if (thresholds.minSuccessRate !== undefined) {
        updates.push('min_success_rate = ?');
        values.push(thresholds.minSuccessRate);
      }
      if (thresholds.maxNoStockRate !== undefined) {
        updates.push('max_no_stock_rate = ?');
        values.push(thresholds.maxNoStockRate);
      }
      if (thresholds.maxRetryRate !== undefined) {
        updates.push('max_retry_rate = ?');
        values.push(thresholds.maxRetryRate);
      }
      if (thresholds.maxConflictRate !== undefined) {
        updates.push('max_conflict_rate = ?');
        values.push(thresholds.maxConflictRate);
      }
      if (thresholds.maxAssignmentTimeMs !== undefined) {
        updates.push('max_assignment_time_ms = ?');
        values.push(thresholds.maxAssignmentTimeMs);
      }
      if (thresholds.minSampleSize !== undefined) {
        updates.push('min_sample_size = ?');
        values.push(thresholds.minSampleSize);
      }
      
      if (updates.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'No threshold values provided'
        });
      }
      
      updates.push('updated_by = ?', 'updated_at = CURRENT_TIMESTAMP');
      values.push(updatedBy, kioskId || null);
      
      await db.query(`
        INSERT OR REPLACE INTO rollout_thresholds (
          kiosk_id, ${updates.join(', ')}
        ) VALUES (?, ${updates.map(() => '?').join(', ')})
      `, values);
      
      return {
        success: true,
        message: `Rollout thresholds updated for ${kioskId || 'global'}`
      };
    } catch (error) {
      console.error('Error updating rollout thresholds:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update rollout thresholds'
      });
    }
  });

  // Run automated rollback check
  fastify.post('/api/admin/rollout/check-automated-rollback', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await rolloutManager.checkAutomatedRollback();
      
      return {
        success: true,
        message: 'Automated rollback check completed'
      };
    } catch (error) {
      console.error('Error in automated rollback check:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to run automated rollback check'
      });
    }
  });

  // Get rollout events history
  fastify.get('/api/admin/rollout/events', async (request: FastifyRequest<{ Querystring: { kioskId?: string; limit?: string } }>, reply: FastifyReply) => {
    try {
      const { kioskId, limit = '100' } = request.query;
      
      let query = `
        SELECT * FROM rollout_events 
        WHERE 1=1
      `;
      const params: any[] = [];
      
      if (kioskId) {
        query += ' AND (kiosk_id = ? OR kiosk_id IS NULL)';
        params.push(kioskId);
      }
      
      query += ' ORDER BY event_time DESC LIMIT ?';
      params.push(parseInt(limit));
      
      const events = await db.query(query, params);
      
      return {
        success: true,
        data: events
      };
    } catch (error) {
      console.error('Error getting rollout events:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get rollout events'
      });
    }
  });

  // Get rollout decision history
  fastify.get('/api/admin/rollout/decisions', async (request: FastifyRequest<{ Querystring: { kioskId?: string; limit?: string } }>, reply: FastifyReply) => {
    try {
      const { kioskId, limit = '50' } = request.query;
      
      let query = `
        SELECT * FROM rollout_decisions 
        WHERE 1=1
      `;
      const params: any[] = [];
      
      if (kioskId) {
        query += ' AND kiosk_id = ?';
        params.push(kioskId);
      }
      
      query += ' ORDER BY decision_time DESC LIMIT ?';
      params.push(parseInt(limit));
      
      const decisions = await db.query(query, params);
      
      // Parse JSON fields
      const parsedDecisions = decisions.map(decision => ({
        ...decision,
        reasons: JSON.parse(decision.reasons),
        metrics: JSON.parse(decision.metrics),
        thresholds: JSON.parse(decision.thresholds)
      }));
      
      return {
        success: true,
        data: parsedDecisions
      };
    } catch (error) {
      console.error('Error getting rollout decisions:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get rollout decisions'
      });
    }
  });
}