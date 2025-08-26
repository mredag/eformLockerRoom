/**
 * Relay Control Routes for Admin Panel
 * Provides direct hardware relay control endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getRelayService } from '../../../shared/services/relay-service.js';

interface RelayActivationRequest {
  Body: {
    relay_number: number;
    staff_user?: string;
    reason?: string;
  };
}

interface BulkRelayActivationRequest {
  Body: {
    relay_numbers: number[];
    interval_ms?: number;
    staff_user?: string;
    reason?: string;
  };
}

interface RelayTestRequest {
  Body: {
    test_type: 'single' | 'sequence' | 'connection';
    relay_numbers?: number[];
  };
}

export async function registerRelayRoutes(fastify: FastifyInstance) {
  const relayService = getRelayService();

  // Test relay connection
  fastify.post('/api/relay/test', async (request: FastifyRequest<RelayTestRequest>, reply: FastifyReply) => {
    try {
      const { test_type, relay_numbers } = request.body;
      
      console.log(`🧪 Relay test requested: ${test_type}`);
      
      switch (test_type) {
        case 'connection':
          const connectionOk = await relayService.testConnection();
          return reply.send({
            success: connectionOk,
            message: connectionOk ? 'Relay connection successful' : 'Relay connection failed',
            test_type: 'connection'
          });
          
        case 'single':
          const testRelay = relay_numbers?.[0] || 1;
          const singleResult = await relayService.activateRelay(testRelay);
          return reply.send({
            success: singleResult,
            message: singleResult ? `Relay ${testRelay} activated` : `Relay ${testRelay} failed`,
            test_type: 'single',
            relay_number: testRelay
          });
          
        case 'sequence':
          const testRelays = relay_numbers || [1, 2, 3];
          const sequenceResult = await relayService.activateMultipleRelays(testRelays, 1000);
          return reply.send({
            success: sequenceResult.failed.length === 0,
            message: `Sequence test: ${sequenceResult.success.length} success, ${sequenceResult.failed.length} failed`,
            test_type: 'sequence',
            results: sequenceResult
          });
          
        default:
          return reply.status(400).send({
            success: false,
            error: 'Invalid test type. Use: connection, single, or sequence'
          });
      }
      
    } catch (error) {
      console.error('❌ Relay test error:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Activate single relay
  fastify.post('/api/relay/activate', async (request: FastifyRequest<RelayActivationRequest>, reply: FastifyReply) => {
    try {
      const { relay_number, staff_user, reason } = request.body;
      
      if (!relay_number || relay_number < 1 || relay_number > 30) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid relay number. Must be between 1 and 30.'
        });
      }
      
      console.log(`🔌 Single relay activation: ${relay_number} by ${staff_user || 'unknown'}`);
      
      const success = await relayService.activateRelay(relay_number);
      
      if (success) {
        return reply.send({
          success: true,
          message: `Relay ${relay_number} activated successfully`,
          relay_number,
          staff_user,
          reason,
          timestamp: new Date().toISOString()
        });
      } else {
        return reply.status(500).send({
          success: false,
          error: `Failed to activate relay ${relay_number}`,
          relay_number
        });
      }
      
    } catch (error) {
      console.error('❌ Single relay activation error:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Activate multiple relays
  fastify.post('/api/relay/activate-bulk', async (request: FastifyRequest<BulkRelayActivationRequest>, reply: FastifyReply) => {
    try {
      const { relay_numbers, interval_ms = 1000, staff_user, reason } = request.body;
      
      if (!relay_numbers || !Array.isArray(relay_numbers) || relay_numbers.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid relay_numbers. Must be a non-empty array.'
        });
      }
      
      // Validate relay numbers
      const invalidRelays = relay_numbers.filter(num => num < 1 || num > 30);
      if (invalidRelays.length > 0) {
        return reply.status(400).send({
          success: false,
          error: `Invalid relay numbers: ${invalidRelays.join(', ')}. Must be between 1 and 30.`
        });
      }
      
      // Clamp interval to safe range
      const safeInterval = Math.max(100, Math.min(interval_ms, 5000));
      
      console.log(`🔌 Bulk relay activation: ${relay_numbers.join(', ')} by ${staff_user || 'unknown'}`);
      
      const results = await relayService.activateMultipleRelays(relay_numbers, safeInterval);
      
      return reply.send({
        success: results.failed.length === 0,
        message: `Bulk activation: ${results.success.length} success, ${results.failed.length} failed`,
        results,
        staff_user,
        reason,
        interval_ms: safeInterval,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Bulk relay activation error:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get relay service status
  fastify.get('/api/relay/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = relayService.getConfig();
      const isReady = relayService.isReady();
      
      return reply.send({
        success: true,
        status: {
          connected: isReady,
          config: {
            port: config.port,
            baudRate: config.baudRate,
            slaveId: config.slaveId,
            timeout: config.timeout,
            pulseDuration: config.pulseDuration
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Relay status error:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  console.log('✅ Relay control routes registered');
}