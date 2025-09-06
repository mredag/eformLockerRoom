import { DatabaseConnection } from '../database/connection';
import { LockerStateManager } from './locker-state-manager';
import { LockerScorer, LockerScoringData, LockerScore } from './locker-scorer';
import { CandidateSelector, LockerExclusionData, SelectionResult } from './candidate-selector';
import { ConfigurationManager } from './configuration-manager';
import { ReclaimManager } from './reclaim-manager';
import { QuarantineManager } from './quarantine-manager';
import { OverdueManager } from './overdue-manager';
import { HotWindowManager } from './hot-window-manager';
import { ReserveCapacityManager } from './reserve-capacity-manager';
import { Locker, OwnerType } from '../types/core-entities';
import { UI_MESSAGES, ACTION_MESSAGES, ERROR_MESSAGES } from '../constants/ui-messages';
import { getRateLimiter } from './rate-limiter';

export interface AssignmentRequest {
  cardId: string;
  kioskId: string;
  timestamp: Date;
  userReportWindow?: boolean;
}

export interface AssignmentResult {
  success: boolean;
  lockerId?: number;
  action: 'assign_new' | 'open_existing' | 'retrieve_overdue' | 'reopen_reclaim';
  message: string;
  errorCode?: string;
  retryAllowed?: boolean;
  sessionId?: string;
}

export interface ReturnHold {
  lockerId: number;
  cardId: string;
  expiresAt: Date;
}

export interface ReclaimResult {
  canReclaim: boolean;
  lockerId?: number;
  reason: string;
}

/**
 * AssignmentEngine - Core orchestrator for smart locker assignment
 * 
 * Implements the main assignment flow:
 * 1. Check existing ownership
 * 2. Check overdue retrieval
 * 3. Check return hold
 * 4. Check reclaim eligibility
 * 5. Assign new locker
 * 
 * Features:
 * - Single transaction with one retry on conflict
 * - Turkish message formatting
 * - Comprehensive error handling and fallback logic
 * - Concurrency control with optimistic locking
 */
export class AssignmentEngine {
  private db: DatabaseConnection;
  private lockerStateManager: LockerStateManager;
  private configManager: ConfigurationManager;
  private reclaimManager: ReclaimManager;
  private overdueManager: OverdueManager;
  private hotWindowManager: HotWindowManager;
  private reserveCapacityManager: ReserveCapacityManager;
  private scorer: LockerScorer;
  private selector: CandidateSelector;
  private rateLimiter = getRateLimiter();

  constructor(
    db: DatabaseConnection,
    lockerStateManager: LockerStateManager,
    configManager: ConfigurationManager
  ) {
    this.db = db;
    this.lockerStateManager = lockerStateManager;
    this.configManager = configManager;
    
    // Initialize managers
    const quarantineManager = new QuarantineManager(db, configManager);
    this.reclaimManager = new ReclaimManager(db, configManager, quarantineManager);
    this.overdueManager = new OverdueManager(db, configManager);
    this.hotWindowManager = new HotWindowManager(db, configManager);
    this.reserveCapacityManager = new ReserveCapacityManager(db, configManager);
    
    // Initialize scorer and selector with default configs (will be updated from config manager)
    this.scorer = new LockerScorer({
      base_score: 100,
      score_factor_a: 2.0,
      score_factor_b: 1.0,
      score_factor_g: 0.1,
      score_factor_d: 0.5,
      quarantine_multiplier: 0.2
    });
    
    this.selector = new CandidateSelector({
      top_k_candidates: 5,
      selection_temperature: 1.0
    });
  }

  /**
   * Main assignment method - orchestrates the entire assignment flow
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 19.1, 19.2, 19.3, 19.4, 19.5
   */
  async assignLocker(request: AssignmentRequest): Promise<AssignmentResult> {
    const { cardId, kioskId, timestamp, userReportWindow } = request;
    
    // No PII in logs - use generic identifiers
    console.log(`🎯 Starting assignment on kiosk ${kioskId}`);
    
    try {
      // Check if this is a suspected occupied report (double-scan within window)
      // Requirements: 5.3, 5.4, 5.5
      if (userReportWindow) {
        const reportResult = await this.handleSuspectedOccupiedReport(cardId, kioskId);
        if (reportResult.success) {
          return reportResult;
        }
        // If report failed, continue with normal assignment
      }

      // Check rate limits before assignment (Requirements: 7.1, 7.2, 7.3)
      const config = await this.configManager.getEffectiveConfig(kioskId);
      const rateLimitCheck = this.rateLimiter.checkRateLimits(cardId, kioskId, undefined, {
        cardRateLimitSeconds: config.card_rate_limit_seconds,
        commandCooldownSeconds: config.command_cooldown_seconds,
        lockerRateLimit: config.locker_rate_limit_per_minute
      });

      if (!rateLimitCheck.allowed) {
        console.log(`Rate limit triggered: ${rateLimitCheck.reason}`);
        return {
          success: false,
          action: 'assign_new',
          message: ERROR_MESSAGES.rate_limited,
          errorCode: 'rate_limited',
          retryAllowed: false
        };
      }

      // Single transaction with one retry on conflict (Requirement 19.1, 19.2)
      return await this.executeAssignmentWithRetry(request);
    } catch (error) {
      console.error(`❌ Assignment failed on kiosk ${kioskId}:`, error);
      
      return {
        success: false,
        action: 'assign_new',
        message: ERROR_MESSAGES.system_error,
        errorCode: 'system_error',
        retryAllowed: false
      };
    }
  }

  /**
   * Execute assignment with single retry on conflict
   * Requirements: 19.2, 19.3, 19.5
   */
  private async executeAssignmentWithRetry(request: AssignmentRequest): Promise<AssignmentResult> {
    try {
      // First attempt
      return await this.executeAssignmentTransaction(request);
    } catch (error) {
      if (this.isConflictError(error)) {
        console.log(`🔄 Assignment conflict detected, retrying once on kiosk ${request.kioskId}`);
        
        // Single retry with fresh state (Requirement 19.2)
        try {
          return await this.executeAssignmentTransaction(request);
        } catch (retryError) {
          console.error(`❌ Assignment retry failed on kiosk ${request.kioskId}:`, retryError);
          
          return {
            success: false,
            action: 'assign_new',
            message: ERROR_MESSAGES.conflict_retry_failed,
            errorCode: 'conflict_retry_failed',
            retryAllowed: false
          };
        }
      } else {
        // Non-conflict error, don't retry
        throw error;
      }
    }
  }

  /**
   * Execute assignment within a single database transaction
   * Requirements: 19.1, 19.4
   */
  private async executeAssignmentTransaction(request: AssignmentRequest): Promise<AssignmentResult> {
    try {
      await this.db.beginTransaction();
      
      const result = await this.performAssignmentFlow(request);
      
      await this.db.commit();
      
      // Log successful assignment (exact format required)
      console.log(`Assignment completed: action=${result.action}, locker=${result.lockerId || 'none'}`);
      
      return result;
    } catch (error) {
      try {
        await this.db.rollback();
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
      throw error;
    }
  }

  /**
   * Perform the main assignment flow logic
   * Flow: existing ownership → overdue retrieval → return hold → hot window bypass → reclaim → new assignment
   */
  private async performAssignmentFlow(request: AssignmentRequest): Promise<AssignmentResult> {
    const { cardId, kioskId, timestamp } = request;

    // Step 1: Check existing ownership (Requirement 1.5)
    const existingLocker = await this.lockerStateManager.checkExistingOwnership(cardId, 'rfid');
    if (existingLocker) {
      return {
        success: true,
        lockerId: existingLocker.id,
        action: 'open_existing',
        message: ACTION_MESSAGES.open_existing
      };
    }

    // Step 2: Check overdue retrieval (Requirement 5.2)
    const overdueResult = await this.checkOverdueRetrieval(cardId, kioskId);
    if (overdueResult.success) {
      return overdueResult;
    }

    // Step 3: Check return hold (Requirement 3.2, 3.5)
    const returnHoldResult = await this.checkReturnHold(cardId, kioskId);
    if (returnHoldResult.success) {
      return returnHoldResult;
    }

    // Step 4: Check hot window bypass (Requirement 14.4)
    const hotWindowResult = await this.checkHotWindowBypass(cardId, kioskId);
    if (hotWindowResult.success) {
      return hotWindowResult;
    }

    // Step 5: Check reclaim eligibility (Requirement 4.2)
    const reclaimResult = await this.checkReclaimEligibility(cardId, kioskId, timestamp);
    if (reclaimResult.success) {
      return reclaimResult;
    }

    // Step 6: Assign new locker (Requirement 1.1, 1.2, 1.3, 1.4)
    return await this.assignNewLocker(cardId, kioskId, timestamp);
  }

  /**
   * Check if user can retrieve an overdue locker
   * Requirements: 5.1, 5.2 - Enhanced with OverdueManager
   */
  private async checkOverdueRetrieval(cardId: string, kioskId: string): Promise<AssignmentResult> {
    // Find overdue locker owned by this card
    const overdueLocker = await this.db.get<Locker>(
      `SELECT * FROM lockers 
       WHERE kiosk_id = ? AND owner_key = ? AND overdue_from IS NOT NULL
       ORDER BY overdue_from DESC LIMIT 1`,
      [kioskId, cardId]
    );

    if (overdueLocker) {
      // Check if retrieval is allowed (one-time only)
      const canRetrieve = await this.overdueManager.canRetrieveOverdue(kioskId, overdueLocker.id, cardId);
      
      if (canRetrieve.allowed) {
        // Process overdue retrieval (clears overdue status and applies quarantine)
        await this.overdueManager.processOverdueRetrieval(kioskId, overdueLocker.id, cardId);
        
        // Update locker status to owned
        await this.db.run(
          `UPDATE lockers 
           SET status = 'Owned', owner_type = 'rfid', owner_key = ?, 
               version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE kiosk_id = ? AND id = ? AND version = ?`,
          [cardId, kioskId, overdueLocker.id, overdueLocker.version]
        );

        console.log(`🔓 Overdue retrieval: card=${cardId}, locker=${overdueLocker.id}`);

        return {
          success: true,
          lockerId: overdueLocker.id,
          action: 'retrieve_overdue',
          message: ACTION_MESSAGES.retrieve_overdue
        };
      } else {
        console.log(`❌ Overdue retrieval denied: ${canRetrieve.reason}`);
      }
    }

    return { success: false, action: 'assign_new', message: '' };
  }

  /**
   * Check if user can reopen a locker in return hold
   * Requirements: 3.2, 3.5
   */
  private async checkReturnHold(cardId: string, kioskId: string): Promise<AssignmentResult> {
    const heldLocker = await this.db.get<Locker>(
      `SELECT * FROM lockers 
       WHERE kiosk_id = ? AND recent_owner = ? AND return_hold_until > CURRENT_TIMESTAMP
       ORDER BY return_hold_until DESC LIMIT 1`,
      [kioskId, cardId]
    );

    if (heldLocker) {
      // Reopen held locker
      await this.db.run(
        `UPDATE lockers 
         SET status = 'Owned', owner_type = 'rfid', owner_key = ?, 
             return_hold_until = NULL, version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE kiosk_id = ? AND id = ? AND version = ?`,
        [cardId, kioskId, heldLocker.id, heldLocker.version]
      );

      return {
        success: true,
        lockerId: heldLocker.id,
        action: 'open_existing',
        message: ACTION_MESSAGES.open_existing
      };
    }

    return { success: false, action: 'assign_new', message: '' };
  }

  /**
   * Check if user can bypass hot window protection (original owner)
   * Requirements: 14.4
   */
  private async checkHotWindowBypass(cardId: string, kioskId: string): Promise<AssignmentResult> {
    const hotWindowLocker = await this.db.get<Locker>(
      `SELECT * FROM lockers 
       WHERE kiosk_id = ? AND recent_owner = ? AND owner_hot_until > CURRENT_TIMESTAMP
       ORDER BY owner_hot_until DESC LIMIT 1`,
      [kioskId, cardId]
    );

    if (hotWindowLocker) {
      // Check if this card can bypass the hot window
      const canBypass = await this.hotWindowManager.canBypassHotWindow(kioskId, hotWindowLocker.id, cardId);
      
      if (canBypass) {
        // Clear hot window and assign locker
        await this.db.run(
          `UPDATE lockers 
           SET status = 'Owned', owner_type = 'rfid', owner_key = ?, 
               owner_hot_until = NULL, version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE kiosk_id = ? AND id = ? AND version = ?`,
          [cardId, kioskId, hotWindowLocker.id, hotWindowLocker.version]
        );

        return {
          success: true,
          lockerId: hotWindowLocker.id,
          action: 'open_existing',
          message: ACTION_MESSAGES.open_existing
        };
      }
    }

    return { success: false, action: 'assign_new', message: '' };
  }

  /**
   * Check if user can reclaim their previous locker
   * Uses the dedicated ReclaimManager for enhanced functionality
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
   */
  private async checkReclaimEligibility(cardId: string, kioskId: string, timestamp: Date): Promise<AssignmentResult> {
    const reclaimResult = await this.reclaimManager.checkReclaimEligibility({
      cardId,
      kioskId,
      timestamp
    });

    if (!reclaimResult.canReclaim) {
      return { success: false, action: 'assign_new', message: '' };
    }

    // Execute the reclaim using the ReclaimManager
    const executed = await this.reclaimManager.executeReclaim(
      cardId,
      kioskId,
      reclaimResult.lockerId!,
      reclaimResult.reclaimType!
    );

    if (executed) {
      return {
        success: true,
        lockerId: reclaimResult.lockerId!,
        action: 'reopen_reclaim',
        message: ACTION_MESSAGES.reopen_reclaim
      };
    } else {
      return { success: false, action: 'assign_new', message: 'Failed to execute reclaim' };
    }
  }

  /**
   * Assign a new locker using scoring and selection algorithms
   * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 13.1, 13.2, 13.3
   */
  private async assignNewLocker(cardId: string, kioskId: string, timestamp: Date): Promise<AssignmentResult> {
    // Get effective configuration
    const config = await this.configManager.getEffectiveConfig(kioskId);
    
    // Update scorer and selector configurations
    this.scorer.updateConfig({
      base_score: config.base_score,
      score_factor_a: config.score_factor_a,
      score_factor_b: config.score_factor_b,
      score_factor_g: config.score_factor_g,
      score_factor_d: config.score_factor_d,
      quarantine_multiplier: 0.2
    });
    
    this.selector.updateConfig({
      top_k_candidates: config.top_k_candidates,
      selection_temperature: config.selection_temperature
    });

    // Get available lockers (excluding quarantined, held, overdue, suspected)
    const availableLockers = await this.getAssignableLockers(kioskId);
    
    if (availableLockers.length === 0) {
      return {
        success: false,
        action: 'assign_new',
        message: ERROR_MESSAGES.no_stock,
        errorCode: 'no_stock'
      };
    }

    // Apply reserve capacity filtering (Requirements: 13.1, 13.2, 13.3)
    const reserveResult = await this.reserveCapacityManager.applyReserveCapacity(kioskId, availableLockers);
    
    if (reserveResult.assignableLockers.length === 0) {
      return {
        success: false,
        action: 'assign_new',
        message: ERROR_MESSAGES.no_stock,
        errorCode: 'no_stock'
      };
    }

    // Score assignable lockers only
    const scoringData = await this.prepareScoringData(reserveResult.assignableLockers, timestamp);
    const scores = this.scorer.scoreLockers(scoringData);

    // Prepare exclusion data
    const exclusions = await this.prepareExclusionData(kioskId);

    // Select locker (selector will log: "Selected locker <id> from <k> candidates")
    const nowSecs = Math.floor(timestamp.getTime() / 1000);
    const selection = this.selector.selectFromCandidates(scores, exclusions, kioskId, cardId, nowSecs);

    if (!selection) {
      return {
        success: false,
        action: 'assign_new',
        message: ERROR_MESSAGES.no_stock,
        errorCode: 'no_stock'
      };
    }

    // Assign the selected locker
    const selectedLocker = reserveResult.assignableLockers.find(l => l.id === selection.selectedLockerId);
    if (!selectedLocker) {
      throw new Error(`Selected locker ${selection.selectedLockerId} not found in assignable lockers`);
    }

    // Claim the locker
    const claimed = await this.claimLocker(selectedLocker, cardId, timestamp);
    if (!claimed) {
      throw new Error('Failed to claim selected locker - possible conflict');
    }

    // Record successful assignment for rate limiting
    this.rateLimiter.recordCardAssignment(cardId);

    return {
      success: true,
      lockerId: selection.selectedLockerId,
      action: 'assign_new',
      message: ACTION_MESSAGES.assign_new
    };
  }

  /**
   * Get lockers available for assignment (excluding blocked, VIP, hot window, etc.)
   * Requirements: 14.4 - Exclude lockers in hot window protection
   */
  private async getAssignableLockers(kioskId: string): Promise<Locker[]> {
    const now = new Date();
    return await this.db.all<Locker>(
      `SELECT * FROM lockers 
       WHERE kiosk_id = ? 
       AND status = 'Free' 
       AND is_vip = 0
       AND (quarantine_until IS NULL OR quarantine_until <= ?)
       AND (return_hold_until IS NULL OR return_hold_until <= ?)
       AND (owner_hot_until IS NULL OR owner_hot_until <= ?)
       AND overdue_from IS NULL
       AND suspected_occupied = 0
       ORDER BY id ASC`,
      [kioskId, now.toISOString(), now.toISOString(), now.toISOString()]
    );
  }

  /**
   * Prepare scoring data for available lockers
   */
  private async prepareScoringData(lockers: Locker[], timestamp: Date): Promise<LockerScoringData[]> {
    const now = timestamp.getTime();
    
    return lockers.map(locker => {
      const freeHours = locker.free_since 
        ? (now - new Date(locker.free_since).getTime()) / (1000 * 60 * 60)
        : 0;
      
      const hoursSinceLastOwner = locker.recent_owner_time
        ? (now - new Date(locker.recent_owner_time).getTime()) / (1000 * 60 * 60)
        : 24; // Default to 24 hours if never used
      
      const isQuarantined = locker.quarantine_until 
        ? new Date(locker.quarantine_until) > timestamp
        : false;

      return {
        lockerId: locker.id,
        freeHours,
        hoursSinceLastOwner,
        wearCount: locker.wear_count || 0,
        isQuarantined,
        waitingHours: 0 // TODO: Implement waiting hours calculation
      };
    });
  }

  /**
   * Handle suspected occupied report (double-scan detection)
   * Requirements: 5.3, 5.4, 5.5
   */
  private async handleSuspectedOccupiedReport(cardId: string, kioskId: string): Promise<AssignmentResult> {
    try {
      // Find the most recently opened locker by this card
      const recentLocker = await this.db.get<any>(
        `SELECT lo.locker_id, l.* FROM locker_operations lo
         JOIN lockers l ON l.kiosk_id = lo.kiosk_id AND l.id = lo.locker_id
         WHERE lo.card_id = ? AND lo.kiosk_id = ? AND lo.operation_type = 'open'
         ORDER BY lo.opened_at DESC LIMIT 1`,
        [cardId, kioskId]
      );

      if (!recentLocker) {
        console.log(`No recent locker operation found for suspected report.`);
        return { success: false, action: 'assign_new', message: '' };
      }

      // Check if within report window
      const inReportWindow = await this.overdueManager.isInReportWindow(kioskId, recentLocker.locker_id);
      if (!inReportWindow) {
        console.log(`Suspected report outside of report window.`);
        return { success: false, action: 'assign_new', message: '' };
      }

      // Report suspected occupied
      const reportResult = await this.overdueManager.reportSuspectedOccupied(kioskId, recentLocker.locker_id, cardId);
      
      if (reportResult.accepted) {
        console.log(`Suspected occupied reported, assigning new locker.`);
        
        // Assign a different locker (continue with normal assignment flow)
        const newAssignment = await this.performAssignmentFlow({
          cardId,
          kioskId,
          timestamp: new Date(),
          userReportWindow: false // Prevent recursive reporting
        });

        if (newAssignment.success) {
          return {
            success: true,
            lockerId: newAssignment.lockerId,
            action: 'assign_new',
            message: ACTION_MESSAGES.reported_occupied // "Dolap dolu bildirildi. Yeni dolap açılıyor"
          };
        }
      } else {
        // Log rejection reason but don't surface to kiosk
        console.log(`Suspected report rejected: ${reportResult.reason}.`);
        
        // Return throttled message for kiosk instead of specific rejection reason
        return {
          success: false,
          action: 'assign_new',
          message: ERROR_MESSAGES.rate_limited, // "Lütfen birkaç saniye sonra deneyin."
          errorCode: 'rate_limited',
          retryAllowed: true
        };
      }

      return { success: false, action: 'assign_new', message: '' };
    } catch (error) {
      console.error(`Error handling suspected occupied report:`, error);
      return { success: false, action: 'assign_new', message: '' };
    }
  }

  /**
   * Prepare exclusion data for candidate selection
   * Requirements: 14.4 - Include hot window exclusion data
   */
  private async prepareExclusionData(kioskId: string): Promise<LockerExclusionData[]> {
    const lockers = await this.db.all<Locker>(
      `SELECT id, quarantine_until, return_hold_until, owner_hot_until, overdue_from, suspected_occupied
       FROM lockers WHERE kiosk_id = ?`,
      [kioskId]
    );

    const now = new Date();
    
    return lockers.map(locker => ({
      lockerId: locker.id,
      isQuarantined: locker.quarantine_until ? new Date(locker.quarantine_until) > now : false,
      isInReturnHold: locker.return_hold_until ? new Date(locker.return_hold_until) > now : false,
      isInHotWindow: locker.owner_hot_until ? new Date(locker.owner_hot_until) > now : false,
      isOverdue: !!locker.overdue_from,
      isSuspectedOccupied: !!locker.suspected_occupied
    }));
  }

  /**
   * Claim a locker for assignment with optimistic locking
   */
  private async claimLocker(locker: Locker, cardId: string, timestamp: Date): Promise<boolean> {
    const result = await this.db.run(
      `UPDATE lockers 
       SET status = 'Owned', owner_type = 'rfid', owner_key = ?, 
           owned_at = ?, wear_count = wear_count + 1,
           version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE kiosk_id = ? AND id = ? AND version = ? AND status = 'Free' 
       AND overdue_from IS NULL AND suspected_occupied = 0`,
      [cardId, timestamp.toISOString(), locker.kiosk_id, locker.id, locker.version]
    );

    return result.changes > 0;
  }

  /**
   * Calculate free ratio for dynamic quarantine and reclaim windows
   */
  private async calculateFreeRatio(kioskId: string): Promise<number> {
    const stats = await this.db.get<{ total: number; free: number }>(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'Free' AND is_vip = 0 THEN 1 ELSE 0 END) as free
       FROM lockers WHERE kiosk_id = ?`,
      [kioskId]
    );

    if (!stats || stats.total === 0) {
      return 0;
    }

    return stats.free / stats.total;
  }



  /**
   * Check if error is a conflict error (optimistic locking failure)
   */
  private isConflictError(error: any): boolean {
    const errorMessage = error?.message || String(error);
    return errorMessage.includes('conflict') || 
           errorMessage.includes('version') ||
           errorMessage.includes('optimistic');
  }

  /**
   * Apply hot window protection when a locker is released
   * Requirements: 14.4, 14.5
   * Note: This should be called within the same transaction that clears ownership
   */
  async applyHotWindowOnRelease(kioskId: string, lockerId: number, cardId: string): Promise<void> {
    try {
      const application = await this.hotWindowManager.applyHotWindow(kioskId, lockerId, cardId);
      
      if (application) {
        console.log(`Hot window applied: locker=${lockerId}, duration=${application.duration}min.`);
      } else {
        console.log(`Hot window disabled due to low capacity.`);
      }
    } catch (error) {
      console.error(`Failed to apply hot window protection.`, error);
    }
  }

  /**
   * Clear expired hot windows for a kiosk
   * Requirements: 14.5
   */
  async clearExpiredHotWindows(kioskId: string): Promise<void> {
    try {
      const cleared = await this.hotWindowManager.clearExpiredHotWindows(kioskId);
      if (cleared > 0) {
        console.log(`Cleared ${cleared} expired hot windows.`);
      }
    } catch (error) {
      console.error(`Failed to clear expired hot windows.`, error);
    }
  }

  /**
   * Get hot window status for monitoring
   * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
   */
  async getHotWindowStatus(kioskId: string): Promise<{
    activeHotWindows: number;
    freeRatio: number;
    currentDuration: number;
    disabled: boolean;
  }> {
    return await this.hotWindowManager.getStatus(kioskId);
  }



  /**
   * Get assignment engine status for monitoring
   */
  async getStatus(): Promise<{
    available: boolean;
    lastAssignment?: Date;
    errorRate: number;
  }> {
    return {
      available: true,
      errorRate: 0 // TODO: Implement error rate tracking
    };
  }
}