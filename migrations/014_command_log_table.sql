-- Migration 014: Command Log Table
-- Create table for logging remote command execution for troubleshooting
-- Requirements: 8.4 - Commands shall be logged for basic troubleshooting

CREATE TABLE IF NOT EXISTS command_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_id TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER,
  command_type TEXT NOT NULL,
  issued_by TEXT NOT NULL,
  success INTEGER, -- NULL for queued, 1 for success, 0 for failure
  message TEXT,
  error TEXT,
  execution_time_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CHECK (command_type IN ('open', 'close', 'reset', 'buzzer')),
  CHECK (success IS NULL OR success IN (0, 1)),
  CHECK (locker_id IS NULL OR (locker_id >= 1 AND locker_id <= 30))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_command_log_kiosk ON command_log(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_command_log_command_id ON command_log(command_id);
CREATE INDEX IF NOT EXISTS idx_command_log_created_at ON command_log(created_at);
CREATE INDEX IF NOT EXISTS idx_command_log_success ON command_log(success);
CREATE INDEX IF NOT EXISTS idx_command_log_type ON command_log(command_type);