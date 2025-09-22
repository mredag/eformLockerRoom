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
import { ConfigManager } from '../../../../shared/services/config-manager';
import { LockerAssignmentMode } from '../../../../shared/types/system-config';

export interface RfidUserFlowConfig {
  kiosk_id: string;
  max_available_lockers_display: number;
  opening_timeout_ms: number;
  zone_id?: string; // Optional zone for this kiosk
}

export interface UserFlowResult {
  success: boolean;
  action: 'show_lockers' | 'open_locker' | 'error';
  message: string;
  available_lockers?: Locker[];
  opened_locker?: number;
  error_code?: string;
  assignment_mode?: LockerAssignmentMode;
  auto_assigned?: boolean;
  fallback_reason?: string;
  debug_logs?: string[];
}

export class RfidUserFlow extends EventEmitter {
  private static readonly RECENT_RELEASE_LOOKBACK_HOURS = 24;
  private config: RfidUserFlowConfig;
  private lockerStateManager: LockerStateManager;
  private modbusController: ModbusController;
  private lockerNamingService: LockerNamingService;
  private configManager: ConfigManager;
  private configInitPromise: Promise<void> | null = null;

  constructor(
    config: RfidUserFlowConfig,
    lockerStateManager: LockerStateManager,
    modbusController: ModbusController,
    lockerNamingService: LockerNamingService,
    configManager?: ConfigManager
  ) {
    super();
    this.config = config;
    this.lockerStateManager = lockerStateManager;
    this.modbusController = modbusController;
    this.lockerNamingService = lockerNamingService;
    this.configManager = configManager || ConfigManager.getInstance();
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

  private async ensureConfigInitialized(): Promise<void> {
    if (!this.configInitPromise) {
      this.configInitPromise = this.configManager.initialize().catch(error => {
        console.warn('RFID flow failed to initialize configuration manager:', error);
      });
    }

    try {
      await this.configInitPromise;
    } catch (error) {
      console.warn('Configuration manager initialization previously failed:', error);
    }
  }

  private async getAssignmentMode(): Promise<LockerAssignmentMode> {
    await this.ensureConfigInitialized();

    try {
      return this.configManager.getKioskAssignmentMode(this.config.kiosk_id);
    } catch (error) {
      console.warn('Failed to determine kiosk assignment mode, defaulting to manual:', error);
      return 'manual';
    }
  }

  private async getRecentHolderThresholdHours(): Promise<number> {
    await this.ensureConfigInitialized();

    try {
      if (typeof this.configManager.getRecentHolderMinHours === 'function') {
        return this.configManager.getRecentHolderMinHours();
      }
    } catch (error) {
      console.warn('Failed to load recent holder rule threshold:', error);
    }

    return 0;
  }

  /**
   * Handle RFID card scan event - main entry point for user flow
   * Implements the core RFID logic from requirements 1.1, 1.2
   */
  async handleCardScanned(
    scanEvent: RfidScanEvent,
    options: { zoneId?: string } = {}
  ): Promise<UserFlowResult> {
    try {
      const cardId = scanEvent.card_id;
      const zoneId = options.zoneId ?? this.config.zone_id;

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
        return await this.handleCardWithNoLocker(cardId, zoneId);
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
   * Shows available Free lockers for user selection (zone-aware)
   * Requirement 1.1: Display available lockers when card has no assignment
   * Requirement 3.2: Zone-aware locker filtering
   */
  async handleCardWithNoLocker(cardId: string, zoneId?: string): Promise<UserFlowResult> {
    try {
      const debugLogs: string[] = [];

      const formatErrorForLog = (error: unknown): string => {
        if (error instanceof Error) {
          return `${error.name}: ${error.message}`;
        }

        if (typeof error === 'object') {
          try {
            return JSON.stringify(error);
          } catch (stringifyError) {
            console.warn('Failed to stringify warning detail for debug logs:', stringifyError);
            return String(error);
          }
        }

        return String(error);
      };

      const addInfoLog = (message: string): void => {
        debugLogs.push(message);
        console.log(message);
      };

      const addWarnLog = (message: string, error?: unknown): void => {
        if (error !== undefined) {
          console.warn(message, error);
          debugLogs.push(`${message} ${formatErrorForLog(error)}`.trim());
        } else {
          console.warn(message);
          debugLogs.push(message);
        }
      };

      let availableLockers: Locker[];
      const effectiveZoneId = zoneId ?? this.config.zone_id;

      if (effectiveZoneId) {
        // Zone-aware: Get available lockers filtered by zone
        addInfoLog(`[AUTO-ASSIGN] Fetching available lockers for zone ${effectiveZoneId} (card: ${cardId}).`);
        availableLockers = await this.getZoneAwareAvailableLockers(effectiveZoneId);
      } else {
        // Legacy: Get all available lockers
        addInfoLog(`[AUTO-ASSIGN] Fetching available lockers for kiosk ${this.config.kiosk_id} (card: ${cardId}).`);
        availableLockers = await this.lockerStateManager.getAvailableLockers(this.config.kiosk_id);
      }

      const assignmentMode = await this.getAssignmentMode();
      addInfoLog(`[AUTO-ASSIGN] Card ${cardId} resolved assignment mode: ${assignmentMode}.`);

      if (availableLockers.length === 0) {
        const zoneMessage = effectiveZoneId ? ` (${effectiveZoneId} bölgesi)` : '';
        return {
          success: false,
          action: 'error',
          message: `Boş dolap yok${zoneMessage}. Lütfen bekleyin.`,
          error_code: 'NO_AVAILABLE_LOCKERS',
          assignment_mode: assignmentMode,
          auto_assigned: false,
          debug_logs: debugLogs
        };
      }

      let fallbackReason: string | undefined;
      const recentHolderThreshold = assignmentMode === 'automatic'
        ? await this.getRecentHolderThresholdHours()
        : 0;
      let loggedRecentOwnerMessage = false;

      if (assignmentMode === 'automatic') {
        if (recentHolderThreshold > 0) {
          addInfoLog(`[AUTO-ASSIGN] Recent holder rule active for card ${cardId}: threshold ${recentHolderThreshold}h.`);
        } else {
          addInfoLog(`[AUTO-ASSIGN] Recent holder rule disabled (threshold ${recentHolderThreshold}h) for card ${cardId}.`);
        }
      }

      if (
        assignmentMode === 'automatic'
        && recentHolderThreshold > 0
        && typeof this.lockerStateManager.getRecentLockerReleaseForCard === 'function'
      ) {
        try {
          addInfoLog(`[AUTO-ASSIGN] Checking recent release for card ${cardId} within ${RfidUserFlow.RECENT_RELEASE_LOOKBACK_HOURS}h lookback.`);
          const recentRelease = await this.lockerStateManager.getRecentLockerReleaseForCard(
            this.config.kiosk_id,
            cardId,
            RfidUserFlow.RECENT_RELEASE_LOOKBACK_HOURS
          );

          if (recentRelease) {
            const heldHours = recentRelease.heldDurationHours
              ?? (recentRelease.heldDurationMinutes !== undefined
                ? Math.round((recentRelease.heldDurationMinutes / 60) * 1000) / 1000
                : undefined);

            const releaseAgeMs = Date.now() - recentRelease.releasedAt.getTime();
            const releaseAgeHours = releaseAgeMs >= 0 && Number.isFinite(releaseAgeMs)
              ? Math.round((releaseAgeMs / (60 * 60 * 1000)) * 1000) / 1000
              : undefined;

            addInfoLog(
              `[AUTO-ASSIGN] Recent release detected for card ${cardId}: locker ${recentRelease.lockerId}, `
              + `held ≈ ${heldHours !== undefined ? heldHours.toFixed(2) : 'unknown'}h, `
              + `released ≈ ${releaseAgeHours !== undefined ? releaseAgeHours.toFixed(2) : 'unknown'}h ago.`
            );

            if (heldHours !== undefined && heldHours >= recentHolderThreshold) {
              const previousLocker = availableLockers.find(locker => locker.id === recentRelease.lockerId);

              if (previousLocker) {
                const thresholdDisplay = recentHolderThreshold.toLocaleString('en-US', {
                  minimumFractionDigits: recentHolderThreshold % 1 === 0 ? 0 : 1,
                  maximumFractionDigits: 1
                });
                const recognizedMessage = `Card is recognized as the recent owner. Assigning the locker that was used within the last ${thresholdDisplay} hours.`;
                addInfoLog(recognizedMessage);
                loggedRecentOwnerMessage = true;
                addInfoLog(`[AUTO-ASSIGN] Reassigning previous locker ${previousLocker.id} to card ${cardId} (held ≈ ${heldHours}h).`);
                const autoResult = await this.handleLockerSelection(cardId, previousLocker.id);

                if (autoResult.success && autoResult.action === 'open_locker') {
                  const lockerName = await this.getLockerDisplayName(previousLocker.id);
                  this.emit('locker_auto_assign_success', {
                    card_id: cardId,
                    locker_id: previousLocker.id,
                    message: `${lockerName} yeniden atandı`
                  });

                  return {
                    ...autoResult,
                    message: `${lockerName} önceki kullanımınıza göre atandı ve açıldı`,
                    opened_locker: previousLocker.id,
                    auto_assigned: true,
                    assignment_mode: assignmentMode,
                    debug_logs: debugLogs
                  };
                }

                fallbackReason = autoResult.error_code || 'RECENT_LOCKER_ASSIGNMENT_FAILED';
                loggedRecentOwnerMessage = false;
                addWarnLog(
                  `[AUTO-ASSIGN] Failed to reassign previous locker ${previousLocker.id} for card ${cardId} (${fallbackReason}); falling back to normal automatic selection.`
                );
                this.emit('locker_auto_assign_fallback', {
                  card_id: cardId,
                  locker_id: previousLocker.id,
                  reason: fallbackReason
                });
              } else {
                const noLongerFreeMessage = 'Card is not recognized as the recent owner. Assigning a new random locker.';
                addInfoLog(noLongerFreeMessage);
                loggedRecentOwnerMessage = true;
                addInfoLog(
                  `[AUTO-ASSIGN] Previous locker ${recentRelease.lockerId} for card ${cardId} is not currently free; falling back to normal automatic selection.`
                );
              }
            } else {
              addInfoLog(
                `[AUTO-ASSIGN] Recent release for card ${cardId} held for ${heldHours !== undefined ? heldHours.toFixed(2) : 'unknown'}h `
                + `which is below the ${recentHolderThreshold}h threshold.`
              );
            }
          } else {
            addInfoLog(
              `[AUTO-ASSIGN] No qualifying release found for card ${cardId} within the last ${RfidUserFlow.RECENT_RELEASE_LOOKBACK_HOURS}h.`
            );
          }
        } catch (error) {
          addWarnLog(
            `[AUTO-ASSIGN] Recent locker reassignment lookup failed for card ${cardId}:`,
            error
          );
        }
      }

      if (assignmentMode === 'automatic' && !loggedRecentOwnerMessage) {
        const unrecognizedMessage = 'Card is not recognized as the recent owner. Assigning a new random locker.';
        addInfoLog(unrecognizedMessage);
        loggedRecentOwnerMessage = true;
      }

      if (assignmentMode === 'automatic') {
        let candidate: Locker | null = null;

        try {
          const allowedLockerIds = availableLockers.map(locker => locker.id);
          candidate = await this.lockerStateManager.getOldestAvailableLocker(
            this.config.kiosk_id,
            {
              allowedLockerIds,
              zoneId
            }
          );
        } catch (error) {
          addWarnLog('[AUTO-ASSIGN] Failed to query automatic assignment candidate list:', error);
          fallbackReason = 'CANDIDATE_QUERY_FAILED';
        }

        if (candidate) {
          addInfoLog(`[AUTO-ASSIGN] Default automatic assignment selecting locker ${candidate.id} for card ${cardId}.`);
          const autoResult = await this.handleLockerSelection(cardId, candidate.id);

          if (autoResult.success && autoResult.action === 'open_locker') {
            const lockerName = await this.getLockerDisplayName(candidate.id);
            this.emit('locker_auto_assign_success', {
              card_id: cardId,
              locker_id: candidate.id,
              message: `${lockerName} otomatik atandı`
            });

            return {
              ...autoResult,
              message: `${lockerName} otomatik atandı ve açıldı`,
              opened_locker: candidate.id,
              auto_assigned: true,
              assignment_mode: assignmentMode,
              debug_logs: debugLogs
            };
          }

          fallbackReason = autoResult.error_code || 'AUTO_ASSIGNMENT_FAILED';
          addWarnLog(
            `[AUTO-ASSIGN] Automatic assignment failed for locker ${candidate.id} (${fallbackReason}); falling back to manual selection.`
          );
          this.emit('locker_auto_assign_fallback', {
            card_id: cardId,
            locker_id: candidate.id,
            reason: fallbackReason
          });
        } else if (!fallbackReason) {
          fallbackReason = 'NO_CANDIDATES';
          addWarnLog('[AUTO-ASSIGN] No automatic assignment candidate available; falling back to manual selection.');
          this.emit('locker_auto_assign_fallback', {
            card_id: cardId,
            reason: fallbackReason
          });
        }
      }

      if (fallbackReason) {
        try {
          if (zoneId) {
            availableLockers = await this.getZoneAwareAvailableLockers(zoneId);
          } else {
            availableLockers = await this.lockerStateManager.getAvailableLockers(this.config.kiosk_id);
          }
        } catch (refreshError) {
          addWarnLog('[AUTO-ASSIGN] Could not refresh locker list after automatic assignment failure:', refreshError);
        }
      }

      // Limit display to configured maximum
      const displayLockers = availableLockers.slice(0, this.config.max_available_lockers_display);

      // Log zone context
      addInfoLog(
        `[AUTO-ASSIGN] Presenting ${displayLockers.length}/${availableLockers.length} available lockers to card ${cardId} (zone: ${effectiveZoneId || 'all'}).`
      );

      this.emit('show_available_lockers', {
        card_id: cardId,
        lockers: displayLockers,
        total_available: availableLockers.length,
        zone_id: effectiveZoneId // Include zone context in event
      });

      const zoneMessage = effectiveZoneId ? ` (${effectiveZoneId} bölgesi)` : '';
      return {
        success: true,
        action: 'show_lockers',
        message: `Dolap seçiniz${zoneMessage}`,
        available_lockers: displayLockers,
        assignment_mode: assignmentMode,
        auto_assigned: false,
        fallback_reason: fallbackReason,
        debug_logs: debugLogs
      };
    } catch (error) {
      console.error('Error getting available lockers:', error);
      const errorSummary = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);

      return {
        success: false,
        action: 'error',
        message: 'Dolap listesi alınamadı.',
        error_code: 'LOCKER_LIST_ERROR',
        assignment_mode: await this.getAssignmentMode(),
        debug_logs: ['Error getting available lockers', errorSummary]
      };
    }
  }

  /**
   * Get zone-aware available lockers using the layout service
   * This ensures we only show lockers that belong to the kiosk's zone
   */
  private async getZoneAwareAvailableLockers(zoneId: string): Promise<Locker[]> {
    try {
      // Import layout service
      const { lockerLayoutService } = await import("../../../../shared/services/locker-layout-service");
      
      // Get zone-aware layout
      const layout = await lockerLayoutService.generateLockerLayout(this.config.kiosk_id, zoneId);
      
      // Get current locker states and filter for available ones
      const availableLockers: Locker[] = [];
      
      for (const lockerInfo of layout.lockers) {
        try {
          const locker = await this.lockerStateManager.getLocker(this.config.kiosk_id, lockerInfo.id);
          
          // Include only Free lockers that are enabled and not VIP
          if (locker && locker.status === 'Free' && lockerInfo.enabled && !locker.is_vip) {
            availableLockers.push(locker);
          }
        } catch (error) {
          console.warn(`⚠️  Could not check status for locker ${lockerInfo.id}:`, error);
        }
      }
      
      return availableLockers;
    } catch (error) {
      console.error('Error getting zone-aware available lockers:', error);
      // Fallback to legacy method
      return await this.lockerStateManager.getAvailableLockers(this.config.kiosk_id);
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
