export interface UpdatePackage {
  version: string;
  url: string;
  sha256: string;
  signature: string; // minisign signature
  component: 'gateway' | 'kiosk' | 'panel' | 'agent';
  rollback_threshold?: number; // Percentage of failed deployments to trigger rollback
}

export interface UpdateStatus {
  current_version: string;
  available_version?: string;
  status: 'idle' | 'checking' | 'downloading' | 'verifying' | 'applying' | 'rolling_back' | 'failed';
  last_check: Date;
  last_update?: Date;
  error?: string;
  rollback_reason?: string;
}

export interface UpdateConfig {
  check_interval_minutes: number; // Default: 30
  panel_url: string;
  public_key_path: string; // Path to minisign public key
  backup_directory: string;
  max_rollback_attempts: number;
  health_check_timeout_ms: number;
  component: 'gateway' | 'kiosk' | 'panel' | 'agent';
}

export interface HealthCheckResult {
  healthy: boolean;
  version: string;
  timestamp: Date;
  details?: Record<string, any>;
}

export interface BackupInfo {
  version: string;
  timestamp: Date;
  path: string;
  component: string;
}