import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { RfidUserFlow } from '../services/rfid-user-flow';
import { ModbusController } from '../hardware/modbus-controller';

// Use process.cwd() for compatibility with bundled code
const currentDir = process.cwd();

export class UiController {
  private lockerStateManager: LockerStateManager;
  private rfidUserFlow: RfidUserFlow;
  private modbusController: ModbusController;
  private masterPin: string = '1234'; // TODO: Load from config
  private pinAttempts: Map<string, { count: number; lockoutEnd?: number }> = new Map();
  private readonly maxAttempts = 5;
  private readonly lockoutMinutes = 5;
  
  // Session management for RFID card selection
  private cardSessions: Map<string, { cardId: string; timestamp: number }> = new Map();
  private readonly sessionTimeoutMs = 5 * 60 * 1000; // 5 minutes

  constructor(
    lockerStateManager: LockerStateManager,
    rfidUserFlow: RfidUserFlow,
    modbusController: ModbusController
  ) {
    this.lockerStateManager = lockerStateManager;
    this.rfidUserFlow = rfidUserFlow;
    this.modbusController = modbusController;
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
        // Create a session for this card selection
        const sessionId = this.createCardSession(kiosk_id, card_id);
        
        // Get available lockers for selection
        const availableLockers = await this.lockerStateManager.getAvailableLockers(kiosk_id);
        
        if (availableLockers.length === 0) {
          return { error: 'no_lockers' };
        }

        return {
          action: 'show_lockers',
          session_id: sessionId,
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
      const { locker_id, kiosk_id, session_id } = request.body as { 
        locker_id: number; 
        kiosk_id: string; 
        session_id?: string 
      };
      
      if (!locker_id || !kiosk_id) {
        reply.code(400);
        return { error: 'locker_id and kiosk_id are required' };
      }

      // Get card ID from session
      const cardId = this.getCardFromSession(session_id);
      
      if (!cardId) {
        reply.code(400);
        return { error: 'Invalid or expired session. Please scan your card again.' };
      }

      console.log(`🎯 Selecting locker ${locker_id} for card ${cardId} on kiosk ${kiosk_id}`);

      // Assign and open the locker
      const assigned = await this.lockerStateManager.assignLocker(kiosk_id, locker_id, 'rfid', cardId);
      
      if (!assigned) {
        return { error: 'Locker not available' };
      }

      const opened = await this.modbusController.openLocker(locker_id);
      
      if (opened) {
        // Update status to Owned after successful opening
        await this.lockerStateManager.confirmOwnership(kiosk_id, locker_id);
        
        // Clear the session after successful selection
        this.clearCardSession(session_id);
        
        console.log(`✅ Locker ${locker_id} successfully assigned to card ${cardId}`);
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
      const attemptKey = `${clientIp}-${kiosk_id}`;
      
      // Check if locked out
      const attempts = this.pinAttempts.get(attemptKey) || { count: 0 };
      
      if (attempts.lockoutEnd && Date.now() < attempts.lockoutEnd) {
        reply.code(429);
        return { 
          error: 'PIN entry locked',
          lockout_end: attempts.lockoutEnd
        };
      }

      // Verify PIN
      if (pin === this.masterPin) {
        // Reset attempts on success
        this.pinAttempts.delete(attemptKey);
        
        // Log master PIN usage
        this.logMasterPinUsage(clientIp, kiosk_id, 'success');
        console.log(`Master PIN used successfully from ${clientIp} for kiosk ${kiosk_id}`);
        
        return { success: true };
      } else {
        // Increment attempts
        attempts.count++;
        
        if (attempts.count >= this.maxAttempts) {
          attempts.lockoutEnd = Date.now() + (this.lockoutMinutes * 60 * 1000);
          this.logMasterPinUsage(clientIp, kiosk_id, 'locked');
          console.log(`Master PIN locked out for ${clientIp} on kiosk ${kiosk_id}`);
        } else {
          this.logMasterPinUsage(clientIp, kiosk_id, 'failed');
        }
        
        this.pinAttempts.set(attemptKey, attempts);
        
        reply.code(401);
        return { 
          error: 'Incorrect PIN',
          attempts_remaining: Math.max(0, this.maxAttempts - attempts.count)
        };
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
        this.logMasterAction(request.ip, kiosk_id, locker_id, 'open');
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

  private logMasterPinUsage(clientIp: string, kioskId: string, result: 'success' | 'failed' | 'locked'): void {
    // TODO: Implement proper event logging to database
    const logEntry = {
      timestamp: new Date().toISOString(),
      event_type: 'master_pin_used',
      kiosk_id: kioskId,
      client_ip: clientIp,
      result: result,
      details: {
        action: 'pin_verification',
        success: result === 'success'
      }
    };
    
    console.log('Master PIN Event:', JSON.stringify(logEntry));
  }

  private logMasterAction(clientIp: string, kioskId: string, lockerId: number, action: string): void {
    // TODO: Implement proper event logging to database
    const logEntry = {
      timestamp: new Date().toISOString(),
      event_type: 'master_action',
      kiosk_id: kioskId,
      locker_id: lockerId,
      client_ip: clientIp,
      action: action,
      details: {
        master_operation: true,
        staff_override: true
      }
    };
    
    console.log('Master Action Event:', JSON.stringify(logEntry));
  }

  private createCardSession(kioskId: string, cardId: string): string {
    // Clean up expired sessions first
    this.cleanupExpiredSessions();
    
    // Create unique session ID
    const sessionId = `${kioskId}-${cardId}-${Date.now()}`;
    
    // Store session
    this.cardSessions.set(sessionId, {
      cardId: cardId,
      timestamp: Date.now()
    });
    
    console.log(`🔑 Created session ${sessionId} for card ${cardId}`);
    return sessionId;
  }

  private getCardFromSession(sessionId?: string): string | null {
    if (!sessionId) {
      console.log('❌ No session ID provided');
      return null;
    }
    
    const session = this.cardSessions.get(sessionId);
    
    if (!session) {
      console.log(`❌ Session ${sessionId} not found`);
      return null;
    }
    
    // Check if session has expired
    if (Date.now() - session.timestamp > this.sessionTimeoutMs) {
      console.log(`⏰ Session ${sessionId} expired`);
      this.cardSessions.delete(sessionId);
      return null;
    }
    
    console.log(`✅ Retrieved card ${session.cardId} from session ${sessionId}`);
    return session.cardId;
  }

  private clearCardSession(sessionId?: string): void {
    if (sessionId && this.cardSessions.has(sessionId)) {
      this.cardSessions.delete(sessionId);
      console.log(`🗑️ Cleared session ${sessionId}`);
    }
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];
    
    for (const [sessionId, session] of this.cardSessions.entries()) {
      if (now - session.timestamp > this.sessionTimeoutMs) {
        expiredSessions.push(sessionId);
      }
    }
    
    expiredSessions.forEach(sessionId => {
      this.cardSessions.delete(sessionId);
    });
    
    if (expiredSessions.length > 0) {
      console.log(`🧹 Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }
}
