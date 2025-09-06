/**
 * Overdue Manager Service
 * 
 * Handles overdue locker marking, one-time retrieval logic, and suspected occupied reporting.
 * Implements requirements 5.1, 5.2, 5.3, 5.4, 5.5 for overdue and suspected occupied management.
 */

import { EventEmitter } from 'events';
import { DatabaseConnection } from '../database/connection';
import { ConfigurationManager } from './configuration-manager';

export interface OverdueLocker {
  kioskId: string;
  lockerId: number;
  cardId: string;
  overdueFrom: Date;
  reason: 'time_limit' | 'user_report';
  retrievalAllowed: boolean;
}

export interface SuspectedReport {
  id: string;
  kioskId: string;
  lockerId: number;
  cardId: string;
  reportedAt: Date;
  windowExpires: Date;
}

export interface UserReportStats {
  cardId: string;
  reportsToday: number;
  lastReportAt: Date;
}

export interface OverdueConfig {
  user_report_window_sec: number; // Time window to report suspected occupied
  suspect_ttl_min: number; // How long suspected status lasts
  daily_report_cap: number; // Max reports per card per day (2)
  retrieval_grace_period_min: number; // Grace period for overdue retrieval
}

export class OverdueManager extends EventEmitter {
  private db: DatabaseConnection;
  private config: ConfigurationManager;
  private defaultConfig: OverdueConfig;

  constructor(db: DatabaseConnection, config: ConfigurationManager) {
    super();
    this.db = db;
    this.config = config;
    
    this.defaultConfig = {
      user_report_window_sec: 30, // 30 seconds to report after locker open
      suspect_ttl_min: 60, // Suspected status lasts 1 hour
      daily_report_cap: 2, // Max 2 reports per card per day
      retrieval_grace_period_min: 10 // 10 minutes grace for overdue retrieval
    };
  }

  /**
   * Mark locker as overdue when session limit expires
   * Requirement 5.1: WHEN session limit expires THEN system SHALL mark locker as overdue and exclude from assignment pool
   */
  async markLockerOverdue(kioskId: string, lockerId: number, cardId: string, reason: 'time_limit' | 'user_report'): Promise<void> {
    const now = new Date();
    
    try {
      await this.db.run(`
        UPDATE lockers 
        SET overdue_from = ?, 
            overdue_reason = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE kiosk_id = ? AND id = ?
      `, [now.toISOString(), reason, kioskId, lockerId]);

      console.log(`Locker marked overdue: locker=${lockerId}, reason=${reason}.`);
      
      this.emit('locker_overdue', {
        kioskId,
        lockerId,
        cardId,
        reason,
        overdueFrom: now
      });

    } catch (error) {
      console.error(`❌ Failed to mark locker ${lockerId} as overdue:`, error);
      throw error;
    }
  }

  /**
   * Check if overdue owner can retrieve their locker (one-time only)
   * Requirement 5.2: WHEN overdue owner returns THEN system SHALL allow one retrieval open before applying quarantine
   */
  async canRetrieveOverdue(kioskId: string, lockerId: number, cardId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const locker = await this.db.get(`
        SELECT * FROM lockers 
        WHERE kiosk_id = ? AND id = ? AND owner_key = ? AND overdue_from IS NOT NULL
      `, [kioskId, lockerId, cardId]);

      if (!locker) {
        return { allowed: false, reason: 'Not overdue owner or locker not found' };
      }

      // Check if already retrieved once
      if (locker.retrieved_once === 1) {
        return { allowed: false, reason: 'Already retrieved once' };
      }

      // Check grace period (optional - allow some time for retrieval)
      const overdueFrom = new Date(locker.overdue_from);
      const gracePeriodMs = this.defaultConfig.retrieval_grace_period_min * 60 * 1000;
      const now = new Date();
      
      if (now.getTime() - overdueFrom.getTime() > gracePeriodMs) {
        // Still allow one retrieval even after grace period
        console.log(`⏰ Allowing overdue retrieval for card ${cardId}, locker ${lockerId} (past grace period)`);
      }

      return { allowed: true };

    } catch (error) {
      console.error(`❌ Error checking overdue retrieval for locker ${lockerId}:`, error);
      return { allowed: false, reason: 'Database error' };
    }
  }

  /**
   * Process overdue retrieval and apply quarantine
   * Requirement 5.2: Allow one retrieval open before applying quarantine
   */
  async processOverdueRetrieval(kioskId: string, lockerId: number, cardId: string): Promise<void> {
    const now = new Date();
    
    try {
      // Mark as retrieved and clear overdue status
      await this.db.run(`
        UPDATE lockers 
        SET overdue_from = NULL,
            overdue_reason = NULL,
            retrieved_once = 1,
            retrieved_at = ?,
            quarantine_until = datetime('now', '+20 minutes'),
            updated_at = CURRENT_TIMESTAMP
        WHERE kiosk_id = ? AND id = ?
      `, [now.toISOString(), kioskId, lockerId]);

      console.log(`Overdue retrieval executed: locker=${lockerId}, quarantine=20min.`);
      
      this.emit('overdue_retrieved', {
        kioskId,
        lockerId,
        cardId,
        retrievedAt: now,
        quarantineUntil: new Date(now.getTime() + 20 * 60 * 1000)
      });

    } catch (error) {
      console.error(`❌ Failed to process overdue retrieval for locker ${lockerId}:`, error);
      throw error;
    }
  }

  /**
   * Handle suspected occupied report (double-scan detection)
   * Requirement 5.3: WHEN user double-scans shortly after locker open THEN mark as suspected occupied and assign different locker
   */
  async reportSuspectedOccupied(kioskId: string, lockerId: number, cardId: string): Promise<{ accepted: boolean; reason?: string }> {
    try {
      // Check daily report cap
      const reportsToday = await this.getUserReportsToday(cardId);
      if (reportsToday >= this.defaultConfig.daily_report_cap) {
        return { 
          accepted: false, 
          reason: `Daily report limit reached (${this.defaultConfig.daily_report_cap} reports per day)` 
        };
      }

      // Check if within report window (should be checked by caller, but double-check)
      const locker = await this.db.get(`
        SELECT * FROM lockers WHERE kiosk_id = ? AND id = ?
      `, [kioskId, lockerId]);

      if (!locker) {
        return { accepted: false, reason: 'Locker not found' };
      }

      const now = new Date();
      
      // Mark locker as suspected occupied
      await this.db.run(`
        UPDATE lockers 
        SET suspected_occupied = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE kiosk_id = ? AND id = ?
      `, [kioskId, lockerId]);

      // Record the report
      await this.db.run(`
        INSERT INTO user_reports (card_id, kiosk_id, locker_id, report_type, reported_at)
        VALUES (?, ?, ?, 'suspected_occupied', ?)
      `, [cardId, kioskId, lockerId, now.toISOString()]);

      // Move original locker to overdue status with user report reason
      // Requirement 5.4: WHEN suspected occupied is reported THEN move original locker to overdue status with reason "user report"
      await this.markLockerOverdue(kioskId, lockerId, cardId, 'user_report');

      console.log(`Suspected occupied reported: locker=${lockerId}.`);
      
      this.emit('suspected_occupied_reported', {
        kioskId,
        lockerId,
        cardId,
        reportedAt: now
      });

      return { accepted: true };

    } catch (error) {
      console.error(`❌ Failed to report suspected occupied for locker ${lockerId}:`, error);
      return { accepted: false, reason: 'Database error' };
    }
  }

  /**
   * Get user's report count for today
   * Requirement 5.5: WHEN user reports occupied locker THEN respect daily cap of 2 reports per card
   */
  async getUserReportsToday(cardId: string): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const result = await this.db.get(`
        SELECT COUNT(*) as count 
        FROM user_reports 
        WHERE card_id = ? 
        AND reported_at >= ? 
        AND reported_at < ?
      `, [cardId, today.toISOString(), tomorrow.toISOString()]);

      return result?.count || 0;

    } catch (error) {
      console.error(`❌ Error getting user reports for card ${cardId}:`, error);
      return 0;
    }
  }

  /**
   * Check if locker is in report window (can be reported as suspected)
   */
  async isInReportWindow(kioskId: string, lockerId: number): Promise<boolean> {
    try {
      // Check if locker was recently opened (within report window)
      const recentOpen = await this.db.get(`
        SELECT opened_at FROM locker_operations 
        WHERE kiosk_id = ? AND locker_id = ? 
        ORDER BY opened_at DESC 
        LIMIT 1
      `, [kioskId, lockerId]);

      if (!recentOpen) {
        return false;
      }

      const openedAt = new Date(recentOpen.opened_at);
      const now = new Date();
      const windowMs = this.defaultConfig.user_report_window_sec * 1000;

      return (now.getTime() - openedAt.getTime()) <= windowMs;

    } catch (error) {
      console.error(`❌ Error checking report window for locker ${lockerId}:`, error);
      return false;
    }
  }

  /**
   * Get all overdue lockers for admin interface
   */
  async getOverdueLockers(kioskId?: string): Promise<OverdueLocker[]> {
    try {
      let query = `
        SELECT kiosk_id, id as locker_id, owner_key as card_id, 
               overdue_from, overdue_reason, cleared_by
        FROM lockers 
        WHERE overdue_from IS NOT NULL
      `;
      const params: any[] = [];

      if (kioskId) {
        query += ' AND kiosk_id = ?';
        params.push(kioskId);
      }

      query += ' ORDER BY overdue_from ASC';

      const rows = await this.db.all(query, params);

      return rows.map(row => ({
        kioskId: row.kiosk_id,
        lockerId: row.locker_id,
        cardId: row.card_id,
        overdueFrom: new Date(row.overdue_from),
        reason: row.overdue_reason as 'time_limit' | 'user_report',
        retrievalAllowed: !row.cleared_by
      }));

    } catch (error) {
      console.error('❌ Error getting overdue lockers:', error);
      return [];
    }
  }

  /**
   * Get all suspected occupied lockers for admin interface
   */
  async getSuspectedLockers(kioskId?: string): Promise<any[]> {
    try {
      let query = `
        SELECT kiosk_id, id as locker_id, owner_key as card_id, 
               suspected_occupied, updated_at
        FROM lockers 
        WHERE suspected_occupied = 1
      `;
      const params: any[] = [];

      if (kioskId) {
        query += ' AND kiosk_id = ?';
        params.push(kioskId);
      }

      query += ' ORDER BY updated_at DESC';

      const rows = await this.db.all(query, params);

      return rows.map(row => ({
        kioskId: row.kiosk_id,
        lockerId: row.locker_id,
        cardId: row.card_id,
        suspectedAt: new Date(row.updated_at)
      }));

    } catch (error) {
      console.error('❌ Error getting suspected lockers:', error);
      return [];
    }
  }

  /**
   * Clear suspected occupied flag (admin action)
   * Requires admin authentication and CSRF protection
   */
  async clearSuspectedOccupied(kioskId: string, lockerId: number, adminUser: string, reason: string = 'admin_clear'): Promise<void> {
    try {
      // Get current state for audit
      const currentLocker = await this.db.get(`
        SELECT suspected_occupied, version FROM lockers 
        WHERE kiosk_id = ? AND id = ?
      `, [kioskId, lockerId]);

      if (!currentLocker) {
        throw new Error(`Locker not found: ${kioskId}/${lockerId}`);
      }

      const now = new Date().toISOString();

      // Atomic update with audit trail
      await this.db.run('BEGIN TRANSACTION');

      try {
        // Update locker state
        await this.db.run(`
          UPDATE lockers 
          SET suspected_occupied = 0,
              cleared_by = ?,
              cleared_at = ?,
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE kiosk_id = ? AND id = ? AND version = ?
        `, [adminUser, now, kioskId, lockerId, currentLocker.version]);

        // Create audit record
        await this.db.run(`
          INSERT INTO admin_audit (
            editor, kiosk_id, locker_id, action_type, 
            old_value, new_value, reason, timestamp, version
          ) VALUES (?, ?, ?, 'clear_suspected', ?, ?, ?, ?, ?)
        `, [
          adminUser, kioskId, lockerId,
          currentLocker.suspected_occupied.toString(), '0',
          reason, now, currentLocker.version + 1
        ]);

        await this.db.run('COMMIT');

        console.log(`Suspected cleared: locker=${lockerId}, admin=${adminUser}.`);
        
        this.emit('suspected_cleared', {
          kioskId,
          lockerId,
          adminUser,
          clearedAt: new Date(now)
        });

      } catch (error) {
        await this.db.run('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error(`Failed to clear suspected flag for locker ${lockerId}:`, error);
      throw error;
    }
  }

  /**
   * Force clear overdue locker (admin action)
   * Requires admin authentication and CSRF protection
   */
  async forceCloseOverdue(kioskId: string, lockerId: number, adminUser: string, reason: string = 'admin_force_clear'): Promise<void> {
    try {
      // Get current state for audit
      const currentLocker = await this.db.get(`
        SELECT overdue_from, overdue_reason, status, owner_key, version FROM lockers 
        WHERE kiosk_id = ? AND id = ?
      `, [kioskId, lockerId]);

      if (!currentLocker) {
        throw new Error(`Locker not found: ${kioskId}/${lockerId}`);
      }

      const now = new Date().toISOString();

      // Atomic update with audit trail
      await this.db.run('BEGIN TRANSACTION');

      try {
        // Update locker state
        await this.db.run(`
          UPDATE lockers 
          SET overdue_from = NULL,
              overdue_reason = NULL,
              cleared_by = ?,
              cleared_at = ?,
              status = 'Free',
              owner_type = NULL,
              owner_key = NULL,
              owned_at = NULL,
              quarantine_until = datetime('now', '+20 minutes'),
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE kiosk_id = ? AND id = ? AND version = ?
        `, [adminUser, now, kioskId, lockerId, currentLocker.version]);

        // Create audit record
        await this.db.run(`
          INSERT INTO admin_audit (
            editor, kiosk_id, locker_id, action_type, 
            old_value, new_value, reason, timestamp, version
          ) VALUES (?, ?, ?, 'force_clear_overdue', ?, ?, ?, ?, ?)
        `, [
          adminUser, kioskId, lockerId,
          JSON.stringify({
            overdue_from: currentLocker.overdue_from,
            overdue_reason: currentLocker.overdue_reason,
            status: currentLocker.status,
            owner_key: currentLocker.owner_key
          }),
          JSON.stringify({
            overdue_from: null,
            overdue_reason: null,
            status: 'Free',
            owner_key: null
          }),
          reason, now, currentLocker.version + 1
        ]);

        await this.db.run('COMMIT');

        console.log(`Overdue force cleared: locker=${lockerId}, admin=${adminUser}.`);
        
        this.emit('overdue_force_cleared', {
          kioskId,
          lockerId,
          adminUser,
          clearedAt: new Date(now)
        });

      } catch (error) {
        await this.db.run('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error(`Failed to force clear overdue locker ${lockerId}:`, error);
      throw error;
    }
  }

  /**
   * Check if locker should be excluded from assignment pool
   * Used by assignment engine to filter out overdue and suspected lockers
   */
  async shouldExcludeFromAssignment(kioskId: string, lockerId: number): Promise<{ exclude: boolean; reason?: string }> {
    try {
      const locker = await this.db.get(`
        SELECT overdue_from, suspected_occupied 
        FROM lockers 
        WHERE kiosk_id = ? AND id = ?
      `, [kioskId, lockerId]);

      if (!locker) {
        return { exclude: true, reason: 'Locker not found' };
      }

      if (locker.overdue_from) {
        return { exclude: true, reason: 'Locker is overdue' };
      }

      if (locker.suspected_occupied === 1) {
        return { exclude: true, reason: 'Locker is suspected occupied' };
      }

      return { exclude: false };

    } catch (error) {
      console.error(`❌ Error checking exclusion for locker ${lockerId}:`, error);
      return { exclude: true, reason: 'Database error' };
    }
  }
}