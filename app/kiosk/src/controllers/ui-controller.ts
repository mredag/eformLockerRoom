import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { RfidUserFlow } from '../services/rfid-user-flow';
import { ModbusController } from '../hardware/modbus-controller';
import { SettingsService } from '../../../../shared/services/settings-service';
import { EventLogger } from '../../../../shared/services/event-logger';
import { EventType } from '../../../../shared/types/core-entities';

// Use process.cwd() for compatibility with bundled code
const currentDir = process.cwd();

export class UiController {
  private lockerStateManager: LockerStateManager;
  private rfidUserFlow: RfidUserFlow;
  private modbusController: ModbusController;
  private settingsService: SettingsService;
  private eventLogger: EventLogger;

  constructor(
    lockerStateManager: LockerStateManager,
    rfidUserFlow: RfidUserFlow,
    modbusController: ModbusController
  ) {
    this.lockerStateManager = lockerStateManager;
    this.rfidUserFlow = rfidUserFlow;
    this.modbusController = modbusController;
    this.settingsService = new SettingsService();
    this.eventLogger = new EventLogger();
  }

  async registerRoutes(fastify: FastifyInstance) {
    // Serve static files
    await fastify.register(require('@fastify/static'), {
      root: join(__dirname, '../src/ui/static'),
      prefix: '/static/'
    });

    // Serve main UI
    fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.serveUI(request, reply);
    });

    fastify.get('/ui', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.serveUI(request, reply);
    });

    // API endpoints for UI
    fastify.get('/api/rfid/events', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getRfidEvents(request, reply);
    });

    fastify.post('/api/rfid/handle-card', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.handleCardScanned(request, reply);
    });

    fastify.get('/api/lockers/available', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getAvailableLockers(request, reply);
    });

    fastify.get('/api/lockers/all', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getAllLockers(request, reply);
    });

    fastify.post('/api/lockers/select', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.selectLocker(request, reply);
    });

    fastify.post('/api/master/verify-pin', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.verifyMasterPin(request, reply);
    });

    fastify.post('/api/master/open-locker', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.masterOpenLocker(request, reply);
    });
  }

  private async serveUI(request: FastifyRequest, reply: FastifyReply) {
    try {
      const htmlPath = join(__dirname, '../src/ui/index.html');
      const html = await readFile(htmlPath, 'utf-8');
      
      reply.type('text/html');
      return html;
    } catch (error) {
      console.error('Error serving UI:', error);
      reply.code(500);
      return { error: 'Failed to load UI' };
    }
  }

  private async getRfidEvents(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kiosk_id } = request.query as { kiosk_id: string };
      
      if (!kiosk_id) {
        reply.code(400);
        return { error: 'kiosk_id is required' };
      }

      // TODO: Implement event polling from database
      // For now, return empty array
      return [];
    } catch (error) {
      console.error('Error getting RFID events:', error);
      reply.code(500);
      return { error: 'Failed to get RFID events' };
    }
  }

  private async handleCardScanned(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { card_id, kiosk_id } = request.body as { card_id: string; kiosk_id: string };
      
      if (!card_id || !kiosk_id) {
        reply.code(400);
        return { error: 'card_id and kiosk_id are required' };
      }

      // Check if card already has a locker
      const existingLocker = await this.lockerStateManager.checkExistingOwnership(card_id, 'rfid');
      
      if (existingLocker) {
        // Open and release the existing locker
        const success = await this.modbusController.openLocker(existingLocker.id);
        if (success) {
          await this.lockerStateManager.releaseLocker(kiosk_id, existingLocker.id);
          return { 
            action: 'open_locker', 
            locker_id: existingLocker.id,
            message: 'Locker opened and released'
          };
        } else {
          return { error: 'failed_open' };
        }
      } else {
        // Get available lockers for selection
        const availableLockers = await this.lockerStateManager.getAvailableLockers(kiosk_id);
        
        if (availableLockers.length === 0) {
          return { error: 'no_lockers' };
        }

        return {
          action: 'show_lockers',
          lockers: availableLockers.map(locker => ({
            id: locker.id,
            status: locker.status
          }))
        };
      }
    } catch (error) {
      console.error('Error handling card scan:', error);
      reply.code(500);
      return { error: 'error_server' };
    }
  }

  private async getAvailableLockers(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kiosk_id } = request.query as { kiosk_id: string };
      
      if (!kiosk_id) {
        reply.code(400);
        return { error: 'kiosk_id is required' };
      }

      const lockers = await this.lockerStateManager.getAvailableLockers(kiosk_id);
      
      return lockers.map(locker => ({
        id: locker.id,
        status: locker.status,
        is_vip: locker.is_vip
      }));
    } catch (error) {
      console.error('Error getting available lockers:', error);
      reply.code(500);
      return { error: 'Failed to get available lockers' };
    }
  }

  private async getAllLockers(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kiosk_id } = request.query as { kiosk_id: string };
      
      if (!kiosk_id) {
        reply.code(400);
        return { error: 'kiosk_id is required' };
      }

      const lockers = await this.lockerStateManager.getKioskLockers(kiosk_id);
      
      return lockers.map(locker => ({
        id: locker.id,
        status: locker.status,
        is_vip: locker.is_vip,
        owner_type: locker.owner_type,
        owned_at: locker.owned_at
      }));
    } catch (error) {
      console.error('Error getting all lockers:', error);
      reply.code(500);
      return { error: 'Failed to get all lockers' };
    }
  }

  private async selectLocker(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { locker_id, kiosk_id } = request.body as { locker_id: number; kiosk_id: string };
      
      if (!locker_id || !kiosk_id) {
        reply.code(400);
        return { error: 'locker_id and kiosk_id are required' };
      }

      // TODO: Get the current card ID from session or context
      // For now, we'll use a placeholder
      const cardId = 'temp-card-id';

      // Assign and open the locker
      const assigned = await this.lockerStateManager.assignLocker(kiosk_id, locker_id, 'rfid', cardId);
      
      if (!assigned) {
        return { error: 'Locker not available' };
      }

      const opened = await this.modbusController.openLocker(locker_id);
      
      if (opened) {
        // Update status to Owned after successful opening
        await this.lockerStateManager.confirmOwnership(kiosk_id, locker_id);
        return { success: true, locker_id };
      } else {
        // Release the locker if opening failed
        await this.lockerStateManager.releaseLocker(kiosk_id, locker_id);
        return { error: 'failed_open' };
      }
    } catch (error) {
      console.error('Error selecting locker:', error);
      reply.code(500);
      return { error: 'error_server' };
    }
  }

  private async verifyMasterPin(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { pin, kiosk_id } = request.body as { pin: string; kiosk_id: string };
      
      if (!pin || !kiosk_id) {
        reply.code(400);
        return { error: 'pin and kiosk_id are required' };
      }

      const clientIp = request.ip;
      
      // Check if locked out
      const isLocked = await this.settingsService.isLocked(kiosk_id, clientIp);
      if (isLocked) {
        const remainingTime = await this.settingsService.getRemainingLockoutTime(kiosk_id, clientIp);
        reply.code(429);
        return { 
          error: 'PIN entry locked',
          remaining_seconds: remainingTime
        };
      }

      // Verify PIN
      const isValid = await this.settingsService.verifyMasterPin(pin);
      
      // Record the attempt
      const nowLocked = await this.settingsService.recordPinAttempt(kiosk_id, clientIp, isValid);
      
      if (isValid) {
        // Log successful PIN usage
        await this.eventLogger.logMasterPinUsage(kiosk_id, 0, {
          pin_attempts: 1,
          success: true,
          client_ip: clientIp
        });
        
        console.log(`Master PIN used successfully from ${clientIp} for kiosk ${kiosk_id}`);
        return { success: true };
      } else {
        // Log failed attempt
        await this.eventLogger.logMasterPinUsage(kiosk_id, 0, {
          pin_attempts: 1,
          success: false,
          lockout_triggered: nowLocked,
          client_ip: clientIp
        });
        
        if (nowLocked) {
          console.log(`Master PIN locked out for ${clientIp} on kiosk ${kiosk_id}`);
          reply.code(429);
          return { 
            error: 'PIN entry locked',
            remaining_seconds: await this.settingsService.getRemainingLockoutTime(kiosk_id, clientIp)
          };
        } else {
          const settings = await this.settingsService.getSecuritySettings();
          // Get current attempts to calculate remaining
          const status = await this.settingsService.getLockoutStatus();
          const kioskStatus = status.find(s => s.kiosk_id === kiosk_id);
          const attemptsRemaining = settings.lockout_attempts - (kioskStatus?.attempts || 0);
          
          reply.code(401);
          return { 
            error: 'Incorrect PIN',
            attempts_remaining: Math.max(0, attemptsRemaining)
          };
        }
      }
    } catch (error) {
      console.error('Error verifying master PIN:', error);
      reply.code(500);
      return { error: 'error_server' };
    }
  }

  private async masterOpenLocker(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { locker_id, kiosk_id } = request.body as { locker_id: number; kiosk_id: string };
      
      if (!locker_id || !kiosk_id) {
        reply.code(400);
        return { error: 'locker_id and kiosk_id are required' };
      }

      // Open the locker
      const opened = await this.modbusController.openLocker(locker_id);
      
      if (opened) {
        // Release the locker (set to Free status)
        await this.lockerStateManager.releaseLocker(kiosk_id, locker_id);
        
        // Log master open action
        await this.eventLogger.logEvent(
          kiosk_id,
          EventType.MASTER_PIN_USED,
          {
            action: 'open_locker',
            locker_id: locker_id,
            client_ip: request.ip,
            success: true
          },
          locker_id
        );
        
        console.log(`Master opened locker ${locker_id} on kiosk ${kiosk_id} from ${request.ip}`);
        
        return { success: true, locker_id };
      } else {
        return { error: 'failed_open' };
      }
    } catch (error) {
      console.error('Error in master open locker:', error);
      reply.code(500);
      return { error: 'error_server' };
    }
  }
}
