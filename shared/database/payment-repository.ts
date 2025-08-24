import { Database } from 'sqlite3';

export interface Payment {
  id?: number;
  contract_id: number;
  amount: number;
  method: 'cash' | 'card' | 'transfer' | 'other';
  paid_at?: string;
  reference?: string;
  notes?: string;
  created_by: string;
  created_at?: string;
}

export interface CreatePaymentData extends Omit<Payment, 'id' | 'created_at' | 'paid_at'> {
  paid_at?: string;
}

export interface PaymentSummary {
  total_amount: number;
  payment_count: number;
  last_payment_date: string | null;
}

export interface PaymentStatistics {
  total_amount: number;
  total_count: number;
  this_month: { amount: number; count: number };
}

/**
 * Repository for contract payments
 */
export class PaymentRepository {
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

  async create(data: CreatePaymentData): Promise<Payment> {
    const sql = `
      INSERT INTO payments (contract_id, amount, method, paid_at, reference, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.contract_id,
      data.amount,
      data.method,
      data.paid_at || new Date().toISOString(),
      data.reference || null,
      data.notes || null,
      data.created_by
    ];
    const result = await this.run(sql, params);
    const created = await this.findById(result.lastID!);
    if (!created) throw new Error('Failed to create payment');
    return created;
  }

  async findById(id: number): Promise<Payment | null> {
    const row = await this.get<Payment>('SELECT * FROM payments WHERE id = ?', [id]);
    return row || null;
  }

  async findByContractId(contractId: number): Promise<Payment[]> {
    return this.all<Payment>('SELECT * FROM payments WHERE contract_id = ? ORDER BY paid_at DESC', [contractId]);
  }

  async findAllWithDetails(): Promise<any[]> {
    const sql = `
      SELECT p.*, c.member_name, c.phone, c.plan, c.kiosk_id, c.locker_id
      FROM payments p
      JOIN contracts c ON p.contract_id = c.id
      ORDER BY p.paid_at DESC
    `;
    return this.all<any>(sql);
  }

  async getContractPaymentSummary(contractId: number): Promise<PaymentSummary | null> {
    const row = await this.get<PaymentSummary>(
      'SELECT COALESCE(SUM(amount),0) as total_amount, COUNT(*) as payment_count, MAX(paid_at) as last_payment_date FROM payments WHERE contract_id = ?',
      [contractId]
    );
    if (!row || row.payment_count === 0) return null;
    return row;
  }

  async getStatistics(): Promise<PaymentStatistics> {
    const [total, thisMonth] = await Promise.all([
      this.get<{ total_amount: number; total_count: number }>('SELECT COALESCE(SUM(amount),0) as total_amount, COUNT(*) as total_count FROM payments'),
      this.get<{ amount: number; count: number }>("SELECT COALESCE(SUM(amount),0) as amount, COUNT(*) as count FROM payments WHERE strftime('%Y-%m', paid_at) = strftime('%Y-%m', 'now')")
    ]);
    return {
      total_amount: total?.total_amount || 0,
      total_count: total?.total_count || 0,
      this_month: { amount: thisMonth?.amount || 0, count: thisMonth?.count || 0 }
    };
  }
}
