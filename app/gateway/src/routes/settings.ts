import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SettingsService } from '../../../shared/services/settings-service.js';
import { EventLogger } from '../../../shared/services/event-logger.js';
import { EventType } from '../../../shared/types/core-entities.js';

interface MasterPinChangeRequest {
  current_pin: string;
  new_pin: string;
}

interface SecuritySettingsRequest {
  lockout_attempts: number;
  lockout_minutes: number;
}

interface TestPinRequest {
  pin: string;
}

export async function settingsRoutes(fastify: FastifyInstance) {
  const settingsService = new SettingsService();
  const eventLogger = new EventLogger();

  // Get current security settings
  fastify.get('/api/settings/security', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = await settingsService.getSecuritySettings();
      return settings;
    } catch (error) {
      console.error('Failed to get security settings:', error);
      reply.code(500);
      return { error: 'Failed to get security settings' };
    }
  });

  // Update security settings
  fastify.post('/api/settings/security', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { lockout_attempts, lockout_minutes } = request.body as SecuritySettingsRequest;
      
      // Validate input
      if (!lockout_attempts || !lockout_minutes) {
        reply.code(400);
        return { error: 'lockout_attempts and lockout_minutes are required' };
      }
      
      if (lockout_attempts < 3 || lockout_attempts > 10) {
        reply.code(400);
        return { error: 'lockout_attempts must be between 3 and 10' };
      }
      
      if (lockout_minutes < 1 || lockout_minutes > 60) {
        reply.code(400);
        return { error: 'lockout_minutes must be between 1 and 60' };
      }

      await settingsService.updateSecuritySettings({
        lockout_attempts,
        lockout_minutes
      });

      // Log the settings change
      await eventLogger.logEvent(
        'system',
        EventType.SYSTEM_CONFIG_CHANGED,
        {
          setting_type: 'security',
          changed_by: request.user?.username || 'unknown',
          changes: { lockout_attempts, lockout_minutes }
        }
      );

      return { success: true };
    } catch (error) {
      console.error('Failed to update security settings:', error);
      reply.code(500);
      return { error: 'Failed to update security settings' };
    }
  });

  // Test master PIN
  fastify.post('/api/settings/test-master-pin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { pin } = request.body as TestPinRequest;
      
      if (!pin) {
        reply.code(400);
        return { error: 'PIN is required' };
      }

      const isValid = await settingsService.verifyMasterPin(pin);
      
      // Log the test attempt
      await eventLogger.logEvent(
        'system',
        EventType.MASTER_PIN_USED,
        {
          action: 'test',
          success: isValid,
          tested_by: request.user?.username || 'unknown',
          client_ip: request.ip
        }
      );

      if (isValid) {
        return { success: true };
      } else {
        reply.code(401);
        return { error: 'Invalid PIN' };
      }
    } catch (error) {
      console.error('Failed to test master PIN:', error);
      reply.code(500);
      return { error: 'Failed to test master PIN' };
    }
  });

  // Change master PIN
  fastify.post('/api/settings/master-pin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { current_pin, new_pin } = request.body as MasterPinChangeRequest;
      
      if (!current_pin || !new_pin) {
        reply.code(400);
        return { error: 'current_pin and new_pin are required' };
      }

      // Validate new PIN format
      if (!/^\d{4}$/.test(new_pin)) {
        reply.code(400);
        return { error: 'new_pin must be 4 digits' };
      }

      // Verify current PIN
      const isCurrentValid = await settingsService.verifyMasterPin(current_pin);
      if (!isCurrentValid) {
        reply.code(401);
        return { error: 'Current PIN is incorrect' };
      }

      // Change the PIN
      await settingsService.changeMasterPin(new_pin);

      // Log the PIN change
      await eventLogger.logEvent(
        'system',
        EventType.MASTER_PIN_USED,
        {
          action: 'change',
          success: true,
          changed_by: request.user?.username || 'unknown',
          client_ip: request.ip
        }
      );

      return { success: true };
    } catch (error) {
      console.error('Failed to change master PIN:', error);
      reply.code(500);
      return { error: 'Failed to change master PIN' };
    }
  });

  // Get master PIN lockout status for all kiosks
  fastify.get('/api/settings/lockout-status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await settingsService.getLockoutStatus();
      return status;
    } catch (error) {
      console.error('Failed to get lockout status:', error);
      reply.code(500);
      return { error: 'Failed to get lockout status' };
    }
  });

  // Clear lockout for specific kiosk (emergency unlock)
  fastify.post('/api/settings/clear-lockout', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { kiosk_id } = request.body as { kiosk_id: string };
      
      if (!kiosk_id) {
        reply.code(400);
        return { error: 'kiosk_id is required' };
      }

      await settingsService.clearLockout(kiosk_id);

      // Log the lockout clear
      await eventLogger.logEvent(
        kiosk_id,
        EventType.MASTER_PIN_USED,
        {
          action: 'lockout_cleared',
          cleared_by: request.user?.username || 'unknown',
          client_ip: request.ip
        }
      );

      return { success: true };
    } catch (error) {
      console.error('Failed to clear lockout:', error);
      reply.code(500);
      return { error: 'Failed to clear lockout' };
    }
  });
}