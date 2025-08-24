-- Master PIN Security Enhancement Migration
-- This migration adds tables for master PIN security management

-- System settings table for configuration
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Master PIN attempt tracking table
CREATE TABLE IF NOT EXISTS master_pin_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  client_ip TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  lockout_end INTEGER, -- Unix timestamp in milliseconds
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(kiosk_id, client_ip)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_master_pin_attempts_kiosk_ip ON master_pin_attempts(kiosk_id, client_ip);
CREATE INDEX IF NOT EXISTS idx_master_pin_attempts_lockout ON master_pin_attempts(lockout_end);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);

-- Insert default security settings
INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES 
  ('lockout_attempts', '5'),
  ('lockout_minutes', '5'),
  ('master_pin_hash', '$argon2id$v=19$m=65536,t=3,p=4$YourSaltHere$YourHashHere'); -- Default PIN: 1234

-- Event types will be handled by the application code

-- Clean up old lockout entries (older than 24 hours)
DELETE FROM master_pin_attempts 
WHERE updated_at < datetime('now', '-24 hours') 
  AND (lockout_end IS NULL OR lockout_end < strftime('%s', 'now') * 1000);