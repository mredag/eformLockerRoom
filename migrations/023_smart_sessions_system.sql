-- Migration 023: Smart Sessions System
-- Implements smart session tracking with extension management
-- Requirements: 16.1, 16.2, 16.3, 16.4, 16.5

-- Smart sessions table for enhanced session management
CREATE TABLE IF NOT EXISTS smart_sessions (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER,
  start_time DATETIME NOT NULL,
  limit_time DATETIME NOT NULL,
  extended_time DATETIME,
  expires_time DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_seen DATETIME NOT NULL,
  extension_count INTEGER DEFAULT 0,
  max_extensions INTEGER DEFAULT 4,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('active', 'overdue', 'completed', 'cancelled'))
);

-- Session extension audit table for administrator tracking
CREATE TABLE IF NOT EXISTS session_extension_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  admin_user TEXT NOT NULL,
  extension_minutes INTEGER NOT NULL,
  total_minutes INTEGER NOT NULL,
  reason TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES smart_sessions(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_smart_sessions_card_status ON smart_sessions(card_id, status);
CREATE INDEX IF NOT EXISTS idx_smart_sessions_kiosk_status ON smart_sessions(kiosk_id, status);
CREATE INDEX IF NOT EXISTS idx_smart_sessions_expires ON smart_sessions(expires_time);
CREATE INDEX IF NOT EXISTS idx_smart_sessions_status_created ON smart_sessions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_session_extension_audit_session ON session_extension_audit(session_id);
CREATE INDEX IF NOT EXISTS idx_session_extension_audit_admin ON session_extension_audit(admin_user, timestamp);

-- Add session_limit_minutes to global configuration if not exists
INSERT OR IGNORE INTO settings_global (key, value, data_type, updated_by) 
VALUES ('session_limit_minutes', '180', 'number', 'system_migration');

-- Add extension-related configuration
INSERT OR IGNORE INTO settings_global (key, value, data_type, updated_by) 
VALUES ('extension_increment_minutes', '60', 'number', 'system_migration');

INSERT OR IGNORE INTO settings_global (key, value, data_type, updated_by) 
VALUES ('max_total_session_minutes', '240', 'number', 'system_migration');

INSERT OR IGNORE INTO settings_global (key, value, data_type, updated_by) 
VALUES ('overdue_check_interval_seconds', '30', 'number', 'system_migration');

-- Update configuration version
UPDATE config_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
INSERT OR IGNORE INTO config_version (id, version) VALUES (1, 1);