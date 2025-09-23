import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigManager } from '../config-manager';
import { readFile, writeFile, access } from 'fs/promises';
import { CompleteSystemConfig } from '../../types/system-config';

// Mock fs/promises
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
    open: vi.fn(() => ({
      close: vi.fn().mockResolvedValue(undefined)
    } as unknown as import('fs/promises').FileHandle)),
    unlink: vi.fn().mockResolvedValue(undefined)
  };
});

// Mock DatabaseManager
vi.mock('../../database/database-manager.js', () => ({
  DatabaseManager: {
    getInstance: vi.fn(() => ({
      getConnection: vi.fn(() => ({}))
    }))
  }
}));

// Mock EventRepository
vi.mock('../../database/event-repository.js', () => ({
  EventRepository: vi.fn(() => ({
    logEvent: vi.fn()
  }))
}));

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  const mockReadFile = vi.mocked(readFile);
  const mockWriteFile = vi.mocked(writeFile);
  const mockAccess = vi.mocked(access);

  beforeEach(() => {
    vi.clearAllMocks();
    configManager = ConfigManager.getInstance('./test-config.json');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Configuration Loading', () => {
    it('should load configuration from file', async () => {
      const mockConfig: CompleteSystemConfig = {
        system: {
          name: 'Test System',
          version: '1.0.0',
          environment: 'test'
        },
        database: {
          path: './test.db',
          wal_mode: true,
          backup_interval_hours: 24,
          retention_days: 30
        },
        services: {
          gateway: { port: 3000, host: '0.0.0.0', max_connections: 100 },
          kiosk: { port: 3001, heartbeat_interval_seconds: 10, command_poll_interval_seconds: 2 },
          panel: { port: 3002, session_timeout_minutes: 60, max_login_attempts: 5 },
          agent: { update_check_interval_minutes: 30, update_server_url: 'https://test.com' }
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
              description: 'Test Card',
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
          provisioning_secret: 'test-secret',
          session_secret: 'test-session',
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
          hmac_secret: 'test-hmac'
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

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));

      const config = await configManager.loadConfiguration();
      
      expect(mockAccess).toHaveBeenCalledWith('./test-config.json');
      expect(mockReadFile).toHaveBeenCalledWith('./test-config.json', 'utf-8');
      expect(config).toEqual(mockConfig);
    });

    it('should create default configuration if file does not exist', async () => {
      const error = new Error('ENOENT: no such file or directory');
      mockAccess.mockRejectedValue(error);
      mockWriteFile.mockResolvedValue(undefined);

      const config = await configManager.loadConfiguration();
      
      expect(config).toBeDefined();
      expect(config.system.name).toBe('Eform Locker Room System');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should throw error for invalid JSON', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('invalid json');

      await expect(configManager.loadConfiguration()).rejects.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate valid configuration', () => {
      const validConfig: CompleteSystemConfig = {
        system: { name: 'Test', version: '1.0.0', environment: 'test' },
        database: { path: './test.db', wal_mode: true, backup_interval_hours: 24, retention_days: 30 },
        services: {
          gateway: { port: 3000, host: '0.0.0.0', max_connections: 100 },
          kiosk: { port: 3001, heartbeat_interval_seconds: 10, command_poll_interval_seconds: 2 },
          panel: { port: 3002, session_timeout_minutes: 60, max_login_attempts: 5 },
          agent: { update_check_interval_minutes: 30, update_server_url: 'https://test.com' }
        },
        hardware: {
          modbus: {
            port: '/dev/ttyUSB0', baudrate: 9600, timeout_ms: 1000,
            pulse_duration_ms: 400, burst_duration_seconds: 10,
            burst_interval_ms: 2000, command_interval_ms: 300
          },
          relay_cards: [{ slave_address: 1, channels: 16, type: 'test', description: 'Test', enabled: true }],
          rfid: { reader_type: 'hid', debounce_ms: 500, scan_timeout_ms: 5000 }
        },
        security: {
          provisioning_secret: 'test-secret', session_secret: 'test-session',
          pin_rotation_days: 90, lockout_duration_minutes: 5,
          rate_limits: { ip_per_minute: 30, card_per_minute: 60, locker_per_minute: 6, device_per_20_seconds: 1 }
        },
        lockers: {
          total_count: 16,
          reserve_ttl_seconds: 90, offline_threshold_seconds: 30,
          bulk_operation_interval_ms: 300, master_lockout_fails: 5, master_lockout_minutes: 5,
          layout: { rows: 4, columns: 4 }
        },
        qr: { token_ttl_seconds: 5, hmac_secret: 'test-hmac' },
        logging: { level: 'info', retention_days: 30, max_file_size_mb: 100, rotate_daily: true },
        i18n: { default_language: 'tr', supported_languages: ['tr', 'en'] }
      };

      const result = configManager.validateConfiguration(validConfig);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required sections', () => {
      const invalidConfig = {
        system: { name: 'Test', version: '1.0.0', environment: 'test' }
        // Missing other required sections
      };

      const result = configManager.validateConfiguration(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('Missing required section'))).toBe(true);
    });

    it('should detect invalid port numbers', () => {
      const invalidConfig = {
        system: { name: 'Test', version: '1.0.0', environment: 'test' },
        database: { path: './test.db', wal_mode: true, backup_interval_hours: 24, retention_days: 30 },
        services: {
          gateway: { port: -1, host: '0.0.0.0', max_connections: 100 }, // Invalid port
          kiosk: { port: 70000, heartbeat_interval_seconds: 10, command_poll_interval_seconds: 2 }, // Invalid port
          panel: { port: 3002, session_timeout_minutes: 60, max_login_attempts: 5 },
          agent: { update_check_interval_minutes: 30, update_server_url: 'https://test.com' }
        },
        hardware: {
          modbus: {
            port: '/dev/ttyUSB0', baudrate: 9600, timeout_ms: 1000,
            pulse_duration_ms: 400, burst_duration_seconds: 10,
            burst_interval_ms: 2000, command_interval_ms: 300
          },
          relay_cards: [{ slave_address: 1, channels: 16, type: 'test', description: 'Test', enabled: true }],
          rfid: { reader_type: 'hid', debounce_ms: 500, scan_timeout_ms: 5000 }
        },
        security: {
          provisioning_secret: 'test-secret', session_secret: 'test-session',
          pin_rotation_days: 90, lockout_duration_minutes: 5,
          rate_limits: { ip_per_minute: 30, card_per_minute: 60, locker_per_minute: 6, device_per_20_seconds: 1 }
        },
        lockers: {
          total_count: 16,
          reserve_ttl_seconds: 90, offline_threshold_seconds: 30,
          bulk_operation_interval_ms: 300, master_lockout_fails: 5, master_lockout_minutes: 5,
          layout: { rows: 4, columns: 4 }
        },
        qr: { token_ttl_seconds: 5, hmac_secret: 'test-hmac' },
        logging: { level: 'info', retention_days: 30, max_file_size_mb: 100, rotate_daily: true },
        i18n: { default_language: 'tr', supported_languages: ['tr', 'en'] }
      };

      const result = configManager.validateConfiguration(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid port number'))).toBe(true);
    });

    it('should detect production security issues', () => {
      const productionConfig = {
        system: { name: 'Test', version: '1.0.0', environment: 'production' },
        database: { path: './test.db', wal_mode: true, backup_interval_hours: 24, retention_days: 30 },
        services: {
          gateway: { port: 3000, host: '0.0.0.0', max_connections: 100 },
          kiosk: { port: 3001, heartbeat_interval_seconds: 10, command_poll_interval_seconds: 2 },
          panel: { port: 3002, session_timeout_minutes: 60, max_login_attempts: 5 },
          agent: { update_check_interval_minutes: 30, update_server_url: 'https://test.com' }
        },
        hardware: {
          modbus: {
            port: '/dev/ttyUSB0', baudrate: 9600, timeout_ms: 1000,
            pulse_duration_ms: 400, burst_duration_seconds: 10,
            burst_interval_ms: 2000, command_interval_ms: 300
          },
          relay_cards: [{ slave_address: 1, channels: 16, type: 'test', description: 'Test', enabled: true }],
          rfid: { reader_type: 'hid', debounce_ms: 500, scan_timeout_ms: 5000 }
        },
        security: {
          provisioning_secret: 'change-this-in-production', // Default secret
          session_secret: 'change-this-in-production', // Default secret
          pin_rotation_days: 90, lockout_duration_minutes: 5,
          rate_limits: { ip_per_minute: 30, card_per_minute: 60, locker_per_minute: 6, device_per_20_seconds: 1 }
        },
        lockers: {
          total_count: 16,
          reserve_ttl_seconds: 90, offline_threshold_seconds: 30,
          bulk_operation_interval_ms: 300, master_lockout_fails: 5, master_lockout_minutes: 5,
          layout: { rows: 4, columns: 4 }
        },
        qr: { token_ttl_seconds: 5, hmac_secret: 'change-this-in-production' }, // Default secret
        logging: { level: 'info', retention_days: 30, max_file_size_mb: 100, rotate_daily: true },
        i18n: { default_language: 'tr', supported_languages: ['tr', 'en'] }
      };

      const result = configManager.validateConfiguration(productionConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('secret must be changed in production'))).toBe(true);
    });

    it('should generate warnings for questionable settings', () => {
      const questionableConfig = {
        system: { name: 'Test', version: '1.0.0', environment: 'test' },
        database: { path: './test.db', wal_mode: true, backup_interval_hours: 24, retention_days: 30 },
        services: {
          gateway: { port: 3000, host: '0.0.0.0', max_connections: 100 },
          kiosk: { port: 3001, heartbeat_interval_seconds: 10, command_poll_interval_seconds: 2 },
          panel: { port: 3002, session_timeout_minutes: 60, max_login_attempts: 5 },
          agent: { update_check_interval_minutes: 30, update_server_url: 'https://test.com' }
        },
        hardware: {
          modbus: {
            port: '/dev/ttyUSB0', baudrate: 9600, timeout_ms: 1000,
            pulse_duration_ms: 50, // Very short pulse
            burst_duration_seconds: 10, burst_interval_ms: 2000, command_interval_ms: 300
          },
          relay_cards: [{ slave_address: 1, channels: 16, type: 'test', description: 'Test', enabled: true }],
          rfid: { reader_type: 'hid', debounce_ms: 500, scan_timeout_ms: 5000 }
        },
        security: {
          provisioning_secret: 'test-secret', session_secret: 'test-session',
          pin_rotation_days: 90, lockout_duration_minutes: 5,
          rate_limits: { ip_per_minute: 5, card_per_minute: 60, locker_per_minute: 6, device_per_20_seconds: 1 } // Very low IP limit
        },
        lockers: {
          total_count: 16,
          reserve_ttl_seconds: 15, // Very short TTL
          offline_threshold_seconds: 30, bulk_operation_interval_ms: 300,
          master_lockout_fails: 5, master_lockout_minutes: 5,
          layout: { rows: 4, columns: 4 }
        },
        qr: { token_ttl_seconds: 5, hmac_secret: 'test-hmac' },
        logging: { level: 'info', retention_days: 30, max_file_size_mb: 100, rotate_daily: true },
        i18n: { default_language: 'tr', supported_languages: ['tr', 'en'] }
      };

      const result = configManager.validateConfiguration(questionableConfig);
      
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('System Configuration Extraction', () => {
    it('should extract system configuration parameters correctly', async () => {
      const mockConfig: CompleteSystemConfig = {
        system: { name: 'Test', version: '1.0.0', environment: 'test' },
        database: { path: './test.db', wal_mode: true, backup_interval_hours: 48, retention_days: 60 },
        services: {
          gateway: { port: 3000, host: '0.0.0.0', max_connections: 100 },
          kiosk: { port: 3001, heartbeat_interval_seconds: 15, command_poll_interval_seconds: 3 },
          panel: { port: 3002, session_timeout_minutes: 120, max_login_attempts: 3 },
          agent: { update_check_interval_minutes: 60, update_server_url: 'https://test.com' }
        },
        hardware: {
          modbus: {
            port: '/dev/ttyUSB0', baudrate: 9600, timeout_ms: 2000,
            pulse_duration_ms: 500, burst_duration_seconds: 15,
            burst_interval_ms: 3000, command_interval_ms: 400
          },
          relay_cards: [{ slave_address: 1, channels: 16, type: 'test', description: 'Test', enabled: true }],
          rfid: { reader_type: 'hid', debounce_ms: 500, scan_timeout_ms: 5000 }
        },
        security: {
          provisioning_secret: 'test-secret', session_secret: 'test-session',
          pin_rotation_days: 180, lockout_duration_minutes: 10,
          rate_limits: { ip_per_minute: 60, card_per_minute: 120, locker_per_minute: 12, device_per_20_seconds: 2 }
        },
        lockers: {
          total_count: 16,
          reserve_ttl_seconds: 120, offline_threshold_seconds: 60,
          bulk_operation_interval_ms: 500, master_lockout_fails: 3, master_lockout_minutes: 10,
          layout: { rows: 4, columns: 4 }
        },
        qr: { token_ttl_seconds: 10, hmac_secret: 'test-hmac' },
        logging: { level: 'info', retention_days: 60, max_file_size_mb: 100, rotate_daily: true },
        i18n: { default_language: 'en', supported_languages: ['tr', 'en'] }
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
      
      await configManager.initialize();
      const systemConfig = configManager.getSystemConfig();

      expect(systemConfig.BULK_INTERVAL_MS).toBe(500);
      expect(systemConfig.RESERVE_TTL_SECONDS).toBe(120);
      expect(systemConfig.OPEN_PULSE_MS).toBe(500);
      expect(systemConfig.HEARTBEAT_SEC).toBe(15);
      expect(systemConfig.OFFLINE_SEC).toBe(60);
      expect(systemConfig.LOG_RETENTION_DAYS).toBe(60);
      expect(systemConfig.BACKUP_INTERVAL_HOURS).toBe(48);
      expect(systemConfig.RATE_LIMIT_IP_PER_MIN).toBe(60);
      expect(systemConfig.PIN_ROTATION_DAYS).toBe(180);
      expect(systemConfig.SESSION_TIMEOUT_MINUTES).toBe(120);
      expect(systemConfig.DEFAULT_LANGUAGE).toBe('en');
      expect(systemConfig.SUPPORTED_LANGUAGES).toEqual(['tr', 'en']);
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(async () => {
      const mockConfig: CompleteSystemConfig = {
        system: { name: 'Test', version: '1.0.0', environment: 'test' },
        database: { path: './test.db', wal_mode: true, backup_interval_hours: 24, retention_days: 30 },
        services: {
          gateway: { port: 3000, host: '0.0.0.0', max_connections: 100 },
          kiosk: { port: 3001, heartbeat_interval_seconds: 10, command_poll_interval_seconds: 2 },
          panel: { port: 3002, session_timeout_minutes: 60, max_login_attempts: 5 },
          agent: { update_check_interval_minutes: 30, update_server_url: 'https://test.com' }
        },
        hardware: {
          modbus: {
            port: '/dev/ttyUSB0', baudrate: 9600, timeout_ms: 1000,
            pulse_duration_ms: 400, burst_duration_seconds: 10,
            burst_interval_ms: 2000, command_interval_ms: 300
          },
          relay_cards: [{ slave_address: 1, channels: 16, type: 'test', description: 'Test', enabled: true }],
          rfid: { reader_type: 'hid', debounce_ms: 500, scan_timeout_ms: 5000 }
        },
        security: {
          provisioning_secret: 'test-secret', session_secret: 'test-session',
          pin_rotation_days: 90, lockout_duration_minutes: 5,
          rate_limits: { ip_per_minute: 30, card_per_minute: 60, locker_per_minute: 6, device_per_20_seconds: 1 }
        },
        lockers: {
          total_count: 16,
          reserve_ttl_seconds: 90, offline_threshold_seconds: 30,
          bulk_operation_interval_ms: 300, master_lockout_fails: 5, master_lockout_minutes: 5,
          layout: { rows: 4, columns: 4 }
        },
        qr: { token_ttl_seconds: 5, hmac_secret: 'test-hmac' },
        logging: { level: 'info', retention_days: 30, max_file_size_mb: 100, rotate_daily: true },
        i18n: { default_language: 'tr', supported_languages: ['tr', 'en'] }
      };

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
      mockWriteFile.mockResolvedValue(undefined);
      
      await configManager.initialize();
    });

    it('should update configuration section', async () => {
      const updates = {
        reserve_ttl_seconds: 120,
        master_lockout_fails: 3
      };

      await configManager.updateConfiguration('lockers', updates, 'test-user', 'Test update');

      const config = configManager.getConfiguration();
      expect(config.lockers.reserve_ttl_seconds).toBe(120);
      expect(config.lockers.master_lockout_fails).toBe(3);
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should update specific parameter', async () => {
      await configManager.updateParameter('system', 'name', 'Updated System', 'test-user', 'Name change');

      const config = configManager.getConfiguration();
      expect(config.system.name).toBe('Updated System');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should reject invalid updates', async () => {
      const invalidUpdates = {
        reserve_ttl_seconds: -1 // This should cause validation to fail
      };

      // Mock validation to fail
      const originalValidate = configManager.validateConfiguration;
      configManager.validateConfiguration = vi.fn().mockReturnValue({
        valid: false,
        errors: ['Invalid reserve_ttl_seconds'],
        warnings: []
      });

      await expect(
        configManager.updateConfiguration('lockers', invalidUpdates, 'test-user')
      ).rejects.toThrow('Configuration validation failed');

      configManager.validateConfiguration = originalValidate;
    });

    it('should replace kiosk assignment configuration and clear overrides', async () => {
      const config = configManager.getConfiguration();
      config.services.kiosk.assignment = {
        default_mode: 'automatic',
        per_kiosk: {
          'kiosk-1': 'automatic',
          'kiosk-2': 'manual'
        }
      };

      mockWriteFile.mockClear();

      await configManager.setKioskAssignmentConfig(
        {
          default_mode: 'manual',
          per_kiosk: {},
          recent_holder_min_hours: 1.5,
          open_only_window_hours: 0.75,
          max_available_lockers_display: 28
        },
        'test-user',
        'Reset kiosk assignment defaults'
      );

      expect(mockWriteFile).toHaveBeenCalled();
      const lastWrite = mockWriteFile.mock.calls.at(-1);
      expect(lastWrite).toBeDefined();

      const savedConfig = JSON.parse(lastWrite![1] as string) as CompleteSystemConfig;
      expect(savedConfig.services.kiosk.assignment?.default_mode).toBe('manual');
      expect(savedConfig.services.kiosk.assignment?.per_kiosk).toEqual({});
      expect(savedConfig.services.kiosk.assignment?.recent_holder_min_hours).toBe(1.5);
      expect(savedConfig.services.kiosk.assignment?.open_only_window_hours).toBe(0.8);
      expect(savedConfig.services.kiosk.assignment?.max_available_lockers_display).toBe(28);

      const updatedConfig = configManager.getConfiguration();
      expect(updatedConfig.services.kiosk.assignment?.default_mode).toBe('manual');
      expect(updatedConfig.services.kiosk.assignment?.per_kiosk).toEqual({});
      expect(updatedConfig.services.kiosk.assignment?.recent_holder_min_hours).toBe(1.5);
      expect(updatedConfig.services.kiosk.assignment?.open_only_window_hours).toBe(0.8);
      expect(updatedConfig.services.kiosk.assignment?.max_available_lockers_display).toBe(28);
    });

    it('should round recent holder minimum hours to the nearest tenth', async () => {
      await configManager.setKioskAssignmentConfig(
        {
          default_mode: 'automatic',
          per_kiosk: {},
          recent_holder_min_hours: 0.14
        },
        'test-user',
        'Round recent holder threshold'
      );

      const updatedConfig = configManager.getConfiguration();
      expect(updatedConfig.services.kiosk.assignment?.recent_holder_min_hours).toBe(0.1);
    });

    it('should round open-only window hours to the nearest tenth', async () => {
      await configManager.setKioskAssignmentConfig(
        {
          default_mode: 'automatic',
          per_kiosk: {},
          recent_holder_min_hours: 2,
          open_only_window_hours: 0.04
        },
        'test-user',
        'Round open-only window threshold'
      );

      const updatedConfig = configManager.getConfiguration();
      expect(updatedConfig.services.kiosk.assignment?.open_only_window_hours).toBe(0);
    });

    it('should clamp manual selection display limit between 1 and 60', async () => {
      await configManager.setKioskAssignmentConfig(
        {
          default_mode: 'manual',
          per_kiosk: {},
          max_available_lockers_display: 120
        },
        'test-user',
        'Clamp manual selection upper bound'
      );

      let updatedConfig = configManager.getConfiguration();
      expect(updatedConfig.services.kiosk.assignment?.max_available_lockers_display).toBe(60);

      await configManager.setKioskAssignmentConfig(
        {
          default_mode: 'manual',
          per_kiosk: {},
          max_available_lockers_display: 0
        },
        'test-user',
        'Clamp manual selection lower bound'
      );

      updatedConfig = configManager.getConfiguration();
      expect(updatedConfig.services.kiosk.assignment?.max_available_lockers_display).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors gracefully', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockRejectedValue(new Error('Permission denied'));

      await expect(configManager.loadConfiguration()).rejects.toThrow('Permission denied');
    });

    it('should handle configuration not loaded error', () => {
      // Reset and create a fresh instance that hasn't loaded config
      ConfigManager.resetInstance('./fresh-config.json');
      const freshConfigManager = ConfigManager.getInstance('./fresh-config.json');
      
      expect(() => freshConfigManager.getConfiguration()).toThrow('Configuration not loaded');
      expect(() => freshConfigManager.getSystemConfig()).toThrow('Configuration not loaded');
    });
  });
});
