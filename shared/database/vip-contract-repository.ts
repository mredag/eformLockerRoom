import { BaseRepository } from './base-repository';
import { DatabaseConnection } from './connection';
import { VipContract, VipContractStatus } from '../types/core-entities';
import { VipHistoryRepository } from './vip-history-repository';

/**
 * Defines the filtering criteria for querying VIP contract records.
 */
export interface VipContractFilter {
  kiosk_id?: string;
  locker_id?: number;
  rfid_card?: string;
  status?: VipContractStatus | VipContractStatus[];
  created_by?: string;
  expires_before?: Date;
  expires_after?: Date;
}

/**
 * Manages the persistence and retrieval of `VipContract` entities.
 * This repository handles all database operations for VIP contracts, including
 * lifecycle management (creation, extension, cancellation, transfer) and
 * comprehensive auditing through a dedicated `VipHistoryRepository`.
 * @extends {BaseRepository<VipContract>}
 */
export class VipContractRepository extends BaseRepository<VipContract> {
  private dbManager: any;
  private historyRepository: VipHistoryRepository;

  /**
   * Creates an instance of VipContractRepository.
   * @param {DatabaseConnection | any} dbOrManager - An instance of `DatabaseConnection` or a manager that has a `getDatabase` method.
   */
  constructor(dbOrManager: DatabaseConnection | any) {
    if (dbOrManager.getDatabase) {
      super(dbOrManager.getDatabase(), 'vip_contracts');
      this.dbManager = dbOrManager;
      this.historyRepository = new VipHistoryRepository(dbOrManager);
    } else {
      super(dbOrManager, 'vip_contracts');
      this.historyRepository = new VipHistoryRepository(dbOrManager);
    }
  }

  /**
   * Finds a VIP contract by its unique ID.
   * @param {string | number} id - The ID of the contract.
   * @returns {Promise<VipContract | null>} The found contract or null.
   */
  async findById(id: string | number): Promise<VipContract | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    const row = await this.db.get(sql, [id]);
    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Finds all VIP contracts matching the specified filter criteria.
   * @param {VipContractFilter} [filter] - The filter to apply.
   * @returns {Promise<VipContract[]>} An array of matching contracts.
   */
  async findAll(filter?: VipContractFilter): Promise<VipContract[]> {
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

      if (filter.rfid_card) {
        conditions.push('(rfid_card = ? OR backup_card = ?)');
        params.push(filter.rfid_card, filter.rfid_card);
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

      if (filter.created_by) {
        conditions.push('created_by = ?');
        params.push(filter.created_by);
      }

      if (filter.expires_before) {
        conditions.push('end_date < ?');
        params.push(filter.expires_before.toISOString().split('T')[0]);
      }

      if (filter.expires_after) {
        conditions.push('end_date > ?');
        params.push(filter.expires_after.toISOString().split('T')[0]);
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    sql += ' ORDER BY created_at DESC';

    const rows = await this.db.all(sql, params);
    return rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Creates a new VIP contract.
   * @param {Omit<VipContract, 'id' | 'created_at' | 'updated_at' | 'version'>} contract - The contract data.
   * @returns {Promise<VipContract>} The newly created contract.
   */
  async create(contract: Omit<VipContract, 'id' | 'created_at' | 'updated_at' | 'version'>): Promise<VipContract> {
    const sql = `
      INSERT INTO ${this.tableName} (
        kiosk_id, locker_id, rfid_card, backup_card,
        start_date, end_date, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      contract.kiosk_id,
      contract.locker_id,
      contract.rfid_card,
      contract.backup_card || null,
      contract.start_date.toISOString().split('T')[0],
      contract.end_date.toISOString().split('T')[0],
      contract.status,
      contract.created_by
    ];

    const result = await this.db.run(sql, params);
    
    const created = await this.findById(result.lastID!);
    if (!created) {
      throw new Error('Failed to create VIP contract');
    }
    
    return created;
  }

  /**
   * Updates an existing VIP contract.
   * @param {string | number} id - The ID of the contract to update.
   * @param {Partial<VipContract>} updates - The fields to update.
   * @param {number} [expectedVersion=1] - The expected version for optimistic locking (not used here).
   * @returns {Promise<VipContract>} The updated contract.
   */
  async update(id: string | number, updates: Partial<VipContract>, expectedVersion: number = 1): Promise<VipContract> {
    const setClause: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'created_at' || key === 'updated_at') {
        continue;
      }

      setClause.push(`${key} = ?`);
      
      if (key === 'start_date' || key === 'end_date') {
        params.push(value instanceof Date ? value.toISOString().split('T')[0] : value);
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
      WHERE id = ?
    `;

    params.push(id);

    const result = await this.db.run(sql, params);
    
    if (result.changes === 0) {
      throw new Error(`VIP contract with id ${id} not found`);
    }

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Failed to retrieve updated VIP contract');
    }

    return updated;
  }

  /**
   * Deletes a VIP contract.
   * @param {string | number} id - The ID of the contract to delete.
   * @returns {Promise<boolean>} True if the deletion was successful.
   */
  async delete(id: string | number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Finds the currently active contract for a given RFID card.
   * @param {string} rfidCard - The RFID card ID to search for.
   * @returns {Promise<VipContract | null>} The active contract or null.
   */
  async findActiveByCard(rfidCard: string): Promise<VipContract | null> {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE (rfid_card = ? OR backup_card = ?) 
      AND status = 'active'
      AND start_date <= date('now')
      AND end_date >= date('now')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const row = await this.db.get(sql, [rfidCard, rfidCard]);
    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Finds the currently active contract for a specific locker.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} lockerId - The ID of the locker.
   * @returns {Promise<VipContract | null>} The active contract or null.
   */
  async findActiveByLocker(kioskId: string, lockerId: number): Promise<VipContract | null> {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE kiosk_id = ? AND locker_id = ?
      AND status = 'active'
      AND start_date <= date('now')
      AND end_date >= date('now')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const row = await this.db.get(sql, [kioskId, lockerId]);
    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Finds all active contracts that are due to expire within a given number of days.
   * @param {number} [daysAhead=7] - The number of days to look ahead for expiring contracts.
   * @returns {Promise<VipContract[]>} An array of expiring contracts.
   */
  async findExpiringSoon(daysAhead: number = 7): Promise<VipContract[]> {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE status = 'active'
      AND end_date BETWEEN date('now') AND date('now', '+${daysAhead} days')
      ORDER BY end_date ASC
    `;
    
    const rows = await this.db.all(sql);
    return rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Scans for and updates the status of all active contracts that have passed their end date to 'expired'.
   * @returns {Promise<number>} The number of contracts that were marked as expired.
   */
  async markExpiredContracts(): Promise<number> {
    const sql = `
      UPDATE ${this.tableName} 
      SET status = 'expired',
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'active' 
      AND end_date < date('now')
    `;
    
    const result = await this.db.run(sql);
    return result.changes;
  }

  /**
   * Gathers statistics about all VIP contracts.
   * @returns {Promise<object>} An object containing contract statistics.
   */
  async getStatistics(): Promise<{
    total: number;
    active: number;
    expired: number;
    cancelled: number;
    expiring_soon: number;
  }> {
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'active' AND end_date BETWEEN date('now') AND date('now', '+7 days') THEN 1 ELSE 0 END) as expiring_soon
      FROM ${this.tableName}
    `;

    interface VipContractStatsResult {
      total: number;
      active: number;
      expired: number;
      cancelled: number;
      expiring_soon: number;
    }

    const result = await this.db.get<VipContractStatsResult>(sql);
    return {
      total: result?.total || 0,
      active: result?.active || 0,
      expired: result?.expired || 0,
      cancelled: result?.cancelled || 0,
      expiring_soon: result?.expiring_soon || 0
    };
  }

  /**
   * Maps a raw database row to a structured `VipContract` entity.
   * @protected
   * @param {any} row - The raw data from the database.
   * @returns {VipContract} The mapped entity.
   */
  protected mapRowToEntity(row: any): VipContract {
    return {
      id: row.id,
      kiosk_id: row.kiosk_id,
      locker_id: row.locker_id,
      rfid_card: row.rfid_card,
      backup_card: row.backup_card,
      start_date: new Date(row.start_date),
      end_date: new Date(row.end_date),
      status: row.status as VipContractStatus,
      created_by: row.created_by,
      created_at: new Date(row.created_at),
      updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
      version: row.version || 1
    };
  }

  // Convenience methods for routes
  /**
   * Retrieves all VIP contracts.
   * @returns {Promise<VipContract[]>} A list of all contracts.
   */
  async getAllContracts(): Promise<VipContract[]> {
    return this.findAll();
  }

  /**
   * Retrieves a single VIP contract by its ID.
   * @param {number} id - The contract ID.
   * @returns {Promise<VipContract | null>} The contract, or null if not found.
   */
  async getContract(id: number): Promise<VipContract | null> {
    return this.findById(id);
  }

  /**
   * Creates a new VIP contract.
   * @param {object} contractData - The data for the new contract.
   * @returns {Promise<VipContract>} The created contract.
   */
  async createContract(contractData: {
    kiosk_id: string;
    locker_id: number;
    rfid_card: string;
    backup_card?: string;
    start_date: Date;
    end_date: Date;
    created_by: string;
  }): Promise<VipContract> {
    return this.create({
      ...contractData,
      status: 'active' as VipContractStatus
    });
  }

  /**
   * Gets the active contract for a specific RFID card.
   * @param {string} rfidCard - The RFID card ID.
   * @returns {Promise<VipContract | null>} The active contract, or null if not found.
   */
  async getActiveContractByCard(rfidCard: string): Promise<VipContract | null> {
    return this.findActiveByCard(rfidCard);
  }

  /**
   * Gets the active contract for a specific locker.
   * @param {string} kioskId - The kiosk ID.
   * @param {number} lockerId - The locker ID.
   * @returns {Promise<VipContract | null>} The active contract, or null if not found.
   */
  async getActiveContractByLocker(kioskId: string, lockerId: number): Promise<VipContract | null> {
    return this.findActiveByLocker(kioskId, lockerId);
  }

  /**
   * Extends the end date of a contract and logs the action.
   * @param {number} id - The contract ID.
   * @param {Date} newEndDate - The new end date.
   * @param {string} performedBy - The user who performed the action.
   * @param {string} [reason] - The reason for the extension.
   */
  async extendContract(id: number, newEndDate: Date, performedBy: string, reason?: string): Promise<void> {
    const oldContract = await this.findById(id);
    if (!oldContract) {
      throw new Error(`VIP contract with id ${id} not found`);
    }

    await this.update(id, { end_date: newEndDate });

    await this.historyRepository.logAction(
      id,
      'extended',
      performedBy,
      { end_date: oldContract.end_date },
      { end_date: newEndDate },
      reason,
      { 
        extension_days: Math.ceil((newEndDate.getTime() - oldContract.end_date.getTime()) / (1000 * 60 * 60 * 24)),
        old_end_date: oldContract.end_date.toISOString(),
        new_end_date: newEndDate.toISOString()
      }
    );
  }

  /**
   * Changes the primary RFID card associated with a contract and logs the action.
   * @param {number} id - The contract ID.
   * @param {string} newCard - The new RFID card ID.
   * @param {string} performedBy - The user who performed the action.
   * @param {string} [reason] - The reason for the change.
   */
  async changeCard(id: number, newCard: string, performedBy: string, reason?: string): Promise<void> {
    const oldContract = await this.findById(id);
    if (!oldContract) {
      throw new Error(`VIP contract with id ${id} not found`);
    }

    await this.update(id, { rfid_card: newCard });

    await this.historyRepository.logAction(
      id,
      'card_changed',
      performedBy,
      { rfid_card: oldContract.rfid_card },
      { rfid_card: newCard },
      reason,
      { 
        old_card: oldContract.rfid_card,
        new_card: newCard,
        change_timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Cancels a contract and logs the action.
   * @param {number} id - The contract ID.
   * @param {string} performedBy - The user who performed the action.
   * @param {string} reason - The reason for the cancellation.
   */
  async cancelContract(id: number, performedBy: string, reason: string): Promise<void> {
    const oldContract = await this.findById(id);
    if (!oldContract) {
      throw new Error(`VIP contract with id ${id} not found`);
    }

    await this.update(id, { status: 'cancelled' as VipContractStatus });

    await this.historyRepository.logAction(
      id,
      'cancelled',
      performedBy,
      { status: oldContract.status },
      { status: 'cancelled' },
      reason,
      { 
        cancelled_at: new Date().toISOString(),
        original_end_date: oldContract.end_date.toISOString(),
        days_remaining: Math.ceil((oldContract.end_date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      }
    );
  }

  /**
   * Transfers a VIP contract to a new locker and/or a new RFID card, logging the action.
   * @param {number} id - The contract ID.
   * @param {string} newKioskId - The new kiosk ID.
   * @param {number} newLockerId - The new locker ID.
   * @param {string} performedBy - The user who performed the action.
   * @param {string} [newRfidCard] - An optional new RFID card ID.
   * @param {string} [reason] - The reason for the transfer.
   */
  async transferContract(
    id: number, 
    newKioskId: string, 
    newLockerId: number, 
    performedBy: string,
    newRfidCard?: string,
    reason?: string
  ): Promise<void> {
    const oldContract = await this.findById(id);
    if (!oldContract) {
      throw new Error(`VIP contract with id ${id} not found`);
    }

    const updates: Partial<VipContract> = {
      kiosk_id: newKioskId,
      locker_id: newLockerId
    };

    if (newRfidCard) {
      updates.rfid_card = newRfidCard;
    }

    await this.update(id, updates);

    await this.historyRepository.logAction(
      id,
      'transferred',
      performedBy,
      { 
        kiosk_id: oldContract.kiosk_id,
        locker_id: oldContract.locker_id,
        rfid_card: oldContract.rfid_card
      },
      { 
        kiosk_id: newKioskId,
        locker_id: newLockerId,
        rfid_card: newRfidCard || oldContract.rfid_card
      },
      reason,
      { 
        from_location: `${oldContract.kiosk_id}:${oldContract.locker_id}`,
        to_location: `${newKioskId}:${newLockerId}`,
        card_changed: !!newRfidCard,
        transfer_timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Retrieves the historical log of actions for a specific contract.
   * @param {number} id - The contract ID.
   * @returns {Promise<any[]>} A promise that resolves to an array of history records.
   */
  async getContractHistory(id: number): Promise<any[]> {
    return this.historyRepository.getContractHistory(id);
  }

  /**
   * Creates a detailed audit log entry for a VIP operation.
   * @param {string} operation - The type of operation being audited.
   * @param {number} contractId - The ID of the contract.
   * @param {string} performedBy - The user who performed the operation.
   * @param {Record<string, any>} details - Additional details about the operation.
   * @param {string} [ipAddress] - The IP address of the user.
   * @param {string} [userAgent] - The user agent of the client.
   */
  async auditVipOperation(
    operation: 'create' | 'extend' | 'change_card' | 'transfer' | 'cancel' | 'approve_transfer' | 'reject_transfer',
    contractId: number,
    performedBy: string,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const contract = await this.findById(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found for audit logging`);
    }

    const auditDetails = {
      ...details,
      operation,
      contract_id: contractId,
      performed_by: performedBy,
      timestamp: new Date().toISOString(),
      contract_location: `${contract.kiosk_id}:${contract.locker_id}`,
      contract_card: contract.rfid_card,
      contract_status: contract.status,
      ip_address: ipAddress,
      user_agent: userAgent,
      audit_version: '1.0'
    };

    await this.historyRepository.logAction(
      contractId,
      this.mapOperationToActionType(operation),
      performedBy,
      undefined,
      undefined,
      details.reason || `${operation} operation`,
      auditDetails
    );
  }

  /**
   * Maps a high-level operation name to a `VipHistoryActionType`.
   * @private
   * @param {string} operation - The operation name.
   * @returns {VipHistoryActionType} The corresponding action type.
   */
  private mapOperationToActionType(operation: string): 'created' | 'extended' | 'card_changed' | 'transferred' | 'cancelled' {
    const mapping: Record<string, 'created' | 'extended' | 'card_changed' | 'transferred' | 'cancelled'> = {
      'create': 'created',
      'extend': 'extended',
      'change_card': 'card_changed',
      'transfer': 'transferred',
      'cancel': 'cancelled',
      'approve_transfer': 'transferred',
      'reject_transfer': 'cancelled'
    };
    return mapping[operation] || 'created';
  }

  /**
   * Gathers a comprehensive audit trail for a contract, combining data from
   * the contract itself, its history, related events, and transfer requests.
   * @param {number} contractId - The ID of the contract.
   * @returns {Promise<object>} An object containing the full audit trail.
   */
  async getComprehensiveAuditTrail(contractId: number): Promise<{
    contract: VipContract;
    history: any[];
    events: any[];
    transfers: any[];
  }> {
    const contract = await this.findById(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    const history = await this.historyRepository.getContractHistory(contractId);

    const eventsSql = `
      SELECT * FROM events 
      WHERE (kiosk_id = ? AND locker_id = ?) 
      AND (event_type LIKE 'vip_%' OR JSON_EXTRACT(details, '$.contract_id') = ?)
      ORDER BY timestamp DESC 
      LIMIT 100
    `;
    const events = await this.db.all(eventsSql, [contract.kiosk_id, contract.locker_id, contractId]);

    const transfersSql = `
      SELECT * FROM vip_transfer_requests 
      WHERE contract_id = ?
      ORDER BY created_at DESC
    `;
    const transfers = await this.db.all(transfersSql, [contractId]);

    return {
      contract,
      history,
      events,
      transfers
    };
  }

  /**
   * Maps a `VipContract` entity to a raw object for database insertion/updates.
   * @protected
   * @param {Partial<VipContract>} entity - The entity to map.
   * @returns {Record<string, any>} The mapped raw object.
   */
  protected mapEntityToRow(entity: Partial<VipContract>): Record<string, any> {
    const row: Record<string, any> = {};

    if (entity.kiosk_id !== undefined) row.kiosk_id = entity.kiosk_id;
    if (entity.locker_id !== undefined) row.locker_id = entity.locker_id;
    if (entity.rfid_card !== undefined) row.rfid_card = entity.rfid_card;
    if (entity.backup_card !== undefined) row.backup_card = entity.backup_card;
    if (entity.start_date !== undefined) row.start_date = entity.start_date.toISOString().split('T')[0];
    if (entity.end_date !== undefined) row.end_date = entity.end_date.toISOString().split('T')[0];
    if (entity.status !== undefined) row.status = entity.status;
    if (entity.created_by !== undefined) row.created_by = entity.created_by;

    return row;
  }
}
