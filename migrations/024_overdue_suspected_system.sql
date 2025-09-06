-- Migration 024: Overdue and Suspected Occupied System
-- Implements overdue locker marking and suspected occupied reporting
-- Requirements: 5.1, 5.2, 5.3, 5.4, 5.5

-- User reports table for tracking suspected occupied reports
CREATE TABLE IF NOT EXISTS user_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('suspected_occupied')),
  reported_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Locker operations table for tracking recent opens (for report window)
CREATE TABLE IF NOT EXISTS locker_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER NOT NULL,
  card_id TEXT,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('open', 'close', 'assign', 'release')),
  opened_at DATETIME,
  closed_at DATETIME,
  success BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_reports_card_date ON user_reports(card_id, reported_at);
CREATE INDEX IF NOT EXISTS idx_user_reports_locker ON user_reports(kiosk_id, locker_id);
CREATE INDEX IF NOT EXISTS idx_locker_operations_locker_time ON locker_operations(kiosk_id, locker_id, opened_at);
CREATE INDEX IF NOT EXISTS idx_locker_operations_card ON locker_operations(card_id, opened_at);

-- Add overdue and suspected configuration to global settings
INSERT OR IGNORE INTO settings_global (key, value, data_type, updated_by) 
VALUES ('user_report_window_seconds', '30', 'number', 'system_migration');

INSERT OR IGNORE INTO settings_global (key, value, data_type, updated_by) 
VALUES ('suspect_ttl_minutes', '60', 'number', 'system_migration');

INSERT OR IGNORE INTO settings_global (key, value, data_type, updated_by) 
VALUES ('daily_report_cap', '2', 'number', 'system_migration');

INSERT OR IGNORE INTO settings_global (key, value, data_type, updated_by) 
VALUES ('retrieval_grace_period_minutes', '10', 'number', 'system_migration');

-- Update configuration version
UPDATE config_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
INSERT OR IGNORE INTO config_version (id, version) VALUES (1, 1);