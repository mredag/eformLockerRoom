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
export interface RfidSession {
    id: string;
    kioskId: string;
    cardId: string;
    startTime: Date;
    timeoutSeconds: number;
    status: 'active' | 'expired' | 'completed' | 'cancelled';
    availableLockers?: number[];
    selectedLockerId?: number;
    timeToSelection?: number;
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
export declare class SessionManager extends EventEmitter {
    private sessions;
    private kioskSessions;
    private countdownTimers;
    private cleanupTimer;
    private config;
    private performanceReportingEnabled;
    private smartSessionManager;
    private configManager;
    constructor(config?: Partial<SessionManagerConfig>, smartSessionManager?: SmartSessionManager, configManager?: ConfigurationManager);
    /**
     * Create a new RFID session for a kiosk
     * Implements one-session-per-kiosk rule by cancelling existing sessions
     * Integrates with smart session manager when smart assignment is enabled
     */
    createSession(kioskId: string, cardId: string, availableLockers?: number[]): Promise<RfidSession>;
    /**
     * Create a regular RFID session (manual mode)
     */
    private createRegularSession;
    /**
     * Get active session for a kiosk
     * Checks both regular sessions and smart sessions
     */
    getKioskSession(kioskId: string): Promise<RfidSession | null>;
    /**
     * Get regular kiosk session (manual mode)
     */
    private getRegularKioskSession;
    /**
     * Get session by ID
     * Checks both regular sessions and smart sessions
     */
    getSession(sessionId: string): Promise<RfidSession | null>;
    /**
     * Get regular session by ID
     */
    private getRegularSession;
    /**
     * Complete a session (when locker is selected)
     * Handles both regular sessions and smart sessions
     */
    completeSession(sessionId: string, selectedLockerId?: number): Promise<boolean>;
    /**
     * Complete a regular session
     */
    private completeRegularSession;
    /**
     * Cancel a session (when new card is scanned or manual cancellation)
     * Handles both regular sessions and smart sessions
     */
    cancelSession(sessionId: string, reason?: string): Promise<boolean>;
    /**
     * Cancel a regular session
     */
    private cancelRegularSession;
    /**
     * Extend session timeout (if needed)
     */
    extendSession(sessionId: string, additionalSeconds?: number): boolean;
    /**
     * Get remaining time for a session
     */
    getRemainingTime(sessionId: string): number;
    /**
     * Get all active sessions (for debugging/monitoring)
     */
    getActiveSessions(): RfidSession[];
    /**
     * Get session statistics
     */
    getSessionStats(): {
        total: number;
        active: number;
        completed: number;
        expired: number;
        cancelled: number;
    };
    /**
     * Validate session ownership
     */
    validateSession(sessionId: string, cardId: string): boolean;
    /**
     * Clear all sessions for a kiosk (emergency cleanup)
     */
    clearKioskSessions(kioskId: string): void;
    /**
     * Shutdown session manager
     */
    shutdown(): void;
    /**
     * Generate unique session ID
     */
    private generateSessionId;
    /**
     * Start countdown timer for a session
     */
    private startCountdownTimer;
    /**
     * Clear countdown timer for a session
     */
    private clearCountdownTimer;
    /**
     * Expire a session due to timeout
     */
    private expireSession;
    /**
     * Start periodic cleanup of old sessions
     */
    private startCleanupTimer;
    /**
     * Clean up old completed/expired/cancelled sessions
     */
    private cleanupOldSessions;
    /**
     * Report session start to performance monitoring system
     */
    private reportSessionStart;
    /**
     * Report session end to performance monitoring system
     */
    private reportSessionEnd;
    /**
     * Enable or disable performance reporting
     */
    setPerformanceReporting(enabled: boolean): void;
    /**
     * Get smart session for a card (smart assignment mode)
     */
    getSmartSession(cardId: string): Promise<SmartSession | null>;
    /**
     * Extend smart session (admin function)
     */
    extendSmartSession(sessionId: string, adminUser: string, reason: string): Promise<boolean>;
    /**
     * Get remaining time for smart session in minutes
     */
    getSmartSessionRemainingMinutes(sessionId: string): Promise<number>;
    /**
     * Check if smart assignment is enabled for a kiosk
     */
    private isSmartAssignmentEnabled;
    /**
     * Convert SmartSession to RfidSession for backward compatibility
     */
    private convertSmartSessionToRfid;
    /**
     * Get remaining minutes for a smart session
     */
    private getRemainingMinutes;
}
//# sourceMappingURL=session-manager.d.ts.map