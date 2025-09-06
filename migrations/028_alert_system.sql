-- Migration 028: Alert System
-- Create alerts table for monitoring and alerting system

-- Alert tracking table
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT, -- JSON alert data
  status TEXT NOT NULL DEFAULT 'active',
  triggered_at TEXT NOT NULL,
  cleared_at TEXT,
  auto_clear_condition TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CHECK (type IN ('no_stock', 'conflict_rate', 'open_fail_rate', 'retry_rate', 'overdue_share')),
  CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CHECK (status IN ('active', 'cleared'))
);

-- Composite indexes for efficient alert queries
CREATE INDEX IF NOT EXISTS idx_alerts_composite_main ON alerts(kiosk_id, type, status, triggered_at);
CREATE INDEX IF NOT EXISTS idx_alerts_status_triggered ON alerts(status, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_kiosk_status ON alerts(kiosk_id, status);

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

-- Composite indexes for efficient metric queries
CREATE INDEX IF NOT EXISTS idx_alert_metrics_composite ON alert_metrics(kiosk_id, metric_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_alert_metrics_timestamp ON alert_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_alert_metrics_cleanup ON alert_metrics(created_at);