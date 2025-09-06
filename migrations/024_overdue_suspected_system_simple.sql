-- Migration 024: Overdue and Suspected Occupied System (Simple)
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