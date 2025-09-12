import { DatabaseConnection } from './connection';
import { KioskHeartbeat, KioskStatus } from '../types/core-entities';

/**
 * Defines the filtering criteria for querying kiosk heartbeat records.
 */
export interface KioskFilter {
  zone?: string;
  status?: KioskStatus | KioskStatus[];
  hardware_id?: string;
  offline_since?: Date;
  version?: string;
}

/**
 * Manages the persistence and retrieval of `KioskHeartbeat` entities.
 * This repository is responsible for tracking the status of each kiosk,
 * including its last seen time, zone, version, and current status (online/offline).
 */
export class KioskHeartbeatRepository {
  protected db: DatabaseConnection;
  protected tableName: string = 'kiosk_heartbeat';

  /**
   * Creates an instance of KioskHeartbeatRepository.
   * @param {DatabaseConnection} db - The database connection instance.
   */
  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Finds a kiosk heartbeat record by its unique kiosk ID.
   * @param {string | number} id - The ID of the kiosk.
   * @returns {Promise<KioskHeartbeat | null>} The found heartbeat record or null.
   */
  async findById(id: string | number): Promise<KioskHeartbeat | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE kiosk_id = ?`;
    const row = await this.db.get(sql, [id]);
    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Finds all kiosk heartbeat records that match the specified filter criteria.
   * @param {KioskFilter} [filter] - The filter to apply.
   * @returns {Promise<KioskHeartbeat[]>} An array of matching heartbeat records.
   */
  async findAll(filter?: KioskFilter): Promise<KioskHeartbeat[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];

    if (filter) {
      const conditions: string[] = [];

      if (filter.zone) {
        conditions.push('zone = ?');
        params.push(filter.zone);
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

      if (filter.hardware_id) {
        conditions.push('hardware_id = ?');
        params.push(filter.hardware_id);
      }

      if (filter.version) {
        conditions.push('version = ?');
        params.push(filter.version);
      }

      if (filter.offline_since) {
        conditions.push('last_seen < ?');
        params.push(filter.offline_since.toISOString());
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    sql += ' ORDER BY zone, kiosk_id';

    const rows = await this.db.all(sql, params);
    return rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Creates a new kiosk heartbeat record.
   * @param {Omit<KioskHeartbeat, 'created_at' | 'updated_at'>} kiosk - The kiosk data to insert.
   * @returns {Promise<KioskHeartbeat>} The newly created kiosk heartbeat record.
   */
  async create(kiosk: Omit<KioskHeartbeat, 'created_at' | 'updated_at'>): Promise<KioskHeartbeat> {
    const sql = `
      INSERT INTO ${this.tableName} (
        kiosk_id, last_seen, zone, status, version,
        last_config_hash, offline_threshold_seconds,
        hardware_id, registration_secret
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      kiosk.kiosk_id,
      kiosk.last_seen.toISOString(),
      kiosk.zone,
      kiosk.status,
      kiosk.version,
      kiosk.last_config_hash || null,
      kiosk.offline_threshold_seconds,
      kiosk.hardware_id || null,
      kiosk.registration_secret || null
    ];

    await this.db.run(sql, params);
    
    const created = await this.findById(kiosk.kiosk_id);
    if (!created) {
      throw new Error('Failed to create kiosk heartbeat');
    }
    
    return created;
  }

  /**
   * Updates an existing kiosk heartbeat record.
   * @param {string | number} id - The ID of the kiosk to update.
   * @param {Partial<KioskHeartbeat>} updates - The fields to update.
   * @returns {Promise<KioskHeartbeat>} The updated kiosk heartbeat record.
   */
  async update(id: string | number, updates: Partial<KioskHeartbeat>): Promise<KioskHeartbeat> {
    const setClause: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'kiosk_id' || key === 'created_at' || key === 'updated_at') {
        continue;
      }

      setClause.push(`${key} = ?`);
      
      if (key === 'last_seen') {
        params.push(value instanceof Date ? value.toISOString() : value);
      } else {
        params.push(value);
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push('updated_at = CURRENT_TIMESTAMP');

    const sql = `
      UPDATE ${this.tableName} 
      SET ${setClause.join(', ')}
      WHERE kiosk_id = ?
    `;

    params.push(id);

    const result = await this.db.run(sql, params);
    
    if (result.changes === 0) {
      throw new Error(`Kiosk with id ${id} not found`);
    }

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Failed to retrieve updated kiosk');
    }

    return updated;
  }

  /**
   * Deletes a kiosk heartbeat record.
   * @param {string | number} id - The ID of the kiosk to delete.
   * @returns {Promise<boolean>} True if the deletion was successful.
   */
  async delete(id: string | number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE kiosk_id = ?`;
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Updates the heartbeat for a specific kiosk, setting its status to 'online'
   * and updating its last seen timestamp.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {string} [version] - The current software version of the kiosk.
   * @param {string} [configHash] - The hash of the configuration currently loaded by the kiosk.
   * @returns {Promise<KioskHeartbeat>} The updated kiosk heartbeat record.
   * @throws {Error} If the kiosk is not registered.
   */
  async updateHeartbeat(kioskId: string, version?: string, configHash?: string): Promise<KioskHeartbeat> {
    const updates: Partial<KioskHeartbeat> = {
      last_seen: new Date(),
      status: 'online'
    };

    if (version) {
      updates.version = version;
    }

    if (configHash) {
      updates.last_config_hash = configHash;
    }

    try {
      return await this.update(kioskId, updates);
    } catch (error) {
      throw new Error(`Kiosk ${kioskId} not registered. Use registerKiosk first.`);
    }
  }

  /**
   * Registers a new kiosk in the system. If the kiosk already exists, it updates the existing record.
   * This "upsert" logic is crucial for handling initial kiosk provisioning and re-registration.
   * @param {string} kioskId - The unique ID for the kiosk.
   * @param {string} zone - The zone the kiosk belongs to.
   * @param {string} version - The software version of the kiosk.
   * @param {string} [hardwareId] - An optional unique hardware identifier.
   * @param {string} [registrationSecret] - An optional secret for registration.
   * @returns {Promise<KioskHeartbeat>} The created or updated kiosk heartbeat record.
   */
  async registerKiosk(
    kioskId: string, 
    zone: string, 
    version: string, 
    hardwareId?: string,
    registrationSecret?: string
  ): Promise<KioskHeartbeat> {
    try {
      return await this.create({
        kiosk_id: kioskId,
        last_seen: new Date(),
        zone,
        status: 'online',
        version: version || '1.0.0',
        offline_threshold_seconds: 30,
        hardware_id: hardwareId,
        registration_secret: registrationSecret
      });
    } catch (error: any) {
      console.log('Registration error:', error.code, error.message);
      if (error.code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE constraint failed')) {
        console.log(`Kiosk ${kioskId} already exists, updating instead...`);
        const updateData = {
          last_seen: new Date(),
          zone,
          status: 'online' as const,
          version: version || '1.0.0',
          offline_threshold_seconds: 30,
          hardware_id: hardwareId,
          registration_secret: registrationSecret,
          updated_at: new Date()
        };
        
        await this.update(kioskId, updateData);
        const result = await this.findById(kioskId);
        if (!result) {
          throw new Error(`Failed to find kiosk ${kioskId} after update`);
        }
        console.log(`Kiosk ${kioskId} updated successfully`);
        return result;
      }
      throw error;
    }
  }

  /**
   * Scans all online kiosks and marks any as 'offline' if their `last_seen`
   * timestamp exceeds their configured `offline_threshold_seconds`.
   * @returns {Promise<number>} The number of kiosks marked as offline.
   */
  async markOfflineKiosks(): Promise<number> {
    const sql = `
      UPDATE ${this.tableName} 
      SET status = 'offline',
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'online'
      AND last_seen < datetime('now', '-' || offline_threshold_seconds || ' seconds')
    `;
    
    const result = await this.db.run(sql);
    return result.changes;
  }

  /**
   * Retrieves all kiosks that are currently marked as offline.
   * @returns {Promise<KioskHeartbeat[]>} An array of offline kiosk records.
   */
  async getOfflineKiosks(): Promise<KioskHeartbeat[]> {
    return this.findAll({ status: 'offline' });
  }

  /**
   * Retrieves all kiosks belonging to a specific zone.
   * @param {string} zone - The zone to filter by.
   * @returns {Promise<KioskHeartbeat[]>} An array of kiosk records in the specified zone.
   */
  async getByZone(zone: string): Promise<KioskHeartbeat[]> {
    return this.findAll({ zone });
  }

  /**
   * Retrieves a list of all unique zone names present in the database.
   * @returns {Promise<string[]>} An array of zone names.
   */
  async getAllZones(): Promise<string[]> {
    const sql = `SELECT DISTINCT zone FROM ${this.tableName} ORDER BY zone`;
    const rows = await this.db.all<{ zone: string }>(sql);
    return rows.map(row => row.zone);
  }

  /**
   * Gathers statistics about the kiosk fleet, including total counts
   * and breakdowns by status, zone, and version.
   * @returns {Promise<object>} An object containing kiosk statistics.
   */
  async getStatistics(): Promise<{
    total: number;
    online: number;
    offline: number;
    maintenance: number;
    error: number;
    by_zone: Record<string, { total: number; online: number; offline: number }>;
    by_version: Record<string, number>;
  }> {
    const sql = `
      SELECT 
        COUNT(*) as total,
        status,
        zone,
        version
      FROM ${this.tableName}
      GROUP BY status, zone, version
    `;

    interface KioskStatsRow {
      total: number;
      status: string;
      zone: string;
      version: string;
    }

    const rows = await this.db.all<KioskStatsRow>(sql);

    const stats = {
      total: 0,
      online: 0,
      offline: 0,
      maintenance: 0,
      error: 0,
      by_zone: {} as Record<string, { total: number; online: number; offline: number }>,
      by_version: {} as Record<string, number>
    };

    for (const row of rows) {
      stats.total += row.total;
      stats.by_version[row.version] = (stats.by_version[row.version] || 0) + row.total;

      if (!stats.by_zone[row.zone]) {
        stats.by_zone[row.zone] = { total: 0, online: 0, offline: 0 };
      }
      stats.by_zone[row.zone].total += row.total;

      switch (row.status) {
        case 'online':
          stats.online += row.total;
          stats.by_zone[row.zone].online += row.total;
          break;
        case 'offline':
          stats.offline += row.total;
          stats.by_zone[row.zone].offline += row.total;
          break;
        case 'maintenance':
          stats.maintenance += row.total;
          break;
        case 'error':
          stats.error += row.total;
          break;
      }
    }

    return stats;
  }

  /**
   * Finds a kiosk by its unique hardware ID.
   * @param {string} hardwareId - The hardware ID to search for.
   * @returns {Promise<KioskHeartbeat | null>} The found kiosk record or null.
   */
  async findByHardwareId(hardwareId: string): Promise<KioskHeartbeat | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE hardware_id = ?`;
    const row = await this.db.get(sql, [hardwareId]);
    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Updates the status of a specific kiosk.
   * @param {string} kioskId - The ID of the kiosk to update.
   * @param {KioskStatus} status - The new status to set.
   * @returns {Promise<KioskHeartbeat>} The updated kiosk record.
   */
  async updateStatus(kioskId: string, status: KioskStatus): Promise<KioskHeartbeat> {
    return this.update(kioskId, { status });
  }

  /**
   * Maps a raw database row to a structured `KioskHeartbeat` entity.
   * @protected
   * @param {any} row - The raw data from the database.
   * @returns {KioskHeartbeat} The mapped entity.
   */
  protected mapRowToEntity(row: any): KioskHeartbeat {
    return {
      kiosk_id: row.kiosk_id,
      last_seen: new Date(row.last_seen),
      zone: row.zone,
      status: row.status as KioskStatus,
      version: row.version,
      last_config_hash: row.last_config_hash,
      offline_threshold_seconds: row.offline_threshold_seconds,
      hardware_id: row.hardware_id,
      registration_secret: row.registration_secret,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }

  /**
   * Maps a `KioskHeartbeat` entity to a raw object for database insertion/updates.
   * @protected
   * @param {Partial<KioskHeartbeat>} entity - The entity to map.
   * @returns {Record<string, any>} The mapped raw object.
   */
  protected mapEntityToRow(entity: Partial<KioskHeartbeat>): Record<string, any> {
    const row: Record<string, any> = {};

    if (entity.kiosk_id !== undefined) row.kiosk_id = entity.kiosk_id;
    if (entity.last_seen !== undefined) row.last_seen = entity.last_seen.toISOString();
    if (entity.zone !== undefined) row.zone = entity.zone;
    if (entity.status !== undefined) row.status = entity.status;
    if (entity.version !== undefined) row.version = entity.version;
    if (entity.last_config_hash !== undefined) row.last_config_hash = entity.last_config_hash;
    if (entity.offline_threshold_seconds !== undefined) row.offline_threshold_seconds = entity.offline_threshold_seconds;
    if (entity.hardware_id !== undefined) row.hardware_id = entity.hardware_id;
    if (entity.registration_secret !== undefined) row.registration_secret = entity.registration_secret;

    return row;
  }
}
