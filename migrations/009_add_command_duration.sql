-- Add duration tracking to command queue
-- Migration 009: Add command duration and completion timestamp

-- Add completed_at and duration_ms columns to command_queue table
ALTER TABLE command_queue ADD COLUMN completed_at DATETIME;
ALTER TABLE command_queue ADD COLUMN duration_ms INTEGER;

-- Create index for performance on completed commands
CREATE INDEX IF NOT EXISTS idx_command_queue_completed_at ON command_queue(completed_at);
CREATE INDEX IF NOT EXISTS idx_command_queue_duration ON command_queue(duration_ms);