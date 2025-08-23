import { v4 as uuidv4 } from 'uuid';
import { DatabaseConnection } from '../database/connection';
import { Command, CommandType, CommandStatus, CommandPayload } from '../types/core-entities';

export class CommandQueueManager {
  private db: DatabaseConnection;

  constructor(db?: DatabaseConnection) {
    this.db = db || DatabaseConnection.getInstance();
  }

  /**
   * Enqueue a new command
   */
  async enqueueCommand(
    kioskId: string, 
    commandType: CommandType, 
    payload: CommandPayload,
    maxRetries: number = 3
  ): Promise<string> {
    const commandId = uuidv4();
    const now = new Date();

    await this.db.run(
      `INSERT INTO command_queue 
       (command_id, kiosk_id, command_type, payload, max_retries, created_at, next_attempt_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        commandId,
        kioskId,
        commandType,
        JSON.stringify(payload),
        maxRetries,
        now.toISOString(),
        now.toISOString()
      ]
    );

    console.log(`Enqueued command ${commandId} for kiosk ${kioskId}: ${commandType}`);
    return commandId;
  }

  /**
   * Get pending commands for a kiosk
   */
  async getPendingCommands(kioskId: string, limit: number = 10): Promise<Command[]> {
    const commands = await this.db.all<any>(
      `SELECT * FROM command_queue 
       WHERE kiosk_id = ? AND status = 'pending' AND next_attempt_at <= ?
       ORDER BY created_at ASC LIMIT ?`,
      [kioskId, new Date().toISOString(), limit]
    );

    return commands.map(this.mapRowToCommand);
  }

  /**
   * Get command by ID
   */
  async getCommand(commandId: string): Promise<Command | null> {
    const row = await this.db.get<any>(
      'SELECT * FROM command_queue WHERE command_id = ?',
      [commandId]
    );

    return row ? this.mapRowToCommand(row) : null;
  }

  /**
   * Mark command as executing
   */
  async markCommandExecuting(commandId: string): Promise<boolean> {
    const result = await this.db.run(
      `UPDATE command_queue 
       SET status = 'executing', executed_at = ? 
       WHERE command_id = ? AND status = 'pending'`,
      [new Date().toISOString(), commandId]
    );

    return result.changes > 0;
  }

  /**
   * Mark command as completed
   */
  async markCommandCompleted(commandId: string): Promise<boolean> {
    const result = await this.db.run(
      `UPDATE command_queue 
       SET status = 'completed', completed_at = ? 
       WHERE command_id = ?`,
      [new Date().toISOString(), commandId]
    );

    if (result.changes > 0) {
      console.log(`Command ${commandId} completed successfully`);
      return true;
    }

    return false;
  }

  /**
   * Mark command as failed and schedule retry if retries remaining
   */
  async markCommandFailed(commandId: string, error: string): Promise<boolean> {
    const command = await this.getCommand(commandId);
    if (!command) {
      return false;
    }

    const newRetryCount = command.retry_count + 1;
    
    if (newRetryCount >= command.max_retries) {
      // Max retries reached, mark as failed
      const result = await this.db.run(
        `UPDATE command_queue 
         SET status = 'failed', retry_count = ?, last_error = ?, completed_at = ?
         WHERE command_id = ?`,
        [newRetryCount, error, new Date().toISOString(), commandId]
      );

      console.log(`Command ${commandId} failed permanently after ${newRetryCount} attempts`);
      return result.changes > 0;
    } else {
      // Schedule retry with exponential backoff
      const backoffSeconds = Math.pow(2, newRetryCount) * 30; // 30s, 60s, 120s, etc.
      const nextAttempt = new Date(Date.now() + backoffSeconds * 1000);

      const result = await this.db.run(
        `UPDATE command_queue 
         SET status = 'pending', retry_count = ?, last_error = ?, next_attempt_at = ?
         WHERE command_id = ?`,
        [newRetryCount, error, nextAttempt.toISOString(), commandId]
      );

      console.log(`Command ${commandId} failed (attempt ${newRetryCount}), retrying in ${backoffSeconds}s`);
      return result.changes > 0;
    }
  }

  /**
   * Cancel a command
   */
  async cancelCommand(commandId: string): Promise<boolean> {
    const result = await this.db.run(
      `UPDATE command_queue 
       SET status = 'cancelled', completed_at = ? 
       WHERE command_id = ? AND status IN ('pending', 'executing')`,
      [new Date().toISOString(), commandId]
    );

    if (result.changes > 0) {
      console.log(`Command ${commandId} cancelled`);
      return true;
    }

    return false;
  }

  /**
   * Get command queue statistics for a kiosk
   */
  async getQueueStats(kioskId: string): Promise<{
    pending: number;
    executing: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const stats = await this.db.get<any>(
      `SELECT 
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN status = 'executing' THEN 1 ELSE 0 END) as executing,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
       FROM command_queue WHERE kiosk_id = ?`,
      [kioskId]
    );

    return {
      pending: stats.pending || 0,
      executing: stats.executing || 0,
      completed: stats.completed || 0,
      failed: stats.failed || 0,
      cancelled: stats.cancelled || 0
    };
  }

  /**
   * Clean up old completed/failed commands
   */
  async cleanupOldCommands(retentionDays: number = 7): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    
    const result = await this.db.run(
      `DELETE FROM command_queue 
       WHERE status IN ('completed', 'failed', 'cancelled') 
       AND completed_at < ?`,
      [cutoffDate.toISOString()]
    );

    if (result.changes > 0) {
      console.log(`Cleaned up ${result.changes} old commands`);
    }

    return result.changes;
  }

  /**
   * Clear all pending commands for a kiosk (used on restart)
   */
  async clearPendingCommands(kioskId: string): Promise<number> {
    const result = await this.db.run(
      `UPDATE command_queue 
       SET status = 'cancelled', completed_at = ?, last_error = 'Cleared on system restart'
       WHERE kiosk_id = ? AND status IN ('pending', 'executing')`,
      [new Date().toISOString(), kioskId]
    );

    if (result.changes > 0) {
      console.log(`Cleared ${result.changes} pending commands for kiosk ${kioskId}`);
    }

    return result.changes;
  }

  /**
   * Get command history for a kiosk
   */
  async getCommandHistory(kioskId: string, limit: number = 50): Promise<Command[]> {
    const commands = await this.db.all<any>(
      `SELECT * FROM command_queue 
       WHERE kiosk_id = ? 
       ORDER BY created_at DESC LIMIT ?`,
      [kioskId, limit]
    );

    return commands.map(this.mapRowToCommand);
  }

  /**
   * Bulk enqueue commands (for bulk operations)
   */
  async enqueueBulkCommands(
    kioskId: string,
    commandType: CommandType,
    payloads: CommandPayload[],
    maxRetries: number = 3
  ): Promise<string[]> {
    const commandIds: string[] = [];
    const now = new Date();

    for (const payload of payloads) {
      const commandId = uuidv4();
      commandIds.push(commandId);

      await this.db.run(
        `INSERT INTO command_queue 
         (command_id, kiosk_id, command_type, payload, max_retries, created_at, next_attempt_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          commandId,
          kioskId,
          commandType,
          JSON.stringify(payload),
          maxRetries,
          now.toISOString(),
          now.toISOString()
        ]
      );
    }

    console.log(`Enqueued ${commandIds.length} bulk commands for kiosk ${kioskId}: ${commandType}`);
    return commandIds;
  }

  /**
   * Map database row to Command object
   */
  private mapRowToCommand(row: any): Command {
    return {
      command_id: row.command_id,
      kiosk_id: row.kiosk_id,
      command_type: row.command_type,
      payload: JSON.parse(row.payload),
      status: row.status,
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
}
