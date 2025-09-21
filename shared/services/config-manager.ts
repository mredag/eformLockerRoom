import { readFile, writeFile, access, open, unlink, mkdir } from 'fs/promises';
import { watch, FSWatcher } from 'fs';
import { setTimeout as delay } from 'timers/promises';
import { dirname } from 'path';
import { EventEmitter } from 'events';
import {
  SystemConfig,
  CompleteSystemConfig,
  ConfigValidationResult,
  ConfigChangeEvent,
  RelayCard,
  ZoneConfig,
  LockerAssignmentMode,
  KioskAssignmentConfig
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
  private eventEmitter = new EventEmitter();
  private fileWatcher: FSWatcher | null = null;
  private watchDebounceTimer: NodeJS.Timeout | null = null;
  private isSaving = false;

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
    const instance = ConfigManager.instances.get(key);
    if (instance) {
      instance.dispose();
    }
    ConfigManager.instances.delete(key);
  }

  /**
   * Resets all singleton instances. Used for global test teardown.
   */
  static resetAllInstances(): void {
    for (const instance of ConfigManager.instances.values()) {
      instance.dispose();
    }
    ConfigManager.instances.clear();
  }

  /**
   * Sets the path to the configuration file. This should be called before initialize().
   * @param {string} path - The new path to the configuration file.
   */
  setConfigPath(path: string): void {
    this.configPath = path;
  }

  private dispose(): void {
    this.eventEmitter.removeAllListeners();

    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
      this.watchDebounceTimer = null;
    }

    if (this.fileWatcher) {
      try {
        this.fileWatcher.close();
      } catch (error) {
        console.warn('Failed to close configuration watcher:', error);
      }
      this.fileWatcher = null;
    }

    this.isSaving = false;
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

    if (this.shouldWatchConfigFile()) {
      this.setupFileWatcher();
    }
  }

  private shouldWatchConfigFile(): boolean {
    if (process.env.CONFIG_MANAGER_DISABLE_WATCH === '1') {
      return false;
    }

    if (process.env.NODE_ENV === 'test') {
      return false;
    }

    return true;
  }

  private setupFileWatcher(): void {
    if (this.fileWatcher) {
      return;
    }

    try {
      this.fileWatcher = watch(this.configPath, { persistent: false }, (eventType) => {
        if (eventType !== 'change' && eventType !== 'rename') {
          return;
        }

        if (this.isSaving) {
          return;
        }

        if (this.watchDebounceTimer) {
          clearTimeout(this.watchDebounceTimer);
        }

        const shouldRestartWatcher = eventType === 'rename';

        this.watchDebounceTimer = setTimeout(() => {
          if (shouldRestartWatcher) {
            this.restartFileWatcher();
          }
          void this.reloadConfigurationFromDisk();
        }, 200);
      });
    } catch (error) {
      console.warn('⚠️  Failed to watch configuration file for changes:', error);
    }
  }

  private restartFileWatcher(): void {
    if (this.fileWatcher) {
      try {
        this.fileWatcher.close();
      } catch (error) {
        console.warn('Failed to close configuration watcher during restart:', error);
      }
      this.fileWatcher = null;
    }

    this.setupFileWatcher();
  }

  private async reloadConfigurationFromDisk(): Promise<void> {
    try {
      await access(this.configPath);
    } catch (error) {
      console.warn('⚠️  Configuration file not accessible for reload:', error);
      return;
    }

    try {
      const previousSnapshot = this.config ? JSON.stringify(this.config) : null;
      const configData = await readFile(this.configPath, 'utf-8');
      const parsedConfig = JSON.parse(configData);

      const validation = this.validateConfiguration(parsedConfig);
      if (!validation.valid) {
        console.warn('⚠️  Ignoring external configuration update due to validation errors:', validation.errors.join(', '));
        return;
      }

      this.config = parsedConfig as CompleteSystemConfig;

      const updatedSnapshot = JSON.stringify(this.config);
      if (!previousSnapshot || previousSnapshot !== updatedSnapshot) {
        this.notifyConfigUpdated();
      }
    } catch (error) {
      console.warn('⚠️  Failed to reload configuration after external change:', error);
    }
  }

  private notifyConfigUpdated(): void {
    if (!this.config) {
      return;
    }

    const snapshot = this.cloneConfiguration(this.config);
    this.eventEmitter.emit('updated', snapshot);
  }

  private cloneConfiguration(source?: CompleteSystemConfig | null): CompleteSystemConfig {
    const payload = source ?? this.config;
    if (!payload) {
      throw new Error('Configuration not loaded');
    }

    return JSON.parse(JSON.stringify(payload)) as CompleteSystemConfig;
  }

  onConfigChange(listener: (config: CompleteSystemConfig) => void): () => void {
    const wrappedListener = (config: CompleteSystemConfig) => {
      listener(this.cloneConfiguration(config));
    };

    this.eventEmitter.on('updated', wrappedListener);

    if (this.config) {
      listener(this.cloneConfiguration(this.config));
    }

    return () => {
      this.eventEmitter.off('updated', wrappedListener);
    };
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
      this.notifyConfigUpdated();
      return this.config;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        console.log('Configuration file not found, creating default configuration');
        this.config = this.getDefaultConfiguration();
        await this.saveConfiguration({
          operation: 'initial-write',
          reason: 'Generated default configuration',
          skipBackup: true
        });
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
      RESERVE_TTL_SECONDS: config.lockers.reserve_ttl_seconds ?? null,
      AUTO_RELEASE_HOURS: config.lockers.auto_release_hours ?? null,
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

  getKioskAssignmentMode(kioskId: string): LockerAssignmentMode {
    try {
      const config = this.getConfiguration();
      const assignment: KioskAssignmentConfig | undefined = config.services?.kiosk?.assignment;

      if (assignment) {
        const override = assignment.per_kiosk?.[kioskId];
        if (override === 'automatic' || override === 'manual') {
          return override;
        }

        if (assignment.default_mode === 'automatic' || assignment.default_mode === 'manual') {
          return assignment.default_mode;
        }
      }
    } catch (error) {
      console.warn('Failed to determine kiosk assignment mode, defaulting to manual:', error);
    }

    return 'manual';
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

    const currentSection = this.config[section];
    const oldValue = this.cloneValue(currentSection);

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
    } else if (this.isPlainObject(currentSection) && this.isPlainObject(updates)) {
      newValue = this.deepMergeObjects(currentSection as any, updates as any);
    } else if (Array.isArray(currentSection) && Array.isArray(updates)) {
      newValue = updates.map(item => this.cloneValue(item));
    } else if (updates !== undefined) {
      newValue = updates;
    } else {
      newValue = currentSection;
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

    const previousSnapshot = this.cloneConfiguration(this.config);

    (this.config[section] as any) = newValue;

    await this.saveConfiguration({
      operation: `update-${String(section)}`,
      reason: reason || `Configuration section '${String(section)}' updated`,
      backupSnapshot: previousSnapshot
    });

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
    const oldConfig = this.config ? this.cloneConfiguration(this.config) : null;
    this.config = this.getDefaultConfiguration();

    await this.saveConfiguration({
      operation: 'reset-to-defaults',
      reason: reason || 'Reset to defaults',
      backupSnapshot: oldConfig,
      skipBackup: !oldConfig
    });

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

      if (
        typeof config.lockers.reserve_ttl_seconds === 'number' &&
        config.lockers.reserve_ttl_seconds < 30
      ) {
        warnings.push('Reserve TTL less than 30 seconds may cause user experience issues');
      }

      if (config.lockers.auto_release_hours !== undefined && config.lockers.auto_release_hours !== null) {
        if (typeof config.lockers.auto_release_hours !== 'number' || isNaN(config.lockers.auto_release_hours)) {
          errors.push('Auto release hours must be a numeric value');
        } else if (config.lockers.auto_release_hours <= 0) {
          warnings.push('Auto release hours is non-positive; automatic cleanup will be disabled');
        } else if (config.lockers.auto_release_hours < 0.5) {
          warnings.push('Auto release hours less than 0.5 may release lockers too aggressively');
        }
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
        name: 'Eform Locker Room System',
        version: '1.0.0',
        environment: 'production',
        location: 'Locker Room - Raspberry Pi',
        installation_date: '2025-08-22',
        hardware_platform: 'raspberry_pi_4'
      },
      features: {
        zones_enabled: true
      },
      zones: [
        {
          id: 'mens',
          ranges: [[1, 32]],
          relay_cards: [1, 2],
          enabled: true
        },
        {
          id: 'womens',
          ranges: [[33, 48]],
          relay_cards: [3],
          enabled: true
        }
      ],
      database: {
        path: './data/eform.db',
        wal_mode: true,
        backup_interval_hours: 6,
        retention_days: 90,
        vacuum_interval_hours: 168,
        checkpoint_interval_seconds: 300
      },
      services: {
        gateway: {
          port: 3000,
          host: '0.0.0.0',
          max_connections: 50,
          request_timeout_ms: 30000,
          keep_alive_timeout_ms: 5000
        },
        kiosk: {
          port: 3002,
          host: '0.0.0.0',
          heartbeat_interval_seconds: 5,
          command_poll_interval_seconds: 1,
          hardware_check_interval_seconds: 30,
          ui_timeout_seconds: 60,
          assignment: {
            default_mode: 'manual',
            per_kiosk: {},
          }
        },
        panel: {
          port: 3001,
          host: '0.0.0.0',
          session_timeout_minutes: 120,
          max_login_attempts: 3,
          lockout_duration_minutes: 15,
          csrf_protection: true
        },
        agent: {
          update_check_interval_minutes: 60,
          update_server_url: 'https://github.com/mredag/eformLockerRoom/releases',
          auto_update: false,
          backup_before_update: true
        }
      },
      hardware: {
        modbus: {
          port: '/dev/ttyUSB0',
          baudrate: 9600,
          timeout_ms: 2000,
          pulse_duration_ms: 400,
          burst_duration_seconds: 10,
          burst_interval_ms: 2000,
          command_interval_ms: 300,
          use_multiple_coils: true,
          verify_writes: true,
          max_retries: 4,
          retry_delay_base_ms: 1000,
          connection_retry_attempts: 5,
          test_mode: false
        },
        relay_cards: [
          {
            slave_address: 1,
            channels: 16,
            type: 'waveshare_16ch',
            dip_switches: '00000001',
            description: 'Locker Bank 1-16 (Card 1)',
            enabled: true
          },
          {
            slave_address: 2,
            channels: 16,
            type: 'waveshare_16ch',
            dip_switches: '00000010',
            description: 'Locker Bank 17-32 (Card 2)',
            enabled: true
          },
          {
            slave_address: 3,
            channels: 16,
            type: 'waveshare_16ch',
            dip_switches: '00000011',
            description: 'Dolap Bankası 33-48',
            enabled: true
          }
        ],
        rfid: {
          reader_type: 'hid',
          debounce_ms: 1000,
          scan_timeout_ms: 10000,
          auto_detect: true,
          fallback_to_keyboard: true,
          vendor_id: null,
          product_id: null
        },
        display: {
          type: 'touchscreen',
          resolution: '1024x600',
          brightness: 80,
          screensaver_timeout_minutes: 5
        }
      },
      security: {
        provisioning_secret: 'eform-pi-locker-2025-secure-key-change-in-prod',
        session_secret: 'eform-session-secret-2025-change-in-production',
        pin_rotation_days: 30,
        lockout_duration_minutes: 10,
        rate_limits: {
          ip_per_minute: 20,
          card_per_minute: 30,
          locker_per_minute: 3,
          device_per_20_seconds: 1,
          api_per_minute: 100
        },
        encryption: {
          algorithm: 'aes-256-gcm',
          key_rotation_days: 90
        },
        audit: {
          log_all_actions: true,
          retention_days: 365,
          alert_on_suspicious: true
        }
      },
      lockers: {
        total_count: 48,
        offline_threshold_seconds: 60,
        bulk_operation_interval_ms: 500,
        master_lockout_fails: 3,
        master_lockout_minutes: 30,
        auto_release_hours: 2,
        maintenance_mode: false,
        layout: {
          rows: 7,
          columns: 7,
          numbering_scheme: 'sequential'
        },
        reserve_ttl_seconds: null
      },
      qr: {
        token_ttl_seconds: 10,
        hmac_secret: 'eform-qr-hmac-secret-2025-change-in-production',
        max_scans_per_token: 1,
        rate_limit_per_minute: 10
      },
      logging: {
        level: 'info',
        retention_days: 90,
        max_file_size_mb: 50,
        rotate_daily: true,
        compress_old_logs: true,
        syslog_enabled: false,
        remote_logging: false
      },
      i18n: {
        default_language: 'tr',
        supported_languages: ['tr', 'en'],
        fallback_language: 'en',
        auto_detect_browser: true
      },
      monitoring: {
        health_check_interval_seconds: 30,
        performance_metrics: true,
        hardware_monitoring: true,
        disk_space_alert_threshold_percent: 85,
        memory_alert_threshold_percent: 90,
        temperature_alert_celsius: 70
      },
      backup: {
        enabled: true,
        schedule: '0 2 * * *',
        retention_count: 7,
        compress: true,
        remote_backup: false,
        backup_path: './backups'
      },
      network: {
        hostname: 'pi-eform-locker',
        wifi_fallback: true,
        ethernet_priority: true,
        ntp_servers: ['pool.ntp.org', 'time.google.com'],
        dns_servers: ['8.8.8.8', '1.1.1.1']
      },
      maintenance: {
        auto_restart_on_error: true,
        max_restart_attempts: 3,
        restart_cooldown_minutes: 5,
        scheduled_maintenance_hour: 3,
        update_notifications: true
      }
    };
  }

  private async ensureConfigDirectory(): Promise<void> {
    try {
      await mkdir(dirname(this.configPath), { recursive: true });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private async acquireFileLock(): Promise<() => Promise<void>> {
    const lockPath = `${this.configPath}.lock`;

    while (true) {
      try {
        const handle = await open(lockPath, 'wx');

        return async () => {
          try {
            await handle.close();
          } catch (closeError) {
            console.warn('Failed to close configuration lock handle:', closeError);
          }

          try {
            await unlink(lockPath);
          } catch (unlinkError) {
            if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') {
              console.warn('Failed to remove configuration lock file:', unlinkError);
            }
          }
        };
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'EEXIST') {
          await delay(50);
          continue;
        }

        throw error;
      }
    }
  }

  private cloneValue<T>(value: T): T {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'object') {
      return JSON.parse(JSON.stringify(value));
    }

    return value;
  }

  private isPlainObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private deepMergeObjects<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result: Record<string, any> = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) {
        continue;
      }

      const existing = result[key];

      if (this.isPlainObject(existing) && this.isPlainObject(value)) {
        result[key] = this.deepMergeObjects(existing, value as Record<string, any>);
      } else if (Array.isArray(existing) && Array.isArray(value)) {
        result[key] = value.slice();
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  /**
   * Saves the current configuration object to its file path.
   * @private
   */
  private async saveConfiguration(options: {
    operation?: string;
    reason?: string;
    backupSnapshot?: CompleteSystemConfig | null;
    skipBackup?: boolean;
  } = {}): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration to save');
    }

    await this.ensureConfigDirectory();
    const releaseLock = await this.acquireFileLock();
    this.isSaving = true;
    let writeSucceeded = false;

    try {
      if (!options.skipBackup) {
        const snapshot = options.backupSnapshot
          ? this.cloneConfiguration(options.backupSnapshot)
          : this.cloneConfiguration(this.config);

        const backupResult = await this.createConfigurationBackup(
          options.operation || 'config-update',
          options.reason || 'Configuration updated',
          snapshot
        );

        if (!backupResult.success) {
          console.warn('⚠️  Failed to create configuration backup:', backupResult.error);
        }
      }

      const configJson = JSON.stringify(this.config, null, 2);
      await writeFile(this.configPath, configJson, 'utf-8');
      writeSucceeded = true;
    } finally {
      this.isSaving = false;
      await releaseLock();
    }

    if (writeSucceeded) {
      this.notifyConfigUpdated();
    }
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
        
        await this.saveConfiguration({
          operation: 'zone-sync-update',
          reason,
          skipBackup: true
        });
        
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
          const snapshot = this.cloneConfiguration(this.config);
          this.config!.lockers.total_count = totalChannels;
          await this.saveConfiguration({
            operation: 'auto-locker-sync',
            reason: reason || 'Hardware locker sync update',
            backupSnapshot: snapshot
          });
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
    reason: string,
    configSnapshot?: CompleteSystemConfig
  ): Promise<{ success: boolean; backupPath?: string; error?: string }> {
    try {
      const snapshot = configSnapshot ?? (this.config ? this.cloneConfiguration(this.config) : null);
      if (!snapshot) {
        return { success: false, error: 'No configuration loaded to backup' };
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `system-config-backup-${operation}-${timestamp}.json`;
      const backupPath = `./config/backups/${backupFilename}`;

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
        configuration: snapshot
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

      const oldConfig = this.config ? this.cloneConfiguration(this.config) : null;

      this.config = backupData.configuration as CompleteSystemConfig;

      await this.saveConfiguration({
        operation: 'restore-from-backup',
        reason: `Configuration restored from backup: ${backupPath}`,
        backupSnapshot: oldConfig,
        skipBackup: currentBackupResult.success
      });

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
