import { DatabaseConnection } from '../database/connection';
import { ConfigurationManager } from './configuration-manager';

export interface HotWindowConfig {
  owner_hot_window_min: number; // Minimum hot window duration (10 minutes)
  owner_hot_window_max: number; // Maximum hot window duration (30 minutes)
  free_ratio_low: number; // Free ratio threshold for minimum window (0.1)
  free_ratio_high: number; // Free ratio threshold for maximum window (0.5)
}

export interface HotWindowCalculation {
  duration: number; // Duration in minutes
  disabled: boolean; // Whether hot window is disabled due to low capacity
  freeRatio: number; // Current free ratio
}

export interface HotWindowApplication {
  lockerId: number;
  cardId: string;
  expiresAt: Date;
  duration: number;
}

/**
 * HotWindowManager - Manages owner hot window protection
 * 
 * Implements owner hot window calculation with linear interpolation:
 * - ≥0.5 free ratio → 30 minutes hot window
 * - ≤0.1 free ratio → disabled (0 minutes)
 * - Between 0.1-0.5 → linear interpolation (10-30 minutes)
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */
export class HotWindowManager {
  private db: DatabaseConnection;
  private configManager: ConfigurationManager;

  constructor(db: DatabaseConnection, configManager: ConfigurationManager) {
    this.db = db;
    this.configManager = configManager;
  }

  /**
   * Calculate owner hot window duration based on free ratio
   * Requirements: 14.1, 14.2, 14.3
   */
  async calculateHotWindow(kioskId: string): Promise<HotWindowCalculation> {
    const config = await this.getHotWindowConfig(kioskId);
    const rawFreeRatio = await this.calculateFreeRatio(kioskId);
    
    // Clamp free_ratio to [0,1] before interpolation
    const freeRatio = Math.max(0, Math.min(1, rawFreeRatio));

    // Disabled when very low stock (≤0.1)
    if (freeRatio <= config.free_ratio_low) {
      console.log(`Hot window: duration=0, disabled=true.`);
      return {
        duration: 0,
        disabled: true,
        freeRatio
      };
    }

    // Maximum duration when high stock (≥0.5)
    if (freeRatio >= config.free_ratio_high) {
      console.log(`Hot window: duration=${config.owner_hot_window_max}, disabled=false.`);
      return {
        duration: config.owner_hot_window_max,
        disabled: false,
        freeRatio
      };
    }

    // Linear interpolation between 0.1 and 0.5
    const ratio = (freeRatio - config.free_ratio_low) / (config.free_ratio_high - config.free_ratio_low);
    const duration = config.owner_hot_window_min + (ratio * (config.owner_hot_window_max - config.owner_hot_window_min));
    
    console.log(`Hot window: duration=${Math.round(duration)}, disabled=false.`);
    
    return {
      duration: Math.round(duration),
      disabled: false,
      freeRatio
    };
  }

  /**
   * Apply hot window protection to a locker after release
   * Requirements: 14.4
   */
  async applyHotWindow(kioskId: string, lockerId: number, cardId: string): Promise<HotWindowApplication | null> {
    const calculation = await this.calculateHotWindow(kioskId);
    
    // Don't apply hot window if disabled
    if (calculation.disabled || calculation.duration === 0) {
      return null;
    }

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + calculation.duration);

    // Update locker with hot window protection
    const result = await this.db.run(
      `UPDATE lockers 
       SET owner_hot_until = ?, recent_owner = ?, recent_owner_time = CURRENT_TIMESTAMP,
           version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE kiosk_id = ? AND id = ?`,
      [expiresAt.toISOString(), cardId, kioskId, lockerId]
    );

    if (result.changes > 0) {
      console.log(`Hot window applied: locker=${lockerId}, duration=${calculation.duration}min.`);
      
      return {
        lockerId,
        cardId,
        expiresAt,
        duration: calculation.duration
      };
    }

    return null;
  }

  /**
   * Check if a locker is in hot window protection
   * Requirements: 14.4
   */
  async isInHotWindow(kioskId: string, lockerId: number): Promise<boolean> {
    const locker = await this.db.get<{ owner_hot_until: string | null }>(
      `SELECT owner_hot_until FROM lockers WHERE kiosk_id = ? AND id = ?`,
      [kioskId, lockerId]
    );

    if (!locker?.owner_hot_until) {
      return false;
    }

    const hotUntil = new Date(locker.owner_hot_until);
    const now = new Date();
    
    return hotUntil > now;
  }

  /**
   * Get lockers currently in hot window protection
   */
  async getHotWindowLockers(kioskId: string): Promise<Array<{
    lockerId: number;
    cardId: string;
    expiresAt: Date;
    remainingMinutes: number;
  }>> {
    const lockers = await this.db.all<{
      id: number;
      recent_owner: string;
      owner_hot_until: string;
    }>(
      `SELECT id, recent_owner, owner_hot_until 
       FROM lockers 
       WHERE kiosk_id = ? AND owner_hot_until > CURRENT_TIMESTAMP
       ORDER BY owner_hot_until ASC`,
      [kioskId]
    );

    const now = new Date();
    
    return lockers.map(locker => {
      const expiresAt = new Date(locker.owner_hot_until);
      const remainingMs = expiresAt.getTime() - now.getTime();
      const remainingMinutes = Math.max(0, Math.ceil(remainingMs / (1000 * 60)));
      
      return {
        lockerId: locker.id,
        cardId: locker.recent_owner,
        expiresAt,
        remainingMinutes
      };
    });
  }

  /**
   * Clear expired hot windows
   * Requirements: 14.5
   */
  async clearExpiredHotWindows(kioskId: string): Promise<number> {
    const result = await this.db.run(
      `UPDATE lockers 
       SET owner_hot_until = NULL, version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE kiosk_id = ? AND owner_hot_until <= CURRENT_TIMESTAMP`,
      [kioskId]
    );

    if (result.changes > 0) {
      console.log(`Cleared ${result.changes} expired hot windows.`);
    }

    return result.changes;
  }

  /**
   * Check if a card can bypass hot window (original owner)
   * Requirements: 14.4
   */
  async canBypassHotWindow(kioskId: string, lockerId: number, cardId: string): Promise<boolean> {
    const locker = await this.db.get<{
      recent_owner: string | null;
      owner_hot_until: string | null;
    }>(
      `SELECT recent_owner, owner_hot_until 
       FROM lockers 
       WHERE kiosk_id = ? AND id = ?`,
      [kioskId, lockerId]
    );

    if (!locker?.owner_hot_until || !locker.recent_owner) {
      return false; // No hot window or no recent owner
    }

    const hotUntil = new Date(locker.owner_hot_until);
    const now = new Date();
    
    // Hot window expired
    if (hotUntil <= now) {
      return false;
    }

    // Only the recent owner can bypass
    return locker.recent_owner === cardId;
  }

  /**
   * Get hot window configuration with defaults
   */
  private async getHotWindowConfig(kioskId: string): Promise<HotWindowConfig> {
    const config = await this.configManager.getEffectiveConfig(kioskId);
    
    return {
      owner_hot_window_min: config.owner_hot_window_min || 10, // 10 minutes default
      owner_hot_window_max: config.owner_hot_window_max || 30, // 30 minutes default
      free_ratio_low: config.free_ratio_low || 0.1,
      free_ratio_high: config.free_ratio_high || 0.5
    };
  }

  /**
   * Calculate free ratio for the kiosk
   */
  private async calculateFreeRatio(kioskId: string): Promise<number> {
    const stats = await this.db.get<{ total: number; free: number }>(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'Free' AND is_vip = 0 THEN 1 ELSE 0 END) as free
       FROM lockers WHERE kiosk_id = ?`,
      [kioskId]
    );

    if (!stats || stats.total === 0) {
      return 0;
    }

    return stats.free / stats.total;
  }

  /**
   * Get hot window manager status for monitoring
   */
  async getStatus(kioskId: string): Promise<{
    activeHotWindows: number;
    freeRatio: number;
    currentDuration: number;
    disabled: boolean;
  }> {
    const hotWindowLockers = await this.getHotWindowLockers(kioskId);
    const calculation = await this.calculateHotWindow(kioskId);
    
    return {
      activeHotWindows: hotWindowLockers.length,
      freeRatio: calculation.freeRatio,
      currentDuration: calculation.duration,
      disabled: calculation.disabled
    };
  }
}