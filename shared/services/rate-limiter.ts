/**
 * Rate Limiting Service for Smart Locker Assignment
 * 
 * Implements multiple rate limiting strategies with central configuration:
 * - Card-based: Configurable interval between opens per card
 * - Locker-based: Configurable opens per window per locker
 * - Command cooldown: Configurable seconds between relay commands
 * - User reports: Configurable daily cap per card
 */

import { getConfigurationManager } from './configuration-manager';

export interface RateLimitConfig {
  card_open_min_interval_sec: number;     // 1-60 seconds
  locker_opens_window_sec: number;        // 10-300 seconds
  locker_opens_max_per_window: number;    // 1-10 opens
  command_cooldown_sec: number;           // 1-10 seconds
  user_report_daily_cap: number;          // 0-10 reports
}

export interface RateLimitResult {
  allowed: boolean;
  type: 'card_rate' | 'locker_rate' | 'command_cooldown' | 'user_report_rate';
  key: string;
  retry_after_seconds?: number;
  message: string;
}

export interface RateLimitViolation {
  type: string;
  key: string;
  timestamp: Date;
  retry_after: number;
}

export class RateLimiter {
  private card_last_open: Map<string, number> = new Map();
  private locker_open_history: Map<number, number[]> = new Map();
  private last_command_time: number = 0;
  private user_report_history: Map<string, number[]> = new Map();
  private violations: RateLimitViolation[] = [];
  private config_manager = getConfigurationManager();

  constructor(private fallback_config?: RateLimitConfig) {}

  /**
   * Get current rate limit configuration with validation bounds
   */
  private async get_rate_limit_config(kiosk_id?: string): Promise<RateLimitConfig> {
    try {
      const config = kiosk_id 
        ? await this.config_manager.getEffectiveConfig(kiosk_id)
        : await this.config_manager.getGlobalConfig();

      // Apply validation bounds and defaults
      return {
        card_open_min_interval_sec: this.clamp_value(
          config.card_open_min_interval_sec ?? 10, 1, 60
        ),
        locker_opens_window_sec: this.clamp_value(
          config.locker_opens_window_sec ?? 60, 10, 300
        ),
        locker_opens_max_per_window: this.clamp_value(
          config.locker_opens_max_per_window ?? 3, 1, 10
        ),
        command_cooldown_sec: this.clamp_value(
          config.command_cooldown_sec ?? 3, 1, 10
        ),
        user_report_daily_cap: this.clamp_value(
          config.user_report_daily_cap ?? 2, 0, 10
        )
      };
    } catch (error) {
      console.warn('Failed to load rate limit config, using fallback:', error);
      return this.fallback_config || DEFAULT_RATE_LIMIT_CONFIG;
    }
  }

  /**
   * Clamp value within bounds
   */
  private clamp_value(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Check if card can open a locker (configurable interval)
   */
  async check_card_rate(card_id: string, kiosk_id?: string): Promise<RateLimitResult> {
    const config = await this.get_rate_limit_config(kiosk_id);
    const now = Date.now();
    const last_open = this.card_last_open.get(card_id) || 0;
    const time_since_last_open = (now - last_open) / 1000;

    if (time_since_last_open < config.card_open_min_interval_sec) {
      const retry_after = Math.ceil(config.card_open_min_interval_sec - time_since_last_open);
      
      this.record_violation('card_rate', this.anonymize_card_id(card_id), retry_after);
      
      return {
        allowed: false,
        type: 'card_rate',
        key: this.anonymize_card_id(card_id),
        retry_after_seconds: retry_after,
        message: 'Lütfen birkaç saniye sonra deneyin.'
      };
    }

    return {
      allowed: true,
      type: 'card_rate',
      key: this.anonymize_card_id(card_id),
      message: 'Rate limit passed.'
    };
  }

  /**
   * Check if locker can be opened (configurable opens per window)
   */
  async check_locker_rate(locker_id: number, kiosk_id?: string): Promise<RateLimitResult> {
    const config = await this.get_rate_limit_config(kiosk_id);
    const now = Date.now();
    const history = this.locker_open_history.get(locker_id) || [];
    
    // Remove entries older than window
    const cutoff = now - (config.locker_opens_window_sec * 1000);
    const recent_opens = history.filter(time => time > cutoff);
    
    if (recent_opens.length >= config.locker_opens_max_per_window) {
      const oldest_recent_open = Math.min(...recent_opens);
      const retry_after = Math.ceil((oldest_recent_open + (config.locker_opens_window_sec * 1000) - now) / 1000);
      
      this.record_violation('locker_rate', locker_id.toString(), retry_after);
      
      return {
        allowed: false,
        type: 'locker_rate',
        key: locker_id.toString(),
        retry_after_seconds: retry_after,
        message: 'Lütfen birkaç saniye sonra deneyin.'
      };
    }

    return {
      allowed: true,
      type: 'locker_rate',
      key: locker_id.toString(),
      message: 'Rate limit passed.'
    };
  }

  /**
   * Check command cooldown (configurable seconds between relay commands)
   */
  async check_command_cooldown(kiosk_id?: string): Promise<RateLimitResult> {
    const config = await this.get_rate_limit_config(kiosk_id);
    const now = Date.now();
    const time_since_last_command = (now - this.last_command_time) / 1000;

    if (time_since_last_command < config.command_cooldown_sec) {
      const retry_after = Math.ceil(config.command_cooldown_sec - time_since_last_command);
      
      this.record_violation('command_cooldown', 'global', retry_after);
      
      return {
        allowed: false,
        type: 'command_cooldown',
        key: 'global',
        retry_after_seconds: retry_after,
        message: 'Lütfen birkaç saniye sonra deneyin.'
      };
    }

    return {
      allowed: true,
      type: 'command_cooldown',
      key: 'global',
      message: 'Rate limit passed.'
    };
  }

  /**
   * Check user report rate limit (configurable daily cap per card)
   */
  async check_user_report_rate(card_id: string, kiosk_id?: string): Promise<RateLimitResult> {
    const config = await this.get_rate_limit_config(kiosk_id);
    
    // If daily cap is 0, reports are disabled
    if (config.user_report_daily_cap === 0) {
      this.record_violation('user_report_rate', this.anonymize_card_id(card_id), 86400);
      
      return {
        allowed: false,
        type: 'user_report_rate',
        key: this.anonymize_card_id(card_id),
        retry_after_seconds: 86400,
        message: 'Lütfen birkaç saniye sonra deneyin.' // Don't show daily limit message on kiosks
      };
    }

    const now = Date.now();
    const history = this.user_report_history.get(card_id) || [];
    
    // Remove entries older than 24 hours
    const cutoff = now - (24 * 60 * 60 * 1000);
    const recent_reports = history.filter(time => time > cutoff);
    
    if (recent_reports.length >= config.user_report_daily_cap) {
      const oldest_report = Math.min(...recent_reports);
      const retry_after = Math.ceil((oldest_report + (24 * 60 * 60 * 1000) - now) / 1000);
      
      this.record_violation('user_report_rate', this.anonymize_card_id(card_id), retry_after);
      
      return {
        allowed: false,
        type: 'user_report_rate',
        key: this.anonymize_card_id(card_id),
        retry_after_seconds: retry_after,
        message: 'Lütfen birkaç saniye sonra deneyin.' // Don't show daily limit message on kiosks
      };
    }

    return {
      allowed: true,
      type: 'user_report_rate',
      key: this.anonymize_card_id(card_id),
      message: 'Rate limit passed.'
    };
  }

  /**
   * Anonymize card ID for logging (security requirement)
   */
  private anonymize_card_id(card_id: string): string {
    if (card_id.length <= 4) return '****';
    return card_id.substring(0, 2) + '****' + card_id.substring(card_id.length - 2);
  }

  /**
   * Record successful card open
   */
  record_card_open(card_id: string): void {
    this.card_last_open.set(card_id, Date.now());
  }

  /**
   * Record successful locker open
   */
  async record_locker_open(locker_id: number, kiosk_id?: string): Promise<void> {
    const config = await this.get_rate_limit_config(kiosk_id);
    const now = Date.now();
    const history = this.locker_open_history.get(locker_id) || [];
    
    // Add current time and clean old entries
    history.push(now);
    const cutoff = now - (config.locker_opens_window_sec * 1000);
    const recent_history = history.filter(time => time > cutoff);
    
    this.locker_open_history.set(locker_id, recent_history);
  }

  /**
   * Record successful command execution
   */
  record_command(): void {
    this.last_command_time = Date.now();
  }

  /**
   * Record successful user report
   */
  record_user_report(card_id: string): void {
    const now = Date.now();
    const history = this.user_report_history.get(card_id) || [];
    
    // Add current time and clean old entries
    history.push(now);
    const cutoff = now - (24 * 60 * 60 * 1000);
    const recent_history = history.filter(time => time > cutoff);
    
    this.user_report_history.set(card_id, recent_history);
  }

  /**
   * Check all applicable rate limits for a card open operation
   */
  async check_all_limits(card_id: string, locker_id: number, kiosk_id?: string): Promise<RateLimitResult> {
    // Check card rate limit
    const card_check = await this.check_card_rate(card_id, kiosk_id);
    if (!card_check.allowed) {
      return card_check;
    }

    // Check locker rate limit
    const locker_check = await this.check_locker_rate(locker_id, kiosk_id);
    if (!locker_check.allowed) {
      return locker_check;
    }

    // Check command cooldown
    const command_check = await this.check_command_cooldown(kiosk_id);
    if (!command_check.allowed) {
      return command_check;
    }

    return {
      allowed: true,
      type: 'card_rate',
      key: this.anonymize_card_id(card_id),
      message: 'All rate limits passed.'
    };
  }

  /**
   * Record successful operation (updates all relevant counters)
   */
  async record_successful_open(card_id: string, locker_id: number, kiosk_id?: string): Promise<void> {
    this.record_card_open(card_id);
    await this.record_locker_open(locker_id, kiosk_id);
    this.record_command();
  }

  /**
   * Get recent violations for monitoring
   */
  get_recent_violations(minutes: number = 10): RateLimitViolation[] {
    const cutoff = new Date(Date.now() - (minutes * 60 * 1000));
    return this.violations.filter(v => v.timestamp > cutoff);
  }

  /**
   * Clear old violations (cleanup)
   */
  cleanup_violations(): void {
    const cutoff = new Date(Date.now() - (60 * 60 * 1000)); // Keep 1 hour
    this.violations = this.violations.filter(v => v.timestamp > cutoff);
  }

  /**
   * Record a rate limit violation
   */
  private record_violation(type: string, key: string, retry_after: number): void {
    this.violations.push({
      type,
      key,
      timestamp: new Date(),
      retry_after
    });

    // Log the violation (key is already anonymized for card IDs)
    console.log(`Rate limit exceeded: type=${type}, key=${key}`);
  }

  /**
   * Get current state for debugging
   */
  get_state() {
    return {
      card_last_open: Object.fromEntries(this.card_last_open),
      locker_open_history: Object.fromEntries(this.locker_open_history),
      last_command_time: this.last_command_time,
      user_report_history: Object.fromEntries(this.user_report_history),
      recent_violations: this.get_recent_violations()
    };
  }
}

// Default configuration with validation bounds
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  card_open_min_interval_sec: 10,    // 1-60 seconds
  locker_opens_window_sec: 60,       // 10-300 seconds  
  locker_opens_max_per_window: 3,    // 1-10 opens
  command_cooldown_sec: 3,           // 1-10 seconds
  user_report_daily_cap: 2           // 0-10 reports
};

// Singleton instance
let rate_limiter_instance: RateLimiter | null = null;

export function get_rate_limiter(fallback_config?: RateLimitConfig): RateLimiter {
  if (!rate_limiter_instance) {
    rate_limiter_instance = new RateLimiter(fallback_config || DEFAULT_RATE_LIMIT_CONFIG);
  }
  return rate_limiter_instance;
}

export function reset_rate_limiter(): void {
  rate_limiter_instance = null;
}

// Legacy compatibility functions (deprecated)
export const getRateLimiter = get_rate_limiter;
export const resetRateLimiter = reset_rate_limiter;