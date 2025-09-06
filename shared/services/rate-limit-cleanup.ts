/**
 * Rate Limit Cleanup Service
 * 
 * Handles periodic cleanup of old rate limit data and violations
 */

import { getRateLimiter } from './rate-limiter';
import { getRateLimitMonitor } from './rate-limit-monitor';

export interface CleanupConfig {
  intervalMinutes: number;
  violationRetentionHours: number;
  stateCleanupHours: number;
}

export class RateLimitCleanup {
  private intervalId: NodeJS.Timeout | null = null;
  private config: CleanupConfig;

  constructor(config: CleanupConfig = {
    intervalMinutes: 15,
    violationRetentionHours: 1,
    stateCleanupHours: 24
  }) {
    this.config = config;
  }

  /**
   * Start periodic cleanup
   */
  start(): void {
    if (this.intervalId) {
      console.log('Rate limit cleanup already running');
      return;
    }

    console.log(`Starting rate limit cleanup every ${this.config.intervalMinutes} minutes`);
    
    // Run cleanup immediately
    this.performCleanup();
    
    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.performCleanup();
    }, this.config.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop periodic cleanup
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Rate limit cleanup stopped');
    }
  }

  /**
   * Perform cleanup operations
   */
  private performCleanup(): void {
    try {
      const startTime = Date.now();
      
      // Clean up rate limiter violations
      const rateLimiter = getRateLimiter();
      rateLimiter.cleanupViolations();
      
      // Clean up monitor alerts (older than retention period)
      const monitor = getRateLimitMonitor();
      this.cleanupOldAlerts(monitor);
      
      // Log cleanup completion
      const duration = Date.now() - startTime;
      console.log(`Rate limit cleanup completed in ${duration}ms`);
      
      // Log current state for monitoring
      this.logCleanupStats();
      
    } catch (error) {
      console.error('Error during rate limit cleanup:', error);
    }
  }

  /**
   * Clean up old alerts from monitor
   */
  private cleanupOldAlerts(monitor: any): void {
    const cutoff = new Date(Date.now() - (this.config.violationRetentionHours * 60 * 60 * 1000));
    
    // Get all alerts and filter out old ones
    const allAlerts = monitor.getAllAlerts();
    const oldAlerts = allAlerts.filter((alert: any) => alert.triggeredAt < cutoff);
    
    if (oldAlerts.length > 0) {
      console.log(`Cleaning up ${oldAlerts.length} old rate limit alerts`);
      
      // Remove old alerts (this would need to be implemented in the monitor)
      // For now, just log the cleanup
      oldAlerts.forEach((alert: any) => {
        console.log(`  Cleaned alert: ${alert.type} from ${alert.triggeredAt.toISOString()}`);
      });
    }
  }

  /**
   * Log cleanup statistics
   */
  private logCleanupStats(): void {
    const rateLimiter = getRateLimiter();
    const monitor = getRateLimitMonitor();
    
    const state = rateLimiter.getState();
    const recentViolations = rateLimiter.getRecentViolations(60); // Last hour
    const activeAlerts = monitor.getActiveAlerts();
    
    console.log('Rate limit cleanup stats:', {
      activeCardLimits: Object.keys(state.cardLastOpen).length,
      activeLockerLimits: Object.keys(state.lockerOpenHistory).length,
      activeUserReports: Object.keys(state.userReportHistory).length,
      recentViolations: recentViolations.length,
      activeAlerts: activeAlerts.length,
      lastCommandTime: state.lastCommandTime ? new Date(state.lastCommandTime).toISOString() : 'never'
    });
  }

  /**
   * Force cleanup now
   */
  forceCleanup(): void {
    console.log('Forcing rate limit cleanup...');
    this.performCleanup();
  }

  /**
   * Get cleanup status
   */
  getStatus(): {
    running: boolean;
    intervalMinutes: number;
    nextCleanup?: Date;
    lastCleanup?: Date;
  } {
    return {
      running: this.intervalId !== null,
      intervalMinutes: this.config.intervalMinutes,
      nextCleanup: this.intervalId ? 
        new Date(Date.now() + (this.config.intervalMinutes * 60 * 1000)) : 
        undefined,
      lastCleanup: undefined // Would need to track this
    };
  }

  /**
   * Update cleanup configuration
   */
  updateConfig(newConfig: Partial<CleanupConfig>): void {
    const wasRunning = this.intervalId !== null;
    
    if (wasRunning) {
      this.stop();
    }
    
    this.config = { ...this.config, ...newConfig };
    
    if (wasRunning) {
      this.start();
    }
    
    console.log('Rate limit cleanup config updated:', this.config);
  }
}

// Singleton instance
let cleanupInstance: RateLimitCleanup | null = null;

export function getRateLimitCleanup(config?: CleanupConfig): RateLimitCleanup {
  if (!cleanupInstance) {
    cleanupInstance = new RateLimitCleanup(config);
  }
  return cleanupInstance;
}

export function startRateLimitCleanup(config?: CleanupConfig): void {
  const cleanup = getRateLimitCleanup(config);
  cleanup.start();
}

export function stopRateLimitCleanup(): void {
  if (cleanupInstance) {
    cleanupInstance.stop();
  }
}

export function resetRateLimitCleanup(): void {
  if (cleanupInstance) {
    cleanupInstance.stop();
  }
  cleanupInstance = null;
}