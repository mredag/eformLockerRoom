-- Migration 031: Metrics Dashboard System
-- Create optimized tables for metrics dashboard with proper SQLite schema

-- Alert tracking table (updated with composite indexes)
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  triggered_at TEXT NOT NULL,
  cleared_at TEXT,
  auto_clear_condition TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CHECK (type IN ('no_stock', 'conflict_rate', 'open_fail_rate', 'retry_rate', 'overdue_share')),
  CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CHECK (status IN ('active', 'cleared'))
);

-- Alert metrics tracking table for threshold calculations
CREATE TABLE IF NOT EXISTS alert_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  metric_value REAL NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 1,
  timestamp TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CHECK (metric_type IN ('no_stock_events', 'conflict_rate', 'open_fail_rate', 'retry_rate', 'overdue_share'))
);

-- Session metrics tracking table
CREATE TABLE IF NOT EXISTS session_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL,
  selected_locker_id INTEGER NOT NULL DEFAULT 0,
  time_to_selection_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CHECK (outcome IN ('active', 'completed', 'timeout', 'cancelled', 'error'))
);

-- UI performance metrics table
CREATE TABLE IF NOT EXISTS ui_performance_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CHECK (event_type IN ('state_update', 'session_start', 'locker_selection', 'ui_render')),
  CHECK (success IN (0, 1))
);

-- Performance snapshots table for aggregated metrics
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  period TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CHECK (period IN ('hour', 'day', 'week', 'month'))
);

-- Composite indexes for efficient queries
-- Alerts composite index (kiosk_id, type, status, triggered_at)
CREATE INDEX IF NOT EXISTS idx_alerts_composite ON alerts(kiosk_id, type, status, triggered_at);
CREATE INDEX IF NOT EXISTS idx_alerts_status_triggered ON alerts(status, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_kiosk_status ON alerts(kiosk_id, status);

-- Alert metrics composite index (kiosk_id, metric_type, timestamp)
CREATE INDEX IF NOT EXISTS idx_alert_metrics_composite ON alert_metrics(kiosk_id, metric_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_alert_metrics_timestamp ON alert_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_alert_metrics_cleanup ON alert_metrics(created_at);

-- Session metrics composite index (kiosk_id, timestamp)
CREATE INDEX IF NOT EXISTS idx_session_metrics_composite ON session_metrics(kiosk_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_session_metrics_kiosk_time ON session_metrics(kiosk_id, start_time);
CREATE INDEX IF NOT EXISTS idx_session_metrics_outcome ON session_metrics(outcome);
CREATE INDEX IF NOT EXISTS idx_session_metrics_cleanup ON session_metrics(created_at);

-- UI performance metrics composite index (kiosk_id, event_type, timestamp)
CREATE INDEX IF NOT EXISTS idx_ui_performance_composite ON ui_performance_metrics(kiosk_id, event_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_ui_performance_kiosk_time ON ui_performance_metrics(kiosk_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_ui_performance_event_type ON ui_performance_metrics(event_type);
CREATE INDEX IF NOT EXISTS idx_ui_performance_cleanup ON ui_performance_metrics(created_at);

-- Performance snapshots indexes
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_kiosk_period ON performance_snapshots(kiosk_id, period, timestamp);
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_cleanup ON performance_snapshots(created_at);