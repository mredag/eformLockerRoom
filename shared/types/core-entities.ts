/**
 * Core Entity Interfaces for Eform Locker System
 * Following the design specification for multi-room locker management
 */

// ============================================================================
// LOCKER ENTITIES
// ============================================================================

export type LockerStatus = 'Boş' | 'Dolu' | 'Açılıyor' | 'Hata' | 'Engelli';
export type OwnerType = 'rfid' | 'device' | 'vip';

export interface Locker {
  id: number; // Locker number within kiosk (1-30)
  kiosk_id: string;
  status: LockerStatus;
  owner_type?: OwnerType;
  owner_key?: string;
  reserved_at?: Date;
  owned_at?: Date;
  version: number; // For optimistic locking
  is_vip: boolean;
  display_name?: string; // Custom display name (max 20 chars, Turkish support)
  name_updated_at?: Date; // When display name was last updated
  name_updated_by?: string; // Who updated the display name
  created_at: Date;
  updated_at: Date;
}

export interface LockerStateTransition {
  from: LockerStatus;
  to: LockerStatus;
  trigger: string;
  conditions?: string[];
}

// ============================================================================
// VIP CONTRACT ENTITIES
// ============================================================================

export type VipContractStatus = 'active' | 'expired' | 'cancelled';

export interface VipContract {
  id: number;
  kiosk_id: string;
  locker_id: number; // Locker number within kiosk
  rfid_card: string;
  backup_card?: string;
  start_date: Date;
  end_date: Date;
  status: VipContractStatus;
  created_by: string;
  created_at: Date;
  updated_at?: Date;
  version: number; // For optimistic locking
}

export interface VipContractRequest {
  kiosk_id: string;
  locker_id: number;
  rfid_card: string;
  backup_card?: string;
  start_date: Date;
  end_date: Date;
  created_by: string;
}

export type VipTransferStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';

export interface VipTransferRequest {
  id: number;
  contract_id: number;
  from_kiosk_id: string;
  from_locker_id: number;
  to_kiosk_id: string;
  to_locker_id: number;
  new_rfid_card?: string; // Optional new card for transfer
  reason: string;
  requested_by: string;
  approved_by?: string;
  status: VipTransferStatus;
  created_at: Date;
  approved_at?: Date;
  version: number; // For optimistic locking
  completed_at?: Date;
  rejection_reason?: string;
}

export interface VipContractHistory {
  id: number;
  contract_id: number;
  action_type: 'created' | 'extended' | 'card_changed' | 'transferred' | 'cancelled';
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  performed_by: string;
  reason?: string;
  timestamp: Date;
  details: Record<string, any>;
  version: number; // For optimistic locking
}

// ============================================================================
// EVENT ENTITIES
// ============================================================================

export enum EventType {
  // System events
  SYSTEM_RESTARTED = 'restarted', // Fixed name for restart events
  KIOSK_ONLINE = 'kiosk_online',
  KIOSK_OFFLINE = 'kiosk_offline',
  
  // User events
  RFID_ASSIGN = 'rfid_assign',
  RFID_RELEASE = 'rfid_release',
  QR_ASSIGN = 'qr_assign',
  QR_RELEASE = 'qr_release',
  
  // Staff events
  STAFF_OPEN = 'staff_open',
  STAFF_BLOCK = 'staff_block',
  STAFF_UNBLOCK = 'staff_unblock',
  BULK_OPEN = 'bulk_open',
  MASTER_PIN_USED = 'master_pin_used',
  
  // VIP events
  VIP_CONTRACT_CREATED = 'vip_contract_created',
  VIP_CONTRACT_EXTENDED = 'vip_contract_extended',
  VIP_CONTRACT_CANCELLED = 'vip_contract_cancelled',
  VIP_CARD_CHANGED = 'vip_card_changed',
  VIP_TRANSFER_REQUESTED = 'vip_transfer_requested',
  VIP_TRANSFER_APPROVED = 'vip_transfer_approved',
  VIP_TRANSFER_REJECTED = 'vip_transfer_rejected',
  VIP_TRANSFER_COMPLETED = 'vip_transfer_completed',
  
  // Command events
  COMMAND_FAILED = 'command_failed',
  
  // Hardware events
  HARDWARE_ERROR = 'hardware_error',
  ERROR_RESOLVED = 'error_resolved',
  
  // Configuration events
  CONFIG_PACKAGE_CREATED = 'config_package_created',
  CONFIG_DEPLOYMENT_INITIATED = 'config_deployment_initiated',
  CONFIG_APPLIED = 'config_applied',
  CONFIG_ROLLBACK = 'config_rollback',
  
  // Provisioning events
  PROVISIONING_TOKEN_GENERATED = 'provisioning_token_generated',
  KIOSK_REGISTERED = 'kiosk_registered',
  KIOSK_ENROLLED = 'kiosk_enrolled',
  PROVISIONING_ROLLBACK = 'provisioning_rollback'
}

export interface Event {
  id: number;
  timestamp: Date;
  kiosk_id: string;
  locker_id?: number;
  event_type: EventType;
  rfid_card?: string;
  device_id?: string;
  staff_user?: string; // NOT NULL for staff operations
  details: Record<string, any>;
  version: number; // For optimistic locking
}

export interface EventDetails {
  // Staff operation details
  staff_open?: {
    reason: string;
    override: boolean;
  };
  
  // RFID operation details
  rfid_assign?: {
    previous_status: LockerStatus;
    burst_required: boolean;
  };
  
  // QR operation details
  qr_access?: {
    device_hash: string;
    action: 'assign' | 'release';
  };
  
  // Bulk operation details
  bulk_open?: {
    total_count: number;
    success_count: number;
    failed_lockers: number[];
  };
  
  // VIP contract details
  vip_contract?: {
    contract_id: number;
    locker_id: number;
    rfid_card: string;
    duration_months: number;
  };
  
  // Configuration details
  config_operation?: {
    version: string;
    hash: string;
    target?: string;
  };
  
  // Provisioning details
  provisioning_operation?: {
    token?: string;
    zone?: string;
    hardware_id?: string;
  };
}

// ============================================================================
// COMMAND ENTITIES
// ============================================================================

export type CommandStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
export type CommandType = 'open_locker' | 'bulk_open' | 'block_locker' | 'unblock_locker' | 'apply_config' | 'restart_service';

export interface Command {
  command_id: string; // UUID for idempotency
  kiosk_id: string;
  command_type: CommandType;
  payload: Record<string, any>;
  status: CommandStatus;
  retry_count: number;
  max_retries: number;
  next_attempt_at: Date;
  last_error?: string;
  created_at: Date;
  executed_at?: Date;
  completed_at?: Date;
  version: number; // For optimistic locking
}

export interface CommandPayload {
  // Locker operation payloads
  open_locker?: {
    locker_id: number;
    staff_user?: string;
    reason?: string;
    force?: boolean;
  };
  
  bulk_open?: {
    locker_ids: number[];
    staff_user: string;
    exclude_vip: boolean;
    interval_ms: number;
  };
  
  block_locker?: {
    locker_id: number;
    staff_user: string;
    reason: string;
  };
  
  // Configuration payloads
  apply_config?: {
    config_version: string;
    config_hash: string;
    rollback_on_failure: boolean;
  };
  
  // System payloads
  restart_service?: {
    service_name: string;
    delay_seconds: number;
  };
}

// ============================================================================
// KIOSK ENTITIES
// ============================================================================

export type KioskStatus = 'online' | 'offline' | 'maintenance' | 'error';

export interface KioskHeartbeat {
  kiosk_id: string;
  last_seen: Date;
  zone: string;
  status: KioskStatus;
  version: string; // Software version
  last_config_hash?: string; // For configuration sync
  offline_threshold_seconds: number;
  hardware_id?: string;
  registration_secret?: string;
  created_at: Date;
  updated_at: Date;
}

export interface KioskHealth {
  database: {
    status: 'ok' | 'error';
    last_write: Date;
    wal_size: number;
  };
  rs485: {
    status: 'ok' | 'error';
    port: string;
    last_successful_command: Date;
  };
  command_queue: {
    pending_count: number;
    failed_count: number;
    last_processed: Date;
  };
  system: {
    version: string;
    uptime: number;
    memory_usage: number;
  };
}

// ============================================================================
// QR CODE ENTITIES
// ============================================================================

export interface QrResponse {
  success: boolean;
  action: 'assign' | 'release' | 'busy' | 'vip_blocked' | 'network_required';
  message: string;
  locker_id?: number;
  device_id?: string;
  action_token?: string;
}

export interface QrActionToken {
  locker_id: number;
  device_id: string;
  action: 'assign' | 'release';
  expires_at: Date;
  signature: string;
}

// ============================================================================
// STAFF MANAGEMENT ENTITIES
// ============================================================================

export type UserRole = 'admin' | 'staff';

export enum Permission {
  VIEW_LOCKERS = 'view_lockers',
  OPEN_LOCKER = 'open_locker',
  BULK_OPEN = 'bulk_open',
  BLOCK_LOCKER = 'block_locker',
  MANAGE_VIP = 'manage_vip',
  MANAGE_MASTER_PIN = 'manage_master_pin',
  VIEW_EVENTS = 'view_events',
  EXPORT_REPORTS = 'export_reports',
  SYSTEM_CONFIG = 'system_config'
}

export interface StaffUser {
  id: number;
  username: string;
  password_hash: string; // Argon2id hash
  role: UserRole;
  permissions: Permission[];
  last_login?: Date;
  pin_last_changed?: Date;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface StaffSession {
  session_id: string;
  user_id: number;
  username: string;
  role: UserRole;
  created_at: Date;
  expires_at: Date;
  last_activity: Date;
  ip_address: string;
  user_agent: string;
}

// ============================================================================
// BULK OPERATION ENTITIES
// ============================================================================

export interface BulkResult {
  total_count: number;
  success_count: number;
  failed_count: number;
  failed_lockers: Array<{
    locker_id: number;
    error: string;
  }>;
  execution_time_ms: number;
}

export interface CsvReport {
  filename: string;
  headers: string[];
  rows: string[][];
  generated_at: Date;
  generated_by: string;
  total_lockers: number;
  opened_lockers: number;
  failed_lockers: number;
}

// ============================================================================
// HARDWARE INTERFACE ENTITIES
// ============================================================================

export interface ModbusCommand {
  command_id: string;
  channel: number;
  operation: 'pulse' | 'burst';
  duration_ms: number;
  retry_count: number;
  created_at: Date;
}

export interface RfidScanEvent {
  card_id: string;
  scan_time: Date;
  reader_id: string;
  signal_strength?: number;
}

export interface RelayStatus {
  channel: number;
  is_active: boolean;
  last_operation: Date;
  total_operations: number;
  failure_count: number;
}

// ============================================================================
// RATE LIMITING ENTITIES
// ============================================================================

export interface RateLimitBucket {
  key: string;
  tokens: number;
  last_refill: Date;
  max_tokens: number;
  refill_rate: number;
}

export interface RateLimitViolation {
  id: number;
  key: string;
  limit_type: 'ip' | 'card' | 'locker' | 'device';
  violation_count: number;
  first_violation: Date;
  last_violation: Date;
  is_blocked: boolean;
  block_expires_at?: Date;
}

// ============================================================================
// INTERNATIONALIZATION ENTITIES
// ============================================================================

export type SupportedLanguage = 'tr' | 'en';

export interface Messages {
  kiosk: {
    scan_card: string;
    no_lockers: string;
    opening: string;
    opened_released: string;
    failed_open: string;
    select_locker: string;
    master_button: string;
    enter_pin: string;
    invalid_pin: string;
    pin_locked: string;
  };
  qr: {
    vip_blocked: string;
    network_required: string;
    private_mode_warning: string;
    locker_busy: string;
    scan_success: string;
    scan_failed: string;
  };
  panel: {
    locker_opened: string;
    bulk_complete: string;
    vip_created: string;
    vip_cancelled: string;
    config_applied: string;
    login_required: string;
    insufficient_permissions: string;
  };
  errors: {
    database_error: string;
    network_error: string;
    hardware_error: string;
    validation_error: string;
    authentication_error: string;
    authorization_error: string;
  };
}

// ============================================================================
// UPDATE SYSTEM ENTITIES
// ============================================================================

export interface UpdatePackage {
  version: string;
  url: string;
  sha256: string;
  signature: string; // minisign signature
  release_notes: string;
  mandatory: boolean;
  rollback_version?: string;
}

export interface UpdateStatus {
  current_version: string;
  available_version?: string;
  update_in_progress: boolean;
  last_check: Date;
  last_update?: Date;
  rollback_available: boolean;
}

// ============================================================================
// SYSTEM CONFIGURATION ENTITIES (Extended)
// ============================================================================

import { SystemConfig } from './system-config';

export interface ExtendedSystemConfig extends SystemConfig {
  // Hardware configuration
  MODBUS_PORT: string;
  MODBUS_BAUDRATE: number;
  MODBUS_TIMEOUT_MS: number;
  RFID_READER_TYPE: 'hid' | 'keyboard';
  RFID_DEBOUNCE_MS: number;
  
  // Security configuration
  SESSION_TIMEOUT_MINUTES: number;
  PIN_ROTATION_DAYS: number;
  MAX_LOGIN_ATTEMPTS: number;
  LOCKOUT_DURATION_MINUTES: number;
  
  // QR configuration
  QR_TOKEN_TTL_SECONDS: number;
  QR_HMAC_SECRET: string;
  
  // Multi-room configuration
  COMMAND_POLL_INTERVAL_MS: number;
  HEARTBEAT_TIMEOUT_MULTIPLIER: number;
  
  // Update configuration
  UPDATE_CHECK_INTERVAL_MINUTES: number;
  UPDATE_SERVER_URL: string;
  UPDATE_PUBLIC_KEY: string;
  
  // Internationalization
  DEFAULT_LANGUAGE: SupportedLanguage;
  SUPPORTED_LANGUAGES: SupportedLanguage[];
}

// ============================================================================
// WEBSOCKET ENTITIES
// ============================================================================

export interface WebSocketMessage {
  type: 'state_update' | 'connection_status' | 'heartbeat' | 'error';
  timestamp: Date;
  data: any;
}

export interface LockerStateUpdate {
  kioskId: string;
  lockerId: number;
  displayName: string;
  state: LockerStatus;
  lastChanged: Date;
  ownerKey?: string;
  ownerType?: OwnerType;
}

export interface ConnectionStatus {
  status: 'online' | 'offline' | 'reconnecting';
  lastUpdate: Date;
  connectedClients: number;
}

// ============================================================================
// API RESPONSE ENTITIES
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
  request_id?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  components: {
    database: 'ok' | 'error';
    hardware: 'ok' | 'error';
    network: 'ok' | 'error';
    services: 'ok' | 'error';
  };
  details?: Record<string, any>;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'uuid';
  required: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  enum?: string[];
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
