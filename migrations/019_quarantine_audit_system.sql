-- Migration: Add quarantine audit system
-- Description: Create audit table for quarantine management operations

-- Create quarantine audit table
CREATE TABLE IF NOT EXISTS quarantine_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER NOT NULL,
  admin_user TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_quarantine_audit_kiosk_locker 
ON quarantine_audit(kiosk_id, locker_id);

CREATE INDEX IF NOT EXISTS idx_quarantine_audit_timestamp 
ON quarantine_audit(timestamp);

CREATE INDEX IF NOT EXISTS idx_quarantine_audit_admin 
ON quarantine_audit(admin_user);

-- Create index on quarantine_until for efficient cleanup
CREATE INDEX IF NOT EXISTS idx_lockers_quarantine_until 
ON lockers(quarantine_until) 
WHERE quarantine_until IS NOT NULL;

-- Update configuration with standardized names
INSERT OR REPLACE INTO settings_global (key, value, data_type, description) VALUES
('quarantine_min_floor', '5', 'number', 'Minimum quarantine duration in minutes'),
('quarantine_min_ceiling', '20', 'number', 'Maximum quarantine duration in minutes'),
('exit_quarantine_minutes', '20', 'number', 'Fixed exit quarantine duration in minutes'),
('free_ratio_low', '0.1', 'number', 'Low capacity threshold for minimum quarantine'),
('free_ratio_high', '0.5', 'number', 'High capacity threshold for maximum quarantine'),
('quarantine_cleanup_interval_seconds', '60', 'number', 'Quarantine cleanup interval in seconds'),
('quarantine_cleanup_batch_size', '100', 'number', 'Maximum rows to clean up per batch');

-- Remove old configuration keys if they exist
DELETE FROM settings_global WHERE key IN (
  'quarantine_minutes_base',
  'quarantine_minutes_ceiling'
);