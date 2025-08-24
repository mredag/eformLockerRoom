import { Database } from 'sqlite3';

export interface Contract {
  id?: number;
  member_name: string;
  phone: string;
  email?: string;
  plan: 'basic' | 'premium' | 'executive';
  price: number;
  start_at: string; // YYYY-MM-DD
  end_at: string;   // YYYY-MM-DD
  status: 'active' | 'expired' | 'cancelled';
  created_at?: string;
  created_by: string;
  kiosk_id: string;
  locker_id: number;
  rfid_card: string;
  backup_card?: string;
  notes?: string;
  updated_at?: string;
}

export interface CreateContractData extends Omit<Contract, 'id' | 'status' | 'created_at' | 'updated_at'> {}
export interface UpdateContractData extends Partial<Omit<Contract, 'id' | 'created_at' | 'created_by'>> {}

export interface ContractWithPayments extends Contract {
  total_paid: number;
  payment_count: number;
  last_payment_date: string | null;
}

export interface ExpiringContract extends Contract {
  days_until_expiry: number;
}

export interface ContractStatistics {
  total: number;
  active: number;
  expired: number;
  cancelled: number;
  expiring_soon: number;
  by_plan: { basic: number; premium: number; executive: number };
}

/**
 * Repository for VIP contracts
 */
export class ContractRepository {
  constructor(private db: Database) {}

  private run(sql: string, params: any[] = []): Promise<{ lastID?: number; changes?: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (this: any, err: Error | null) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  private get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T);
      });
    });
  }

  private all<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  async create(data: CreateContractData): Promise<Contract> {
    const sql = `
      INSERT INTO contracts (
        member_name, phone, email, plan, price,
        start_at, end_at, status, created_by,
        kiosk_id, locker_id, rfid_card, backup_card, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.member_name,
      data.phone,
      data.email || null,
      data.plan,
      data.price,
      data.start_at,
      data.end_at,
      data.created_by,
      data.kiosk_id,
      data.locker_id,
      data.rfid_card,
      data.backup_card || null,
      data.notes || null
    ];
    const result = await this.run(sql, params);
    const created = await this.findById(result.lastID!);
    if (!created) throw new Error('Failed to create contract');
    return created;
  }

  async findById(id: number): Promise<Contract | null> {
    const row = await this.get<Contract>('SELECT * FROM contracts WHERE id = ?', [id]);
    return row || null;
  }

  async update(id: number, updates: UpdateContractData): Promise<Contract | null> {
    const fields: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    if (fields.length === 0) return this.findById(id);
    fields.push('updated_at = CURRENT_TIMESTAMP');
    const sql = `UPDATE contracts SET ${fields.join(', ')} WHERE id = ?`;
    params.push(id);
    await this.run(sql, params);
    return this.findById(id);
  }

  async isLockerAvailable(kioskId: string, lockerId: number): Promise<boolean> {
    const row = await this.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM contracts WHERE kiosk_id = ? AND locker_id = ? AND status = \u0027active\u0027',
      [kioskId, lockerId]
    );
    return (row?.count || 0) === 0;
  }

  async isRfidCardAvailable(card: string): Promise<boolean> {
    const row = await this.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM contracts WHERE status = \u0027active\u0027 AND (rfid_card = ? OR backup_card = ?)',
      [card, card]
    );
    return (row?.count || 0) === 0;
  }

  async findByPhone(phone: string): Promise<Contract[]> {
    return this.all<Contract>(
      'SELECT * FROM contracts WHERE phone = ? ORDER BY created_at DESC',
      [phone]
    );
  }

  async findByRfidCard(card: string): Promise<Contract | null> {
    const row = await this.get<Contract>(
      'SELECT * FROM contracts WHERE status = \u0027active\u0027 AND (rfid_card = ? OR backup_card = ?) ORDER BY created_at DESC LIMIT 1',
      [card, card]
    );
    return row || null;
  }

  async findActive(): Promise<Contract[]> {
    return this.all<Contract>('SELECT * FROM contracts WHERE status = \u0027active\u0027');
  }

  async findActiveWithPayments(): Promise<ContractWithPayments[]> {
    const sql = `
      SELECT c.*, 
        COALESCE(p.total_paid, 0) AS total_paid,
        COALESCE(p.payment_count, 0) AS payment_count,
        COALESCE(p.last_payment_date, NULL) AS last_payment_date
      FROM contracts c
      LEFT JOIN (
        SELECT contract_id, SUM(amount) AS total_paid,
               COUNT(*) AS payment_count, MAX(paid_at) AS last_payment_date
        FROM payments GROUP BY contract_id
      ) p ON c.id = p.contract_id
      WHERE c.status = 'active'
    `;
    return this.all<ContractWithPayments>(sql);
  }

  async findExpiring(days: number = 30): Promise<ExpiringContract[]> {
    const sql = `
      SELECT c.*, (julianday(c.end_at) - julianday('now')) AS days_until_expiry
      FROM contracts c
      WHERE c.status = 'active'
        AND c.end_at <= date('now', '+${days} days')
        AND c.end_at >= date('now')
      ORDER BY c.end_at ASC
    `;
    return this.all<ExpiringContract>(sql);
  }

  async getStatistics(): Promise<ContractStatistics> {
    const [total, active, expired, cancelled, expiringSoon, planRows] = await Promise.all([
      this.get<{ count: number }>('SELECT COUNT(*) as count FROM contracts'),
      this.get<{ count: number }>('SELECT COUNT(*) as count FROM contracts WHERE status = \'active\''),
      this.get<{ count: number }>('SELECT COUNT(*) as count FROM contracts WHERE status = \'expired\''),
      this.get<{ count: number }>('SELECT COUNT(*) as count FROM contracts WHERE status = \'cancelled\''),
      this.get<{ count: number }>("SELECT COUNT(*) as count FROM contracts WHERE status = 'active' AND end_at <= date('now', '+30 days') AND end_at >= date('now')"),
      this.all<{ plan: string; count: number }>('SELECT plan, COUNT(*) as count FROM contracts GROUP BY plan')
    ]);

    const by_plan = { basic: 0, premium: 0, executive: 0 };
    for (const row of planRows) {
      if (row.plan === 'basic' || row.plan === 'premium' || row.plan === 'executive') {
        (by_plan as any)[row.plan] = row.count;
      }
    }

    return {
      total: total?.count || 0,
      active: active?.count || 0,
      expired: expired?.count || 0,
      cancelled: cancelled?.count || 0,
      expiring_soon: expiringSoon?.count || 0,
      by_plan
    };
  }
}
