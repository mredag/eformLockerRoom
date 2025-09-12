import { ConfigManager } from './config-manager';
import { LockerNamingService } from './locker-naming-service';
import { DatabaseConnection } from '../database/connection';
import { getLockersInZone } from './zone-helpers';

/**
 * Represents the detailed layout and hardware mapping for a single locker.
 */
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

/**
 * Represents the complete grid layout for a kiosk or zone, including all locker details.
 */
export interface LayoutGrid {
  rows: number;
  columns: number;
  totalLockers: number;
  lockers: LockerLayoutInfo[];
}

/**
 * A service responsible for generating locker layouts based on the system's hardware configuration.
 * It ensures that the UI accurately reflects the physical hardware setup and handles
 * auto-synchronization between the configured hardware and the locker records in the database.
 */
export class LockerLayoutService {
  private configManager: ConfigManager;
  private namingService: LockerNamingService;

  constructor() {
    this.configManager = ConfigManager.getInstance();
    this.namingService = new LockerNamingService(DatabaseConnection.getInstance());
  }

  /**
   * Generates the complete locker layout grid.
   * This method reads the hardware configuration, auto-syncs the database to ensure a record
   * exists for each physical locker, and then generates the layout details for each locker,
   * including its hardware mapping and display name. It can also filter the layout by a specific zone.
   * @param {string} [kioskId='kiosk-1'] - The identifier for the kiosk.
   * @param {string} [zoneId] - An optional zone ID to filter the lockers.
   * @returns {Promise<LayoutGrid>} The generated layout grid.
   */
  async generateLockerLayout(kioskId: string = 'kiosk-1', zoneId?: string): Promise<LayoutGrid> {
    await this.configManager.initialize();
    const config = this.configManager.getConfiguration();

    const enabledCards = config.hardware.relay_cards.filter(card => card.enabled);
    const totalChannels = enabledCards.reduce((sum, card) => sum + card.channels, 0);
    const configuredLockers = config.lockers.total_count;
    
    const targetLockerCount = Math.max(totalChannels, configuredLockers);
    
    if (totalChannels !== configuredLockers || targetLockerCount > configuredLockers) {
      console.log(`🔄 Layout service auto-sync: ensuring ${targetLockerCount} lockers exist`);
      
      try {
        const { LockerStateManager } = await import('./locker-state-manager');
        const { DatabaseConnection } = await import('../database/connection');
        
        const db = DatabaseConnection.getInstance();
        const stateManager = new LockerStateManager(db);
        await stateManager.syncLockersWithHardware(kioskId, targetLockerCount);
        
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
    
    let targetLockerIds: number[];
    
    if (config.features?.zones_enabled && zoneId) {
      targetLockerIds = getLockersInZone(zoneId, config);
      console.log(`🎯 Zone-aware layout: generating ${targetLockerIds.length} lockers for zone "${zoneId}"`);
    } else {
      const totalLockers = Math.min(config.lockers.total_count, targetLockerCount);
      targetLockerIds = Array.from({ length: totalLockers }, (_, i) => i + 1);
    }

    for (const lockerId of targetLockerIds) {
      const cardIndex = Math.floor((lockerId - 1) / 16);
      const relayId = ((lockerId - 1) % 16) + 1;
      
      if (cardIndex >= enabledCards.length) {
        console.warn(`⚠️  Locker ${lockerId} maps to card index ${cardIndex} but only ${enabledCards.length} cards available`);
        continue;
      }
      
      const card = enabledCards[cardIndex];

      let displayName: string;
      try {
        displayName = await this.namingService.getDisplayName(kioskId, lockerId);
      } catch (error) {
        displayName = `Dolap ${lockerId}`;
      }

      const lockerInfo: LockerLayoutInfo = {
        id: lockerId,
        cardId: card.slave_address,
        relayId: relayId,
        slaveAddress: card.slave_address,
        displayName: displayName,
        description: `Card ${card.slave_address}, Relay ${relayId}`,
        enabled: true,
        cardDescription: card.description
      };

      lockers.push(lockerInfo);
    }

    const actualTotalLockers = lockers.length;
    const layoutRows = config.lockers.layout.rows;
    const layoutColumns = config.lockers.layout.columns;
    
    return {
      rows: layoutRows,
      columns: layoutColumns,
      totalLockers: actualTotalLockers,
      lockers
    };
  }

  /**
   * Generates a CSS string for a grid layout based on the configuration.
   * @returns {Promise<string>} The generated CSS string.
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
   * Retrieves the hardware mapping information for a specific locker.
   * @param {number} lockerId - The ID of the locker.
   * @param {string} [kioskId='kiosk-1'] - The ID of the kiosk.
   * @param {string} [zoneId] - An optional zone ID.
   * @returns {Promise<LockerLayoutInfo | null>} The locker's layout info, or null if not found.
   */
  async getLockerMapping(lockerId: number, kioskId: string = 'kiosk-1', zoneId?: string): Promise<LockerLayoutInfo | null> {
    const layout = await this.generateLockerLayout(kioskId, zoneId);
    return layout.lockers.find(locker => locker.id === lockerId) || null;
  }

  /**
   * Validates whether a given locker ID exists within the configured layout.
   * @param {number} lockerId - The ID of the locker to validate.
   * @param {string} [kioskId='kiosk-1'] - The ID of the kiosk.
   * @param {string} [zoneId] - An optional zone ID.
   * @returns {Promise<boolean>} True if the locker ID is valid.
   */
  async isValidLockerId(lockerId: number, kioskId: string = 'kiosk-1', zoneId?: string): Promise<boolean> {
    const layout = await this.generateLockerLayout(kioskId, zoneId);
    return layout.lockers.some(locker => locker.id === lockerId);
  }

  /**
   * Retrieves statistics about the configured hardware.
   * @returns {Promise<object>} An object containing hardware statistics.
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
   * Generates HTML for the locker cards displayed in the admin panel.
   * @param {string} [kioskId='kiosk-1'] - The ID of the kiosk.
   * @param {string} [zoneId] - An optional zone ID.
   * @returns {Promise<string>} An HTML string of locker cards.
   */
  async generatePanelCards(kioskId: string = 'kiosk-1', zoneId?: string): Promise<string> {
    const layout = await this.generateLockerLayout(kioskId, zoneId);
    
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
   * Generates HTML for the locker tiles displayed on the kiosk interface.
   * @param {string} [kioskId='kiosk-1'] - The ID of the kiosk.
   * @param {string} [zoneId] - An optional zone ID.
   * @returns {Promise<string>} An HTML string of locker tiles.
   */
  async generateKioskTiles(kioskId: string = 'kiosk-1', zoneId?: string): Promise<string> {
    const layout = await this.generateLockerLayout(kioskId, zoneId);
    
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
   * Retrieves the relay card information for a specific locker.
   * @param {number} lockerId - The ID of the locker.
   * @returns {Promise<object | null>} An object with the card and relay info, or null if not found.
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

/**
 * A singleton instance of the LockerLayoutService for easy access throughout the application.
 */
export const lockerLayoutService = new LockerLayoutService();