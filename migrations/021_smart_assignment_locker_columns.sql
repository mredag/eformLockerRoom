-- Migration 021: Smart Assignment Locker Columns
-- Adds essential columns to lockers table for smart assignment functionality
-- This migration is reversible for rollback scenarios

-- Add smart assignment columns to lockers table
ALTER TABLE lockers ADD COLUMN free_since DATETIME;
ALTER TABLE lockers ADD COLUMN recent_owner TEXT;
ALTER TABLE lockers ADD COLUMN recent_owner_time DATETIME;
ALTER TABLE lockers ADD COLUMN quarantine_until DATETIME;
ALTER TABLE lockers ADD COLUMN wear_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lockers ADD COLUMN return_hold_until DATETIME;
ALTER TABLE lockers ADD COLUMN overdue_from DATETIME;
ALTER TABLE lockers ADD COLUMN overdue_reason TEXT CHECK (overdue_reason IN ('time_limit', 'user_report'));
ALTER TABLE lockers ADD COLUMN suspected_occupied INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lockers ADD COLUMN cleared_by TEXT;
ALTER TABLE lockers ADD COLUMN cleared_at DATETIME;
ALTER TABLE lockers ADD COLUMN owner_hot_until DATETIME;

-- Create indexes for performance optimization on new columns
CREATE INDEX IF NOT EXISTS idx_lockers_free_since ON lockers(free_since);
CREATE INDEX IF NOT EXISTS idx_lockers_recent_owner ON lockers(recent_owner);
CREATE INDEX IF NOT EXISTS idx_lockers_recent_owner_time ON lockers(recent_owner_time);
CREATE INDEX IF NOT EXISTS idx_lockers_quarantine_until ON lockers(quarantine_until);
CREATE INDEX IF NOT EXISTS idx_lockers_wear_count ON lockers(wear_count);
CREATE INDEX IF NOT EXISTS idx_lockers_return_hold_until ON lockers(return_hold_until);
CREATE INDEX IF NOT EXISTS idx_lockers_overdue_from ON lockers(overdue_from);
CREATE INDEX IF NOT EXISTS idx_lockers_suspected_occupied ON lockers(suspected_occupied);
CREATE INDEX IF NOT EXISTS idx_lockers_owner_hot_until ON lockers(owner_hot_until);

-- Required composite indexes for smart assignment queries
CREATE INDEX IF NOT EXISTS idx_lockers_status_free_since ON lockers(kiosk_id, status, free_since);
CREATE INDEX IF NOT EXISTS idx_lockers_quarantine_query ON lockers(kiosk_id, quarantine_until);
CREATE INDEX IF NOT EXISTS idx_lockers_recent_owner_query ON lockers(kiosk_id, recent_owner);

-- Additional composite indexes for assignment and scoring queries
CREATE INDEX IF NOT EXISTS idx_lockers_assignment_query ON lockers(kiosk_id, status, quarantine_until, return_hold_until, overdue_from, suspected_occupied);
CREATE INDEX IF NOT EXISTS idx_lockers_scoring_query ON lockers(kiosk_id, status, free_since, recent_owner_time, wear_count);

-- Initialize smart assignment data for existing lockers
-- Set free_since for all currently free lockers
UPDATE lockers 
SET free_since = CURRENT_TIMESTAMP 
WHERE status = 'Free' AND free_since IS NULL;

-- Set wear_count to 0 for all existing lockers if not already set
UPDATE lockers 
SET wear_count = 0 
WHERE wear_count IS NULL;

-- ROLLBACK INSTRUCTIONS (for migration reversal):
-- To rollback this migration, run the following commands:
/*
-- Remove new columns from lockers table (SQLite doesn't support DROP COLUMN directly)
-- You would need to recreate the table without these columns:

-- 1. Create backup table with original structure
CREATE TABLE lockers_backup AS 
SELECT kiosk_id, id, status, owner_type, owner_key, reserved_at, owned_at, version, is_vip, 
       display_name, name_updated_at, name_updated_by, created_at, updated_at 
FROM lockers;

-- 2. Drop original table
DROP TABLE lockers;

-- 3. Recreate original table structure
CREATE TABLE lockers (
  kiosk_id TEXT NOT NULL,
  id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Free',
  owner_type TEXT,
  owner_key TEXT,
  reserved_at DATETIME,
  owned_at DATETIME,
  version INTEGER NOT NULL DEFAULT 1,
  is_vip BOOLEAN NOT NULL DEFAULT 0,
  display_name VARCHAR(20),
  name_updated_at DATETIME,
  name_updated_by VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kiosk_id, id)
);

-- 4. Restore data
INSERT INTO lockers SELECT * FROM lockers_backup;

-- 5. Drop backup table
DROP TABLE lockers_backup;

-- 6. Recreate original indexes
CREATE INDEX IF NOT EXISTS idx_lockers_kiosk_status ON lockers(kiosk_id, status);
CREATE INDEX IF NOT EXISTS idx_lockers_owner_key ON lockers(owner_key);
CREATE INDEX IF NOT EXISTS idx_lockers_display_name ON lockers(display_name);
*/