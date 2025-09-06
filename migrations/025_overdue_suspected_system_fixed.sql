-- Migration 025: Overdue and Suspected Occupied System (Fixed)
-- Implements overdue locker marking and suspected occupied reporting
-- Requirements: 5.1, 5.2, 5.3, 5.4, 5.5

-- Add retrieved_once column to lockers table for one-time retrieval gating
ALTER TABLE lockers ADD COLUMN retrieved_once INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lockers ADD COLUMN retrieved_at DATETIME;

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
  success INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin audit table for tracking admin actions
CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  editor TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('clear_suspected', 'force_clear_overdue')),
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  version INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_user_reports_card_date ON user_reports(card_id, reported_at);
CREATE INDEX IF NOT EXISTS idx_user_reports_locker ON user_reports(kiosk_id, locker_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_kiosk_date ON user_reports(kiosk_id, reported_at);
CREATE INDEX IF NOT EXISTS idx_locker_operations_locker_time ON locker_operations(kiosk_id, locker_id, opened_at);
CREATE INDEX IF NOT EXISTS idx_locker_operations_card ON locker_operations(card_id, opened_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_editor ON admin_audit(editor, timestamp);
CREATE INDEX IF NOT EXISTS idx_admin_audit_locker ON admin_audit(kiosk_id, locker_id, timestamp);

-- Composite indexes for assignment queries
CREATE INDEX IF NOT EXISTS idx_lockers_kiosk_overdue ON lockers(kiosk_id, overdue_from);
CREATE INDEX IF NOT EXISTS idx_lockers_kiosk_suspected ON lockers(kiosk_id, suspected_occupied);

-- Basic composite indexes for overdue and suspected handling
CREATE INDEX IF NOT EXISTS idx_lockers_assignment_basic ON lockers(kiosk_id, status, overdue_from, suspected_occupied);