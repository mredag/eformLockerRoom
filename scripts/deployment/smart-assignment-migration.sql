-- Migration 033: Smart Locker Assignment System - Complete Schema
-- Version: 1.0.0
-- Description: Complete database schema for smart assignment system deployment
-- No seeding in DDL - configuration handled separately

-- Enable foreign keys and WAL mode
PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=10000;
PRAGMA temp_store=memory;

-- Begin immediate transaction for atomic migration
BEGIN IMMEDIATE;

-- 1. Extend lockers table with smart assignment fields (IF NOT EXISTS pattern)
-- Note: SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we check first
-- These columns may already exist from previous migrations
SELECT CASE 
  WHEN COUNT(*) = 0 THEN 'ALTER TABLE lockers ADD COLUMN free_since DATETIME;'
  ELSE 'SELECT ''Column free_since already exists'';'
END as sql_command
FROM pragma_table_info('lockers') 
WHERE name = 'free_since';

-- Add columns only if they don't exist (handled by deployment script)
-- ALTER TABLE lockers ADD COLUMN free_since DATETIME;
-- ALTER TABLE lockers ADD COLUMN recent_owner TEXT;
-- ALTER TABLE lockers ADD COLUMN recent_owner_time DATETIME;
-- ALTER TABLE lockers ADD COLUMN quarantine_until DATETIME;
-- ALTER TABLE lockers ADD COLUMN wear_count INTEGER DEFAULT 0;
-- ALTER TABLE lockers ADD COLUMN overdue_from DATETIME;
-- ALTER TABLE lockers ADD COLUMN overdue_reason TEXT;
-- ALTER TABLE lockers ADD COLUMN suspected_occupied INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE lockers ADD COLUMN cleared_by TEXT;
-- ALTER TABLE lockers ADD COLUMN cleared_at DATETIME;
-- ALTER TABLE lockers ADD COLUMN return_hold_until DATETIME;
-- ALTER TABLE lockers ADD COLUMN owner_hot_until DATETIME;

-- 2. Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_lockers_free_since ON lockers(free_since);
CREATE INDEX IF NOT EXISTS idx_lockers_quarantine_until ON lockers(quarantine_until);
CREATE INDEX IF NOT EXISTS idx_lockers_wear_count ON lockers(wear_count);
CREATE INDEX IF NOT EXISTS idx_lockers_overdue_from ON lockers(overdue_from);
CREATE INDEX IF NOT EXISTS idx_lockers_return_hold_until ON lockers(return_hold_until);
CREATE INDEX IF NOT EXISTS idx_lockers_owner_hot_until ON lockers(owner_hot_until);
CREATE INDEX IF NOT EXISTS idx_lockers_status_kiosk ON lockers(status, kiosk_id);

-- 3. Global configuration table
CREATE TABLE IF NOT EXISTS settings_global (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'string',
  updated_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (data_type IN ('string', 'number', 'boolean', 'json'))
);

-- 4. Per-kiosk overrides table
CREATE TABLE IF NOT EXISTS settings_kiosk (
  kiosk_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'string',
  updated_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kiosk_id, key),
  CHECK (data_type IN ('string', 'number', 'boolean', 'json'))
);

-- 5. Configuration version for hot reload
CREATE TABLE IF NOT EXISTS config_version (
  id INTEGER PRIMARY KEY DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (id = 1)
);

-- 6. Configuration audit history
CREATE TABLE IF NOT EXISTS config_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT, -- NULL for global config
  key TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT NOT NULL,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Smart sessions table
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

-- 8. Assignment metrics table
CREATE TABLE IF NOT EXISTS assignment_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  assignment_time DATETIME NOT NULL,
  locker_id INTEGER,
  action_type TEXT NOT NULL,
  score_data TEXT, -- JSON with scoring details
  success INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (action_type IN ('assign_new', 'open_existing', 'retrieve_overdue', 'reopen_reclaim'))
);

-- 9. Alert tracking table
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT, -- JSON alert data
  triggered_at DATETIME NOT NULL,
  cleared_at DATETIME,
  auto_clear_condition TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (type IN ('no_stock', 'conflict_rate', 'open_fail_rate', 'retry_rate', 'overdue_share')),
  CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

-- 10. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_smart_sessions_card_id ON smart_sessions(card_id);
CREATE INDEX IF NOT EXISTS idx_smart_sessions_kiosk_id ON smart_sessions(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_smart_sessions_status ON smart_sessions(status);
CREATE INDEX IF NOT EXISTS idx_smart_sessions_expires_time ON smart_sessions(expires_time);

CREATE INDEX IF NOT EXISTS idx_assignment_metrics_kiosk_time ON assignment_metrics(kiosk_id, assignment_time);
CREATE INDEX IF NOT EXISTS idx_assignment_metrics_action_type ON assignment_metrics(action_type);
CREATE INDEX IF NOT EXISTS idx_assignment_metrics_success ON assignment_metrics(success);

CREATE INDEX IF NOT EXISTS idx_alerts_kiosk_type ON alerts(kiosk_id, type);
CREATE INDEX IF NOT EXISTS idx_alerts_triggered_at ON alerts(triggered_at);
CREATE INDEX IF NOT EXISTS idx_alerts_cleared_at ON alerts(cleared_at);

-- 11. Configuration seeding removed from DDL
-- Configuration will be handled by separate seeding script
-- This ensures clean separation of schema and data

-- 12. Initialize configuration version
INSERT OR IGNORE INTO config_version (id, version) VALUES (1, 1);

-- 13. Data updates removed from DDL
-- Data initialization will be handled by deployment script

COMMIT;

-- Verify migration success
SELECT 'Migration completed successfully. Tables created: ' || 
       (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN 
        ('settings_global', 'settings_kiosk', 'config_version', 'config_history', 
         'smart_sessions', 'assignment_metrics', 'alerts')) || '/7';

-- Show configuration count
SELECT 'Configuration entries seeded: ' || COUNT(*) FROM settings_global;

PRAGMA integrity_check;