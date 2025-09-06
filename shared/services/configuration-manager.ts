import { DatabaseConnection } from '../database/connection';
import { EventEmitter } from 'events';

export interface GlobalConfig {
  // Feature flags
  smart_assignment_enabled: boolean;
  allow_reclaim_during_quarantine: boolean;
  
  // Scoring parameters
  base_score: number;
  score_factor_a: number; // free hours multiplier
  score_factor_b: number; // hours since last owner multiplier
  score_factor_g: number; // wear_count divisor
  score_factor_d: number; // waiting hours bonus
  top_k_candidates: number;
  selection_temperature: number;
  
  // Quarantine settings
  quarantine_minutes_base: number; // 5 minutes
  quarantine_minutes_ceiling: number; // 20 minutes
  exit_quarantine_minutes: number; // 20 minutes fixed
  
  // Return hold settings
  return_hold_trigger_seconds: number;
  return_hold_minutes: number;
  
  // Session and timing
  session_limit_minutes: number; // CRITICAL: 180 minutes (config-driven)
  retrieve_window_minutes: number;
  reclaim_min: number; // 120 minutes threshold
  
  // Capacity management
  reserve_ratio: number; // Percentage of lockers to reserve (e.g., 0.1 = 10%)
  reserve_minimum: number; // Minimum number of lockers to reserve
  
  // Hardware settings
  pulse_ms: number;
  open_window_sec: number;
  retry_count: number;
  retry_backoff_ms: number;
  
  // Rate limits
  card_rate_limit_seconds: number; // 10 seconds
  locker_rate_limit_per_minute: number; // 3 opens
  command_cooldown_seconds: number; // 3 seconds
  user_report_daily_cap: number; // 2 reports
  
  // Dynamic calculation parameters
  free_ratio_low: number; // 0.1
  free_ratio_high: number; // 0.5
  reclaim_low_min: number; // 30 minutes
  reclaim_high_min: number; // 180 minutes
  owner_hot_window_min: number; // 10 minutes
  owner_hot_window_max: number; // 30 minutes
  
  // Alert thresholds
  alert_no_stock_trigger_count: number;
  alert_no_stock_trigger_window_min: number;
  alert_conflict_rate_trigger: number;
  alert_conflict_rate_window_min: number;
  alert_open_fail_rate_trigger: number;
  alert_retry_rate_trigger: number;
  alert_overdue_share_trigger: number;
  
  // Session extension limits
  session_extension_minutes: number; // 60 minutes
  session_max_total_minutes: number; // 240 minutes
  session_max_extensions: number; // 4 extensions
  
  // User report settings
  user_report_window_sec: number;
  suspect_ttl_min: number;
}

export interface KioskOverrides {
  [key: string]: any;
}

export interface EffectiveConfig extends GlobalConfig {
  // Merged configuration with kiosk overrides applied
  _kioskId?: string;
  _version?: number;
  _loadedAt?: Date;
}

export interface ConfigValue {
  key: string;
  value: string;
  data_type: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  updated_by?: string;
  updated_at?: Date;
}

export interface ConfigurationChangeEvent {
  type: 'global' | 'kiosk';
  kioskId?: string;
  key?: string;
  oldValue?: any;
  newValue?: any;
  version: number;
  oldVersion?: number;
  changedBy?: string;
  timestamp: Date;
  propagationStartTime?: number;
}

export class ConfigurationManager extends EventEmitter {
  private db: DatabaseConnection;
  private configCache: Map<string, EffectiveConfig> = new Map();
  private globalConfigCache: GlobalConfig | null = null;
  private lastVersion: number = 0;
  private hotReloadInterval: NodeJS.Timeout | null = null;
  private readonly RELOAD_CHECK_INTERVAL_MS = 1000; // Check every second for ≤3 second propagation
  private readonly JITTER_MS = 100; // Small jitter for polling
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_BACKOFF_BASE_MS = 100;
  private isShuttingDown = false;

  constructor(db?: DatabaseConnection) {
    super();
    this.db = db || DatabaseConnection.getInstance();
    this.startHotReloadMonitoring();
  }

  /**
   * Get effective configuration for a specific kiosk (global + overrides)
   * 
   * Override Precedence: Kiosk override wins over global configuration.
   * This allows "smart_assignment_enabled" to be ON per kiosk while global is OFF.
   */
  async getEffectiveConfig(kioskId: string): Promise<EffectiveConfig> {
    if (this.isShuttingDown) {
      throw new Error('Configuration Manager is shutting down');
    }
    
    const cacheKey = `effective_${kioskId}`;
    
    // Check cache first
    const cached = this.configCache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Load fresh configuration
    const globalConfig = await this.getGlobalConfig();
    const kioskOverrides = await this.getKioskOverrides(kioskId);
    
    // Merge global config with kiosk overrides (kiosk wins)
    const effectiveConfig: EffectiveConfig = {
      ...globalConfig,
      ...kioskOverrides, // Kiosk overrides take precedence
      _kioskId: kioskId,
      _version: this.lastVersion,
      _loadedAt: new Date()
    };

    // Cache the result
    this.configCache.set(cacheKey, effectiveConfig);
    
    return effectiveConfig;
  }

  /**
   * Get global configuration
   */
  async getGlobalConfig(): Promise<GlobalConfig> {
    // Check cache first
    if (this.globalConfigCache && this.isCacheValid(this.globalConfigCache as any)) {
      return this.globalConfigCache;
    }

    // Load from database
    const configRows = await this.db.all<ConfigValue>(
      'SELECT key, value, data_type, description, updated_by, updated_at FROM settings_global'
    );

    if (!configRows || configRows.length === 0) {
      throw new Error('Global configuration not found. Run configuration seeding first.');
    }

    // Parse configuration values
    const config: any = {};
    for (const row of configRows) {
      config[row.key] = this.parseConfigValue(row.value, row.data_type);
    }

    // Validate required configuration keys
    this.validateGlobalConfig(config);

    // Cache the result
    this.globalConfigCache = config as GlobalConfig;
    
    return this.globalConfigCache;
  }

  /**
   * Get kiosk-specific overrides
   * Undefined means "fall back to global." Never persist nulls.
   */
  async getKioskOverrides(kioskId: string): Promise<KioskOverrides> {
    const overrideRows = await this.db.all<ConfigValue>(
      'SELECT key, value, data_type FROM settings_kiosk WHERE kiosk_id = ? AND value IS NOT NULL',
      [kioskId]
    );

    const overrides: KioskOverrides = {};
    for (const row of overrideRows) {
      const parsedValue = this.parseConfigValue(row.value, row.data_type);
      // Only include non-null, non-undefined values
      if (parsedValue !== null && parsedValue !== undefined) {
        overrides[row.key] = parsedValue;
      }
    }

    return overrides;
  }

  /**
   * Update global configuration with atomic transaction and version bump
   */
  async updateGlobalConfig(updates: Partial<GlobalConfig>, updatedBy: string = 'system'): Promise<void> {
    const startTime = Date.now();
    
    // Validate all updates before starting transaction
    for (const [key, value] of Object.entries(updates)) {
      const validation = this.validateConfigValue(key, value);
      if (!validation.valid) {
        throw new Error(`Invalid configuration value for ${key}: ${validation.error}`);
      }
    }

    // Apply updates in atomic transaction with retry logic
    await this.executeWithRetry(async () => {
      await this.db.run('BEGIN IMMEDIATE'); // Exclusive lock for SQLite concurrency
      
      try {
        // Get current version for audit trail
        const currentVersionResult = await this.db.get<{ version: number }>(
          'SELECT version FROM config_version WHERE id = 1'
        );
        const currentVersion = currentVersionResult?.version || 0;
        
        // Apply all updates atomically
        for (const [key, value] of Object.entries(updates)) {
          // Get old value for audit
          const oldValueResult = await this.db.get<{ value: string; data_type: string }>(
            'SELECT value, data_type FROM settings_global WHERE key = ?',
            [key]
          );
          
          const dataType = this.getDataType(value);
          const serializedValue = this.serializeValue(value);
          
          // Update configuration
          await this.db.run(
            `INSERT OR REPLACE INTO settings_global (key, value, data_type, updated_by, updated_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [key, serializedValue, dataType, updatedBy]
          );
          
          // Record audit trail (no card data, project logger only)
          await this.db.run(
            `INSERT INTO config_history (kiosk_id, key, old_value, new_value, data_type, changed_by, changed_at)
             VALUES (NULL, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [key, oldValueResult?.value || null, serializedValue, dataType, updatedBy]
          );
        }
        
        // Bump version once per request (monotonic)
        const newVersion = currentVersion + 1;
        await this.db.run(
          'UPDATE config_version SET version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
          [newVersion]
        );
        
        await this.db.run('COMMIT');
        
        // Update local version tracking
        this.lastVersion = newVersion;
        
      } catch (error) {
        await this.db.run('ROLLBACK');
        throw error;
      }
    });

    // Clear cache to force reload
    this.invalidateCache();
    
    const duration = Date.now() - startTime;
    console.log(`📝 Global config updated: ${Object.keys(updates).length} keys in ${duration}ms by ${updatedBy}`);
  }

  /**
   * Set kiosk-specific override with atomic transaction
   * Never persist nulls - undefined means "fall back to global"
   */
  async setKioskOverride(kioskId: string, key: string, value: any, updatedBy: string = 'system'): Promise<void> {
    // Reject null/undefined values - use removeKioskOverride instead
    if (value === null || value === undefined) {
      throw new Error(`Cannot set null/undefined override for ${key}. Use removeKioskOverride to fall back to global.`);
    }

    // Validate the override
    const validation = this.validateConfigValue(key, value);
    if (!validation.valid) {
      throw new Error(`Invalid configuration value for ${key}: ${validation.error}`);
    }

    const dataType = this.getDataType(value);
    const serializedValue = this.serializeValue(value);
    
    // Apply update in atomic transaction
    await this.executeWithRetry(async () => {
      await this.db.run('BEGIN IMMEDIATE');
      
      try {
        // Get current version and old value for audit
        const currentVersionResult = await this.db.get<{ version: number }>(
          'SELECT version FROM config_version WHERE id = 1'
        );
        const currentVersion = currentVersionResult?.version || 0;
        
        const oldValueResult = await this.db.get<{ value: string; data_type: string }>(
          'SELECT value, data_type FROM settings_kiosk WHERE kiosk_id = ? AND key = ?',
          [kioskId, key]
        );
        
        // Update kiosk override
        await this.db.run(
          `INSERT OR REPLACE INTO settings_kiosk (kiosk_id, key, value, data_type, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [kioskId, key, serializedValue, dataType, updatedBy]
        );
        
        // Record audit trail
        await this.db.run(
          `INSERT INTO config_history (kiosk_id, key, old_value, new_value, data_type, changed_by, changed_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [kioskId, key, oldValueResult?.value || null, serializedValue, dataType, updatedBy]
        );
        
        // Bump version
        const newVersion = currentVersion + 1;
        await this.db.run(
          'UPDATE config_version SET version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
          [newVersion]
        );
        
        await this.db.run('COMMIT');
        
        // Update local version tracking
        this.lastVersion = newVersion;
        
      } catch (error) {
        await this.db.run('ROLLBACK');
        throw error;
      }
    });

    // Clear cache for this kiosk
    this.configCache.delete(`effective_${kioskId}`);
    
    console.log(`🎯 Kiosk override set: ${kioskId}.${key} = ${value} by ${updatedBy}`);
  }

  /**
   * Remove kiosk-specific override with atomic transaction
   */
  async removeKioskOverride(kioskId: string, key: string, updatedBy: string = 'system'): Promise<void> {
    // Apply removal in atomic transaction
    await this.executeWithRetry(async () => {
      await this.db.run('BEGIN IMMEDIATE');
      
      try {
        // Get current version and old value for audit
        const currentVersionResult = await this.db.get<{ version: number }>(
          'SELECT version FROM config_version WHERE id = 1'
        );
        const currentVersion = currentVersionResult?.version || 0;
        
        const oldValueResult = await this.db.get<{ value: string; data_type: string }>(
          'SELECT value, data_type FROM settings_kiosk WHERE kiosk_id = ? AND key = ?',
          [kioskId, key]
        );
        
        // Only proceed if override exists
        if (oldValueResult) {
          // Remove kiosk override
          await this.db.run(
            'DELETE FROM settings_kiosk WHERE kiosk_id = ? AND key = ?',
            [kioskId, key]
          );
          
          // Record audit trail
          await this.db.run(
            `INSERT INTO config_history (kiosk_id, key, old_value, new_value, data_type, changed_by, changed_at)
             VALUES (?, ?, ?, NULL, ?, ?, CURRENT_TIMESTAMP)`,
            [kioskId, key, oldValueResult.value, oldValueResult.data_type, updatedBy]
          );
          
          // Bump version
          const newVersion = currentVersion + 1;
          await this.db.run(
            'UPDATE config_version SET version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
            [newVersion]
          );
          
          // Update local version tracking
          this.lastVersion = newVersion;
        }
        
        await this.db.run('COMMIT');
        
      } catch (error) {
        await this.db.run('ROLLBACK');
        throw error;
      }
    });

    // Clear cache for this kiosk
    this.configCache.delete(`effective_${kioskId}`);
    
    console.log(`🗑️  Kiosk override removed: ${kioskId}.${key} by ${updatedBy}`);
  }

  /**
   * Get current configuration version
   */
  async getConfigVersion(): Promise<number> {
    const result = await this.db.get<{ version: number }>(
      'SELECT version FROM config_version WHERE id = 1'
    );
    return result?.version || 0;
  }

  /**
   * Trigger configuration reload across all services
   */
  async triggerReload(): Promise<void> {
    const startTime = Date.now();
    const oldVersion = this.lastVersion;
    
    // Only increment version if there are actual changes to propagate
    // This method should only be called when there are real configuration changes
    await this.db.run(
      'UPDATE config_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
    );

    // Clear all caches
    this.invalidateCache();
    
    // Get new version
    const newVersion = await this.getConfigVersion();
    this.lastVersion = newVersion;
    
    // Emit change event with detailed timing information
    this.emit('configurationChanged', {
      type: 'global',
      version: newVersion,
      oldVersion: oldVersion,
      timestamp: new Date(),
      propagationStartTime: startTime
    });
    
    const duration = Date.now() - startTime;
    console.log(`🔄 Manual reload triggered: version=${newVersion}, duration=${duration}ms`);
    
    // Check SLA compliance
    if (duration > 3000) {
      console.warn(`⚠️  Manual reload exceeded 3 second SLA: ${duration}ms`);
    }
  }



  /**
   * Execute database operation with retry logic for SQLite busy errors
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's a SQLite busy error
        if (error instanceof Error && error.message.includes('SQLITE_BUSY')) {
          if (attempt < this.MAX_RETRY_ATTEMPTS) {
            const backoffMs = this.RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
            console.warn(`SQLite busy, retrying in ${backoffMs}ms (attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS})`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            continue;
          }
        }
        
        // Non-retryable error or max attempts reached
        throw error;
      }
    }
    
    throw lastError || new Error('Max retry attempts reached');
  }

  /**
   * Start hot reload monitoring with jitter (≤3 second propagation requirement)
   */
  private startHotReloadMonitoring(): void {
    const scheduleNextCheck = () => {
      if (this.isShuttingDown) return;
      
      // Add small jitter to prevent thundering herd
      const jitter = Math.random() * this.JITTER_MS;
      const interval = this.RELOAD_CHECK_INTERVAL_MS + jitter;
      
      this.hotReloadInterval = setTimeout(async () => {
        try {
          const currentVersion = await this.getConfigVersion();
          
          if (currentVersion > this.lastVersion) {
            const propagationStartTime = Date.now();
            
            // Clear caches to force reload
            this.invalidateCache();
            const oldVersion = this.lastVersion;
            this.lastVersion = currentVersion;
            
            // Emit change event with detailed information
            this.emit('configurationChanged', {
              type: 'global',
              version: currentVersion,
              oldVersion: oldVersion,
              timestamp: new Date(),
              propagationStartTime
            });
            
            const propagationDuration = Date.now() - propagationStartTime;
            console.log(`🔄 Hot reload detected: version=${currentVersion}, propagation=${propagationDuration}ms`);
            
            // Verify propagation time requirement (≤3 seconds)
            if (propagationDuration > 3000) {
              console.warn(`⚠️  Configuration propagation exceeded 3 second SLA: ${propagationDuration}ms`);
            }
          }
        } catch (error) {
          if (!this.isShuttingDown) {
            console.error('Hot reload monitoring error:', error);
          }
        } finally {
          scheduleNextCheck(); // Schedule next check
        }
      }, interval);
    };
    
    scheduleNextCheck();
  }

  /**
   * Stop hot reload monitoring
   */
  stopHotReloadMonitoring(): void {
    this.isShuttingDown = true;
    if (this.hotReloadInterval) {
      clearTimeout(this.hotReloadInterval);
      this.hotReloadInterval = null;
    }
  }

  /**
   * Subscribe to configuration changes with unsubscribe capability
   */
  subscribeToChanges(callback: (config: EffectiveConfig) => void): () => void {
    const listener = async (event: ConfigurationChangeEvent) => {
      // For kiosk-specific changes, only notify that kiosk
      if (event.type === 'kiosk' && event.kioskId) {
        try {
          const effectiveConfig = await this.getEffectiveConfig(event.kioskId);
          callback(effectiveConfig);
        } catch (error) {
          console.error(`Failed to get effective config for ${event.kioskId}:`, error);
        }
      } else {
        // For global changes, this would need to be handled per-kiosk by the caller
        // The callback should handle getting the effective config for their specific kiosk
      }
    };

    this.on('configurationChanged', listener);
    
    // Return unsubscribe function
    return () => {
      this.off('configurationChanged', listener);
    };
  }

  /**
   * Subscribe to raw configuration change events (for monitoring and testing)
   */
  subscribeToRawChanges(callback: (event: ConfigurationChangeEvent) => void): () => void {
    this.on('configurationChanged', callback);
    
    // Return unsubscribe function
    return () => {
      this.off('configurationChanged', callback);
    };
  }

  /**
   * Measure configuration propagation time for SLA monitoring
   */
  async measurePropagationTime(): Promise<{ version: number; propagationTime: number }> {
    const startTime = Date.now();
    const currentVersion = await this.getConfigVersion();
    const propagationTime = Date.now() - startTime;
    
    return {
      version: currentVersion,
      propagationTime
    };
  }

  /**
   * Parse configuration value based on data type
   */
  private parseConfigValue(value: string | null, dataType: string): any {
    // Handle null values - return null to be filtered out later
    if (value === null || value === undefined) {
      return null;
    }

    switch (dataType) {
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'number':
        const num = parseFloat(value);
        if (isNaN(num)) {
          throw new Error(`Invalid number value: ${value}`);
        }
        return num;
      case 'json':
        try {
          return JSON.parse(value);
        } catch (e) {
          throw new Error(`Invalid JSON value: ${value}`);
        }
      case 'string':
      default:
        return value;
    }
  }

  /**
   * Serialize value for database storage with input hygiene
   */
  private serializeValue(value: any): string {
    // Apply input hygiene - clamp negative numbers to 0 where applicable
    if (typeof value === 'number') {
      // These fields should never be negative, clamp to 0
      const nonNegativeFields = [
        'quarantine_minutes_base', 'quarantine_minutes_ceiling', 'exit_quarantine_minutes',
        'return_hold_trigger_seconds', 'return_hold_minutes', 'retrieve_window_minutes',
        'reclaim_min', 'reserve_minimum', 'pulse_ms', 'open_window_sec',
        'retry_count', 'retry_backoff_ms', 'card_rate_limit_seconds', 'locker_rate_limit_per_minute',
        'command_cooldown_seconds', 'user_report_daily_cap', 'session_extension_minutes',
        'session_max_total_minutes', 'session_max_extensions', 'user_report_window_sec',
        'suspect_ttl_min'
      ];
      
      // Note: We don't clamp here as validation should catch invalid values
      // This is just for serialization
      return value.toString();
    } else if (typeof value === 'boolean') {
      return value.toString();
    } else if (typeof value === 'object') {
      return JSON.stringify(value);
    } else {
      return String(value);
    }
  }

  /**
   * Get data type for a value
   */
  private getDataType(value: any): 'string' | 'number' | 'boolean' | 'json' {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'object') return 'json';
    return 'string';
  }

  /**
   * Validate configuration value with strict bounds enforcement
   */
  private validateConfigValue(key: string, value: any): { valid: boolean; error?: string } {
    // Input hygiene - reject NaN/Infinity
    if (typeof value === 'number' && (!Number.isFinite(value) || Number.isNaN(value))) {
      return { valid: false, error: `${key}: Invalid number (NaN/Infinity not allowed)` };
    }

    // Strict bounds validation per specification
    const validators: { [key: string]: (value: any) => { valid: boolean; error?: string } } = {
      'smart_assignment_enabled': (v) => {
        if (typeof v !== 'boolean') return { valid: false, error: 'Must be boolean' };
        return { valid: true };
      },
      'base_score': (v) => {
        if (typeof v !== 'number' || v <= 0) return { valid: false, error: 'Must be positive number' };
        return { valid: true };
      },
      'score_factor_a': (v) => {
        if (typeof v !== 'number' || v < 0) return { valid: false, error: 'Must be non-negative number' };
        return { valid: true };
      },
      'score_factor_b': (v) => {
        if (typeof v !== 'number' || v < 0) return { valid: false, error: 'Must be non-negative number' };
        return { valid: true };
      },
      'score_factor_g': (v) => {
        if (typeof v !== 'number' || v < 0) return { valid: false, error: 'Must be non-negative number' };
        return { valid: true };
      },
      'score_factor_d': (v) => {
        if (typeof v !== 'number' || v < 0) return { valid: false, error: 'Must be non-negative number' };
        return { valid: true };
      },
      'top_k_candidates': (v) => {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 20) {
          return { valid: false, error: 'Must be integer between 1-20' };
        }
        return { valid: true };
      },
      'selection_temperature': (v) => {
        if (typeof v !== 'number' || v <= 0) return { valid: false, error: 'Must be positive number' };
        return { valid: true };
      },
      'quarantine_minutes_base': (v) => {
        if (typeof v !== 'number' || v < 0) {
          return { valid: false, error: 'Must be non-negative number' };
        }
        return { valid: true };
      },
      'quarantine_minutes_ceiling': (v) => {
        if (typeof v !== 'number' || v < 0) {
          return { valid: false, error: 'Must be non-negative number' };
        }
        return { valid: true };
      },
      'session_limit_minutes': (v) => {
        if (typeof v !== 'number' || v <= 0 || v > 1440) {
          return { valid: false, error: 'Must be positive number ≤ 1440 (24 hours)' };
        }
        return { valid: true };
      },
      'reserve_ratio': (v) => {
        if (typeof v !== 'number' || v < 0 || v > 1) {
          return { valid: false, error: 'Must be number between 0-1' };
        }
        return { valid: true };
      },
      'reserve_minimum': (v) => {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
          return { valid: false, error: 'Must be non-negative integer' };
        }
        return { valid: true };
      },
      'pulse_ms': (v) => {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 200 || v > 2000) {
          return { valid: false, error: 'Must be integer between 200-2000ms' };
        }
        return { valid: true };
      },
      'open_window_sec': (v) => {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 5 || v > 20) {
          return { valid: false, error: 'Must be integer between 5-20 seconds' };
        }
        return { valid: true };
      },
      'retry_count': (v) => {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 5) {
          return { valid: false, error: 'Must be integer between 0-5' };
        }
        return { valid: true };
      },
      'retry_backoff_ms': (v) => {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 200 || v > 1000) {
          return { valid: false, error: 'Must be integer between 200-1000ms' };
        }
        return { valid: true };
      },
      'card_rate_limit_seconds': (v) => {
        if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > 3600) {
          return { valid: false, error: 'Must be positive integer ≤ 3600 seconds' };
        }
        return { valid: true };
      },
      'locker_rate_limit_per_minute': (v) => {
        if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
          return { valid: false, error: 'Must be positive integer' };
        }
        return { valid: true };
      },
      'command_cooldown_seconds': (v) => {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 60) {
          return { valid: false, error: 'Must be integer between 0-60 seconds' };
        }
        return { valid: true };
      },
      'user_report_daily_cap': (v) => {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
          return { valid: false, error: 'Must be non-negative integer' };
        }
        return { valid: true };
      }
    };

    const validator = validators[key];
    if (!validator) {
      return { valid: false, error: `Unknown configuration key: ${key}` };
    }

    return validator(value);
  }

  /**
   * Validate global configuration completeness
   */
  private validateGlobalConfig(config: any): void {
    const requiredKeys = [
      'smart_assignment_enabled',
      'base_score',
      'score_factor_a',
      'score_factor_b',
      'score_factor_g',
      'top_k_candidates',
      'session_limit_minutes',
      'pulse_ms',
      'open_window_sec',
      'retry_count'
    ];

    for (const key of requiredKeys) {
      if (!(key in config)) {
        throw new Error(`Required configuration key missing: ${key}`);
      }
    }

    // Validate critical values
    if (config.session_limit_minutes !== 180) {
      console.warn(`⚠️  session_limit_minutes is ${config.session_limit_minutes}, expected 180 (config-driven requirement)`);
    }
  }

  /**
   * Check if cached configuration is still valid
   */
  private isCacheValid(config: any): boolean {
    if (!config._loadedAt || !config._version) {
      return false;
    }

    // Cache is valid if version matches and loaded within last 30 seconds
    const cacheAge = Date.now() - config._loadedAt.getTime();
    return config._version === this.lastVersion && cacheAge < 30000;
  }

  /**
   * Invalidate all configuration caches
   */
  private invalidateCache(): void {
    this.configCache.clear();
    this.globalConfigCache = null;
  }

  /**
   * Force cache invalidation (public method for testing)
   */
  forceCacheInvalidation(): void {
    this.invalidateCache();
    console.log('🗑️  Configuration cache forcibly invalidated');
  }

  /**
   * Get hot reload monitoring status
   */
  getHotReloadStatus(): {
    isActive: boolean;
    checkInterval: number;
    jitterRange: number;
    lastVersion: number;
    isShuttingDown: boolean;
  } {
    return {
      isActive: this.hotReloadInterval !== null,
      checkInterval: this.RELOAD_CHECK_INTERVAL_MS,
      jitterRange: this.JITTER_MS,
      lastVersion: this.lastVersion,
      isShuttingDown: this.isShuttingDown
    };
  }

  /**
   * Get configuration history for audit purposes
   */
  async getConfigHistory(kioskId?: string, key?: string, limit: number = 100): Promise<ConfigurationChangeEvent[]> {
    let query = 'SELECT * FROM config_history WHERE 1=1';
    const params: any[] = [];

    if (kioskId !== undefined) {
      query += ' AND kiosk_id = ?';
      params.push(kioskId);
    }

    if (key) {
      query += ' AND key = ?';
      params.push(key);
    }

    query += ' ORDER BY changed_at DESC LIMIT ?';
    params.push(limit);

    const rows = await this.db.all(query, params);
    
    return rows.map(row => ({
      type: row.kiosk_id ? 'kiosk' : 'global',
      kioskId: row.kiosk_id,
      key: row.key,
      oldValue: this.parseConfigValue(row.old_value || 'null', row.data_type),
      newValue: this.parseConfigValue(row.new_value, row.data_type),
      version: 0, // Would need to be tracked separately
      changedBy: row.changed_by,
      timestamp: new Date(row.changed_at)
    }));
  }

  /**
   * Initialize configuration manager
   */
  async initialize(): Promise<void> {
    // Load initial version (no version bump on reads)
    this.lastVersion = await this.getConfigVersion();
    
    // Verify configuration is seeded
    try {
      await this.getGlobalConfig();
      console.log(`Config loaded: version=${this.lastVersion}`);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cleanup resources with proper lifecycle management
   */
  destroy(): void {
    // Set shutdown flag to prevent new operations
    this.isShuttingDown = true;
    
    // Stop hot reload monitoring
    this.stopHotReloadMonitoring();
    
    // Remove all event listeners to prevent memory leaks
    this.removeAllListeners();
    
    // Clear all caches
    this.invalidateCache();
  }

  /**
   * Check if the manager is shutting down
   */
  isShuttingDownState(): boolean {
    return this.isShuttingDown;
  }
}

// Singleton instance
let configurationManager: ConfigurationManager | null = null;

export function getConfigurationManager(db?: DatabaseConnection): ConfigurationManager {
  if (!configurationManager) {
    configurationManager = new ConfigurationManager(db);
  }
  return configurationManager;
}

export function resetConfigurationManager(): void {
  if (configurationManager) {
    configurationManager.destroy();
    configurationManager = null;
  }
}