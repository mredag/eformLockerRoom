import { readFile, writeFile, access } from 'fs/promises';
import { 
  SystemConfig, 
  CompleteSystemConfig, 
  ConfigValidationResult,
  ConfigChangeEvent,
  RelayCard,
  ZoneConfig
} from '../types/system-config';
import { EventType } from '../types/core-entities';
import { EventRepository } from '../database/event-repository';
import { DatabaseManager } from '../database/database-manager';

/**
 * Manages the system's configuration, providing a centralized point for loading,
 * validating, accessing, and updating configuration settings. It supports loading from a JSON file,
 * provides default values, and logs all changes for auditing purposes.
 */
export class ConfigManager {
  private static instances = new Map<string, ConfigManager>();
  private config: CompleteSystemConfig | null = null;
  private configPath: string;
  private eventRepository: EventRepository | null = null;

  /**
   * Private constructor to enforce the singleton pattern.
   * @private
   * @param {string} [configPath='./config/system.json'] - The path to the configuration file.
   */
  private constructor(configPath: string = './config/system.json') {
    this.configPath = configPath;
  }

  /**
   * Gets a singleton instance of the ConfigManager for a given configuration path.
   * @param {string} [configPath] - The path to the configuration file.
   * @returns {ConfigManager} The singleton instance.
   */
  static getInstance(configPath?: string): ConfigManager {
    const key = configPath || './config/system.json';
    if (!ConfigManager.instances.has(key)) {
      ConfigManager.instances.set(key, new ConfigManager(configPath));
    }
    return ConfigManager.instances.get(key)!;
  }

  /**
   * Resets a specific singleton instance. Used for testing.
   * @param {string} [configPath] - The key for the instance to reset.
   */
  static resetInstance(configPath?: string): void {
    const key = configPath || './config/system.json';
    ConfigManager.instances.delete(key);
  }

  /**
   * Resets all singleton instances. Used for global test teardown.
   */
  static resetAllInstances(): void {
    ConfigManager.instances.clear();
  }

  /**
   * Initializes the configuration manager by loading the configuration from its file
   * and setting up the event repository for logging changes.
   */
  async initialize(): Promise<void> {
    await this.loadConfiguration();
    
    try {
      const dbManager = DatabaseManager.getInstance();
      this.eventRepository = new EventRepository(dbManager.getConnection());
    } catch (error) {
      console.warn('Could not initialize event repository for config logging:', error);
    }
  }

  /**
   * Loads the configuration from the file system. If the file does not exist,
   * it creates a default configuration file.
   * @returns {Promise<CompleteSystemConfig>} The loaded or newly created configuration.
   * @throws {Error} If the configuration file is invalid or cannot be parsed.
   */
  async loadConfiguration(): Promise<CompleteSystemConfig> {
    try {
      await access(this.configPath);
      const configData = await readFile(this.configPath, 'utf-8');
      const parsedConfig = JSON.parse(configData);
      
      const validation = this.validateConfiguration(parsedConfig);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
      }

      this.config = parsedConfig as CompleteSystemConfig || this.getDefaultConfiguration();
      return this.config;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        console.log('Configuration file not found, creating default configuration');
        this.config = this.getDefaultConfiguration();
        await this.saveConfiguration();
        return this.config;
      }
      throw error;
    }
  }

  /**
   * Gets the currently loaded complete configuration object.
   * @returns {CompleteSystemConfig} The complete configuration object.
   * @throws {Error} If the configuration has not been initialized.
   */
  getConfiguration(): CompleteSystemConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call initialize() first.');
    }
    return this.config as CompleteSystemConfig;
  }

  /**
   * Gets a flattened and simplified view of the system's operational parameters.
   * @returns {SystemConfig} The simplified system configuration.
   */
  getSystemConfig(): SystemConfig {
    const config = this.getConfiguration();
    return {
      BULK_INTERVAL_MS: config.lockers.bulk_operation_interval_ms,
      RESERVE_TTL_SECONDS: config.lockers.reserve_ttl_seconds,
      OPEN_PULSE_MS: config.hardware.modbus.pulse_duration_ms,
      OPEN_BURST_SECONDS: config.hardware.modbus.burst_duration_seconds,
      OPEN_BURST_INTERVAL_MS: config.hardware.modbus.burst_interval_ms,
      MASTER_LOCKOUT_FAILS: config.lockers.master_lockout_fails,
      MASTER_LOCKOUT_MINUTES: config.lockers.master_lockout_minutes,
      HEARTBEAT_SEC: config.services.kiosk.heartbeat_interval_seconds,
      OFFLINE_SEC: config.lockers.offline_threshold_seconds,
      COMMAND_POLL_INTERVAL_SEC: config.services.kiosk.command_poll_interval_seconds,
      LOG_RETENTION_DAYS: config.logging.retention_days,
      BACKUP_INTERVAL_HOURS: config.database.backup_interval_hours,
      RATE_LIMIT_IP_PER_MIN: config.security.rate_limits.ip_per_minute,
      RATE_LIMIT_CARD_PER_MIN: config.security.rate_limits.card_per_minute,
      RATE_LIMIT_LOCKER_PER_MIN: config.security.rate_limits.locker_per_minute,
      RATE_LIMIT_DEVICE_PER_20_SEC: config.security.rate_limits.device_per_20_seconds,
      QR_TOKEN_TTL_SECONDS: config.qr.token_ttl_seconds,
      PIN_ROTATION_DAYS: config.security.pin_rotation_days,
      SESSION_TIMEOUT_MINUTES: config.services.panel.session_timeout_minutes,
      MAX_LOGIN_ATTEMPTS: config.services.panel.max_login_attempts,
      MODBUS_TIMEOUT_MS: config.hardware.modbus.timeout_ms,
      MODBUS_COMMAND_INTERVAL_MS: config.hardware.modbus.command_interval_ms,
      RFID_DEBOUNCE_MS: config.hardware.rfid.debounce_ms,
      RFID_SCAN_TIMEOUT_MS: config.hardware.rfid.scan_timeout_ms,
      UPDATE_CHECK_INTERVAL_MINUTES: config.services.agent.update_check_interval_minutes,
      DEFAULT_LANGUAGE: config.i18n.default_language,
      SUPPORTED_LANGUAGES: config.i18n.supported_languages
    };
  }

  /**
   * Updates a top-level section of the configuration, validates the changes,
   * saves the new configuration, and logs the event.
   * @param {keyof CompleteSystemConfig} section - The top-level configuration key to update (e.g., 'hardware', 'zones').
   * @param {Partial<CompleteSystemConfig[keyof CompleteSystemConfig]>} updates - The new values to apply to the section.
   * @param {string} changedBy - The identifier of the user or system making the change.
   * @param {string} [reason] - An optional reason for the change.
   */
  async updateConfiguration(
    section: keyof CompleteSystemConfig,
    updates: Partial<CompleteSystemConfig[keyof CompleteSystemConfig]>,
    changedBy: string,
    reason?: string
  ): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const oldValue: any = Array.isArray(this.config[section])
      ? [...(this.config[section] as any)]
      : { ...(this.config[section] as any) };

    let newValue: any;

    if (section === 'zones') {
      const availableCards = this.config.hardware.relay_cards.map((card: RelayCard) => card.slave_address);
      const incomingZones: ZoneConfig[] = Array.isArray(updates) ? (updates as unknown as ZoneConfig[]) : (this.config[section] as unknown as ZoneConfig[]);

      const cleanedZones: ZoneConfig[] = (incomingZones || []).map((z) => {
        const cards = Array.isArray(z.relay_cards)
          ? z.relay_cards.filter((id) => availableCards.includes(id)).sort((a, b) => a - b)
          : [];
        const enabled = cards.length > 0 ? (z.enabled !== false) : false;
        return {
          ...z,
          enabled,
          relay_cards: cards
        } as ZoneConfig;
      });

      newValue = cleanedZones;
    } else {
      newValue = { ...(this.config[section] as any), ...(updates as any) };
    }

    if (section === 'zones' || (section === 'features' && (updates as any)?.zones_enabled !== undefined)) {
      const testConfig = { ...this.config, [section]: newValue };
      
      const zoneValidation = await this.validateZoneConfigurationUpdate(
        section === 'zones' ? newValue as any : testConfig.zones,
        changedBy
      );
      
      if (!zoneValidation.valid) {
        throw new Error(`Zone configuration validation failed: ${zoneValidation.errors.join(', ')}`);
      }
      
      if (zoneValidation.warnings.length > 0) {
        console.warn('⚠️ Zone configuration warnings:', zoneValidation.warnings.join(', '));
      }
    }

    const testConfig = { ...this.config, [section]: newValue } as CompleteSystemConfig;
    const validation = this.validateConfiguration(testConfig);
    
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }

    (this.config[section] as any) = newValue;

    await this.saveConfiguration();

    await this.logConfigChange({
      timestamp: new Date(),
      changed_by: changedBy,
      section: section as string,
      old_value: oldValue,
      new_value: newValue,
      reason
    });

    if (section === 'hardware' && changedBy !== 'auto-sync-prevent-loop') {
      await this.triggerLockerSync(reason || 'Hardware configuration changed');
    }

    if (section === 'zones' && this.config.features?.zones_enabled && changedBy !== 'auto-sync-zone-extension') {
      const enabledCards = this.config.hardware.relay_cards.filter(card => card.enabled);
      const totalChannels = enabledCards.reduce((sum, card) => sum + card.channels, 0);
      
      if (totalChannels > 0) {
        await this.syncZonesWithHardware(totalChannels, reason || 'Zone configuration updated');
      }
    }
  }

  /**
   * A convenience method to update a single parameter within a configuration section.
   * @param {keyof CompleteSystemConfig} section - The section containing the parameter.
   * @param {string} parameter - The name of the parameter to update.
   * @param {any} value - The new value for the parameter.
   * @param {string} changedBy - The identifier of the user or system making the change.
   * @param {string} [reason] - An optional reason for the change.
   */
  async updateParameter(
    section: keyof CompleteSystemConfig,
    parameter: string,
    value: any,
    changedBy: string,
    reason?: string
  ): Promise<void> {
    const updates = { [parameter]: value };
    await this.updateConfiguration(section, updates, changedBy, reason);
  }

  /**
   * Resets the current configuration to the default values.
   * @param {string} changedBy - The identifier of the user or system performing the reset.
   * @param {string} [reason] - An optional reason for the reset.
   */
  async resetToDefaults(changedBy: string, reason?: string): Promise<void> {
    const oldConfig = this.config;
    this.config = this.getDefaultConfiguration();
    
    await this.saveConfiguration();

    await this.logConfigChange({
      timestamp: new Date(),
      changed_by: changedBy,
      section: 'all',
      old_value: oldConfig,
      new_value: this.config,
      reason: reason || 'Reset to defaults'
    });
  }

  /**
   * Validates a given configuration object against a set of rules.
   * @param {any} config - The configuration object to validate.
   * @returns {ConfigValidationResult} An object containing the validation status, errors, and warnings.
   */
  validateConfiguration(config: any): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const requiredSections = ['system', 'database', 'services', 'hardware', 'security', 'lockers', 'qr', 'logging', 'i18n'];
      for (const section of requiredSections) {
        if (!config[section]) {
          errors.push(`Missing required section: ${section}`);
        }
      }

      if (errors.length > 0) {
        return { valid: false, errors, warnings };
      }

      if (!config.system.name || !config.system.version) {
        errors.push('System name and version are required');
      }

      if (!config.database.path) {
        errors.push('Database path is required');
      }

      const ports = [
        config.services.gateway?.port,
        config.services.kiosk?.port,
        config.services.panel?.port
      ];

      for (const port of ports) {
        if (!port || port < 1 || port > 65535) {
          errors.push(`Invalid port number: ${port}`);
        }
      }

      const uniquePorts = new Set(ports);
      if (uniquePorts.size !== ports.length) {
        errors.push('Port conflicts detected in service configuration');
      }

      if (config.lockers.reserve_ttl_seconds < 30) {
        warnings.push('Reserve TTL less than 30 seconds may cause user experience issues');
      }

      if (config.hardware.modbus.pulse_duration_ms < 100 || config.hardware.modbus.pulse_duration_ms > 1000) {
        warnings.push('Modbus pulse duration outside recommended range (100-1000ms)');
      }

      if (config.security.rate_limits.ip_per_minute < 10) {
        warnings.push('IP rate limit very low, may affect normal operation');
      }

      if (config.security.provisioning_secret === 'change-this-in-production' && config.system.environment === 'production') {
        errors.push('Provisioning secret must be changed in production');
      }

      if (config.security.session_secret === 'change-this-in-production' && config.system.environment === 'production') {
        errors.push('Session secret must be changed in production');
      }

      if (config.qr.hmac_secret === 'change-this-in-production' && config.system.environment === 'production') {
        errors.push('QR HMAC secret must be changed in production');
      }

      if (!config.i18n.supported_languages.includes(config.i18n.default_language)) {
        errors.push('Default language must be in supported languages list');
      }

      if (config.features?.zones_enabled && config.zones) {
        for (const zone of config.zones) {
          if (!zone.id || typeof zone.id !== 'string') {
            errors.push('Zone ID is required and must be a string');
          }
          
          if (zone.enabled) {
            if (!Array.isArray(zone.ranges) || zone.ranges.length === 0) {
              errors.push(`Zone ${zone.id}: ranges array is required and cannot be empty when zone is enabled`);
            }
          }
          
          if (zone.enabled) {
            if (!Array.isArray(zone.relay_cards) || zone.relay_cards.length === 0) {
              errors.push(`Zone ${zone.id}: relay_cards array is required and cannot be empty when zone is enabled`);
            }
          }
          
          if (Array.isArray(zone.ranges) && zone.ranges.length > 0) {
            for (const range of zone.ranges) {
              if (!Array.isArray(range) || range.length !== 2 || range[0] >= range[1]) {
                errors.push(`Zone ${zone.id}: invalid range format [${range}]. Expected [start, end] where start < end`);
              }
            }
          }
          
          const availableCards = config.hardware.relay_cards.map((card: RelayCard) => card.slave_address);
          for (const cardId of zone.relay_cards) {
            if (!availableCards.includes(cardId)) {
              warnings.push(`Zone ${zone.id}: references relay card ${cardId} which is not defined in hardware configuration`);
            }
          }
        }
      }

    } catch (error) {
      errors.push(`Configuration validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Returns a complete, default configuration object.
   * @private
   * @returns {CompleteSystemConfig} The default configuration.
   */
  private getDefaultConfiguration(): CompleteSystemConfig {
    return {
      system: {
        name: 'Eform Locker System',
        version: '1.0.0',
        environment: 'production'
      },
      database: {
        path: './data/eform.db',
        wal_mode: true,
        backup_interval_hours: 24,
        retention_days: 30
      },
      services: {
        gateway: {
          port: 3000,
          host: '0.0.0.0',
          max_connections: 100
        },
        kiosk: {
          port: 3001,
          heartbeat_interval_seconds: 10,
          command_poll_interval_seconds: 2
        },
        panel: {
          port: 3002,
          session_timeout_minutes: 60,
          max_login_attempts: 5
        },
        agent: {
          update_check_interval_minutes: 30,
          update_server_url: 'https://updates.eform.local'
        }
      },
      hardware: {
        modbus: {
          port: '/dev/ttyUSB0',
          baudrate: 9600,
          timeout_ms: 1000,
          pulse_duration_ms: 400,
          burst_duration_seconds: 10,
          burst_interval_ms: 2000,
          command_interval_ms: 300
        },
        relay_cards: [
          {
            slave_address: 1,
            channels: 16,
            type: 'waveshare_16ch',
            description: 'Main Locker Bank 1-16',
            enabled: true
          }
        ],
        rfid: {
          reader_type: 'hid',
          debounce_ms: 500,
          scan_timeout_ms: 5000
        }
      },
      security: {
        provisioning_secret: 'change-this-in-production',
        session_secret: 'change-this-in-production',
        pin_rotation_days: 90,
        lockout_duration_minutes: 5,
        rate_limits: {
          ip_per_minute: 30,
          card_per_minute: 60,
          locker_per_minute: 6,
          device_per_20_seconds: 1
        }
      },
      lockers: {
        total_count: 16,
        reserve_ttl_seconds: 90,
        offline_threshold_seconds: 30,
        bulk_operation_interval_ms: 300,
        master_lockout_fails: 5,
        master_lockout_minutes: 5,
        layout: {
          rows: 4,
          columns: 4
        }
      },
      qr: {
        token_ttl_seconds: 5,
        hmac_secret: 'change-this-in-production'
      },
      logging: {
        level: 'info',
        retention_days: 30,
        max_file_size_mb: 100,
        rotate_daily: true
      },
      i18n: {
        default_language: 'tr',
        supported_languages: ['tr', 'en']
      }
    };
  }

  /**
   * Saves the current configuration object to its file path.
   * @private
   */
  private async saveConfiguration(): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration to save');
    }

    const configJson = JSON.stringify(this.config, null, 2);
    await writeFile(this.configPath, configJson, 'utf-8');
  }

  /**
   * Logs a configuration change event to the database for auditing.
   * @private
   * @param {ConfigChangeEvent} change - The details of the configuration change.
   */
  private async logConfigChange(change: ConfigChangeEvent): Promise<void> {
    if (!this.eventRepository) {
      console.log('Config change:', change);
      return;
    }

    try {
      await this.eventRepository.logEvent(
        'system',
        EventType.CONFIG_APPLIED,
        {
          section: change.section,
          old_value: change.old_value,
          new_value: change.new_value,
          reason: change.reason
        },
        undefined,
        undefined,
        undefined,
        change.changed_by
      );
    } catch (error) {
      console.error('Failed to log config change:', error);
    }
  }

  /**
   * Automatically synchronizes zone definitions with the hardware configuration.
   * This is called internally when hardware settings are changed.
   * @private
   * @param {number} totalLockers - The total number of lockers available according to the hardware.
   * @param {string} reason - The reason for the sync.
   */
  private async syncZonesWithHardware(totalLockers: number, reason: string): Promise<void> {
    try {
      console.log(`🔄 Zone sync triggered: ${totalLockers} total lockers (${reason})`);
      
      const { ZoneExtensionService } = await import('./zone-extension-service');
      const zoneService = new ZoneExtensionService();
      
      const backupResult = await this.createConfigurationBackup('zone-sync', reason);
      if (!backupResult.success) {
        console.warn('⚠️ Failed to create configuration backup:', backupResult.error);
        await this.logConfigChange({
          timestamp: new Date(),
          changed_by: 'auto-sync-backup-warning',
          section: 'zones',
          old_value: { backup_attempted: true },
          new_value: { backup_failed: true, error: backupResult.error },
          reason: `Configuration backup failed before zone sync: ${backupResult.error}`
        });
      } else {
        console.log(`📋 Configuration backup created: ${backupResult.backupPath}`);
      }
      
      const validation = zoneService.validateZoneExtension(this.config!, totalLockers);
      
      if (!validation.valid) {
        console.error('❌ Zone extension validation failed:', validation.errors.join(', '));
        
        await this.logConfigChange({
          timestamp: new Date(),
          changed_by: 'auto-sync-zone-validation',
          section: 'zones',
          old_value: this.config!.zones,
          new_value: this.config!.zones,
          reason: `Zone sync validation failed: ${validation.errors.join(', ')}`
        });
        
        return;
      }
      
      if (validation.warnings.length > 0) {
        console.warn('⚠️ Zone extension warnings:', validation.warnings.join(', '));
      }
      
      const syncResult = await zoneService.syncZonesWithHardware(this.config!, totalLockers);
      
      if (syncResult.error) {
        console.error('❌ Zone sync failed:', syncResult.error);
        
        await this.logConfigChange({
          timestamp: new Date(),
          changed_by: 'auto-sync-zone-error',
          section: 'zones',
          old_value: this.config!.zones,
          new_value: this.config!.zones,
          reason: `Zone sync failed: ${syncResult.error}`
        });
        
        return;
      }
      
      if (syncResult.extended) {
        console.log(`✅ Zone extended: ${syncResult.affectedZone} now includes lockers ${syncResult.newRange![0]}-${syncResult.newRange![1]}`);
        
        if (syncResult.mergedRanges) {
          console.log(`🔗 Ranges merged: ${JSON.stringify(syncResult.mergedRanges)}`);
        }
        
        if (syncResult.updatedRelayCards) {
          console.log(`🔧 Relay cards updated: ${JSON.stringify(syncResult.updatedRelayCards)}`);
        }
        
        await this.saveConfiguration();
        
        await this.logConfigChange({
          timestamp: new Date(),
          changed_by: 'auto-sync-zone-extension',
          section: 'zones',
          old_value: { affectedZone: syncResult.affectedZone, previousRanges: 'before_extension' },
          new_value: { 
            affectedZone: syncResult.affectedZone, 
            newRange: syncResult.newRange,
            mergedRanges: syncResult.mergedRanges,
            updatedRelayCards: syncResult.updatedRelayCards
          },
          reason: `Automatic zone extension: ${reason}`
        });
        
      } else {
        console.log('ℹ️ No zone extension needed - zones already cover all lockers');
      }
      
    } catch (error) {
      console.error('❌ Zone sync error:', error);
      
      try {
        await this.logConfigChange({
          timestamp: new Date(),
          changed_by: 'auto-sync-zone-error',
          section: 'zones',
          old_value: this.config!.zones,
          new_value: this.config!.zones,
          reason: `Zone sync error: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      } catch (logError) {
        console.error('Failed to log zone sync error:', logError);
      }
    }
  }

  /**
   * Triggers a locker database sync when the hardware configuration changes.
   * @private
   * @param {string} reason - The reason for the sync.
   */
  private async triggerLockerSync(reason: string): Promise<void> {
    try {
      console.log(`🔄 Config change detected: triggering locker sync (${reason})`);
      
      const enabledCards = this.config!.hardware.relay_cards.filter(card => card.enabled);
      const totalChannels = enabledCards.reduce((sum, card) => sum + card.channels, 0);
      
      if (totalChannels > 0) {
        if (this.config!.features?.zones_enabled) {
          await this.syncZonesWithHardware(totalChannels, reason);
        }
        
        const { LockerStateManager } = await import('./locker-state-manager');
        const { DatabaseConnection } = await import('../database/connection');
        
        const db = DatabaseConnection.getInstance();
        const stateManager = new LockerStateManager(db);
        
        const kioskId = 'kiosk-1';
        await stateManager.syncLockersWithHardware(kioskId, totalChannels);
        
        if (this.config!.lockers.total_count !== totalChannels) {
          console.log(`🔧 Auto-updating locker count: ${this.config!.lockers.total_count} → ${totalChannels}`);
          this.config!.lockers.total_count = totalChannels;
          await this.saveConfiguration();
        }
        
        console.log(`✅ Auto-sync completed: ${totalChannels} lockers available`);
      }
    } catch (error) {
      console.error('❌ Auto-sync failed after config change:', error);
    }
  }

  /**
   * Manually triggers a synchronization between the zone definitions and the hardware configuration.
   * @param {string} changedBy - The identifier of the user or system requesting the sync.
   * @param {string} [reason] - An optional reason for the sync.
   * @returns {Promise<{ success: boolean; message: string; details?: any }>} The result of the sync operation.
   */
  async manualZoneSync(changedBy: string, reason?: string): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      if (!this.config) {
        return { success: false, message: 'Configuration not loaded' };
      }

      if (!this.config.features?.zones_enabled) {
        return { success: false, message: 'Zones are not enabled in configuration' };
      }

      const enabledCards = this.config.hardware.relay_cards.filter(card => card.enabled);
      const totalChannels = enabledCards.reduce((sum, card) => sum + card.channels, 0);

      if (totalChannels === 0) {
        return { success: false, message: 'No enabled relay cards found in hardware configuration' };
      }

      await this.syncZonesWithHardware(totalChannels, reason || `Manual zone sync by ${changedBy}`);

      return { 
        success: true, 
        message: `Zone sync completed successfully for ${totalChannels} lockers`,
        details: { totalChannels, triggeredBy: changedBy }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Manual zone sync failed:', error);
      
      return { 
        success: false, 
        message: `Zone sync failed: ${errorMessage}`,
        details: { error: errorMessage }
      };
    }
  }

  /**
   * Validates a proposed update to the zone configuration.
   * @param {Partial<CompleteSystemConfig['zones']>} zoneUpdates - The proposed zone configuration.
   * @param {string} changedBy - The identifier of the user or system making the change.
   * @returns {Promise<{ valid: boolean; errors: string[]; warnings: string[] }>} The validation result.
   */
  async validateZoneConfigurationUpdate(
    zoneUpdates: Partial<CompleteSystemConfig['zones']>,
    changedBy: string
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    if (!this.config) {
      return { valid: false, errors: ['Configuration not loaded'], warnings: [] };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const testConfig = {
        ...this.config,
        zones: Array.isArray(zoneUpdates) ? zoneUpdates : this.config.zones
      };

      const { ZoneExtensionService } = await import('./zone-extension-service');
      const zoneService = new ZoneExtensionService();

      const enabledCards = this.config.hardware.relay_cards.filter(card => card.enabled);
      const totalHardwareCapacity = enabledCards.reduce((sum, card) => sum + card.channels, 0);

      const validation = zoneService.validateZoneExtension(testConfig as CompleteSystemConfig, totalHardwareCapacity);
      
      errors.push(...validation.errors);
      warnings.push(...validation.warnings);

      if (testConfig.zones && testConfig.features?.zones_enabled && Array.isArray(testConfig.zones)) {
        const validZones = testConfig.zones.filter((zone): zone is NonNullable<typeof zone> => zone != null);
        
        const zoneIds = validZones.map(zone => zone.id);
        const duplicateIds = zoneIds.filter((id, index) => zoneIds.indexOf(id) !== index);
        if (duplicateIds.length > 0) {
          errors.push(`Duplicate zone IDs found: ${duplicateIds.join(', ')}`);
        }

        const emptyIds = validZones.filter(zone => !zone.id || zone.id.trim() === '');
        if (emptyIds.length > 0) {
          errors.push('Zone IDs cannot be empty');
        }

        const invalidIdPattern = /[^a-zA-Z0-9_-]/;
        const invalidIds = validZones.filter(zone => invalidIdPattern.test(zone.id));
        if (invalidIds.length > 0) {
          errors.push(`Zone IDs contain invalid characters: ${invalidIds.map(z => z.id).join(', ')}`);
        }

        const availableCards = this.config.hardware.relay_cards
          .filter(card => card.enabled)
          .map(card => card.slave_address);

        for (const zone of validZones) {
          if (zone.relay_cards && Array.isArray(zone.relay_cards)) {
            for (const cardId of zone.relay_cards) {
              if (!availableCards.includes(cardId)) {
                warnings.push(`Zone ${zone.id} references unavailable relay card ${cardId}`);
              }
            }
          }
        }
      }

      await this.logConfigChange({
        timestamp: new Date(),
        changed_by: changedBy,
        section: 'zones_validation',
        old_value: { validation_requested: true },
        new_value: { 
          valid: errors.length === 0,
          errors: errors.length,
          warnings: warnings.length
        },
        reason: 'Zone configuration validation requested'
      });

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      errors.push(`Validation error: ${errorMessage}`);
      
      return {
        valid: false,
        errors,
        warnings
      };
    }
  }

  /**
   * Retrieves the history of configuration changes.
   * @param {number} [limit=50] - The maximum number of history records to return.
   * @returns {Promise<ConfigChangeEvent[]>} An array of configuration change events.
   */
  async getConfigChangeHistory(limit: number = 50): Promise<ConfigChangeEvent[]> {
    if (!this.eventRepository) {
      return [];
    }

    try {
      const events = await this.eventRepository.findAll({
        event_type: EventType.CONFIG_APPLIED,
        limit
      });

      return events.map(event => ({
        timestamp: event.timestamp,
        changed_by: event.staff_user || 'system',
        section: event.details.section,
        old_value: event.details.old_value,
        new_value: event.details.new_value,
        reason: event.details.reason
      }));
    } catch (error) {
      console.error('Failed to get config change history:', error);
      return [];
    }
  }

  /**
   * Creates a timestamped backup of the current configuration file.
   * @param {string} operation - The operation that triggered the backup (e.g., 'pre-restore').
   * @param {string} reason - The reason for the backup.
   * @returns {Promise<{ success: boolean; backupPath?: string; error?: string }>} The result of the backup operation.
   */
  async createConfigurationBackup(
    operation: string, 
    reason: string
  ): Promise<{ success: boolean; backupPath?: string; error?: string }> {
    try {
      if (!this.config) {
        return { success: false, error: 'No configuration loaded to backup' };
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `system-config-backup-${operation}-${timestamp}.json`;
      const backupPath = `./config/backups/${backupFilename}`;

      const { mkdir } = await import('fs/promises');
      const { dirname } = await import('path');
      
      try {
        await mkdir(dirname(backupPath), { recursive: true });
      } catch (mkdirError) {
      }

      const backupData = {
        metadata: {
          backup_timestamp: new Date().toISOString(),
          original_config_path: this.configPath,
          operation,
          reason,
          system_version: process.env.npm_package_version || 'unknown'
        },
        configuration: this.config
      };

      await writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf8');

      await this.logConfigChange({
        timestamp: new Date(),
        changed_by: 'system-backup',
        section: 'backup',
        old_value: { backup_requested: true },
        new_value: { 
          backup_created: true, 
          backup_path: backupPath,
          operation,
          reason 
        },
        reason: `Configuration backup created for ${operation}: ${reason}`
      });

      return { success: true, backupPath };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown backup error';
      console.error('Failed to create configuration backup:', errorMessage);
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Restores the system configuration from a specified backup file.
   * @param {string} backupPath - The path to the backup file.
   * @param {string} restoredBy - The identifier of the user or system performing the restore.
   * @returns {Promise<{ success: boolean; error?: string }>} The result of the restore operation.
   */
  async restoreConfigurationFromBackup(
    backupPath: string,
    restoredBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await access(backupPath);

      const backupContent = await readFile(backupPath, 'utf8');
      const backupData = JSON.parse(backupContent);

      if (!backupData.configuration || !backupData.metadata) {
        return { success: false, error: 'Invalid backup file structure' };
      }

      const currentBackupResult = await this.createConfigurationBackup(
        'pre-restore', 
        `Backup before restoring from ${backupPath}`
      );

      if (!currentBackupResult.success) {
        console.warn('Failed to backup current config before restore:', currentBackupResult.error);
      }

      const validationResult = await this.validateConfiguration(backupData.configuration);
      if (!validationResult.valid) {
        return { 
          success: false, 
          error: `Backup configuration is invalid: ${validationResult.errors.join(', ')}` 
        };
      }

      const oldConfig = this.config;

      this.config = backupData.configuration;

      await this.saveConfiguration();

      await this.logConfigChange({
        timestamp: new Date(),
        changed_by: restoredBy,
        section: 'full_restore',
        old_value: { 
          config_hash: this.generateConfigHash(oldConfig),
          backup_metadata: 'current_config'
        },
        new_value: { 
          config_hash: this.generateConfigHash(this.config),
          backup_metadata: backupData.metadata,
          restored_from: backupPath
        },
        reason: `Configuration restored from backup: ${backupPath}`
      });

      console.log(`✅ Configuration restored from backup: ${backupPath}`);
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown restore error';
      console.error('Failed to restore configuration from backup:', errorMessage);
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Generates a SHA-256 hash of a configuration object for quick comparison.
   * @private
   * @param {CompleteSystemConfig | null} config - The configuration object to hash.
   * @returns {string} A 16-character hash string.
   */
  private generateConfigHash(config: CompleteSystemConfig | null): string {
    if (!config) return 'null';
    
    try {
      const { createHash } = require('crypto');
      const configString = JSON.stringify(config, Object.keys(config).sort());
      return createHash('sha256').update(configString).digest('hex').substring(0, 16);
    } catch (error) {
      return 'hash_error';
    }
  }
}

/**
 * A singleton instance of the ConfigManager for easy access throughout the application.
 */
export const configManager = ConfigManager.getInstance();
