-- Migration 009: Sessions Table for SQLite Session Storage
-- Creates sessions table to replace in-memory session storage

-- Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  user_agent TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  csrf_token TEXT NOT NULL,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  renewal_count INTEGER DEFAULT 0,
  max_renewals INTEGER DEFAULT 5,
  FOREIGN KEY (user_id) REFERENCES staff_users(id) ON DELETE CASCADE
);

-- Indexes for sessions table performance
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

-- Trigger to automatically update last_activity on session updates
CREATE TRIGGER IF NOT EXISTS update_sessions_last_activity 
  AFTER UPDATE ON sessions
  FOR EACH ROW
  WHEN NEW.last_activity = OLD.last_activity
  BEGIN
    UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;