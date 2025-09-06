import { DatabaseConnection } from '../database/connection';
import { ConfigurationManager } from './configuration-manager';
import { QuarantineManager } from './quarantine-manager';

export interface ReclaimResult {
  canReclaim: boolean;
  lockerId?: number;
  reason: string;
  reclaimType?: 'standard' | 'exit_reopen';
  quarantineApplied?: boolean;
  reclaimWindowMinutes?: number;
}

export interface ReclaimEligibilityCheck {
  cardId: string;
  kioskId: string;
  timestamp: Date;
}

export interface LockerHistory {
  id: number;
  kiosk_id: string;
  recent_owner: string;
  recent_owner_time: string;
  status: string;
  version: number;
  overdue_from?: string;
  suspected_occupied?: number;
}

/**
 * Dynamic Reclaim Manager
 * 
 * Handles intelligent reclaim logic based on capacity and timing:
 * - Standard reclaim: 30-120 minutes (no quarantine)
 * - Exit reopen: 120+ minutes with dynamic window (20min exit quarantine)
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
export class ReclaimManager {
  constructor(
    private db: DatabaseConnection,
    private configManager: ConfigurationManager,
    private quarantineManager: QuarantineManager
  ) {}

  /**
   * Check if user can reclaim their previous locker
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
   */
  async checkReclaimEligibility(check: ReclaimEligibilityCheck): Promise<ReclaimResult> {
    const { cardId, kioskId, timestamp } = check;

    // Find user's most recent locker
    const recentLocker = await this.findRecentLocker(cardId, kioskId);
    if (!recentLocker) {
      return {
        canReclaim: false,
        reason: 'No recent locker found for user'
      };
    }

    // Check if locker is still available and not flagged
    if (recentLocker.status !== 'Free') {
      return {
        canReclaim: false,
        reason: `Previous locker ${recentLocker.id} is not available (status: ${recentLocker.status})`
      };
    }

    // Flags: Do not reclaim if overdue_from is set or suspected_occupied = 1
    if (recentLocker.overdue_from) {
      return {
        canReclaim: false,
        reason: `Previous locker ${recentLocker.id} is overdue (overdue_from: ${recentLocker.overdue_from})`
      };
    }

    if (recentLocker.suspected_occupied === 1) {
      return {
        canReclaim: false,
        reason: `Previous locker ${recentLocker.id} is suspected occupied`
      };
    }

    // Check if locker is in hot window protection (unless it's the same card)
    const isInHotWindow = await this.checkHotWindowProtection(kioskId, recentLocker.id, cardId);
    if (isInHotWindow.blocked) {
      return {
        canReclaim: false,
        reason: isInHotWindow.reason
      };
    }

    // Calculate time since release
    const timeSinceRelease = timestamp.getTime() - new Date(recentLocker.recent_owner_time).getTime();
    const minutesSinceRelease = timeSinceRelease / (1000 * 60);

    const config = await this.configManager.getEffectiveConfig(kioskId);
    const reclaimMinThreshold = config.reclaim_min || 120; // Default 120 minutes

    // Check if enough time has passed for reclaim eligibility
    if (minutesSinceRelease < reclaimMinThreshold) {
      return {
        canReclaim: false,
        reason: `Not enough time elapsed (${Math.round(minutesSinceRelease)}min < ${reclaimMinThreshold}min threshold)`
      };
    }

    // Determine reclaim type and window
    if (minutesSinceRelease >= 120) {
      // Exit reopen path (120+ minutes)
      return await this.checkExitReopenEligibility(recentLocker, minutesSinceRelease, kioskId);
    } else {
      // Standard reclaim path (reclaim_min to 120 minutes)
      return {
        canReclaim: true,
        lockerId: recentLocker.id,
        reason: `Standard reclaim eligible after ${Math.round(minutesSinceRelease)} minutes`,
        reclaimType: 'standard',
        quarantineApplied: false
      };
    }
  }

  /**
   * Execute reclaim operation
   * Requirements: 4.2, 4.5
   */
  async executeReclaim(cardId: string, kioskId: string, lockerId: number, reclaimType: 'standard' | 'exit_reopen'): Promise<boolean> {
    const config = await this.configManager.getEffectiveConfig(kioskId);

    try {
      if (reclaimType === 'exit_reopen') {
        // Apply exit quarantine (20 minutes fixed)
        const quarantineUntil = new Date(Date.now() + (config.exit_quarantine_minutes || 20) * 60 * 1000);

        // WHERE guards: Add quarantine check to avoid races
        await this.db.run(
          `UPDATE lockers 
           SET status = 'Owned', owner_type = 'rfid', owner_key = ?, 
               quarantine_until = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE kiosk_id = ? AND id = ? AND status = 'Free' 
           AND overdue_from IS NULL AND (suspected_occupied IS NULL OR suspected_occupied = 0)
           AND (quarantine_until IS NULL OR quarantine_until <= CURRENT_TIMESTAMP)`,
          [cardId, quarantineUntil.toISOString(), kioskId, lockerId]
        );

        console.log(`Reclaim executed: locker=${lockerId}, quarantine=20min.`);
        
        // Post-open quarantine: Apply capacity-based quarantine after successful open
        await this.applyPostOpenQuarantine(kioskId, lockerId);
        
        return true;
      } else {
        // WHERE guards: Add quarantine check to avoid races
        await this.db.run(
          `UPDATE lockers 
           SET status = 'Owned', owner_type = 'rfid', owner_key = ?, 
               version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE kiosk_id = ? AND id = ? AND status = 'Free'
           AND overdue_from IS NULL AND (suspected_occupied IS NULL OR suspected_occupied = 0)
           AND (quarantine_until IS NULL OR quarantine_until <= CURRENT_TIMESTAMP)`,
          [cardId, kioskId, lockerId]
        );

        console.log(`Reclaim executed: locker=${lockerId}, quarantine=none.`);
        
        // Post-open quarantine: Apply capacity-based quarantine after successful open
        await this.applyPostOpenQuarantine(kioskId, lockerId);
        
        return true;
      }
    } catch (error) {
      console.error(`Failed to execute reclaim for locker ${lockerId}:`, error);
      return false;
    }
  }

  /**
   * Calculate dynamic reclaim window based on free ratio
   * Requirements: 4.1, 4.3, 4.4
   */
  async calculateReclaimWindow(kioskId: string): Promise<number> {
    const freeRatio = await this.calculateFreeRatio(kioskId);
    const config = await this.configManager.getEffectiveConfig(kioskId);
    
    const reclaimLowMin = config.reclaim_low_min || 30;   // Low capacity window
    const reclaimHighMin = config.reclaim_high_min || 180; // High capacity window
    const freeRatioLow = config.free_ratio_low || 0.1;
    const freeRatioHigh = config.free_ratio_high || 0.5;
    
    // Capacity clamp: Clamp free_ratio to [0,1] before interpolation
    const clampedFreeRatio = Math.max(0, Math.min(1, freeRatio));
    
    if (clampedFreeRatio >= freeRatioHigh) {
      return reclaimHighMin; // 180 minutes at high capacity
    }
    
    if (clampedFreeRatio <= freeRatioLow) {
      return reclaimLowMin; // 30 minutes at low capacity
    }
    
    // Linear interpolation between low and high capacity
    const interpolatedWindow = reclaimLowMin + 
      ((clampedFreeRatio - freeRatioLow) / (freeRatioHigh - freeRatioLow)) * 
      (reclaimHighMin - reclaimLowMin);
    
    return Math.round(interpolatedWindow);
  }

  /**
   * Get reclaim statistics for monitoring
   */
  async getReclaimStats(kioskId: string): Promise<{
    freeRatio: number;
    reclaimWindow: number;
    eligibleForReclaim: number;
    eligibleForExitReopen: number;
  }> {
    const freeRatio = await this.calculateFreeRatio(kioskId);
    const reclaimWindow = await this.calculateReclaimWindow(kioskId);
    
    // Count lockers eligible for different reclaim types
    const now = new Date();
    const config = await this.configManager.getEffectiveConfig(kioskId);
    const reclaimMinThreshold = config.reclaim_min || 120;
    
    const eligibleForReclaim = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM lockers 
       WHERE kiosk_id = ? AND status = 'Free' AND recent_owner IS NOT NULL
       AND recent_owner_time IS NOT NULL
       AND overdue_from IS NULL AND (suspected_occupied IS NULL OR suspected_occupied = 0)
       AND (quarantine_until IS NULL OR quarantine_until <= CURRENT_TIMESTAMP)
       AND (julianday(?) - julianday(recent_owner_time)) * 24 * 60 >= ?
       AND (julianday(?) - julianday(recent_owner_time)) * 24 * 60 < 120`,
      [kioskId, now.toISOString(), reclaimMinThreshold, now.toISOString()]
    );
    
    const eligibleForExitReopen = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM lockers 
       WHERE kiosk_id = ? AND status = 'Free' AND recent_owner IS NOT NULL
       AND recent_owner_time IS NOT NULL
       AND overdue_from IS NULL AND (suspected_occupied IS NULL OR suspected_occupied = 0)
       AND (quarantine_until IS NULL OR quarantine_until <= CURRENT_TIMESTAMP)
       AND (julianday(?) - julianday(recent_owner_time)) * 24 * 60 >= 120
       AND (julianday(?) - julianday(recent_owner_time)) * 24 * 60 <= ?`,
      [kioskId, now.toISOString(), now.toISOString(), reclaimWindow]
    );
    
    return {
      freeRatio,
      reclaimWindow,
      eligibleForReclaim: eligibleForReclaim?.count || 0,
      eligibleForExitReopen: eligibleForExitReopen?.count || 0
    };
  }

  /**
   * Apply post-open quarantine based on capacity
   */
  private async applyPostOpenQuarantine(kioskId: string, lockerId: number): Promise<void> {
    try {
      await this.quarantineManager.applyQuarantineInTransaction(kioskId, lockerId, 'capacity_based');
    } catch (error) {
      console.error(`Failed to apply post-open quarantine for locker ${lockerId}:`, error);
    }
  }

  /**
   * Find user's most recent locker
   * Index use: Ensure queries leverage (kiosk_id, status, free_since) and (kiosk_id, quarantine_until)
   */
  private async findRecentLocker(cardId: string, kioskId: string): Promise<LockerHistory | null> {
    const result = await this.db.get<LockerHistory>(
      `SELECT id, kiosk_id, recent_owner, recent_owner_time, status, version, overdue_from, suspected_occupied
       FROM lockers 
       WHERE kiosk_id = ? AND recent_owner = ?
       ORDER BY recent_owner_time DESC LIMIT 1`,
      [kioskId, cardId]
    );
    return result || null;
  }

  /**
   * Check if locker is protected by hot window (except for original owner bypass)
   * Requirements: 14.4
   */
  private async checkHotWindowProtection(kioskId: string, lockerId: number, cardId: string): Promise<{
    blocked: boolean;
    reason: string;
  }> {
    const locker = await this.db.get<{
      recent_owner: string | null;
      owner_hot_until: string | null;
    }>(
      `SELECT recent_owner, owner_hot_until 
       FROM lockers 
       WHERE kiosk_id = ? AND id = ?`,
      [kioskId, lockerId]
    );

    if (!locker?.owner_hot_until) {
      return { blocked: false, reason: 'No hot window protection' };
    }

    const hotUntil = new Date(locker.owner_hot_until);
    const now = new Date();
    
    // Hot window expired
    if (hotUntil <= now) {
      return { blocked: false, reason: 'Hot window expired' };
    }

    // Original owner can bypass hot window
    if (locker.recent_owner === cardId) {
      return { blocked: false, reason: 'Original owner bypass' };
    }

    // Different user blocked by hot window
    return { 
      blocked: true, 
      reason: `Previous locker ${lockerId} is in hot window protection` 
    };
  }

  /**
   * Check exit reopen eligibility (120+ minutes with dynamic window)
   * Requirements: 4.2, 4.3, 4.4
   */
  private async checkExitReopenEligibility(
    locker: LockerHistory, 
    minutesSinceRelease: number, 
    kioskId: string
  ): Promise<ReclaimResult> {
    const reclaimWindow = await this.calculateReclaimWindow(kioskId);
    
    if (minutesSinceRelease <= reclaimWindow) {
      return {
        canReclaim: true,
        lockerId: locker.id,
        reason: `Exit reopen eligible: ${Math.round(minutesSinceRelease)}min within ${reclaimWindow}min window`,
        reclaimType: 'exit_reopen',
        quarantineApplied: true,
        reclaimWindowMinutes: reclaimWindow
      };
    } else {
      return {
        canReclaim: false,
        reason: `Exit reopen window expired: ${Math.round(minutesSinceRelease)}min > ${reclaimWindow}min window`,
        reclaimWindowMinutes: reclaimWindow
      };
    }
  }

  /**
   * Calculate free ratio for capacity-based decisions
   * Requirements: 4.3, 4.4
   */
  private async calculateFreeRatio(kioskId: string): Promise<number> {
    const stats = await this.db.get<{ total: number; free: number }>(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'Free' AND (quarantine_until IS NULL OR quarantine_until <= datetime('now')) THEN 1 ELSE 0 END) as free
       FROM lockers 
       WHERE kiosk_id = ?`,
      [kioskId]
    );

    if (!stats || stats.total === 0) {
      return 0;
    }

    return stats.free / stats.total;
  }
}