-- Migration 002: Provisioning and Configuration Tables
-- Adds tables for kiosk provisioning and configuration management

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
  zone TEXT,
  CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'rolled_back'))
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
  CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'rolled_back'))
  -- FOREIGN KEY (config_version) REFERENCES configuration_packages(version) -- Will be added later
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
  CHECK (config_status IN ('up_to_date', 'pending_update', 'updating', 'failed', 'rollback_required'))
  -- Foreign keys will be added in a later migration after all tables are created
);

-- Indexes for provisioning and configuration tables
CREATE INDEX IF NOT EXISTS idx_provisioning_tokens_expires ON provisioning_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_provisioning_tokens_zone ON provisioning_tokens(zone);

CREATE INDEX IF NOT EXISTS idx_provisioning_status_kiosk ON provisioning_status(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_provisioning_status_status ON provisioning_status(status);

CREATE INDEX IF NOT EXISTS idx_config_packages_created_at ON configuration_packages(created_at);
CREATE INDEX IF NOT EXISTS idx_config_packages_created_by ON configuration_packages(created_by);

CREATE INDEX IF NOT EXISTS idx_config_deployments_status ON configuration_deployments(status);
CREATE INDEX IF NOT EXISTS idx_config_deployments_kiosk ON configuration_deployments(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_config_deployments_zone ON configuration_deployments(zone);
CREATE INDEX IF NOT EXISTS idx_config_deployments_created_at ON configuration_deployments(created_at);

CREATE INDEX IF NOT EXISTS idx_kiosk_config_status_status ON kiosk_config_status(config_status);
CREATE INDEX IF NOT EXISTS idx_kiosk_config_status_pending ON kiosk_config_status(pending_config_version);