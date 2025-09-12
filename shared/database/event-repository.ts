import { BaseRepository } from './base-repository';
import { DatabaseConnection } from './connection';
import { Event, EventType } from '../types/core-entities';

/**
 * Defines the filtering criteria for querying system events.
 */
export interface EventFilter {
  kiosk_id?: string;
  locker_id?: number;
  event_type?: EventType | EventType[];
  rfid_card?: string;
  device_id?: string;
  staff_user?: string;
  from_date?: Date;
  to_date?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Manages the persistence and retrieval of system `Event` entities.
 * This repository is crucial for auditing, logging, and debugging, providing
 * methods to create, query, and manage event records.
 * @extends {BaseRepository<Event>}
 */
export class EventRepository extends BaseRepository<Event> {
  /**
   * Creates an instance of EventRepository.
   * @param {DatabaseConnection} db - The database connection instance.
   */
  constructor(db: DatabaseConnection) {
    super(db, 'events');
  }

  /**
   * Finds an event by its unique ID.
   * @param {string | number} id - The ID of the event.
   * @returns {Promise<Event | null>} The found event or null.
   */
  async findById(id: string | number): Promise<Event | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    const row = await this.db.get(sql, [id]);
    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Finds all events matching the specified filter criteria.
   * @param {EventFilter} [filter] - The filter to apply.
   * @returns {Promise<Event[]>} An array of events.
   */
  async findAll(filter?: EventFilter): Promise<Event[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];

    if (filter) {
      const conditions: string[] = [];

      if (filter.kiosk_id) {
        conditions.push('kiosk_id = ?');
        params.push(filter.kiosk_id);
      }

      if (filter.locker_id !== undefined) {
        conditions.push('locker_id = ?');
        params.push(filter.locker_id);
      }

      if (filter.event_type) {
        if (Array.isArray(filter.event_type)) {
          conditions.push(`event_type IN (${filter.event_type.map(() => '?').join(', ')})`);
          params.push(...filter.event_type);
        } else {
          conditions.push('event_type = ?');
          params.push(filter.event_type);
        }
      }

      if (filter.rfid_card) {
        conditions.push('rfid_card = ?');
        params.push(filter.rfid_card);
      }

      if (filter.device_id) {
        conditions.push('device_id = ?');
        params.push(filter.device_id);
      }

      if (filter.staff_user) {
        conditions.push('staff_user = ?');
        params.push(filter.staff_user);
      }

      if (filter.from_date) {
        conditions.push('timestamp >= ?');
        params.push(filter.from_date.toISOString());
      }

      if (filter.to_date) {
        conditions.push('timestamp <= ?');
        params.push(filter.to_date.toISOString());
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    sql += ' ORDER BY timestamp DESC';

    if (filter?.limit) {
      sql += ` LIMIT ${filter.limit}`;
      if (filter.offset) {
        sql += ` OFFSET ${filter.offset}`;
      }
    }

    const rows = await this.db.all(sql, params);
    return rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Creates a new event record in the database.
   * @param {Omit<Event, 'id' | 'timestamp' | 'version'>} event - The event data to log.
   * @returns {Promise<Event>} The newly created event.
   * @throws {Error} If a staff-related event is logged without a `staff_user`.
   */
  async create(event: Omit<Event, 'id' | 'timestamp' | 'version'>): Promise<Event> {
    if (event.event_type.startsWith('staff_') && !event.staff_user) {
      throw new Error('Staff operations require staff_user field');
    }

    const sql = `
      INSERT INTO ${this.tableName} (
        kiosk_id, locker_id, event_type, rfid_card, 
        device_id, staff_user, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      event.kiosk_id,
      event.locker_id || null,
      event.event_type,
      event.rfid_card || null,
      event.device_id || null,
      event.staff_user || null,
      JSON.stringify(event.details)
    ];

    const result = await this.db.run(sql, params);
    
    const created = await this.findById(result.lastID!);
    if (!created) {
      throw new Error('Failed to create event');
    }
    
    return created;
  }

  /**
   * Updates an existing event. Note: Events are typically immutable; this method
   * should be used cautiously, for example, to correct data.
   * @param {string | number} id - The ID of the event to update.
   * @param {Partial<Event>} updates - The fields to update.
   * @param {number} [expectedVersion=1] - The expected version for optimistic locking (not used here).
   * @returns {Promise<Event>} The updated event.
   */
  async update(id: string | number, updates: Partial<Event>, expectedVersion: number = 1): Promise<Event> {
    const setClause: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'timestamp') {
        continue;
      }

      setClause.push(`${key} = ?`);
      
      if (key === 'details') {
        params.push(JSON.stringify(value));
      } else {
        params.push(value);
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    const sql = `
      UPDATE ${this.tableName} 
      SET ${setClause.join(', ')}
      WHERE id = ?
    `;

    params.push(id);

    const result = await this.db.run(sql, params);
    
    if (result.changes === 0) {
      throw new Error(`Event with id ${id} not found`);
    }

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Failed to retrieve updated event');
    }

    return updated;
  }

  /**
   * Deletes an event from the database. Note: This should be used with caution,
   * as events are typically kept for auditing purposes.
   * @param {string | number} id - The ID of the event to delete.
   * @returns {Promise<boolean>} True if the deletion was successful.
   */
  async delete(id: string | number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * A convenience method to log a new event.
   * @param {string} kioskId - The ID of the kiosk where the event occurred.
   * @param {EventType} eventType - The type of the event.
   * @param {Record<string, any>} [details={}] - Additional JSON details about the event.
   * @param {number} [lockerId] - The associated locker ID, if any.
   * @param {string} [rfidCard] - The associated RFID card ID, if any.
   * @param {string} [deviceId] - The associated device ID, if any.
   * @param {string} [staffUser] - The staff user who initiated the event, if any.
   * @returns {Promise<Event>} The created event.
   */
  async logEvent(
    kioskId: string,
    eventType: EventType,
    details: Record<string, any> = {},
    lockerId?: number,
    rfidCard?: string,
    deviceId?: string,
    staffUser?: string
  ): Promise<Event> {
    return this.create({
      kiosk_id: kioskId,
      locker_id: lockerId,
      event_type: eventType,
      rfid_card: rfidCard,
      device_id: deviceId,
      staff_user: staffUser,
      details
    });
  }

  /**
   * Finds events within a specific date range.
   * @param {Date} fromDate - The start of the date range.
   * @param {Date} toDate - The end of the date range.
   * @param {string} [kioskId] - An optional kiosk ID to filter by.
   * @returns {Promise<Event[]>} An array of events.
   */
  async findByDateRange(fromDate: Date, toDate: Date, kioskId?: string): Promise<Event[]> {
    return this.findAll({
      kiosk_id: kioskId,
      from_date: fromDate,
      to_date: toDate
    });
  }

  /**
   * Finds the most recent events.
   * @param {number} [limit=100] - The maximum number of events to return.
   * @param {string} [kioskId] - An optional kiosk ID to filter by.
   * @returns {Promise<Event[]>} An array of recent events.
   */
  async findRecent(limit: number = 100, kioskId?: string): Promise<Event[]> {
    return this.findAll({
      kiosk_id: kioskId,
      limit
    });
  }

  /**
   * Finds all events associated with a specific locker.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} lockerId - The ID of the locker.
   * @param {number} [limit] - An optional limit on the number of events returned.
   * @returns {Promise<Event[]>} An array of locker-specific events.
   */
  async findByLocker(kioskId: string, lockerId: number, limit?: number): Promise<Event[]> {
    return this.findAll({
      kiosk_id: kioskId,
      locker_id: lockerId,
      limit
    });
  }

  /**
   * Finds all events that are considered staff actions, for auditing purposes.
   * @param {string} [staffUser] - Optional staff user to filter by.
   * @param {Date} [fromDate] - Optional start date.
   * @param {Date} [toDate] - Optional end date.
   * @returns {Promise<Event[]>} An array of staff action events.
   */
  async findStaffActions(staffUser?: string, fromDate?: Date, toDate?: Date): Promise<Event[]> {
    const staffEventTypes = [
      EventType.STAFF_OPEN,
      EventType.STAFF_BLOCK,
      EventType.STAFF_UNBLOCK,
      EventType.BULK_OPEN,
      EventType.MASTER_PIN_USED,
      EventType.VIP_CONTRACT_CREATED,
      EventType.VIP_CONTRACT_EXTENDED,
      EventType.VIP_CONTRACT_CANCELLED
    ];

    return this.findAll({
      event_type: staffEventTypes,
      staff_user: staffUser,
      from_date: fromDate,
      to_date: toDate
    });
  }

  /**
   * Deletes old event records to save space.
   * @param {number} [retentionDays=30] - The number of days to keep event records.
   * @returns {Promise<number>} The number of deleted rows.
   */
  async cleanupOldEvents(retentionDays: number = 30): Promise<number> {
    const sql = `
      DELETE FROM ${this.tableName} 
      WHERE timestamp < datetime('now', '-${retentionDays} days')
    `;
    
    const result = await this.db.run(sql);
    return result.changes;
  }

  /**
   * Gathers statistics about events, such as total counts and breakdowns by type and category.
   * @param {Date} [fromDate] - Optional start date for filtering statistics.
   * @param {Date} [toDate] - Optional end date for filtering statistics.
   * @returns {Promise<object>} An object containing various event statistics.
   */
  async getStatistics(fromDate?: Date, toDate?: Date): Promise<{
    total: number;
    by_type: Record<string, number>;
    by_kiosk: Record<string, number>;
    staff_actions: number;
    user_actions: number;
    system_events: number;
  }> {
    let sql = `
      SELECT 
        COUNT(*) as total,
        event_type,
        kiosk_id,
        CASE 
          WHEN staff_user IS NOT NULL THEN 'staff'
          WHEN event_type LIKE 'system_%' OR event_type = 'restarted' OR event_type LIKE 'kiosk_%' THEN 'system'
          ELSE 'user'
        END as category
      FROM ${this.tableName}
    `;

    const params: any[] = [];

    if (fromDate || toDate) {
      const conditions: string[] = [];
      if (fromDate) {
        conditions.push('timestamp >= ?');
        params.push(fromDate.toISOString());
      }
      if (toDate) {
        conditions.push('timestamp <= ?');
        params.push(toDate.toISOString());
      }
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' GROUP BY event_type, kiosk_id, category';

    interface EventStatsRow {
      event_type: string;
      kiosk_id: string;
      category: string;
      total: number;
    }

    const rows = await this.db.all<EventStatsRow>(sql, params);

    const stats = {
      total: 0,
      by_type: {} as Record<string, number>,
      by_kiosk: {} as Record<string, number>,
      staff_actions: 0,
      user_actions: 0,
      system_events: 0
    };

    for (const row of rows) {
      stats.total += row.total;
      stats.by_type[row.event_type] = (stats.by_type[row.event_type] || 0) + row.total;
      stats.by_kiosk[row.kiosk_id] = (stats.by_kiosk[row.kiosk_id] || 0) + row.total;

      switch (row.category) {
        case 'staff':
          stats.staff_actions += row.total;
          break;
        case 'user':
          stats.user_actions += row.total;
          break;
        case 'system':
          stats.system_events += row.total;
          break;
      }
    }

    return stats;
  }

  /**
   * Maps a raw database row to a structured `Event` entity.
   * @protected
   * @param {any} row - The raw data from the database.
   * @returns {Event} The mapped event entity.
   */
  protected mapRowToEntity(row: any): Event {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      kiosk_id: row.kiosk_id,
      locker_id: row.locker_id,
      event_type: row.event_type as EventType,
      rfid_card: row.rfid_card,
      device_id: row.device_id,
      staff_user: row.staff_user,
      details: row.details ? JSON.parse(row.details) : {},
      version: row.version || 1
    };
  }

  /**
   * Maps an `Event` entity to a raw object for database insertion/updates.
   * @protected
   * @param {Partial<Event>} entity - The event entity.
   * @returns {Record<string, any>} The mapped raw object.
   */
  protected mapEntityToRow(entity: Partial<Event>): Record<string, any> {
    const row: Record<string, any> = {};

    if (entity.kiosk_id !== undefined) row.kiosk_id = entity.kiosk_id;
    if (entity.locker_id !== undefined) row.locker_id = entity.locker_id;
    if (entity.event_type !== undefined) row.event_type = entity.event_type;
    if (entity.rfid_card !== undefined) row.rfid_card = entity.rfid_card;
    if (entity.device_id !== undefined) row.device_id = entity.device_id;
    if (entity.staff_user !== undefined) row.staff_user = entity.staff_user;
    if (entity.details !== undefined) row.details = JSON.stringify(entity.details);

    return row;
  }
}
