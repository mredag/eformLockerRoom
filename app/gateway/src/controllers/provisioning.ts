import { FastifyRequest, FastifyReply } from 'fastify';
import { ProvisioningService } from '../services/provisioning.js';
import { KioskRegistrationRequest } from '../../../../shared/types/index.js';

export class ProvisioningController {
  private provisioningService: ProvisioningService;

  constructor() {
    this.provisioningService = new ProvisioningService();
  }

  /**
   * Generate a new provisioning token for a zone
   * POST /api/provisioning/token
   */
  async generateToken(request: FastifyRequest<{
    Body: { zone: string }
  }>, reply: FastifyReply) {
    try {
      const { zone } = request.body;

      if (!zone || typeof zone !== 'string' || zone.trim().length === 0) {
        return reply.status(400).send({
          error: 'Zone is required and must be a non-empty string'
        });
      }

      const token = await this.provisioningService.generateProvisioningToken(zone.trim());
      const qr_data = this.provisioningService.generateProvisioningQR(token.token);

      reply.send({
        token: token.token,
        kiosk_id: token.kiosk_id,
        zone: token.zone,
        expires_at: token.expires_at,
        qr_data
      });
    } catch (error) {
      console.error('Error generating provisioning token:', error);
      reply.status(500).send({
        error: 'Failed to generate provisioning token'
      });
    }
  }

  /**
   * Register a new kiosk using provisioning token
   * POST /api/provisioning/register
   */
  async registerKiosk(request: FastifyRequest<{
    Body: {
      token: string;
      zone: string;
      version: string;
      hardware_id: string;
    }
  }>, reply: FastifyReply) {
    try {
      const { token, zone, version, hardware_id } = request.body;

      // Validate required fields
      if (!token || !zone || !version || !hardware_id) {
        return reply.status(400).send({
          error: 'Missing required fields: token, zone, version, hardware_id'
        });
      }

      const registrationRequest: KioskRegistrationRequest = {
        zone: zone.trim(),
        version: version.trim(),
        hardware_id: hardware_id.trim()
      };

      const response = await this.provisioningService.registerKiosk(token, registrationRequest);

      reply.send(response);
    } catch (error) {
      console.error('Error registering kiosk:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Invalid or expired')) {
          return reply.status(401).send({ error: error.message });
        }
        if (error.message.includes('Zone mismatch')) {
          return reply.status(400).send({ error: error.message });
        }
      }

      reply.status(500).send({
        error: 'Failed to register kiosk'
      });
    }
  }

  /**
   * Validate kiosk identity
   * POST /api/provisioning/validate
   */
  async validateIdentity(request: FastifyRequest<{
    Body: {
      kiosk_id: string;
      registration_secret: string;
      hardware_id: string;
    }
  }>, reply: FastifyReply) {
    try {
      const { kiosk_id, registration_secret, hardware_id } = request.body;

      if (!kiosk_id || !registration_secret || !hardware_id) {
        return reply.status(400).send({
          error: 'Missing required fields: kiosk_id, registration_secret, hardware_id'
        });
      }

      const isValid = await this.provisioningService.validateKioskIdentity(
        kiosk_id,
        registration_secret,
        hardware_id
      );

      if (!isValid) {
        return reply.status(401).send({
          error: 'Invalid kiosk identity'
        });
      }

      // Complete enrollment if validation successful
      await this.provisioningService.completeEnrollment(kiosk_id);

      reply.send({
        valid: true,
        status: 'enrolled'
      });
    } catch (error) {
      console.error('Error validating kiosk identity:', error);
      reply.status(500).send({
        error: 'Failed to validate kiosk identity'
      });
    }
  }

  /**
   * Get provisioning status
   * GET /api/provisioning/status/:id
   */
  async getStatus(request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) {
    try {
      const provisioningId = parseInt(request.params.id);
      
      if (isNaN(provisioningId)) {
        return reply.status(400).send({
          error: 'Invalid provisioning ID'
        });
      }

      const status = await this.provisioningService.getProvisioningStatus(provisioningId);
      
      if (!status) {
        return reply.status(404).send({
          error: 'Provisioning status not found'
        });
      }

      reply.send(status);
    } catch (error) {
      console.error('Error getting provisioning status:', error);
      reply.status(500).send({
        error: 'Failed to get provisioning status'
      });
    }
  }

  /**
   * List all kiosks
   * GET /api/provisioning/kiosks
   */
  async listKiosks(request: FastifyRequest, reply: FastifyReply) {
    try {
      const kiosks = await this.provisioningService.listKiosks();
      reply.send({ kiosks });
    } catch (error) {
      console.error('Error listing kiosks:', error);
      reply.status(500).send({
        error: 'Failed to list kiosks'
      });
    }
  }

  /**
   * Cleanup expired tokens (maintenance endpoint)
   * POST /api/provisioning/cleanup
   */
  async cleanup(request: FastifyRequest, reply: FastifyReply) {
    try {
      await this.provisioningService.cleanupExpiredTokens();
      reply.send({ message: 'Expired tokens cleaned up successfully' });
    } catch (error) {
      console.error('Error cleaning up expired tokens:', error);
      reply.status(500).send({
        error: 'Failed to cleanup expired tokens'
      });
    }
  }
}