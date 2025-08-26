-- Migration 010: Add cancelled status to command_queue
-- Update the CHECK constraint to include 'cancelled' status

-- SQLite doesn't support modifying CHECK constraints directly
-- We need to recreate the table with the new constraint

-- Create a temporary table with the new constraint
CREATE TABLE command_queue_new (
  command_id TEXT PRIMARY KEY,
  kiosk_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  executed_at DATETIME,
  completed_at DATETIME,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'cancelled')),
  UNIQUE(command_id)
);

-- Copy data from old table to new table
INSERT INTO command_queue_new 
SELECT command_id, kiosk_id, command_type, payload, status, retry_count, max_retries,
       next_attempt_at, last_error, created_at, executed_at, completed_at, version
FROM command_queue;

-- Drop the old table
DROP TABLE command_queue;

-- Rename the new table
ALTER TABLE command_queue_new RENAME TO command_queue;

-- Recreate the indexes
CREATE INDEX IF NOT EXISTS idx_command_queue_status_next_attempt 
ON command_queue(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_command_queue_kiosk_status 
ON command_queue(kiosk_id, status);

CREATE INDEX IF NOT EXISTS idx_command_queue_completed_at 
ON command_queue(completed_at);