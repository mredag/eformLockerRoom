/**
 * Sensorless Retry Handler for Smart Locker Assignment
 * Implements open window detection and retry logic without door sensors
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { EventEmitter } from 'events';

export interface SensorlessConfig {
  pulse_ms: number;                    // Duration of relay pulse (200-2000ms)
  open_window_sec: number;             // Window for detecting retry need (5-20 seconds)
  retry_backoff_ms: number;           // Delay before retry (200-1000ms)
  retry_count: number;                // Maximum retries (always 1)
}

export interface RetryResult {
  success: boolean;
  action: 'success_first_try' | 'success_after_retry' | 'failed_after_retry' | 'failed_no_retry';
  message: string;
  duration_ms: number;
  retry_attempted: boolean;
}

export interface OpenAttempt {
  lockerId: number;
  startTime: number;
  pulseCompleted: boolean;
  windowActive: boolean;
  retryUsed: boolean;
}

/**
 * SensorlessRetryHandler manages the open window detection and retry logic
 * for lockers without door sensors, using card scan timing to detect retry needs
 */
export class SensorlessRetryHandler extends EventEmitter {
  private config: SensorlessConfig;
  private activeAttempts = new Map<number, OpenAttempt>();
  private cardScans = new Map<string, number[]>(); // cardId -> timestamps

  constructor(config: SensorlessConfig) {
    super();
    
    // Validate and clamp configuration values
    const validatedConfig: SensorlessConfig = {
      pulse_ms: this.clampValue(config.pulse_ms, 200, 2000, 'pulse_ms'),
      open_window_sec: this.clampValue(config.open_window_sec, 5, 20, 'open_window_sec'),
      retry_backoff_ms: this.clampValue(config.retry_backoff_ms, 200, 1000, 'retry_backoff_ms'),
      retry_count: 1 // Always enforce single retry
    };
    
    // Reject retry_count > 1
    if (config.retry_count > 1) {
      throw new Error('SensorlessRetryHandler: retry_count > 1 is not supported. Only single retry is allowed.');
    }
    
    this.config = validatedConfig;
    console.log('🔧 Sensorless: Configuration validated and applied:', this.config);
  }

  /**
   * Clamp configuration values to valid ranges
   */
  private clampValue(value: number, min: number, max: number, name: string): number {
    if (value < min) {
      console.warn(`⚠️ Sensorless: ${name} value ${value} below minimum ${min}, clamping to ${min}`);
      return min;
    }
    if (value > max) {
      console.warn(`⚠️ Sensorless: ${name} value ${value} above maximum ${max}, clamping to ${max}`);
      return max;
    }
    return value;
  }

  /**
   * Open locker with sensorless retry logic
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
   */
  async openWithRetry(
    lockerId: number,
    cardId: string,
    pulseFunction: (lockerId: number) => Promise<boolean>
  ): Promise<RetryResult> {
    const startTime = Date.now();
    const maxDuration = this.calculateMaxDuration();
    
    console.log(`🔧 Sensorless: Starting open attempt for locker ${lockerId}, max duration ${maxDuration}ms`);
    
    // Clear any existing attempt for this locker
    this.activeAttempts.delete(lockerId);
    
    // Create new attempt record
    const attempt: OpenAttempt = {
      lockerId,
      startTime,
      pulseCompleted: false,
      windowActive: false,
      retryUsed: false
    };
    
    this.activeAttempts.set(lockerId, attempt);
    
    try {
      // First pulse attempt
      console.log(`🔄 Sensorless: First pulse attempt for locker ${lockerId}`);
      const firstSuccess = await pulseFunction(lockerId);
      attempt.pulseCompleted = true;
      
      if (firstSuccess) {
        console.log(`✅ Sensorless: First pulse successful for locker ${lockerId}`);
        
        // Start open window for potential retry detection
        attempt.windowActive = true;
        const windowResult = await this.waitForOpenWindow(lockerId, cardId);
        
        if (windowResult.retryNeeded && !attempt.retryUsed) {
          // Card scanned during window - attempt retry
          return await this.performRetry(lockerId, cardId, pulseFunction, startTime, maxDuration);
        } else {
          // No retry needed or retry already used
          const duration = Date.now() - startTime;
          return {
            success: true,
            action: 'success_first_try',
            message: 'Dolabınız açıldı. Eşyalarınızı yerleştirin.',
            duration_ms: duration,
            retry_attempted: false
          };
        }
      } else {
        // First pulse failed - wait for open window anyway to detect retry need
        console.log(`⚠️ Sensorless: First pulse failed for locker ${lockerId}, waiting for window`);
        attempt.windowActive = true;
        
        const windowResult = await this.waitForOpenWindow(lockerId, cardId);
        
        if (windowResult.retryNeeded && !attempt.retryUsed) {
          // Card scanned during window - attempt retry even though first failed
          return await this.performRetry(lockerId, cardId, pulseFunction, startTime, maxDuration);
        } else {
          // No retry detected
          const duration = Date.now() - startTime;
          return {
            success: false,
            action: 'failed_no_retry',
            message: 'Şu an işlem yapılamıyor.',
            duration_ms: duration,
            retry_attempted: false
          };
        }
      }
    } catch (error) {
      console.error(`❌ Sensorless: Error in open attempt for locker ${lockerId}:`, error);
      const duration = Date.now() - startTime;
      
      return {
        success: false,
        action: 'failed_no_retry',
        message: 'Şu an işlem yapılamıyor.',
        duration_ms: duration,
        retry_attempted: false
      };
    } finally {
      // Clean up attempt record
      this.activeAttempts.delete(lockerId);
    }
  }

  /**
   * Record a card scan for retry detection
   * Requirements: 6.2, 6.3
   */
  recordCardScan(cardId: string): void {
    const now = Date.now();
    
    if (!this.cardScans.has(cardId)) {
      this.cardScans.set(cardId, []);
    }
    
    const scans = this.cardScans.get(cardId)!;
    scans.push(now);
    
    // Keep only recent scans (last 30 seconds)
    const cutoff = now - 30000;
    const recentScans = scans.filter(timestamp => timestamp > cutoff);
    this.cardScans.set(cardId, recentScans);
    
    console.log(`📱 Sensorless: Recorded card scan for ${cardId} at ${now}`);
  }

  /**
   * Wait for open window and detect retry need based on card scans
   * Requirements: 6.2, 6.3
   */
  private async waitForOpenWindow(lockerId: number, cardId: string): Promise<{ retryNeeded: boolean }> {
    const attempt = this.activeAttempts.get(lockerId);
    if (!attempt) {
      return { retryNeeded: false };
    }

    const windowDuration = this.config.open_window_sec * 1000;
    const windowStart = Date.now();
    const windowEnd = windowStart + windowDuration;
    
    console.log(`⏳ Sensorless: Open window active for locker ${lockerId}, duration ${windowDuration}ms`);
    
    // Get card scans before window started (to establish baseline)
    const preWindowScans = this.getRecentScans(cardId, windowStart);
    
    // Wait for the window duration
    await this.delay(windowDuration);
    
    // Check for scans during the window
    const postWindowScans = this.getRecentScans(cardId, windowStart);
    const scansInWindow = postWindowScans.length - preWindowScans.length;
    
    const retryNeeded = scansInWindow > 0;
    
    if (retryNeeded) {
      console.log(`🔄 Sensorless: Retry needed for locker ${lockerId} - detected ${scansInWindow} scans during window`);
    } else {
      console.log(`✅ Sensorless: No retry needed for locker ${lockerId} - no scans during window`);
    }
    
    return { retryNeeded };
  }

  /**
   * Perform retry attempt with backoff and timing budget enforcement
   * Requirements: 6.3, 6.4, 6.5
   */
  private async performRetry(
    lockerId: number,
    cardId: string,
    pulseFunction: (lockerId: number) => Promise<boolean>,
    startTime: number,
    maxDuration: number
  ): Promise<RetryResult> {
    const attempt = this.activeAttempts.get(lockerId);
    if (!attempt || attempt.retryUsed) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        action: 'failed_no_retry',
        message: 'Şu an işlem yapılamıyor.',
        duration_ms: duration,
        retry_attempted: false
      };
    }

    // Check timing budget before retry
    const currentDuration = Date.now() - startTime;
    const remainingBudget = maxDuration - currentDuration;
    const retryNeeds = this.config.retry_backoff_ms + this.config.pulse_ms;
    
    if (remainingBudget < retryNeeds) {
      console.log(`⏰ Sensorless: Insufficient time budget for retry (need ${retryNeeds}ms, have ${remainingBudget}ms)`);
      const duration = Date.now() - startTime;
      return {
        success: false,
        action: 'failed_no_retry',
        message: 'Şu an işlem yapılamıyor.',
        duration_ms: duration,
        retry_attempted: false
      };
    }

    // Mark retry as used
    attempt.retryUsed = true;
    
    // Show retry message ONLY during retry window
    console.log(`🔄 Sensorless: Showing retry message for locker ${lockerId}`);
    this.emit('show_message', {
      lockerId,
      cardId,
      message: 'Tekrar deneniyor.',
      type: 'retry'
    });
    
    // Wait for backoff period
    console.log(`⏳ Sensorless: Retry backoff ${this.config.retry_backoff_ms}ms for locker ${lockerId}`);
    await this.delay(this.config.retry_backoff_ms);
    
    // Perform retry pulse
    console.log(`🔄 Sensorless: Retry pulse attempt for locker ${lockerId}`);
    let retrySuccess = false;
    
    try {
      retrySuccess = await pulseFunction(lockerId);
    } catch (error) {
      console.error(`❌ Sensorless: Retry pulse error for locker ${lockerId}:`, error);
      retrySuccess = false;
    }
    
    const finalDuration = Date.now() - startTime;
    
    // Ensure we're within timing budget for final message
    if (finalDuration <= maxDuration) {
      const message = retrySuccess ? 
        'Dolabınız açıldı. Eşyalarınızı yerleştirin.' : 
        'Şu an işlem yapılamıyor.';
      
      console.log(`📱 Sensorless: Final message for locker ${lockerId}: ${message}`);
      this.emit('show_message', {
        lockerId,
        cardId,
        message,
        type: retrySuccess ? 'success' : 'failure'
      });
    }
    
    const action = retrySuccess ? 'success_after_retry' : 'failed_after_retry';
    const message = retrySuccess ? 
      'Dolabınız açıldı. Eşyalarınızı yerleştirin.' : 
      'Şu an işlem yapılamıyor.';
    
    console.log(`${retrySuccess ? '✅' : '❌'} Sensorless: Retry ${retrySuccess ? 'successful' : 'failed'} for locker ${lockerId}`);
    
    return {
      success: retrySuccess,
      action,
      message,
      duration_ms: finalDuration,
      retry_attempted: true
    };
  }

  /**
   * Calculate maximum allowed duration for timing budget enforcement
   * Requirements: 6.4
   */
  private calculateMaxDuration(): number {
    // pulse_ms + open_window_sec + retry_backoff_ms + pulse_ms
    return this.config.pulse_ms + 
           (this.config.open_window_sec * 1000) + 
           this.config.retry_backoff_ms + 
           this.config.pulse_ms;
  }

  /**
   * Get recent card scans for a card ID since a given timestamp
   */
  private getRecentScans(cardId: string, since: number): number[] {
    const scans = this.cardScans.get(cardId) || [];
    return scans.filter(timestamp => timestamp >= since);
  }

  /**
   * Check if a locker has an active open attempt
   */
  isAttemptActive(lockerId: number): boolean {
    return this.activeAttempts.has(lockerId);
  }

  /**
   * Get active attempt info for debugging
   */
  getAttemptInfo(lockerId: number): OpenAttempt | null {
    return this.activeAttempts.get(lockerId) || null;
  }

  /**
   * Clean up old card scan records (call periodically)
   */
  cleanupOldScans(): void {
    const cutoff = Date.now() - 60000; // Keep scans for 1 minute
    
    for (const [cardId, scans] of this.cardScans.entries()) {
      const recentScans = scans.filter(timestamp => timestamp > cutoff);
      
      if (recentScans.length === 0) {
        this.cardScans.delete(cardId);
      } else {
        this.cardScans.set(cardId, recentScans);
      }
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get configuration for debugging
   */
  getConfig(): SensorlessConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (for hot reload)
   */
  updateConfig(newConfig: Partial<SensorlessConfig>): void {
    // Reject retry_count > 1
    if (newConfig.retry_count && newConfig.retry_count > 1) {
      throw new Error('SensorlessRetryHandler: retry_count > 1 is not supported. Only single retry is allowed.');
    }
    
    // Validate and clamp new configuration values
    const validatedConfig: Partial<SensorlessConfig> = {};
    
    if (newConfig.pulse_ms !== undefined) {
      validatedConfig.pulse_ms = this.clampValue(newConfig.pulse_ms, 200, 2000, 'pulse_ms');
    }
    if (newConfig.open_window_sec !== undefined) {
      validatedConfig.open_window_sec = this.clampValue(newConfig.open_window_sec, 5, 20, 'open_window_sec');
    }
    if (newConfig.retry_backoff_ms !== undefined) {
      validatedConfig.retry_backoff_ms = this.clampValue(newConfig.retry_backoff_ms, 200, 1000, 'retry_backoff_ms');
    }
    if (newConfig.retry_count !== undefined) {
      validatedConfig.retry_count = 1; // Always enforce single retry
    }
    
    this.config = { ...this.config, ...validatedConfig };
    console.log(`🔧 Sensorless: Configuration updated`, this.config);
  }
}

/**
 * Factory function to create SensorlessRetryHandler with default config
 */
export function createSensorlessRetryHandler(config?: Partial<SensorlessConfig>): SensorlessRetryHandler {
  const defaultConfig: SensorlessConfig = {
    pulse_ms: 800,
    open_window_sec: 10,
    retry_backoff_ms: 500,
    retry_count: 1
  };

  const finalConfig = { ...defaultConfig, ...config };
  return new SensorlessRetryHandler(finalConfig);
}