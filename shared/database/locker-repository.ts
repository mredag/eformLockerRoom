import { BaseRepository } from './base-repository';
import { DatabaseConnection } from './connection';
import { Locker, LockerStatus, OwnerType } from '../types/core-entities';

/**
 * Defines the filtering criteria for querying locker records.
 */
export interface LockerFilter {
  kiosk_id?: string;
  status?: LockerStatus | LockerStatus[];
  owner_type?: OwnerType;
  owner_key?: string;
  is_vip?: boolean;
}

/**
 * Manages the persistence and retrieval of `Locker` entities.
 * This repository handles all database operations related to lockers, including state management,
 * ownership, and reservations. It extends `BaseRepository` but overrides several methods
 * to handle the composite primary key (`kiosk_id`, `id`).
 * @extends {BaseRepository<Locker>}
 */
export class LockerRepository extends BaseRepository<Locker> {
  /**
   * Creates an instance of LockerRepository.
   * @param {DatabaseConnection} db - The database connection instance.
   */
  constructor(db: DatabaseConnection) {
    super(db, 'lockers');
  }

  /**
   * This method is overridden to throw an error because lockers have a composite primary key.
   * Use `findByKioskAndId` instead.
   * @throws {Error} Always.
   */
  async findById(id: string | number): Promise<Locker | null> {
    throw new Error('Use findByKioskAndId for lockers');
  }

  /**
   * Finds a specific locker by its composite key (kiosk ID and locker ID).
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} lockerId - The ID of the locker within the kiosk.
   * @returns {Promise<Locker | null>} The found locker or null.
   */
  async findByKioskAndId(kioskId: string, lockerId: number): Promise<Locker | null> {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE kiosk_id = ? AND id = ?
    `;
    
    const row = await this.db.get(sql, [kioskId, lockerId]);
    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Finds all lockers that match the specified filter criteria.
   * @param {LockerFilter} [filter] - The filter to apply.
   * @returns {Promise<Locker[]>} An array of matching lockers.
   */
  async findAll(filter?: LockerFilter): Promise<Locker[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];

    if (filter) {
      const conditions: string[] = [];

      if (filter.kiosk_id) {
        conditions.push('kiosk_id = ?');
        params.push(filter.kiosk_id);
      }

      if (filter.status) {
        if (Array.isArray(filter.status)) {
          conditions.push(`status IN (${filter.status.map(() => '?').join(', ')})`);
          params.push(...filter.status);
        } else {
          conditions.push('status = ?');
          params.push(filter.status);
        }
      }

      if (filter.owner_type) {
        conditions.push('owner_type = ?');
        params.push(filter.owner_type);
      }

      if (filter.owner_key) {
        conditions.push('owner_key = ?');
        params.push(filter.owner_key);
      }

      if (filter.is_vip !== undefined) {
        conditions.push('is_vip = ?');
        params.push(filter.is_vip ? 1 : 0);
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    sql += ' ORDER BY kiosk_id, id';

    const rows = await this.db.all(sql, params);
    return rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Creates a new locker record.
   * @param {Omit<Locker, 'version' | 'created_at' | 'updated_at'>} locker - The locker data to create.
   * @returns {Promise<Locker>} The newly created locker.
   */
  async create(locker: Omit<Locker, 'version' | 'created_at' | 'updated_at'>): Promise<Locker> {
    const sql = `
      INSERT INTO ${this.tableName} (
        kiosk_id, id, status, owner_type, owner_key, 
        reserved_at, owned_at, is_vip, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `;

    const params = [
      locker.kiosk_id,
      locker.id,
      locker.status,
      locker.owner_type || null,
      locker.owner_key || null,
      locker.reserved_at || null,
      locker.owned_at || null,
      locker.is_vip ? 1 : 0
    ];

    await this.db.run(sql, params);
    
    const created = await this.findByKioskAndId(locker.kiosk_id, locker.id);
    if (!created) {
      throw new Error('Failed to create locker');
    }
    
    return created;
  }

  /**
   * This method is overridden to throw an error. Use `updateLocker` instead.
   * @throws {Error} Always.
   */
  async update(id: string | number, updates: Partial<Locker>, expectedVersion: number): Promise<Locker> {
    throw new Error('Use updateLocker method instead - requires both kiosk_id and locker_id');
  }

  /**
   * Updates a specific locker using optimistic locking.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} lockerId - The ID of the locker.
   * @param {Partial<Locker>} updates - The fields to update.
   * @param {number} expectedVersion - The version number required for the update to succeed.
   * @returns {Promise<Locker>} The updated locker.
   * @throws {OptimisticLockError} If the version check fails.
   */
  async updateLocker(
    kioskId: string, 
    lockerId: number, 
    updates: Partial<Locker>, 
    expectedVersion: number
  ): Promise<Locker> {
    const setClause: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'kiosk_id' || key === 'id' || key === 'version' || key === 'created_at' || key === 'updated_at') {
        continue;
      }

      setClause.push(`${key} = ?`);
      
      if (key === 'is_vip') {
        params.push(value ? 1 : 0);
      } else {
        params.push(value);
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push('version = version + 1');
    setClause.push('updated_at = CURRENT_TIMESTAMP');

    const sql = `
      UPDATE ${this.tableName} 
      SET ${setClause.join(', ')}
      WHERE kiosk_id = ? AND id = ? AND version = ?
    `;

    params.push(kioskId, lockerId, expectedVersion);

    await this.executeOptimisticUpdate(
      sql, 
      params, 
      'Locker', 
      `${kioskId}:${lockerId}`, 
      expectedVersion
    );

    const updated = await this.findByKioskAndId(kioskId, lockerId);
    if (!updated) {
      throw new Error('Failed to retrieve updated locker');
    }

    return updated;
  }

  /**
   * This method is overridden to throw an error. Use `deleteByKioskAndId` instead.
   * @throws {Error} Always.
   */
  async delete(id: string | number): Promise<boolean> {
    throw new Error('Use deleteByKioskAndId for lockers');
  }

  /**
   * Deletes a specific locker by its composite key.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} lockerId - The ID of the locker.
   * @returns {Promise<boolean>} True if the deletion was successful.
   */
  async deleteByKioskAndId(kioskId: string, lockerId: number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE kiosk_id = ? AND id = ?`;
    const result = await this.db.run(sql, [kioskId, lockerId]);
    return result.changes > 0;
  }

  /**
   * Finds all available lockers for a given kiosk.
   * An available locker is one with 'Free' status and is not marked as VIP.
   * @param {string} kioskId - The ID of the kiosk.
   * @returns {Promise<Locker[]>} An array of available lockers.
   */
  async findAvailable(kioskId: string): Promise<Locker[]> {
    return this.findAll({
      kiosk_id: kioskId,
      status: 'Free',
      is_vip: false
    });
  }

  /**
   * Finds the locker currently owned by a specific owner key (e.g., RFID card ID).
   * @param {string} ownerKey - The owner key to search for.
   * @returns {Promise<Locker | null>} The found locker or null.
   */
  async findByOwnerKey(ownerKey: string): Promise<Locker | null> {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE owner_key = ? AND status IN ('Owned', 'Owned')
      ORDER BY owned_at DESC, reserved_at DESC
      LIMIT 1
    `;
    
    const row = await this.db.get(sql, [ownerKey]);
    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Finds all lockers that have an expired reservation.
   * @param {number} [timeoutSeconds=90] - The reservation timeout in seconds.
   * @returns {Promise<Locker[]>} An array of lockers with expired reservations.
   */
  async findExpiredReserved(timeoutSeconds: number = 90): Promise<Locker[]> {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE status = 'Owned' 
      AND reserved_at < datetime('now', '-${timeoutSeconds} seconds')
    `;
    
    const rows = await this.db.all(sql);
    return rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Resets the state of all lockers with expired reservations back to 'Free'.
   * @param {number} [timeoutSeconds=90] - The reservation timeout in seconds.
   * @returns {Promise<number>} The number of lockers that were cleaned up.
   */
  async cleanupExpiredReservations(timeoutSeconds: number = 90): Promise<number> {
    const sql = `
      UPDATE ${this.tableName} 
      SET status = 'Free', 
          owner_type = NULL, 
          owner_key = NULL, 
          reserved_at = NULL,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'Owned' 
      AND reserved_at < datetime('now', '-${timeoutSeconds} seconds')
    `;
    
    const result = await this.db.run(sql);
    return result.changes;
  }

  /**
   * Gathers statistics about the lockers for a specific kiosk.
   * @param {string} kioskId - The ID of the kiosk.
   * @returns {Promise<object>} An object containing locker statistics.
   */
  async getStatsByKiosk(kioskId: string): Promise<{
    total: number;
    free: number;
    reserved: number;
    owned: number;
    blocked: number;
    vip: number;
  }> {
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Free' THEN 1 ELSE 0 END) as free,
        SUM(CASE WHEN status = 'Owned' THEN 1 ELSE 0 END) as reserved,
        SUM(CASE WHEN status = 'Owned' THEN 1 ELSE 0 END) as owned,
        SUM(CASE WHEN status = 'Blocked' THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN is_vip = 1 THEN 1 ELSE 0 END) as vip
      FROM ${this.tableName}
      WHERE kiosk_id = ?
    `;

    interface LockerStatsResult {
      total: number;
      free: number;
      reserved: number;
      owned: number;
      blocked: number;
      vip: number;
    }

    const result = await this.db.get<LockerStatsResult>(sql, [kioskId]);
    return {
      total: result?.total || 0,
      free: result?.free || 0,
      reserved: result?.reserved || 0,
      owned: result?.owned || 0,
      blocked: result?.blocked || 0,
      vip: result?.vip || 0
    };
  }

  /**
   * Maps a raw database row to a structured `Locker` entity.
   * @protected
   * @param {any} row - The raw data from the database.
   * @returns {Locker} The mapped entity.
   */
  protected mapRowToEntity(row: any): Locker {
    return {
      id: row.id,
      kiosk_id: row.kiosk_id,
      status: row.status as LockerStatus,
      owner_type: row.owner_type as OwnerType,
      owner_key: row.owner_key,
      reserved_at: row.reserved_at ? new Date(row.reserved_at) : undefined,
      owned_at: row.owned_at ? new Date(row.owned_at) : undefined,
      version: row.version,
      is_vip: Boolean(row.is_vip),
      display_name: row.display_name,
      name_updated_at: row.name_updated_at ? new Date(row.name_updated_at) : undefined,
      name_updated_by: row.name_updated_by,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }

  /**
   * Maps a `Locker` entity to a raw object for database insertion/updates.
   * @protected
   * @param {Partial<Locker>} entity - The entity to map.
   * @returns {Record<string, any>} The mapped raw object.
   */
  protected mapEntityToRow(entity: Partial<Locker>): Record<string, any> {
    const row: Record<string, any> = {};

    if (entity.id !== undefined) row.id = entity.id;
    if (entity.kiosk_id !== undefined) row.kiosk_id = entity.kiosk_id;
    if (entity.status !== undefined) row.status = entity.status;
    if (entity.owner_type !== undefined) row.owner_type = entity.owner_type;
    if (entity.owner_key !== undefined) row.owner_key = entity.owner_key;
    if (entity.reserved_at !== undefined) row.reserved_at = entity.reserved_at?.toISOString();
    if (entity.owned_at !== undefined) row.owned_at = entity.owned_at?.toISOString();
    if (entity.is_vip !== undefined) row.is_vip = entity.is_vip ? 1 : 0;
    if (entity.display_name !== undefined) row.display_name = entity.display_name;
    if (entity.name_updated_at !== undefined) row.name_updated_at = entity.name_updated_at?.toISOString();
    if (entity.name_updated_by !== undefined) row.name_updated_by = entity.name_updated_by;

    return row;
  }
}
