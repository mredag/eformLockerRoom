-- Migration 010: Help Requests Table (Simplified)
-- Creates help_requests table for the simplified help request system

-- Help Requests Table (Simplified)
CREATE TABLE IF NOT EXISTS help_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  locker_no INTEGER,
  category TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  CHECK (status IN ('open', 'resolved')),
  CHECK (category IN ('lock_problem', 'other'))
);

-- Indexes for help_requests table performance
CREATE INDEX IF NOT EXISTS idx_help_requests_status ON help_requests(status);
CREATE INDEX IF NOT EXISTS idx_help_requests_kiosk ON help_requests(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_help_requests_created ON help_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_help_requests_category ON help_requests(category);

-- Trigger to automatically set resolved_at when status changes to resolved
CREATE TRIGGER IF NOT EXISTS update_help_requests_resolved_at 
  AFTER UPDATE ON help_requests
  FOR EACH ROW
  WHEN NEW.status = 'resolved' AND OLD.status != 'resolved'
  BEGIN
    UPDATE help_requests SET resolved_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

-- Trigger to clear resolved_at when status changes from resolved
CREATE TRIGGER IF NOT EXISTS clear_help_requests_resolved_at 
  AFTER UPDATE ON help_requests
  FOR EACH ROW
  WHEN NEW.status != 'resolved' AND OLD.status = 'resolved'
  BEGIN
    UPDATE help_requests SET resolved_at = NULL WHERE id = NEW.id;
  END;