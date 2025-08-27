import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { ModbusController } from '../hardware/modbus-controller';
import { SessionManager } from './session-manager';

export class UiController {
  private lockerStateManager: LockerStateManager;
  private modbusController: ModbusController;
  private sessionManager: SessionManager;
  private masterPin: string = '1234'; // TODO: Load from config
  private pinAttempts: Map<string, { count: number; lockoutEnd?: number }> = new Map();
  private readonly maxAttempts = 5;
  private readonly lockoutMinutes = 5;

  constructor(
    lockerStateManager: LockerStateManager,
    modbusController: ModbusController
  ) {
    this.lockerStateManager = lockerStateManager;
    this.modbusController = modbusController;
    
    // Initialize session manager with 30-second timeout (Requirement 3.1)
    this.sessionManager = new SessionManager({
      defaultTimeoutSeconds: 30, // Increased from 20 to 30 seconds per requirements
      cleanupIntervalMs: 5000,
      maxSessionsPerKiosk: 1
    });

    this.setupSessionManagerEvents();
    this.setupHardwareErrorHandling();
  }

  async registerRoutes(fastify: FastifyInstance) {
    // Serve static files
    await fastify.register(require('@fastify/static'), {
      root: join(__dirname, '../ui/static'),
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

    // Card handling with direct assignment approach (Requirements 2.1-2.6)
    fastify.post('/api/rfid/handle-card', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.handleCardScanned(request, reply);
    });

    // Simplified API endpoints for the new UI
    fastify.get('/api/card/:cardId/locker', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.checkCardLocker(request, reply);
    });

    fastify.post('/api/locker/assign', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.assignLocker(request, reply);
    });

    fastify.post('/api/locker/release', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.releaseLocker(request, reply);
    });

    fastify.get('/api/lockers/available', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getAvailableLockers(request, reply);
    });

    fastify.get('/api/lockers/all', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getAllLockers(request, reply);
    });

    // Locker selection with direct assignment approach (Requirements 2.1-2.6)
    fastify.post('/api/lockers/select', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.selectLocker(request, reply);
    });

    fastify.post('/api/master/verify-pin', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.verifyMasterPin(request, reply);
    });

    fastify.post('/api/master/open-locker', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.masterOpenLocker(request, reply);
    });

    // Session management endpoints
    fastify.get('/api/session/status', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getSessionStatus(request, reply);
    });

    fastify.post('/api/session/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.cancelSession(request, reply);
    });

    // Error recovery endpoint (Requirement 2.5: Allow retry after assignment failure)
    fastify.post('/api/session/retry', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.retryAssignment(request, reply);
    });

    // Hardware status endpoint for monitoring (Requirement 4.6)
    fastify.get('/api/hardware/status', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getHardwareStatus(request, reply);
    });

    // Register enhanced feedback routes
    await this.registerEnhancedFeedbackRoutes(fastify);
  }

  private async serveUI(request: FastifyRequest, reply: FastifyReply) {
    try {
      const htmlPath = join(__dirname, '../ui/index.html');
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

      console.log(`🎯 Card scanned: ${card_id} on kiosk ${kiosk_id}`);

      // Requirement 2.1: Check if card already has a locker assigned
      const existingLocker = await this.lockerStateManager.checkExistingOwnership(card_id, 'rfid');
      
      if (existingLocker) {
        // Requirement 2.2: Open existing locker and release assignment with enhanced error handling
        console.log(`🔓 Opening existing locker ${existingLocker.id} for card ${card_id}`);
        
        let success = false;
        let hardwareError: string | null = null;
        
        try {
          success = await this.modbusController.openLocker(existingLocker.id);
        } catch (error) {
          hardwareError = error instanceof Error ? error.message : String(error);
          console.error(`❌ Hardware error opening existing locker ${existingLocker.id}: ${hardwareError}`);
          success = false;
        }
        
        if (success) {
          await this.lockerStateManager.releaseLocker(existingLocker.kiosk_id, existingLocker.id, card_id);
          console.log(`✅ Locker ${existingLocker.id} opened and released for card ${card_id}`);
          
          return { 
            action: 'open_locker', 
            locker_id: existingLocker.id,
            message: 'Dolap açıldı ve bırakıldı'
          };
        } else {
          console.error(`❌ Failed to open existing locker ${existingLocker.id} for card ${card_id}`);
          
          // Determine appropriate error message based on hardware status (Requirement 4.4)
          const hardwareStatus = this.modbusController.getHardwareStatus();
          let errorMessage = 'Dolap açılamadı - Tekrar deneyin';
          let errorCode = 'failed_open';
          
          if (!hardwareStatus.available) {
            errorMessage = 'Sistem bakımda - Görevliye başvurun';
            errorCode = 'hardware_unavailable';
          } else if (hardwareError) {
            errorMessage = 'Bağlantı hatası - Tekrar deneyin';
            errorCode = 'connection_error';
          }
          
          return { 
            error: errorCode,
            message: errorMessage,
            hardware_status: {
              available: hardwareStatus.available,
              error_rate: hardwareStatus.diagnostics.errorRate
            }
          };
        }
      } else {
        // Requirement 2.3: Show available lockers for selection
        const availableLockers = await this.lockerStateManager.getAvailableLockers(kiosk_id);
        
        if (availableLockers.length === 0) {
          console.log(`⚠️ No available lockers for kiosk ${kiosk_id}`);
          return { 
            error: 'no_lockers',
            message: 'Müsait dolap yok - Daha sonra deneyin'
          };
        }

        // Cancel any existing session for this kiosk (Requirement 3.5)
        const existingSession = this.sessionManager.getKioskSession(kiosk_id);
        if (existingSession) {
          this.sessionManager.cancelSession(existingSession.id, 'Yeni kart okundu');
          console.log(`🔄 Cancelled existing session for new card scan`);
        }

        // Create a 30-second session (Requirement 3.1)
        const session = this.sessionManager.createSession(
          kiosk_id, 
          card_id, 
          availableLockers.map(l => l.id)
        );

        console.log(`🔑 Created session ${session.id} for card ${card_id} with ${availableLockers.length} available lockers`);

        return {
          action: 'show_lockers',
          session_id: session.id,
          timeout_seconds: session.timeoutSeconds,
          message: 'Kart okundu. Dolap seçin',
          lockers: availableLockers.map(locker => ({
            id: locker.id,
            status: locker.status,
            display_name: `Dolap ${locker.id}`
          }))
        };
      }
    } catch (error) {
      console.error('Error handling card scan:', error);
      reply.code(500);
      return { 
        error: 'error_server',
        message: 'Sistem hatası - Tekrar deneyin'
      };
    }
  }

  private async getAvailableLockers(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kioskId } = request.query as { kioskId: string };
      
      if (!kioskId) {
        reply.code(400);
        return { error: 'kioskId is required' };
      }

      const lockers = await this.lockerStateManager.getAvailableLockers(kioskId);
      
      if (lockers.length === 0) {
        return {
          lockers: [],
          sessionId: null,
          timeoutSeconds: 0,
          message: 'Müsait dolap yok'
        };
      }

      // Create a temporary session for this request
      // Note: This will be replaced by the actual card scan session
      return {
        lockers: lockers.map(locker => ({
          id: locker.id,
          status: locker.status,
          displayName: `Dolap ${locker.id}`,
          is_vip: locker.is_vip
        })),
        sessionId: `temp-${Date.now()}`,
        timeoutSeconds: 30,
        message: 'Dolap seçin'
      };
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
      
      if (!locker_id || !kiosk_id || !session_id) {
        reply.code(400);
        return { 
          error: 'missing_parameters',
          message: 'Gerekli parametreler eksik'
        };
      }

      // Requirement 2.4: Validate session before assignment
      const session = this.sessionManager.getSession(session_id);
      
      if (!session) {
        reply.code(400);
        return { 
          error: 'session_expired',
          message: 'Oturum süresi doldu - Kartınızı tekrar okutun'
        };
      }

      const cardId = session.cardId;
      console.log(`🎯 Selecting locker ${locker_id} for card ${cardId} on kiosk ${kiosk_id}`);

      // Validate that the locker is in the session's available lockers
      if (!session.availableLockers?.includes(locker_id)) {
        console.error(`❌ Locker ${locker_id} not in session's available lockers`);
        return { 
          error: 'invalid_locker',
          message: 'Geçersiz dolap seçimi'
        };
      }

      // Requirement 2.4: Assign locker to card
      const assigned = await this.lockerStateManager.assignLocker(kiosk_id, locker_id, 'rfid', cardId);
      
      if (!assigned) {
        console.error(`❌ Failed to assign locker ${locker_id} to card ${cardId}`);
        // Requirement 2.5: Show clear error message for assignment failure
        return { 
          error: 'assignment_failed',
          message: 'Dolap atanamadı - Farklı dolap seçin'
        };
      }

      console.log(`✅ Locker ${locker_id} assigned to card ${cardId}, attempting to open`);

      // Requirement 2.4: Open the locker after successful assignment with enhanced error handling
      console.log(`🔧 Attempting to open locker ${locker_id} for card ${cardId}`);
      
      let opened = false;
      let hardwareError: string | null = null;
      
      try {
        opened = await this.modbusController.openLocker(locker_id);
      } catch (error) {
        hardwareError = error instanceof Error ? error.message : String(error);
        console.error(`❌ Hardware error opening locker ${locker_id}: ${hardwareError}`);
        opened = false;
      }
      
      if (opened) {
        // Confirm ownership after successful opening
        await this.lockerStateManager.confirmOwnership(kiosk_id, locker_id);
        
        // Requirement 3.3: Complete session immediately after successful selection
        this.sessionManager.completeSession(session_id, locker_id);
        
        console.log(`✅ Locker ${locker_id} successfully opened for card ${cardId}`);
        
        // Requirement 2.6: Return to idle state after completion
        return { 
          success: true, 
          action: 'assignment_complete',
          locker_id,
          message: `Dolap ${locker_id} açıldı ve atandı`
        };
      } else {
        // Enhanced hardware failure handling - release the assignment (Requirement 4.5)
        console.error(`❌ Failed to open locker ${locker_id}, releasing assignment`);
        
        try {
          await this.lockerStateManager.releaseLocker(kiosk_id, locker_id, cardId);
          console.log(`✅ Successfully released assignment for locker ${locker_id}`);
        } catch (releaseError) {
          console.error(`❌ Failed to release locker assignment: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`);
          // Continue with error response even if release fails
        }
        
        // Determine appropriate error message based on hardware status (Requirement 4.4)
        const hardwareStatus = this.modbusController.getHardwareStatus();
        let errorMessage = 'Dolap açılamadı - Tekrar deneyin';
        let errorCode = 'hardware_failed';
        
        if (!hardwareStatus.available) {
          errorMessage = 'Sistem bakımda - Görevliye başvurun';
          errorCode = 'hardware_unavailable';
        } else if (hardwareError) {
          errorMessage = 'Bağlantı hatası - Tekrar deneyin';
          errorCode = 'connection_error';
        }
        
        // Requirement 2.5: Show clear error message and allow retry
        return { 
          error: errorCode,
          message: errorMessage,
          allow_retry: hardwareStatus.available, // Only allow retry if hardware is available
          hardware_status: {
            available: hardwareStatus.available,
            error_rate: hardwareStatus.diagnostics.errorRate,
            connection_errors: hardwareStatus.diagnostics.connectionErrors
          }
        };
      }
    } catch (error) {
      console.error('Error selecting locker:', error);
      reply.code(500);
      
      // Requirement 2.5: Show clear error message for server errors
      return { 
        error: 'server_error',
        message: 'Sistem hatası - Tekrar deneyin'
      };
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

      // Open the locker with enhanced error handling
      console.log(`🔧 Master attempting to open locker ${locker_id} on kiosk ${kiosk_id}`);
      
      let opened = false;
      let hardwareError: string | null = null;
      
      try {
        opened = await this.modbusController.openLocker(locker_id);
      } catch (error) {
        hardwareError = error instanceof Error ? error.message : String(error);
        console.error(`❌ Hardware error in master open locker ${locker_id}: ${hardwareError}`);
        opened = false;
      }
      
      if (opened) {
        // Release the locker (set to Free status)
        await this.lockerStateManager.releaseLocker(kiosk_id, locker_id);
        
        // Log master open action
        this.logMasterAction(request.ip, kiosk_id, locker_id, 'open');
        console.log(`✅ Master opened locker ${locker_id} on kiosk ${kiosk_id} from ${request.ip}`);
        
        return { success: true, locker_id };
      } else {
        console.error(`❌ Master failed to open locker ${locker_id}`);
        
        // Determine appropriate error message based on hardware status (Requirement 4.4)
        const hardwareStatus = this.modbusController.getHardwareStatus();
        let errorCode = 'failed_open';
        
        if (!hardwareStatus.available) {
          errorCode = 'hardware_unavailable';
        } else if (hardwareError) {
          errorCode = 'connection_error';
        }
        
        return { 
          error: errorCode,
          hardware_status: {
            available: hardwareStatus.available,
            error_rate: hardwareStatus.diagnostics.errorRate
          }
        };
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



  /**
   * Setup event listeners for session manager
   */
  private setupSessionManagerEvents(): void {
    this.sessionManager.on('session_created', (event) => {
      console.log(`🔑 Session created: ${event.sessionId}`);
      // Could emit WebSocket event here for real-time UI updates
    });

    this.sessionManager.on('session_expired', (event) => {
      console.log(`⏰ Session expired: ${event.sessionId}`);
      // Could emit WebSocket event here for real-time UI updates
    });

    this.sessionManager.on('session_cancelled', (event) => {
      console.log(`❌ Session cancelled: ${event.sessionId} - ${event.data.reason}`);
      // Could emit WebSocket event here for real-time UI updates
    });

    this.sessionManager.on('session_completed', (event) => {
      console.log(`✅ Session completed: ${event.sessionId}`);
      // Could emit WebSocket event here for real-time UI updates
    });

    this.sessionManager.on('countdown_update', (event) => {
      // Could emit WebSocket event here for real-time countdown updates
      // For now, just log every 5 seconds to avoid spam
      if (event.data.remainingSeconds % 5 === 0 || event.data.remainingSeconds <= 5) {
        console.log(`⏱️ Session ${event.sessionId}: ${event.data.remainingSeconds}s remaining`);
      }
    });
  }

  /**
   * Get session status for a kiosk (Requirement 3.2: Show countdown timer)
   */
  private async getSessionStatus(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kiosk_id } = request.query as { kiosk_id: string };
      
      if (!kiosk_id) {
        reply.code(400);
        return { error: 'kiosk_id is required' };
      }

      const session = this.sessionManager.getKioskSession(kiosk_id);
      
      if (!session) {
        return { 
          has_session: false,
          message: 'Kartınızı okutun',
          state: 'idle'
        };
      }

      const remainingTime = this.sessionManager.getRemainingTime(session.id);

      // Requirement 3.4: Return to idle with clear message when timeout
      if (remainingTime <= 0) {
        return {
          has_session: false,
          message: 'Süre doldu - Kartınızı tekrar okutun',
          state: 'timeout'
        };
      }

      return {
        has_session: true,
        session_id: session.id,
        remaining_seconds: remainingTime,
        card_id: session.cardId,
        available_lockers: session.availableLockers || [],
        message: 'Dolap seçin',
        state: 'session_active',
        timeout_seconds: 30 // Requirement 3.1: 30-second session
      };
    } catch (error) {
      console.error('Error getting session status:', error);
      reply.code(500);
      return { 
        error: 'server_error',
        message: 'Sistem hatası'
      };
    }
  }

  /**
   * Cancel active session for a kiosk (Requirement 3.5: New card cancels existing session)
   */
  private async cancelSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kiosk_id, reason } = request.body as { kiosk_id: string; reason?: string };
      
      if (!kiosk_id) {
        reply.code(400);
        return { error: 'kiosk_id is required' };
      }

      const session = this.sessionManager.getKioskSession(kiosk_id);
      
      if (!session) {
        return { 
          success: true, // Not an error if no session exists
          message: 'Oturum zaten yok',
          state: 'idle'
        };
      }

      const cancelled = this.sessionManager.cancelSession(
        session.id, 
        reason || 'Manuel iptal'
      );

      console.log(`🔄 Session ${session.id} cancelled: ${reason || 'Manuel iptal'}`);

      return {
        success: cancelled,
        message: cancelled ? 'Oturum iptal edildi' : 'Oturum iptal edilemedi',
        state: cancelled ? 'idle' : 'error'
      };
    } catch (error) {
      console.error('Error cancelling session:', error);
      reply.code(500);
      return { 
        error: 'server_error',
        message: 'Sistem hatası'
      };
    }
  }

  /**
   * Enhanced feedback methods for task 6
   */

  // Add new API endpoint for enhanced feedback
  private async registerEnhancedFeedbackRoutes(fastify: FastifyInstance) {
    // Big feedback messages endpoint
    fastify.post('/api/ui/big-feedback', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.showBigFeedback(request, reply);
    });

    // Audio feedback endpoint
    fastify.post('/api/ui/audio-feedback', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.playAudioFeedback(request, reply);
    });

    // Transition effects endpoint
    fastify.post('/api/ui/transition', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.triggerTransition(request, reply);
    });
  }

  private async showBigFeedback(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { message, type, duration } = request.body as { 
        message: string; 
        type: 'opening' | 'success' | 'error' | 'warning';
        duration?: number;
      };
      
      if (!message || !type) {
        reply.code(400);
        return { error: 'message and type are required' };
      }

      // Return the feedback data for the frontend to display
      return {
        success: true,
        feedback: {
          message,
          type,
          duration: duration || 3000,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      console.error('Error showing big feedback:', error);
      reply.code(500);
      return { error: 'Failed to show big feedback' };
    }
  }

  private async playAudioFeedback(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { type, volume } = request.body as { 
        type: 'success' | 'error' | 'warning' | 'info';
        volume?: number;
      };
      
      if (!type) {
        reply.code(400);
        return { error: 'type is required' };
      }

      // Return audio feedback configuration for the frontend
      return {
        success: true,
        audio: {
          type,
          volume: volume || 0.7,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      console.error('Error playing audio feedback:', error);
      reply.code(500);
      return { error: 'Failed to play audio feedback' };
    }
  }

  private async triggerTransition(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { transition, duration, target } = request.body as { 
        transition: 'fade' | 'scale' | 'blur' | 'slide';
        duration?: number;
        target?: string;
      };
      
      if (!transition) {
        reply.code(400);
        return { error: 'transition type is required' };
      }

      // Return transition configuration for the frontend
      return {
        success: true,
        transition: {
          type: transition,
          duration: duration || 300, // Default 300ms as per requirements
          target: target || 'overlay',
          timestamp: Date.now()
        }
      };
    } catch (error) {
      console.error('Error triggering transition:', error);
      reply.code(500);
      return { error: 'Failed to trigger transition' };
    }
  }



  /**
   * Retry assignment after failure (Requirement 2.5: Allow retry after assignment failure)
   */
  private async retryAssignment(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kiosk_id, session_id } = request.body as { kiosk_id: string; session_id: string };
      
      if (!kiosk_id || !session_id) {
        reply.code(400);
        return { 
          error: 'missing_parameters',
          message: 'Gerekli parametreler eksik'
        };
      }

      const session = this.sessionManager.getSession(session_id);
      
      if (!session) {
        reply.code(400);
        return { 
          error: 'session_expired',
          message: 'Oturum süresi doldu - Kartınızı tekrar okutun'
        };
      }

      // Refresh available lockers for retry
      const availableLockers = await this.lockerStateManager.getAvailableLockers(kiosk_id);
      
      if (availableLockers.length === 0) {
        return { 
          error: 'no_lockers',
          message: 'Müsait dolap yok - Daha sonra deneyin'
        };
      }

      // Update session with new available lockers
      session.availableLockers = availableLockers.map(l => l.id);

      console.log(`🔄 Retry assignment for session ${session_id} with ${availableLockers.length} available lockers`);

      return {
        success: true,
        action: 'show_lockers',
        session_id: session.id,
        remaining_seconds: this.sessionManager.getRemainingTime(session.id),
        message: 'Farklı dolap seçin',
        lockers: availableLockers.map(locker => ({
          id: locker.id,
          status: locker.status,
          display_name: `Dolap ${locker.id}`
        }))
      };
    } catch (error) {
      console.error('Error retrying assignment:', error);
      reply.code(500);
      return { 
        error: 'server_error',
        message: 'Sistem hatası - Tekrar deneyin'
      };
    }
  }

  /**
   * Check if card has existing locker assignment (Requirement 2.1)
   */
  private async checkCardLocker(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { cardId } = request.params as { cardId: string };
      
      if (!cardId) {
        reply.code(400);
        return { error: 'cardId is required' };
      }

      console.log(`🔍 Checking existing locker for card: ${cardId}`);

      const existingLocker = await this.lockerStateManager.checkExistingOwnership(cardId, 'rfid');
      
      if (existingLocker) {
        return {
          hasLocker: true,
          lockerId: existingLocker.id,
          message: `Dolap ${existingLocker.id} zaten atanmış`
        };
      } else {
        return {
          hasLocker: false,
          message: 'Atanmış dolap yok'
        };
      }
    } catch (error) {
      console.error('Error checking card locker:', error);
      reply.code(500);
      return { 
        error: 'server_error',
        message: 'Sistem hatası - Tekrar deneyin'
      };
    }
  }

  /**
   * Assign locker to card (Requirement 2.4)
   */
  private async assignLocker(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { cardId, lockerId, kioskId } = request.body as { 
        cardId: string; 
        lockerId: number; 
        kioskId: string; 
      };
      
      if (!cardId || !lockerId || !kioskId) {
        reply.code(400);
        return { 
          error: 'missing_parameters',
          message: 'Gerekli parametreler eksik'
        };
      }

      console.log(`🎯 Assigning locker ${lockerId} to card ${cardId} on kiosk ${kioskId}`);

      // Assign locker to card
      const assigned = await this.lockerStateManager.assignLocker(kioskId, lockerId, 'rfid', cardId);
      
      if (!assigned) {
        console.error(`❌ Failed to assign locker ${lockerId} to card ${cardId}`);
        return { 
          success: false,
          error: 'assignment_failed',
          message: 'Dolap atanamadı - Farklı dolap seçin'
        };
      }

      console.log(`✅ Locker ${lockerId} assigned to card ${cardId}, attempting to open`);

      // Open the locker after successful assignment with enhanced error handling
      console.log(`🔧 Attempting to open locker ${lockerId} for card ${cardId}`);
      
      let opened = false;
      let hardwareError: string | null = null;
      
      try {
        opened = await this.modbusController.openLocker(lockerId);
      } catch (error) {
        hardwareError = error instanceof Error ? error.message : String(error);
        console.error(`❌ Hardware error opening locker ${lockerId}: ${hardwareError}`);
        opened = false;
      }
      
      if (opened) {
        // Confirm ownership after successful opening
        await this.lockerStateManager.confirmOwnership(kioskId, lockerId);
        
        console.log(`✅ Locker ${lockerId} successfully opened for card ${cardId}`);
        
        return { 
          success: true,
          lockerId,
          message: `Dolap ${lockerId} açıldı ve atandı`
        };
      } else {
        // Enhanced hardware failure handling - release the assignment (Requirement 4.5)
        console.error(`❌ Failed to open locker ${lockerId}, releasing assignment`);
        
        try {
          await this.lockerStateManager.releaseLocker(kioskId, lockerId, cardId);
          console.log(`✅ Successfully released assignment for locker ${lockerId}`);
        } catch (releaseError) {
          console.error(`❌ Failed to release locker assignment: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`);
          // Continue with error response even if release fails
        }
        
        // Determine appropriate error message based on hardware status (Requirement 4.4)
        const hardwareStatus = this.modbusController.getHardwareStatus();
        let errorMessage = 'Dolap açılamadı - Tekrar deneyin';
        let errorCode = 'hardware_failed';
        
        if (!hardwareStatus.available) {
          errorMessage = 'Sistem bakımda - Görevliye başvurun';
          errorCode = 'hardware_unavailable';
        } else if (hardwareError) {
          errorMessage = 'Bağlantı hatası - Tekrar deneyin';
          errorCode = 'connection_error';
        }
        
        return { 
          success: false,
          error: errorCode,
          message: errorMessage,
          hardware_status: {
            available: hardwareStatus.available,
            error_rate: hardwareStatus.diagnostics.errorRate,
            connection_errors: hardwareStatus.diagnostics.connectionErrors
          }
        };
      }
    } catch (error) {
      console.error('Error assigning locker:', error);
      reply.code(500);
      return { 
        success: false,
        error: 'server_error',
        message: 'Sistem hatası - Tekrar deneyin'
      };
    }
  }

  /**
   * Release locker assignment (Requirement 2.2)
   */
  private async releaseLocker(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { cardId, kioskId } = request.body as { 
        cardId: string; 
        kioskId: string; 
      };
      
      if (!cardId || !kioskId) {
        reply.code(400);
        return { 
          error: 'missing_parameters',
          message: 'Gerekli parametreler eksik'
        };
      }

      console.log(`🔓 Releasing locker for card ${cardId} on kiosk ${kioskId}`);

      // Find existing locker for this card
      const existingLocker = await this.lockerStateManager.checkExistingOwnership(cardId, 'rfid');
      
      if (!existingLocker) {
        return { 
          success: false,
          error: 'no_locker',
          message: 'Atanmış dolap bulunamadı'
        };
      }

      // Open the locker with enhanced error handling
      console.log(`🔧 Attempting to open locker ${existingLocker.id} for release`);
      
      let opened = false;
      let hardwareError: string | null = null;
      
      try {
        opened = await this.modbusController.openLocker(existingLocker.id);
      } catch (error) {
        hardwareError = error instanceof Error ? error.message : String(error);
        console.error(`❌ Hardware error opening locker ${existingLocker.id} for release: ${hardwareError}`);
        opened = false;
      }
      
      if (opened) {
        // Release the assignment
        await this.lockerStateManager.releaseLocker(kioskId, existingLocker.id, cardId);
        
        console.log(`✅ Locker ${existingLocker.id} opened and released for card ${cardId}`);
        
        return { 
          success: true,
          lockerId: existingLocker.id,
          message: `Dolap ${existingLocker.id} açıldı ve serbest bırakıldı`
        };
      } else {
        console.error(`❌ Failed to open locker ${existingLocker.id} for release`);
        
        // Determine appropriate error message based on hardware status (Requirement 4.4)
        const hardwareStatus = this.modbusController.getHardwareStatus();
        let errorMessage = 'Dolap açılamadı - Tekrar deneyin';
        let errorCode = 'hardware_failed';
        
        if (!hardwareStatus.available) {
          errorMessage = 'Sistem bakımda - Görevliye başvurun';
          errorCode = 'hardware_unavailable';
        } else if (hardwareError) {
          errorMessage = 'Bağlantı hatası - Tekrar deneyin';
          errorCode = 'connection_error';
        }
        
        return { 
          success: false,
          error: errorCode,
          message: errorMessage,
          hardware_status: {
            available: hardwareStatus.available,
            error_rate: hardwareStatus.diagnostics.errorRate
          }
        };
      }
    } catch (error) {
      console.error('Error releasing locker:', error);
      reply.code(500);
      return { 
        success: false,
        error: 'server_error',
        message: 'Sistem hatası - Tekrar deneyin'
      };
    }
  }

  /**
   * Setup hardware error handling listeners (Requirement 4.3, 4.5, 4.6)
   */
  private setupHardwareErrorHandling(): void {
    // Listen for hardware operation failures
    this.modbusController.on('hardware_operation_failed', async (event) => {
      console.error(`🔧 Hardware operation failed for locker ${event.lockerId}: ${event.error}`);
      
      // Set locker to error state and release any assignments
      try {
        await this.lockerStateManager.handleHardwareError(
          'kiosk-1', // TODO: Get actual kiosk ID from config
          event.lockerId,
          `Operation failed: ${event.error} (${event.totalAttempts} attempts)`
        );
      } catch (error) {
        console.error('Failed to handle hardware error in locker state:', error);
      }
    });

    // Listen for hardware unavailability
    this.modbusController.on('hardware_unavailable', async (event) => {
      console.error(`🔧 Hardware unavailable: ${event.error}`);
      
      if (event.lockerId) {
        try {
          await this.lockerStateManager.handleHardwareError(
            'kiosk-1', // TODO: Get actual kiosk ID from config
            event.lockerId,
            `Hardware unavailable: ${event.error}`
          );
        } catch (error) {
          console.error('Failed to handle hardware unavailability in locker state:', error);
        }
      }
    });

    // Listen for command errors
    this.modbusController.on('command_error', (event) => {
      console.error(`🔧 Hardware command error on channel ${event.channel}: ${event.error} (retry ${event.retryCount + 1})`);
    });

    // Listen for operation failures
    this.modbusController.on('operation_failed', (event) => {
      console.error(`🔧 Hardware operation failed: ${event.operation} on channel ${event.channel} (${event.error})`);
    });

    // Listen for health degradation
    this.modbusController.on('health_degraded', (event) => {
      console.warn(`🔧 Hardware health degraded: ${event.reason}`);
      console.warn(`🔧 Health status:`, event.health);
    });

    // Listen for reconnection events
    this.modbusController.on('reconnected', () => {
      console.log(`✅ Hardware reconnected successfully`);
    });

    this.modbusController.on('reconnection_failed', () => {
      console.error(`❌ Hardware reconnection failed`);
    });
  }

  /**
   * Get hardware status for monitoring (Requirement 4.6)
   */
  private async getHardwareStatus(request: FastifyRequest, reply: FastifyReply) {
    try {
      const hardwareStatus = this.modbusController.getHardwareStatus();
      const health = this.modbusController.getHealth();
      
      return {
        success: true,
        hardware: hardwareStatus,
        health: health,
        timestamp: new Date().toISOString(),
        relay_statuses: this.modbusController.getAllRelayStatuses()
      };
    } catch (error) {
      console.error('Error getting hardware status:', error);
      reply.code(500);
      return { 
        success: false,
        error: 'server_error',
        message: 'Donanım durumu alınamadı'
      };
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  public shutdown(): void {
    this.sessionManager.shutdown();
  }


}
