/**
 * Configuration Manager for the Eform Locker System
 * Handles loading, validation, and management of system configuration
 */

import { readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { 
  SystemConfig, 
  CompleteSystemConfig, 
  ConfigValidationResult,
  ConfigChangeEvent,
  RelayCard
} from '../types/system-config';
import { EventType } from '../types/core-entities';
import { EventRepository } from '../database/event-repository';
import { DatabaseManager } from '../database/database-manager';

export class ConfigManager {
  private static instances = new Map<string, ConfigManager>();
  private config: CompleteSystemConfig | null = null;
  private configPath: string;
  private eventRepository: EventRepository | null = null;

  private constructor(configPath: string = './config/system.json') {
    this.configPath = configPath;
  }

  /**
   * Get singleton instance
   */
  static getInstance(configPath?: string): ConfigManager {
    const key = configPath || './config/system.json';
    if (!ConfigManager.instances.has(key)) {
      ConfigManager.instances.set(key, new ConfigManager(configPath));
    }
    return ConfigManager.instances.get(key)!;
  }

  /**
   * Reset instance for testing
   */
  static resetInstance(configPath?: string): void {
    const key = configPath || './config/system.json';
    ConfigManager.instances.delete(key);
  }

  /**
   * Reset all instances
   */
  static resetAllInstances(): void {
    ConfigManager.instances.clear();
  }

  /**
   * Initialize configuration manager
   */
  async initialize(): Promise<void> {
    await this.loadConfiguration();
    
    // Initialize event repository for logging config changes
    try {
      const dbManager = DatabaseManager.getInstance();
      this.eventRepository = new EventRepository(dbManager.getConnection());
    } catch (error) {
      console.warn('Could not initialize event repository for config logging:', error);
    }
  }

  /**
   * Load configuration from file
   */
  async loadConfiguration(): Promise<CompleteSystemConfig> {
    try {
      await access(this.configPath);
      const configData = await readFile(this.configPath, 'utf-8');
      const parsedConfig = JSON.parse(configData);
      
      // Validate configuration
      const validation = this.validateConfiguration(parsedConfig);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
      }

      this.config = parsedConfig as CompleteSystemConfig || this.getDefaultConfiguration();
      return this.config;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        // Configuration file doesn't exist, create default
        console.log('Configuration file not found, creating default configuration');
        this.config = this.getDefaultConfiguration();
        await this.saveConfiguration();
        return this.config;
      }
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfiguration(): CompleteSystemConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call initialize() first.');
    }
    return this.config as CompleteSystemConfig;
  }

  /**
   * Get system configuration parameters
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
   * Update configuration section
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

    const oldValue = { ...this.config[section] };
    const newValue = { ...this.config[section], ...updates };

    // Enhanced validation for zone configuration updates
    if (section === 'zones' || (section === 'features' && (updates as any)?.zones_enabled !== undefined)) {
      const testConfig = { ...this.config, [section]: newValue };
      
      // Use enhanced zone validation
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

    // Validate the updated configuration
    const testConfig = { ...this.config, [section]: newValue };
    const validation = this.validateConfiguration(testConfig);
    
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }

    // Apply the update
    (this.config[section] as any) = newValue;

    // Save to file
    await this.saveConfiguration();

    // Log the change
    await this.logConfigChange({
      timestamp: new Date(),
      changed_by: changedBy,
      section: section as string,
      old_value: oldValue,
      new_value: newValue,
      reason
    });

    // Auto-sync lockers if hardware configuration changed
    if (section === 'hardware' && changedBy !== 'auto-sync-prevent-loop') {
      await this.triggerLockerSync(reason || 'Hardware configuration changed');
    }

    // Trigger zone sync if zones were modified and zones are enabled
    if (section === 'zones' && this.config.features?.zones_enabled && changedBy !== 'auto-sync-zone-extension') {
      // Calculate total channels and trigger zone sync to validate the new configuration
      const enabledCards = this.config.hardware.relay_cards.filter(card => card.enabled);
      const totalChannels = enabledCards.reduce((sum, card) => sum + card.channels, 0);
      
      if (totalChannels > 0) {
        await this.syncZonesWithHardware(totalChannels, reason || 'Zone configuration updated');
      }
    }
  }

  /**
   * Update specific configuration parameter
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
   * Reset configuration to defaults
   */
  async resetToDefaults(changedBy: string, reason?: string): Promise<void> {
    const oldConfig = this.config;
    this.config = this.getDefaultConfiguration();
    
    await this.saveConfiguration();

    // Log the reset
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
   * Validate configuration
   */
  validateConfiguration(config: any): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validate required sections
      const requiredSections = ['system', 'database', 'services', 'hardware', 'security', 'lockers', 'qr', 'logging', 'i18n'];
      for (const section of requiredSections) {
        if (!config[section]) {
          errors.push(`Missing required section: ${section}`);
        }
      }

      if (errors.length > 0) {
        return { valid: false, errors, warnings };
      }

      // Validate system section
      if (!config.system.name || !config.system.version) {
        errors.push('System name and version are required');
      }

      // Validate database section
      if (!config.database.path) {
        errors.push('Database path is required');
      }

      // Validate service ports
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

      // Check for port conflicts
      const uniquePorts = new Set(ports);
      if (uniquePorts.size !== ports.length) {
        errors.push('Port conflicts detected in service configuration');
      }

      // Validate timing parameters
      if (config.lockers.reserve_ttl_seconds < 30) {
        warnings.push('Reserve TTL less than 30 seconds may cause user experience issues');
      }

      if (config.hardware.modbus.pulse_duration_ms < 100 || config.hardware.modbus.pulse_duration_ms > 1000) {
        warnings.push('Modbus pulse duration outside recommended range (100-1000ms)');
      }

      // Validate rate limits
      if (config.security.rate_limits.ip_per_minute < 10) {
        warnings.push('IP rate limit very low, may affect normal operation');
      }

      // Validate secrets
      if (config.security.provisioning_secret === 'change-this-in-production' && config.system.environment === 'production') {
        errors.push('Provisioning secret must be changed in production');
      }

      if (config.security.session_secret === 'change-this-in-production' && config.system.environment === 'production') {
        errors.push('Session secret must be changed in production');
      }

      if (config.qr.hmac_secret === 'change-this-in-production' && config.system.environment === 'production') {
        errors.push('QR HMAC secret must be changed in production');
      }

      // Validate i18n configuration
      if (!config.i18n.supported_languages.includes(config.i18n.default_language)) {
        errors.push('Default language must be in supported languages list');
      }

      // Validate zones configuration (if enabled)
      if (config.features?.zones_enabled && config.zones) {
        for (const zone of config.zones) {
          if (!zone.id || typeof zone.id !== 'string') {
            errors.push('Zone ID is required and must be a string');
          }
          
          if (!Array.isArray(zone.ranges) || zone.ranges.length === 0) {
            errors.push(`Zone ${zone.id}: ranges array is required and cannot be empty`);
          }
          
          if (!Array.isArray(zone.relay_cards) || zone.relay_cards.length === 0) {
            errors.push(`Zone ${zone.id}: relay_cards array is required and cannot be empty`);
          }
          
          // Validate range format
          for (const range of zone.ranges) {
            if (!Array.isArray(range) || range.length !== 2 || range[0] >= range[1]) {
              errors.push(`Zone ${zone.id}: invalid range format [${range}]. Expected [start, end] where start < end`);
            }
          }
          
          // Validate relay card references
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
   * Get default configuration
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
   * Save configuration to file
   */
  private async saveConfiguration(): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration to save');
    }

    const configJson = JSON.stringify(this.config, null, 2);
    await writeFile(this.configPath, configJson, 'utf-8');
  }

  /**
   * Log configuration change
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
        undefined, // lockerId
        undefined, // rfidCard
        undefined, // deviceId
        change.changed_by // staffUser
      );
    } catch (error) {
      console.error('Failed to log config change:', error);
    }
  }

  /**
   * Sync zones with hardware configuration
   * Called when hardware changes and zones are enabled
   */
  private async syncZonesWithHardware(totalLockers: number, reason: string): Promise<void> {
    try {
      console.log(`🔄 Zone sync triggered: ${totalLockers} total lockers (${reason})`);
      
      // Import ZoneExtensionService
      const { ZoneExtensionService } = await import('./zone-extension-service');
      const zoneService = new ZoneExtensionService();
      
      // Create configuration backup before zone modifications
      const backupResult = await this.createConfigurationBackup('zone-sync', reason);
      if (!backupResult.success) {
        console.warn('⚠️ Failed to create configuration backup:', backupResult.error);
        // Continue with sync but log the backup failure
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
      
      // Validate zone extension before applying
      const validation = zoneService.validateZoneExtension(this.config!, totalLockers);
      
      if (!validation.valid) {
        console.error('❌ Zone extension validation failed:', validation.errors.join(', '));
        
        // Log validation failure
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
      
      // Perform zone sync
      const syncResult = await zoneService.syncZonesWithHardware(this.config!, totalLockers);
      
      if (syncResult.error) {
        console.error('❌ Zone sync failed:', syncResult.error);
        
        // Log sync failure
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
        
        // Save the updated configuration (zones were modified in-place)
        await this.saveConfiguration();
        
        // Log successful zone extension
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
      
      // Log sync error
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
      
      // Don't throw - allow hardware sync to continue even if zone sync fails
    }
  }

  /**
   * Trigger locker sync when hardware configuration changes
   */
  private async triggerLockerSync(reason: string): Promise<void> {
    try {
      console.log(`🔄 Config change detected: triggering locker sync (${reason})`);
      
      // Calculate new total channels from updated hardware config
      const enabledCards = this.config!.hardware.relay_cards.filter(card => card.enabled);
      const totalChannels = enabledCards.reduce((sum, card) => sum + card.channels, 0);
      
      if (totalChannels > 0) {
        // Sync zones with hardware if zones are enabled
        if (this.config!.features?.zones_enabled) {
          await this.syncZonesWithHardware(totalChannels, reason);
        }
        
        // Import and sync for all known kiosks (typically just kiosk-1)
        const { LockerStateManager } = await import('./locker-state-manager');
        const { DatabaseConnection } = await import('../database/connection');
        
        const db = DatabaseConnection.getInstance();
        const stateManager = new LockerStateManager(db);
        
        // Sync for default kiosk (could be extended to support multiple kiosks)
        const kioskId = 'kiosk-1';
        await stateManager.syncLockersWithHardware(kioskId, totalChannels);
        
        // Update locker count in config to match hardware
        if (this.config!.lockers.total_count !== totalChannels) {
          console.log(`🔧 Auto-updating locker count: ${this.config!.lockers.total_count} → ${totalChannels}`);
          this.config!.lockers.total_count = totalChannels;
          await this.saveConfiguration();
        }
        
        console.log(`✅ Auto-sync completed: ${totalChannels} lockers available`);
      }
    } catch (error) {
      console.error('❌ Auto-sync failed after config change:', error);
      // Don't throw - config update should still succeed even if sync fails
    }
  }

  /**
   * Manually trigger zone sync with hardware
   * Public method for external zone sync requests
   */
  async manualZoneSync(changedBy: string, reason?: string): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      if (!this.config) {
        return { success: false, message: 'Configuration not loaded' };
      }

      if (!this.config.features?.zones_enabled) {
        return { success: false, message: 'Zones are not enabled in configuration' };
      }

      // Calculate total channels from hardware config
      const enabledCards = this.config.hardware.relay_cards.filter(card => card.enabled);
      const totalChannels = enabledCards.reduce((sum, card) => sum + card.channels, 0);

      if (totalChannels === 0) {
        return { success: false, message: 'No enabled relay cards found in hardware configuration' };
      }

      // Perform zone sync
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
   * Validate zone configuration before applying updates
   * Enhanced validation to prevent invalid zone configurations
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
      // Create test configuration with proposed zone updates
      const testConfig = {
        ...this.config,
        zones: Array.isArray(zoneUpdates) ? zoneUpdates : this.config.zones
      };

      // Use ZoneExtensionService for validation
      const { ZoneExtensionService } = await import('./zone-extension-service');
      const zoneService = new ZoneExtensionService();

      // Calculate total hardware capacity
      const enabledCards = this.config.hardware.relay_cards.filter(card => card.enabled);
      const totalHardwareCapacity = enabledCards.reduce((sum, card) => sum + card.channels, 0);

      // Validate the zone configuration
      const validation = zoneService.validateZoneExtension(testConfig as CompleteSystemConfig, totalHardwareCapacity);
      
      errors.push(...validation.errors);
      warnings.push(...validation.warnings);

      // Additional ConfigManager-specific validations
      if (testConfig.zones && testConfig.features?.zones_enabled && Array.isArray(testConfig.zones)) {
        // Filter out any undefined zones and ensure type safety
        const validZones = testConfig.zones.filter((zone): zone is NonNullable<typeof zone> => zone != null);
        
        // Check for duplicate zone IDs
        const zoneIds = validZones.map(zone => zone.id);
        const duplicateIds = zoneIds.filter((id, index) => zoneIds.indexOf(id) !== index);
        if (duplicateIds.length > 0) {
          errors.push(`Duplicate zone IDs found: ${duplicateIds.join(', ')}`);
        }

        // Check for empty zone IDs
        const emptyIds = validZones.filter(zone => !zone.id || zone.id.trim() === '');
        if (emptyIds.length > 0) {
          errors.push('Zone IDs cannot be empty');
        }

        // Check for invalid characters in zone IDs
        const invalidIdPattern = /[^a-zA-Z0-9_-]/;
        const invalidIds = validZones.filter(zone => invalidIdPattern.test(zone.id));
        if (invalidIds.length > 0) {
          errors.push(`Zone IDs contain invalid characters: ${invalidIds.map(z => z.id).join(', ')}`);
        }

        // Validate relay card references
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

      // Log validation attempt
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
   * Get configuration change history
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
   * Create a backup of the current configuration before modifications
   * 
   * @param operation - The operation that triggered the backup
   * @param reason - Reason for the backup
   * @returns Backup result with success status and backup path
   */
  async createConfigurationBackup(
    operation: string, 
    reason: string
  ): Promise<{ success: boolean; backupPath?: string; error?: string }> {
    try {
      if (!this.config) {
        return { success: false, error: 'No configuration loaded to backup' };
      }

      // Create backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `system-config-backup-${operation}-${timestamp}.json`;
      const backupPath = `./config/backups/${backupFilename}`;

      // Ensure backup directory exists
      const { mkdir } = await import('fs/promises');
      const { dirname } = await import('path');
      
      try {
        await mkdir(dirname(backupPath), { recursive: true });
      } catch (mkdirError) {
        // Directory might already exist, continue
      }

      // Create backup with metadata
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

      // Write backup file
      await writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf8');

      // Log the backup creation
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
   * Restore configuration from backup
   * 
   * @param backupPath - Path to the backup file
   * @param restoredBy - User or system performing the restore
   * @returns Restore result
   */
  async restoreConfigurationFromBackup(
    backupPath: string,
    restoredBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if backup file exists
      await access(backupPath);

      // Read backup file
      const backupContent = await readFile(backupPath, 'utf8');
      const backupData = JSON.parse(backupContent);

      // Validate backup structure
      if (!backupData.configuration || !backupData.metadata) {
        return { success: false, error: 'Invalid backup file structure' };
      }

      // Create a backup of current config before restore
      const currentBackupResult = await this.createConfigurationBackup(
        'pre-restore', 
        `Backup before restoring from ${backupPath}`
      );

      if (!currentBackupResult.success) {
        console.warn('Failed to backup current config before restore:', currentBackupResult.error);
      }

      // Validate the backup configuration
      const validationResult = await this.validateConfiguration(backupData.configuration);
      if (!validationResult.valid) {
        return { 
          success: false, 
          error: `Backup configuration is invalid: ${validationResult.errors.join(', ')}` 
        };
      }

      // Store old configuration for logging
      const oldConfig = this.config;

      // Apply the restored configuration
      this.config = backupData.configuration;

      // Save the restored configuration
      await this.saveConfiguration();

      // Log the restore operation
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
   * Generate a hash of the configuration for change detection
   * 
   * @param config - Configuration to hash
   * @returns Configuration hash string
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

// Export singleton instance
export const configManager = ConfigManager.getInstance();
