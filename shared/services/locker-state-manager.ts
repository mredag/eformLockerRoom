import { DatabaseConnection } from '../database/connection';
import { Locker, LockerStatus, OwnerType, EventType, LockerStateTransition } from '../types/core-entities';

export class LockerStateManager {
  private db: DatabaseConnection;
  private dbManager: any;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly RESERVE_TIMEOUT_SECONDS = 90;

  // Define valid state transitions
  private readonly STATE_TRANSITIONS: LockerStateTransition[] = [
    { from: 'Free', to: 'Reserved', trigger: 'assign', conditions: ['not_vip', 'no_existing_ownership'] },
    { from: 'Reserved', to: 'Owned', trigger: 'confirm_opening', conditions: ['same_owner'] },
    { from: 'Reserved', to: 'Free', trigger: 'timeout', conditions: ['expired_90_seconds'] },
    { from: 'Reserved', to: 'Free', trigger: 'release', conditions: ['same_owner'] },
    { from: 'Owned', to: 'Free', trigger: 'release', conditions: ['same_owner'] },
    { from: 'Free', to: 'Blocked', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Reserved', to: 'Blocked', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Owned', to: 'Blocked', trigger: 'staff_block', conditions: ['staff_action'] },
    { from: 'Blocked', to: 'Free', trigger: 'staff_unblock', conditions: ['staff_action'] }
  ];

  constructor(dbManager?: any) {
    if (dbManager) {
      this.dbManager = dbManager;
      this.db = dbManager.getConnection().getDatabase();
    } else {
      this.db = DatabaseConnection.getInstance();
    }
    this.startCleanupTimer();
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
   * Get locker by kiosk and locker ID
   */
  async getLocker(kioskId: string, lockerId: number): Promise<Locker | null> {
    if (this.dbManager) {
      const db = this.dbManager.getConnection().getDatabase();
      return db.prepare('SELECT * FROM lockers WHERE kiosk_id = ? AND id = ?').get(kioskId, lockerId) || null;
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
      const db = this.dbManager.getConnection().getDatabase();
      return db.prepare(query).all(...params);
    } else {
      return await this.db.all<Locker>(query, params);
    }
  }

  /**
   * Get available (Free) lockers, excluding Blocked, Reserved, and VIP lockers
   * As per requirements 1.3, 1.4, 1.5 - filters out Blocked and Reserved lockers
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
      [ownerKey, ownerType, 'Reserved', 'Owned']
    );
    return result || null;
  }

  /**
   * Assign locker to owner (Free -> Reserved transition)
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
    if (!this.isValidTransition(locker.status, 'Reserved', 'assign')) {
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
         SET status = 'Reserved', owner_type = ?, owner_key = ?, 
             reserved_at = ?, version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ? AND status = 'Free'`,
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
   * Confirm locker ownership (Reserved -> Owned)
   */
  async confirmOwnership(kioskId: string, lockerId: number): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker || locker.status !== 'Reserved') {
      return false;
    }

    try {
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Owned', owned_at = ?, version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ?`,
        [
          new Date().toISOString(),
          new Date().toISOString(),
          kioskId, 
          lockerId, 
          locker.version
        ]
      );

      return result.changes > 0;
    } catch (error) {
      console.error('Error confirming ownership:', error);
      return false;
    }
  }

  /**
   * Release locker (Owned/Reserved -> Free transition)
   * Immediate ownership removal as per requirements
   */
  async releaseLocker(kioskId: string, lockerId: number, ownerKey?: string): Promise<boolean> {
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

    try {
      const now = new Date().toISOString();
      
      if (this.dbManager) {
        const db = this.dbManager.getConnection().getDatabase();
        const result = db.prepare(
          `UPDATE lockers 
           SET status = 'Free', owner_type = NULL, owner_key = NULL, 
               reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ?`
        ).run(now, kioskId, lockerId, locker.version);

        if (result.changes > 0) {
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
           SET status = 'Free', owner_type = NULL, owner_key = NULL, 
               reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ? AND status IN ('Reserved', 'Owned')`,
          [now, kioskId, lockerId, locker.version]
        );

        if (result.changes > 0) {
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
        const db = this.dbManager.getConnection().getDatabase();
        const result = db.prepare(
          `UPDATE lockers 
           SET status = 'Blocked', version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ?`
        ).run(now, kioskId, lockerId, locker.version);

        if (result.changes > 0) {
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
        const db = this.dbManager.getConnection().getDatabase();
        const result = db.prepare(
          `UPDATE lockers 
           SET status = 'Free', owner_type = NULL, owner_key = NULL, 
               reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
           WHERE kiosk_id = ? AND id = ? AND version = ?`
        ).run(now, kioskId, lockerId, locker.version);

        if (result.changes > 0) {
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
   * Clean up expired reservations (Reserved > 90 seconds -> Free)
   * Automatic timeout transition as per state machine
   */
  async cleanupExpiredReservations(): Promise<number> {
    const expiredThreshold = new Date(Date.now() - this.RESERVE_TIMEOUT_SECONDS * 1000);
    
    try {
      // First, get the expired reservations for logging
      const expiredLockers = await this.db.all<Locker>(
        `SELECT * FROM lockers 
         WHERE status = 'Reserved' AND reserved_at < ?`,
        [expiredThreshold.toISOString()]
      );

      if (expiredLockers.length === 0) {
        return 0;
      }

      // Update expired reservations to Free status
      const now = new Date().toISOString();
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Free', owner_type = NULL, owner_key = NULL, 
             reserved_at = NULL, version = version + 1, updated_at = ?
         WHERE status = 'Reserved' AND reserved_at < ?`,
        [now, expiredThreshold.toISOString()]
      );

      // Log cleanup events for each expired locker
      for (const locker of expiredLockers) {
        await this.logEvent(locker.kiosk_id, locker.id, EventType.RFID_RELEASE, {
          owner_type: locker.owner_type,
          owner_key: locker.owner_key,
          previous_status: 'Reserved',
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
         VALUES (?, ?, 'Free', 1)`,
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
    free: number;
    reserved: number;
    owned: number;
    blocked: number;
    vip: number;
  }> {
    const stats = await this.db.get<any>(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'Free' THEN 1 ELSE 0 END) as free,
         SUM(CASE WHEN status = 'Reserved' THEN 1 ELSE 0 END) as reserved,
         SUM(CASE WHEN status = 'Owned' THEN 1 ELSE 0 END) as owned,
         SUM(CASE WHEN status = 'Blocked' THEN 1 ELSE 0 END) as blocked,
         SUM(CASE WHEN is_vip = 1 THEN 1 ELSE 0 END) as vip
       FROM lockers WHERE kiosk_id = ?`,
      [kioskId]
    );

    return {
      total: stats.total || 0,
      free: stats.free || 0,
      reserved: stats.reserved || 0,
      owned: stats.owned || 0,
      blocked: stats.blocked || 0,
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
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.stopCleanupTimer();
    // Perform final cleanup
    await this.cleanupExpiredReservations();
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
      const db = this.dbManager.getConnection().getDatabase();
      db.prepare(
        `INSERT INTO events (kiosk_id, locker_id, event_type, details, staff_user) 
         VALUES (?, ?, ?, ?, ?)`
      ).run(kioskId, lockerId, eventType, JSON.stringify(details), staffUser || null);
    } else {
      await this.db.run(
        `INSERT INTO events (kiosk_id, locker_id, event_type, details, staff_user) 
         VALUES (?, ?, ?, ?, ?)`,
        [kioskId, lockerId, eventType, JSON.stringify(details), staffUser || null]
      );
    }
  }
}
