-- Smart Assignment Configuration Seeding
-- Version: 1.0.0
-- Description: Seed default configuration values for smart assignment system

PRAGMA foreign_keys=ON;

BEGIN IMMEDIATE;

-- Seed default configuration values (INSERT OR IGNORE only)
INSERT OR IGNORE INTO settings_global (key, value, data_type, updated_by, updated_at) VALUES
  ('base_score', '100', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('score_factor_a', '2.0', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('score_factor_b', '1.0', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('score_factor_g', '0.1', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('score_factor_d', '0.5', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('top_k_candidates', '5', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('selection_temperature', '1.0', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('quarantine_min_floor', '5', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('quarantine_min_ceiling', '20', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('exit_quarantine_minutes', '20', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('return_hold_trigger_seconds', '120', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('return_hold_minutes', '15', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('session_limit_minutes', '180', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('retrieve_window_minutes', '10', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('reserve_ratio', '0.1', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('reserve_minimum', '2', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('pulse_ms', '800', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('open_window_sec', '10', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('retry_backoff_ms', '500', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('card_rate_limit_seconds', '10', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('locker_rate_limit_per_minute', '3', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('command_cooldown_seconds', '3', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('user_report_daily_cap', '2', 'number', 'deployment', CURRENT_TIMESTAMP),
  ('smart_assignment_enabled', 'false', 'boolean', 'deployment', CURRENT_TIMESTAMP),
  ('allow_reclaim_during_quarantine', 'false', 'boolean', 'deployment', CURRENT_TIMESTAMP);

-- Initialize configuration version (INSERT OR IGNORE only)
INSERT OR IGNORE INTO config_version (id, version, updated_at) VALUES (1, 1, CURRENT_TIMESTAMP);

-- Update existing lockers with initial smart assignment values (only if columns exist and values are NULL)
UPDATE lockers SET 
  free_since = CASE WHEN status = 'Free' AND free_since IS NULL THEN CURRENT_TIMESTAMP ELSE free_since END,
  wear_count = CASE WHEN wear_count IS NULL THEN 0 ELSE wear_count END,
  suspected_occupied = CASE WHEN suspected_occupied IS NULL THEN 0 ELSE suspected_occupied END
WHERE free_since IS NULL OR wear_count IS NULL OR suspected_occupied IS NULL;

COMMIT;

-- Verify seeding
SELECT 'Configuration seeded successfully. Entries: ' || COUNT(*) FROM settings_global;
SELECT 'Lockers initialized: ' || COUNT(*) FROM lockers WHERE free_since IS NOT NULL;