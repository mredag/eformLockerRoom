import { FastifyInstance } from 'fastify';
import { ProvisioningController } from '../controllers/provisioning.js';

export async function provisioningRoutes(fastify: FastifyInstance) {
  const controller = new ProvisioningController();

  // Generate provisioning token
  fastify.post('/token', {
    schema: {
      body: {
        type: 'object',
        required: ['zone'],
        properties: {
          zone: { type: 'string', minLength: 1 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            kiosk_id: { type: 'string' },
            zone: { type: 'string' },
            expires_at: { type: 'string' },
            qr_data: { type: 'string' }
          }
        }
      }
    }
  }, controller.generateToken.bind(controller));

  // Register kiosk
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'zone', 'version', 'hardware_id'],
        properties: {
          token: { type: 'string' },
          zone: { type: 'string' },
          version: { type: 'string' },
          hardware_id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            kiosk_id: { type: 'string' },
            registration_secret: { type: 'string' },
            panel_url: { type: 'string' },
            config_hash: { type: 'string' }
          }
        }
      }
    }
  }, controller.registerKiosk.bind(controller));

  // Validate kiosk identity
  fastify.post('/validate', {
    schema: {
      body: {
        type: 'object',
        required: ['kiosk_id', 'registration_secret', 'hardware_id'],
        properties: {
          kiosk_id: { type: 'string' },
          registration_secret: { type: 'string' },
          hardware_id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            status: { type: 'string' }
          }
        }
      }
    }
  }, controller.validateIdentity.bind(controller));

  // Get provisioning status
  fastify.get('/status/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, controller.getStatus.bind(controller));

  // List kiosks
  fastify.get('/kiosks', controller.listKiosks.bind(controller));

  // Cleanup expired tokens
  fastify.post('/cleanup', controller.cleanup.bind(controller));
}