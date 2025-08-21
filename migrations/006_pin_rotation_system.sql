-- Migration 006: PIN Rotation System
-- Add PIN history tracking and enhanced security features

-- Create PIN history table for preventing reuse
CREATE TABLE IF NOT EXISTS pin_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES staff_users(id) ON DELETE CASCADE
);

-- Create index for efficient PIN history queries
CREATE INDEX IF NOT EXISTS idx_pin_history_user_created ON pin_history(user_id, created_at DESC);

-- Add session tracking table for enhanced session management
CREATE TABLE IF NOT EXISTS user_sessions (
  session_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  csrf_token TEXT NOT NULL,
  renewal_count INTEGER DEFAULT 0,
  max_renewals INTEGER DEFAULT 5,
  requires_pin_change BOOLEAN DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES staff_users(id) ON DELETE CASCADE
);

-- Create indexes for session management
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);

-- Add rate limiting violations table for comprehensive tracking
CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  violation_key TEXT NOT NULL,
  limit_type TEXT NOT NULL, -- 'ip', 'card', 'locker', 'device'
  violation_count INTEGER DEFAULT 1,
  first_violation DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_violation DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_blocked BOOLEAN DEFAULT 0,
  block_expires_at DATETIME,
  kiosk_id TEXT,
  ip_address TEXT,
  details TEXT -- JSON with additional context
);

-- Create indexes for rate limiting
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_key ON rate_limit_violations(violation_key);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_type ON rate_limit_violations(limit_type);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_blocked ON rate_limit_violations(is_blocked, block_expires_at);

-- Add security audit log table for comprehensive audit trail
CREATE TABLE IF NOT EXISTS security_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  event_type TEXT NOT NULL, -- 'login', 'logout', 'pin_change', 'session_expired', etc.
  user_id INTEGER,
  username TEXT,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  session_id TEXT,
  success BOOLEAN NOT NULL,
  failure_reason TEXT,
  additional_data TEXT, -- JSON with extra context
  risk_level TEXT DEFAULT 'low' -- 'low', 'medium', 'high', 'critical'
);

-- Create indexes for security audit log
CREATE INDEX IF NOT EXISTS idx_security_audit_timestamp ON security_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_user ON security_audit_log(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_event_type ON security_audit_log(event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_risk_level ON security_audit_log(risk_level, timestamp DESC);

-- Update staff_users table to ensure pin_expires_at is properly set
UPDATE staff_users 
SET pin_expires_at = datetime('now', '+90 days')
WHERE pin_expires_at IS NULL;

-- Add configuration table for system-wide security settings
CREATE TABLE IF NOT EXISTS security_config (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Ensure single row
  session_timeout_minutes INTEGER DEFAULT 480, -- 8 hours
  max_idle_minutes INTEGER DEFAULT 30,
  pin_rotation_days INTEGER DEFAULT 90,
  max_concurrent_sessions INTEGER DEFAULT 3,
  rate_limit_ip_per_minute INTEGER DEFAULT 30,
  rate_limit_card_per_minute INTEGER DEFAULT 60,
  rate_limit_locker_per_minute INTEGER DEFAULT 6,
  rate_limit_device_per_20_seconds INTEGER DEFAULT 1,
  auto_renewal_enabled BOOLEAN DEFAULT 1,
  require_pin_change_on_expiry BOOLEAN DEFAULT 1,
  prevent_pin_reuse BOOLEAN DEFAULT 1,
  pin_reuse_history_count INTEGER DEFAULT 5,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default security configuration
INSERT OR IGNORE INTO security_config (id) VALUES (1);

-- Add trigger to update security_config timestamp
CREATE TRIGGER IF NOT EXISTS update_security_config_timestamp
AFTER UPDATE ON security_config
BEGIN
  UPDATE security_config SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Add trigger to clean up old PIN history automatically
CREATE TRIGGER IF NOT EXISTS cleanup_old_pin_history
AFTER INSERT ON pin_history
BEGIN
  DELETE FROM pin_history 
  WHERE user_id = NEW.user_id 
  AND id NOT IN (
    SELECT id FROM pin_history 
    WHERE user_id = NEW.user_id 
    ORDER BY created_at DESC 
    LIMIT (SELECT pin_reuse_history_count FROM security_config WHERE id = 1)
  );
END;

-- Add trigger to clean up expired sessions
CREATE TRIGGER IF NOT EXISTS cleanup_expired_sessions
AFTER INSERT ON user_sessions
BEGIN
  DELETE FROM user_sessions 
  WHERE expires_at < datetime('now');
END;

-- Add trigger to clean up old rate limit violations
CREATE TRIGGER IF NOT EXISTS cleanup_old_rate_limit_violations
AFTER INSERT ON rate_limit_violations
BEGIN
  DELETE FROM rate_limit_violations 
  WHERE last_violation < datetime('now', '-7 days')
  AND (is_blocked = 0 OR block_expires_at < datetime('now'));
END;

-- Add trigger to clean up old security audit logs (keep 90 days)
CREATE TRIGGER IF NOT EXISTS cleanup_old_security_audit_logs
AFTER INSERT ON security_audit_log
BEGIN
  DELETE FROM security_audit_log 
  WHERE timestamp < datetime('now', '-90 days');
END;