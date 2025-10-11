import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { LockerNamingService } from '../../../../shared/services/locker-naming-service';
import { ModbusController } from '../hardware/modbus-controller';
import { SessionManager } from './session-manager';
import { lockerLayoutService } from '../../../../shared/services/locker-layout-service';
import { ConfigManager } from '../../../../shared/services/config-manager';
import { LockerAssignmentMode } from '../../../../shared/types/system-config';
import { RfidUserFlow, UserFlowResult } from '../services/rfid-user-flow';
import { Locker, RfidScanEvent } from '@eform/shared/types/core-entities';

const ENFORCED_MIN_CARD_SIGNIFICANT_DIGITS = 8;
const MAX_STANDARDIZED_LENGTH = 64;
const CONFIRMATION_WINDOW_MS = 4000;

type ShortScanState = {
  expiresAt: number;
  confirmation?: {
    uid: string;
    expiresAt: number;
  };
};

class CardValidationError extends Error {
  public readonly code: 'INVALID_UID' | 'SHORT_UID' | 'CONFIRMATION_REQUIRED' | 'CONFIRMATION_MISMATCH';
  public readonly details?: Record<string, any>;

  constructor(
    code: 'INVALID_UID' | 'SHORT_UID' | 'CONFIRMATION_REQUIRED' | 'CONFIRMATION_MISMATCH',
    message: string,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'CardValidationError';
    this.code = code;
    this.details = details;
  }
}

export class UiController {
  private lockerStateManager: LockerStateManager;
  private modbusController: ModbusController;
  private lockerNamingService: LockerNamingService;
  private sessionManager: SessionManager;
  private configManager: ConfigManager;
  private configInitPromise: Promise<void> | null = null;
  private rfidUserFlow: RfidUserFlow | null = null;
  private masterPin: string = '1234'; // TODO: Load from config
  private pinAttempts: Map<string, { count: number; lockoutEnd?: number }> = new Map();
  private readonly maxAttempts = 5;
  private readonly lockoutMinutes = 5;
  private shortScanStates: Map<string, ShortScanState> = new Map();

  constructor(
    lockerStateManager: LockerStateManager,
    modbusController: ModbusController,
    lockerNamingService: LockerNamingService,
    rfidUserFlow?: RfidUserFlow
  ) {
    this.lockerStateManager = lockerStateManager;
    this.modbusController = modbusController;
    this.lockerNamingService = lockerNamingService;
    this.rfidUserFlow = rfidUserFlow ?? null;
    this.configManager = ConfigManager.getInstance();
    this.configInitPromise = this.configManager.initialize().catch(error => {
      console.warn('Failed to initialize configuration manager for UI controller:', error);
    });

    // Initialize session manager with 30-second timeout (Requirement 3.1)
    this.sessionManager = new SessionManager({
      defaultTimeoutSeconds: 30, // Increased from 20 to 30 seconds per requirements
      cleanupIntervalMs: 5000,
      maxSessionsPerKiosk: 1
    });

    this.setupSessionManagerEvents();
    this.setupHardwareErrorHandling();
  }

  private standardizeCardId(
    raw: string
  ): { standardized: string; significantLength: number; totalLength: number; effectiveLength: number } | null {
    if (!raw || typeof raw !== 'string') {
      return null;
    }

    let standardized = raw.replace(/[^a-fA-F0-9]/g, '').toUpperCase();

    if (standardized.length === 0) {
      return null;
    }

    if (standardized.length % 2 !== 0) {
      standardized = `0${standardized}`;
    }

    if (standardized.length > MAX_STANDARDIZED_LENGTH) {
      standardized = standardized.substring(0, MAX_STANDARDIZED_LENGTH);
    }

    const trimmed = standardized.replace(/^0+/, '');
    const significantLength = trimmed.length;
    const totalLength = standardized.length;
    const effectiveLength = significantLength > 0 ? Math.max(significantLength, totalLength) : 0;

    return {
      standardized,
      significantLength,
      totalLength,
      effectiveLength
    };
  }

  private hashCardId(standardized: string): string {
    return createHash('sha256').update(standardized).digest('hex').substring(0, 16);
  }

  private clearExpiredShortScanState(kioskId: string, now: number): void {
    const state = this.shortScanStates.get(kioskId);
    if (state && state.expiresAt < now) {
      this.shortScanStates.delete(kioskId);
    }
  }

  private enforceShortScanConfirmation(kioskId: string, standardized: string, now: number): void {
    const state = this.shortScanStates.get(kioskId);

    if (!state) {
      return;
    }

    if (state.expiresAt < now) {
      this.shortScanStates.delete(kioskId);
      return;
    }

    if (!state.confirmation || state.confirmation.expiresAt < now) {
      state.confirmation = {
        uid: standardized,
        expiresAt: now + CONFIRMATION_WINDOW_MS
      };

      throw new CardValidationError('CONFIRMATION_REQUIRED', 'RFID confirmation required before proceeding', {
        standardized_uid_hex: standardized
      });
    }

    if (state.confirmation.uid !== standardized) {
      state.confirmation = {
        uid: standardized,
        expiresAt: now + CONFIRMATION_WINDOW_MS
      };

      throw new CardValidationError('CONFIRMATION_MISMATCH', 'RFID confirmation mismatch detected', {
        standardized_uid_hex: standardized
      });
    }

    this.shortScanStates.delete(kioskId);
  }

  private normalizeCardId(
    cardId: string,
    kioskId: string,
    rawUidHex?: string | null
  ): {
    ownerKey: string;
    standardizedUid?: string;
    significantLength?: number;
    totalLength?: number;
    effectiveLength?: number;
  } {
    const now = Date.now();

    if (!rawUidHex && /^[0-9a-f]{16}$/i.test(cardId)) {
      this.clearExpiredShortScanState(kioskId, now);
      this.shortScanStates.delete(kioskId);
      return { ownerKey: cardId.toLowerCase() };
    }

    const source = rawUidHex ?? cardId;
    const standardization = this.standardizeCardId(source);

    if (!standardization) {
      throw new CardValidationError('INVALID_UID', 'RFID input did not contain hexadecimal digits', {
        raw_uid_hex: source
      });
    }

    if (standardization.effectiveLength < ENFORCED_MIN_CARD_SIGNIFICANT_DIGITS) {
      this.shortScanStates.set(kioskId, { expiresAt: now + CONFIRMATION_WINDOW_MS });
      throw new CardValidationError('SHORT_UID', 'RFID input below minimum length', {
        standardized_uid_hex: standardization.standardized,
        significant_length: standardization.significantLength,
        effective_length: standardization.effectiveLength,
        total_length: standardization.totalLength
      });
    }

    this.enforceShortScanConfirmation(kioskId, standardization.standardized, now);

    const ownerKey = this.hashCardId(standardization.standardized);

    return {
      ownerKey,
      standardizedUid: standardization.standardized,
      significantLength: standardization.significantLength,
      totalLength: standardization.totalLength,
      effectiveLength: standardization.effectiveLength
    };
  }

  setRfidUserFlow(flow: RfidUserFlow): void {
    this.rfidUserFlow = flow;
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

  private async formatLockersForResponse(kioskId: string, lockers: Locker[]): Promise<Array<{
    id: number;
    status: string;
    display_name: string;
    is_vip: boolean;
  }>> {
    return await Promise.all(
      lockers.map(async locker => {
        const displayName = locker.display_name
          || (locker as any).displayName
          || await this.getLockerDisplayName(kioskId, locker.id);

        return {
          id: locker.id,
          status: locker.status,
          display_name: displayName,
          is_vip: locker.is_vip
        };
      })
    );
  }

  private async ensureConfigInitialized(): Promise<void> {
    if (!this.configInitPromise) {
      this.configInitPromise = this.configManager.initialize().catch(error => {
        console.warn('Failed to initialize configuration manager for UI controller:', error);
      });
    }

    try {
      await this.configInitPromise;
    } catch (error) {
      console.warn('Configuration manager initialization previously failed:', error);
    }
  }

  private async getAssignmentMode(kioskId: string): Promise<LockerAssignmentMode> {
    await this.ensureConfigInitialized();
    return this.configManager.getKioskAssignmentMode(kioskId);
  }

  private async resolveZoneFilter(zone?: string): Promise<string | undefined> {
    if (!zone) {
      return undefined;
    }

    await this.ensureConfigInitialized();
    const config = this.configManager.getConfiguration();

    if (!config.features?.zones_enabled || !config.zones) {
      console.warn(`Zone filter "${zone}" requested but zones are disabled in configuration.`);
      return undefined;
    }

    const normalizedZone = config.zones.find(z => z.id === zone && z.enabled);

    if (!normalizedZone) {
      console.warn(`Zone filter "${zone}" requested but not found or disabled.`);
      return undefined;
    }

    return normalizedZone.id;
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

    // Open owned locker again without releasing ownership (Idea 5)
    fastify.post('/api/locker/open-again', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.openLockerAgain(request, reply);
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
    const { card_id, kiosk_id, zone, zone_id, raw_uid_hex } = request.body as {
      card_id: string;
      kiosk_id: string;
      zone?: string;
      zone_id?: string;
      raw_uid_hex?: string;
    };

    const requestedZone = zone ?? zone_id;

    if (!card_id || !kiosk_id) {
      reply.code(400);
      return { error: 'card_id and kiosk_id are required' };
    }

    try {
      const normalized = this.normalizeCardId(card_id, kiosk_id, raw_uid_hex);
      return await this.processCardScan(normalized.ownerKey, kiosk_id, requestedZone, normalized.standardizedUid);
    } catch (error) {
      if (error instanceof CardValidationError) {
        reply.code(400);
        console.warn('RFID validation failed:', {
          kiosk_id,
          reason: error.code,
          details: error.details
        });

        return {
          error: 'rfid_validation_failed',
          message: 'Kart okunamadı - Tekrar deneyin',
          reason: error.code,
          details: error.details
        };
      }

      console.error('Error handling card scan:', error);
      reply.code(500);
      return {
        error: 'error_server',
        message: 'Sistem hatası - Tekrar deneyin'
      };
    }
  }

  private async processCardScan(cardId: string, kioskId: string, requestedZone?: string, rawUidHex?: string | null) {
    console.log(`🎯 Card scanned: ${cardId} on kiosk ${kioskId}${requestedZone ? ` (zone: ${requestedZone})` : ''}${rawUidHex ? ` raw=${rawUidHex}` : ''}`);

    const zoneFilter = await this.resolveZoneFilter(requestedZone);

    if (!this.rfidUserFlow) {
      throw new Error('RFID user flow not initialized');
    }

    const scanEvent: RfidScanEvent = {
      card_id: cardId,
      scan_time: new Date(),
      reader_id: 'kiosk-ui',
      raw_uid_hex: rawUidHex ?? undefined,
      standardized_uid_hex: rawUidHex ?? undefined
    };

    let flowResult: UserFlowResult;
    try {
      flowResult = await this.rfidUserFlow.handleCardScanned(scanEvent, { zoneId: zoneFilter });
    } catch (error) {
      console.error('Error executing RFID user flow for card scan:', error);
      throw error;
    }

    if (!flowResult.success) {
      return {
        success: false,
        action: flowResult.action ?? 'error',
        error: flowResult.error_code || flowResult.fallback_reason || 'flow_failed',
        message: flowResult.message,
        assignment_mode: flowResult.assignment_mode,
        auto_assigned: flowResult.auto_assigned ?? false,
        fallback_reason: flowResult.fallback_reason,
        debug_logs: flowResult.debug_logs
      };
    }

    if (flowResult.action === 'open_locker') {
      const lockerId = flowResult.opened_locker ?? (flowResult as any).openedLocker ?? null;
      return {
        success: true,
        action: 'open_locker',
        locker_id: lockerId ?? undefined,
        message: flowResult.message,
        assignment_mode: flowResult.assignment_mode,
        auto_assigned: flowResult.auto_assigned ?? false,
        debug_logs: flowResult.debug_logs
      };
    }

    if (flowResult.action === 'show_lockers') {
      const availableLockers = flowResult.available_lockers ?? [];

      if (availableLockers.length === 0) {
        console.log(`⚠️ No available lockers for kiosk ${kioskId}`);
        return {
          success: false,
          action: 'error',
          error: 'no_lockers',
          message: zoneFilter
            ? `Müsait dolap yok (${zoneFilter})`
            : 'Müsait dolap yok - Daha sonra deneyin',
          assignment_mode: flowResult.assignment_mode,
          auto_assigned: flowResult.auto_assigned ?? false,
          fallback_reason: flowResult.fallback_reason,
          debug_logs: flowResult.debug_logs
        };
      }

      const existingSession = this.sessionManager.getKioskSession(kioskId);
      if (existingSession) {
        this.sessionManager.cancelSession(existingSession.id, 'Yeni kart okundu');
        console.log(`🔄 Cancelled existing session for new card scan`);
      }

      const session = this.sessionManager.createSession(
        kioskId,
        cardId,
        availableLockers.map(l => l.id),
        zoneFilter
      );

      console.log(`🔑 Created session ${session.id} for card ${cardId} with ${availableLockers.length} available lockers`);

      const lockerPayload = await this.formatLockersForResponse(kioskId, availableLockers);

      return {
        success: true,
        action: 'show_lockers',
        session_id: session.id,
        timeout_seconds: session.timeoutSeconds,
        message: flowResult.message ?? 'Kart okundu. Dolap seçin',
        lockers: lockerPayload,
        total_available: availableLockers.length,
        assignment_mode: flowResult.assignment_mode,
        auto_assigned: flowResult.auto_assigned ?? false,
        fallback_reason: flowResult.fallback_reason,
        debug_logs: flowResult.debug_logs
      };
    }

    return {
      success: flowResult.success,
      action: flowResult.action,
      message: flowResult.message,
      assignment_mode: flowResult.assignment_mode,
      auto_assigned: flowResult.auto_assigned ?? false,
      debug_logs: flowResult.debug_logs
    };
  }

  private async getAvailableLockers(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kioskId, zone } = request.query as { kioskId: string; zone?: string };

      if (!kioskId) {
        reply.code(400);
        return { error: 'kioskId is required' };
      }

      const zoneFilter = await this.resolveZoneFilter(zone);
      const lockers = await this.lockerStateManager.getEnhancedAvailableLockers(kioskId, {
        zoneId: zoneFilter
      });

      if (lockers.length === 0) {
        return {
          lockers: [],
          sessionId: null,
          timeoutSeconds: 0,
          message: zoneFilter ? `Müsait dolap yok (${zoneFilter})` : 'Müsait dolap yok'
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
        availableLockers: availableLockersList.map(l => l.id),
        zoneId: zoneFilter
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

      // Refresh available lockers for retry (respect session zone if available)
      const zoneFilter = await this.resolveZoneFilter(session.zoneId);
      const availableLockers = await this.lockerStateManager.getEnhancedAvailableLockers(kiosk_id, {
        zoneId: zoneFilter
      });
      
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
      const { kiosk_id, raw_uid_hex } = request.query as { kiosk_id?: string; raw_uid_hex?: string };

      if (!cardId) {
        reply.code(400);
        return { error: 'cardId is required' };
      }

      const kioskId = kiosk_id || 'kiosk-1';
      const normalized = this.normalizeCardId(cardId, kioskId, raw_uid_hex);

      await this.ensureConfigInitialized();
      const openOnlyWindowHours = typeof this.configManager.getOpenOnlyWindowHours === 'function'
        ? this.configManager.getOpenOnlyWindowHours()
        : 1;

      console.log(`🔍 Checking existing locker for card: ${normalized.ownerKey} raw=${normalized.standardizedUid ?? raw_uid_hex ?? 'n/a'}`);

      const existingLocker = await this.lockerStateManager.checkExistingOwnership(normalized.ownerKey, 'rfid');

      if (existingLocker) {
        const ownedAt = existingLocker.owned_at ? new Date(existingLocker.owned_at).toISOString() : null;
        const reservedAt = existingLocker.reserved_at ? new Date(existingLocker.reserved_at).toISOString() : null;
        return {
          hasLocker: true,
          lockerId: existingLocker.id,
          displayName: existingLocker.display_name ?? null,
          ownedAt,
          reservedAt,
          openOnlyWindowHours,
          message: `Dolap ${(existingLocker.display_name || existingLocker.id)} zaten atanmış`
        };
      }

      return {
        hasLocker: false,
        openOnlyWindowHours,
        message: 'Atanmış dolap yok'
      };
    } catch (error) {
      if (error instanceof CardValidationError) {
        reply.code(400);
        console.warn('RFID validation failed during locker lookup:', {
          reason: error.code,
          details: error.details
        });
        return { error: 'rfid_validation_failed', reason: error.code, details: error.details };
      }

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
      const { cardId, lockerId, kioskId, rawUidHex } = request.body as {
        cardId: string;
        lockerId: number;
        kioskId: string;
        rawUidHex?: string;
      };

      if (!cardId || !lockerId || !kioskId) {
        reply.code(400);
        return {
          error: 'missing_parameters',
          message: 'Gerekli parametreler eksik'
        };
      }

      const normalized = this.normalizeCardId(cardId, kioskId, rawUidHex);

      console.log(`🎯 Assigning locker ${lockerId} to card ${normalized.ownerKey} on kiosk ${kioskId} raw=${normalized.standardizedUid ?? rawUidHex ?? 'n/a'}`);

      const assigned = await this.lockerStateManager.assignLocker(kioskId, lockerId, 'rfid', normalized.ownerKey);

      if (!assigned) {
        console.error(`❌ Failed to assign locker ${lockerId} to card ${normalized.ownerKey}`);
        return {
          success: false,
          error: 'assignment_failed',
          message: 'Dolap atanamadı - Farklı dolap seçin'
        };
      }

      console.log(`✅ Locker ${lockerId} assigned to card ${normalized.ownerKey}, attempting to open`);

      console.log(`🔧 Attempting to open locker ${lockerId} for card ${normalized.ownerKey}`);

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
        await this.lockerStateManager.confirmOwnership(kioskId, lockerId);

        console.log(`✅ Locker ${lockerId} successfully opened for card ${normalized.ownerKey}`);

        const lockerName = await this.getLockerDisplayName(kioskId, lockerId);
        return {
          success: true,
          lockerId,
          message: `${lockerName} açıldı ve atandı`
        };
      }

      console.error(`❌ Failed to open locker ${lockerId}, releasing assignment`);

      try {
        await this.lockerStateManager.releaseLocker(kioskId, lockerId, normalized.ownerKey);
        console.log(`✅ Successfully released assignment for locker ${lockerId}`);
      } catch (releaseError) {
        console.error(`❌ Failed to release locker assignment: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`);
      }

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
    } catch (error) {
      if (error instanceof CardValidationError) {
        reply.code(400);
        console.warn('RFID validation failed during locker assignment:', {
          reason: error.code,
          details: error.details
        });
        return {
          success: false,
          error: 'rfid_validation_failed',
          message: 'Kart okunamadı - Tekrar deneyin',
          reason: error.code,
          details: error.details
        };
      }

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
      const { cardId, kioskId, rawUidHex } = request.body as {
        cardId: string;
        kioskId: string;
        rawUidHex?: string;
      };

      if (!cardId || !kioskId) {
        reply.code(400);
        return {
          error: 'missing_parameters',
          message: 'Gerekli parametreler eksik'
        };
      }

      const normalized = this.normalizeCardId(cardId, kioskId, rawUidHex);

      console.log(`🔓 Releasing locker for card ${normalized.ownerKey} on kiosk ${kioskId} raw=${normalized.standardizedUid ?? rawUidHex ?? 'n/a'}`);

      // Find existing locker for this card
      const existingLocker = await this.lockerStateManager.checkExistingOwnership(normalized.ownerKey, 'rfid');

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
        await this.lockerStateManager.releaseLocker(kioskId, existingLocker.id, normalized.ownerKey);

        console.log(`✅ Locker ${existingLocker.id} opened and released for card ${normalized.ownerKey}`);

        const lockerName = await this.getLockerDisplayName(kioskId, existingLocker.id);
        return {
          success: true,
          lockerId: existingLocker.id,
          message: `${lockerName} açıldı ve serbest bırakıldı`
        };
      }

      console.error(`❌ Failed to open locker ${existingLocker.id} for release`);

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
    } catch (error) {
      if (error instanceof CardValidationError) {
        reply.code(400);
        console.warn('RFID validation failed during locker release:', {
          reason: error.code,
          details: error.details
        });
        return {
          success: false,
          error: 'rfid_validation_failed',
          message: 'Kart okunamadı - Tekrar deneyin',
          reason: error.code,
          details: error.details
        };
      }

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
   * Open currently owned locker without releasing (Idea 5)
   */
  private async openLockerAgain(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { cardId, kioskId, rawUidHex } = request.body as { cardId: string; kioskId: string; rawUidHex?: string };

      if (!cardId || !kioskId) {
        reply.code(400);
        return {
          success: false,
          error: 'missing_parameters',
          message: 'Gerekli parametreler eksik'
        };
      }

      const normalized = this.normalizeCardId(cardId, kioskId, rawUidHex);

      // Find existing locker by card
      const existingLocker = await this.lockerStateManager.checkExistingOwnership(normalized.ownerKey, 'rfid');
      if (!existingLocker) {
        reply.code(404);
        return {
          success: false,
          error: 'no_locker',
          message: 'Bu kart için atanmış dolap yok'
        };
      }

      // Attempt to open without changing DB ownership
      let opened = false;
      let hardwareError: string | null = null;
      try {
        opened = await this.modbusController.openLocker(existingLocker.id);
      } catch (error) {
        hardwareError = error instanceof Error ? error.message : String(error);
        opened = false;
      }

      if (opened) {
        const lockerName = await this.getLockerDisplayName(kioskId, existingLocker.id);
        return {
          success: true,
          lockerId: existingLocker.id,
          message: `${lockerName} açılıyor`
        };
      }

      // Determine appropriate error message based on hardware status
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

      reply.code(500);
      return {
        success: false,
        error: errorCode,
        message: errorMessage,
        hardware_status: {
          available: hardwareStatus.available,
          error_rate: hardwareStatus.diagnostics.errorRate
        }
      };
    } catch (error) {
      if (error instanceof CardValidationError) {
        reply.code(400);
        console.warn('RFID validation failed when opening locker again:', {
          reason: error.code,
          details: error.details
        });
        return {
          success: false,
          error: 'rfid_validation_failed',
          message: 'Kart okunamadı - Tekrar deneyin',
          reason: error.code,
          details: error.details
        };
      }

      console.error('Error opening locker again:', error);
      reply.code(500);
      return {
        success: false,
        error: 'server_error',
        message: 'Sistem hatası - Tekrar deneyin'
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
