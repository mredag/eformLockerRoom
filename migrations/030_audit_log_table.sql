-- Migration 030: Audit Log Table for Overdue/Suspected Management
-- Creates audit trail for all administrative actions

-- Audit log table for tracking all administrative actions
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  editor TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_kiosk_locker ON audit_log(kiosk_id, locker_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_editor ON audit_log(editor);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);