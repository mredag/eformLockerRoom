import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { LockerNamingService } from '../../../../shared/services/locker-naming-service';
import { ModbusController } from '../hardware/modbus-controller';
import { SessionManager } from './session-manager';
import { lockerLayoutService } from '../../../../shared/services/locker-layout-service';
import { getFeatureFlagService } from '../../../../shared/services/feature-flag-service';
import { AssignmentEngine } from '../../../../shared/services/assignment-engine';
import { getConfigurationManager } from '../../../../shared/services/configuration-manager';
import { DatabaseConnection } from '../../../../shared/database/connection';
import { get_rate_limiter } from '../../../../shared/services/rate-limiter';
import { check_locker_open_rate_limits, record_successful_operation } from '../../../../shared/middleware/rate-limit-middleware';
import { UI_MESSAGES, validateAndMapMessage } from '../../../../shared/constants/ui-messages';

export class UiController {
  private lockerStateManager: LockerStateManager;
  private modbusController: ModbusController;
  private lockerNamingService: LockerNamingService;
  private sessionManager: SessionManager;
  private featureFlagService = getFeatureFlagService();
  private assignmentEngine: AssignmentEngine;
  private rateLimiter = get_rate_limiter();
  private masterPin: string = '1234'; // TODO: Load from config
  private pinAttempts: Map<string, { count: number; lockoutEnd?: number }> = new Map();
  private readonly maxAttempts = 5;
  private readonly lockoutMinutes = 5;

  constructor(
    lockerStateManager: LockerStateManager,
    modbusController: ModbusController,
    lockerNamingService: LockerNamingService
  ) {
    this.lockerStateManager = lockerStateManager;
    this.modbusController = modbusController;
    this.lockerNamingService = lockerNamingService;
    
    // Initialize session manager with 30-second timeout (Requirement 3.1)
    this.sessionManager = new SessionManager({
      defaultTimeoutSeconds: 30, // Increased from 20 to 30 seconds per requirements
      cleanupIntervalMs: 5000,
      maxSessionsPerKiosk: 1
    });

    // Initialize assignment engine for smart assignment
    const db = DatabaseConnection.getInstance();
    const configManager = getConfigurationManager(db);
    this.assignmentEngine = new AssignmentEngine(db, lockerStateManager, configManager);

    this.setupSessionManagerEvents();
    this.setupHardwareErrorHandling();
    this.setupSensorlessMessageHandling();
  }

  /**
   * Get static configuration values for MVP
   * Task requirement: Use static windows for MVP: quarantine_min=20, reclaim_min=60
   */
  private getStaticMVPConfig() {
    return {
      quarantine_minutes: 20,
      reclaim_minutes: 60,
      session_limit_minutes: 180,
      return_hold_minutes: 15
    };
  }

  /**
   * Get the display name for a locker
   */
  private async getLockerDisplayName(kioskId: string, lockerId: number): Promise<string> {
    try {
      return await this.lockerNamingService.getDisplayName(kioskId, lockerId);
    } catch (error) {
      console.warn(`Failed to get display name for locker ${lockerId}, using default:`, error);
      return `Dolap ${lockerId}`;
    }
  }

  async registerRoutes(fastify: FastifyInstance) {
    // Serve static files
    await fastify.register(require('@fastify/static'), {
      root: join(__dirname, 'ui/static'),
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

    // Dynamic locker layout endpoints
    fastify.get('/api/ui/layout', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getLockerLayout(request, reply);
    });

    fastify.get('/api/ui/tiles', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getLockerTiles(request, reply);
    });

    // User report endpoint for suspected occupied lockers
    fastify.post('/api/user/report-occupied', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.reportOccupiedLocker(request, reply);
    });

    // Rate limit status endpoint for monitoring
    fastify.get('/api/rate-limit/status', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getRateLimitStatus(request, reply);
    });

    // Feature flag status endpoint for UI
    fastify.get('/api/feature-flags/smart-assignment', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getSmartAssignmentStatus(request, reply);
    });

    // Register enhanced feedback routes
    await this.registerEnhancedFeedbackRoutes(fastify);
  }

  private async serveUI(request: FastifyRequest, reply: FastifyReply) {
    try {
      const htmlPath = join(__dirname, 'ui/index.html');
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
      const { card_id, kiosk_id, timestamp } = request.body as { 
        card_id: string; 
        kiosk_id: string; 
        timestamp?: string;
      };
      
      if (!card_id || !kiosk_id) {
        reply.code(400);
        return { error: 'card_id and kiosk_id are required' };
      }

      request.log.info({ action: 'card_scanned', kiosk_id }, 'Card scanned on kiosk');

      // Check card-based rate limiting before assignment
      const card_rate_check = await this.rateLimiter.check_card_rate(card_id, kiosk_id);
      if (!card_rate_check.allowed) {
        request.log.warn({ 
          action: 'rate_limit_exceeded', 
          type: card_rate_check.type, 
          key: card_rate_check.key,
          kiosk_id 
        }, 'Rate limit exceeded');
        
        const response = {
          success: false,
          error: 'rate_limit_exceeded',
          type: card_rate_check.type,
          key: card_rate_check.key,
          message: card_rate_check.message,
          retry_after_seconds: card_rate_check.retry_after_seconds
        };
        
        // Log API response as required
        request.log.info({ action: 'rate_limit', message: response.message }, 'API response');
        
        reply.code(429);
        return response;
      }

      // Record card scan for sensorless retry detection
      this.modbusController.recordCardScan(card_id);

      // Check feature flag to determine assignment mode
      const smartAssignmentEnabled = await this.featureFlagService.isSmartAssignmentEnabled(kiosk_id);
      request.log.info({ 
        action: 'feature_flag_check', 
        smart_assignment_enabled: smartAssignmentEnabled,
        kiosk_id 
      }, `Smart assignment ${smartAssignmentEnabled ? 'enabled' : 'disabled'} for kiosk`);

      if (smartAssignmentEnabled) {
        // Route to smart assignment engine
        request.log.info({ action: 'smart_assignment_start', kiosk_id }, 'Smart assignment mode - routing to assignment engine');
        
        try {
          const assignmentResult = await this.assignmentEngine.assignLocker({
            cardId: card_id,
            kioskId: kiosk_id,
            timestamp: timestamp ? new Date(timestamp) : new Date()
          });

          if (assignmentResult.success && assignmentResult.lockerId) {
            // Check all rate limits before relay command
            const rate_limit_check = await this.rateLimiter.check_all_limits(card_id, assignmentResult.lockerId, kiosk_id);
            if (!rate_limit_check.allowed) {
              request.log.warn({ 
                action: 'rate_limit_exceeded', 
                type: rate_limit_check.type, 
                key: rate_limit_check.key,
                kiosk_id,
                locker_id: assignmentResult.lockerId
              }, 'Rate limit exceeded for smart assignment');
              
              const response = {
                success: false,
                error: 'rate_limit_exceeded',
                type: rate_limit_check.type,
                key: rate_limit_check.key,
                message: rate_limit_check.message,
                retry_after_seconds: rate_limit_check.retry_after_seconds,
                mode: 'smart'
              };
              
              // Log API response as required
              request.log.info({ action: 'rate_limit', message: response.message }, 'API response');
              
              return response;
            }

            // Attempt to open the assigned locker
            let hardwareSuccess = false;
            let hardwareError: string | null = null;
            
            try {
              // Use sensorless retry handler for smart assignment
              const retryResult = await this.modbusController.openLockerWithSensorlessRetry(
                assignmentResult.lockerId, 
                card_id
              );
              
              hardwareSuccess = retryResult.success;
              
              if (!hardwareSuccess) {
                hardwareError = `Sensorless open failed: ${retryResult.action}`;
                request.log.error({ 
                  action: 'sensorless_open_failed', 
                  locker_id: assignmentResult.lockerId,
                  retry_action: retryResult.action,
                  message: retryResult.message,
                  kiosk_id
                }, 'Sensorless open failed for assigned locker');
              } else {
                request.log.info({ 
                  action: 'sensorless_open_success', 
                  locker_id: assignmentResult.lockerId,
                  retry_action: retryResult.action,
                  kiosk_id
                }, 'Sensorless open successful for assigned locker');
              }
            } catch (error) {
              hardwareError = error instanceof Error ? error.message : String(error);
              request.log.error({ 
                action: 'hardware_error', 
                locker_id: assignmentResult.lockerId,
                error: hardwareError,
                kiosk_id
              }, 'Hardware error opening assigned locker');
            }

            if (hardwareSuccess) {
              // Record successful operation for rate limiting
              await record_successful_operation(card_id, assignmentResult.lockerId, 'open', kiosk_id);
              
              request.log.info({ 
                action: 'smart_assignment_success', 
                locker_id: assignmentResult.lockerId,
                assignment_action: assignmentResult.action,
                kiosk_id
              }, 'Smart assignment successful: locker opened');
              
              const response = {
                success: true,
                action: assignmentResult.action,
                locker_id: assignmentResult.lockerId,
                message: assignmentResult.message,
                mode: 'smart',
                session_id: assignmentResult.sessionId
              };
              
              // Log API response as required
              request.log.info({ action: response.action, message: response.message }, 'API response');
              
              return response;
            } else {
              // Hardware failure - need to release the assignment
              try {
                await this.lockerStateManager.releaseLocker(kiosk_id, assignmentResult.lockerId, card_id);
                request.log.info({ 
                  action: 'assignment_released', 
                  locker_id: assignmentResult.lockerId,
                  reason: 'hardware_failure',
                  kiosk_id
                }, 'Released locker assignment due to hardware failure');
              } catch (releaseError) {
                request.log.error({ 
                  action: 'release_failed', 
                  locker_id: assignmentResult.lockerId,
                  error: releaseError instanceof Error ? releaseError.message : String(releaseError),
                  kiosk_id
                }, 'Failed to release locker after hardware failure');
              }

              const response = {
                success: false,
                error: 'hardware_failure',
                message: UI_MESSAGES.error,
                mode: 'smart'
              };
              
              // Log API response as required
              request.log.info({ action: 'hardware_failure', message: response.message }, 'API response');
              
              return response;
            }
          } else {
            // Assignment failed (no stock, etc.)
            const response = {
              success: false,
              error: assignmentResult.errorCode || 'assignment_failed',
              message: assignmentResult.message,
              mode: 'smart'
            };
            
            // Log API response as required
            request.log.info({ action: assignmentResult.action, message: response.message }, 'API response');
            
            return response;
          }
        } catch (error) {
          request.log.error({ 
            action: 'assignment_engine_error', 
            error: error instanceof Error ? error.message : String(error),
            kiosk_id
          }, 'Smart assignment engine error');
          
          const response = {
            success: false,
            error: 'assignment_engine_error',
            message: UI_MESSAGES.error,
            mode: 'smart'
          };
          
          // Log API response as required
          request.log.info({ action: 'assignment_engine_error', message: response.message }, 'API response');
          
          return response;
        }
      }

      // Continue with manual assignment mode (backward compatibility)
      request.log.info({ action: 'manual_mode_start', kiosk_id }, 'Manual assignment mode - showing locker selection');

      // Requirement 2.1: Check if card already has a locker assigned
      const existingLocker = await this.lockerStateManager.checkExistingOwnership(card_id, 'rfid');
      
      if (existingLocker) {
        // Check all rate limits before relay command for existing locker
        const rate_limit_check = await this.rateLimiter.check_all_limits(card_id, existingLocker.id, kiosk_id);
        if (!rate_limit_check.allowed) {
          request.log.warn({ 
            action: 'rate_limit_exceeded', 
            type: rate_limit_check.type, 
            key: rate_limit_check.key,
            locker_id: existingLocker.id,
            kiosk_id
          }, 'Rate limit exceeded for existing locker');
          
          const response = {
            success: false,
            error: 'rate_limit_exceeded',
            type: rate_limit_check.type,
            key: rate_limit_check.key,
            message: rate_limit_check.message,
            retry_after_seconds: rate_limit_check.retry_after_seconds,
            mode: 'manual'
          };
          
          // Log API response as required
          request.log.info({ action: 'rate_limit', message: response.message }, 'API response');
          
          return response;
        }

        // Requirement 2.2: Open existing locker and release assignment with enhanced error handling
        request.log.info({ 
          action: 'opening_existing_locker', 
          locker_id: existingLocker.id,
          kiosk_id
        }, 'Opening existing locker');
        
        let success = false;
        let hardwareError: string | null = null;
        
        try {
          success = await this.modbusController.openLocker(existingLocker.id);
        } catch (error) {
          hardwareError = error instanceof Error ? error.message : String(error);
          request.log.error({ 
            action: 'hardware_error', 
            locker_id: existingLocker.id,
            error: hardwareError,
            kiosk_id
          }, 'Hardware error opening existing locker');
          success = false;
        }
        
        if (success) {
          // Record successful operation for rate limiting
          await record_successful_operation(card_id, existingLocker.id, 'open', kiosk_id);
          
          await this.lockerStateManager.releaseLocker(existingLocker.kiosk_id, existingLocker.id, card_id);
          request.log.info({ 
            action: 'existing_locker_success', 
            locker_id: existingLocker.id,
            kiosk_id
          }, 'Locker opened and released');
          
          const lockerName = await this.getLockerDisplayName(existingLocker.kiosk_id, existingLocker.id);
          const response = { 
            success: true,
            action: 'open_existing', 
            locker_id: existingLocker.id,
            message: UI_MESSAGES.success_existing,
            mode: 'manual'
          };
          
          // Log API response as required
          request.log.info({ action: response.action, message: response.message }, 'API response');
          
          return response;
        } else {
          request.log.error({ 
            action: 'existing_locker_failed', 
            locker_id: existingLocker.id,
            hardware_error: hardwareError,
            kiosk_id
          }, 'Failed to open existing locker');
          
          // Determine appropriate error message based on hardware status (Requirement 4.4)
          const hardwareStatus = this.modbusController.getHardwareStatus();
          let errorMessage = UI_MESSAGES.error;
          let errorCode = 'failed_open';
          
          if (!hardwareStatus.available) {
            errorMessage = UI_MESSAGES.error;
            errorCode = 'hardware_unavailable';
          } else if (hardwareError) {
            errorMessage = UI_MESSAGES.error;
            errorCode = 'connection_error';
          }
          
          const response = { 
            success: false,
            error: errorCode,
            message: errorMessage,
            mode: 'manual',
            hardware_status: {
              available: hardwareStatus.available,
              error_rate: hardwareStatus.diagnostics.errorRate
            }
          };
          
          // Log API response as required
          request.log.info({ action: errorCode, message: response.message }, 'API response');
          
          return response;
        }
      } else {
        // Requirement 2.3: Show available lockers for selection
        const availableLockers = await this.lockerStateManager.getEnhancedAvailableLockers(kiosk_id);
        
        if (availableLockers.length === 0) {
          request.log.warn({ 
            action: 'no_available_lockers', 
            kiosk_id
          }, 'No available lockers for kiosk');
          
          const response = { 
            success: false,
            error: 'no_lockers',
            message: UI_MESSAGES.no_stock,
            mode: 'manual'
          };
          
          // Log API response as required
          request.log.info({ action: 'no_lockers', message: response.message }, 'API response');
          
          return response;
        }

        // Cancel any existing session for this kiosk (Requirement 3.5)
        const existingSession = this.sessionManager.getKioskSession(kiosk_id);
        if (existingSession) {
          this.sessionManager.cancelSession(existingSession.id, 'Yeni kart okundu');
          request.log.info({ 
            action: 'session_cancelled', 
            session_id: existingSession.id,
            reason: 'new_card_scan',
            kiosk_id
          }, 'Cancelled existing session for new card scan');
        }

        // Create a 30-second session (Requirement 3.1)
        const session = this.sessionManager.createSession(
          kiosk_id, 
          card_id, 
          availableLockers.map(l => l.id)
        );

        request.log.info({ 
          action: 'session_created', 
          session_id: session.id,
          available_lockers_count: availableLockers.length,
          kiosk_id
        }, 'Created session with available lockers');

        const response = {
          success: true,
          action: 'show_lockers',
          session_id: session.id,
          timeout_seconds: session.timeoutSeconds,
          message: validateAndMapMessage('Kart okundu. Dolap seçin'),
          mode: 'manual',
          lockers: availableLockers.map(locker => ({
            id: locker.id,
            status: locker.status,
            display_name: locker.displayName
          }))
        };
        
        // Log API response as required
        request.log.info({ action: response.action, message: response.message }, 'API response');
        
        return response;
      }
    } catch (error) {
      request.log.error({ 
        action: 'card_scan_error', 
        error: error instanceof Error ? error.message : String(error),
        kiosk_id
      }, 'Error handling card scan');
      
      const response = { 
        success: false,
        error: 'error_server',
        message: UI_MESSAGES.error,
        mode: 'unknown'
      };
      
      // Log API response as required
      request.log.info({ action: 'error_server', message: response.message }, 'API response');
      
      reply.code(500);
      return response;
    }
  }

  private async getAvailableLockers(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kioskId } = request.query as { kioskId: string };
      
      if (!kioskId) {
        reply.code(400);
        return { error: 'kioskId is required' };
      }

      const lockers = await this.lockerStateManager.getEnhancedAvailableLockers(kioskId);
      
      if (lockers.length === 0) {
        return {
          lockers: [],
          sessionId: null,
          timeoutSeconds: 0,
          message: 'Müsait dolap yok'
        };
      }

      // Create a proper session for locker selection
      const sessionId = `temp-${Date.now()}`;
      const availableLockersList = lockers.map(locker => ({
        id: locker.id,
        status: this.normalizeStatusForUI(locker.status),
        displayName: locker.displayName,
        is_vip: locker.is_vip
      }));
      
      // Create session data matching RfidSession interface
      const sessionData = {
        id: sessionId,
        kioskId,
        cardId: 'manual', // Use 'manual' instead of null for manual selection
        startTime: new Date(),
        timeoutSeconds: 30,
        status: 'active' as const,
        availableLockers: availableLockersList.map(l => l.id)
      };
      
      // Store the session manually in session manager
      // Using the internal sessions Map directly since createSession expects cardId
      (this.sessionManager as any).sessions.set(sessionId, sessionData);
      
      return {
        lockers: availableLockersList,
        sessionId,
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

      const lockers = await this.lockerStateManager.getEnhancedKioskLockers(kiosk_id);
      
      return lockers.map(locker => ({
        id: locker.id,
        status: this.normalizeStatusForUI(locker.status),
        displayName: locker.displayName,
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

      // Check rate limits before assignment and relay command
      const rate_limit_check = await this.rateLimiter.check_all_limits(cardId, locker_id, kiosk_id);
      if (!rate_limit_check.allowed) {
        console.log(`Rate limit exceeded: type=${rate_limit_check.type}, key=${rate_limit_check.key}`);
        return {
          error: 'rate_limit_exceeded',
          type: rate_limit_check.type,
          key: rate_limit_check.key,
          message: rate_limit_check.message,
          retry_after_seconds: rate_limit_check.retry_after_seconds
        };
      }

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
        // Record successful operation for rate limiting
        await record_successful_operation(cardId, locker_id, 'open', kiosk_id);
        
        // Confirm ownership after successful opening
        await this.lockerStateManager.confirmOwnership(kiosk_id, locker_id);
        
        // Requirement 3.3: Complete session immediately after successful selection
        this.sessionManager.completeSession(session_id, locker_id);
        
        console.log(`✅ Locker ${locker_id} successfully opened for card ${cardId}`);
        
        // Requirement 2.6: Return to idle state after completion
        const lockerName = await this.getLockerDisplayName(kiosk_id, locker_id);
        return { 
          success: true, 
          action: 'assignment_complete',
          locker_id,
          message: `${lockerName} açıldı ve atandı`
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

      // Check command cooldown for master operations
      const command_cooldown_check = await this.rateLimiter.check_command_cooldown(kiosk_id);
      if (!command_cooldown_check.allowed) {
        console.log(`Rate limit exceeded: type=${command_cooldown_check.type}, key=${command_cooldown_check.key}`);
        return {
          error: 'rate_limit_exceeded',
          type: command_cooldown_check.type,
          key: command_cooldown_check.key,
          message: command_cooldown_check.message,
          retry_after_seconds: command_cooldown_check.retry_after_seconds
        };
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
        // Record command for rate limiting
        await record_successful_operation('master', locker_id, 'command', kiosk_id);
        
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

  private async reportOccupiedLocker(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { card_id, locker_id, kiosk_id } = request.body as { 
        card_id: string; 
        locker_id: number; 
        kiosk_id: string 
      };
      
      if (!card_id || !locker_id || !kiosk_id) {
        reply.code(400);
        return { 
          error: 'missing_parameters',
          message: 'Card ID, Locker ID ve Kiosk ID gerekli'
        };
      }

      // Check user report rate limiting
      const report_rate_check = await this.rateLimiter.check_user_report_rate(card_id, kiosk_id);
      if (!report_rate_check.allowed) {
        console.log(`Rate limit exceeded: type=${report_rate_check.type}, key=${report_rate_check.key}`);
        return {
          success: false,
          error: 'rate_limit_exceeded',
          type: report_rate_check.type,
          key: report_rate_check.key,
          message: report_rate_check.message,
          retry_after_seconds: report_rate_check.retry_after_seconds
        };
      }

      // Record the user report
      await record_successful_operation(card_id, locker_id, 'report', kiosk_id);
      
      // Log the report
      console.log(`📋 User report: Card ${card_id} reported locker ${locker_id} as occupied on kiosk ${kiosk_id}`);
      
      // TODO: Implement actual report handling logic
      // This would typically:
      // 1. Mark locker as suspected occupied
      // 2. Trigger admin notification
      // 3. Assign alternative locker to user
      
      return {
        success: true,
        message: 'Rapor alındı. Yeni dolap atanıyor...',
        reported_locker: locker_id
      };
    } catch (error) {
      console.error('Error reporting occupied locker:', error);
      reply.code(500);
      return { 
        error: 'server_error',
        message: 'Rapor gönderilemedi - Tekrar deneyin'
      };
    }
  }

  private async getRateLimitStatus(request: FastifyRequest, reply: FastifyReply) {
    try {
      const rate_limiter = get_rate_limiter();
      const recent_violations = rate_limiter.get_recent_violations(10);
      const state = rate_limiter.get_state();
      
      return {
        success: true,
        recent_violations: recent_violations.map(v => ({
          type: v.type,
          key: v.key,
          timestamp: v.timestamp,
          retry_after: v.retry_after
        })),
        active_rate_limits: {
          card_count: Object.keys(state.card_last_open).length,
          locker_count: Object.keys(state.locker_open_history).length,
          user_report_count: Object.keys(state.user_report_history).length,
          last_command_time: state.last_command_time
        }
      };
    } catch (error) {
      console.error('Error getting rate limit status:', error);
      reply.code(500);
      return { 
        error: 'server_error',
        message: 'Rate limit durumu alınamadı.'
      };
    }
  }

  private async getSmartAssignmentStatus(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kiosk_id } = request.query as { kiosk_id: string };
      
      if (!kiosk_id) {
        reply.code(400);
        return { error: 'kiosk_id is required' };
      }

      const smartAssignmentEnabled = await this.featureFlagService.isSmartAssignmentEnabled(kiosk_id);
      
      return {
        success: true,
        kiosk_id,
        smart_assignment_enabled: smartAssignmentEnabled,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting smart assignment status:', error);
      reply.code(500);
      return { 
        error: 'server_error',
        message: 'Smart assignment durumu alınamadı.'
      };
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
      const availableLockers = await this.lockerStateManager.getEnhancedAvailableLockers(kiosk_id);
      
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
          display_name: locker.displayName
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
        
        const lockerName = await this.getLockerDisplayName(kioskId, lockerId);
        return { 
          success: true,
          lockerId,
          message: `${lockerName} açıldı ve atandı`
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
        
        const lockerName = await this.getLockerDisplayName(kioskId, existingLocker.id);
        return { 
          success: true,
          lockerId: existingLocker.id,
          message: `${lockerName} açıldı ve serbest bırakıldı`
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
   * Setup sensorless message handling listeners (Requirements 6.5)
   */
  private setupSensorlessMessageHandling(): void {
    // Listen for sensorless retry messages
    this.modbusController.on('sensorless_message', (event) => {
      console.log(`📱 Sensorless message for locker ${event.lockerId}: ${event.message} (${event.type})`);
      
      // Emit message event for UI to display
      // This could be picked up by WebSocket or other real-time communication
      this.emit('display_message', {
        lockerId: event.lockerId,
        cardId: event.cardId,
        message: event.message,
        type: event.type,
        timestamp: event.timestamp,
        duration: event.type === 'retry' ? 2000 : 5000 // Show retry message for 2s, others for 5s
      });
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
   * Public method to get hardware status (for health endpoint)
   */
  public getHardwareStatusForHealth() {
    return this.modbusController.getHardwareStatus();
  }

  /**
   * Test hardware connectivity
   */
  public async testHardwareConnectivity() {
    return await this.modbusController.testHardwareConnectivity();
  }

  /**
   * Normalize database status values to UI-friendly status values
   */
  private normalizeStatusForUI(dbStatus: string): string {
    switch (dbStatus) {
      case 'Free':
      case 'Boş':
        return 'available';
      case 'Dolu':
      case 'Occupied':
        return 'occupied';
      case 'Engelli':
      case 'Disabled':
      case 'Blocked':
        return 'disabled';
      case 'Açılıyor':
      case 'Opening':
        return 'opening';
      case 'Hata':
      case 'Error':
        return 'error';
      default:
        console.warn(`Unknown status: ${dbStatus}, defaulting to 'error'`);
        return 'error';
    }
  }

  /**
   * Get dynamic locker layout based on hardware configuration
   */
  private async getLockerLayout(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kioskId, kiosk_id } = request.query as { kioskId?: string; kiosk_id?: string };
      const defaultKioskId = kioskId || kiosk_id || 'kiosk-1'; // Support both parameter names
      
      const layout = await lockerLayoutService.generateLockerLayout(defaultKioskId);
      const stats = await lockerLayoutService.getHardwareStats();
      const gridCSS = await lockerLayoutService.generateGridCSS();

      return {
        success: true,
        layout,
        stats,
        gridCSS
      };
    } catch (error) {
      console.error('Error getting locker layout:', error);
      reply.code(500);
      return {
        success: false,
        error: 'Failed to get locker layout'
      };
    }
  }

  /**
   * Get HTML tiles for kiosk interface
   */
  private async getLockerTiles(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kioskId, kiosk_id } = request.query as { kioskId?: string; kiosk_id?: string };
      const defaultKioskId = kioskId || kiosk_id || 'kiosk-1'; // Support both parameter names
      
      const tilesHTML = await lockerLayoutService.generateKioskTiles(defaultKioskId);
      
      reply.type('text/html');
      return tilesHTML;
    } catch (error) {
      console.error('Error generating locker tiles:', error);
      reply.code(500);
      reply.type('text/html');
      return '<div class="error">Failed to generate locker tiles</div>';
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  public shutdown(): void {
    this.sessionManager.shutdown();
  }


}
