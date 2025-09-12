import { BaseRepository } from './base-repository';
import { DatabaseConnection } from './connection';
import { Command, CommandStatus, CommandType } from '../types/core-entities';

/**
 * Defines the filtering criteria for querying the command queue.
 */
export interface CommandFilter {
  kiosk_id?: string;
  command_type?: CommandType | CommandType[];
  status?: CommandStatus | CommandStatus[];
  created_after?: Date;
  created_before?: Date;
  next_attempt_before?: Date;
  limit?: number;
}

/**
 * Manages the persistence and retrieval of `Command` entities from the `command_queue` table.
 * This repository provides a comprehensive API for queuing, processing, and managing asynchronous commands,
 * including features like filtering, retries with exponential backoff, and status management.
 * @extends {BaseRepository<Command>}
 */
export class CommandQueueRepository extends BaseRepository<Command> {
  /**
   * Creates an instance of CommandQueueRepository.
   * @param {DatabaseConnection} db - The database connection instance.
   */
  constructor(db: DatabaseConnection) {
    super(db, 'command_queue');
  }

  /**
   * Finds a command by its unique ID.
   * @param {string | number} id - The ID of the command to find.
   * @returns {Promise<Command | null>} The found command or null.
   */
  async findById(id: string | number): Promise<Command | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE command_id = ?`;
    const row = await this.db.get(sql, [id]);
    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Finds all commands that match the specified filter criteria.
   * Results are ordered by the next attempt time, ensuring that due commands are processed first.
   * @param {CommandFilter} [filter] - The filter to apply to the query.
   * @returns {Promise<Command[]>} An array of commands matching the filter.
   */
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

  /**
   * Creates a new command in the database.
   * @param {Omit<Command, 'created_at'>} command - The command data to insert. Note that `created_at` is auto-managed.
   * @returns {Promise<Command>} The fully created command object.
   * @throws {Error} If the command fails to be created and retrieved.
   */
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

  /**
   * Updates an existing command. This method does not use optimistic locking from the base class
   * as command queue updates are typically idempotent state transitions.
   * @param {string | number} id - The ID of the command to update.
   * @param {Partial<Command>} updates - The fields to update.
   * @param {number} [expectedVersion=1] - This parameter is ignored in this implementation.
   * @returns {Promise<Command>} The updated command.
   * @throws {Error} If no fields are provided for update or if the command is not found.
   */
  async update(id: string | number, updates: Partial<Command>, expectedVersion: number = 1): Promise<Command> {
    const setClause: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'command_id' || key === 'created_at') {
        continue;
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

  /**
   * Deletes a command from the database.
   * @param {string | number} id - The ID of the command to delete.
   * @returns {Promise<boolean>} True if the deletion was successful, false otherwise.
   */
  async delete(id: string | number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE command_id = ?`;
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Retrieves all commands that are due for processing for a specific kiosk.
   * This includes commands with 'pending' or 'failed' status whose `next_attempt_at` is in the past.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} [limit] - The maximum number of commands to retrieve.
   * @returns {Promise<Command[]>} An array of pending commands.
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
   * Marks a command's status as 'executing'.
   * @param {string} commandId - The ID of the command to update.
   * @returns {Promise<Command>} The updated command.
   */
  async markExecuting(commandId: string): Promise<Command> {
    return this.update(commandId, {
      status: 'executing',
      executed_at: new Date()
    });
  }

  /**
   * Marks a command's status as 'completed'.
   * @param {string} commandId - The ID of the command to update.
   * @returns {Promise<Command>} The updated command.
   */
  async markCompleted(commandId: string): Promise<Command> {
    return this.update(commandId, {
      status: 'completed',
      completed_at: new Date()
    });
  }

  /**
   * Marks a command as failed, records the error, and schedules it for a future retry
   * using an exponential backoff strategy. If the max retry count is reached,
   * the status is set to 'failed'.
   * @param {string} commandId - The ID of the command.
   * @param {string} error - The error message to record.
   * @param {number} [retryDelayMs=5000] - The base delay for the retry, in milliseconds.
   * @returns {Promise<Command>} The updated command.
   */
  async markFailed(commandId: string, error: string, retryDelayMs: number = 5000): Promise<Command> {
    const command = await this.findById(commandId);
    if (!command) {
      throw new Error(`Command ${commandId} not found`);
    }

    const newRetryCount = command.retry_count + 1;
    const nextAttempt = new Date(Date.now() + retryDelayMs * Math.pow(2, newRetryCount - 1));

    return this.update(commandId, {
      status: newRetryCount >= command.max_retries ? 'failed' : 'pending',
      retry_count: newRetryCount,
      last_error: error,
      next_attempt_at: nextAttempt
    });
  }

  /**
   * Marks a command's status as 'cancelled'.
   * @param {string} commandId - The ID of the command to cancel.
   * @returns {Promise<Command>} The updated command.
   */
  async cancelCommand(commandId: string): Promise<Command> {
    return this.update(commandId, {
      status: 'cancelled',
      completed_at: new Date()
    });
  }

  /**
   * Deletes old, finalized (completed, failed, cancelled) commands from the database
   * to prevent the table from growing indefinitely.
   * @param {number} [retentionDays=7] - The number of days to keep finalized commands.
   * @returns {Promise<number>} The number of rows deleted.
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
   * Retrieves statistics about the commands in the queue, such as total counts
   * broken down by status and command type.
   * @param {string} [kioskId] - If provided, statistics will be limited to this kiosk.
   * @returns {Promise<object>} An object containing command statistics.
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
   * Cancels all 'pending' or 'executing' commands for a specific kiosk.
   * This is useful for cleaning up the queue on system startup to prevent stale commands from running.
   * @param {string} kioskId - The ID of the kiosk whose commands should be cleared.
   * @returns {Promise<number>} The number of commands that were cancelled.
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

  /**
   * Maps a raw database row to a structured `Command` entity.
   * @protected
   * @param {any} row - The raw data object from the database.
   * @returns {Command} The mapped command entity.
   */
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

  /**
   * Maps a `Command` entity to a raw object suitable for database insertion or updates.
   * @protected
   * @param {Partial<Command>} entity - The command entity to map.
   * @returns {Record<string, any>} The mapped raw database object.
   */
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
