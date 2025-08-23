import { BaseRepository } from './base-repository';
import { DatabaseConnection } from './connection';
import { Command, CommandStatus, CommandType } from '../types/core-entities';

export interface CommandFilter {
  kiosk_id?: string;
  command_type?: CommandType | CommandType[];
  status?: CommandStatus | CommandStatus[];
  created_after?: Date;
  created_before?: Date;
  next_attempt_before?: Date;
  limit?: number;
}

export class CommandQueueRepository extends BaseRepository<Command> {
  constructor(db: DatabaseConnection) {
    super(db, 'command_queue');
  }

  async findById(id: string | number): Promise<Command | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE command_id = ?`;
    const row = await this.db.get(sql, [id]);
    return row ? this.mapRowToEntity(row) : null;
  }

  async findAll(filter?: CommandFilter): Promise<Command[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];

    if (filter) {
      const conditions: string[] = [];

      if (filter.kiosk_id) {
        conditions.push('kiosk_id = ?');
        params.push(filter.kiosk_id);
      }

      if (filter.command_type) {
        if (Array.isArray(filter.command_type)) {
          conditions.push(`command_type IN (${filter.command_type.map(() => '?').join(', ')})`);
          params.push(...filter.command_type);
        } else {
          conditions.push('command_type = ?');
          params.push(filter.command_type);
        }
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

      if (filter.created_after) {
        conditions.push('created_at >= ?');
        params.push(filter.created_after.toISOString());
      }

      if (filter.created_before) {
        conditions.push('created_at <= ?');
        params.push(filter.created_before.toISOString());
      }

      if (filter.next_attempt_before) {
        conditions.push('next_attempt_at <= ?');
        params.push(filter.next_attempt_before.toISOString());
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    sql += ' ORDER BY next_attempt_at ASC, created_at ASC';

    if (filter?.limit) {
      sql += ` LIMIT ${filter.limit}`;
    }

    const rows = await this.db.all(sql, params);
    return rows.map(row => this.mapRowToEntity(row));
  }

  async create(command: Omit<Command, 'created_at'>): Promise<Command> {
    const sql = `
      INSERT INTO ${this.tableName} (
        command_id, kiosk_id, command_type, payload, status,
        retry_count, max_retries, next_attempt_at, last_error,
        executed_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      command.command_id,
      command.kiosk_id,
      command.command_type,
      JSON.stringify(command.payload),
      command.status,
      command.retry_count,
      command.max_retries,
      command.next_attempt_at.toISOString(),
      command.last_error || null,
      command.executed_at?.toISOString() || null,
      command.completed_at?.toISOString() || null
    ];

    await this.db.run(sql, params);
    
    const created = await this.findById(command.command_id);
    if (!created) {
      throw new Error('Failed to create command');
    }
    
    return created;
  }

  async update(id: string | number, updates: Partial<Command>, expectedVersion: number = 1): Promise<Command> {
    const setClause: string[] = [];
    const params: any[] = [];

    // Build SET clause dynamically
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'command_id' || key === 'created_at') {
        continue; // Skip immutable fields
      }

      setClause.push(`${key} = ?`);
      
      if (key === 'payload') {
        params.push(JSON.stringify(value));
      } else if (key === 'next_attempt_at' || key === 'executed_at' || key === 'completed_at') {
        params.push(value instanceof Date ? value.toISOString() : value);
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
      WHERE command_id = ?
    `;

    params.push(id);

    const result = await this.db.run(sql, params);
    
    if (result.changes === 0) {
      throw new Error(`Command with id ${id} not found`);
    }

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Failed to retrieve updated command');
    }

    return updated;
  }

  async delete(id: string | number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE command_id = ?`;
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Get pending commands for a kiosk
   */
  async getPendingCommands(kioskId: string, limit?: number): Promise<Command[]> {
    return this.findAll({
      kiosk_id: kioskId,
      status: ['pending', 'failed'],
      next_attempt_before: new Date(),
      limit
    });
  }

  /**
   * Mark command as executing
   */
  async markExecuting(commandId: string): Promise<Command> {
    return this.update(commandId, {
      status: 'executing',
      executed_at: new Date()
    });
  }

  /**
   * Mark command as completed
   */
  async markCompleted(commandId: string): Promise<Command> {
    return this.update(commandId, {
      status: 'completed',
      completed_at: new Date()
    });
  }

  /**
   * Mark command as failed and schedule retry
   */
  async markFailed(commandId: string, error: string, retryDelayMs: number = 5000): Promise<Command> {
    const command = await this.findById(commandId);
    if (!command) {
      throw new Error(`Command ${commandId} not found`);
    }

    const newRetryCount = command.retry_count + 1;
    const nextAttempt = new Date(Date.now() + retryDelayMs * Math.pow(2, newRetryCount - 1)); // Exponential backoff

    return this.update(commandId, {
      status: newRetryCount >= command.max_retries ? 'failed' : 'pending',
      retry_count: newRetryCount,
      last_error: error,
      next_attempt_at: nextAttempt
    });
  }

  /**
   * Cancel command
   */
  async cancelCommand(commandId: string): Promise<Command> {
    return this.update(commandId, {
      status: 'cancelled',
      completed_at: new Date()
    });
  }

  /**
   * Clean up old completed/failed commands
   */
  async cleanupOldCommands(retentionDays: number = 7): Promise<number> {
    const sql = `
      DELETE FROM ${this.tableName} 
      WHERE status IN ('completed', 'failed', 'cancelled')
      AND created_at < datetime('now', '-${retentionDays} days')
    `;
    
    const result = await this.db.run(sql);
    return result.changes;
  }

  /**
   * Get command statistics
   */
  async getStatistics(kioskId?: string): Promise<{
    total: number;
    pending: number;
    executing: number;
    completed: number;
    failed: number;
    cancelled: number;
    by_type: Record<string, number>;
  }> {
    let sql = `
      SELECT 
        COUNT(*) as total,
        status,
        command_type
      FROM ${this.tableName}
    `;

    const params: any[] = [];

    if (kioskId) {
      sql += ' WHERE kiosk_id = ?';
      params.push(kioskId);
    }

    sql += ' GROUP BY status, command_type';

    interface StatsRow {
      status: string;
      command_type: string;
      total: number;
    }

    const rows = await this.db.all<StatsRow>(sql, params);

    const stats = {
      total: 0,
      pending: 0,
      executing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      by_type: {} as Record<string, number>
    };

    for (const row of rows) {
      stats.total += row.total;
      stats.by_type[row.command_type] = (stats.by_type[row.command_type] || 0) + row.total;

      switch (row.status) {
        case 'pending':
          stats.pending += row.total;
          break;
        case 'executing':
          stats.executing += row.total;
          break;
        case 'completed':
          stats.completed += row.total;
          break;
        case 'failed':
          stats.failed += row.total;
          break;
        case 'cancelled':
          stats.cancelled += row.total;
          break;
      }
    }

    return stats;
  }

  /**
   * Clear all pending commands for a kiosk (used on restart)
   */
  async clearPendingCommands(kioskId: string): Promise<number> {
    const sql = `
      UPDATE ${this.tableName} 
      SET status = 'cancelled',
          completed_at = CURRENT_TIMESTAMP,
          last_error = 'Cleared on system restart'
      WHERE kiosk_id = ? 
      AND status IN ('pending', 'executing')
    `;
    
    const result = await this.db.run(sql, [kioskId]);
    return result.changes;
  }

  protected mapRowToEntity(row: any): Command {
    return {
      command_id: row.command_id,
      kiosk_id: row.kiosk_id,
      command_type: row.command_type as CommandType,
      payload: JSON.parse(row.payload),
      status: row.status as CommandStatus,
      retry_count: row.retry_count,
      max_retries: row.max_retries,
      next_attempt_at: new Date(row.next_attempt_at),
      last_error: row.last_error,
      created_at: new Date(row.created_at),
      executed_at: row.executed_at ? new Date(row.executed_at) : undefined,
      completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
      version: row.version || 1
    };
  }

  protected mapEntityToRow(entity: Partial<Command>): Record<string, any> {
    const row: Record<string, any> = {};

    if (entity.command_id !== undefined) row.command_id = entity.command_id;
    if (entity.kiosk_id !== undefined) row.kiosk_id = entity.kiosk_id;
    if (entity.command_type !== undefined) row.command_type = entity.command_type;
    if (entity.payload !== undefined) row.payload = JSON.stringify(entity.payload);
    if (entity.status !== undefined) row.status = entity.status;
    if (entity.retry_count !== undefined) row.retry_count = entity.retry_count;
    if (entity.max_retries !== undefined) row.max_retries = entity.max_retries;
    if (entity.next_attempt_at !== undefined) row.next_attempt_at = entity.next_attempt_at.toISOString();
    if (entity.last_error !== undefined) row.last_error = entity.last_error;
    if (entity.executed_at !== undefined) row.executed_at = entity.executed_at?.toISOString();
    if (entity.completed_at !== undefined) row.completed_at = entity.completed_at?.toISOString();

    return row;
  }
}
