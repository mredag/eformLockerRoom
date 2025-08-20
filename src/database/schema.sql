-- Kiosk Heartbeat Table
CREATE TABLE IF NOT EXISTS kiosk_heartbeat (
  kiosk_id TEXT PRIMARY KEY,
  last_seen DATETIME NOT NULL,
  zone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'online',
  version TEXT NOT NULL,
  last_config_hash TEXT,
  offline_threshold_seconds INTEGER DEFAULT 30,
  hardware_id TEXT,
  registration_secret TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Provisioning Tokens Table
CREATE TABLE IF NOT EXISTS provisioning_tokens (
  token TEXT PRIMARY KEY,
  kiosk_id TEXT NOT NULL,
  zone TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME,
  UNIQUE(token)
);

-- Provisioning Status Table
CREATE TABLE IF NOT EXISTS provisioning_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  rollback_reason TEXT,
  hardware_id TEXT,
  zone TEXT
);

-- Events Table (for audit logging)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  kiosk_id TEXT,
  event_type TEXT NOT NULL,
  details TEXT, -- JSON
  staff_user TEXT
);

-- Configuration Packages Table
CREATE TABLE IF NOT EXISTS configuration_packages (
  version TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  config TEXT NOT NULL, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL
);

-- Configuration Deployments Table
CREATE TABLE IF NOT EXISTS configuration_deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_version TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  kiosk_id TEXT, -- NULL for all kiosks
  zone TEXT, -- NULL for all zones
  status TEXT NOT NULL DEFAULT 'pending',
  deployed_at DATETIME,
  error TEXT,
  rollback_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  FOREIGN KEY (config_version) REFERENCES configuration_packages(version)
);

-- Kiosk Configuration Status Table
CREATE TABLE IF NOT EXISTS kiosk_config_status (
  kiosk_id TEXT PRIMARY KEY,
  current_config_version TEXT,
  current_config_hash TEXT,
  pending_config_version TEXT,
  pending_config_hash TEXT,
  last_config_update DATETIME,
  config_status TEXT NOT NULL DEFAULT 'up_to_date',
  FOREIGN KEY (kiosk_id) REFERENCES kiosk_heartbeat(kiosk_id),
  FOREIGN KEY (current_config_version) REFERENCES configuration_packages(version),
  FOREIGN KEY (pending_config_version) REFERENCES configuration_packages(version)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_kiosk_heartbeat_status ON kiosk_heartbeat(status);
CREATE INDEX IF NOT EXISTS idx_provisioning_tokens_expires ON provisioning_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_provisioning_status_kiosk ON provisioning_status(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_kiosk ON events(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_config_deployments_status ON configuration_deployments(status);
CREATE INDEX IF NOT EXISTS idx_config_deployments_kiosk ON configuration_deployments(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_config_status_status ON kiosk_config_status(config_status);