-- Migration 007: Soak Testing Tables
-- Create tables for hardware soak testing automation

-- Soak tests table
CREATE TABLE IF NOT EXISTS soak_tests (
  id TEXT PRIMARY KEY,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER NOT NULL,
  target_cycles INTEGER NOT NULL,
  current_cycle INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  failure_threshold INTEGER NOT NULL DEFAULT 50,
  interval_ms INTEGER NOT NULL DEFAULT 5000,
  status TEXT NOT NULL DEFAULT 'running',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  last_cycle_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  failures TEXT, -- JSON array of failure details
  performance_metrics_avg_response_time REAL DEFAULT 0,
  performance_metrics_min_response_time REAL DEFAULT 0,
  performance_metrics_max_response_time REAL DEFAULT 0,
  performance_metrics_total_response_time REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kiosk_id, locker_id) REFERENCES lockers(kiosk_id, id),
  CHECK (status IN ('running', 'completed', 'failed', 'stopped', 'error')),
  CHECK (current_cycle >= 0),
  CHECK (success_count >= 0),
  CHECK (failure_count >= 0),
  CHECK (target_cycles > 0),
  CHECK (failure_threshold > 0),
  CHECK (interval_ms > 0)
);

-- Indexes for soak tests
CREATE INDEX IF NOT EXISTS idx_soak_tests_kiosk_locker ON soak_tests(kiosk_id, locker_id);
CREATE INDEX IF NOT EXISTS idx_soak_tests_status ON soak_tests(status);
CREATE INDEX IF NOT EXISTS idx_soak_tests_started_at ON soak_tests(started_at);
CREATE INDEX IF NOT EXISTS idx_soak_tests_completed_at ON soak_tests(completed_at);

-- Hardware maintenance recommendations table
CREATE TABLE IF NOT EXISTS maintenance_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER NOT NULL,
  priority TEXT NOT NULL,
  reason TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  failure_rate REAL NOT NULL,
  total_cycles INTEGER NOT NULL,
  test_date DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  resolved_by TEXT,
  resolution_notes TEXT,
  FOREIGN KEY (kiosk_id, locker_id) REFERENCES lockers(kiosk_id, id),
  CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CHECK (status IN ('pending', 'in_progress', 'completed', 'dismissed')),
  CHECK (failure_rate >= 0 AND failure_rate <= 100),
  CHECK (total_cycles >= 0)
);

-- Indexes for maintenance recommendations
CREATE INDEX IF NOT EXISTS idx_maintenance_kiosk_locker ON maintenance_recommendations(kiosk_id, locker_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_priority ON maintenance_recommendations(priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_created_at ON maintenance_recommendations(created_at);

-- Hardware performance history table (for trending analysis)
CREATE TABLE IF NOT EXISTS hardware_performance_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER NOT NULL,
  test_date DATETIME NOT NULL,
  cycles_tested INTEGER NOT NULL,
  success_count INTEGER NOT NULL,
  failure_count INTEGER NOT NULL,
  success_rate REAL NOT NULL,
  avg_response_time_ms REAL NOT NULL,
  min_response_time_ms REAL NOT NULL,
  max_response_time_ms REAL NOT NULL,
  test_duration_minutes INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kiosk_id, locker_id) REFERENCES lockers(kiosk_id, id),
  CHECK (cycles_tested > 0),
  CHECK (success_count >= 0),
  CHECK (failure_count >= 0),
  CHECK (success_rate >= 0 AND success_rate <= 100),
  CHECK (avg_response_time_ms >= 0),
  CHECK (test_duration_minutes >= 0)
);

-- Indexes for performance history
CREATE INDEX IF NOT EXISTS idx_performance_kiosk_locker ON hardware_performance_history(kiosk_id, locker_id);
CREATE INDEX IF NOT EXISTS idx_performance_test_date ON hardware_performance_history(test_date);
CREATE INDEX IF NOT EXISTS idx_performance_success_rate ON hardware_performance_history(success_rate);

-- Trigger to update updated_at timestamp on soak_tests
CREATE TRIGGER IF NOT EXISTS update_soak_tests_timestamp 
  AFTER UPDATE ON soak_tests
  FOR EACH ROW
BEGIN
  UPDATE soak_tests SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to create performance history record when soak test completes
CREATE TRIGGER IF NOT EXISTS create_performance_history
  AFTER UPDATE OF status ON soak_tests
  FOR EACH ROW
  WHEN NEW.status IN ('completed', 'failed') AND OLD.status = 'running'
BEGIN
  INSERT INTO hardware_performance_history (
    kiosk_id, locker_id, test_date, cycles_tested, success_count, failure_count,
    success_rate, avg_response_time_ms, min_response_time_ms, max_response_time_ms,
    test_duration_minutes
  ) VALUES (
    NEW.kiosk_id,
    NEW.locker_id,
    NEW.completed_at,
    NEW.current_cycle,
    NEW.success_count,
    NEW.failure_count,
    CASE WHEN NEW.current_cycle > 0 THEN (NEW.success_count * 100.0 / NEW.current_cycle) ELSE 0 END,
    NEW.performance_metrics_avg_response_time,
    NEW.performance_metrics_min_response_time,
    NEW.performance_metrics_max_response_time,
    CAST((julianday(NEW.completed_at) - julianday(NEW.started_at)) * 24 * 60 AS INTEGER)
  );
END;

-- View for current maintenance status
CREATE VIEW IF NOT EXISTS maintenance_status_view AS
SELECT 
  m.kiosk_id,
  m.locker_id,
  m.priority,
  m.reason,
  m.recommended_action,
  m.failure_rate,
  m.total_cycles,
  m.status,
  m.created_at,
  l.status as locker_status,
  CASE 
    WHEN l.status = 'Blocked' THEN 'blocked'
    WHEN m.status = 'pending' AND m.priority = 'critical' THEN 'urgent'
    WHEN m.status = 'pending' AND m.priority = 'high' THEN 'high_priority'
    WHEN m.status = 'pending' THEN 'scheduled'
    ELSE 'completed'
  END as maintenance_urgency
FROM maintenance_recommendations m
JOIN lockers l ON m.kiosk_id = l.kiosk_id AND m.locker_id = l.id
WHERE m.status != 'dismissed'
ORDER BY 
  CASE m.priority 
    WHEN 'critical' THEN 1 
    WHEN 'high' THEN 2 
    WHEN 'medium' THEN 3 
    WHEN 'low' THEN 4 
  END,
  m.created_at DESC;

-- View for hardware reliability trends
CREATE VIEW IF NOT EXISTS hardware_reliability_trends AS
SELECT 
  kiosk_id,
  locker_id,
  COUNT(*) as test_count,
  SUM(cycles_tested) as total_cycles,
  AVG(success_rate) as avg_success_rate,
  MIN(success_rate) as min_success_rate,
  MAX(success_rate) as max_success_rate,
  AVG(avg_response_time_ms) as avg_response_time,
  MIN(test_date) as first_test_date,
  MAX(test_date) as last_test_date,
  CASE 
    WHEN AVG(success_rate) >= 95 THEN 'excellent'
    WHEN AVG(success_rate) >= 90 THEN 'good'
    WHEN AVG(success_rate) >= 85 THEN 'fair'
    ELSE 'poor'
  END as reliability_rating,
  CASE 
    WHEN COUNT(*) >= 10 AND AVG(success_rate) < 90 THEN 1
    WHEN COUNT(*) >= 5 AND AVG(success_rate) < 85 THEN 1
    ELSE 0
  END as needs_attention
FROM hardware_performance_history
GROUP BY kiosk_id, locker_id
HAVING COUNT(*) >= 3; -- Only show lockers with at least 3 tests