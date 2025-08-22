import { BaseRepository } from './base-repository';
import { DatabaseConnection } from './connection';
import { VipContractHistory } from '../types/core-entities';

export interface VipHistoryFilter {
  contract_id?: number;
  action_type?: string | string[];
  performed_by?: string;
  from_date?: Date;
  to_date?: Date;
  limit?: number;
  offset?: number;
}

export class VipHistoryRepository extends BaseRepository<VipContractHistory> {
  private dbManager: any;

  constructor(dbOrManager: DatabaseConnection | any) {
    if (dbOrManager.getDatabase) {
      // It's a DatabaseManager
      super(dbOrManager.getDatabase(), 'vip_contract_history');
      this.dbManager = dbOrManager;
    } else {
      // It's a DatabaseConnection
      super(dbOrManager, 'vip_contract_history');
    }
  }

  async findById(id: string | number): Promise<VipContractHistory | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    const row = await this.db.get(sql, [id]);
    return row ? this.mapRowToEntity(row) : null;
  }

  async findAll(filter?: VipHistoryFilter): Promise<VipContractHistory[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];

    if (filter) {
      const conditions: string[] = [];

      if (filter.contract_id) {
        conditions.push('contract_id = ?');
        params.push(filter.contract_id);
      }

      if (filter.action_type) {
        if (Array.isArray(filter.action_type)) {
          conditions.push(`action_type IN (${filter.action_type.map(() => '?').join(', ')})`);
          params.push(...filter.action_type);
        } else {
          conditions.push('action_type = ?');
          params.push(filter.action_type);
        }
      }

      if (filter.performed_by) {
        conditions.push('performed_by = ?');
        params.push(filter.performed_by);
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

  async create(history: Omit<VipContractHistory, 'id' | 'timestamp'>): Promise<VipContractHistory> {
    const sql = `
      INSERT INTO ${this.tableName} (
        contract_id, action_type, old_values, new_values,
        performed_by, reason, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      history.contract_id,
      history.action_type,
      history.old_values ? JSON.stringify(history.old_values) : null,
      history.new_values ? JSON.stringify(history.new_values) : null,
      history.performed_by,
      history.reason || null,
      JSON.stringify(history.details)
    ];

    const result = await this.db.run(sql, params);
    
    const created = await this.findById(result.lastID!);
    if (!created) {
      throw new Error('Failed to create VIP contract history entry');
    }
    
    return created;
  }

  async update(id: string | number, updates: Partial<VipContractHistory>, expectedVersion: number = 1): Promise<VipContractHistory> {
    // History entries are typically immutable, but allow updates for corrections
    const setClause: string[] = [];
    const params: any[] = [];

    // Build SET clause dynamically
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'timestamp') {
        continue; // Skip immutable fields
      }

      setClause.push(`${key} = ?`);
      
      if (key === 'old_values' || key === 'new_values' || key === 'details') {
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
      throw new Error(`VIP contract history entry with id ${id} not found`);
    }

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Failed to retrieve updated VIP contract history entry');
    }

    return updated;
  }

  async delete(id: string | number): Promise<boolean> {
    // History entries should typically not be deleted, but allow for cleanup
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Log a VIP contract action
   */
  async logAction(
    contractId: number,
    actionType: 'created' | 'extended' | 'card_changed' | 'transferred' | 'cancelled',
    performedBy: string,
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>,
    reason?: string,
    details: Record<string, any> = {}
  ): Promise<VipContractHistory> {
    return this.create({
      contract_id: contractId,
      action_type: actionType,
      old_values: oldValues,
      new_values: newValues,
      performed_by: performedBy,
      reason,
      details
    });
  }

  /**
   * Get history for a specific contract
   */
  async getContractHistory(contractId: number, limit?: number): Promise<VipContractHistory[]> {
    return this.findAll({
      contract_id: contractId,
      limit
    });
  }

  /**
   * Get audit trail for a staff user
   */
  async getStaffAuditTrail(staffUser: string, fromDate?: Date, toDate?: Date): Promise<VipContractHistory[]> {
    return this.findAll({
      performed_by: staffUser,
      from_date: fromDate,
      to_date: toDate
    });
  }

  /**
   * Get recent VIP actions
   */
  async getRecentActions(limit: number = 50): Promise<VipContractHistory[]> {
    return this.findAll({ limit });
  }

  /**
   * Clean up old history entries
   */
  async cleanupOldHistory(retentionDays: number = 365): Promise<number> {
    const sql = `
      DELETE FROM ${this.tableName} 
      WHERE timestamp < datetime('now', '-${retentionDays} days')
    `;
    
    const result = await this.db.run(sql);
    return result.changes;
  }

  protected mapRowToEntity(row: any): VipContractHistory {
    return {
      id: row.id,
      contract_id: row.contract_id,
      action_type: row.action_type as 'created' | 'extended' | 'card_changed' | 'transferred' | 'cancelled',
      old_values: row.old_values ? JSON.parse(row.old_values) : undefined,
      new_values: row.new_values ? JSON.parse(row.new_values) : undefined,
      performed_by: row.performed_by,
      reason: row.reason,
      timestamp: new Date(row.timestamp),
      details: row.details ? JSON.parse(row.details) : {}
    };
  }

  protected mapEntityToRow(entity: Partial<VipContractHistory>): Record<string, any> {
    const row: Record<string, any> = {};

    if (entity.contract_id !== undefined) row.contract_id = entity.contract_id;
    if (entity.action_type !== undefined) row.action_type = entity.action_type;
    if (entity.old_values !== undefined) row.old_values = JSON.stringify(entity.old_values);
    if (entity.new_values !== undefined) row.new_values = JSON.stringify(entity.new_values);
    if (entity.performed_by !== undefined) row.performed_by = entity.performed_by;
    if (entity.reason !== undefined) row.reason = entity.reason;
    if (entity.details !== undefined) row.details = JSON.stringify(entity.details);

    return row;
  }
}