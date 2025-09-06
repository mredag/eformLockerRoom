-- Smart Assignment System - Rollback Documentation
-- Version: 1.0.0
-- Description: Rollback strategy documentation (NOT for production use)
-- 
-- IMPORTANT: In production, rollback is performed via backup restoration.
-- This SQL script is for reference and emergency scenarios only.
-- 
-- PRODUCTION ROLLBACK PROCEDURE:
-- 1. Stop all services
-- 2. Restore database from pre-deployment backup
-- 3. Restore configuration from backup
-- 4. Restart services
-- 
-- DO NOT drop new columns or tables in production as this can cause data loss.
-- This script is provided for development/testing environments only.

PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

-- Begin transaction for atomic rollback (DEVELOPMENT ONLY)
BEGIN IMMEDIATE;

-- 1. Backup current data before rollback (optional - create backup tables)
CREATE TABLE IF NOT EXISTS lockers_backup_pre_rollback AS 
SELECT * FROM lockers WHERE 1=0; -- Structure only

INSERT INTO lockers_backup_pre_rollback 
SELECT * FROM lockers;

-- 2. Drop smart assignment specific tables
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS assignment_metrics;
DROP TABLE IF EXISTS smart_sessions;
DROP TABLE IF EXISTS config_history;
DROP TABLE IF EXISTS config_version;
DROP TABLE IF EXISTS settings_kiosk;
DROP TABLE IF EXISTS settings_global;

-- 3. Drop indexes created for smart assignment
DROP INDEX IF EXISTS idx_lockers_free_since;
DROP INDEX IF EXISTS idx_lockers_quarantine_until;
DROP INDEX IF EXISTS idx_lockers_wear_count;
DROP INDEX IF EXISTS idx_lockers_overdue_from;
DROP INDEX IF EXISTS idx_lockers_return_hold_until;
DROP INDEX IF EXISTS idx_lockers_owner_hot_until;
DROP INDEX IF EXISTS idx_lockers_status_kiosk;

-- 4. Remove smart assignment columns from lockers table
-- Note: SQLite doesn't support DROP COLUMN directly, so we recreate the table

-- Create new lockers table with original schema
CREATE TABLE lockers_new (
  kiosk_id TEXT NOT NULL,
  id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Free',
  owner_type TEXT,
  owner_key TEXT,
  reserved_at DATETIME,
  owned_at DATETIME,
  version INTEGER NOT NULL DEFAULT 1,
  is_vip BOOLEAN NOT NULL DEFAULT 0,
  display_name TEXT,
  name_updated_at DATETIME,
  name_updated_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kiosk_id, id)
);

-- Copy original data (excluding smart assignment columns)
INSERT INTO lockers_new (
  kiosk_id, id, status, owner_type, owner_key, reserved_at, owned_at,
  version, is_vip, display_name, name_updated_at, name_updated_by,
  created_at, updated_at
)
SELECT 
  kiosk_id, id, status, owner_type, owner_key, reserved_at, owned_at,
  version, is_vip, display_name, name_updated_at, name_updated_by,
  created_at, updated_at
FROM lockers;

-- Replace original table
DROP TABLE lockers;
ALTER TABLE lockers_new RENAME TO lockers;

-- 5. Recreate original indexes
CREATE INDEX IF NOT EXISTS idx_lockers_kiosk_id ON lockers(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_lockers_status ON lockers(status);
CREATE INDEX IF NOT EXISTS idx_lockers_owner_key ON lockers(owner_key);
CREATE INDEX IF NOT EXISTS idx_lockers_is_vip ON lockers(is_vip);

-- 6. Reset any configuration files (this would be done by deployment script)
-- The deployment script should restore original config/system.json

COMMIT;

-- Verify rollback success
SELECT 'Rollback completed successfully. Smart assignment tables removed.';
SELECT 'Original lockers table restored with ' || COUNT(*) || ' records.' FROM lockers;

-- Verify no smart assignment columns exist
PRAGMA table_info(lockers);

PRAGMA integrity_check;