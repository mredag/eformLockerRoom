import { SQLiteSessionManager } from './sqlite-session-manager';

export interface SessionCleanupConfig {
  intervalMinutes: number;
  enabled: boolean;
  logCleanup: boolean;
}

const DEFAULT_CLEANUP_CONFIG: SessionCleanupConfig = {
  intervalMinutes: 15, // Run cleanup every 15 minutes
  enabled: true,
  logCleanup: true
};

export class SessionCleanupService {
  private sessionManager: SQLiteSessionManager;
  private config: SessionCleanupConfig;
  private cleanupTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(sessionManager: SQLiteSessionManager, config?: Partial<SessionCleanupConfig>) {
    this.sessionManager = sessionManager;
    this.config = { ...DEFAULT_CLEANUP_CONFIG, ...config };
  }

  /**
   * Start the cleanup service
   */
  start(): void {
    if (this.isRunning) {
      console.log('🧹 Session cleanup service is already running');
      return;
    }

    if (!this.config.enabled) {
      console.log('🧹 Session cleanup service is disabled');
      return;
    }

    console.log(`🧹 Starting session cleanup service (interval: ${this.config.intervalMinutes} minutes)`);
    
    this.isRunning = true;
    
    // Run initial cleanup
    this.runCleanup();
    
    // Schedule periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.runCleanup();
    }, this.config.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the cleanup service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('🧹 Stopping session cleanup service');
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    this.isRunning = false;
  }

  /**
   * Run cleanup manually
   */
  async runCleanup(): Promise<number> {
    try {
      const cleanedCount = await this.sessionManager.cleanupExpiredSessions();
      
      if (this.config.logCleanup && cleanedCount > 0) {
        console.log(`🧹 Session cleanup completed: removed ${cleanedCount} expired sessions`);
      }
      
      return cleanedCount;
    } catch (error) {
      console.error('🧹 Session cleanup failed:', error);
      return 0;
    }
  }

  /**
   * Get cleanup service status
   */
  getStatus(): {
    isRunning: boolean;
    intervalMinutes: number;
    enabled: boolean;
    nextCleanupIn?: number; // milliseconds
  } {
    let nextCleanupIn: number | undefined;
    
    if (this.isRunning && this.cleanupTimer) {
      // This is an approximation since we can't get exact timer remaining time
      nextCleanupIn = this.config.intervalMinutes * 60 * 1000;
    }

    return {
      isRunning: this.isRunning,
      intervalMinutes: this.config.intervalMinutes,
      enabled: this.config.enabled,
      nextCleanupIn
    };
  }

  /**
   * Update cleanup configuration
   */
  updateConfig(newConfig: Partial<SessionCleanupConfig>): void {
    const wasRunning = this.isRunning;
    
    // Stop if running
    if (wasRunning) {
      this.stop();
    }
    
    // Update config
    this.config = { ...this.config, ...newConfig };
    
    // Restart if it was running and still enabled
    if (wasRunning && this.config.enabled) {
      this.start();
    }
  }

  /**
   * Get cleanup statistics
   */
  async getStatistics(): Promise<{
    totalActiveSessions: number;
    sessionStatistics: {
      totalSessions: number;
      userCount: number;
      averageSessionAge: number;
      expiringSoon: number;
      requirePinChange: number;
    };
  }> {
    const activeSessionCount = await this.sessionManager.getActiveSessionCount();
    const sessionStats = await this.sessionManager.getStatistics();
    
    return {
      totalActiveSessions: activeSessionCount,
      sessionStatistics: sessionStats
    };
  }
}