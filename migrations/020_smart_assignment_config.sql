-- Migration 020: Smart Assignment Configuration System
-- Creates tables for feature flags and configuration management

-- Global configuration table
CREATE TABLE IF NOT EXISTS settings_global (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'string',
  description TEXT,
  updated_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (data_type IN ('string', 'number', 'boolean', 'json'))
);

-- Per-kiosk configuration overrides
CREATE TABLE IF NOT EXISTS settings_kiosk (
  kiosk_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'string',
  description TEXT,
  updated_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kiosk_id, key),
  CHECK (data_type IN ('string', 'number', 'boolean', 'json'))
);

-- Configuration version tracking for hot reload
CREATE TABLE IF NOT EXISTS config_version (
  id INTEGER PRIMARY KEY DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (id = 1)
);

-- Configuration audit history
CREATE TABLE IF NOT EXISTS config_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT, -- NULL for global config
  key TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  data_type TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial configuration version
INSERT OR IGNORE INTO config_version (id, version) VALUES (1, 1);

-- Seed default configuration values for smart assignment
INSERT OR IGNORE INTO settings_global (key, value, data_type, description) VALUES
  -- Feature flags
  ('smart_assignment_enabled', 'false', 'boolean', 'Enable smart locker assignment system (default: OFF)'),
  ('allow_reclaim_during_quarantine', 'false', 'boolean', 'Allow reclaim during quarantine period'),
  
  -- Scoring parameters
  ('base_score', '100', 'number', 'Base score for locker selection algorithm'),
  ('score_factor_a', '2.0', 'number', 'Free hours multiplier in scoring'),
  ('score_factor_b', '1.0', 'number', 'Hours since last owner multiplier'),
  ('score_factor_g', '0.1', 'number', 'Wear count divisor factor'),
  ('score_factor_d', '0.5', 'number', 'Waiting hours bonus factor'),
  ('top_k_candidates', '5', 'number', 'Number of top candidates for selection'),
  ('selection_temperature', '1.0', 'number', 'Temperature for weighted random selection'),
  
  -- Quarantine settings
  ('quarantine_minutes_base', '5', 'number', 'Minimum quarantine duration in minutes'),
  ('quarantine_minutes_ceiling', '20', 'number', 'Maximum quarantine duration in minutes'),
  ('exit_quarantine_minutes', '20', 'number', 'Fixed exit quarantine duration'),
  
  -- Return hold settings
  ('return_hold_trigger_seconds', '120', 'number', 'Seconds to trigger return hold detection'),
  ('return_hold_minutes', '15', 'number', 'Return hold duration in minutes'),
  
  -- Session and timing
  ('session_limit_minutes', '180', 'number', 'Smart session limit in minutes'),
  ('retrieve_window_minutes', '10', 'number', 'Window for overdue retrieval'),
  
  -- Capacity management
  ('reserve_ratio', '0.1', 'number', 'Percentage of lockers to reserve'),
  ('reserve_minimum', '2', 'number', 'Minimum number of lockers to reserve'),
  
  -- Hardware settings
  ('sensorless_pulse_ms', '800', 'number', 'Pulse duration for sensorless operation'),
  ('open_window_seconds', '10', 'number', 'Open confirmation window'),
  ('retry_count', '1', 'number', 'Number of retries for failed operations'),
  ('retry_backoff_ms', '500', 'number', 'Backoff time between retries'),
  
  -- Rate limits
  ('card_rate_limit_seconds', '10', 'number', 'Rate limit per card in seconds'),
  ('locker_rate_limit_per_minute', '3', 'number', 'Opens per locker per minute'),
  ('command_cooldown_seconds', '3', 'number', 'Cooldown between commands'),
  ('user_report_daily_cap', '2', 'number', 'Daily cap for user reports');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_settings_global_key ON settings_global(key);
CREATE INDEX IF NOT EXISTS idx_settings_kiosk_kiosk_key ON settings_kiosk(kiosk_id, key);
CREATE INDEX IF NOT EXISTS idx_config_history_key ON config_history(key);
CREATE INDEX IF NOT EXISTS idx_config_history_kiosk ON config_history(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_config_history_changed_at ON config_history(changed_at);

-- Triggers for configuration change tracking
CREATE TRIGGER IF NOT EXISTS settings_global_audit
  AFTER UPDATE ON settings_global
  FOR EACH ROW
  BEGIN
    INSERT INTO config_history (kiosk_id, key, old_value, new_value, data_type, changed_by, changed_at)
    VALUES (NULL, NEW.key, OLD.value, NEW.value, NEW.data_type, NEW.updated_by, CURRENT_TIMESTAMP);
    
    UPDATE config_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
  END;

CREATE TRIGGER IF NOT EXISTS settings_kiosk_audit
  AFTER UPDATE ON settings_kiosk
  FOR EACH ROW
  BEGIN
    INSERT INTO config_history (kiosk_id, key, old_value, new_value, data_type, changed_by, changed_at)
    VALUES (NEW.kiosk_id, NEW.key, OLD.value, NEW.value, NEW.data_type, NEW.updated_by, CURRENT_TIMESTAMP);
    
    UPDATE config_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
  END;

CREATE TRIGGER IF NOT EXISTS settings_global_insert_audit
  AFTER INSERT ON settings_global
  FOR EACH ROW
  BEGIN
    INSERT INTO config_history (kiosk_id, key, old_value, new_value, data_type, changed_by, changed_at)
    VALUES (NULL, NEW.key, NULL, NEW.value, NEW.data_type, NEW.updated_by, CURRENT_TIMESTAMP);
    
    UPDATE config_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
  END;

CREATE TRIGGER IF NOT EXISTS settings_kiosk_insert_audit
  AFTER INSERT ON settings_kiosk
  FOR EACH ROW
  BEGIN
    INSERT INTO config_history (kiosk_id, key, old_value, new_value, data_type, changed_by, changed_at)
    VALUES (NEW.kiosk_id, NEW.key, NULL, NEW.value, NEW.data_type, NEW.updated_by, CURRENT_TIMESTAMP);
    
    UPDATE config_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
  END;