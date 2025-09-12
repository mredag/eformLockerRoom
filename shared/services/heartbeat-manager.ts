import { KioskHeartbeatRepository } from '../database/kiosk-heartbeat-repository';
import { CommandQueueManager } from './command-queue-manager';
import { EventLogger } from './event-logger';
import { DatabaseConnection } from '../database/connection';
import { KioskHeartbeat, KioskStatus, EventType } from '../types/core-entities';

/**
 * Defines the configuration options for the HeartbeatManager.
 */
export interface HeartbeatConfig {
  /** The interval at which kiosks should send heartbeats. */
  heartbeatIntervalMs: number;
  /** The duration after which a kiosk is considered offline if no heartbeat is received. */
  offlineThresholdMs: number;
  /** The interval at which kiosks should poll for new commands. */
  pollIntervalMs: number;
  /** The interval for running cleanup tasks, such as marking kiosks offline. */
  cleanupIntervalMs: number;
}

/**
 * Manages the kiosk heartbeat system, which is crucial for monitoring the online
 * status of all kiosks. It handles kiosk registration, processes incoming heartbeats,
 * and runs periodic checks to mark stale kiosks as offline.
 */
export class HeartbeatManager {
  private heartbeatRepo: KioskHeartbeatRepository;
  private commandQueue: CommandQueueManager;
  private eventLogger?: EventLogger;
  private config: HeartbeatConfig;
  private cleanupTimer?: NodeJS.Timeout;
  private isRunning = false;

  /**
   * Creates an instance of HeartbeatManager.
   * @param {Partial<HeartbeatConfig>} [config={}] - Optional configuration overrides.
   * @param {EventLogger} [eventLogger] - An optional logger for recording events.
   * @param {DatabaseConnection} [db] - An optional database connection.
   */
  constructor(config: Partial<HeartbeatConfig> = {}, eventLogger?: EventLogger, db?: DatabaseConnection) {
    const dbConnection = db || DatabaseConnection.getInstance();
    this.heartbeatRepo = new KioskHeartbeatRepository(dbConnection);
    this.commandQueue = new CommandQueueManager(dbConnection);
    this.eventLogger = eventLogger;
    
    this.config = {
      heartbeatIntervalMs: 10000,
      offlineThresholdMs: 30000,
      pollIntervalMs: 2000,
      cleanupIntervalMs: 60000,
      ...config
    };
  }

  /**
   * Starts the heartbeat monitoring system. This includes recovering any stale commands
   * and setting up a periodic timer to mark offline kiosks.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log('Starting heartbeat manager...');

    await this.recoverStaleCommands();

    this.cleanupTimer = setInterval(async () => {
      try {
        await this.markOfflineKiosks();
        await this.recoverStaleCommands();
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    }, this.config.cleanupIntervalMs);

    console.log(`Heartbeat manager started with ${this.config.offlineThresholdMs}ms offline threshold`);
  }

  /**
   * Stops the heartbeat monitoring system and clears any running timers.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    console.log('Heartbeat manager stopped');
  }

  /**
   * Registers a new kiosk with the system.
   * @param {string} kioskId - The unique ID of the kiosk.
   * @param {string} zone - The zone the kiosk belongs to.
   * @param {string} version - The software version of the kiosk.
   * @param {string} [hardwareId] - An optional unique hardware identifier.
   * @param {string} [registrationSecret] - An optional secret for registration.
   * @returns {Promise<KioskHeartbeat>} The created kiosk heartbeat record.
   */
  async registerKiosk(
    kioskId: string,
    zone: string,
    version: string,
    hardwareId?: string,
    registrationSecret?: string
  ): Promise<KioskHeartbeat> {
    try {
      const kiosk = await this.heartbeatRepo.registerKiosk(
        kioskId,
        zone,
        version,
        hardwareId,
        registrationSecret
      );

      if (this.eventLogger) {
        await this.eventLogger.logEvent(
          kioskId,
          EventType.KIOSK_ONLINE,
          {
            zone,
            version,
            hardware_id: hardwareId,
            registration_type: 'new'
          }
        );
      }

      console.log(`Kiosk ${kioskId} registered in zone ${zone}`);
      return kiosk;
    } catch (error) {
      console.error(`Failed to register kiosk ${kioskId}:`, error);
      throw error;
    }
  }

  /**
   * Processes a heartbeat from a kiosk, updating its last seen time and online status.
   * @param {string} kioskId - The ID of the kiosk sending the heartbeat.
   * @param {string} [version] - The current software version of the kiosk.
   * @param {string} [configHash] - The hash of the kiosk's current configuration.
   * @returns {Promise<KioskHeartbeat>} The updated kiosk heartbeat record.
   */
  async updateHeartbeat(
    kioskId: string,
    version?: string,
    configHash?: string
  ): Promise<KioskHeartbeat> {
    try {
      const kiosk = await this.heartbeatRepo.updateHeartbeat(kioskId, version, configHash);
      
      if (kiosk.status === 'online') {
        const wasOffline = await this.wasKioskOffline(kioskId);
        if (wasOffline) {
          if (this.eventLogger) {
            await this.eventLogger.logEvent(
              kioskId,
              EventType.KIOSK_ONLINE,
              {
                previous_status: 'offline',
                version,
                config_hash: configHash
              }
            );
          }
          console.log(`Kiosk ${kioskId} came back online`);
        }
      }

      return kiosk;
    } catch (error) {
      console.error(`Failed to update heartbeat for kiosk ${kioskId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieves all registered kiosks and their current status.
   * @returns {Promise<KioskHeartbeat[]>} An array of all kiosk heartbeat records.
   */
  async getAllKiosks(): Promise<KioskHeartbeat[]> {
    return this.heartbeatRepo.findAll();
  }

  /**
   * Retrieves all kiosks within a specific zone.
   * @param {string} zone - The zone to filter by.
   * @returns {Promise<KioskHeartbeat[]>} An array of kiosk heartbeat records.
   */
  async getKiosksByZone(zone: string): Promise<KioskHeartbeat[]> {
    return this.heartbeatRepo.getByZone(zone);
  }

  /**
   * Retrieves a list of all unique zone names.
   * @returns {Promise<string[]>} An array of zone names.
   */
  async getAllZones(): Promise<string[]> {
    return this.heartbeatRepo.getAllZones();
  }

  /**
   * Retrieves statistics about the kiosk fleet, such as online/offline counts.
   * @returns {Promise<object>} An object containing kiosk statistics.
   */
  async getStatistics(): Promise<{
    total: number;
    online: number;
    offline: number;
    maintenance: number;
    error: number;
    by_zone: Record<string, { total: number; online: number; offline: number }>;
    by_version: Record<string, number>;
  }> {
    return this.heartbeatRepo.getStatistics();
  }

  /**
   * Retrieves pending commands for a kiosk. This is typically called by the kiosk during polling.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} [limit=10] - The maximum number of commands to retrieve.
   * @returns {Promise<any[]>} An array of pending commands.
   */
  async getPendingCommands(kioskId: string, limit: number = 10): Promise<any[]> {
    try {
      return await this.commandQueue.getPendingCommands(kioskId, limit);
    } catch (error) {
      console.error(`Failed to get pending commands for kiosk ${kioskId}:`, error);
      return [];
    }
  }

  /**
   * Marks a command as completed. This is called by the kiosk after successfully executing a command.
   * @param {string} commandId - The ID of the completed command.
   * @returns {Promise<boolean>} True if the command was successfully marked.
   */
  async markCommandCompleted(commandId: string): Promise<boolean> {
    try {
      return await this.commandQueue.markCommandCompleted(commandId);
    } catch (error) {
      console.error(`Failed to mark command ${commandId} as completed:`, error);
      return false;
    }
  }

  /**
   * Marks a command as failed. This is called by the kiosk if command execution fails.
   * @param {string} commandId - The ID of the failed command.
   * @param {string} error - A description of the error.
   * @returns {Promise<boolean>} True if the command was successfully marked.
   */
  async markCommandFailed(commandId: string, error: string): Promise<boolean> {
    try {
      return await this.commandQueue.markCommandFailed(commandId, error);
    } catch (error) {
      console.error(`Failed to mark command ${commandId} as failed:`, error);
      return false;
    }
  }

  /**
   * Manually updates the status of a kiosk (e.g., to 'maintenance').
   * @param {string} kioskId - The ID of the kiosk.
   * @param {KioskStatus} status - The new status to set.
   * @returns {Promise<KioskHeartbeat>} The updated kiosk heartbeat record.
   */
  async updateKioskStatus(kioskId: string, status: KioskStatus): Promise<KioskHeartbeat> {
    try {
      const kiosk = await this.heartbeatRepo.updateStatus(kioskId, status);
      
      if (this.eventLogger) {
        await this.eventLogger.logEvent(
          kioskId,
          status === 'online' ? EventType.KIOSK_ONLINE : EventType.KIOSK_OFFLINE,
          {
            new_status: status,
            manual_update: true
          }
        );
      }

      console.log(`Kiosk ${kioskId} status updated to ${status}`);
      return kiosk;
    } catch (error) {
      console.error(`Failed to update status for kiosk ${kioskId}:`, error);
      throw error;
    }
  }

  /**
   * Clears all pending commands for a kiosk, typically used on kiosk restart.
   * @param {string} kioskId - The ID of the kiosk.
   * @returns {Promise<number>} The number of commands that were cleared.
   */
  async clearPendingCommands(kioskId: string): Promise<number> {
    try {
      const clearedCount = await this.commandQueue.clearPendingCommands(kioskId);
      
      if (clearedCount > 0 && this.eventLogger) {
        await this.eventLogger.logEvent(
          kioskId,
          EventType.SYSTEM_RESTARTED,
          {
            cleared_commands: clearedCount,
            reason: 'Kiosk restart detected'
          }
        );
        
        console.log(`Cleared ${clearedCount} pending commands for kiosk ${kioskId} due to restart`);
      }

      return clearedCount;
    } catch (error) {
      console.error(`Failed to clear pending commands for kiosk ${kioskId}:`, error);
      return 0;
    }
  }

  /**
   * Retrieves a combined health report for a specific kiosk, including its status and command queue stats.
   * @param {string} kioskId - The ID of the kiosk.
   * @returns {Promise<object>} A combined health report for the kiosk.
   */
  async getKioskHealth(kioskId: string): Promise<{
    kiosk: KioskHeartbeat | null;
    commands: {
      pending: number;
      executing: number;
      completed: number;
      failed: number;
    };
    lastSeen: Date | null;
    isOnline: boolean;
  }> {
    const kiosk = await this.heartbeatRepo.findById(kioskId);
    const commandStats = await this.commandQueue.getQueueStats(kioskId);

    return {
      kiosk,
      commands: {
        pending: commandStats.pending,
        executing: commandStats.executing,
        completed: commandStats.completed,
        failed: commandStats.failed
      },
      lastSeen: kiosk?.last_seen || null,
      isOnline: kiosk?.status === 'online' || false
    };
  }

  /**
   * Scans for and marks kiosks as 'offline' if they have not sent a heartbeat within the configured threshold.
   * @private
   */
  private async markOfflineKiosks(): Promise<void> {
    try {
      const markedOffline = await this.heartbeatRepo.markOfflineKiosks();
      
      if (markedOffline > 0) {
        const offlineKiosks = await this.heartbeatRepo.getOfflineKiosks();
        
        for (const kiosk of offlineKiosks) {
          const timeSinceLastSeen = Date.now() - kiosk.last_seen.getTime();
          
          if (timeSinceLastSeen < this.config.cleanupIntervalMs + this.config.offlineThresholdMs) {
            if (this.eventLogger) {
              await this.eventLogger.logEvent(
                kiosk.kiosk_id,
                EventType.KIOSK_OFFLINE,
                {
                  last_seen: kiosk.last_seen.toISOString(),
                  offline_duration_ms: timeSinceLastSeen,
                  zone: kiosk.zone
                }
              );
            }
            
            console.log(`Kiosk ${kiosk.kiosk_id} marked as offline (last seen: ${kiosk.last_seen})`);
          }
        }
      }
    } catch (error) {
      console.error('Error marking offline kiosks:', error);
    }
  }

  /**
   * Checks if a kiosk was previously marked as offline.
   * @private
   * @param {string} kioskId - The ID of the kiosk.
   * @returns {Promise<boolean>} True if the kiosk was offline.
   */
  private async wasKioskOffline(kioskId: string): Promise<boolean> {
    try {
      const kiosk = await this.heartbeatRepo.findById(kioskId);
      return kiosk?.status === 'offline';
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets the configuration settings relevant for kiosk polling.
   * @returns {{ heartbeatIntervalMs: number; pollIntervalMs: number }} The polling configuration.
   */
  getPollingConfig(): {
    heartbeatIntervalMs: number;
    pollIntervalMs: number;
  } {
    return {
      heartbeatIntervalMs: this.config.heartbeatIntervalMs,
      pollIntervalMs: this.config.pollIntervalMs
    };
  }

  /**
   * Deletes old, finalized command queue entries.
   * @param {number} [retentionDays=7] - The number of days to keep finalized commands.
   * @returns {Promise<number>} The number of commands cleaned up.
   */
  async cleanupOldCommands(retentionDays: number = 7): Promise<number> {
    try {
      return await this.commandQueue.cleanupOldCommands(retentionDays);
    } catch (error) {
      console.error('Error cleaning up old commands:', error);
      return 0;
    }
  }

  /**
   * Finds and recovers commands that have been in the 'executing' state for too long.
   * These stale commands are marked as failed to prevent them from getting stuck.
   * @private
   */
  private async recoverStaleCommands(): Promise<void> {
    try {
      const staleThresholdMs = 120 * 1000;
      const staleCommands = await this.commandQueue.findStaleExecutingCommands(staleThresholdMs);
      
      if (staleCommands.length > 0) {
        console.log(`Found ${staleCommands.length} stale executing commands, recovering...`);
        
        for (const command of staleCommands) {
          const staleDurationMs = Date.now() - command.executed_at!.getTime();
          
          await this.commandQueue.markCommandFailed(
            command.command_id,
            `Command timed out after ${Math.round(staleDurationMs / 1000)}s (stale command recovery)`
          );
          
          console.log(`Recovered stale command ${command.command_id} (${command.command_type}) after ${Math.round(staleDurationMs / 1000)}s`);
          
          if (this.eventLogger) {
            await this.eventLogger.logEvent(
              command.kiosk_id,
              EventType.COMMAND_FAILED,
              {
                command_id: command.command_id,
                command_type: command.command_type,
                recovery_reason: 'stale_command_timeout',
                stale_duration_ms: staleDurationMs
              }
            );
          }
        }
      }
    } catch (error) {
      console.error('Error recovering stale commands:', error);
    }
  }
}
