export interface KioskRegistrationRequest {
  zone: string;
  version: string;
  hardware_id: string;
}

export interface KioskRegistrationResponse {
  kiosk_id: string;
  registration_secret: string;
  panel_url: string;
  config_hash?: string;
}

export interface ProvisioningToken {
  token: string;
  kiosk_id: string;
  zone: string;
  expires_at: Date;
  used: boolean;
}

export interface KioskHeartbeat {
  kiosk_id: string;
  last_seen: Date;
  zone: string;
  status: 'online' | 'offline' | 'provisioning';
  version: string;
  last_config_hash?: string;
  offline_threshold_seconds: number;
}

export interface ProvisioningStatus {
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  kiosk_id?: string;
  error?: string;
  started_at: Date;
  completed_at?: Date;
}

export interface SystemConfig {
  BULK_INTERVAL_MS: number;
  RESERVE_TTL_SECONDS: number;
  OPEN_PULSE_MS: number;
  OPEN_BURST_SECONDS: number;
  OPEN_BURST_INTERVAL_MS: number;
  MASTER_LOCKOUT_FAILS: number;
  MASTER_LOCKOUT_MINUTES: number;
  HEARTBEAT_SEC: number;
  OFFLINE_SEC: number;
  LOG_RETENTION_DAYS: number;
  RATE_LIMIT_IP_PER_MIN: number;
  RATE_LIMIT_CARD_PER_MIN: number;
  RATE_LIMIT_LOCKER_PER_MIN: number;
  RATE_LIMIT_DEVICE_PER_SEC: number;
}

export interface ConfigurationPackage {
  version: string;
  hash: string;
  config: SystemConfig;
  created_at: Date;
  created_by: string;
}

export interface ConfigurationDeployment {
  id: number;
  config_version: string;
  config_hash: string;
  kiosk_id?: string; // null for all kiosks
  zone?: string; // null for all zones
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  deployed_at?: Date;
  error?: string;
  rollback_reason?: string;
  created_by: string;
}

export interface KioskConfigStatus {
  kiosk_id: string;
  current_config_version?: string;
  current_config_hash?: string;
  pending_config_version?: string;
  pending_config_hash?: string;
  last_config_update?: Date;
  config_status: 'up_to_date' | 'pending_update' | 'updating' | 'failed' | 'rollback_required';
}