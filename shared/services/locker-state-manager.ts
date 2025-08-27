import { DatabaseConnection } from '../database/connection';
import { Locker, LockerStatus, OwnerType, EventType, LockerStateTransition, LockerStateUpdate } from '../types/core-entities';
import { webSocketService } from './websocket-service';
import { LockerNamingService } from './locker-naming-service';

export class LockerStateManager {
  private db: DatabaseConnection;
  private dbManager: any;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly RESERVE_TIMEOUT_SECONDS = 90;
  private namingService: LockerNamingService;

  // Define valid state transitions using Turkish state names
  private readonly STATE_TRANSITIONS: LockerStateTransition[] = [
    { from: 'Boş', to: 'Dolu', trigger: 'assign', conditions: ['not_vip', 'no_existing_ownership'] },
    { from: 'Dolu', to: 'Açılıyor', trigger: 'confirm_opening', conditions: ['same_owner'] },
    { from: 'Dolu', to: 'Boş', trigger: 'timeout', conditions: ['expired_90_seconds'] },
    { from: 'Dolu', to: 'Boş', trigger: 'release', conditions: ['same_owner'] },
    { from: 'Açılıyor', to: 'Boş', trigger: 'release', conditions: ['same_owner'] },
    { from: 'Boş', to: 'Engelli', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Dolu', to: 'Engelli', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Açılıyor', to: 'Engelli', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Hata', to: 'Engelli', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Engelli', to: 'Boş', trigger: 'staff_unblock', conditions: ['staff_action'] },
    { from: 'Boş', to: 'Hata', trigger: 'hardware_error', conditions: ['system_error'] },
    { from: 'Dolu', to: 'Hata', trigger: 'hardware_error', conditions: ['system_error'] },
    { from: 'Açılıyor', to: 'Hata', trigger: 'hardware_error', conditions: ['system_error'] },
    { from: 'Hata', to: 'Boş', trigger: 'error_resolved', conditions: ['system_recovery'] }
  ];

  constructor(dbManager?: any) {
    if (dbManager) {
      this.dbManager = dbManager;
      this.db = dbManager.getConnection().getDatabase();
    } else {
      this.db = DatabaseConnection.getInstance();
    }
    this.namingService = new LockerNamingService(dbManager);
    this.startCleanupTimer();
  }

  /**
   * Broadcast locker state update via WebSocket
   */
  private async broadcastStateUpdate(kioskId: string, lockerId: number, newState: LockerStatus, ownerKey?: string, ownerType?: OwnerType): Promise<void> {
    try {
      const displayName = await this.namingService.getDisplayName(kioskId, lockerId);
      
      const update: LockerStateUpdate = {
        kioskId,
        lockerId,
        displayName,
        state: newState,
        lastChanged: new Date(),
        ownerKey,
        ownerType
      };

      webSocketService.broadcastStateUpdate(update);
    } catch (error) {
      console.error('Error broadcasting state update:', error);
    }
  }

  /**
   * Start automatic cleanup of expired reservations
   */
  private startCleanupTimer(): void {
    // Run cleanup every 30 seconds
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredReservations();
      } catch (error) {
        console.error('Error during automatic cleanup:', error);
      }
    }, 30000);
  }

  /**
   * Stop automatic cleanup timer
   */
  public stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
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
      if (!this.isValidTransition(locker.status, 'Hata', 'hardware_error')) {
        console.warn(`⚠️ Invalid transition from ${locker.status} to Hata for locker ${lockerId}`);
        return false;
      }

      const now = new Date().toISOString();
      
      // Update locker to error state and clear ownership
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Hata', 
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
      await this.broadcastStateUpdate(kioskId, lockerId, 'Hata');

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
      if (!this.isValidTransition(locker.status, 'Boş', 'error_resolved')) {
        console.warn(`⚠️ Invalid transition from ${locker.status} to Boş for locker ${lockerId}`);
        return false;
      }

      const now = new Date().toISOString();
      
      // Update locker to available state
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Boş', 
             version = version + 1, 
             updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ? AND status = 'Hata'`,
        [now, kioskId, lockerId, locker.version]
      );

      if (result.changes === 0) {
        console.error(`❌ Failed to recover locker ${lockerId} from error state`);
        return false;
      }

      // Broadcast state update
      await this.broadcastStateUpdate(kioskId, lockerId, 'Boş');

      // Log the recovery event
      await this.logEvent(kioskId, lockerId, EventType.ERROR_RESOLVED, {
        previous_status: 'Hata'
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
   * Get available (Boş) lockers, excluding Engelli, Dolu, and VIP lockers
   * As per requirements 1.3, 1.4, 1.5 - filters out Engelli and Dolu lockers
   */
  async getAvailableLockers(kioskId: string): Promise<Locker[]> {
    return await this.db.all<Locker>(
      `SELECT * FROM lockers 
       WHERE kiosk_id = ? AND status = 'Boş' AND is_vip = 0 
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
      [ownerKey, ownerType, 'Dolu', 'Açılıyor']
    );
    return result || null;
  }

  /**
   * Assign locker to owner (Boş -> Dolu transition)
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
    if (!this.isValidTransition(locker.status, 'Dolu', 'assign')) {
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
         SET status = 'Dolu', owner_type = ?, owner_key = ?, 
             reserved_at = ?, version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ? AND status = 'Boş'`,
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
      await this.broadcastStateUpdate(kioskId, lockerId, 'Dolu', ownerKey, ownerType);

      // Log the assignment event
      await this.logEvent(kioskId, lockerId, EventType.RFID_ASSIGN, {
        owner_type: ownerType,
        owner_key: ownerKey,
        previous_status: 'Boş'
      });

      return true;
    } catch (error) {
      console.error('Error assigning locker:', error);
      return false;
    }
  }

  /**
   * Confirm locker ownership (Dolu -> Açılıyor)
   */
  async confirmOwnership(kioskId: string, lockerId: number): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker || locker.status !== 'Dolu') {
      return false;
    }

    try {
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Açılıyor', owned_at = ?, version = version + 1, updated_at = ?
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
        // Broadcast state update
        await this.broadcastStateUpdate(kioskId, lockerId, 'Açılıyor', locker.owner_key, locker.owner_type);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error confirming ownership:', error);
      return false;
    }
  }

  /**
   * Release locker (Açılıyor/Dolu -> Boş transition)
   * Immediate ownership removal as per requirements
   */
  async releaseLocker(kioskId: string, lockerId: number, ownerKey?: string): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker) {
      return false;
    }

    // Allow release from any status for staff operations
    if (locker.status === 'Boş') {
      return true; // Already free
    }

    // If owner key is provided, validate ownership
    if (ownerKey && locker.owner_key !== ownerKey) {
      return false;
    }

    try {
      const now = new Date().toISOString();
      
      if (this.dbManager) {
        const connection = this.dbManager.getConnection();
        const result = await connection.run(
          `UPDATE lockers 
           SET status = 'Boş', owner_type = NULL, owner_key = NULL, 
               reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ?`,
          [now, kioskId, lockerId, locker.version]
        );

        if (result.changes > 0) {
          // Broadcast state update
          await this.broadcastStateUpdate(kioskId, lockerId, 'Boş');
          
          // Log the release event
          const eventType = locker.owner_type === 'rfid' ? EventType.RFID_RELEASE : EventType.QR_RELEASE;
          await this.logEvent(kioskId, lockerId, eventType, {
            owner_type: locker.owner_type,
            owner_key: locker.owner_key,
            previous_status: locker.status
          });
          return true;
        }
      } else {
        const result = await this.db.run(
          `UPDATE lockers 
           SET status = 'Boş', owner_type = NULL, owner_key = NULL, 
               reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ? AND status IN ('Dolu', 'Açılıyor')`,
          [now, kioskId, lockerId, locker.version]
        );

        if (result.changes > 0) {
          // Broadcast state update
          await this.broadcastStateUpdate(kioskId, lockerId, 'Boş');
          
          // Log the release event
          const eventType = locker.owner_type === 'rfid' ? EventType.RFID_RELEASE : EventType.QR_RELEASE;
          await this.logEvent(kioskId, lockerId, eventType, {
            owner_type: locker.owner_type,
            owner_key: locker.owner_key,
            previous_status: locker.status
          });
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
   * Block locker (any status -> Engelli)
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
           SET status = 'Engelli', version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ?`,
          [now, kioskId, lockerId, locker.version]
        );

        if (result.changes > 0) {
          // Broadcast state update
          await this.broadcastStateUpdate(kioskId, lockerId, 'Engelli');
          
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
           SET status = 'Engelli', version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ?`,
          [now, kioskId, lockerId, locker.version]
        );

        if (result.changes > 0) {
          // Broadcast state update
          await this.broadcastStateUpdate(kioskId, lockerId, 'Engelli');
          
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
   * Unblock locker (Engelli -> Boş)
   */
  async unblockLocker(kioskId: string, lockerId: number, staffUser?: string): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker || locker.status !== 'Engelli') {
      return false;
    }

    try {
      const now = new Date().toISOString();
      
      if (this.dbManager) {
        const connection = this.dbManager.getConnection();
        const result = await connection.run(
          `UPDATE lockers 
           SET status = 'Boş', owner_type = NULL, owner_key = NULL, 
               reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ?`,
          [now, kioskId, lockerId, locker.version]
        );

        if (result.changes > 0) {
          // Broadcast state update
          await this.broadcastStateUpdate(kioskId, lockerId, 'Boş');
          
          // Log the unblock event
          await this.logEvent(kioskId, lockerId, EventType.STAFF_UNBLOCK, {
            previous_status: 'Engelli'
          }, staffUser);
          return true;
        }
      } else {
        const result = await this.db.run(
          `UPDATE lockers 
           SET status = 'Boş', owner_type = NULL, owner_key = NULL, 
               reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ?`,
          [now, kioskId, lockerId, locker.version]
        );

        if (result.changes > 0) {
          // Broadcast state update
          await this.broadcastStateUpdate(kioskId, lockerId, 'Boş');
          
          // Log the unblock event
          await this.logEvent(kioskId, lockerId, EventType.STAFF_UNBLOCK, {
            previous_status: 'Engelli'
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
   * Clean up expired reservations (Dolu > 90 seconds -> Boş)
   * Automatic timeout transition as per state machine
   */
  async cleanupExpiredReservations(): Promise<number> {
    const expiredThreshold = new Date(Date.now() - this.RESERVE_TIMEOUT_SECONDS * 1000);
    
    try {
      // First, get the expired reservations for logging
      const expiredLockers = await this.db.all<Locker>(
        `SELECT * FROM lockers 
         WHERE status = 'Dolu' AND reserved_at < ?`,
        [expiredThreshold.toISOString()]
      );

      // Ensure expiredLockers is an array
      if (!Array.isArray(expiredLockers) || expiredLockers.length === 0) {
        return 0;
      }

      // Update expired reservations to Boş status
      const now = new Date().toISOString();
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Boş', owner_type = NULL, owner_key = NULL, 
             reserved_at = NULL, version = version + 1, updated_at = ?
         WHERE status = 'Dolu' AND reserved_at < ?`,
        [now, expiredThreshold.toISOString()]
      );

      // Log cleanup events and broadcast updates for each expired locker
      for (const locker of expiredLockers) {
        // Broadcast state update
        await this.broadcastStateUpdate(locker.kiosk_id, locker.id, 'Boş');
        
        await this.logEvent(locker.kiosk_id, locker.id, EventType.RFID_RELEASE, {
          owner_type: locker.owner_type,
          owner_key: locker.owner_key,
          previous_status: 'Dolu',
          reason: 'timeout_cleanup',
          timeout_seconds: this.RESERVE_TIMEOUT_SECONDS
        });
      }

      if (result.changes > 0) {
        console.log(`Cleaned up ${result.changes} expired reservations`);
      }

      return result.changes;
    } catch (error) {
      console.error('Error cleaning up expired reservations:', error);
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
         VALUES (?, ?, 'Boş', 1)`,
        [kioskId, i]
      );
    }

    console.log(`✓ Initialized ${lockerCount} lockers for kiosk ${kioskId}`);
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
         SUM(CASE WHEN status = 'Boş' THEN 1 ELSE 0 END) as bos,
         SUM(CASE WHEN status = 'Dolu' THEN 1 ELSE 0 END) as dolu,
         SUM(CASE WHEN status = 'Açılıyor' THEN 1 ELSE 0 END) as aciliyor,
         SUM(CASE WHEN status = 'Hata' THEN 1 ELSE 0 END) as hata,
         SUM(CASE WHEN status = 'Engelli' THEN 1 ELSE 0 END) as engelli,
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
   * Set locker to error state (any status -> Hata)
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
         SET status = 'Hata', version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ?`,
        [now, kioskId, lockerId, locker.version]
      );

      if (result.changes > 0) {
        // Broadcast state update
        await this.broadcastStateUpdate(kioskId, lockerId, 'Hata');
        
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
   * Resolve locker error (Hata -> Boş)
   */
  async resolveLockerError(kioskId: string, lockerId: number, staffUser?: string): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker || locker.status !== 'Hata') {
      return false;
    }

    try {
      const now = new Date().toISOString();
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Boş', owner_type = NULL, owner_key = NULL, 
             reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ?`,
        [now, kioskId, lockerId, locker.version]
      );

      if (result.changes > 0) {
        // Broadcast state update
        await this.broadcastStateUpdate(kioskId, lockerId, 'Boş');
        
        // Log the resolution event
        await this.logEvent(kioskId, lockerId, EventType.STAFF_OPEN, {
          previous_status: 'Hata',
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
