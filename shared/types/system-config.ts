/**
 * System configuration interface for the Eform Locker System
 * All configurable parameters as specified in the design document
 */

export interface SystemConfig {
  // Locker operation timing
  BULK_INTERVAL_MS: number; // Default: 300
  RESERVE_TTL_SECONDS: number | null; // Default: 90 (nullable to support disabled reservations)
  AUTO_RELEASE_HOURS?: number | null; // Optional: auto-release threshold in hours
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
  vacuum_interval_hours?: number;
  checkpoint_interval_seconds?: number;
}

export type LockerAssignmentMode = 'manual' | 'automatic';

export interface KioskAssignmentConfig {
  default_mode: LockerAssignmentMode;
  per_kiosk?: Record<string, LockerAssignmentMode>;
  recent_holder_min_hours?: number;
  open_only_window_hours?: number;
  max_available_lockers_display?: number;
}

export interface ServiceConfig {
  gateway: {
    port: number;
    host: string;
    max_connections: number;
    request_timeout_ms?: number;
    keep_alive_timeout_ms?: number;
  };
  kiosk: {
    port: number;
    host?: string;
    heartbeat_interval_seconds: number;
    command_poll_interval_seconds: number;
    hardware_check_interval_seconds?: number;
    ui_timeout_seconds?: number;
    assignment?: KioskAssignmentConfig;
  };
  panel: {
    port: number;
    host?: string;
    session_timeout_minutes: number;
    max_login_attempts: number;
    lockout_duration_minutes?: number;
    csrf_protection?: boolean;
  };
  agent: {
    update_check_interval_minutes: number;
    update_server_url: string;
    auto_update?: boolean;
    backup_before_update?: boolean;
  };
}

export interface RelayCard {
  slave_address: number;
  channels: number;
  type: string;
  dip_switches?: string;
  description: string;
  enabled: boolean;
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
    use_multiple_coils?: boolean;
    verify_writes?: boolean;
    max_retries?: number;
    retry_delay_base_ms?: number;
    connection_retry_attempts?: number;
    test_mode?: boolean;
  };
  relay_cards: RelayCard[];
  rfid: {
    reader_type: 'hid' | 'serial';
    debounce_ms: number;
    scan_timeout_ms: number;
    auto_detect?: boolean;
    fallback_to_keyboard?: boolean;
    vendor_id?: string | null;
    product_id?: string | null;
  };
  display?: {
    type: string;
    resolution: string;
    brightness: number;
    screensaver_timeout_minutes: number;
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
    api_per_minute?: number;
  };
  encryption?: {
    algorithm: string;
    key_rotation_days?: number;
  };
  audit?: {
    log_all_actions?: boolean;
    retention_days?: number;
    alert_on_suspicious?: boolean;
  };
}

export interface QrConfig {
  token_ttl_seconds: number;
  hmac_secret: string;
  max_scans_per_token?: number;
  rate_limit_per_minute?: number;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  retention_days: number;
  max_file_size_mb: number;
  rotate_daily: boolean;
  compress_old_logs?: boolean;
  syslog_enabled?: boolean;
  remote_logging?: boolean;
}

export interface I18nConfig {
  default_language: 'tr' | 'en';
  supported_languages: ('tr' | 'en')[];
  fallback_language?: 'tr' | 'en';
  auto_detect_browser?: boolean;
}

export interface LockerConfig {
  total_count: number;
  reserve_ttl_seconds: number | null;
  offline_threshold_seconds: number;
  bulk_operation_interval_ms: number;
  master_lockout_fails: number;
  master_lockout_minutes: number;
  auto_release_hours?: number | null;
  maintenance_mode?: boolean;
  layout: {
    rows: number;
    columns: number;
    numbering_scheme?: string;
  };
}

export interface ZoneConfig {
  id: string;
  ranges: [number, number][];
  relay_cards: number[];
  enabled: boolean;
}

export interface FeaturesConfig {
  zones_enabled: boolean;
}

export interface MonitoringConfig {
  health_check_interval_seconds: number;
  performance_metrics?: boolean;
  hardware_monitoring?: boolean;
  disk_space_alert_threshold_percent?: number;
  memory_alert_threshold_percent?: number;
  temperature_alert_celsius?: number;
}

export interface BackupConfig {
  enabled: boolean;
  schedule: string;
  retention_count: number;
  compress?: boolean;
  remote_backup?: boolean;
  backup_path: string;
}

export interface NetworkConfig {
  hostname: string;
  wifi_fallback?: boolean;
  ethernet_priority?: boolean;
  ntp_servers?: string[];
  dns_servers?: string[];
}

export interface MaintenanceConfig {
  auto_restart_on_error?: boolean;
  max_restart_attempts?: number;
  restart_cooldown_minutes?: number;
  scheduled_maintenance_hour?: number;
  update_notifications?: boolean;
}

/**
 * Complete system configuration structure
 */
export interface CompleteSystemConfig {
  system: {
    name: string;
    version: string;
    environment: 'development' | 'production' | 'test';
    location?: string;
    installation_date?: string;
    hardware_platform?: string;
  };
  database: DatabaseConfig;
  services: ServiceConfig;
  hardware: HardwareConfig;
  security: SecurityConfig;
  lockers: LockerConfig;
  qr: QrConfig;
  logging: LoggingConfig;
  i18n: I18nConfig;
  features?: FeaturesConfig;
  zones?: ZoneConfig[];
  monitoring?: MonitoringConfig;
  backup?: BackupConfig;
  network?: NetworkConfig;
  maintenance?: MaintenanceConfig;
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
