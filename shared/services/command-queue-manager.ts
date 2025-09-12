import { v4 as uuidv4 } from 'uuid';
import { DatabaseConnection } from '../database/connection';
import { Command, CommandType, CommandStatus, CommandPayload } from '../types/core-entities';

/**
 * Manages the lifecycle of asynchronous commands between the central server and kiosks.
 *
 * This class provides a robust system for queueing commands, handling their execution states,
 * and managing retries with exponential backoff.
 *
 * ### Command Lifecycle:
 * 1.  `pending`: A new command waiting for a kiosk to process it.
 * 2.  `executing`: A kiosk has picked up the command and is actively processing it.
 * 3.  `completed`: The command was successfully executed by the kiosk.
 * 4.  `failed`: The command failed after reaching its maximum retry count.
 * 5.  `cancelled`: The command was cancelled by an admin or an automated process.
 *
 * This manager is used by the admin panel to enqueue commands and by the kiosk service
 * to fetch and update the status of those commands, ensuring reliable remote operations.
 */
export class CommandQueueManager {
  private db: DatabaseConnection;

  /**
   * Creates an instance of CommandQueueManager.
   * @param {DatabaseConnection} [db] - An optional database connection instance. If not provided, a default singleton instance is used.
   */
  constructor(db?: DatabaseConnection) {
    this.db = db || DatabaseConnection.getInstance();
  }

  /**
   * Adds a new command to the queue for a specific kiosk.
   * @param {string} kioskId - The ID of the target kiosk.
   * @param {CommandType} commandType - The type of command to enqueue.
   * @param {CommandPayload} payload - The data required for the command.
   * @param {number} [maxRetries=3] - The maximum number of times to retry the command on failure.
   * @returns {Promise<string>} The unique ID of the enqueued command.
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
   * Retrieves all pending commands for a specific kiosk that are ready to be executed.
   * @param {string} kioskId - The ID of the kiosk fetching commands.
   * @param {number} [limit=10] - The maximum number of commands to retrieve.
   * @returns {Promise<Command[]>} An array of pending commands.
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
   * Retrieves a specific command by its ID.
   * @param {string} commandId - The ID of the command to retrieve.
   * @returns {Promise<Command | null>} The command object, or null if not found.
   */
  async getCommand(commandId: string): Promise<Command | null> {
    const row = await this.db.get<any>(
      'SELECT * FROM command_queue WHERE command_id = ?',
      [commandId]
    );

    return row ? this.mapRowToCommand(row) : null;
  }

  /**
   * Marks a command's status as 'executing'. This is an atomic operation
   * that ensures a command is only picked up once.
   * @param {string} commandId - The ID of the command.
   * @returns {Promise<boolean>} True if the command was successfully marked, false otherwise (e.g., if already executing).
   */
  async markCommandExecuting(commandId: string): Promise<boolean> {
    const now = new Date().toISOString();
    
    const result = await this.db.run(
      `UPDATE command_queue 
       SET status = 'executing', 
           executed_at = ? 
       WHERE command_id = ? AND status = 'pending'`,
      [now, commandId]
    );

    return result.changes > 0;
  }

  /**
   * Marks a command as 'completed' and records its execution duration.
   * This is an atomic operation.
   * @param {string} commandId - The ID of the completed command.
   * @returns {Promise<boolean>} True if the command was successfully updated.
   */
  async markCommandCompleted(commandId: string): Promise<boolean> {
    const now = new Date().toISOString();
    
    const result = await this.db.run(
      `UPDATE command_queue 
       SET status = 'completed', 
           completed_at = ?,
           duration_ms = CAST((julianday(?) - julianday(executed_at)) * 86400000 AS INTEGER)
       WHERE command_id = ?`,
      [now, now, commandId]
    );

    if (result.changes > 0) {
      console.log(`Command ${commandId} completed successfully`);
      return true;
    }

    return false;
  }

  /**
   * Marks a command as failed. If retry attempts are remaining, it schedules a retry
   * with exponential backoff. Otherwise, it marks the command as permanently 'failed'.
   * @param {string} commandId - The ID of the failed command.
   * @param {string} error - A description of the error.
   * @returns {Promise<boolean>} True if the command status was updated.
   */
  async markCommandFailed(commandId: string, error: string): Promise<boolean> {
    const command = await this.getCommand(commandId);
    if (!command) {
      return false;
    }

    const newRetryCount = command.retry_count + 1;
    
    if (newRetryCount >= command.max_retries) {
      const result = await this.db.run(
        `UPDATE command_queue 
         SET status = 'failed', retry_count = ?, last_error = ?, completed_at = ?
         WHERE command_id = ?`,
        [newRetryCount, error, new Date().toISOString(), commandId]
      );

      console.log(`Command ${commandId} failed permanently after ${newRetryCount} attempts`);
      return result.changes > 0;
    } else {
      const backoffSeconds = Math.pow(2, newRetryCount) * 30;
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
   * Cancels a pending or executing command.
   * @param {string} commandId - The ID of the command to cancel.
   * @returns {Promise<boolean>} True if the command was successfully cancelled.
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
   * Retrieves statistics about the command queue for a specific kiosk.
   * @param {string} kioskId - The ID of the kiosk.
   * @returns {Promise<object>} An object containing queue statistics.
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
   * Deletes old, finalized (completed, failed, cancelled) commands from the database.
   * @param {number} [retentionDays=7] - The number of days to keep finalized commands.
   * @returns {Promise<number>} The number of rows deleted.
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
   * Cancels all pending or executing commands for a specific kiosk.
   * This is useful for cleaning up the queue on system startup.
   * @param {string} kioskId - The ID of the kiosk whose commands should be cleared.
   * @returns {Promise<number>} The number of commands that were cancelled.
   */
  async clearPendingCommands(kioskId: string): Promise<number> {
    const result = await this.db.run(
      `UPDATE command_queue 
       SET status = 'cancelled', executed_at = ?, last_error = 'Cleared on system restart'
       WHERE kiosk_id = ? AND status IN ('pending', 'executing')`,
      [new Date().toISOString(), kioskId]
    );

    if (result.changes > 0) {
      console.log(`Cleared ${result.changes} pending commands for kiosk ${kioskId}`);
    }

    return result.changes;
  }

  /**
   * Retrieves the command history for a specific kiosk.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} [limit=50] - The maximum number of commands to return.
   * @returns {Promise<Command[]>} An array of recent commands.
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
   * Enqueues multiple commands of the same type for a single kiosk.
   * @param {string} kioskId - The ID of the target kiosk.
   * @param {CommandType} commandType - The type of command to enqueue.
   * @param {CommandPayload[]} payloads - An array of payloads, one for each command.
   * @param {number} [maxRetries=3] - The maximum number of retries for each command.
   * @returns {Promise<string[]>} An array of the enqueued command IDs.
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
   * Maps a raw database row to a structured `Command` object.
   * @private
   * @param {any} row - The raw data object from the database.
   * @returns {Command} The mapped command entity.
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

  /**
   * Finds commands that have been in the 'executing' state for longer than a given threshold.
   * This is useful for detecting and recovering from stuck commands.
   * @param {number} thresholdMs - The time in milliseconds to consider a command stale.
   * @returns {Promise<Command[]>} An array of stale commands.
   */
  async findStaleExecutingCommands(thresholdMs: number): Promise<Command[]> {
    const cutoffTime = new Date(Date.now() - thresholdMs);
    
    const commands = await this.db.all<any>(
      `SELECT * FROM command_queue 
       WHERE status = 'executing' 
       AND executed_at < ?
       ORDER BY executed_at ASC`,
      [cutoffTime.toISOString()]
    );

    return commands.map(row => this.mapRowToCommand(row));
  }
}
