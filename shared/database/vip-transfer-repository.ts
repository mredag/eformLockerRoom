import { BaseRepository } from './base-repository.js';
import { DatabaseConnection } from './connection.js';
import { VipTransferRequest, VipTransferStatus } from '../types/core-entities.js';

export interface VipTransferFilter {
  contract_id?: number;
  status?: VipTransferStatus | VipTransferStatus[];
  requested_by?: string;
  approved_by?: string;
  from_kiosk_id?: string;
  to_kiosk_id?: string;
  from_date?: Date;
  to_date?: Date;
}

export class VipTransferRepository extends BaseRepository<VipTransferRequest> {
  private dbManager: any;

  constructor(dbOrManager: DatabaseConnection | any) {
    if (dbOrManager.getDatabase) {
      // It's a DatabaseManager
      super(dbOrManager.getDatabase(), 'vip_transfer_requests');
      this.dbManager = dbOrManager;
    } else {
      // It's a DatabaseConnection
      super(dbOrManager, 'vip_transfer_requests');
    }
  }

  async findById(id: string | number): Promise<VipTransferRequest | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    const row = await this.db.get(sql, [id]);
    return row ? this.mapRowToEntity(row) : null;
  }

  async findAll(filter?: VipTransferFilter): Promise<VipTransferRequest[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];

    if (filter) {
      const conditions: string[] = [];

      if (filter.contract_id) {
        conditions.push('contract_id = ?');
        params.push(filter.contract_id);
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

      if (filter.requested_by) {
        conditions.push('requested_by = ?');
        params.push(filter.requested_by);
      }

      if (filter.approved_by) {
        conditions.push('approved_by = ?');
        params.push(filter.approved_by);
      }

      if (filter.from_kiosk_id) {
        conditions.push('from_kiosk_id = ?');
        params.push(filter.from_kiosk_id);
      }

      if (filter.to_kiosk_id) {
        conditions.push('to_kiosk_id = ?');
        params.push(filter.to_kiosk_id);
      }

      if (filter.from_date) {
        conditions.push('created_at >= ?');
        params.push(filter.from_date.toISOString());
      }

      if (filter.to_date) {
        conditions.push('created_at <= ?');
        params.push(filter.to_date.toISOString());
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    sql += ' ORDER BY created_at DESC';

    const rows = await this.db.all(sql, params);
    return rows.map(row => this.mapRowToEntity(row));
  }

  async create(transfer: Omit<VipTransferRequest, 'id' | 'created_at' | 'approved_at' | 'completed_at'>): Promise<VipTransferRequest> {
    const sql = `
      INSERT INTO ${this.tableName} (
        contract_id, from_kiosk_id, from_locker_id, to_kiosk_id, to_locker_id,
        new_rfid_card, reason, requested_by, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      transfer.contract_id,
      transfer.from_kiosk_id,
      transfer.from_locker_id,
      transfer.to_kiosk_id,
      transfer.to_locker_id,
      transfer.new_rfid_card || null,
      transfer.reason,
      transfer.requested_by,
      transfer.status
    ];

    const result = await this.db.run(sql, params);
    
    const created = await this.findById(result.lastID!);
    if (!created) {
      throw new Error('Failed to create VIP transfer request');
    }
    
    return created;
  }

  async update(id: string | number, updates: Partial<VipTransferRequest>, expectedVersion: number = 1): Promise<VipTransferRequest> {
    const setClause: string[] = [];
    const params: any[] = [];

    // Build SET clause dynamically
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'created_at') {
        continue; // Skip immutable fields
      }

      setClause.push(`${key} = ?`);
      params.push(value);
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
      throw new Error(`VIP transfer request with id ${id} not found`);
    }

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Failed to retrieve updated VIP transfer request');
    }

    return updated;
  }

  async delete(id: string | number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Approve a transfer request
   */
  async approveTransfer(id: number, approvedBy: string): Promise<VipTransferRequest> {
    return this.update(id, {
      status: 'approved' as VipTransferStatus,
      approved_by: approvedBy,
      approved_at: new Date()
    });
  }

  /**
   * Reject a transfer request
   */
  async rejectTransfer(id: number, approvedBy: string, rejectionReason: string): Promise<VipTransferRequest> {
    return this.update(id, {
      status: 'rejected' as VipTransferStatus,
      approved_by: approvedBy,
      approved_at: new Date(),
      rejection_reason: rejectionReason
    });
  }

  /**
   * Complete a transfer request
   */
  async completeTransfer(id: number): Promise<VipTransferRequest> {
    return this.update(id, {
      status: 'completed' as VipTransferStatus,
      completed_at: new Date()
    });
  }

  /**
   * Cancel a transfer request
   */
  async cancelTransfer(id: number): Promise<VipTransferRequest> {
    return this.update(id, {
      status: 'cancelled' as VipTransferStatus
    });
  }

  /**
   * Get pending transfers for approval
   */
  async getPendingTransfers(): Promise<VipTransferRequest[]> {
    return this.findAll({ status: 'pending' });
  }

  /**
   * Get transfers by contract
   */
  async getTransfersByContract(contractId: number): Promise<VipTransferRequest[]> {
    return this.findAll({ contract_id: contractId });
  }

  /**
   * Check if locker has pending transfers
   */
  async hasLockerPendingTransfers(kioskId: string, lockerId: number): Promise<boolean> {
    const sql = `
      SELECT COUNT(*) as count FROM ${this.tableName} 
      WHERE (from_kiosk_id = ? AND from_locker_id = ?) 
         OR (to_kiosk_id = ? AND to_locker_id = ?)
      AND status IN ('pending', 'approved')
    `;
    
    const result = await this.db.get(sql, [kioskId, lockerId, kioskId, lockerId]);
    return result.count > 0;
  }

  protected mapRowToEntity(row: any): VipTransferRequest {
    return {
      id: row.id,
      contract_id: row.contract_id,
      from_kiosk_id: row.from_kiosk_id,
      from_locker_id: row.from_locker_id,
      to_kiosk_id: row.to_kiosk_id,
      to_locker_id: row.to_locker_id,
      new_rfid_card: row.new_rfid_card,
      reason: row.reason,
      requested_by: row.requested_by,
      approved_by: row.approved_by,
      status: row.status as VipTransferStatus,
      rejection_reason: row.rejection_reason,
      created_at: new Date(row.created_at),
      approved_at: row.approved_at ? new Date(row.approved_at) : undefined,
      completed_at: row.completed_at ? new Date(row.completed_at) : undefined
    };
  }

  protected mapEntityToRow(entity: Partial<VipTransferRequest>): Record<string, any> {
    const row: Record<string, any> = {};

    if (entity.contract_id !== undefined) row.contract_id = entity.contract_id;
    if (entity.from_kiosk_id !== undefined) row.from_kiosk_id = entity.from_kiosk_id;
    if (entity.from_locker_id !== undefined) row.from_locker_id = entity.from_locker_id;
    if (entity.to_kiosk_id !== undefined) row.to_kiosk_id = entity.to_kiosk_id;
    if (entity.to_locker_id !== undefined) row.to_locker_id = entity.to_locker_id;
    if (entity.new_rfid_card !== undefined) row.new_rfid_card = entity.new_rfid_card;
    if (entity.reason !== undefined) row.reason = entity.reason;
    if (entity.requested_by !== undefined) row.requested_by = entity.requested_by;
    if (entity.approved_by !== undefined) row.approved_by = entity.approved_by;
    if (entity.status !== undefined) row.status = entity.status;
    if (entity.rejection_reason !== undefined) row.rejection_reason = entity.rejection_reason;
    if (entity.approved_at !== undefined) row.approved_at = entity.approved_at.toISOString();
    if (entity.completed_at !== undefined) row.completed_at = entity.completed_at.toISOString();

    return row;
  }
}