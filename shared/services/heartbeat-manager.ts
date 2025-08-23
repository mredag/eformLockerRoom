import { KioskHeartbeatRepository } from '../database/kiosk-heartbeat-repository';
import { CommandQueueManager } from './command-queue-manager';
import { EventLogger } from './event-logger';
import { DatabaseConnection } from '../database/connection';
import { KioskHeartbeat, KioskStatus, EventType } from '../types/core-entities';

export interface HeartbeatConfig {
  heartbeatIntervalMs: number; // Default: 10000 (10 seconds)
  offlineThresholdMs: number;  // Default: 30000 (30 seconds)
  pollIntervalMs: number;      // Default: 2000 (2 seconds)
  cleanupIntervalMs: number;   // Default: 60000 (1 minute)
}

export class HeartbeatManager {
  private heartbeatRepo: KioskHeartbeatRepository;
  private commandQueue: CommandQueueManager;
  private eventLogger?: EventLogger;
  private config: HeartbeatConfig;
  private cleanupTimer?: NodeJS.Timeout;
  private isRunning = false;

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
   * Start the heartbeat monitoring system
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log('Starting heartbeat manager...');

    // Start periodic cleanup of offline kiosks
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.markOfflineKiosks();
      } catch (error) {
        console.error('Error during offline kiosk cleanup:', error);
      }
    }, this.config.cleanupIntervalMs);

    console.log(`Heartbeat manager started with ${this.config.offlineThresholdMs}ms offline threshold`);
  }

  /**
   * Stop the heartbeat monitoring system
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
   * Register a new kiosk
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

      // Log registration event
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
   * Update heartbeat for a kiosk
   */
  async updateHeartbeat(
    kioskId: string,
    version?: string,
    configHash?: string
  ): Promise<KioskHeartbeat> {
    try {
      const kiosk = await this.heartbeatRepo.updateHeartbeat(kioskId, version, configHash);
      
      // If kiosk was offline and is now online, log the event
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
   * Get all kiosks with their status
   */
  async getAllKiosks(): Promise<KioskHeartbeat[]> {
    return this.heartbeatRepo.findAll();
  }

  /**
   * Get kiosks by zone
   */
  async getKiosksByZone(zone: string): Promise<KioskHeartbeat[]> {
    return this.heartbeatRepo.getByZone(zone);
  }

  /**
   * Get all zones
   */
  async getAllZones(): Promise<string[]> {
    return this.heartbeatRepo.getAllZones();
  }

  /**
   * Get kiosk statistics
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
   * Get pending commands for a kiosk (used by kiosk polling)
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
   * Mark command as completed (called by kiosk after executing command)
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
   * Mark command as failed (called by kiosk if command execution fails)
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
   * Update kiosk status manually
   */
  async updateKioskStatus(kioskId: string, status: KioskStatus): Promise<KioskHeartbeat> {
    try {
      const kiosk = await this.heartbeatRepo.updateStatus(kioskId, status);
      
      // Log status change event
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
   * Clear pending commands for a kiosk (used on restart)
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
   * Get kiosk health information
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
   * Private method to mark offline kiosks
   */
  private async markOfflineKiosks(): Promise<void> {
    try {
      const markedOffline = await this.heartbeatRepo.markOfflineKiosks();
      
      if (markedOffline > 0) {
        // Get the newly offline kiosks to log events
        const offlineKiosks = await this.heartbeatRepo.getOfflineKiosks();
        
        for (const kiosk of offlineKiosks) {
          const timeSinceLastSeen = Date.now() - kiosk.last_seen.getTime();
          
          // Only log if recently went offline (within the last cleanup interval)
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
   * Private method to check if kiosk was previously offline
   */
  private async wasKioskOffline(kioskId: string): Promise<boolean> {
    try {
      // This is a simple check - in a more sophisticated system,
      // we might track status changes in a separate table
      const kiosk = await this.heartbeatRepo.findById(kioskId);
      return kiosk?.status === 'offline';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get configuration for kiosk polling
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
   * Cleanup old command queue entries
   */
  async cleanupOldCommands(retentionDays: number = 7): Promise<number> {
    try {
      return await this.commandQueue.cleanupOldCommands(retentionDays);
    } catch (error) {
      console.error('Error cleaning up old commands:', error);
      return 0;
    }
  }
}
