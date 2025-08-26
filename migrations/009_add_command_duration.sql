-- Add duration tracking to command queue
-- Migration 009: Add command duration column

-- Add duration_ms column to command_queue table (completed_at already exists)
ALTER TABLE command_queue ADD COLUMN duration_ms INTEGER;

-- Create index for performance on duration queries
CREATE INDEX IF NOT EXISTS idx_command_queue_duration ON command_queue(duration_ms);