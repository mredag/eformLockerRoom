import { BaseRepository } from './base-repository.js';
import { DatabaseConnection } from './connection.js';
import { Event, EventType } from '../types/core-entities.js';

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

export class EventRepository extends BaseRepository<Event> {
  constructor(db: DatabaseConnection) {
    super(db, 'events');
  }

  async findById(id: string | number): Promise<Event | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    const row = await this.db.get(sql, [id]);
    return row ? this.mapRowToEntity(row) : null;
  }

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

  async create(event: Omit<Event, 'id' | 'timestamp'>): Promise<Event> {
    // Validate staff operations have staff_user
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

  async update(id: string | number, updates: Partial<Event>, expectedVersion: number = 1): Promise<Event> {
    // Events are typically immutable, but allow updates for corrections
    const setClause: string[] = [];
    const params: any[] = [];

    // Build SET clause dynamically
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'timestamp') {
        continue; // Skip immutable fields
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

  async delete(id: string | number): Promise<boolean> {
    // Events should typically not be deleted, but allow for cleanup
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Log a new event
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
   * Get events by date range
   */
  async findByDateRange(fromDate: Date, toDate: Date, kioskId?: string): Promise<Event[]> {
    return this.findAll({
      kiosk_id: kioskId,
      from_date: fromDate,
      to_date: toDate
    });
  }

  /**
   * Get recent events
   */
  async findRecent(limit: number = 100, kioskId?: string): Promise<Event[]> {
    return this.findAll({
      kiosk_id: kioskId,
      limit
    });
  }

  /**
   * Get events for a specific locker
   */
  async findByLocker(kioskId: string, lockerId: number, limit?: number): Promise<Event[]> {
    return this.findAll({
      kiosk_id: kioskId,
      locker_id: lockerId,
      limit
    });
  }

  /**
   * Get staff audit trail
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
   * Clean up old events
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
   * Get event statistics
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

    const rows = await this.db.all(sql, params);

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
      details: row.details ? JSON.parse(row.details) : {}
    };
  }

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