/**
 * Session Manager for Kiosk RFID Sessions
 * Implements requirements 1.1, 1.2, 1.4, 1.5 for session management
 * Enhanced with smart assignment session tracking (Requirements 16.1-16.5)
 * 
 * Features:
 * - 20-second countdown timer with LARGE badge display (manual mode)
 * - Config-driven session limits (180 minutes for smart assignment)
 * - One-session-per-kiosk rule with session cancellation
 * - Session cleanup and timeout handling
 * - Turkish language support for messages
 * - Performance monitoring integration (Requirements 8.1-8.4)
 * - Smart session integration with extension support
 */

import { EventEmitter } from 'events';
import { SmartSessionManager, SmartSession } from '../../../shared/services/smart-session-manager';
import { ConfigurationManager } from '../../../shared/services/configuration-manager';
import { DatabaseManager } from '../../../shared/services/database-manager';

export interface RfidSession {
  id: string;
  kioskId: string;
  cardId: string;
  startTime: Date;
  timeoutSeconds: number;
  status: 'active' | 'expired' | 'completed' | 'cancelled';
  availableLockers?: number[];
  selectedLockerId?: number;
  timeToSelection?: number; // Time in seconds from session start to locker selection
}

export interface SessionManagerConfig {
  defaultTimeoutSeconds: number;
  cleanupIntervalMs: number;
  maxSessionsPerKiosk: number;
}

export interface SessionEvent {
  type: 'session_created' | 'session_expired' | 'session_cancelled' | 'session_completed' | 'countdown_update';
  sessionId: string;
  data?: any;
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, RfidSession> = new Map();
  private kioskSessions: Map<string, string> = new Map(); // kioskId -> sessionId
  private countdownTimers: Map<string, NodeJS.Timeout> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private config: SessionManagerConfig;
  private performanceReportingEnabled: boolean = true;
  private smartSessionManager: SmartSessionManager | null = null;
  private configManager: ConfigurationManager | null = null;

  constructor(
    config: Partial<SessionManagerConfig> = {},
    smartSessionManager?: SmartSessionManager,
    configManager?: ConfigurationManager
  ) {
    super();
    
    this.config = {
      defaultTimeoutSeconds: 30, // 30 seconds as per updated requirements
      cleanupIntervalMs: 5000, // Clean up every 5 seconds
      maxSessionsPerKiosk: 1, // One session per kiosk rule
      ...config
    };

    this.smartSessionManager = smartSessionManager || null;
    this.configManager = configManager || null;

    this.startCleanupTimer();
  }

  /**
   * Create a new RFID session for a kiosk
   * Implements one-session-per-kiosk rule by cancelling existing sessions
   * Integrates with smart session manager when smart assignment is enabled
   */
  async createSession(kioskId: string, cardId: string, availableLockers?: number[]): Promise<RfidSession> {
    // Check if smart assignment is enabled for this kiosk
    const isSmartAssignmentEnabled = await this.isSmartAssignmentEnabled(kioskId);
    
    if (isSmartAssignmentEnabled && this.smartSessionManager) {
      // Create smart session instead of regular session
      const smartSession = await this.smartSessionManager.createSmartSession(cardId, kioskId);
      
      // Convert smart session to RFID session format for backward compatibility
      const rfidSession: RfidSession = {
        id: smartSession.id,
        kioskId: smartSession.kioskId,
        cardId: smartSession.cardId,
        startTime: smartSession.startTime,
        timeoutSeconds: this.getRemainingMinutes(smartSession) * 60, // Convert minutes to seconds
        status: smartSession.status as any,
        availableLockers
      };

      console.log(`🔑 Created smart session ${smartSession.id} for card ${cardId} on kiosk ${kioskId} (${this.getRemainingMinutes(smartSession)}min limit)`);
      
      this.emit('session_created', {
        type: 'session_created',
        sessionId: smartSession.id,
        data: {
          session: rfidSession,
          message: 'Kart okundu. Akıllı atama aktif',
          timeoutSeconds: rfidSession.timeoutSeconds,
          isSmartSession: true
        }
      });

      return rfidSession;
    }

    // Fall back to regular session management for manual mode
    return this.createRegularSession(kioskId, cardId, availableLockers);
  }

  /**
   * Create a regular RFID session (manual mode)
   */
  private createRegularSession(kioskId: string, cardId: string, availableLockers?: number[]): RfidSession {
    // Cancel any existing session for this kiosk (one-session-per-kiosk rule)
    const existingSessionId = this.kioskSessions.get(kioskId);
    if (existingSessionId) {
      await this.cancelSession(existingSessionId, 'Yeni kart okundu. Önceki oturum kapatıldı.');
    }

    // Create new session
    const sessionId = this.generateSessionId(kioskId, cardId);
    const session: RfidSession = {
      id: sessionId,
      kioskId,
      cardId,
      startTime: new Date(),
      timeoutSeconds: this.config.defaultTimeoutSeconds,
      status: 'active',
      availableLockers
    };

    // Store session
    this.sessions.set(sessionId, session);
    this.kioskSessions.set(kioskId, sessionId);

    // Start countdown timer
    this.startCountdownTimer(sessionId);

    // Report session start to performance monitor
    this.reportSessionStart(sessionId, kioskId, cardId);

    // Emit session created event
    this.emit('session_created', {
      type: 'session_created',
      sessionId,
      data: {
        session,
        message: 'Kart okundu. Seçim için dokunun',
        timeoutSeconds: this.config.defaultTimeoutSeconds
      }
    });

    console.log(`🔑 Created session ${sessionId} for card ${cardId} on kiosk ${kioskId}`);
    return session;
  }

  /**
   * Get active session for a kiosk
   * Checks both regular sessions and smart sessions
   */
  async getKioskSession(kioskId: string): Promise<RfidSession | null> {
    // Check smart sessions first if smart assignment is enabled
    const isSmartAssignmentEnabled = await this.isSmartAssignmentEnabled(kioskId);
    
    if (isSmartAssignmentEnabled && this.smartSessionManager) {
      const smartSession = await this.smartSessionManager.getKioskSession(kioskId);
      if (smartSession) {
        return this.convertSmartSessionToRfid(smartSession);
      }
    }

    // Fall back to regular session
    return this.getRegularKioskSession(kioskId);
  }

  /**
   * Get regular kiosk session (manual mode)
   */
  private getRegularKioskSession(kioskId: string): RfidSession | null {
    const sessionId = this.kioskSessions.get(kioskId);
    if (!sessionId) return null;

    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      this.kioskSessions.delete(kioskId);
      return null;
    }

    return session;
  }

  /**
   * Get session by ID
   * Checks both regular sessions and smart sessions
   */
  async getSession(sessionId: string): Promise<RfidSession | null> {
    // Check smart sessions first
    if (this.smartSessionManager) {
      const smartSession = await this.smartSessionManager.getSession(sessionId);
      if (smartSession) {
        return this.convertSmartSessionToRfid(smartSession);
      }
    }

    // Fall back to regular session
    return this.getRegularSession(sessionId);
  }

  /**
   * Get regular session by ID
   */
  private getRegularSession(sessionId: string): RfidSession | null {
    const session = this.sessions.get(sessionId);
    return session && session.status === 'active' ? session : null;
  }

  /**
   * Complete a session (when locker is selected)
   * Handles both regular sessions and smart sessions
   */
  async completeSession(sessionId: string, selectedLockerId?: number): Promise<boolean> {
    // Check if this is a smart session
    if (this.smartSessionManager) {
      const smartSession = await this.smartSessionManager.getSession(sessionId);
      if (smartSession) {
        // Update smart session with locker assignment if provided
        if (selectedLockerId) {
          await this.smartSessionManager.updateSession(sessionId, { 
            lockerId: selectedLockerId,
            lastSeen: new Date()
          });
        }
        
        await this.smartSessionManager.completeSession(sessionId, 'completed');
        console.log(`✅ Completed smart session ${sessionId} (locker: ${selectedLockerId})`);
        
        this.emit('session_completed', {
          type: 'session_completed',
          sessionId,
          data: {
            session: this.convertSmartSessionToRfid(smartSession),
            message: 'Oturum tamamlandı'
          }
        });
        
        return true;
      }
    }

    // Fall back to regular session completion
    return this.completeRegularSession(sessionId, selectedLockerId);
  }

  /**
   * Complete a regular session
   */
  private completeRegularSession(sessionId: string, selectedLockerId?: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return false;
    }

    // Calculate time to selection
    const timeToSelection = (Date.now() - session.startTime.getTime()) / 1000;
    
    // Update session with selection info
    session.selectedLockerId = selectedLockerId;
    session.timeToSelection = timeToSelection;
    session.status = 'completed';

    // Report session completion to performance monitor
    this.reportSessionEnd(sessionId, 'completed', selectedLockerId, timeToSelection);

    // Clear countdown timer
    this.clearCountdownTimer(sessionId);

    // Remove from kiosk mapping
    this.kioskSessions.delete(session.kioskId);

    // Emit completion event
    this.emit('session_completed', {
      type: 'session_completed',
      sessionId,
      data: {
        session,
        message: 'Oturum tamamlandı'
      }
    });

    console.log(`✅ Completed session ${sessionId} (locker: ${selectedLockerId}, time: ${timeToSelection.toFixed(1)}s)`);
    return true;
  }

  /**
   * Cancel a session (when new card is scanned or manual cancellation)
   * Handles both regular sessions and smart sessions
   */
  async cancelSession(sessionId: string, reason: string = 'Oturum iptal edildi'): Promise<boolean> {
    // Check if this is a smart session
    if (this.smartSessionManager) {
      const smartSession = await this.smartSessionManager.getSession(sessionId);
      if (smartSession) {
        await this.smartSessionManager.completeSession(sessionId, 'cancelled');
        console.log(`❌ Cancelled smart session ${sessionId}: ${reason}`);
        
        this.emit('session_cancelled', {
          type: 'session_cancelled',
          sessionId,
          data: {
            session: this.convertSmartSessionToRfid(smartSession),
            reason,
            message: reason
          }
        });
        
        return true;
      }
    }

    // Fall back to regular session cancellation
    return this.cancelRegularSession(sessionId, reason);
  }

  /**
   * Cancel a regular session
   */
  private cancelRegularSession(sessionId: string, reason: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return false;
    }

    // Update session status
    session.status = 'cancelled';

    // Report session cancellation to performance monitor
    this.reportSessionEnd(sessionId, 'cancelled');

    // Clear countdown timer
    this.clearCountdownTimer(sessionId);

    // Remove from kiosk mapping
    this.kioskSessions.delete(session.kioskId);

    // Emit cancellation event
    this.emit('session_cancelled', {
      type: 'session_cancelled',
      sessionId,
      data: {
        session,
        reason,
        message: reason
      }
    });

    console.log(`❌ Cancelled session ${sessionId}: ${reason}`);
    return true;
  }

  /**
   * Extend session timeout (if needed)
   */
  extendSession(sessionId: string, additionalSeconds: number = 20): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return false;
    }

    // Clear existing timer
    this.clearCountdownTimer(sessionId);

    // Update timeout
    session.timeoutSeconds = additionalSeconds;
    session.startTime = new Date(); // Reset start time

    // Start new countdown
    this.startCountdownTimer(sessionId);

    console.log(`⏰ Extended session ${sessionId} by ${additionalSeconds} seconds`);
    return true;
  }

  /**
   * Get remaining time for a session
   */
  getRemainingTime(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return 0;
    }

    const elapsed = (Date.now() - session.startTime.getTime()) / 1000;
    const remaining = Math.max(0, session.timeoutSeconds - elapsed);
    return Math.ceil(remaining);
  }

  /**
   * Get all active sessions (for debugging/monitoring)
   */
  getActiveSessions(): RfidSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    total: number;
    active: number;
    completed: number;
    expired: number;
    cancelled: number;
  } {
    const sessions = Array.from(this.sessions.values());
    return {
      total: sessions.length,
      active: sessions.filter(s => s.status === 'active').length,
      completed: sessions.filter(s => s.status === 'completed').length,
      expired: sessions.filter(s => s.status === 'expired').length,
      cancelled: sessions.filter(s => s.status === 'cancelled').length
    };
  }

  /**
   * Validate session ownership
   */
  validateSession(sessionId: string, cardId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.cardId === cardId && session?.status === 'active';
  }

  /**
   * Clear all sessions for a kiosk (emergency cleanup)
   */
  clearKioskSessions(kioskId: string): void {
    const sessionId = this.kioskSessions.get(kioskId);
    if (sessionId) {
      this.cancelSession(sessionId, 'Kiosk oturumları temizlendi');
    }
  }

  /**
   * Shutdown session manager
   */
  shutdown(): void {
    // Clear all timers
    this.countdownTimers.forEach(timer => clearInterval(timer));
    this.countdownTimers.clear();

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Cancel all active sessions
    this.getActiveSessions().forEach(session => {
      this.cancelSession(session.id, 'Sistem kapatılıyor');
    });

    console.log('🛑 Session manager shutdown complete');
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(kioskId: string, cardId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `session-${kioskId}-${cardId.substring(0, 8)}-${timestamp}-${random}`;
  }

  /**
   * Start countdown timer for a session
   */
  private startCountdownTimer(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    let remainingSeconds = session.timeoutSeconds;

    const timer = setInterval(() => {
      remainingSeconds--;

      // Emit countdown update
      this.emit('countdown_update', {
        type: 'countdown_update',
        sessionId,
        data: {
          remainingSeconds,
          session
        }
      });

      // Check if session expired
      if (remainingSeconds <= 0) {
        this.expireSession(sessionId);
      }
    }, 1000); // Update every second

    this.countdownTimers.set(sessionId, timer);
  }

  /**
   * Clear countdown timer for a session
   */
  private clearCountdownTimer(sessionId: string): void {
    const timer = this.countdownTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.countdownTimers.delete(sessionId);
    }
  }

  /**
   * Expire a session due to timeout
   */
  private expireSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return;
    }

    // Update session status
    session.status = 'expired';

    // Report session timeout to performance monitor
    this.reportSessionEnd(sessionId, 'timeout');

    // Clear countdown timer
    this.clearCountdownTimer(sessionId);

    // Remove from kiosk mapping
    this.kioskSessions.delete(session.kioskId);

    // Emit expiration event
    this.emit('session_expired', {
      type: 'session_expired',
      sessionId,
      data: {
        session,
        message: 'Oturum zaman aşımı'
      }
    });

    console.log(`⏰ Session ${sessionId} expired`);
  }

  /**
   * Start periodic cleanup of old sessions
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldSessions();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Clean up old completed/expired/cancelled sessions
   */
  private cleanupOldSessions(): void {
    const cutoffTime = Date.now() - (5 * 60 * 1000); // Keep sessions for 5 minutes
    const sessionsToDelete: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.status !== 'active' && session.startTime.getTime() < cutoffTime) {
        sessionsToDelete.push(sessionId);
      }
    }

    sessionsToDelete.forEach(sessionId => {
      this.sessions.delete(sessionId);
    });

    if (sessionsToDelete.length > 0) {
      console.log(`🧹 Cleaned up ${sessionsToDelete.length} old sessions`);
    }
  }

  /**
   * Report session start to performance monitoring system
   */
  private async reportSessionStart(sessionId: string, kioskId: string, cardId: string): Promise<void> {
    if (!this.performanceReportingEnabled) return;

    try {
      const panelUrl = process.env.PANEL_URL || 'http://127.0.0.1:3001';
      await fetch(`${panelUrl}/api/performance/session-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, kioskId, cardId })
      });
    } catch (error) {
      // Don't log errors for performance reporting to avoid noise
      // console.error('Performance reporting error (session start):', error);
    }
  }

  /**
   * Report session end to performance monitoring system
   */
  private async reportSessionEnd(
    sessionId: string, 
    outcome: 'completed' | 'timeout' | 'cancelled' | 'error',
    selectedLockerId?: number,
    timeToSelection?: number
  ): Promise<void> {
    if (!this.performanceReportingEnabled) return;

    try {
      const panelUrl = process.env.PANEL_URL || 'http://127.0.0.1:3001';
      await fetch(`${panelUrl}/api/performance/session-end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, outcome, selectedLockerId, timeToSelection })
      });
    } catch (error) {
      // Don't log errors for performance reporting to avoid noise
      // console.error('Performance reporting error (session end):', error);
    }
  }

  /**
   * Enable or disable performance reporting
   */
  setPerformanceReporting(enabled: boolean): void {
    this.performanceReportingEnabled = enabled;
    console.log(`📊 Performance reporting ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get smart session for a card (smart assignment mode)
   */
  async getSmartSession(cardId: string): Promise<SmartSession | null> {
    if (!this.smartSessionManager) {
      return null;
    }
    return await this.smartSessionManager.getActiveSession(cardId);
  }

  /**
   * Extend smart session (admin function)
   */
  async extendSmartSession(sessionId: string, adminUser: string, reason: string): Promise<boolean> {
    if (!this.smartSessionManager) {
      console.log(`❌ Cannot extend session ${sessionId}: smart session manager not available`);
      return false;
    }

    const success = await this.smartSessionManager.extendSession(sessionId, adminUser, reason);
    
    if (success) {
      this.emit('session_extended', { sessionId, adminUser, reason });
    }

    return success;
  }

  /**
   * Get remaining time for smart session in minutes
   */
  async getSmartSessionRemainingMinutes(sessionId: string): Promise<number> {
    if (!this.smartSessionManager) {
      return 0;
    }

    const session = await this.smartSessionManager.getSession(sessionId);
    if (!session) {
      return 0;
    }

    return this.smartSessionManager.getRemainingMinutes(session);
  }

  /**
   * Check if smart assignment is enabled for a kiosk
   */
  private async isSmartAssignmentEnabled(kioskId: string): Promise<boolean> {
    if (!this.configManager) {
      return false;
    }

    try {
      const config = await this.configManager.getEffectiveConfig(kioskId);
      return config.smart_assignment_enabled === true;
    } catch (error) {
      console.error('Error checking smart assignment config:', error);
      return false;
    }
  }

  /**
   * Convert SmartSession to RfidSession for backward compatibility
   */
  private convertSmartSessionToRfid(smartSession: SmartSession): RfidSession {
    const remainingMinutes = this.smartSessionManager?.getRemainingMinutes(smartSession) || 0;
    
    return {
      id: smartSession.id,
      kioskId: smartSession.kioskId,
      cardId: smartSession.cardId,
      startTime: smartSession.startTime,
      timeoutSeconds: remainingMinutes * 60, // Convert minutes to seconds
      status: smartSession.status as any,
      selectedLockerId: smartSession.lockerId
    };
  }

  /**
   * Get remaining minutes for a smart session
   */
  private getRemainingMinutes(smartSession: SmartSession): number {
    if (!this.smartSessionManager) {
      return 0;
    }
    return this.smartSessionManager.getRemainingMinutes(smartSession);
  }
}