import { DatabaseConnection } from '../database/connection.js';
import { Locker, LockerStatus, OwnerType, EventType } from '../types/core-entities.js';

export class LockerStateManager {
  private db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  /**
   * Get locker by kiosk and locker ID
   */
  async getLocker(kioskId: string, lockerId: number): Promise<Locker | null> {
    return await this.db.get<Locker>(
      'SELECT * FROM lockers WHERE kiosk_id = ? AND id = ?',
      [kioskId, lockerId]
    );
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
   * Get available (Free) lockers, excluding Blocked and Reserved
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
    return await this.db.get<Locker>(
      'SELECT * FROM lockers WHERE owner_key = ? AND owner_type = ? AND status IN (?, ?)',
      [ownerKey, ownerType, 'Reserved', 'Owned']
    );
  }

  /**
   * Assign locker to owner (Reserve status)
   */
  async assignLocker(
    kioskId: string, 
    lockerId: number, 
    ownerType: OwnerType, 
    ownerKey: string
  ): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker || locker.status !== 'Free' || locker.is_vip) {
      return false;
    }

    // Check for existing ownership (one card, one locker rule)
    const existingLocker = await this.findLockerByOwner(ownerKey, ownerType);
    if (existingLocker) {
      return false;
    }

    try {
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Reserved', owner_type = ?, owner_key = ?, 
             reserved_at = ?, version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ?`,
        [
          ownerType, 
          ownerKey, 
          new Date().toISOString(),
          new Date().toISOString(),
          kioskId, 
          lockerId, 
          locker.version
        ]
      );

      if (result.changes === 0) {
        // Optimistic locking failed
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
   * Release locker (Owned/Reserved -> Free)
   */
  async releaseLocker(kioskId: string, lockerId: number): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker || !['Reserved', 'Owned'].includes(locker.status)) {
      return false;
    }

    try {
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Free', owner_type = NULL, owner_key = NULL, 
             reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ?`,
        [
          new Date().toISOString(),
          kioskId, 
          lockerId, 
          locker.version
        ]
      );

      if (result.changes > 0) {
        // Log the release event
        await this.logEvent(kioskId, lockerId, EventType.RFID_RELEASE, {
          owner_type: locker.owner_type,
          owner_key: locker.owner_key,
          previous_status: locker.status
        });
        return true;
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
  async blockLocker(kioskId: string, lockerId: number, staffUser: string, reason: string): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker) {
      return false;
    }

    try {
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Blocked', version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ?`,
        [
          new Date().toISOString(),
          kioskId, 
          lockerId, 
          locker.version
        ]
      );

      if (result.changes > 0) {
        // Log the block event
        await this.logEvent(kioskId, lockerId, EventType.STAFF_BLOCK, {
          reason,
          previous_status: locker.status
        }, staffUser);
        return true;
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
  async unblockLocker(kioskId: string, lockerId: number, staffUser: string): Promise<boolean> {
    const locker = await this.getLocker(kioskId, lockerId);
    if (!locker || locker.status !== 'Blocked') {
      return false;
    }

    try {
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Free', owner_type = NULL, owner_key = NULL, 
             reserved_at = NULL, owned_at = NULL, version = version + 1, updated_at = ?
         WHERE kiosk_id = ? AND id = ? AND version = ?`,
        [
          new Date().toISOString(),
          kioskId, 
          lockerId, 
          locker.version
        ]
      );

      if (result.changes > 0) {
        // Log the unblock event
        await this.logEvent(kioskId, lockerId, EventType.STAFF_UNBLOCK, {
          previous_status: 'Blocked'
        }, staffUser);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error unblocking locker:', error);
      return false;
    }
  }

  /**
   * Clean up expired reservations (Reserved > 90 seconds -> Free)
   */
  async cleanupExpiredReservations(): Promise<number> {
    const expiredThreshold = new Date(Date.now() - 90 * 1000); // 90 seconds ago
    
    try {
      const result = await this.db.run(
        `UPDATE lockers 
         SET status = 'Free', owner_type = NULL, owner_key = NULL, 
             reserved_at = NULL, version = version + 1, updated_at = ?
         WHERE status = 'Reserved' AND reserved_at < ?`,
        [new Date().toISOString(), expiredThreshold.toISOString()]
      );

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
   * Log an event
   */
  private async logEvent(
    kioskId: string, 
    lockerId: number, 
    eventType: EventType, 
    details: any, 
    staffUser?: string
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO events (kiosk_id, locker_id, event_type, details, staff_user) 
       VALUES (?, ?, ?, ?, ?)`,
      [kioskId, lockerId, eventType, JSON.stringify(details), staffUser || null]
    );
  }
}