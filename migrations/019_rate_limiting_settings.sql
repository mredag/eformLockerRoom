-- Migration: Add rate limiting configuration to central settings
-- Date: 2025-01-09
-- Description: Add rate limiting settings with snake_case naming and validation bounds

-- Add rate limiting settings to global configuration
INSERT OR REPLACE INTO settings_global (key, value, data_type, description, updated_by, updated_at) VALUES
  ('card_open_min_interval_sec', '10', 'number', 'Minimum seconds between card opens (1-60)', 'system', CURRENT_TIMESTAMP),
  ('locker_opens_window_sec', '60', 'number', 'Time window for locker opens in seconds (10-300)', 'system', CURRENT_TIMESTAMP),
  ('locker_opens_max_per_window', '3', 'number', 'Maximum opens per locker per window (1-10)', 'system', CURRENT_TIMESTAMP),
  ('command_cooldown_sec', '3', 'number', 'Cooldown between relay commands in seconds (1-10)', 'system', CURRENT_TIMESTAMP),
  ('user_report_daily_cap', '2', 'number', 'Maximum user reports per day per card (0-10)', 'system', CURRENT_TIMESTAMP);

-- Update configuration version to trigger hot reload
UPDATE config_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;

-- Insert initial version if it doesn't exist
INSERT OR IGNORE INTO config_version (id, version, updated_at) VALUES (1, 1, CURRENT_TIMESTAMP);