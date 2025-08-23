import { DatabaseManager } from '../../../shared/database/database-manager';
import { CommandQueueManager } from '../../../shared/services/command-queue-manager';
import { EventLogger } from '../../../shared/services/event-logger';

export interface BulkOperationResult {
  success: boolean;
  totalLockers: number;
  commandsQueued: number;
  offlineKiosks?: string[];
  warnings?: string[];
  error?: string;
  zone?: string;
}

export interface CommandResult {
  success: boolean;
  warning?: string;
  error?: string;
}

export interface OfflineKiosk {
  kiosk_id: string;
  last_seen: Date;
  status: string;
}

export class LockerCoordinationService {
  constructor(
    private dbManager: DatabaseManager,
    private commandQueue: CommandQueueManager,
    private eventLogger: EventLogger
  ) {}

  /**
   * Coordinate bulk opening across multiple kiosks
   */
  async coordinateBulkOpening(kioskIds: string[], staffUser: string): Promise<BulkOperationResult> {
    try {
      let totalLockers = 0;
      let commandsQueued = 0;
      const offlineKiosks: string[] = [];
      const warnings: string[] = [];

      // Process each kiosk
      for (const kioskId of kioskIds) {
        try {
          // Check if kiosk is online
          const heartbeat = await this.dbManager.getKioskHeartbeatRepository().findByKiosk(kioskId);
          if (heartbeat && heartbeat.status === 'offline') {
            offlineKiosks.push(kioskId);
            warnings.push(`Kiosk ${kioskId} is offline - commands will be queued`);
          }

          // Get owned lockers for this kiosk
          const lockers = await this.dbManager.getLockerRepository().findByKiosk(kioskId);
          const ownedLockers = lockers.filter(l => l.status === 'Owned');

          totalLockers += ownedLockers.length;

          // Queue open commands for each owned locker
          for (const locker of ownedLockers) {
            const command = {
              type: 'open_locker',
              payload: {
                locker_id: locker.id,
                reason: 'bulk_open',
                staff_user: staffUser
              }
            };

            const queued = await this.commandQueue.enqueueCommand(kioskId, command);
            if (queued) {
              commandsQueued++;
            }
          }
        } catch (error) {
          warnings.push(`Error processing kiosk ${kioskId}: ${error.message}`);
        }
      }

      // Add warning if some kiosks are offline
      if (offlineKiosks.length > 0) {
        warnings.push('Some kiosks are offline - commands will be executed when they come online');
      }

      // Log the bulk operation
      await this.eventLogger.logEvent('bulk_open', null, null, {
        staff_user: staffUser,
        kiosk_count: kioskIds.length,
        total_lockers: totalLockers,
        commands_queued: commandsQueued,
        offline_kiosks: offlineKiosks
      });

      return {
        success: true,
        totalLockers,
        commandsQueued,
        offlineKiosks: offlineKiosks.length > 0 ? offlineKiosks : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      return {
        success: false,
        totalLockers: 0,
        commandsQueued: 0,
        error: error.message
      };
    }
  }

  /**
   * Coordinate bulk opening by zone
   */
  async coordinateBulkOpeningByZone(zone: string, staffUser: string): Promise<BulkOperationResult> {
    try {
      // Get all kiosks in the zone (this would need zone mapping in real implementation)
      const kioskIds = await this.getKiosksByZone(zone);
      
      const result = await this.coordinateBulkOpening(kioskIds, staffUser);
      return {
        ...result,
        zone
      };
    } catch (error) {
      return {
        success: false,
        totalLockers: 0,
        commandsQueued: 0,
        error: error.message,
        zone
      };
    }
  }

  /**
   * Find locker owned by a specific card across all kiosks
   */
  async findLockerByCard(cardId: string): Promise<any> {
    try {
      const locker = await this.dbManager.getLockerRepository().findOwnedByCard(cardId);
      return locker;
    } catch (error) {
      throw new Error(`Failed to find locker for card ${cardId}: ${error.message}`);
    }
  }

  /**
   * Queue a command for a specific kiosk
   */
  async queueCommand(kioskId: string, command: any): Promise<CommandResult> {
    try {
      // Check kiosk status
      const heartbeat = await this.dbManager.getKioskHeartbeatRepository().findByKiosk(kioskId);
      const isOffline = heartbeat && heartbeat.status === 'offline';

      // Queue the command
      const success = await this.commandQueue.enqueueCommand(kioskId, command);
      
      if (!success) {
        return {
          success: false,
          error: 'Failed to queue command'
        };
      }

      return {
        success: true,
        warning: isOffline ? `Kiosk ${kioskId} is offline - command will be executed when it comes online` : undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get offline kiosks
   */
  async getOfflineKiosks(thresholdSeconds: number = 30): Promise<OfflineKiosk[]> {
    try {
      const offlineKiosks = await this.dbManager.getKioskHeartbeatRepository().findOfflineKiosks(thresholdSeconds);
      return offlineKiosks;
    } catch (error) {
      throw new Error(`Failed to get offline kiosks: ${error.message}`);
    }
  }

  /**
   * Update kiosk heartbeat
   */
  async updateKioskHeartbeat(kioskId: string, version: string, configHash: string): Promise<boolean> {
    try {
      const success = await this.dbManager.getKioskHeartbeatRepository().updateLastSeen(
        kioskId,
        new Date(),
        version,
        configHash
      );
      return success;
    } catch (error) {
      throw new Error(`Failed to update heartbeat for kiosk ${kioskId}: ${error.message}`);
    }
  }

  /**
   * Get system-wide locker statistics
   */
  async getSystemStats(): Promise<{
    totalKiosks: number;
    onlineKiosks: number;
    totalLockers: number;
    freeLockers: number;
    ownedLockers: number;
    blockedLockers: number;
    vipLockers: number;
  }> {
    try {
      // This would need to be implemented with proper database queries
      // For now, return mock data structure
      return {
        totalKiosks: 0,
        onlineKiosks: 0,
        totalLockers: 0,
        freeLockers: 0,
        ownedLockers: 0,
        blockedLockers: 0,
        vipLockers: 0
      };
    } catch (error) {
      throw new Error(`Failed to get system stats: ${error.message}`);
    }
  }

  /**
   * Coordinate emergency opening of all lockers
   */
  async emergencyOpenAll(staffUser: string, reason: string): Promise<BulkOperationResult> {
    try {
      // Get all kiosks
      const allKiosks = await this.getAllKioskIds();
      
      // Log emergency operation
      await this.eventLogger.logEvent('emergency_open_all', null, null, {
        staff_user: staffUser,
        reason,
        kiosk_count: allKiosks.length,
        timestamp: new Date().toISOString()
      });

      return await this.coordinateBulkOpening(allKiosks, staffUser);
    } catch (error) {
      return {
        success: false,
        totalLockers: 0,
        commandsQueued: 0,
        error: error.message
      };
    }
  }

  /**
   * Get kiosks by zone (placeholder implementation)
   */
  private async getKiosksByZone(zone: string): Promise<string[]> {
    // This would need proper zone mapping implementation
    // For now, return mock data based on zone name
    const zoneMapping: Record<string, string[]> = {
      'gym-floor-1': ['gym-kiosk-1', 'gym-kiosk-2'],
      'spa-room-1': ['spa-kiosk-1'],
      'pool-area': ['pool-kiosk-1', 'pool-kiosk-2', 'pool-kiosk-3']
    };

    return zoneMapping[zone] || [];
  }

  /**
   * Get all kiosk IDs (placeholder implementation)
   */
  private async getAllKioskIds(): Promise<string[]> {
    // This would need proper database query
    // For now, return mock data
    return ['kiosk1', 'kiosk2', 'kiosk3'];
  }
}
