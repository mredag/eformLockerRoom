-- Migration 019: Hardware Configuration Wizard Tables
-- Add tables for wizard session tracking, hardware test history, and configuration audit
-- Implements requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6

-- Wizard sessions table for tracking multi-step hardware configuration processes
CREATE TABLE IF NOT EXISTS wizard_sessions (
  session_id TEXT PRIMARY KEY,
  current_step INTEGER NOT NULL DEFAULT 1,
  max_completed_step INTEGER NOT NULL DEFAULT 0,
  card_data TEXT, -- JSON containing detected card information
  test_results TEXT, -- JSON containing test execution results
  errors TEXT, -- JSON array of errors encountered during wizard
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+2 hours')), -- Session expiration
  status TEXT NOT NULL DEFAULT 'active',
  CHECK (current_step BETWEEN 1 AND 5),
  CHECK (max_completed_step BETWEEN 0 AND 5),
  CHECK (status IN ('active', 'completed', 'cancelled', 'expired', 'error'))
);

-- Hardware test history table for tracking all hardware testing operations
CREATE TABLE IF NOT EXISTS hardware_test_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  device_address INTEGER NOT NULL,
  test_type TEXT NOT NULL,
  test_name TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  duration_ms INTEGER,
  details TEXT, -- Additional test details or measurements
  error_message TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  wizard_step INTEGER, -- Which wizard step triggered this test
  retry_count INTEGER DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES wizard_sessions(session_id) ON DELETE CASCADE,
  CHECK (test_type IN ('communication', 'relay_activation', 'address_config', 'full_suite', 'reliability')),
  CHECK (wizard_step BETWEEN 1 AND 5 OR wizard_step IS NULL),
  CHECK (retry_count >= 0)
);

-- Configuration audit table for tracking all configuration changes made by wizard
CREATE TABLE IF NOT EXISTS configuration_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  change_type TEXT NOT NULL,
  old_value TEXT, -- JSON representation of old configuration
  new_value TEXT, -- JSON representation of new configuration
  success BOOLEAN NOT NULL,
  error_message TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  wizard_step INTEGER, -- Which wizard step made this change
  rollback_id INTEGER, -- Reference to rollback operation if applicable
  user_context TEXT, -- Additional context about who/what triggered the change
  FOREIGN KEY (session_id) REFERENCES wizard_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (rollback_id) REFERENCES configuration_audit(id),
  CHECK (change_type IN ('add_card', 'update_config', 'restart_service', 'address_assignment', 'system_integration', 'rollback')),
  CHECK (wizard_step BETWEEN 1 AND 5 OR wizard_step IS NULL)
);

-- Indexes for efficient session lookup and cleanup
CREATE INDEX IF NOT EXISTS idx_wizard_sessions_status ON wizard_sessions(status);
CREATE INDEX IF NOT EXISTS idx_wizard_sessions_created_at ON wizard_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_wizard_sessions_expires_at ON wizard_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_wizard_sessions_last_updated ON wizard_sessions(last_updated);

-- Indexes for hardware test history queries
CREATE INDEX IF NOT EXISTS idx_hardware_test_session_id ON hardware_test_history(session_id);
CREATE INDEX IF NOT EXISTS idx_hardware_test_device_address ON hardware_test_history(device_address);
CREATE INDEX IF NOT EXISTS idx_hardware_test_type ON hardware_test_history(test_type);
CREATE INDEX IF NOT EXISTS idx_hardware_test_timestamp ON hardware_test_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_hardware_test_success ON hardware_test_history(success);
CREATE INDEX IF NOT EXISTS idx_hardware_test_wizard_step ON hardware_test_history(wizard_step);

-- Indexes for configuration audit queries
CREATE INDEX IF NOT EXISTS idx_config_audit_session_id ON configuration_audit(session_id);
CREATE INDEX IF NOT EXISTS idx_config_audit_change_type ON configuration_audit(change_type);
CREATE INDEX IF NOT EXISTS idx_config_audit_timestamp ON configuration_audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_config_audit_success ON configuration_audit(success);
CREATE INDEX IF NOT EXISTS idx_config_audit_wizard_step ON configuration_audit(wizard_step);
CREATE INDEX IF NOT EXISTS idx_config_audit_rollback_id ON configuration_audit(rollback_id);

-- View for active wizard sessions with summary information
CREATE VIEW IF NOT EXISTS active_wizard_sessions_view AS
SELECT 
  ws.session_id,
  ws.current_step,
  ws.max_completed_step,
  ws.status,
  ws.created_at,
  ws.last_updated,
  ws.expires_at,
  CASE 
    WHEN ws.expires_at < datetime('now') THEN 'expired'
    ELSE ws.status 
  END as effective_status,
  COUNT(hth.id) as total_tests,
  COUNT(CASE WHEN hth.success = 1 THEN 1 END) as passed_tests,
  COUNT(CASE WHEN hth.success = 0 THEN 1 END) as failed_tests,
  COUNT(ca.id) as config_changes,
  COUNT(CASE WHEN ca.success = 1 THEN 1 END) as successful_changes,
  COUNT(CASE WHEN ca.success = 0 THEN 1 END) as failed_changes
FROM wizard_sessions ws
LEFT JOIN hardware_test_history hth ON ws.session_id = hth.session_id
LEFT JOIN configuration_audit ca ON ws.session_id = ca.session_id
WHERE ws.status = 'active'
GROUP BY ws.session_id, ws.current_step, ws.max_completed_step, ws.status, 
         ws.created_at, ws.last_updated, ws.expires_at;

-- View for hardware test summary by device address
CREATE VIEW IF NOT EXISTS hardware_test_summary_view AS
SELECT 
  hth.device_address,
  hth.test_type,
  COUNT(*) as total_tests,
  COUNT(CASE WHEN hth.success = 1 THEN 1 END) as passed_tests,
  COUNT(CASE WHEN hth.success = 0 THEN 1 END) as failed_tests,
  AVG(hth.duration_ms) as avg_duration_ms,
  MIN(hth.duration_ms) as min_duration_ms,
  MAX(hth.duration_ms) as max_duration_ms,
  MAX(hth.timestamp) as last_tested,
  CASE 
    WHEN COUNT(*) > 0 THEN 
      (COUNT(CASE WHEN hth.success = 1 THEN 1 END) * 100.0 / COUNT(*))
    ELSE 0 
  END as success_rate,
  AVG(hth.retry_count) as avg_retry_count
FROM hardware_test_history hth
WHERE hth.timestamp >= datetime('now', '-30 days')
GROUP BY hth.device_address, hth.test_type
ORDER BY hth.device_address, hth.test_type;

-- View for configuration audit trail with rollback information
CREATE VIEW IF NOT EXISTS configuration_audit_trail_view AS
SELECT 
  ca.id,
  ca.session_id,
  ca.change_type,
  ca.success,
  ca.timestamp,
  ca.wizard_step,
  ca.user_context,
  ca.rollback_id,
  rollback_ca.timestamp as rollback_timestamp,
  rollback_ca.success as rollback_success,
  CASE 
    WHEN ca.rollback_id IS NOT NULL THEN 'rolled_back'
    WHEN ca.success = 1 THEN 'applied'
    ELSE 'failed'
  END as change_status
FROM configuration_audit ca
LEFT JOIN configuration_audit rollback_ca ON ca.rollback_id = rollback_ca.id
ORDER BY ca.timestamp DESC;

-- Trigger to automatically update last_updated timestamp on wizard_sessions
CREATE TRIGGER IF NOT EXISTS update_wizard_session_timestamp
  AFTER UPDATE ON wizard_sessions
  FOR EACH ROW
  WHEN NEW.last_updated = OLD.last_updated
BEGIN
  UPDATE wizard_sessions 
  SET last_updated = datetime('now') 
  WHERE session_id = NEW.session_id;
END;

-- Trigger to automatically expire old wizard sessions
CREATE TRIGGER IF NOT EXISTS expire_old_wizard_sessions
  AFTER INSERT ON wizard_sessions
  FOR EACH ROW
BEGIN
  UPDATE wizard_sessions 
  SET status = 'expired' 
  WHERE expires_at < datetime('now') 
    AND status = 'active';
END;

-- Trigger to clean up old test history and audit records (keep 90 days)
CREATE TRIGGER IF NOT EXISTS cleanup_old_wizard_data
  AFTER INSERT ON hardware_test_history
  FOR EACH ROW
  WHEN (SELECT COUNT(*) FROM hardware_test_history) > 10000
BEGIN
  DELETE FROM hardware_test_history WHERE timestamp < datetime('now', '-90 days');
  DELETE FROM configuration_audit WHERE timestamp < datetime('now', '-90 days');
  DELETE FROM wizard_sessions WHERE created_at < datetime('now', '-90 days') AND status != 'active';
END;

-- Insert initial cleanup job marker
INSERT OR IGNORE INTO configuration_audit (
  session_id, 
  change_type, 
  old_value, 
  new_value, 
  success, 
  timestamp, 
  user_context
) VALUES (
  'system-init', 
  'system_integration', 
  '{}', 
  '{"action": "wizard_tables_created", "version": "019"}', 
  1, 
  datetime('now'), 
  'Migration 019: Hardware Wizard Tables'
);