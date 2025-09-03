-- Hardware Configuration Wizard Security Audit Tables
-- Migration: 021_wizard_security_audit.sql

-- Security audit log table
CREATE TABLE IF NOT EXISTS wizard_security_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id TEXT UNIQUE NOT NULL, -- UUID for the audit entry
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  operation TEXT NOT NULL, -- WizardOperation enum value
  resource TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  details TEXT, -- JSON details
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  session_id TEXT,
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  
  -- Indexes for efficient querying
  INDEX idx_wizard_audit_timestamp (timestamp),
  INDEX idx_wizard_audit_user (user_id),
  INDEX idx_wizard_audit_operation (operation),
  INDEX idx_wizard_audit_success (success),
  INDEX idx_wizard_audit_risk_level (risk_level),
  INDEX idx_wizard_audit_session (session_id)
);

-- Security alerts table
CREATE TABLE IF NOT EXISTS wizard_security_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id TEXT UNIQUE NOT NULL, -- UUID for the alert
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  type TEXT NOT NULL CHECK (type IN ('rate_limit', 'suspicious_activity', 'unauthorized_access', 'system_anomaly', 'emergency_stop')),
  message TEXT NOT NULL,
  user_id INTEGER,
  username TEXT,
  session_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  details TEXT, -- JSON details
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at DATETIME,
  resolved_by TEXT,
  
  -- Indexes for efficient querying
  INDEX idx_wizard_alerts_timestamp (timestamp),
  INDEX idx_wizard_alerts_severity (severity),
  INDEX idx_wizard_alerts_type (type),
  INDEX idx_wizard_alerts_resolved (resolved),
  INDEX idx_wizard_alerts_user (user_id)
);

-- Rate limiting tracking table
CREATE TABLE IF NOT EXISTS wizard_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  operation TEXT NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start DATETIME DEFAULT CURRENT_TIMESTAMP,
  window_end DATETIME NOT NULL,
  
  -- Composite index for efficient rate limit checks
  UNIQUE INDEX idx_wizard_rate_limit_user_op (user_id, operation, window_start),
  INDEX idx_wizard_rate_limit_window (window_end)
);

-- Security metrics summary table (for performance)
CREATE TABLE IF NOT EXISTS wizard_security_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE DEFAULT (DATE('now')),
  total_operations INTEGER DEFAULT 0,
  failed_operations INTEGER DEFAULT 0,
  suspicious_activities INTEGER DEFAULT 0,
  rate_limit_violations INTEGER DEFAULT 0,
  emergency_stops INTEGER DEFAULT 0,
  active_alerts INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  unique_ips INTEGER DEFAULT 0,
  
  -- One record per date
  UNIQUE INDEX idx_wizard_metrics_date (date)
);

-- Session security tracking
CREATE TABLE IF NOT EXISTS wizard_session_security (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  risk_score INTEGER DEFAULT 0,
  suspicious_flags TEXT, -- JSON array of flags
  
  -- Indexes
  INDEX idx_wizard_session_security_session (session_id),
  INDEX idx_wizard_session_security_user (user_id),
  INDEX idx_wizard_session_security_activity (last_activity),
  INDEX idx_wizard_session_security_risk (risk_score)
);

-- Configuration change audit
CREATE TABLE IF NOT EXISTS wizard_config_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  change_id TEXT UNIQUE NOT NULL, -- UUID
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  session_id TEXT,
  change_type TEXT NOT NULL, -- 'add_card', 'update_config', 'restart_service', etc.
  resource_type TEXT NOT NULL, -- 'relay_card', 'system_config', 'service', etc.
  resource_id TEXT, -- ID of the changed resource
  old_value TEXT, -- JSON of old configuration
  new_value TEXT, -- JSON of new configuration
  success BOOLEAN NOT NULL,
  error_message TEXT,
  rollback_data TEXT, -- JSON data needed for rollback
  
  -- Indexes
  INDEX idx_wizard_config_timestamp (timestamp),
  INDEX idx_wizard_config_user (user_id),
  INDEX idx_wizard_config_type (change_type),
  INDEX idx_wizard_config_success (success)
);

-- Emergency stop log
CREATE TABLE IF NOT EXISTS wizard_emergency_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stop_id TEXT UNIQUE NOT NULL, -- UUID
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  session_id TEXT,
  reason TEXT NOT NULL,
  affected_sessions TEXT, -- JSON array of affected session IDs
  recovery_actions TEXT, -- JSON array of recovery actions taken
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at DATETIME,
  resolved_by TEXT,
  
  -- Indexes
  INDEX idx_wizard_emergency_timestamp (timestamp),
  INDEX idx_wizard_emergency_user (user_id),
  INDEX idx_wizard_emergency_resolved (resolved)
);

-- Triggers to maintain security metrics
CREATE TRIGGER IF NOT EXISTS update_wizard_security_metrics_insert
AFTER INSERT ON wizard_security_audit
BEGIN
  INSERT OR REPLACE INTO wizard_security_metrics (
    date, 
    total_operations, 
    failed_operations,
    unique_users,
    unique_ips
  )
  SELECT 
    DATE(NEW.timestamp),
    COALESCE(old.total_operations, 0) + 1,
    COALESCE(old.failed_operations, 0) + CASE WHEN NEW.success = 0 THEN 1 ELSE 0 END,
    (SELECT COUNT(DISTINCT user_id) FROM wizard_security_audit WHERE DATE(timestamp) = DATE(NEW.timestamp)),
    (SELECT COUNT(DISTINCT ip_address) FROM wizard_security_audit WHERE DATE(timestamp) = DATE(NEW.timestamp))
  FROM (
    SELECT * FROM wizard_security_metrics WHERE date = DATE(NEW.timestamp)
  ) AS old;
END;

CREATE TRIGGER IF NOT EXISTS update_wizard_security_metrics_alert
AFTER INSERT ON wizard_security_alerts
BEGIN
  UPDATE wizard_security_metrics 
  SET 
    suspicious_activities = suspicious_activities + CASE WHEN NEW.type = 'suspicious_activity' THEN 1 ELSE 0 END,
    rate_limit_violations = rate_limit_violations + CASE WHEN NEW.type = 'rate_limit' THEN 1 ELSE 0 END,
    emergency_stops = emergency_stops + CASE WHEN NEW.type = 'emergency_stop' THEN 1 ELSE 0 END,
    active_alerts = (SELECT COUNT(*) FROM wizard_security_alerts WHERE resolved = FALSE)
  WHERE date = DATE(NEW.timestamp);
  
  -- Insert new metrics record if none exists for today
  INSERT OR IGNORE INTO wizard_security_metrics (date, active_alerts) 
  VALUES (
    DATE(NEW.timestamp),
    (SELECT COUNT(*) FROM wizard_security_alerts WHERE resolved = FALSE)
  );
END;

CREATE TRIGGER IF NOT EXISTS update_wizard_security_metrics_resolve
AFTER UPDATE ON wizard_security_alerts
WHEN NEW.resolved = TRUE AND OLD.resolved = FALSE
BEGIN
  UPDATE wizard_security_metrics 
  SET active_alerts = (SELECT COUNT(*) FROM wizard_security_alerts WHERE resolved = FALSE)
  WHERE date = DATE(NEW.timestamp);
END;

-- Cleanup old audit data (keep last 90 days by default)
CREATE TRIGGER IF NOT EXISTS cleanup_old_wizard_audit
AFTER INSERT ON wizard_security_audit
WHEN (SELECT COUNT(*) FROM wizard_security_audit) > 100000
BEGIN
  DELETE FROM wizard_security_audit 
  WHERE timestamp < datetime('now', '-90 days');
  
  DELETE FROM wizard_rate_limits 
  WHERE window_end < datetime('now', '-7 days');
  
  DELETE FROM wizard_security_metrics 
  WHERE date < date('now', '-365 days');
END;

-- Initial security metrics record for today
INSERT OR IGNORE INTO wizard_security_metrics (date) VALUES (DATE('now'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_wizard_audit_composite ON wizard_security_audit (user_id, operation, timestamp);
CREATE INDEX IF NOT EXISTS idx_wizard_alerts_composite ON wizard_security_alerts (severity, type, resolved, timestamp);
CREATE INDEX IF NOT EXISTS idx_wizard_config_composite ON wizard_config_changes (user_id, change_type, timestamp);

PRAGMA user_version = 21;