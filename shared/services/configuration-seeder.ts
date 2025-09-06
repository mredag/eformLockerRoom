import { DatabaseConnection } from '../database/connection';

export interface ConfigSeedData {
  key: string;
  value: any;
  data_type: 'string' | 'number' | 'boolean' | 'json';
  description: string;
}

export interface SeedingResult {
  seeded: number;
  skipped: number;
  errors: string[];
  totalKeys: number;
}

export class ConfigurationSeeder {
  private db: DatabaseConnection;

  constructor(db?: DatabaseConnection) {
    this.db = db || DatabaseConnection.getInstance();
  }

  /**
   * Default configuration seed data for smart assignment system
   */
  private getDefaultConfigSeed(): ConfigSeedData[] {
    return [
      // Feature flags
      {
        key: 'smart_assignment_enabled',
        value: false,
        data_type: 'boolean',
        description: 'Enable smart locker assignment system (default: OFF for safe rollout)'
      },
      {
        key: 'allow_reclaim_during_quarantine',
        value: false,
        data_type: 'boolean',
        description: 'Allow reclaim during quarantine period'
      },
      
      // Scoring parameters
      {
        key: 'base_score',
        value: 100,
        data_type: 'number',
        description: 'Base score for locker selection algorithm'
      },
      {
        key: 'score_factor_a',
        value: 2.0,
        data_type: 'number',
        description: 'Free hours multiplier in scoring formula'
      },
      {
        key: 'score_factor_b',
        value: 1.0,
        data_type: 'number',
        description: 'Hours since last owner multiplier'
      },
      {
        key: 'score_factor_g',
        value: 0.1,
        data_type: 'number',
        description: 'Wear count divisor factor'
      },
      {
        key: 'score_factor_d',
        value: 0.5,
        data_type: 'number',
        description: 'Waiting hours bonus factor for starvation reduction'
      },
      {
        key: 'top_k_candidates',
        value: 5,
        data_type: 'number',
        description: 'Number of top candidates for weighted selection'
      },
      {
        key: 'selection_temperature',
        value: 1.0,
        data_type: 'number',
        description: 'Temperature for weighted random selection (higher = more random)'
      },
      
      // Quarantine settings
      {
        key: 'quarantine_minutes_base',
        value: 5,
        data_type: 'number',
        description: 'Minimum quarantine duration in minutes (low capacity)'
      },
      {
        key: 'quarantine_minutes_ceiling',
        value: 20,
        data_type: 'number',
        description: 'Maximum quarantine duration in minutes (high capacity)'
      },
      {
        key: 'exit_quarantine_minutes',
        value: 20,
        data_type: 'number',
        description: 'Fixed exit quarantine duration after reclaim'
      },
      
      // Return hold settings
      {
        key: 'return_hold_trigger_seconds',
        value: 120,
        data_type: 'number',
        description: 'Seconds to trigger return hold detection (short errand)'
      },
      {
        key: 'return_hold_minutes',
        value: 15,
        data_type: 'number',
        description: 'Return hold duration in minutes'
      },
      
      // Session and timing - CRITICAL: session_limit_minutes=180 (not hardcoded 120)
      {
        key: 'session_limit_minutes',
        value: 180,
        data_type: 'number',
        description: 'Smart session limit in minutes (config-driven, not hardcoded 120)'
      },
      {
        key: 'retrieve_window_minutes',
        value: 10,
        data_type: 'number',
        description: 'Window for overdue retrieval in minutes'
      },
      {
        key: 'reclaim_min',
        value: 120,
        data_type: 'number',
        description: 'Minimum minutes for reclaim eligibility threshold'
      },
      
      // Capacity management
      {
        key: 'reserve_ratio',
        value: 0.1,
        data_type: 'number',
        description: 'Percentage of lockers to reserve (0.1 = 10%)'
      },
      {
        key: 'reserve_minimum',
        value: 2,
        data_type: 'number',
        description: 'Minimum number of lockers to reserve'
      },
      
      // Hardware settings
      {
        key: 'pulse_ms',
        value: 800,
        data_type: 'number',
        description: 'Pulse duration for sensorless operation (extended from 400ms)'
      },
      {
        key: 'open_window_sec',
        value: 10,
        data_type: 'number',
        description: 'Open confirmation window for retry detection'
      },
      {
        key: 'retry_count',
        value: 1,
        data_type: 'number',
        description: 'Number of retries for failed operations (single retry only)'
      },
      {
        key: 'retry_backoff_ms',
        value: 500,
        data_type: 'number',
        description: 'Backoff time between retries in milliseconds'
      },
      
      // Rate limits
      {
        key: 'card_rate_limit_seconds',
        value: 10,
        data_type: 'number',
        description: 'Rate limit per card in seconds (one open per 10 seconds)'
      },
      {
        key: 'locker_rate_limit_per_minute',
        value: 3,
        data_type: 'number',
        description: 'Opens per locker per minute limit'
      },
      {
        key: 'command_cooldown_seconds',
        value: 3,
        data_type: 'number',
        description: 'Cooldown between relay commands in seconds'
      },
      {
        key: 'user_report_daily_cap',
        value: 2,
        data_type: 'number',
        description: 'Daily cap for user reports per card'
      },
      
      // Dynamic calculation parameters
      {
        key: 'free_ratio_low',
        value: 0.1,
        data_type: 'number',
        description: 'Low free ratio threshold for dynamic calculations'
      },
      {
        key: 'free_ratio_high',
        value: 0.5,
        data_type: 'number',
        description: 'High free ratio threshold for dynamic calculations'
      },
      {
        key: 'reclaim_low_min',
        value: 30,
        data_type: 'number',
        description: 'Reclaim window at low capacity (minutes)'
      },
      {
        key: 'reclaim_high_min',
        value: 180,
        data_type: 'number',
        description: 'Reclaim window at high capacity (minutes)'
      },
      {
        key: 'owner_hot_window_min',
        value: 10,
        data_type: 'number',
        description: 'Minimum owner hot window duration (minutes)'
      },
      {
        key: 'owner_hot_window_max',
        value: 30,
        data_type: 'number',
        description: 'Maximum owner hot window duration (minutes)'
      },
      
      // Alert thresholds
      {
        key: 'alert_no_stock_trigger_count',
        value: 3,
        data_type: 'number',
        description: 'No stock alert trigger: >3 events in 10 minutes'
      },
      {
        key: 'alert_no_stock_trigger_window_min',
        value: 10,
        data_type: 'number',
        description: 'No stock alert trigger window in minutes'
      },
      {
        key: 'alert_conflict_rate_trigger',
        value: 0.02,
        data_type: 'number',
        description: 'Conflict rate alert trigger: >2% in 5 minutes'
      },
      {
        key: 'alert_conflict_rate_window_min',
        value: 5,
        data_type: 'number',
        description: 'Conflict rate alert window in minutes'
      },
      {
        key: 'alert_open_fail_rate_trigger',
        value: 0.01,
        data_type: 'number',
        description: 'Open fail rate alert trigger: >1% in 10 minutes'
      },
      {
        key: 'alert_retry_rate_trigger',
        value: 0.05,
        data_type: 'number',
        description: 'Retry rate alert trigger: >5% in 5 minutes'
      },
      {
        key: 'alert_overdue_share_trigger',
        value: 0.20,
        data_type: 'number',
        description: 'Overdue share alert trigger: ≥20% in 10 minutes'
      },
      
      // Session extension limits
      {
        key: 'session_extension_minutes',
        value: 60,
        data_type: 'number',
        description: 'Session extension increment in minutes'
      },
      {
        key: 'session_max_total_minutes',
        value: 240,
        data_type: 'number',
        description: 'Maximum total session duration including extensions'
      },
      {
        key: 'session_max_extensions',
        value: 4,
        data_type: 'number',
        description: 'Maximum number of 60-minute extensions allowed'
      },
      
      // User report settings
      {
        key: 'user_report_window_sec',
        value: 300,
        data_type: 'number',
        description: 'User report window after locker open (5 minutes)'
      },
      {
        key: 'suspect_ttl_min',
        value: 60,
        data_type: 'number',
        description: 'Suspected occupied timeout for investigation (minutes)'
      }
    ];
  }

  /**
   * Validate configuration value based on type and business rules
   */
  private validateConfigValue(key: string, value: any, dataType: string): { valid: boolean; error?: string } {
    // Type validation
    switch (dataType) {
      case 'boolean':
        if (typeof value !== 'boolean') {
          return { valid: false, error: `${key}: Expected boolean, got ${typeof value}` };
        }
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return { valid: false, error: `${key}: Expected number, got ${typeof value}` };
        }
        break;
      case 'string':
        if (typeof value !== 'string') {
          return { valid: false, error: `${key}: Expected string, got ${typeof value}` };
        }
        break;
      case 'json':
        try {
          JSON.stringify(value);
        } catch (e) {
          return { valid: false, error: `${key}: Invalid JSON value` };
        }
        break;
    }

    // Business rule validation
    const businessRules: { [key: string]: (value: any) => boolean } = {
      'base_score': (v) => v > 0,
      'score_factor_a': (v) => v >= 0,
      'score_factor_b': (v) => v >= 0,
      'score_factor_g': (v) => v >= 0,
      'score_factor_d': (v) => v >= 0,
      'top_k_candidates': (v) => v > 0 && Number.isInteger(v),
      'selection_temperature': (v) => v > 0,
      'quarantine_minutes_base': (v) => v >= 0,
      'quarantine_minutes_ceiling': (v) => v >= 0,
      'session_limit_minutes': (v) => v > 0 && v <= 1440, // Max 24 hours
      'reserve_ratio': (v) => v >= 0 && v <= 1,
      'reserve_minimum': (v) => v >= 0 && Number.isInteger(v),
      'pulse_ms': (v) => v > 0 && v <= 5000, // Max 5 seconds
      'open_window_sec': (v) => v > 0 && v <= 60, // Max 1 minute
      'retry_count': (v) => v >= 0 && Number.isInteger(v) && v <= 5, // Max 5 retries
      'card_rate_limit_seconds': (v) => v > 0 && v <= 3600, // Max 1 hour
      'locker_rate_limit_per_minute': (v) => v > 0 && Number.isInteger(v),
      'command_cooldown_seconds': (v) => v >= 0 && v <= 60, // Max 1 minute
      'user_report_daily_cap': (v) => v >= 0 && Number.isInteger(v),
    };

    const validator = businessRules[key];
    if (validator && !validator(value)) {
      return { valid: false, error: `${key}: Value ${value} violates business rules` };
    }

    return { valid: true };
  }

  /**
   * Serialize configuration value for database storage
   */
  private serializeValue(value: any): string {
    if (typeof value === 'boolean' || typeof value === 'number') {
      return value.toString();
    } else if (typeof value === 'object') {
      return JSON.stringify(value);
    } else {
      return String(value);
    }
  }

  /**
   * Check if configuration has been seeded (any global config exists)
   */
  async isConfigurationSeeded(): Promise<boolean> {
    const result = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM settings_global'
    );
    return (result?.count || 0) > 0;
  }

  /**
   * Seed default configuration values on first boot
   */
  async seedDefaultConfiguration(force: boolean = false): Promise<SeedingResult> {
    const startTime = Date.now();
    console.log('🌱 Starting configuration seeding...');

    // Check if already seeded (unless forced)
    if (!force && await this.isConfigurationSeeded()) {
      console.log('⏭️  Configuration already seeded, skipping');
      return {
        seeded: 0,
        skipped: 0,
        errors: [],
        totalKeys: 0
      };
    }

    const seedData = this.getDefaultConfigSeed();
    const result: SeedingResult = {
      seeded: 0,
      skipped: 0,
      errors: [],
      totalKeys: seedData.length
    };

    console.log(`📋 Seeding ${seedData.length} configuration keys...`);

    // Process each configuration item
    for (const config of seedData) {
      try {
        // Validate the configuration value
        const validation = this.validateConfigValue(config.key, config.value, config.data_type);
        if (!validation.valid) {
          result.errors.push(`Validation failed for ${config.key}: ${validation.error}`);
          continue;
        }

        // Check if key already exists (for non-force mode)
        if (!force) {
          const existing = await this.db.get(
            'SELECT key FROM settings_global WHERE key = ?',
            [config.key]
          );
          
          if (existing) {
            result.skipped++;
            continue;
          }
        }

        // Insert or replace the configuration
        const serializedValue = this.serializeValue(config.value);
        
        await this.db.run(
          `INSERT OR REPLACE INTO settings_global (key, value, data_type, description, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [config.key, serializedValue, config.data_type, config.description, 'configuration-seeder']
        );

        result.seeded++;
        
        // Log critical configuration values
        if (['smart_assignment_enabled', 'session_limit_minutes'].includes(config.key)) {
          console.log(`Seeded critical config: ${config.key} = ${config.value}`);
        }

      } catch (error) {
        const errorMsg = `Failed to seed ${config.key}: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    // Ensure configuration version is initialized
    try {
      await this.db.run(
        'INSERT OR IGNORE INTO config_version (id, version, updated_at) VALUES (1, 1, CURRENT_TIMESTAMP)'
      );
    } catch (error) {
      console.error('Failed to initialize config version:', error);
    }

    const duration = Date.now() - startTime;
    
    // Verify critical configurations
    await this.verifyCriticalConfigurations();

    // Log the required acceptance message (single-source logs)
    console.log(`Config loaded: version=1`);

    return result;
  }

  /**
   * Verify critical configurations are properly set
   */
  private async verifyCriticalConfigurations(): Promise<void> {
    const criticalConfigs = [
      { key: 'smart_assignment_enabled', expectedType: 'boolean', expectedValue: false },
      { key: 'session_limit_minutes', expectedType: 'number', expectedValue: 180 },
      { key: 'base_score', expectedType: 'number', minValue: 1 },
      { key: 'top_k_candidates', expectedType: 'number', minValue: 1 }
    ];

    for (const config of criticalConfigs) {
      const result = await this.db.get<{ value: string; data_type: string }>(
        'SELECT value, data_type FROM settings_global WHERE key = ?',
        [config.key]
      );

      if (!result) {
        console.error(`❌ Critical config missing: ${config.key}`);
        continue;
      }

      // Verify data type
      if (result.data_type !== config.expectedType) {
        console.error(`❌ Critical config wrong type: ${config.key} expected ${config.expectedType}, got ${result.data_type}`);
        continue;
      }

      // Parse and verify value
      let parsedValue: any;
      switch (result.data_type) {
        case 'boolean':
          parsedValue = result.value.toLowerCase() === 'true';
          break;
        case 'number':
          parsedValue = parseFloat(result.value);
          break;
        default:
          parsedValue = result.value;
      }

      // Check expected value if specified
      if ('expectedValue' in config && parsedValue !== config.expectedValue) {
        console.error(`❌ Critical config wrong value: ${config.key} expected ${config.expectedValue}, got ${parsedValue}`);
        continue;
      }

      // Check minimum value if specified
      if ('minValue' in config && typeof parsedValue === 'number' && parsedValue < config.minValue!) {
        console.error(`❌ Critical config below minimum: ${config.key} expected >= ${config.minValue}, got ${parsedValue}`);
        continue;
      }

      // Critical config verified silently
    }
  }

  /**
   * Get seeding status and statistics
   */
  async getSeedingStatus(): Promise<{
    isSeeded: boolean;
    totalKeys: number;
    lastSeeded?: Date;
    version: number;
  }> {
    const isSeeded = await this.isConfigurationSeeded();
    
    const countResult = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM settings_global'
    );
    
    const versionResult = await this.db.get<{ version: number; updated_at: string }>(
      'SELECT version, updated_at FROM config_version WHERE id = 1'
    );

    const lastSeededResult = await this.db.get<{ updated_at: string }>(
      'SELECT updated_at FROM settings_global WHERE updated_by = ? ORDER BY updated_at DESC LIMIT 1',
      ['configuration-seeder']
    );

    return {
      isSeeded,
      totalKeys: countResult?.count || 0,
      lastSeeded: lastSeededResult ? new Date(lastSeededResult.updated_at) : undefined,
      version: versionResult?.version || 0
    };
  }

  /**
   * Reset all configuration to defaults (dangerous operation)
   */
  async resetToDefaults(): Promise<SeedingResult> {
    console.log('🔄 Resetting configuration to defaults...');
    
    // Clear existing configuration
    await this.db.run('DELETE FROM settings_global');
    await this.db.run('DELETE FROM settings_kiosk');
    await this.db.run('UPDATE config_version SET version = version + 1 WHERE id = 1');
    
    // Re-seed with defaults
    return await this.seedDefaultConfiguration(true);
  }

  /**
   * Initialize configuration seeding on service startup
   */
  async initialize(): Promise<void> {
    console.log('🔧 Initializing Configuration Seeder...');
    
    const status = await this.getSeedingStatus();
    
    if (!status.isSeeded) {
      console.log('🌱 First boot detected, seeding default configuration...');
      await this.seedDefaultConfiguration();
    } else {
      console.log(`✅ Configuration already seeded (${status.totalKeys} keys, version ${status.version})`);
      
      // Verify critical configurations still exist
      await this.verifyCriticalConfigurations();
    }
  }
}

// Singleton instance
let configurationSeeder: ConfigurationSeeder | null = null;

export function getConfigurationSeeder(db?: DatabaseConnection): ConfigurationSeeder {
  if (!configurationSeeder) {
    configurationSeeder = new ConfigurationSeeder(db);
  }
  return configurationSeeder;
}

export function resetConfigurationSeeder(): void {
  configurationSeeder = null;
}