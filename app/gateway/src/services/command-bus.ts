/**
 * Command Bus Service
 * 
 * Handles command validation, authorization, queuing, and execution tracking
 * for remote locker operations (open, close, reset, buzzer commands).
 * 
 * Requirements: 8.1, 8.4
 */

import { v4 as uuidv4 } from 'uuid';
import { CommandQueueManager } from '../../../../shared/services/command-queue-manager';
import { EventService } from './event-service';
import { WebSocketManager } from './websocket-manager';
import { DatabaseConnection } from '../../../../shared/database/connection';
import { CommandAppliedEvent } from '../types/events';

export type RemoteCommandType = 'open' | 'close' | 'reset' | 'buzzer';

export interface RemoteCommand {
  id: string;
  type: RemoteCommandType;
  kioskId: string;
  lockerId?: number;
  parameters?: Record<string, any>;
  issuedBy: string;
  issuedAt: Date;
  priority?: 'low' | 'normal' | 'high';
}

export interface CommandValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CommandAuthorizationResult {
  authorized: boolean;
  reason?: string;
}

export interface CommandExecutionResult {
  success: boolean;
  message?: string;
  error?: string;
  executionTimeMs?: number;
  responseData?: Record<string, any>;
}

export interface CommandBusOptions {
  commandQueue?: CommandQueueManager;
  eventService?: EventService;
  webSocketManager?: WebSocketManager;
  db?: DatabaseConnection;
}

export class CommandBus {
  private commandQueue: CommandQueueManager;
  private eventService: EventService;
  private webSocketManager: WebSocketManager;
  private db: DatabaseConnection;

  constructor(options: CommandBusOptions = {}) {
    this.db = options.db || DatabaseConnection.getInstance();
    this.commandQueue = options.commandQueue || new CommandQueueManager(this.db);
    this.eventService = options.eventService || new EventService();
    this.webSocketManager = options.webSocketManager || new WebSocketManager();
  }

  /**
   * Execute a remote command with full validation, authorization, and tracking
   */
  async executeCommand(command: RemoteCommand): Promise<{
    commandId: string;
    queued: boolean;
    result?: CommandExecutionResult;
  }> {
    // Generate unique command ID if not provided
    if (!command.id) {
      command.id = uuidv4();
    }

    // Ensure issuedAt is set
    if (!command.issuedAt) {
      command.issuedAt = new Date();
    }

    try {
      // Step 1: Validate command
      const validation = await this.validateCommand(command);
      if (!validation.valid) {
        const error = `Command validation failed: ${validation.errors.join(', ')}`;
        await this.logCommandExecution(command, {
          success: false,
          error,
          executionTimeMs: 0
        });
        throw new Error(error);
      }

      // Step 2: Authorize command
      const authorization = await this.authorizeCommand(command);
      if (!authorization.authorized) {
        const error = `Command authorization failed: ${authorization.reason}`;
        await this.logCommandExecution(command, {
          success: false,
          error,
          executionTimeMs: 0
        });
        throw new Error(error);
      }

      // Step 3: Queue command for execution
      const commandPayload = this.buildCommandPayload(command);
      const queuedCommandId = await this.commandQueue.enqueueCommand(
        command.kioskId,
        this.mapToQueueCommandType(command.type),
        commandPayload,
        3 // max retries
      );

      // Step 4: Log command queuing
      await this.logCommandQueued(command);

      // For immediate commands (open, buzzer), try to execute immediately
      if (command.type === 'open' || command.type === 'buzzer') {
        try {
          const result = await this.executeImmediateCommand(command);
          await this.commandQueue.markCommandCompleted(queuedCommandId);
          await this.logCommandExecution(command, result);
          
          return {
            commandId: command.id,
            queued: true,
            result
          };
        } catch (error) {
          await this.commandQueue.markCommandFailed(queuedCommandId, error.message);
          throw error;
        }
      }

      return {
        commandId: command.id,
        queued: true
      };

    } catch (error) {
      console.error(`Command execution failed for ${command.id}:`, error);
      throw error;
    }
  }

  /**
   * Validate command structure and parameters
   */
  private async validateCommand(command: RemoteCommand): Promise<CommandValidationResult> {
    const errors: string[] = [];

    // Basic structure validation
    if (!command.type) {
      errors.push('Command type is required');
    }

    if (!command.kioskId) {
      errors.push('Kiosk ID is required');
    }

    if (!command.issuedBy) {
      errors.push('Command issuer is required');
    }

    // Command-specific validation
    switch (command.type) {
      case 'open':
        if (!command.lockerId || command.lockerId < 1 || command.lockerId > 30) {
          errors.push('Valid locker ID (1-30) is required for open command');
        }
        break;

      case 'close':
        if (!command.lockerId || command.lockerId < 1 || command.lockerId > 30) {
          errors.push('Valid locker ID (1-30) is required for close command');
        }
        break;

      case 'reset':
        // Reset can be for specific locker or entire kiosk
        if (command.lockerId && (command.lockerId < 1 || command.lockerId > 30)) {
          errors.push('Valid locker ID (1-30) is required when specified for reset command');
        }
        break;

      case 'buzzer':
        // Buzzer is kiosk-wide, no locker ID needed
        break;

      default:
        errors.push(`Unsupported command type: ${command.type}`);
    }

    // Validate kiosk exists and is online
    const kioskExists = await this.validateKioskExists(command.kioskId);
    if (!kioskExists) {
      errors.push(`Kiosk ${command.kioskId} not found or offline`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Authorize command execution based on user permissions and system state
   */
  private async authorizeCommand(command: RemoteCommand): Promise<CommandAuthorizationResult> {
    try {
      // Check if user has permission to execute remote commands
      const hasPermission = await this.checkUserPermission(command.issuedBy, 'remote_control');
      if (!hasPermission) {
        return {
          authorized: false,
          reason: 'User does not have remote control permissions'
        };
      }

      // Check if kiosk is in a state that allows remote commands
      const kioskState = await this.getKioskState(command.kioskId);
      if (kioskState === 'maintenance' || kioskState === 'error') {
        return {
          authorized: false,
          reason: `Kiosk is in ${kioskState} state and cannot accept remote commands`
        };
      }

      // For locker-specific commands, check locker state
      if (command.lockerId) {
        const lockerState = await this.getLockerState(command.kioskId, command.lockerId);
        
        if (command.type === 'open' && lockerState === 'Opening') {
          return {
            authorized: false,
            reason: 'Locker is already opening'
          };
        }

        if (command.type === 'close' && lockerState === 'Free') {
          return {
            authorized: false,
            reason: 'Locker is already closed/free'
          };
        }
      }

      return { authorized: true };

    } catch (error) {
      console.error('Authorization check failed:', error);
      return {
        authorized: false,
        reason: 'Authorization check failed due to system error'
      };
    }
  }

  /**
   * Execute immediate commands (open, buzzer) that don't require queuing
   */
  private async executeImmediateCommand(command: RemoteCommand): Promise<CommandExecutionResult> {
    const startTime = Date.now();

    try {
      // Simulate command execution (in real implementation, this would call the kiosk API)
      const result = await this.sendCommandToKiosk(command);
      
      const executionTime = Date.now() - startTime;
      
      return {
        success: result.success,
        message: result.message,
        executionTimeMs: executionTime,
        responseData: result.data
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        error: error.message,
        executionTimeMs: executionTime
      };
    }
  }

  /**
   * Send command to kiosk (placeholder for actual kiosk communication)
   */
  private async sendCommandToKiosk(command: RemoteCommand): Promise<{
    success: boolean;
    message?: string;
    data?: Record<string, any>;
  }> {
    // In a real implementation, this would make an HTTP request to the kiosk
    // For now, we'll simulate the response based on command type
    
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay

    switch (command.type) {
      case 'open':
        return {
          success: true,
          message: `Locker ${command.lockerId} opened successfully`,
          data: { lockerId: command.lockerId, action: 'opened' }
        };

      case 'close':
        return {
          success: true,
          message: `Locker ${command.lockerId} closed successfully`,
          data: { lockerId: command.lockerId, action: 'closed' }
        };

      case 'reset':
        const target = command.lockerId ? `locker ${command.lockerId}` : 'kiosk';
        return {
          success: true,
          message: `${target} reset successfully`,
          data: { target, action: 'reset' }
        };

      case 'buzzer':
        return {
          success: true,
          message: 'Buzzer activated successfully',
          data: { action: 'buzzer_activated' }
        };

      default:
        throw new Error(`Unsupported command type: ${command.type}`);
    }
  }

  /**
   * Log command execution result and broadcast event
   */
  private async logCommandExecution(command: RemoteCommand, result: CommandExecutionResult): Promise<void> {
    try {
      // Create command applied event
      const event: CommandAppliedEvent = {
        id: uuidv4(),
        type: 'command_applied',
        timestamp: new Date().toISOString(),
        namespace: '/ws/events',
        room: command.kioskId,
        version: '1.0.0',
        data: {
          command: {
            id: command.id,
            type: command.type,
            lockerId: command.lockerId?.toString(),
            kioskId: command.kioskId,
            parameters: command.parameters,
            issued_by: command.issuedBy,
            issued_at: command.issuedAt.toISOString()
          },
          result: {
            success: result.success,
            message: result.message,
            timestamp: new Date().toISOString(),
            error: result.error,
            execution_time_ms: result.executionTimeMs,
            response_data: result.responseData
          }
        }
      };

      // Broadcast event via WebSocket
      await this.webSocketManager.broadcast('/ws/events', 'command_applied', event);

      // Log to database for troubleshooting (Requirement 8.4)
      await this.db.run(
        `INSERT INTO command_log (
          command_id, kiosk_id, locker_id, command_type, issued_by, 
          success, message, error, execution_time_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          command.id,
          command.kioskId,
          command.lockerId || null,
          command.type,
          command.issuedBy,
          result.success ? 1 : 0,
          result.message || null,
          result.error || null,
          result.executionTimeMs || null,
          new Date().toISOString()
        ]
      );

      console.log(`Command ${command.id} logged: ${result.success ? 'SUCCESS' : 'FAILED'}`);

    } catch (error) {
      console.error('Failed to log command execution:', error);
    }
  }

  /**
   * Log command queuing
   */
  private async logCommandQueued(command: RemoteCommand): Promise<void> {
    try {
      await this.db.run(
        `INSERT INTO command_log (
          command_id, kiosk_id, locker_id, command_type, issued_by, 
          success, message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          command.id,
          command.kioskId,
          command.lockerId || null,
          command.type,
          command.issuedBy,
          null, // success is null for queued commands
          'Command queued for execution',
          new Date().toISOString()
        ]
      );

      console.log(`Command ${command.id} queued for kiosk ${command.kioskId}`);

    } catch (error) {
      console.error('Failed to log command queuing:', error);
    }
  }

  /**
   * Build command payload for queue manager
   */
  private buildCommandPayload(command: RemoteCommand): Record<string, any> {
    const basePayload = {
      command_id: command.id,
      issued_by: command.issuedBy,
      issued_at: command.issuedAt.toISOString(),
      parameters: command.parameters || {}
    };

    switch (command.type) {
      case 'open':
        return {
          ...basePayload,
          open_locker: {
            locker_id: command.lockerId,
            staff_user: command.issuedBy,
            reason: 'Remote control operation',
            force: false
          }
        };

      case 'close':
        return {
          ...basePayload,
          close_locker: {
            locker_id: command.lockerId,
            staff_user: command.issuedBy,
            reason: 'Remote control operation'
          }
        };

      case 'reset':
        return {
          ...basePayload,
          reset_locker: {
            locker_id: command.lockerId || null,
            staff_user: command.issuedBy,
            reason: 'Remote control reset'
          }
        };

      case 'buzzer':
        return {
          ...basePayload,
          buzzer: {
            staff_user: command.issuedBy,
            duration_ms: command.parameters?.duration || 1000
          }
        };

      default:
        return basePayload;
    }
  }

  /**
   * Map remote command type to queue command type
   */
  private mapToQueueCommandType(type: RemoteCommandType): string {
    switch (type) {
      case 'open':
        return 'open_locker';
      case 'close':
        return 'close_locker';
      case 'reset':
        return 'reset_locker';
      case 'buzzer':
        return 'buzzer';
      default:
        throw new Error(`Unsupported command type: ${type}`);
    }
  }

  /**
   * Helper methods for validation and authorization
   */
  private async validateKioskExists(kioskId: string): Promise<boolean> {
    try {
      const kiosk = await this.db.get(
        'SELECT kiosk_id FROM kiosk_heartbeat WHERE kiosk_id = ? AND status != ?',
        [kioskId, 'offline']
      );
      return !!kiosk;
    } catch (error) {
      console.error('Error validating kiosk existence:', error);
      return false;
    }
  }

  private async checkUserPermission(userId: string, permission: string): Promise<boolean> {
    try {
      // In a real implementation, this would check user permissions
      // For now, we'll assume all authenticated users have remote control permission
      const user = await this.db.get(
        'SELECT id FROM staff_users WHERE username = ? AND is_active = 1',
        [userId]
      );
      return !!user;
    } catch (error) {
      console.error('Error checking user permission:', error);
      return false;
    }
  }

  private async getKioskState(kioskId: string): Promise<string> {
    try {
      const kiosk = await this.db.get(
        'SELECT status FROM kiosk_heartbeat WHERE kiosk_id = ?',
        [kioskId]
      );
      return kiosk?.status || 'offline';
    } catch (error) {
      console.error('Error getting kiosk state:', error);
      return 'error';
    }
  }

  private async getLockerState(kioskId: string, lockerId: number): Promise<string> {
    try {
      const locker = await this.db.get(
        'SELECT status FROM lockers WHERE kiosk_id = ? AND id = ?',
        [kioskId, lockerId]
      );
      return locker?.status || 'Unknown';
    } catch (error) {
      console.error('Error getting locker state:', error);
      return 'Error';
    }
  }

  /**
   * Get command execution history for troubleshooting
   */
  async getCommandHistory(kioskId?: string, limit: number = 50): Promise<any[]> {
    try {
      const query = kioskId
        ? 'SELECT * FROM command_log WHERE kiosk_id = ? ORDER BY created_at DESC LIMIT ?'
        : 'SELECT * FROM command_log ORDER BY created_at DESC LIMIT ?';
      
      const params = kioskId ? [kioskId, limit] : [limit];
      
      return await this.db.all(query, params);
    } catch (error) {
      console.error('Error getting command history:', error);
      return [];
    }
  }

  /**
   * Get command statistics for monitoring
   */
  async getCommandStats(kioskId?: string): Promise<{
    total: number;
    successful: number;
    failed: number;
    queued: number;
    successRate: number;
  }> {
    try {
      const query = kioskId
        ? `SELECT 
             COUNT(*) as total,
             SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
             SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
             SUM(CASE WHEN success IS NULL THEN 1 ELSE 0 END) as queued
           FROM command_log WHERE kiosk_id = ?`
        : `SELECT 
             COUNT(*) as total,
             SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
             SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
             SUM(CASE WHEN success IS NULL THEN 1 ELSE 0 END) as queued
           FROM command_log`;

      const params = kioskId ? [kioskId] : [];
      const stats = await this.db.get(query, params);

      const total = stats?.total || 0;
      const successful = stats?.successful || 0;
      const failed = stats?.failed || 0;
      const queued = stats?.queued || 0;
      const successRate = total > 0 ? (successful / (successful + failed)) * 100 : 0;

      return {
        total,
        successful,
        failed,
        queued,
        successRate: Math.round(successRate * 100) / 100
      };
    } catch (error) {
      console.error('Error getting command stats:', error);
      return {
        total: 0,
        successful: 0,
        failed: 0,
        queued: 0,
        successRate: 0
      };
    }
  }
}