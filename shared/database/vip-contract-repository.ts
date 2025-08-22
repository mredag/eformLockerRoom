import { BaseRepository } from './base-repository.js';
import { DatabaseConnection } from './connection.js';
import { VipContract, VipContractStatus } from '../types/core-entities.js';
import { VipHistoryRepository } from './vip-history-repository.js';

export interface VipContractFilter {
  kiosk_id?: string;
  locker_id?: number;
  rfid_card?: string;
  status?: VipContractStatus | VipContractStatus[];
  created_by?: string;
  expires_before?: Date;
  expires_after?: Date;
}

export class VipContractRepository extends BaseRepository<VipContract> {
  private dbManager: any;
  private historyRepository: VipHistoryRepository;

  constructor(dbOrManager: DatabaseConnection | any) {
    if (dbOrManager.getDatabase) {
      // It's a DatabaseManager
      super(dbOrManager.getDatabase(), 'vip_contracts');
      this.dbManager = dbOrManager;
      this.historyRepository = new VipHistoryRepository(dbOrManager);
    } else {
      // It's a DatabaseConnection
      super(dbOrManager, 'vip_contracts');
      this.historyRepository = new VipHistoryRepository(dbOrManager);
    }
  }

  async findById(id: string | number): Promise<VipContract | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    const row = await this.db.get(sql, [id]);
    return row ? this.mapRowToEntity(row) : null;
  }

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

  async create(contract: Omit<VipContract, 'id' | 'created_at' | 'updated_at'>): Promise<VipContract> {
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

  async update(id: string | number, updates: Partial<VipContract>, expectedVersion: number = 1): Promise<VipContract> {
    const setClause: string[] = [];
    const params: any[] = [];

    // Build SET clause dynamically
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'created_at' || key === 'updated_at') {
        continue; // Skip immutable fields
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

    // Add updated_at timestamp
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

  async delete(id: string | number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Find active contract by RFID card
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
   * Find active contract by locker
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
   * Find contracts expiring soon
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
   * Mark expired contracts
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
   * Get contract statistics
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

    const result = await this.db.get(sql);
    return {
      total: result?.total || 0,
      active: result?.active || 0,
      expired: result?.expired || 0,
      cancelled: result?.cancelled || 0,
      expiring_soon: result?.expiring_soon || 0
    };
  }

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
      updated_at: row.updated_at ? new Date(row.updated_at) : undefined
    };
  }

  // Additional methods for the routes
  async getAllContracts(): Promise<VipContract[]> {
    return this.findAll();
  }

  async getContract(id: number): Promise<VipContract | null> {
    return this.findById(id);
  }

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

  async getActiveContractByCard(rfidCard: string): Promise<VipContract | null> {
    return this.findActiveByCard(rfidCard);
  }

  async getActiveContractByLocker(kioskId: string, lockerId: number): Promise<VipContract | null> {
    return this.findActiveByLocker(kioskId, lockerId);
  }

  async extendContract(id: number, newEndDate: Date, performedBy: string, reason?: string): Promise<void> {
    const oldContract = await this.findById(id);
    if (!oldContract) {
      throw new Error(`VIP contract with id ${id} not found`);
    }

    await this.update(id, { end_date: newEndDate });

    // Log the extension in history
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

  async changeCard(id: number, newCard: string, performedBy: string, reason?: string): Promise<void> {
    const oldContract = await this.findById(id);
    if (!oldContract) {
      throw new Error(`VIP contract with id ${id} not found`);
    }

    await this.update(id, { rfid_card: newCard });

    // Log the card change in history
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

  async cancelContract(id: number, performedBy: string, reason: string): Promise<void> {
    const oldContract = await this.findById(id);
    if (!oldContract) {
      throw new Error(`VIP contract with id ${id} not found`);
    }

    await this.update(id, { status: 'cancelled' as VipContractStatus });

    // Log the cancellation in history
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
   * Transfer VIP contract to new locker and optionally new card
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

    // Log the transfer in history
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
   * Get contract history
   */
  async getContractHistory(id: number): Promise<any[]> {
    return this.historyRepository.getContractHistory(id);
  }

  /**
   * Comprehensive audit logging for all VIP operations
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

    // Enhanced audit details with mandatory fields
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

    // Log to history repository
    await this.historyRepository.logAction(
      contractId,
      this.mapOperationToActionType(operation),
      performedBy,
      undefined, // old values will be captured by triggers
      undefined, // new values will be captured by triggers
      details.reason || `${operation} operation`,
      auditDetails
    );
  }

  /**
   * Map operation to action type for history
   */
  private mapOperationToActionType(operation: string): 'created' | 'extended' | 'card_changed' | 'transferred' | 'cancelled' {
    const mapping: Record<string, 'created' | 'extended' | 'card_changed' | 'transferred' | 'cancelled'> = {
      'create': 'created',
      'extend': 'extended',
      'change_card': 'card_changed',
      'transfer': 'transferred',
      'cancel': 'cancelled',
      'approve_transfer': 'transferred',
      'reject_transfer': 'cancelled' // Treat rejection as a form of cancellation
    };
    return mapping[operation] || 'created';
  }

  /**
   * Get comprehensive audit trail for a contract
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

    // Get history from history repository
    const history = await this.historyRepository.getContractHistory(contractId);

    // Get related events from events table
    const db = this.dbManager ? this.dbManager.getDatabase() : this.db;
    const events = db.prepare(`
      SELECT * FROM events 
      WHERE (kiosk_id = ? AND locker_id = ?) 
      AND (event_type LIKE 'vip_%' OR JSON_EXTRACT(details, '$.contract_id') = ?)
      ORDER BY timestamp DESC 
      LIMIT 100
    `).all(contract.kiosk_id, contract.locker_id, contractId);

    // Get transfer requests
    const transfers = db.prepare(`
      SELECT * FROM vip_transfer_requests 
      WHERE contract_id = ?
      ORDER BY created_at DESC
    `).all(contractId);

    return {
      contract,
      history,
      events,
      transfers
    };
  }

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