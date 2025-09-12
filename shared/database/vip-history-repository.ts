import { BaseRepository } from './base-repository';
import { DatabaseConnection } from './connection';
import { VipContractHistory } from '../types/core-entities';

/**
 * Defines the filtering criteria for querying VIP contract history records.
 */
export interface VipHistoryFilter {
  contract_id?: number;
  action_type?: string | string[];
  performed_by?: string;
  from_date?: Date;
  to_date?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Manages the persistence and retrieval of `VipContractHistory` entities.
 * This repository is dedicated to creating an audit trail for all significant
 * actions performed on VIP contracts.
 * @extends {BaseRepository<VipContractHistory>}
 */
export class VipHistoryRepository extends BaseRepository<VipContractHistory> {
  private dbManager: any;

  /**
   * Creates an instance of VipHistoryRepository.
   * @param {DatabaseConnection | any} dbOrManager - An instance of `DatabaseConnection` or a manager that has a `getDatabase` method.
   */
  constructor(dbOrManager: DatabaseConnection | any) {
    if (dbOrManager.getDatabase) {
      super(dbOrManager.getDatabase(), 'vip_contract_history');
      this.dbManager = dbOrManager;
    } else {
      super(dbOrManager, 'vip_contract_history');
    }
  }

  /**
   * Finds a history record by its unique ID.
   * @param {string | number} id - The ID of the history record.
   * @returns {Promise<VipContractHistory | null>} The found record or null.
   */
  async findById(id: string | number): Promise<VipContractHistory | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    const row = await this.db.get(sql, [id]);
    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Finds all history records matching the specified filter criteria.
   * @param {VipHistoryFilter} [filter] - The filter to apply.
   * @returns {Promise<VipContractHistory[]>} An array of matching history records.
   */
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

  /**
   * Creates a new history record for a VIP contract action.
   * @param {Omit<VipContractHistory, 'id' | 'timestamp' | 'version'>} history - The history data to create.
   * @returns {Promise<VipContractHistory>} The newly created history record.
   */
  async create(history: Omit<VipContractHistory, 'id' | 'timestamp' | 'version'>): Promise<VipContractHistory> {
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

  /**
   * Updates a history record. This should be used with caution as history is typically immutable.
   * @param {string | number} id - The ID of the history record to update.
   * @param {Partial<VipContractHistory>} updates - The fields to update.
   * @param {number} [expectedVersion=1] - The expected version for optimistic locking (not used here).
   * @returns {Promise<VipContractHistory>} The updated history record.
   */
  async update(id: string | number, updates: Partial<VipContractHistory>, expectedVersion: number = 1): Promise<VipContractHistory> {
    const setClause: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'timestamp') {
        continue;
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

  /**
   * Deletes a history record. This should be used with extreme caution.
   * @param {string | number} id - The ID of the history record to delete.
   * @returns {Promise<boolean>} True if the deletion was successful.
   */
  async delete(id: string | number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * A convenience method to log a new action for a VIP contract.
   * @param {number} contractId - The ID of the related contract.
   * @param {'created' | 'extended' | 'card_changed' | 'transferred' | 'cancelled'} actionType - The type of action.
   * @param {string} performedBy - The user who performed the action.
   * @param {Record<string, any>} [oldValues] - A JSON object representing the state before the change.
   * @param {Record<string, any>} [newValues] - A JSON object representing the state after the change.
   * @param {string} [reason] - The reason for the action.
   * @param {Record<string, any>} [details={}] - Additional details about the action.
   * @returns {Promise<VipContractHistory>} The created history record.
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
   * Retrieves the full history for a specific VIP contract.
   * @param {number} contractId - The ID of the contract.
   * @param {number} [limit] - An optional limit on the number of records returned.
   * @returns {Promise<VipContractHistory[]>} An array of history records.
   */
  async getContractHistory(contractId: number, limit?: number): Promise<VipContractHistory[]> {
    return this.findAll({
      contract_id: contractId,
      limit
    });
  }

  /**
   * Retrieves a full audit trail for a specific staff member.
   * @param {string} staffUser - The username of the staff member.
   * @param {Date} [fromDate] - The start date for the audit trail.
   * @param {Date} [toDate] - The end date for the audit trail.
   * @returns {Promise<VipContractHistory[]>} An array of history records for the specified user.
   */
  async getStaffAuditTrail(staffUser: string, fromDate?: Date, toDate?: Date): Promise<VipContractHistory[]> {
    return this.findAll({
      performed_by: staffUser,
      from_date: fromDate,
      to_date: toDate
    });
  }

  /**
   * Retrieves the most recent VIP actions across all contracts.
   * @param {number} [limit=50] - The maximum number of records to return.
   * @returns {Promise<VipContractHistory[]>} An array of recent history records.
   */
  async getRecentActions(limit: number = 50): Promise<VipContractHistory[]> {
    return this.findAll({ limit });
  }

  /**
   * Deletes old history records to save space.
   * @param {number} [retentionDays=365] - The number of days to keep history records.
   * @returns {Promise<number>} The number of deleted rows.
   */
  async cleanupOldHistory(retentionDays: number = 365): Promise<number> {
    const sql = `
      DELETE FROM ${this.tableName} 
      WHERE timestamp < datetime('now', '-${retentionDays} days')
    `;
    
    const result = await this.db.run(sql);
    return result.changes;
  }

  /**
   * Maps a raw database row to a structured `VipContractHistory` entity.
   * @protected
   * @param {any} row - The raw data from the database.
   * @returns {VipContractHistory} The mapped entity.
   */
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
      details: row.details ? JSON.parse(row.details) : {},
      version: row.version || 1
    };
  }

  /**
   * Maps a `VipContractHistory` entity to a raw object for database insertion.
   * @protected
   * @param {Partial<VipContractHistory>} entity - The entity to map.
   * @returns {Record<string, any>} The mapped raw object.
   */
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
