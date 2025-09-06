import { DatabaseManager } from './database-manager';
import { ConfigurationManager } from './configuration-manager';

export interface QuarantineConfig {
  quarantine_min_floor: number;        // 5 minutes
  quarantine_min_ceiling: number;      // 20 minutes
  exit_quarantine_minutes: number;     // 20 minutes fixed
  free_ratio_low: number;             // 0.1
  free_ratio_high: number;            // 0.5
}

export interface QuarantineAuditEntry {
  kioskId: string;
  lockerId: number;
  adminUser: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  timestamp: Date;
  version: number;
}

export interface QuarantineResult {
  duration: number;
  reason: string;
  expiresAt: Date;
}

export interface QuarantineApplication {
  lockerId: number;
  kioskId: string;
  duration: number;
  reason: string;
  appliedAt: Date;
  expiresAt: Date;
}

export class QuarantineManager {
  private db: DatabaseManager;
  private config: ConfigurationManager;
  private logger: any;

  constructor(db: DatabaseManager, config: ConfigurationManager, logger?: any) {
    this.db = db;
    this.config = config;
    this.logger = logger || console; // Use project logger if provided, fallback to console
  }

  /**
   * Calculate quarantine duration based on free ratio
   * Linear interpolation between 5-20 minutes based on capacity
   */
  async calculateQuarantineDuration(
    kioskId: string, 
    reason: 'capacity_based' | 'exit_quarantine' = 'capacity_based'
  ): Promise<QuarantineResult> {
    const effectiveConfig = await this.config.getEffectiveConfig(kioskId);
    const quarantineConfig: QuarantineConfig = {
      quarantine_min_floor: effectiveConfig.quarantine_min_floor || 5,
      quarantine_min_ceiling: effectiveConfig.quarantine_min_ceiling || 20,
      exit_quarantine_minutes: effectiveConfig.exit_quarantine_minutes || 20,
      free_ratio_low: effectiveConfig.free_ratio_low || 0.1,
      free_ratio_high: effectiveConfig.free_ratio_high || 0.5
    };

    // Fixed 20-minute exit quarantine for reclaim scenarios
    if (reason === 'exit_quarantine') {
      const duration = quarantineConfig.exit_quarantine_minutes;
      const expiresAt = new Date(Date.now() + duration * 60 * 1000);
      
      this.logger.info(`Quarantine applied: duration=${duration}min, reason=exit_quarantine`);
      
      return {
        duration,
        reason,
        expiresAt
      };
    }

    // Calculate free ratio for capacity-based quarantine
    const rawFreeRatio = await this.calculateFreeRatio(kioskId);
    // Clamp free_ratio to [0, 1] before computing minutes
    const freeRatio = Math.max(0, Math.min(1, rawFreeRatio));
    const duration = this.interpolateQuarantineDuration(freeRatio, quarantineConfig);
    const expiresAt = new Date(Date.now() + duration * 60 * 1000);

    this.logger.info(`Quarantine applied: duration=${duration}min, reason=capacity_based`);

    return {
      duration,
      reason,
      expiresAt
    };
  }

  /**
   * Linear interpolation for quarantine duration
   * ≥0.5 → 20min, ≤0.1 → 5min, linear between
   */
  private interpolateQuarantineDuration(freeRatio: number, config: QuarantineConfig): number {
    const { quarantine_min_floor, quarantine_min_ceiling, free_ratio_low, free_ratio_high } = config;

    // High capacity: maximum quarantine (20 minutes)
    if (freeRatio >= free_ratio_high) {
      return quarantine_min_ceiling;
    }

    // Low capacity: minimum quarantine (5 minutes)
    if (freeRatio <= free_ratio_low) {
      return quarantine_min_floor;
    }

    // Linear interpolation between free_ratio_low and free_ratio_high
    const ratio = (freeRatio - free_ratio_low) / (free_ratio_high - free_ratio_low);
    const duration = quarantine_min_floor + ratio * (quarantine_min_ceiling - quarantine_min_floor);

    return Math.round(duration);
  }

  /**
   * Calculate current free ratio for a kiosk
   */
  private async calculateFreeRatio(kioskId: string): Promise<number> {
    const query = `
      SELECT 
        COUNT(*) as total_lockers,
        SUM(CASE WHEN status = 'Free' AND (quarantine_until IS NULL OR quarantine_until <= datetime('now')) THEN 1 ELSE 0 END) as free_lockers
      FROM lockers 
      WHERE kiosk_id = ?
    `;

    const result = await this.db.get(query, [kioskId]);
    
    if (!result || result.total_lockers === 0) {
      return 0;
    }

    return result.free_lockers / result.total_lockers;
  }

  /**
   * Apply quarantine to a locker
   */
  async applyQuarantine(
    kioskId: string, 
    lockerId: number, 
    reason: 'capacity_based' | 'exit_quarantine' = 'capacity_based'
  ): Promise<QuarantineApplication> {
    const quarantineResult = await this.calculateQuarantineDuration(kioskId, reason);
    
    const updateQuery = `
      UPDATE lockers 
      SET quarantine_until = ?, 
          updated_at = datetime('now')
      WHERE kiosk_id = ? AND id = ?
    `;

    await this.db.run(updateQuery, [
      quarantineResult.expiresAt.toISOString(),
      kioskId,
      lockerId
    ]);

    const application: QuarantineApplication = {
      lockerId,
      kioskId,
      duration: quarantineResult.duration,
      reason: quarantineResult.reason,
      appliedAt: new Date(),
      expiresAt: quarantineResult.expiresAt
    };

    return application;
  }

  /**
   * Check if a locker is currently quarantined
   */
  async isQuarantined(kioskId: string, lockerId: number): Promise<boolean> {
    const query = `
      SELECT quarantine_until 
      FROM lockers 
      WHERE kiosk_id = ? AND id = ?
    `;

    const result = await this.db.get(query, [kioskId, lockerId]);
    
    if (!result || !result.quarantine_until) {
      return false;
    }

    const quarantineUntil = new Date(result.quarantine_until);
    return quarantineUntil > new Date();
  }

  /**
   * Get quarantine expiration time for a locker
   */
  async getQuarantineExpiration(kioskId: string, lockerId: number): Promise<Date | null> {
    const query = `
      SELECT quarantine_until 
      FROM lockers 
      WHERE kiosk_id = ? AND id = ?
    `;

    const result = await this.db.get(query, [kioskId, lockerId]);
    
    if (!result || !result.quarantine_until) {
      return null;
    }

    const quarantineUntil = new Date(result.quarantine_until);
    return quarantineUntil > new Date() ? quarantineUntil : null;
  }

  /**
   * Remove expired quarantines (cleanup with row limit)
   * Run every 60s with indexed query
   */
  async cleanupExpiredQuarantines(kioskId?: string, limit: number = 100): Promise<number> {
    let query = `
      UPDATE lockers 
      SET quarantine_until = NULL, 
          updated_at = datetime('now')
      WHERE rowid IN (
        SELECT rowid FROM lockers 
        WHERE quarantine_until IS NOT NULL 
          AND quarantine_until <= datetime('now')
    `;
    
    const params: any[] = [];
    
    if (kioskId) {
      query += ' AND kiosk_id = ?';
      params.push(kioskId);
    }
    
    query += ` LIMIT ${limit})`;

    const result = await this.db.run(query, params);
    
    if (result.changes && result.changes > 0) {
      this.logger.info(`Quarantine cleanup: removed=${result.changes}`);
    }

    return result.changes || 0;
  }

  /**
   * Get all quarantined lockers for a kiosk
   */
  async getQuarantinedLockers(kioskId: string): Promise<Array<{
    lockerId: number;
    quarantineUntil: Date;
    remainingMinutes: number;
  }>> {
    const query = `
      SELECT id as lockerId, quarantine_until
      FROM lockers 
      WHERE kiosk_id = ? 
        AND quarantine_until IS NOT NULL 
        AND quarantine_until > datetime('now')
      ORDER BY quarantine_until ASC
    `;

    const results = await this.db.all(query, [kioskId]);
    const now = new Date();

    return results.map(row => {
      const quarantineUntil = new Date(row.quarantine_until);
      const remainingMs = quarantineUntil.getTime() - now.getTime();
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));

      return {
        lockerId: row.lockerId,
        quarantineUntil,
        remainingMinutes: Math.max(0, remainingMinutes)
      };
    });
  }

  /**
   * Force remove quarantine (admin action with audit trail)
   * Requires admin auth and CSRF protection at route level
   */
  async removeQuarantine(
    kioskId: string, 
    lockerId: number, 
    adminUser: string, 
    reason: string = 'admin_removal'
  ): Promise<boolean> {
    // Get current quarantine value for audit
    const currentQuery = `
      SELECT quarantine_until, version 
      FROM lockers 
      WHERE kiosk_id = ? AND id = ?
    `;
    
    const current = await this.db.get(currentQuery, [kioskId, lockerId]);
    
    if (!current) {
      return false;
    }

    const oldValue = current.quarantine_until;
    const version = current.version || 1;

    // Remove quarantine in transaction
    await this.db.beginTransaction();
    
    try {
      // Update locker
      const updateQuery = `
        UPDATE lockers 
        SET quarantine_until = NULL, 
            updated_at = datetime('now'),
            version = version + 1
        WHERE kiosk_id = ? AND id = ? AND version = ?
      `;

      const result = await this.db.run(updateQuery, [kioskId, lockerId, version]);
      
      if (!result.changes || result.changes === 0) {
        await this.db.rollback();
        return false;
      }

      // Write audit entry
      await this.writeQuarantineAudit({
        kioskId,
        lockerId,
        adminUser,
        oldValue,
        newValue: null,
        reason,
        timestamp: new Date(),
        version: version + 1
      });

      await this.db.commit();
      
      this.logger.info(`Quarantine removed: locker=${lockerId}, admin=${adminUser}, reason=${reason}`);
      return true;
      
    } catch (error) {
      await this.db.rollback();
      throw error;
    }
  }

  /**
   * Write quarantine audit entry
   */
  private async writeQuarantineAudit(entry: QuarantineAuditEntry): Promise<void> {
    const auditQuery = `
      INSERT INTO quarantine_audit (
        kiosk_id, locker_id, admin_user, old_value, new_value, 
        reason, timestamp, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(auditQuery, [
      entry.kioskId,
      entry.lockerId,
      entry.adminUser,
      entry.oldValue,
      entry.newValue,
      entry.reason,
      entry.timestamp.toISOString(),
      entry.version
    ]);
  }

  /**
   * Apply quarantine within transaction (for orchestrator integration)
   */
  async applyQuarantineInTransaction(
    kioskId: string,
    lockerId: number,
    reason: 'capacity_based' | 'exit_quarantine' = 'capacity_based'
  ): Promise<QuarantineApplication> {
    const quarantineResult = await this.calculateQuarantineDuration(kioskId, reason);
    
    const updateQuery = `
      UPDATE lockers 
      SET quarantine_until = ?, 
          updated_at = datetime('now')
      WHERE kiosk_id = ? AND id = ?
    `;

    await this.db.run(updateQuery, [
      quarantineResult.expiresAt.toISOString(),
      kioskId,
      lockerId
    ]);

    return {
      lockerId,
      kioskId,
      duration: quarantineResult.duration,
      reason: quarantineResult.reason,
      appliedAt: new Date(),
      expiresAt: quarantineResult.expiresAt
    };
  }

  /**
   * Get non-quarantined lockers for selector integration
   */
  async getNonQuarantinedLockers(kioskId: string, candidateLockerIds: number[]): Promise<number[]> {
    if (candidateLockerIds.length === 0) {
      return [];
    }

    const placeholders = candidateLockerIds.map(() => '?').join(',');
    const query = `
      SELECT id
      FROM lockers 
      WHERE kiosk_id = ? 
        AND id IN (${placeholders})
        AND (quarantine_until IS NULL OR quarantine_until <= datetime('now'))
    `;

    const params = [kioskId, ...candidateLockerIds];
    const results = await this.db.all(query, params);
    
    return results.map(row => row.id);
  }
}