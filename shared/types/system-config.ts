/**
 * System configuration interface for the Eform Locker System
 * All configurable parameters as specified in the design document
 */

export interface SystemConfig {
  // Locker operation timing
  BULK_INTERVAL_MS: number; // Default: 300
  RESERVE_TTL_SECONDS: number; // Default: 90
  OPEN_PULSE_MS: number; // Default: 400
  OPEN_BURST_SECONDS: number; // Default: 10
  OPEN_BURST_INTERVAL_MS: number; // Default: 2000

  // Master PIN security
  MASTER_LOCKOUT_FAILS: number; // Default: 5
  MASTER_LOCKOUT_MINUTES: number; // Default: 5

  // Kiosk communication
  HEARTBEAT_SEC: number; // Default: 10
  OFFLINE_SEC: number; // Default: 30
  COMMAND_POLL_INTERVAL_SEC: number; // Default: 2

  // System maintenance
  LOG_RETENTION_DAYS: number; // Default: 30
  BACKUP_INTERVAL_HOURS: number; // Default: 24

  // Rate limiting (all configurable)
  RATE_LIMIT_IP_PER_MIN: number; // Default: 30
  RATE_LIMIT_CARD_PER_MIN: number; // Default: 60
  RATE_LIMIT_LOCKER_PER_MIN: number; // Default: 6
  RATE_LIMIT_DEVICE_PER_20_SEC: number; // Default: 1

  // QR code security
  QR_TOKEN_TTL_SECONDS: number; // Default: 5

  // PIN rotation policy
  PIN_ROTATION_DAYS: number; // Default: 90

  // Session management
  SESSION_TIMEOUT_MINUTES: number; // Default: 60
  MAX_LOGIN_ATTEMPTS: number; // Default: 5

  // Hardware configuration
  MODBUS_TIMEOUT_MS: number; // Default: 1000
  MODBUS_COMMAND_INTERVAL_MS: number; // Default: 300
  RFID_DEBOUNCE_MS: number; // Default: 500
  RFID_SCAN_TIMEOUT_MS: number; // Default: 5000

  // Update system
  UPDATE_CHECK_INTERVAL_MINUTES: number; // Default: 30

  // Internationalization
  DEFAULT_LANGUAGE: 'tr' | 'en'; // Default: 'tr'
  SUPPORTED_LANGUAGES: ('tr' | 'en')[]; // Default: ['tr', 'en']
}

export interface DatabaseConfig {
  path: string;
  wal_mode: boolean;
  backup_interval_hours: number;
  retention_days: number;
}

export interface ServiceConfig {
  gateway: {
    port: number;
    host: string;
    max_connections: number;
  };
  kiosk: {
    port: number;
    heartbeat_interval_seconds: number;
    command_poll_interval_seconds: number;
  };
  panel: {
    port: number;
    session_timeout_minutes: number;
    max_login_attempts: number;
  };
  agent: {
    update_check_interval_minutes: number;
    update_server_url: string;
  };
}

export interface HardwareConfig {
  modbus: {
    port: string;
    baudrate: number;
    timeout_ms: number;
    pulse_duration_ms: number;
    burst_duration_seconds: number;
    burst_interval_ms: number;
    command_interval_ms: number;
  };
  rfid: {
    reader_type: 'hid' | 'serial';
    debounce_ms: number;
    scan_timeout_ms: number;
  };
}

export interface SecurityConfig {
  provisioning_secret: string;
  session_secret: string;
  pin_rotation_days: number;
  lockout_duration_minutes: number;
  rate_limits: {
    ip_per_minute: number;
    card_per_minute: number;
    locker_per_minute: number;
    device_per_20_seconds: number;
  };
}

export interface QrConfig {
  token_ttl_seconds: number;
  hmac_secret: string;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  retention_days: number;
  max_file_size_mb: number;
  rotate_daily: boolean;
}

export interface I18nConfig {
  default_language: 'tr' | 'en';
  supported_languages: ('tr' | 'en')[];
}

export interface LockerConfig {
  reserve_ttl_seconds: number;
  offline_threshold_seconds: number;
  bulk_operation_interval_ms: number;
  master_lockout_fails: number;
  master_lockout_minutes: number;
}

/**
 * Complete system configuration structure
 */
export interface CompleteSystemConfig {
  system: {
    name: string;
    version: string;
    environment: 'development' | 'production' | 'test';
  };
  database: DatabaseConfig;
  services: ServiceConfig;
  hardware: HardwareConfig;
  security: SecurityConfig;
  lockers: LockerConfig;
  qr: QrConfig;
  logging: LoggingConfig;
  i18n: I18nConfig;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Configuration change event
 */
export interface ConfigChangeEvent {
  timestamp: Date;
  changed_by: string;
  section: string;
  old_value: any;
  new_value: any;
  reason?: string;
}