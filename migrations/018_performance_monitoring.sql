-- Migration 018: Performance Monitoring Tables
-- Add tables for comprehensive performance tracking and metrics collection
-- Implements requirements 8.1-8.4 for performance monitoring

-- Session metrics table for tracking RFID session performance
CREATE TABLE IF NOT EXISTS session_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration_seconds INTEGER,
  outcome TEXT NOT NULL DEFAULT 'active',
  selected_locker_id INTEGER,
  time_to_selection_seconds INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (outcome IN ('active', 'completed', 'timeout', 'cancelled', 'error'))
);

-- UI performance metrics table for tracking interface responsiveness
CREATE TABLE IF NOT EXISTS ui_performance_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME NOT NULL,
  kiosk_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (event_type IN ('state_update', 'session_start', 'locker_selection', 'ui_render'))
);

-- Performance snapshots table for aggregated metrics over time
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME NOT NULL,
  kiosk_id TEXT NOT NULL,
  period TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (period IN ('hour', 'day', 'week', 'month'))
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_session_metrics_kiosk_time ON session_metrics(kiosk_id, start_time);
CREATE INDEX IF NOT EXISTS idx_session_metrics_outcome ON session_metrics(outcome);
CREATE INDEX IF NOT EXISTS idx_session_metrics_session_id ON session_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_session_metrics_created_at ON session_metrics(created_at);

CREATE INDEX IF NOT EXISTS idx_ui_performance_kiosk_time ON ui_performance_metrics(kiosk_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_ui_performance_event_type ON ui_performance_metrics(event_type);
CREATE INDEX IF NOT EXISTS idx_ui_performance_success ON ui_performance_metrics(success);
CREATE INDEX IF NOT EXISTS idx_ui_performance_created_at ON ui_performance_metrics(created_at);

CREATE INDEX IF NOT EXISTS idx_performance_snapshots_kiosk_period ON performance_snapshots(kiosk_id, period, timestamp);
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_timestamp ON performance_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_created_at ON performance_snapshots(created_at);

-- View for current performance summary
CREATE VIEW IF NOT EXISTS performance_summary_view AS
SELECT 
  sm.kiosk_id,
  COUNT(CASE WHEN sm.outcome = 'completed' THEN 1 END) as completed_sessions,
  COUNT(CASE WHEN sm.outcome = 'timeout' THEN 1 END) as timeout_sessions,
  COUNT(CASE WHEN sm.outcome = 'cancelled' THEN 1 END) as cancelled_sessions,
  COUNT(CASE WHEN sm.outcome = 'error' THEN 1 END) as error_sessions,
  AVG(CASE WHEN sm.time_to_selection_seconds IS NOT NULL THEN sm.time_to_selection_seconds END) as avg_selection_time,
  AVG(CASE WHEN sm.duration_seconds IS NOT NULL THEN sm.duration_seconds END) as avg_session_duration,
  COUNT(*) as total_sessions,
  CASE 
    WHEN COUNT(*) > 0 THEN 
      (COUNT(CASE WHEN sm.outcome = 'completed' THEN 1 END) * 100.0 / COUNT(*))
    ELSE 100 
  END as success_rate
FROM session_metrics sm
WHERE sm.created_at >= datetime('now', '-24 hours')
  AND sm.outcome != 'active'
GROUP BY sm.kiosk_id;

-- View for UI performance summary
CREATE VIEW IF NOT EXISTS ui_performance_summary_view AS
SELECT 
  upm.kiosk_id,
  upm.event_type,
  COUNT(*) as total_events,
  COUNT(CASE WHEN upm.success = 1 THEN 1 END) as successful_events,
  AVG(upm.latency_ms) as avg_latency_ms,
  MIN(upm.latency_ms) as min_latency_ms,
  MAX(upm.latency_ms) as max_latency_ms,
  CASE 
    WHEN COUNT(*) > 0 THEN 
      (COUNT(CASE WHEN upm.success = 1 THEN 1 END) * 100.0 / COUNT(*))
    ELSE 100 
  END as success_rate,
  COUNT(CASE WHEN upm.latency_ms > 2000 THEN 1 END) as slow_events
FROM ui_performance_metrics upm
WHERE upm.created_at >= datetime('now', '-24 hours')
GROUP BY upm.kiosk_id, upm.event_type;

-- View for locker usage performance
CREATE VIEW IF NOT EXISTS locker_performance_view AS
SELECT 
  l.kiosk_id,
  l.id as locker_id,
  COALESCE(l.display_name, 'Dolap ' || l.id) as display_name,
  COUNT(CASE WHEN cq.status = 'completed' THEN 1 END) as open_count,
  COUNT(CASE WHEN cq.status = 'failed' THEN 1 END) as error_count,
  AVG(CASE WHEN cq.duration_ms IS NOT NULL THEN cq.duration_ms END) as avg_response_time_ms,
  MAX(cq.created_at) as last_used,
  CASE 
    WHEN COUNT(cq.command_id) > 0 THEN 
      (COUNT(CASE WHEN cq.status = 'completed' THEN 1 END) * 100.0 / COUNT(cq.command_id))
    ELSE 100 
  END as success_rate,
  COUNT(sm.session_id) as selection_count
FROM lockers l
LEFT JOIN command_queue cq ON l.kiosk_id = cq.kiosk_id 
  AND JSON_EXTRACT(cq.payload, '$.locker_id') = l.id
  AND cq.created_at >= datetime('now', '-7 days')
LEFT JOIN session_metrics sm ON l.id = sm.selected_locker_id 
  AND l.kiosk_id = sm.kiosk_id
  AND sm.created_at >= datetime('now', '-7 days')
  AND sm.outcome = 'completed'
GROUP BY l.kiosk_id, l.id, l.display_name
ORDER BY open_count DESC, l.id;

-- Trigger to automatically clean up old performance data (keep 30 days)
CREATE TRIGGER IF NOT EXISTS cleanup_old_performance_data
  AFTER INSERT ON performance_snapshots
  FOR EACH ROW
  WHEN (SELECT COUNT(*) FROM performance_snapshots) > 1000
BEGIN
  DELETE FROM session_metrics WHERE created_at < datetime('now', '-30 days');
  DELETE FROM ui_performance_metrics WHERE created_at < datetime('now', '-30 days');
  DELETE FROM performance_snapshots WHERE created_at < datetime('now', '-30 days');
END;

-- Insert initial performance snapshot for existing kiosks
INSERT OR IGNORE INTO performance_snapshots (timestamp, kiosk_id, period, metrics_json)
SELECT 
  datetime('now') as timestamp,
  'kiosk-1' as kiosk_id,
  'day' as period,
  json_object(
    'timeToOpen', json_array(),
    'errorRate', 0,
    'sessionsPerHour', 0,
    'mostSelectedLockers', json_array(),
    'averageIdleTime', 20,
    'uiUpdateLatency', json_array()
  ) as metrics_json;