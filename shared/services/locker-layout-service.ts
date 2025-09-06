import { ConfigManager } from './config-manager';
import { LockerNamingService } from './locker-naming-service';
import { DatabaseConnection } from '../database/connection';

export interface LockerLayoutInfo {
  id: number;
  cardId: number;
  relayId: number;
  slaveAddress: number;
  displayName: string;
  description: string;
  enabled: boolean;
  cardDescription: string;
}

export interface LayoutGrid {
  rows: number;
  columns: number;
  totalLockers: number;
  lockers: LockerLayoutInfo[];
}

/**
 * Service for generating locker layouts based on Modbus configuration
 * Ensures UI matches hardware configuration exactly
 */
export class LockerLayoutService {
  private configManager: ConfigManager;
  private namingService: LockerNamingService;

  constructor() {
    this.configManager = ConfigManager.getInstance();
    this.namingService = new LockerNamingService(DatabaseConnection.getInstance());
  }

  /**
   * Generate locker layout based on current Modbus configuration
   * Now includes actual display names from the database
   * Auto-syncs database with hardware configuration
   */
  async generateLockerLayout(kioskId: string = 'kiosk-1'): Promise<LayoutGrid> {
    await this.configManager.initialize();
    const config = this.configManager.getConfiguration();

    // Auto-sync: Calculate total channels and ensure database has matching lockers
    const enabledCards = config.hardware.relay_cards.filter(card => card.enabled);
    const totalChannels = enabledCards.reduce((sum, card) => sum + card.channels, 0);
    const configuredLockers = config.lockers.total_count;
    
    // Use the higher value for maximum compatibility
    const targetLockerCount = Math.max(totalChannels, configuredLockers);
    
    // Auto-sync database if needed
    if (totalChannels !== configuredLockers || targetLockerCount > configuredLockers) {
      console.log(`🔄 Layout service auto-sync: ensuring ${targetLockerCount} lockers exist`);
      
      try {
        // Import and use the locker state manager to sync
        const { LockerStateManager } = await import('./locker-state-manager');
        const { DatabaseConnection } = await import('../database/connection');
        
        const db = DatabaseConnection.getInstance();
        const stateManager = new LockerStateManager(db);
        await stateManager.syncLockersWithHardware(kioskId, targetLockerCount);
        
        // Update configuration if hardware has more channels
        if (totalChannels > configuredLockers) {
          await this.configManager.updateParameter(
            'lockers',
            'total_count',
            totalChannels,
            'layout-auto-sync',
            `Auto-sync with hardware: ${enabledCards.length} cards × 16 channels = ${totalChannels} total`
          );
        }
      } catch (error) {
        console.warn('⚠️  Layout auto-sync failed, continuing with existing data:', error);
      }
    }

    const lockers: LockerLayoutInfo[] = [];
    let lockerCounter = 1;

    // Generate lockers based on enabled relay cards
    for (const card of config.hardware.relay_cards) {
      if (!card.enabled) continue;

      for (let relayId = 1; relayId <= card.channels; relayId++) {
        if (lockerCounter > config.lockers.total_count) break;

        // Get the actual display name from the database
        let displayName: string;
        try {
          displayName = await this.namingService.getDisplayName(kioskId, lockerCounter);
        } catch (error) {
          // Fallback to default name if naming service fails
          displayName = `Dolap ${lockerCounter}`;
        }

        const lockerInfo: LockerLayoutInfo = {
          id: lockerCounter,
          cardId: card.slave_address,
          relayId: relayId,
          slaveAddress: card.slave_address,
          displayName: displayName,
          description: `Card ${card.slave_address}, Relay ${relayId}`,
          enabled: true,
          cardDescription: card.description
        };

        lockers.push(lockerInfo);
        lockerCounter++;
      }
    }

    return {
      rows: config.lockers.layout.rows,
      columns: config.lockers.layout.columns,
      totalLockers: config.lockers.total_count,
      lockers
    };
  }

  /**
   * Generate CSS grid layout based on configuration
   */
  async generateGridCSS(): Promise<string> {
    const layout = await this.generateLockerLayout();
    
    return `
      .locker-grid {
        display: grid;
        grid-template-columns: repeat(${layout.columns}, 1fr);
        grid-template-rows: repeat(${layout.rows}, 1fr);
        gap: 10px;
        width: 100%;
        height: 100%;
        padding: 20px;
        box-sizing: border-box;
      }
      
      .locker-tile {
        aspect-ratio: 1;
        min-height: 80px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s ease;
        border: 2px solid transparent;
      }
      
      @media (max-width: 768px) {
        .locker-grid {
          grid-template-columns: repeat(${Math.min(layout.columns, 4)}, 1fr);
          gap: 8px;
          padding: 10px;
        }
        
        .locker-tile {
          min-height: 60px;
          font-size: 0.9em;
        }
      }
    `;
  }

  /**
   * Get locker mapping information for hardware control
   */
  async getLockerMapping(lockerId: number, kioskId: string = 'kiosk-1'): Promise<LockerLayoutInfo | null> {
    const layout = await this.generateLockerLayout(kioskId);
    return layout.lockers.find(locker => locker.id === lockerId) || null;
  }

  /**
   * Validate that locker ID is within configured range
   */
  async isValidLockerId(lockerId: number, kioskId: string = 'kiosk-1'): Promise<boolean> {
    const layout = await this.generateLockerLayout(kioskId);
    return lockerId >= 1 && lockerId <= layout.totalLockers;
  }

  /**
   * Get hardware statistics based on configuration
   */
  async getHardwareStats(): Promise<{
    totalCards: number;
    enabledCards: number;
    totalChannels: number;
    configuredLockers: number;
    utilizationPercent: number;
  }> {
    await this.configManager.initialize();
    const config = this.configManager.getConfiguration();

    const totalCards = config.hardware.relay_cards.length;
    const enabledCards = config.hardware.relay_cards.filter(card => card.enabled).length;
    const totalChannels = config.hardware.relay_cards
      .filter(card => card.enabled)
      .reduce((sum, card) => sum + card.channels, 0);
    const configuredLockers = config.lockers.total_count;
    const utilizationPercent = totalChannels > 0 ? Math.round((configuredLockers / totalChannels) * 100) : 0;

    return {
      totalCards,
      enabledCards,
      totalChannels,
      configuredLockers,
      utilizationPercent
    };
  }

  /**
   * Generate locker cards for admin panel
   */
  async generatePanelCards(kioskId: string = 'kiosk-1'): Promise<string> {
    const layout = await this.generateLockerLayout(kioskId);
    
    let html = '';
    for (const locker of layout.lockers) {
      html += `
        <div class="locker-card" data-locker-id="${locker.id}" data-card-id="${locker.cardId}" data-relay-id="${locker.relayId}">
          <div class="locker-header">
            <span class="locker-number">${locker.displayName}</span>
            <span class="locker-status" data-status="Free">BOŞ</span>
          </div>
          <div class="locker-info">
            <small>Card ${locker.cardId} • Relay ${locker.relayId}</small>
            <small>${locker.cardDescription}</small>
          </div>
          <div class="locker-actions">
            <button class="btn btn-sm btn-primary open-locker-btn" data-locker-id="${locker.id}">
              <i class="fas fa-unlock"></i> Aç
            </button>
            <button class="btn btn-sm btn-secondary test-locker-btn" data-locker-id="${locker.id}">
              <i class="fas fa-vial"></i> Test
            </button>
          </div>
        </div>
      `;
    }
    
    return html;
  }

  /**
   * Generate locker tiles for kiosk interface
   */
  async generateKioskTiles(kioskId: string = 'kiosk-1'): Promise<string> {
    const layout = await this.generateLockerLayout(kioskId);
    
    let html = '';
    for (const locker of layout.lockers) {
      html += `
        <div class="locker-tile available" 
             data-locker-id="${locker.id}" 
             data-card-id="${locker.cardId}" 
             data-relay-id="${locker.relayId}"
             role="button" 
             tabindex="0"
             aria-label="Dolap ${locker.id}, Boş">
          <div class="locker-number">${locker.displayName}</div>
          <div class="locker-status">BOŞ</div>
        </div>
      `;
    }
    
    return html;
  }

  /**
   * Get relay card information for a specific locker
   */
  async getRelayCardInfo(lockerId: number): Promise<{
    cardId: number;
    relayId: number;
    slaveAddress: number;
    cardDescription: string;
  } | null> {
    const mapping = await this.getLockerMapping(lockerId);
    if (!mapping) return null;

    return {
      cardId: mapping.cardId,
      relayId: mapping.relayId,
      slaveAddress: mapping.slaveAddress,
      cardDescription: mapping.cardDescription
    };
  }
}

// Export singleton instance
export const lockerLayoutService = new LockerLayoutService();