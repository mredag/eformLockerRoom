-- Migration 032: Sessions Table Standardization
-- Updates smart_sessions to sessions table with consistent naming
-- Implements PII protection with card_hash_suffix
-- Standardizes expires_time to expires_at

-- Create new sessions table with standardized schema
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  card_hash_suffix TEXT NOT NULL,  -- Last 4 chars of SHA256(card_id) for PII protection
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,    -- Standardized from expires_time
  extension_count INTEGER DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,  -- For optimistic locking
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('active', 'expired', 'ended'))
);

-- Migrate data from smart_sessions to sessions (if smart_sessions exists)
INSERT OR IGNORE INTO sessions (
  id, card_hash_suffix, kiosk_id, locker_id, status, 
  created_at, expires_at, extension_count, version, updated_at
)
SELECT 
  id,
  substr(hex(randomblob(16)), -4) as card_hash_suffix,  -- Generate placeholder hash suffix
  kiosk_id,
  locker_id,
  CASE 
    WHEN status = 'overdue' THEN 'expired'
    WHEN status = 'cancelled' THEN 'ended'
    WHEN status = 'completed' THEN 'ended'
    ELSE status
  END as status,
  created_at,
  expires_time as expires_at,  -- Rename expires_time to expires_at
  extension_count,
  version,
  updated_at
FROM smart_sessions 
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='smart_sessions');

-- Create optimized indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_kiosk_status ON sessions(kiosk_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_kiosk_expires ON sessions(kiosk_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_hash_suffix ON sessions(card_hash_suffix);
CREATE INDEX IF NOT EXISTS idx_sessions_status_created ON sessions(status, created_at);

-- Drop old indexes on smart_sessions if they exist
DROP INDEX IF EXISTS idx_smart_sessions_card_status;
DROP INDEX IF EXISTS idx_smart_sessions_kiosk_status;
DROP INDEX IF EXISTS idx_smart_sessions_expires;
DROP INDEX IF EXISTS idx_smart_sessions_status_created;

-- Update session_extension_audit to reference sessions table
-- (Keep existing data, just ensure foreign key consistency)

-- Update configuration version
UPDATE config_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
INSERT OR IGNORE INTO config_version (id, version) VALUES (1, 1);