import { DatabaseConnection } from '../database/connection';
import { Locker, LockerStatus, OwnerType, EventType, LockerStateTransition, LockerStateUpdate } from '../types/core-entities';
import { webSocketService } from './websocket-service';
import { LockerNamingService } from './locker-naming-service';
import { ConfigManager } from './config-manager';

interface LockerStateManagerOptions {
  /**
   * Override the auto release threshold in hours. Useful for tests or specialized flows.
   * When undefined the value from configuration will be used. When null or a non-positive
   * number is provided, auto release will be treated as disabled.
   */
  autoReleaseHoursOverride?: number | null;
  /**
   * Interval in milliseconds between automatic cleanup checks. Defaults to 5 minutes.
   */
  autoReleaseCheckIntervalMs?: number;
}

interface ReleaseOptions {
  eventType?: EventType;
  triggeredBy?: string;
  reason?: string;
  staffUser?: string;
  metadata?: Record<string, any>;
}

export class LockerStateManager {
  private db: DatabaseConnection;
  private dbManager: any;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private configManager: ConfigManager;
  private configInitialized = false;
  private options: LockerStateManagerOptions;
  private namingService: LockerNamingService;

  // Define valid state transitions supporting both Turkish and English state names
  private readonly STATE_TRANSITIONS: LockerStateTransition[] = [
    // Turkish status transitions
    { from: 'Free', to: 'Owned', trigger: 'assign', conditions: ['not_vip', 'no_existing_ownership'] },
    { from: 'Owned', to: 'Opening', trigger: 'confirm_opening', conditions: ['same_owner'] },
    { from: 'Owned', to: 'Free', trigger: 'release', conditions: ['same_owner'] },
    { from: 'Opening', to: 'Free', trigger: 'release', conditions: ['same_owner'] },
    { from: 'Owned', to: 'Free', trigger: 'timeout', conditions: ['auto_release'] },
    { from: 'Opening', to: 'Free', trigger: 'timeout', conditions: ['auto_release'] },
    { from: 'Free', to: 'Blocked', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Owned', to: 'Blocked', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Opening', to: 'Blocked', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Error', to: 'Blocked', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Blocked', to: 'Free', trigger: 'staff_unblock', conditions: ['staff_action'] },
    { from: 'Free', to: 'Error', trigger: 'hardware_error', conditions: ['system_error'] },
    { from: 'Owned', to: 'Error', trigger: 'hardware_error', conditions: ['system_error'] },
    { from: 'Opening', to: 'Error', trigger: 'hardware_error', conditions: ['system_error'] },
    { from: 'Error', to: 'Free', trigger: 'error_resolved', conditions: ['system_recovery'] },
    
    // English status transitions (for database compatibility)
    { from: 'Free', to: 'Owned', trigger: 'assign', conditions: ['not_vip', 'no_existing_ownership'] },
    { from: 'Owned', to: 'Opening', trigger: 'confirm_opening', conditions: ['same_owner'] },
    { from: 'Owned', to: 'Free', trigger: 'release', conditions: ['same_owner'] },
    { from: 'Opening', to: 'Free', trigger: 'release', conditions: ['same_owner'] },
    { from: 'Owned', to: 'Free', trigger: 'timeout', conditions: ['auto_release'] },
    { from: 'Opening', to: 'Free', trigger: 'timeout', conditions: ['auto_release'] },
    { from: 'Free', to: 'Blocked', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Owned', to: 'Blocked', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Opening', to: 'Blocked', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Error', to: 'Blocked', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Blocked', to: 'Free', trigger: 'staff_unblock', conditions: ['staff_action'] },
    { from: 'Free', to: 'Error', trigger: 'hardware_error', conditions: ['system_error'] },
    { from: 'Owned', to: 'Error', trigger: 'hardware_error', conditions: ['system_error'] },
    { from: 'Opening', to: 'Error', trigger: 'hardware_error', conditions: ['system_error'] },
    { from: 'Error', to: 'Free', trigger: 'error_resolved', conditions: ['system_recovery'] }
  ];

  constructor(dbManager?: any, options: LockerStateManagerOptions = {}) {
    if (dbManager) {
      if (typeof dbManager.getConnection === 'function') {
        this.dbManager = dbManager;
        this.db = dbManager.getConnection();
      } else if (typeof dbManager.run === 'function' && typeof dbManager.all === 'function') {
        this.db = dbManager;
      } else if (typeof dbManager.getDatabase === 'function') {
        this.db = dbManager as DatabaseConnection;
      } else {
        this.db = DatabaseConnection.getInstance();
      }
    } else {
      this.db = DatabaseConnection.getInstance();
    }

    this.options = options;
    this.configManager = ConfigManager.getInstance();
    this.namingService = new LockerNamingService(this.db);

    void this.initializeAutoRelease();
  }

  /**
   * Initialize automatic locker release configuration and timers.
   */
  private async initializeAutoRelease(): Promise<void> {
    if (this.options.autoReleaseHoursOverride !== undefined) {
      const override = this.options.autoReleaseHoursOverride;
      if (typeof override === 'number' && override > 0) {
        console.log(`⏱️ Auto-release override enabled: ${override} hour(s)`);
        this.startCleanupTimer();
        await this.cleanupExpiredReservations();
      } else {
        console.log('⏸️ Auto-release disabled via override configuration');
      }
      return;
    }

    try {
      await this.configManager.initialize();
      this.configInitialized = true;
    } catch (error) {
      console.warn('⚠️  Failed to initialize configuration for auto-release:', error);
    }

    this.startCleanupTimer();
    await this.cleanupExpiredReservations();
  }



  /**
   * Broadcast locker state update via WebSocket
   */
  private async broadcastStateUpdate(kioskId: string, lockerId: number, newState: LockerStatus, ownerKey?: string, ownerType?: OwnerType): Promise<void> {
    try {
      // Always fetch current locker data to ensure accuracy
      const currentLocker = await this.getLocker(kioskId, lockerId);
      const displayName = await this.namingService.getDisplayName(kioskId, lockerId);
      
      const update: LockerStateUpdate = {
        kioskId,
        lockerId,
        displayName,
        state: newState,
        lastChanged: new Date(),
        // Use current locker data if available, fallback to parameters
        ownerKey: currentLocker?.owner_key || ownerKey,
        ownerType: currentLocker?.owner_type || ownerType
      };

      console.log(`🔄 Broadcasting state update for locker ${kioskId}-${lockerId}:`, {
        state: update.state,
        ownerKey: update.ownerKey,
        ownerType: update.ownerType
      });

      webSocketService.broadcastStateUpdate(update);
    } catch (error) {
      console.error('Error broadcasting state update:', error);
    }
  }

  /**
   * Start automatic cleanup of expired reservations - DISABLED
   * Automatic timeout feature has been removed per user request
   */
  private startCleanupTimer(): void {
    const override = this.options.autoReleaseHoursOverride;
    if (override !== undefined && (!override || override <= 0)) {
      return;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    const intervalMs = this.options.autoReleaseCheckIntervalMs ?? 5 * 60 * 1000;
    if (!intervalMs || intervalMs <= 0) {
      console.warn('⚠️  Invalid auto-release interval; skipping cleanup timer setup');
      return;
    }

    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupExpiredReservations();
      } catch (error) {
        console.error('❌ Automatic locker cleanup failed:', error);
      }
    }, intervalMs);

    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }

    console.log(
      `⏱️ Automatic locker cleanup scheduled every ${Math.round(intervalMs / 60000) || 1} minute(s)`
    );
  }

  /**
   * Stop automatic cleanup timer - DISABLED
   * No cleanup timer to stop since automatic timeout is disabled
   */
  public stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('⏹️ Automatic locker cleanup timer stopped');
    }
  }

  /**
   * Validate if a state transition is allowed
   */
  private isValidTransition(from: LockerStatus, to: LockerStatus, trigger: string): boolean {
    return this.STATE_TRANSITIONS.some(
      transition => transition.from === from && transition.to === to && transition.trigger === trigger
    );
  }

  /**
   * Handle hardware error for a locker (Requirement 4.3, 4.5)
   * Sets locker to error state and releases any assignments
   */
  async handleHardwareError(kioskId: string, lockerId: number, errorDetails: string): Promise<boolean> {
    try {
      console.log(`🔧 Handling hardware error for locker ${lockerId}: ${errorDetails}`);
      
      // Get current locker state
      const locker = await this.getLocker(kioskId, lockerId);
      if (!locker) {
        console.error(`❌ Locker ${lockerId} not found for hardware error handling`);
        return false;
      }

      // Check if transition to error state is valid
      if (!this.isValidTransition(locker.status, 'Error', 'hardware_error')) {
        console.warn(`⚠️ Invalid transition from ${locker.status} to Error for locker ${lockerId}`);
        return false;
      }

      const now = new Date().toISOString();
      
      // Update locker to error state and clear ownership
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Error', 
             owner_type = NULL, 
             owner_key = NULL, 
             reserved_at = NULL,
             version = version + 1, 
             updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ?`,
        [now, kioskId, lockerId, locker.version]
      );

      if (result.changes === 0) {
        console.error(`❌ Failed to update locker ${lockerId} to error state (optimistic locking failed)`);
        return false;
      }

      // Broadcast state update
      await this.broadcastStateUpdate(kioskId, lockerId, 'Error');

      // Log the hardware error event
      await this.logEvent(kioskId, lockerId, EventType.HARDWARE_ERROR, {
        error_details: errorDetails,
        previous_status: locker.status,
        previous_owner: locker.owner_key
      });

      console.log(`✅ Locker ${lockerId} set to error state due to hardware failure`);
      return true;

    } catch (error) {
      console.error(`❌ Error handling hardware error for locker ${lockerId}:`, error);
      return false;
    }
  }

  /**
   * Recover locker from error state (Requirement 4.3)
   * Sets locker back to available state after hardware issues are resolved
   */
  async recoverFromHardwareError(kioskId: string, lockerId: number): Promise<boolean> {
    try {
      console.log(`🔧 Recovering locker ${lockerId} from hardware error`);
      
      // Get current locker state
      const locker = await this.getLocker(kioskId, lockerId);
      if (!locker) {
        console.error(`❌ Locker ${lockerId} not found for error recovery`);
        return false;
      }

      // Check if transition from error state is valid
      if (!this.isValidTransition(locker.status, 'Free', 'error_resolved')) {
        console.warn(`⚠️ Invalid transition from ${locker.status} to Free for locker ${lockerId}`);
        return false;
      }

      const now = new Date().toISOString();
      
      // Update locker to available state
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Free', 
             version = version + 1, 
             updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ? AND status = 'Error'`,
        [now, kioskId, lockerId, locker.version]
      );

      if (result.changes === 0) {
        console.error(`❌ Failed to recover locker ${lockerId} from error state`);
        return false;
      }

      // Broadcast state update
      await this.broadcastStateUpdate(kioskId, lockerId, 'Free');

      // Log the recovery event
      await this.logEvent(kioskId, lockerId, EventType.ERROR_RESOLVED, {
        previous_status: 'Error'
      });

      console.log(`✅ Locker ${lockerId} recovered from error state`);
      return true;

    } catch (error) {
      console.error(`❌ Error recovering locker ${lockerId} from hardware error:`, error);
      return false;
    }
  }

  /**
   * Get locker by kiosk and locker ID
   */
  async getLocker(kioskId: string, lockerId: number): Promise<Locker | null> {
    if (this.dbManager) {
      const connection = this.dbManager.getConnection();
      const result = await connection.get(
        'SELECT * FROM lockers WHERE kiosk_id = ? AND id = ?',
        [kioskId, lockerId]
      ) as Locker;
      return result || null;
    } else {
      const result = await this.db.get<Locker>(
        'SELECT * FROM lockers WHERE kiosk_id = ? AND id = ?',
        [kioskId, lockerId]
      );
      return result || null;
    }
  }

  /**
   * Get all lockers for a kiosk
   */
  async getKioskLockers(kioskId: string): Promise<Locker[]> {
    return await this.db.all<Locker>(
      'SELECT * FROM lockers WHERE kiosk_id = ? ORDER BY id',
      [kioskId]
    );
  }

  /**
   * Get all lockers with optional filtering
   */
  async getAllLockers(kioskId?: string, status?: string): Promise<Locker[]> {
    let query = 'SELECT * FROM lockers';
    const params: any[] = [];

    const conditions = [];
    if (kioskId) {
      conditions.push('kiosk_id = ?');
      params.push(kioskId);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY kiosk_id, id';

    if (this.dbManager) {
      const connection = this.dbManager.getConnection();
      return await connection.all(query, params) as Locker[];
    } else {
      return await this.db.all<Locker>(query, params);
    }
  }

  /**
   * Get available (Free) lockers, excluding Blocked, Owned, and VIP lockers
   * As per requirements 1.3, 1.4, 1.5 - filters out Blocked and Owned lockers
   */
  async getAvailableLockers(kioskId: string): Promise<Locker[]> {
    return await this.db.all<Locker>(
      `SELECT * FROM lockers 
       WHERE kiosk_id = ? AND status = 'Free' AND is_vip = 0 
       ORDER BY id`,
      [kioskId]
    );
  }

  /**
   * Find locker by owner key (RFID card or device ID)
   */
  async findLockerByOwner(ownerKey: string, ownerType: OwnerType): Promise<Locker | null> {
    const result = await this.db.get<Locker>(
      'SELECT * FROM lockers WHERE owner_key = ? AND owner_type = ? AND status IN (?, ?)',
      [ownerKey, ownerType, 'Owned', 'Opening']
    );
    return result || null;
  }

  /**
   * Assign locker to owner (Free -> Owned transition)
   * Enforces "one card, one locker" rule
   */
  async assignLocker(
    kioskId: string, 
    lockerId: number, 
    ownerType: OwnerType, 
    ownerKey: string
  ): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker) {
      return false;
    }

    // Validate state transition
    if (!this.isValidTransition(locker.status, 'Owned', 'assign')) {
      return false;
    }

    // Check conditions: not VIP and no existing ownership
    if (locker.is_vip) {
      return false;
    }

    // Enforce "one card, one locker" rule
    const existingLocker = await this.findLockerByOwner(ownerKey, ownerType);
    if (existingLocker) {
      return false;
    }

    try {
      const now = new Date().toISOString();
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Owned', owner_type = ?, owner_key = ?, 
             reserved_at = ?, version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ? AND status IN ('Free', 'Free')`,
        [
          ownerType, 
          ownerKey, 
          now,
          now,
          kioskId, 
          lockerId, 
          locker.version
        ]
      );

      if (result.changes === 0) {
        // Optimistic locking failed or status changed
        return false;
      }

      // Broadcast state update
      await this.broadcastStateUpdate(kioskId, lockerId, 'Owned', ownerKey, ownerType);

      // Log the assignment event
      await this.logEvent(kioskId, lockerId, EventType.RFID_ASSIGN, {
        owner_type: ownerType,
        owner_key: ownerKey,
        previous_status: 'Free'
      });

      return true;
    } catch (error) {
      console.error('Error assigning locker:', error);
      return false;
    }
  }

  /**
   * Confirm locker ownership after successful hardware operation
   * Keeps the locker in 'Owned' status (no status change needed)
   */
  async confirmOwnership(kioskId: string, lockerId: number): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker || locker.status !== 'Owned') {
      return false;
    }

    try {
      // Update the owned_at timestamp to confirm successful opening
      // but keep status as 'Owned' since the locker is successfully assigned
      const result = await this.db.run(
        `UPDATE lockers 
         SET owned_at = ?, version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ?`,
        [
          new Date().toISOString(),
          new Date().toISOString(),
          kioskId, 
          lockerId, 
          locker.version
        ]
      );

      if (result.changes > 0) {
        // Broadcast state update - keep status as 'Owned'
        await this.broadcastStateUpdate(kioskId, lockerId, 'Owned', locker.owner_key, locker.owner_type);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error confirming ownership:', error);
      return false;
    }
  }

  /**
   * Release locker (Opening/Owned -> Free transition)
   * Immediate ownership removal as per requirements
   */
  async releaseLocker(
    kioskId: string,
    lockerId: number,
    ownerKey?: string,
    ownerType?: OwnerType | null,
    options: ReleaseOptions = {}
  ): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker) {
      return false;
    }

    // Allow release from any status for staff operations
    if (locker.status === 'Free') {
      return true; // Already free
    }

    // If owner key is provided, validate ownership
    if (ownerKey && locker.owner_key !== ownerKey) {
      return false;
    }

    if (ownerType && locker.owner_type !== ownerType) {
      return false;
    }

    try {
      const now = new Date().toISOString();
      const resolvedOwnerType = (ownerType || locker.owner_type) as OwnerType | undefined;

      const runRelease = async (connection: DatabaseConnection) => {
        const result = await connection.run(
          `UPDATE lockers
           SET status = 'Free', owner_type = NULL, owner_key = NULL,
               reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ?`,
          [now, kioskId, lockerId, locker.version]
        );

        if (result.changes > 0) {
          await this.broadcastStateUpdate(kioskId, lockerId, 'Free');

          const eventType = options.eventType
            || (resolvedOwnerType === 'rfid' ? EventType.RFID_RELEASE : EventType.QR_RELEASE);

          const logDetails: Record<string, any> = {
            owner_type: resolvedOwnerType || locker.owner_type,
            owner_key: locker.owner_key,
            previous_status: locker.status
          };

          if (options.triggeredBy) {
            logDetails.triggered_by = options.triggeredBy;
          }
          if (options.reason) {
            logDetails.reason = options.reason;
          }
          if (options.metadata) {
            Object.assign(logDetails, options.metadata);
          }

          await this.logEvent(kioskId, lockerId, eventType, logDetails, options.staffUser);
          return true;
        }

        return false;
      };

      if (this.dbManager) {
        const connection = this.dbManager.getConnection();
        const success = await runRelease(connection);
        if (success) {
          return true;
        }
      } else if (this.db) {
        const success = await runRelease(this.db);
        if (success) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error releasing locker:', error);
      return false;
    }
  }

  /**
   * Block locker (any status -> Blocked)
   */
  async blockLocker(kioskId: string, lockerId: number, staffUser?: string, reason?: string): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker) {
      return false;
    }

    try {
      const now = new Date().toISOString();
      
      if (this.dbManager) {
        const connection = this.dbManager.getConnection();
        const result = await connection.run(
          `UPDATE lockers 
           SET status = 'Blocked', version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ?`,
          [now, kioskId, lockerId, locker.version]
        );

        if (result.changes > 0) {
          // Broadcast state update
          await this.broadcastStateUpdate(kioskId, lockerId, 'Blocked');
          
          // Log the block event
          await this.logEvent(kioskId, lockerId, EventType.STAFF_BLOCK, {
            reason: reason || 'Manual block',
            previous_status: locker.status
          }, staffUser);
          return true;
        }
      } else {
        const result = await this.db.run(
          `UPDATE lockers 
           SET status = 'Blocked', version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ?`,
          [now, kioskId, lockerId, locker.version]
        );

        if (result.changes > 0) {
          // Broadcast state update
          await this.broadcastStateUpdate(kioskId, lockerId, 'Blocked');
          
          // Log the block event
          await this.logEvent(kioskId, lockerId, EventType.STAFF_BLOCK, {
            reason: reason || 'Manual block',
            previous_status: locker.status
          }, staffUser);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error blocking locker:', error);
      return false;
    }
  }

  /**
   * Unblock locker (Blocked -> Free)
   */
  async unblockLocker(kioskId: string, lockerId: number, staffUser?: string): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker || locker.status !== 'Blocked') {
      return false;
    }

    try {
      const now = new Date().toISOString();
      
      if (this.dbManager) {
        const connection = this.dbManager.getConnection();
        const result = await connection.run(
          `UPDATE lockers 
           SET status = 'Free', owner_type = NULL, owner_key = NULL, 
               reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ?`,
          [now, kioskId, lockerId, locker.version]
        );

        if (result.changes > 0) {
          // Broadcast state update
          await this.broadcastStateUpdate(kioskId, lockerId, 'Free');
          
          // Log the unblock event
          await this.logEvent(kioskId, lockerId, EventType.STAFF_UNBLOCK, {
            previous_status: 'Blocked'
          }, staffUser);
          return true;
        }
      } else {
        const result = await this.db.run(
          `UPDATE lockers 
           SET status = 'Free', owner_type = NULL, owner_key = NULL, 
               reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ?`,
          [now, kioskId, lockerId, locker.version]
        );

        if (result.changes > 0) {
          // Broadcast state update
          await this.broadcastStateUpdate(kioskId, lockerId, 'Free');
          
          // Log the unblock event
          await this.logEvent(kioskId, lockerId, EventType.STAFF_UNBLOCK, {
            previous_status: 'Blocked'
          }, staffUser);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error unblocking locker:', error);
      return false;
    }
  }

  /**
   * Clean up expired reservations - DISABLED
   * This method has been disabled per user request - no automatic timeouts
   */
  private async getAutoReleaseHours(): Promise<number | null> {
    if (this.options.autoReleaseHoursOverride !== undefined) {
      const override = this.options.autoReleaseHoursOverride;
      return typeof override === 'number' && override > 0 ? override : null;
    }

    try {
      if (!this.configInitialized) {
        await this.configManager.initialize();
        this.configInitialized = true;
      } else if (process.env.NODE_ENV !== 'test') {
        await this.configManager.loadConfiguration();
      }

      const config = this.configManager.getConfiguration();
      const hours = config.lockers?.auto_release_hours;
      if (typeof hours === 'number' && hours > 0) {
        return hours;
      }
    } catch (error) {
      console.warn('⚠️  Unable to read auto-release configuration:', error);
    }

    return null;
  }

  async cleanupExpiredReservations(): Promise<number> {
    try {
      const autoReleaseHours = await this.getAutoReleaseHours();
      if (!autoReleaseHours || autoReleaseHours <= 0) {
        console.log('⏸️ Automatic locker cleanup skipped - auto_release_hours disabled or not configured');
        return 0;
      }

      const cutoffIso = new Date(Date.now() - autoReleaseHours * 3600 * 1000).toISOString();

      const expiredLockers = await this.db.all<Locker>(
        `SELECT * FROM lockers
         WHERE status IN ('Owned', 'Opening')
           AND is_vip = 0
           AND (owner_type IS NULL OR owner_type != 'vip')
           AND (
             (owned_at IS NOT NULL AND owned_at <= ?)
             OR (owned_at IS NULL AND reserved_at IS NOT NULL AND reserved_at <= ?)
           )`,
        [cutoffIso, cutoffIso]
      );

      if (!expiredLockers || expiredLockers.length === 0) {
        return 0;
      }

      let releasedCount = 0;

      for (const locker of expiredLockers) {
        const releaseSuccess = await this.releaseLocker(
          locker.kiosk_id,
          locker.id,
          undefined,
          locker.owner_type as OwnerType | undefined,
          {
            eventType: EventType.AUTO_RELEASE,
            triggeredBy: 'auto_release',
            reason: `auto_release_after_${autoReleaseHours}_hours`,
            metadata: {
              cutoff: cutoffIso,
              reserved_at: locker.reserved_at,
              owned_at: locker.owned_at
            }
          }
        );

        if (releaseSuccess) {
          releasedCount++;
        }
      }

      if (releasedCount > 0) {
        console.log(
          `✅ Auto-release cleaned up ${releasedCount} locker(s) exceeding ${autoReleaseHours} hour(s)`
        );
      }

      return releasedCount;
    } catch (error) {
      console.error('❌ Error during automatic locker cleanup:', error);
      return 0;
    }
  }

  /**
   * Initialize lockers for a kiosk (create default locker entries)
   */
  async initializeKioskLockers(kioskId: string, lockerCount: number = 30): Promise<void> {
    const existingLockers = await this.getKioskLockers(kioskId);
    if (existingLockers.length > 0) {
      console.log(`Kiosk ${kioskId} already has ${existingLockers.length} lockers`);
      return;
    }

    console.log(`Initializing ${lockerCount} lockers for kiosk ${kioskId}`);

    for (let i = 1; i <= lockerCount; i++) {
      await this.db.run(
        `INSERT INTO lockers (kiosk_id, id, status, version) 
         VALUES (?, ?, 'Free', 1)`,
        [kioskId, i]
      );
    }

    console.log(`✓ Initialized ${lockerCount} lockers for kiosk ${kioskId}`);
  }

  /**
   * Sync lockers with hardware configuration
   * Adds missing lockers if hardware config has more channels than database
   */
  async syncLockersWithHardware(kioskId: string, targetLockerCount: number): Promise<void> {
    const existingLockers = await this.getKioskLockers(kioskId);
    const currentCount = existingLockers.length;
    
    if (currentCount >= targetLockerCount) {
      console.log(`✅ Kiosk ${kioskId} already has ${currentCount} lockers (target: ${targetLockerCount})`);
      return;
    }

    const missingCount = targetLockerCount - currentCount;
    console.log(`🔧 Syncing kiosk ${kioskId}: adding ${missingCount} missing lockers (${currentCount} → ${targetLockerCount})`);

    // Find the highest existing locker ID to continue from there
    const maxId = existingLockers.length > 0 ? Math.max(...existingLockers.map(l => l.id)) : 0;
    
    for (let i = maxId + 1; i <= targetLockerCount; i++) {
      await this.db.run(
        `INSERT INTO lockers (kiosk_id, id, status, version, created_at, updated_at) 
         VALUES (?, ?, 'Free', 1, datetime('now'), datetime('now'))`,
        [kioskId, i]
      );
      console.log(`✅ Added locker ${i} to kiosk ${kioskId}`);
    }

    console.log(`🎯 Successfully synced kiosk ${kioskId}: now has ${targetLockerCount} lockers`);
  }

  /**
   * Get locker statistics for a kiosk
   */
  async getKioskStats(kioskId: string): Promise<{
    total: number;
    bos: number;
    dolu: number;
    aciliyor: number;
    hata: number;
    engelli: number;
    vip: number;
  }> {
    const stats = await this.db.get<any>(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'Free' THEN 1 ELSE 0 END) as bos,
         SUM(CASE WHEN status = 'Owned' THEN 1 ELSE 0 END) as dolu,
         SUM(CASE WHEN status = 'Opening' THEN 1 ELSE 0 END) as aciliyor,
         SUM(CASE WHEN status = 'Error' THEN 1 ELSE 0 END) as hata,
         SUM(CASE WHEN status = 'Blocked' THEN 1 ELSE 0 END) as engelli,
         SUM(CASE WHEN is_vip = 1 THEN 1 ELSE 0 END) as vip
       FROM lockers WHERE kiosk_id = ?`,
      [kioskId]
    );

    return {
      total: stats.total || 0,
      bos: stats.bos || 0,
      dolu: stats.dolu || 0,
      aciliyor: stats.aciliyor || 0,
      hata: stats.hata || 0,
      engelli: stats.engelli || 0,
      vip: stats.vip || 0
    };
  }

  /**
   * Check if a card already owns a locker (enforces one card, one locker rule)
   */
  async checkExistingOwnership(ownerKey: string, ownerType: OwnerType): Promise<Locker | null> {
    return await this.findLockerByOwner(ownerKey, ownerType);
  }

  /**
   * Validate ownership for a specific locker
   */
  async validateOwnership(kioskId: string, lockerId: number, ownerKey: string, ownerType: OwnerType): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    return locker?.owner_key === ownerKey && locker?.owner_type === ownerType;
  }

  /**
   * Get all valid state transitions
   */
  getValidTransitions(): LockerStateTransition[] {
    return [...this.STATE_TRANSITIONS];
  }

  /**
   * Get possible next states for a given current state
   */
  getPossibleNextStates(currentStatus: LockerStatus): LockerStatus[] {
    return this.STATE_TRANSITIONS
      .filter(transition => transition.from === currentStatus)
      .map(transition => transition.to);
  }

  /**
   * Force state transition (for staff operations)
   */
  async forceStateTransition(
    kioskId: string, 
    lockerId: number, 
    newStatus: LockerStatus, 
    staffUser: string, 
    reason: string
  ): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker) {
      return false;
    }

    try {
      const now = new Date().toISOString();
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = ?, version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ?`,
        [newStatus, now, kioskId, lockerId, locker.version]
      );

      if (result.changes > 0) {
        // Log the forced transition
        await this.logEvent(kioskId, lockerId, EventType.STAFF_OPEN, {
          previous_status: locker.status,
          new_status: newStatus,
          reason: reason,
          forced_transition: true
        }, staffUser);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error forcing state transition:', error);
      return false;
    }
  }

  /**
   * Get locker state history (for debugging and auditing)
   */
  async getLockerHistory(kioskId: string, lockerId: number, limit: number = 50): Promise<any[]> {
    return await this.db.all(
      `SELECT * FROM events 
       WHERE kiosk_id = ? AND locker_id = ? 
       ORDER BY timestamp DESC 
       LIMIT ?`,
      [kioskId, lockerId, limit]
    );
  }

  /**
   * Set locker to error state (any status -> Error)
   */
  async setLockerError(kioskId: string, lockerId: number, errorReason: string, staffUser?: string): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker) {
      return false;
    }

    try {
      const now = new Date().toISOString();
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Error', version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ?`,
        [now, kioskId, lockerId, locker.version]
      );

      if (result.changes > 0) {
        // Broadcast state update
        await this.broadcastStateUpdate(kioskId, lockerId, 'Error');
        
        // Log the error event
        await this.logEvent(kioskId, lockerId, EventType.COMMAND_FAILED, {
          error_reason: errorReason,
          previous_status: locker.status
        }, staffUser);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error setting locker error state:', error);
      return false;
    }
  }

  /**
   * Resolve locker error (Error -> Free)
   */
  async resolveLockerError(kioskId: string, lockerId: number, staffUser?: string): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker || locker.status !== 'Error') {
      return false;
    }

    try {
      const now = new Date().toISOString();
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Free', owner_type = NULL, owner_key = NULL, 
             reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ?`,
        [now, kioskId, lockerId, locker.version]
      );

      if (result.changes > 0) {
        // Broadcast state update
        await this.broadcastStateUpdate(kioskId, lockerId, 'Free');
        
        // Log the resolution event
        await this.logEvent(kioskId, lockerId, EventType.STAFF_OPEN, {
          previous_status: 'Error',
          reason: 'error_resolved'
        }, staffUser);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error resolving locker error:', error);
      return false;
    }
  }

  /**
   * Get enhanced locker data with display names
   */
  async getEnhancedLocker(kioskId: string, lockerId: number): Promise<Locker & { displayName: string } | null> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker) {
      return null;
    }

    const displayName = await this.namingService.getDisplayName(kioskId, lockerId);
    
    return {
      ...locker,
      displayName
    };
  }

  /**
   * Get all enhanced lockers with display names
   */
  async getEnhancedKioskLockers(kioskId: string): Promise<Array<Locker & { displayName: string }>> {
    const lockers = await this.getKioskLockers(kioskId);
    
    const enhancedLockers = await Promise.all(
      lockers.map(async (locker) => {
        const displayName = await this.namingService.getDisplayName(kioskId, locker.id);
        return {
          ...locker,
          displayName
        };
      })
    );

    return enhancedLockers;
  }

  /**
   * Get available lockers with display names
   */
  async getEnhancedAvailableLockers(kioskId: string): Promise<Array<Locker & { displayName: string }>> {
    const lockers = await this.getAvailableLockers(kioskId);
    
    const enhancedLockers = await Promise.all(
      lockers.map(async (locker) => {
        const displayName = await this.namingService.getDisplayName(kioskId, locker.id);
        return {
          ...locker,
          displayName
        };
      })
    );

    return enhancedLockers;
  }

  /**
   * Initialize WebSocket service
   */
  public initializeWebSocket(port: number = 8080): void {
    try {
      webSocketService.initialize(port);
      console.log(`🚀 WebSocket service initialized for real-time state updates`);
    } catch (error) {
      console.error('🚨 Failed to initialize WebSocket service:', error);
    }
  }

  /**
   * Get WebSocket connection status
   */
  public getWebSocketStatus(): { connected: boolean; clientCount: number } {
    const status = webSocketService.getConnectionStatus();
    return {
      connected: status.status === 'online',
      clientCount: status.connectedClients
    };
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.stopCleanupTimer();
    // Perform final cleanup
    await this.cleanupExpiredReservations();
    // Shutdown WebSocket service
    webSocketService.shutdown();
  }

  /**
   * Log an event
   */
  private async logEvent(
    kioskId: string, 
    lockerId: number, 
    eventType: EventType, 
    details: any, 
    staffUser?: string
  ): Promise<void> {
    if (this.dbManager) {
      const connection = this.dbManager.getConnection();
      await connection.run(
        `INSERT INTO events (kiosk_id, locker_id, event_type, details, staff_user) 
         VALUES (?, ?, ?, ?, ?)`,
        [kioskId, lockerId, eventType, JSON.stringify(details), staffUser || null]
      );
    } else {
      await this.db.run(
        `INSERT INTO events (kiosk_id, locker_id, event_type, details, staff_user) 
         VALUES (?, ?, ?, ?, ?)`,
        [kioskId, lockerId, eventType, JSON.stringify(details), staffUser || null]
      );
    }
  }
}
