/**
 * RFID User Flow Service
 * Handles the complete RFID user journey including card scanning, locker assignment, and release
 * Implements requirements 1.1, 1.2, 1.5 for RFID-based locker access
 */

import { EventEmitter } from 'events';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { LockerNamingService } from '../../../../shared/services/locker-naming-service';
import { ModbusController } from '../hardware/modbus-controller';
import { Locker, RfidScanEvent } from '../../../../src/types/core-entities';

export interface RfidUserFlowConfig {
  kiosk_id: string;
  max_available_lockers_display: number;
  opening_timeout_ms: number;
}

export interface UserFlowResult {
  success: boolean;
  action: 'show_lockers' | 'open_locker' | 'error';
  message: string;
  available_lockers?: Locker[];
  opened_locker?: number;
  error_code?: string;
}

export class RfidUserFlow extends EventEmitter {
  private config: RfidUserFlowConfig;
  private lockerStateManager: LockerStateManager;
  private modbusController: ModbusController;
  private lockerNamingService: LockerNamingService;

  constructor(
    config: RfidUserFlowConfig,
    lockerStateManager: LockerStateManager,
    modbusController: ModbusController,
    lockerNamingService: LockerNamingService
  ) {
    super();
    this.config = config;
    this.lockerStateManager = lockerStateManager;
    this.modbusController = modbusController;
    this.lockerNamingService = lockerNamingService;
  }

  /**
   * Get the display name for a locker
   */
  private async getLockerDisplayName(lockerId: number): Promise<string> {
    try {
      return await this.lockerNamingService.getDisplayName(this.config.kiosk_id, lockerId);
    } catch (error) {
      console.warn(`Failed to get display name for locker ${lockerId}, using default:`, error);
      return `Dolap ${lockerId}`;
    }
  }

  /**
   * Handle RFID card scan event - main entry point for user flow
   * Implements the core RFID logic from requirements 1.1, 1.2
   */
  async handleCardScanned(scanEvent: RfidScanEvent): Promise<UserFlowResult> {
    try {
      const cardId = scanEvent.card_id;
      
      // Check if card already has an assigned locker (one card, one locker rule)
      let existingLocker: Locker | null;
      try {
        existingLocker = await this.checkExistingOwnership(cardId);
      } catch (error) {
        console.error('Error checking existing ownership:', error);
        return {
          success: false,
          action: 'error',
          message: 'Sistem hatası. Personeli çağırın.',
          error_code: 'SYSTEM_ERROR'
        };
      }
      
      if (existingLocker) {
        // Card has existing locker - open and release it immediately
        return await this.handleCardWithLocker(cardId, existingLocker);
      } else {
        // Card has no locker - show available lockers for selection
        return await this.handleCardWithNoLocker(cardId);
      }
    } catch (error) {
      console.error('Error handling card scan:', error);
      return {
        success: false,
        action: 'error',
        message: 'Sistem hatası. Personeli çağırın.',
        error_code: 'SYSTEM_ERROR'
      };
    }
  }

  /**
   * Handle card with no existing locker assignment
   * Shows available Free lockers for user selection
   * Requirement 1.1: Display available lockers when card has no assignment
   */
  async handleCardWithNoLocker(cardId: string): Promise<UserFlowResult> {
    try {
      // Get available (Free) lockers, excluding Blocked, Reserved, and VIP
      const availableLockers = await this.lockerStateManager.getAvailableLockers(this.config.kiosk_id);
      
      if (availableLockers.length === 0) {
        return {
          success: false,
          action: 'error',
          message: 'Boş dolap yok. Lütfen bekleyin.',
          error_code: 'NO_AVAILABLE_LOCKERS'
        };
      }

      // Limit display to configured maximum
      const displayLockers = availableLockers.slice(0, this.config.max_available_lockers_display);
      
      this.emit('show_available_lockers', {
        card_id: cardId,
        lockers: displayLockers,
        total_available: availableLockers.length
      });

      return {
        success: true,
        action: 'show_lockers',
        message: 'Dolap seçiniz',
        available_lockers: displayLockers
      };
    } catch (error) {
      console.error('Error getting available lockers:', error);
      return {
        success: false,
        action: 'error',
        message: 'Dolap listesi alınamadı.',
        error_code: 'LOCKER_LIST_ERROR'
      };
    }
  }

  /**
   * Handle card with existing locker assignment
   * Opens the assigned locker and immediately releases ownership
   * Requirement 1.2: Direct open and release for cards with existing assignments
   */
  async handleCardWithLocker(cardId: string, locker: Locker): Promise<UserFlowResult> {
    try {
      const lockerId = locker.id;
      
      // Validate ownership
      const isValidOwner = await this.lockerStateManager.validateOwnership(
        this.config.kiosk_id,
        lockerId,
        cardId,
        'rfid'
      );

      if (!isValidOwner) {
        return {
          success: false,
          action: 'error',
          message: 'Dolap erişim hatası.',
          error_code: 'OWNERSHIP_VALIDATION_FAILED'
        };
      }

      // Get locker display name
      const lockerName = await this.getLockerDisplayName(lockerId);

      // Emit opening event for UI feedback
      this.emit('locker_opening', {
        card_id: cardId,
        locker_id: lockerId,
        message: `${lockerName} açılıyor`
      });

      // Attempt to open the locker
      const openResult = await this.modbusController.openLocker(lockerId);
      
      if (openResult) {
        // Check if this is a VIP locker
        if (locker.is_vip) {
          // For VIP lockers, emit success without releasing ownership
          this.emit('locker_opened_vip', {
            card_id: cardId,
            locker_id: lockerId,
            message: `VIP ${lockerName} açıldı`
          });

          return {
            success: true,
            action: 'open_locker',
            message: `VIP ${lockerName} açıldı`,
            opened_locker: lockerId
          };
        } else {
          // Opening successful - immediately release ownership for non-VIP
          const releaseResult = await this.lockerStateManager.releaseLocker(
            this.config.kiosk_id,
            lockerId,
            cardId
          );

          if (releaseResult) {
            this.emit('locker_opened_and_released', {
              card_id: cardId,
              locker_id: lockerId,
              message: `${lockerName} açıldı ve bırakıldı`
            });

            return {
              success: true,
              action: 'open_locker',
              message: `${lockerName} açıldı ve bırakıldı`,
              opened_locker: lockerId
            };
          } else {
            // Opening succeeded but release failed - log error but don't fail user
            console.error(`Failed to release locker ${lockerId} after successful opening`);
            
            return {
              success: true,
              action: 'open_locker',
              message: `${lockerName} açıldı`,
              opened_locker: lockerId
            };
          }
        }
      } else {
        // Opening failed - keep ownership intact
        return {
          success: false,
          action: 'error',
          message: 'Dolap açılamadı. Personeli çağırın.',
          error_code: 'OPENING_FAILED'
        };
      }
    } catch (error) {
      console.error('Error handling card with locker:', error);
      return {
        success: false,
        action: 'error',
        message: 'Dolap açma hatası.',
        error_code: 'OPEN_LOCKER_ERROR'
      };
    }
  }

  /**
   * Handle locker selection from available list
   * Assigns selected locker to card and initiates opening sequence
   */
  async handleLockerSelection(cardId: string, selectedLockerId: number): Promise<UserFlowResult> {
    try {
      // Assign locker to card (Free -> Reserved)
      const assignResult = await this.lockerStateManager.assignLocker(
        this.config.kiosk_id,
        selectedLockerId,
        'rfid',
        cardId
      );

      if (!assignResult) {
        return {
          success: false,
          action: 'error',
          message: 'Dolap atanamadı. Başka dolap seçin.',
          error_code: 'ASSIGNMENT_FAILED'
        };
      }

      // Get locker display name
      const lockerName = await this.getLockerDisplayName(selectedLockerId);

      // Emit assignment event
      this.emit('locker_assigned', {
        card_id: cardId,
        locker_id: selectedLockerId,
        message: `${lockerName} atandı`
      });

      // Emit opening event for UI feedback
      this.emit('locker_opening', {
        card_id: cardId,
        locker_id: selectedLockerId,
        message: `${lockerName} açılıyor`
      });

      // Attempt to open the locker
      const openResult = await this.modbusController.openLocker(selectedLockerId);

      if (openResult) {
        // Opening successful - confirm ownership (Reserved -> Owned)
        const confirmResult = await this.lockerStateManager.confirmOwnership(
          this.config.kiosk_id,
          selectedLockerId
        );

        if (confirmResult) {
          this.emit('locker_opened_and_owned', {
            card_id: cardId,
            locker_id: selectedLockerId,
            message: `${lockerName} açıldı ve sahiplenildi`
          });

          return {
            success: true,
            action: 'open_locker',
            message: `${lockerName} açıldı`,
            opened_locker: selectedLockerId
          };
        } else {
          // Opening succeeded but confirmation failed
          console.error(`Failed to confirm ownership for locker ${selectedLockerId}`);
          
          return {
            success: true,
            action: 'open_locker',
            message: `${lockerName} açıldı`,
            opened_locker: selectedLockerId
          };
        }
      } else {
        // Opening failed - release the reservation
        await this.lockerStateManager.releaseLocker(
          this.config.kiosk_id,
          selectedLockerId,
          cardId
        );

        return {
          success: false,
          action: 'error',
          message: 'Dolap açılamadı. Başka dolap deneyin.',
          error_code: 'OPENING_FAILED'
        };
      }
    } catch (error) {
      console.error('Error handling locker selection:', error);
      return {
        success: false,
        action: 'error',
        message: 'Dolap seçim hatası.',
        error_code: 'SELECTION_ERROR'
      };
    }
  }

  /**
   * Check if card already owns a locker (enforces one card, one locker rule)
   * Requirement 1.5: Enforce one-card-one-locker rule
   */
  async checkExistingOwnership(cardId: string): Promise<Locker | null> {
    try {
      return await this.lockerStateManager.checkExistingOwnership(cardId, 'rfid');
    } catch (error) {
      console.error('Error checking existing ownership:', error);
      return null;
    }
  }

  /**
   * Get current kiosk statistics
   */
  async getKioskStats(): Promise<{
    total: number;
    free: number;
    reserved: number;
    owned: number;
    blocked: number;
    vip: number;
  }> {
    return await this.lockerStateManager.getKioskStats(this.config.kiosk_id);
  }

  /**
   * Handle emergency release (for staff use)
   */
  async emergencyRelease(lockerId: number, staffUser: string, reason: string): Promise<boolean> {
    try {
      // Force open the locker
      const openResult = await this.modbusController.openLocker(lockerId);
      
      if (openResult) {
        // Force release ownership
        const releaseResult = await this.lockerStateManager.releaseLocker(
          this.config.kiosk_id,
          lockerId
        );

        // Log the emergency action
        this.emit('emergency_release', {
          locker_id: lockerId,
          staff_user: staffUser,
          reason: reason,
          success: releaseResult
        });

        return releaseResult;
      }

      return false;
    } catch (error) {
      console.error('Error during emergency release:', error);
      return false;
    }
  }

  /**
   * Validate card format and hash consistency
   */
  validateCardId(cardId: string): boolean {
    // Card ID should be 16 characters hex string (from RFID handler hashing)
    return /^[0-9a-f]{16}$/.test(cardId);
  }

  /**
   * Get configuration
   */
  getConfig(): RfidUserFlowConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RfidUserFlowConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
