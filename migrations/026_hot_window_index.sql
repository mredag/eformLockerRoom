-- Migration 026: Hot Window Index
-- Adds performance index for hot window queries

-- Add index for hot window queries
CREATE INDEX IF NOT EXISTS idx_lockers_hot ON lockers(kiosk_id, owner_hot_until);

-- This index optimizes queries like:
-- SELECT * FROM lockers WHERE kiosk_id = ? AND owner_hot_until > CURRENT_TIMESTAMP
-- UPDATE lockers SET owner_hot_until = NULL WHERE kiosk_id = ? AND owner_hot_until <= CURRENT_TIMESTAMP