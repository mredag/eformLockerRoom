-- Migration 009: Command Queue Enhancements
-- Add missing columns to command_queue table for admin panel integration

-- Add max_retries column
ALTER TABLE command_queue ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 3;

-- Add completed_at column
ALTER TABLE command_queue ADD COLUMN completed_at DATETIME;

-- Add version column for optimistic locking
ALTER TABLE command_queue ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Update existing records to have proper max_retries value
UPDATE command_queue SET max_retries = 3 WHERE max_retries IS NULL;

-- Create index for better performance on status and next_attempt_at queries
CREATE INDEX IF NOT EXISTS idx_command_queue_status_next_attempt 
ON command_queue(status, next_attempt_at);

-- Create index for kiosk_id and status queries
CREATE INDEX IF NOT EXISTS idx_command_queue_kiosk_status 
ON command_queue(kiosk_id, status);

-- Create index for completed_at for cleanup operations
CREATE INDEX IF NOT EXISTS idx_command_queue_completed_at 
ON command_queue(completed_at);