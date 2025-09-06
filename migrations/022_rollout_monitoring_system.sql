-- Migration 022: Rollout Monitoring System
-- Creates tables for tracking smart assignment rollout status and metrics

-- Rollout status tracking per kiosk (telemetry only - config is source of truth)
CREATE TABLE IF NOT EXISTS rollout_status (
  kiosk_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  enabled_at DATETIME,
  enabled_by TEXT,
  rollback_at DATETIME,
  rollback_by TEXT,
  rollback_reason TEXT,
  phase TEXT NOT NULL DEFAULT 'disabled',
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (phase IN ('disabled', 'enabled', 'monitoring', 'rolled_back'))
);

-- Rollout decision history
CREATE TABLE IF NOT EXISTS rollout_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  confidence REAL NOT NULL,
  reasons TEXT NOT NULL, -- JSON array of reasons
  metrics TEXT NOT NULL, -- JSON metrics data
  thresholds TEXT NOT NULL, -- JSON thresholds used
  decision_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  acted_upon INTEGER DEFAULT 0,
  acted_by TEXT,
  acted_at DATETIME,
  CHECK (recommendation IN ('enable', 'disable', 'monitor', 'rollback')),
  CHECK (confidence >= 0.0 AND confidence <= 1.0)
);

-- Rollout events log
CREATE TABLE IF NOT EXISTS rollout_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT,
  event_type TEXT NOT NULL,
  event_data TEXT, -- JSON event data
  triggered_by TEXT NOT NULL,
  event_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (event_type IN ('enabled', 'disabled', 'emergency_disable', 'automated_rollback', 'manual_rollback'))
);

-- Rollout thresholds configuration
CREATE TABLE IF NOT EXISTS rollout_thresholds (
  kiosk_id TEXT, -- NULL for global thresholds
  min_success_rate REAL NOT NULL DEFAULT 0.95,
  max_no_stock_rate REAL NOT NULL DEFAULT 0.05,
  max_retry_rate REAL NOT NULL DEFAULT 0.10,
  max_conflict_rate REAL NOT NULL DEFAULT 0.02,
  max_assignment_time_ms INTEGER NOT NULL DEFAULT 2000,
  min_sample_size INTEGER NOT NULL DEFAULT 50,
  updated_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kiosk_id)
);

-- Insert default global thresholds with proper defaults
INSERT OR IGNORE INTO rollout_thresholds (
  kiosk_id, min_success_rate, max_no_stock_rate, max_retry_rate, 
  max_conflict_rate, max_assignment_time_ms, min_sample_size,
  updated_by
) VALUES (
  NULL, 0.90, 0.05, 0.10, 0.02, 2000, 50, 'system'
);

-- Insert default alert thresholds
INSERT OR IGNORE INTO rollout_thresholds (
  kiosk_id, min_success_rate, max_no_stock_rate, max_retry_rate, 
  max_conflict_rate, max_assignment_time_ms, min_sample_size,
  updated_by
) VALUES (
  'alert_thresholds', 0.95, 0.03, 0.08, 0.01, 1500, 20, 'system'
);

-- Indexes for performance (avoid full table scans)
CREATE INDEX IF NOT EXISTS idx_rollout_status_enabled ON rollout_status(enabled);
CREATE INDEX IF NOT EXISTS idx_rollout_status_phase ON rollout_status(phase);
CREATE INDEX IF NOT EXISTS idx_rollout_status_kiosk_updated ON rollout_status(kiosk_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_rollout_decisions_kiosk_time ON rollout_decisions(kiosk_id, decision_time);
CREATE INDEX IF NOT EXISTS idx_rollout_events_kiosk_time ON rollout_events(kiosk_id, event_time);
CREATE INDEX IF NOT EXISTS idx_rollout_events_type ON rollout_events(event_type);
CREATE INDEX IF NOT EXISTS idx_monitoring_metrics_kiosk_timestamp ON monitoring_metrics(kiosk_id, timestamp);

-- Triggers for automatic timestamp updates
CREATE TRIGGER IF NOT EXISTS update_rollout_status_timestamp 
  AFTER UPDATE ON rollout_status
BEGIN
  UPDATE rollout_status SET updated_at = CURRENT_TIMESTAMP WHERE kiosk_id = NEW.kiosk_id;
END;

-- Monitoring metrics storage
CREATE TABLE IF NOT EXISTS monitoring_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  success_rate REAL NOT NULL,
  failure_rate REAL NOT NULL,
  avg_response_time REAL NOT NULL,
  total_assignments INTEGER NOT NULL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_failure_time DATETIME,
  alert_level TEXT NOT NULL DEFAULT 'none',
  recommended_action TEXT NOT NULL DEFAULT 'continue',
  CHECK (alert_level IN ('none', 'warning', 'critical')),
  CHECK (recommended_action IN ('continue', 'monitor', 'rollback'))
);

-- Monitoring configuration storage
CREATE TABLE IF NOT EXISTS monitoring_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for monitoring metrics
CREATE INDEX IF NOT EXISTS idx_monitoring_metrics_kiosk_time ON monitoring_metrics(kiosk_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_monitoring_metrics_alert_level ON monitoring_metrics(alert_level);
CREATE INDEX IF NOT EXISTS idx_monitoring_metrics_timestamp ON monitoring_metrics(timestamp);

-- View for rollout dashboard
CREATE VIEW IF NOT EXISTS rollout_dashboard AS
SELECT 
  rs.kiosk_id,
  rs.enabled,
  rs.phase,
  rs.enabled_at,
  rs.enabled_by,
  rs.rollback_at,
  rs.rollback_by,
  rs.rollback_reason,
  -- Latest metrics (calculated in application)
  NULL as total_assignments,
  NULL as success_rate,
  NULL as avg_assignment_time,
  -- Latest decision
  rd.recommendation as latest_recommendation,
  rd.confidence as latest_confidence,
  rd.decision_time as latest_decision_time,
  -- Latest monitoring metrics
  mm.alert_level as latest_alert_level,
  mm.recommended_action as latest_recommended_action,
  mm.timestamp as latest_metrics_time
FROM rollout_status rs
LEFT JOIN (
  SELECT DISTINCT kiosk_id,
    FIRST_VALUE(recommendation) OVER (PARTITION BY kiosk_id ORDER BY decision_time DESC) as recommendation,
    FIRST_VALUE(confidence) OVER (PARTITION BY kiosk_id ORDER BY decision_time DESC) as confidence,
    FIRST_VALUE(decision_time) OVER (PARTITION BY kiosk_id ORDER BY decision_time DESC) as decision_time,
    ROW_NUMBER() OVER (PARTITION BY kiosk_id ORDER BY decision_time DESC) as rn
  FROM rollout_decisions
) rd ON rs.kiosk_id = rd.kiosk_id AND rd.rn = 1
LEFT JOIN (
  SELECT DISTINCT kiosk_id,
    FIRST_VALUE(alert_level) OVER (PARTITION BY kiosk_id ORDER BY timestamp DESC) as alert_level,
    FIRST_VALUE(recommended_action) OVER (PARTITION BY kiosk_id ORDER BY timestamp DESC) as recommended_action,
    FIRST_VALUE(timestamp) OVER (PARTITION BY kiosk_id ORDER BY timestamp DESC) as timestamp,
    ROW_NUMBER() OVER (PARTITION BY kiosk_id ORDER BY timestamp DESC) as rn
  FROM monitoring_metrics
) mm ON rs.kiosk_id = mm.kiosk_id AND mm.rn = 1;