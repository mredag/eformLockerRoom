/**
 * Smart Session Manager for Smart Locker Assignment
 * Implements requirements 16.1, 16.2, 16.3, 16.4, 16.5 for session extension management
 * 
 * Features:
 * - Config-driven session limits (180 minutes default)
 * - Session extension in 60-minute increments
 * - Maximum 240-minute total session time (4 extensions)
 * - Overdue session detection and marking
 * - Administrator audit logging for extensions
 * - Database persistence for session state
 */

import { EventEmitter } from 'events';
import { DatabaseManager } from './database-manager';
import { ConfigurationManager } from './configuration-manager';

export interface SmartSession {
  id: string;
  cardId: string;
  kioskId: string;
  lockerId?: number;
  startTime: Date;
  limitTime: Date;
  extendedTime?: Date;
  expiresTime: Date;
  status: 'active' | 'overdue' | 'completed' | 'cancelled';
  lastSeen: Date;
  extensionCount: number;
  maxExtensions: number; // Maximum 4 extensions (4 × 60min = 240min total)
}

export interface SessionExtensionAudit {
  sessionId: string;
  adminUser: string;
  extensionMinutes: number;
  totalMinutes: number;
  reason: string;
  timestamp: Date;
}

export interface SmartSessionConfig {
  sessionLimitMinutes: number; // Default 180 minutes
  extensionIncrementMinutes: number; // 60 minutes
  maxTotalMinutes: number; // 240 minutes maximum
  overdueCheckIntervalMs: number; // How often to check for overdue sessions
  cleanupIntervalMs: number; // How often to clean up old sessions
}

export type SessionOutcome = 'completed' | 'timeout' | 'cancelled' | 'overdue';

export class SmartSessionManager extends EventEmitter {
  private db: DatabaseManager;
  private config: ConfigurationManager;
  private overdueTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private defaultConfig: SmartSessionConfig;

  constructor(db: DatabaseManager, config: ConfigurationManager) {
    super();
    this.db = db;
    this.config = config;
    
    this.defaultConfig = {
      sessionLimitMinutes: 180, // 3 hours default
      extensionIncrementMinutes: 60, // 1 hour increments
      maxTotalMinutes: 240, // 4 hours maximum
      overdueCheckIntervalMs: 30000, // Check every 30 seconds
      cleanupIntervalMs: 300000 // Clean up every 5 minutes
    };

    this.startOverdueMonitoring();
    this.startCleanupTimer();
  }

  /**
   * Create a new smart session for a card and kiosk
   * Uses config-driven session limit (default 180 minutes)
   */
  async createSmartSession(cardId: string, kioskId: string): Promise<SmartSession> {
    // Get effective configuration for this kiosk
    const effectiveConfig = await this.config.getEffectiveConfig(kioskId);
    const sessionLimitMinutes = effectiveConfig.session_limit_minutes || this.defaultConfig.sessionLimitMinutes;

    // Cancel any existing active session for this card
    const existingSession = await this.getActiveSession(cardId);
    if (existingSession) {
      await this.completeSession(existingSession.id, 'cancelled');
    }

    // Create new session
    const sessionId = this.generateSessionId(cardId, kioskId);
    const now = new Date();
    const limitTime = new Date(now.getTime() + (sessionLimitMinutes * 60 * 1000));
    
    const session: SmartSession = {
      id: sessionId,
      cardId,
      kioskId,
      startTime: now,
      limitTime,
      expiresTime: limitTime,
      status: 'active',
      lastSeen: now,
      extensionCount: 0,
      maxExtensions: 4 // Maximum 4 × 60min = 240min total
    };

    // Insert into database
    await this.db.run(`
      INSERT INTO smart_sessions (
        id, card_id, kiosk_id, start_time, limit_time, expires_time,
        status, last_seen, extension_count, max_extensions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      session.id,
      session.cardId,
      session.kioskId,
      session.startTime.toISOString(),
      session.limitTime.toISOString(),
      session.expiresTime.toISOString(),
      session.status,
      session.lastSeen.toISOString(),
      session.extensionCount,
      session.maxExtensions,
      now.toISOString(),
      now.toISOString()
    ]);

    console.log(`🔑 Created smart session ${sessionId} for card ${cardId} on kiosk ${kioskId} (limit: ${sessionLimitMinutes}min)`);
    
    this.emit('session_created', { session });
    return session;
  }

  /**
   * Update session with new information (locker assignment, last seen, etc.)
   */
  async updateSession(sessionId: string, updates: Partial<SmartSession>): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Build update query dynamically based on provided updates
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (updates.lockerId !== undefined) {
      updateFields.push('locker_id = ?');
      updateValues.push(updates.lockerId);
    }

    if (updates.status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(updates.status);
    }

    if (updates.lastSeen !== undefined) {
      updateFields.push('last_seen = ?');
      updateValues.push(updates.lastSeen.toISOString());
    }

    if (updates.extendedTime !== undefined) {
      updateFields.push('extended_time = ?');
      updateValues.push(updates.extendedTime.toISOString());
    }

    if (updates.expiresTime !== undefined) {
      updateFields.push('expires_time = ?');
      updateValues.push(updates.expiresTime.toISOString());
    }

    if (updates.extensionCount !== undefined) {
      updateFields.push('extension_count = ?');
      updateValues.push(updates.extensionCount);
    }

    if (updateFields.length === 0) {
      return; // No updates to apply
    }

    // Always update the updated_at timestamp
    updateFields.push('updated_at = ?');
    updateValues.push(new Date().toISOString());

    // Add session ID for WHERE clause
    updateValues.push(sessionId);

    await this.db.run(`
      UPDATE smart_sessions 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `, updateValues);

    console.log(`📝 Updated session ${sessionId} with fields: ${updateFields.join(', ')}`);
  }

  /**
   * Complete a session with specified outcome
   */
  async completeSession(sessionId: string, outcome: SessionOutcome): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const finalStatus = outcome === 'timeout' ? 'overdue' : 
                       outcome === 'overdue' ? 'overdue' : 
                       outcome === 'cancelled' ? 'cancelled' : 'completed';

    await this.updateSession(sessionId, {
      status: finalStatus as any,
      lastSeen: new Date()
    });

    console.log(`✅ Completed session ${sessionId} with outcome: ${outcome}`);
    this.emit('session_completed', { sessionId, outcome, session });
  }

  /**
   * Get active session for a card
   */
  async getActiveSession(cardId: string): Promise<SmartSession | null> {
    const row = await this.db.get(`
      SELECT * FROM smart_sessions 
      WHERE card_id = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `, [cardId]);

    return row ? this.mapRowToSession(row) : null;
  }

  /**
   * Get session for a specific kiosk
   */
  async getKioskSession(kioskId: string): Promise<SmartSession | null> {
    const row = await this.db.get(`
      SELECT * FROM smart_sessions 
      WHERE kiosk_id = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `, [kioskId]);

    return row ? this.mapRowToSession(row) : null;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SmartSession | null> {
    const row = await this.db.get(`
      SELECT * FROM smart_sessions 
      WHERE id = ?
    `, [sessionId]);

    return row ? this.mapRowToSession(row) : null;
  }

  /**
   * Get all overdue sessions
   */
  async getOverdueSessions(): Promise<SmartSession[]> {
    const rows = await this.db.all(`
      SELECT * FROM smart_sessions 
      WHERE status = 'overdue'
      ORDER BY expires_time ASC
    `);

    return rows.map(row => this.mapRowToSession(row));
  }

  /**
   * Extend session by 60 minutes (requirement 16.1, 16.2, 16.3, 16.4, 16.5)
   * - Adds exactly 60 minutes to current expiration time
   * - Prevents extensions beyond 240 minutes total
   * - Requires administrator authorization
   * - Creates audit record
   */
  async extendSession(sessionId: string, adminUser: string, reason: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      console.log(`❌ Cannot extend session ${sessionId}: session not found`);
      return false;
    }

    if (session.status !== 'active') {
      console.log(`❌ Cannot extend session ${sessionId}: session not active (status: ${session.status})`);
      return false;
    }

    // Check if session has reached maximum extensions (240 minutes total)
    const totalMinutes = this.calculateTotalSessionMinutes(session);
    if (totalMinutes >= this.defaultConfig.maxTotalMinutes) {
      console.log(`❌ Cannot extend session ${sessionId}: maximum 240 minutes reached (current: ${totalMinutes}min)`);
      return false;
    }

    // Check if another extension would exceed the limit
    if (totalMinutes + this.defaultConfig.extensionIncrementMinutes > this.defaultConfig.maxTotalMinutes) {
      console.log(`❌ Cannot extend session ${sessionId}: would exceed 240 minute limit`);
      return false;
    }

    // Add exactly 60 minutes to current expiration time (requirement 16.1)
    const newExpiresTime = new Date(session.expiresTime.getTime() + (this.defaultConfig.extensionIncrementMinutes * 60 * 1000));
    const newExtensionCount = session.extensionCount + 1;
    const newTotalMinutes = totalMinutes + this.defaultConfig.extensionIncrementMinutes;

    // Update session
    await this.updateSession(sessionId, {
      expiresTime: newExpiresTime,
      extendedTime: new Date(),
      extensionCount: newExtensionCount,
      lastSeen: new Date()
    });

    // Create mandatory audit record (requirement 16.4)
    await this.createExtensionAudit({
      sessionId,
      adminUser,
      extensionMinutes: this.defaultConfig.extensionIncrementMinutes,
      totalMinutes: newTotalMinutes,
      reason,
      timestamp: new Date()
    });

    // Log the extension (requirement from task acceptance criteria)
    console.log(`Session extended: +60min, total=${newTotalMinutes}min`);
    console.log(`⏰ Extended session ${sessionId} by ${this.defaultConfig.extensionIncrementMinutes} minutes (total: ${newTotalMinutes}min, admin: ${adminUser})`);

    this.emit('session_extended', { 
      sessionId, 
      adminUser, 
      extensionMinutes: this.defaultConfig.extensionIncrementMinutes,
      totalMinutes: newTotalMinutes,
      reason 
    });

    return true;
  }

  /**
   * Mark session as overdue
   */
  async markOverdue(sessionId: string): Promise<void> {
    await this.updateSession(sessionId, {
      status: 'overdue' as any,
      lastSeen: new Date()
    });

    console.log(`⏰ Marked session ${sessionId} as overdue`);
    this.emit('session_overdue', { sessionId });
  }

  /**
   * Get remaining time for a session in minutes
   */
  getRemainingMinutes(session: SmartSession): number {
    if (session.status !== 'active') {
      return 0;
    }

    const now = new Date();
    const remaining = session.expiresTime.getTime() - now.getTime();
    return Math.max(0, Math.ceil(remaining / (60 * 1000)));
  }

  /**
   * Check if session can be extended
   */
  canExtendSession(session: SmartSession): boolean {
    if (session.status !== 'active') {
      return false;
    }

    const totalMinutes = this.calculateTotalSessionMinutes(session);
    return totalMinutes < this.defaultConfig.maxTotalMinutes;
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    total: number;
    active: number;
    overdue: number;
    completed: number;
    cancelled: number;
  }> {
    const stats = await this.db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM smart_sessions
      WHERE created_at > datetime('now', '-24 hours')
    `);

    return {
      total: stats.total || 0,
      active: stats.active || 0,
      overdue: stats.overdue || 0,
      completed: stats.completed || 0,
      cancelled: stats.cancelled || 0
    };
  }

  /**
   * Shutdown the session manager
   */
  shutdown(): void {
    if (this.overdueTimer) {
      clearInterval(this.overdueTimer);
      this.overdueTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    console.log('🛑 Smart session manager shutdown complete');
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(cardId: string, kioskId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `smart-session-${kioskId}-${cardId.substring(0, 8)}-${timestamp}-${random}`;
  }

  /**
   * Calculate total session time in minutes including extensions
   */
  private calculateTotalSessionMinutes(session: SmartSession): number {
    const sessionDuration = session.expiresTime.getTime() - session.startTime.getTime();
    return Math.ceil(sessionDuration / (60 * 1000));
  }

  /**
   * Map database row to SmartSession object
   */
  private mapRowToSession(row: any): SmartSession {
    return {
      id: row.id,
      cardId: row.card_id,
      kioskId: row.kiosk_id,
      lockerId: row.locker_id || undefined,
      startTime: new Date(row.start_time),
      limitTime: new Date(row.limit_time),
      extendedTime: row.extended_time ? new Date(row.extended_time) : undefined,
      expiresTime: new Date(row.expires_time),
      status: row.status,
      lastSeen: new Date(row.last_seen),
      extensionCount: row.extension_count || 0,
      maxExtensions: row.max_extensions || 4
    };
  }

  /**
   * Create audit record for session extension
   */
  private async createExtensionAudit(audit: SessionExtensionAudit): Promise<void> {
    await this.db.run(`
      INSERT INTO session_extension_audit (
        session_id, admin_user, extension_minutes, total_minutes, 
        reason, timestamp, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      audit.sessionId,
      audit.adminUser,
      audit.extensionMinutes,
      audit.totalMinutes,
      audit.reason,
      audit.timestamp.toISOString(),
      new Date().toISOString()
    ]);
  }

  /**
   * Start monitoring for overdue sessions
   */
  private startOverdueMonitoring(): void {
    this.overdueTimer = setInterval(async () => {
      try {
        await this.checkForOverdueSessions();
      } catch (error) {
        console.error('Error checking for overdue sessions:', error);
      }
    }, this.defaultConfig.overdueCheckIntervalMs);
  }

  /**
   * Check for sessions that have exceeded their time limit
   */
  private async checkForOverdueSessions(): Promise<void> {
    const now = new Date();
    
    const overdueSessions = await this.db.all(`
      SELECT * FROM smart_sessions 
      WHERE status = 'active' AND expires_time < ?
    `, [now.toISOString()]);

    for (const row of overdueSessions) {
      const session = this.mapRowToSession(row);
      await this.markOverdue(session.id);
    }

    if (overdueSessions.length > 0) {
      console.log(`⏰ Marked ${overdueSessions.length} sessions as overdue`);
    }
  }

  /**
   * Start periodic cleanup of old sessions
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupOldSessions();
      } catch (error) {
        console.error('Error cleaning up old sessions:', error);
      }
    }, this.defaultConfig.cleanupIntervalMs);
  }

  /**
   * Clean up old completed/cancelled sessions (keep for 24 hours)
   */
  private async cleanupOldSessions(): Promise<void> {
    const cutoffTime = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours ago

    const result = await this.db.run(`
      DELETE FROM smart_sessions 
      WHERE status IN ('completed', 'cancelled') 
      AND updated_at < ?
    `, [cutoffTime.toISOString()]);

    if (result.changes && result.changes > 0) {
      console.log(`🧹 Cleaned up ${result.changes} old sessions`);
    }
  }
}