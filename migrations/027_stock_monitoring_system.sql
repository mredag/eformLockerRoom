-- Stock Monitoring System Migration
-- Adds tables for stock level tracking, alerts, and metrics

-- Stock history table for tracking stock levels over time
CREATE TABLE IF NOT EXISTS stock_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  total_lockers INTEGER NOT NULL,
  free_lockers INTEGER NOT NULL,
  owned_lockers INTEGER NOT NULL,
  blocked_lockers INTEGER NOT NULL,
  error_lockers INTEGER NOT NULL,
  vip_lockers INTEGER NOT NULL,
  free_ratio REAL NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('high', 'medium', 'low')),
  timestamp DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Stock alerts table for tracking alert events
CREATE TABLE IF NOT EXISTS stock_alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('no_stock', 'low_stock', 'critical_stock')),
  kiosk_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  data TEXT, -- JSON data
  triggered_at DATETIME NOT NULL,
  cleared_at DATETIME,
  auto_cleared INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create composite indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_history_kiosk_timestamp ON stock_history(kiosk_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_stock_history_timestamp ON stock_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_kiosk_type_triggered ON stock_alerts(kiosk_id, type, triggered_at);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_active ON stock_alerts(kiosk_id, cleared_at);

-- Add stock monitoring configuration to global settings
INSERT OR IGNORE INTO settings_global (key, value, data_type, description) VALUES
  ('stock_monitoring_enabled', 'true', 'boolean', 'Enable stock level monitoring'),
  ('stock_monitoring_interval_sec', '30', 'number', 'Stock monitoring check interval in seconds'),
  ('stock_alert_cooldown_min', '5', 'number', 'Minimum time between same alert types in minutes'),
  ('stock_history_retention_days', '7', 'number', 'Days to keep stock history records'),
  ('stock_alert_no_stock_threshold', '0.05', 'number', 'Free ratio threshold for no stock alert (≤5%)'),
  ('stock_alert_critical_threshold', '0.1', 'number', 'Free ratio threshold for critical stock alert (≤10%)'),
  ('stock_alert_low_threshold', '0.2', 'number', 'Free ratio threshold for low stock alert (≤20%)'),
  ('stock_reserve_disable_threshold', '0.2', 'number', 'Free ratio threshold to disable reserve capacity (≤20%)'),
  ('stock_assignment_restrict_threshold', '0.05', 'number', 'Free ratio threshold to restrict new assignments (≤5%)');

-- Create view for current stock levels (for easy querying)
CREATE VIEW IF NOT EXISTS current_stock_levels AS
SELECT 
  l.kiosk_id,
  COUNT(*) as total_lockers,
  SUM(CASE WHEN l.status = 'Free' AND l.is_vip = 0 THEN 1 ELSE 0 END) as free_lockers,
  SUM(CASE WHEN l.status = 'Owned' THEN 1 ELSE 0 END) as owned_lockers,
  SUM(CASE WHEN l.status = 'Blocked' THEN 1 ELSE 0 END) as blocked_lockers,
  SUM(CASE WHEN l.status = 'Error' THEN 1 ELSE 0 END) as error_lockers,
  SUM(CASE WHEN l.is_vip = 1 THEN 1 ELSE 0 END) as vip_lockers,
  CASE 
    WHEN (COUNT(*) - SUM(CASE WHEN l.is_vip = 1 THEN 1 ELSE 0 END)) > 0 
    THEN CAST(SUM(CASE WHEN l.status = 'Free' AND l.is_vip = 0 THEN 1 ELSE 0 END) AS REAL) / 
         (COUNT(*) - SUM(CASE WHEN l.is_vip = 1 THEN 1 ELSE 0 END))
    ELSE 0 
  END as free_ratio,
  CASE 
    WHEN (CASE 
      WHEN (COUNT(*) - SUM(CASE WHEN l.is_vip = 1 THEN 1 ELSE 0 END)) > 0 
      THEN CAST(SUM(CASE WHEN l.status = 'Free' AND l.is_vip = 0 THEN 1 ELSE 0 END) AS REAL) / 
           (COUNT(*) - SUM(CASE WHEN l.is_vip = 1 THEN 1 ELSE 0 END))
      ELSE 0 
    END) >= 0.5 THEN 'high'
    WHEN (CASE 
      WHEN (COUNT(*) - SUM(CASE WHEN l.is_vip = 1 THEN 1 ELSE 0 END)) > 0 
      THEN CAST(SUM(CASE WHEN l.status = 'Free' AND l.is_vip = 0 THEN 1 ELSE 0 END) AS REAL) / 
           (COUNT(*) - SUM(CASE WHEN l.is_vip = 1 THEN 1 ELSE 0 END))
      ELSE 0 
    END) <= 0.1 THEN 'low'
    ELSE 'medium'
  END as category,
  datetime('now') as calculated_at
FROM lockers l
GROUP BY l.kiosk_id;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_lockers_kiosk_status_vip ON lockers(kiosk_id, status, is_vip);

-- Update configuration version
UPDATE config_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;