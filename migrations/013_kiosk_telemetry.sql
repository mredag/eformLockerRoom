-- Migration 013: Kiosk Telemetry
-- Add telemetry tracking for kiosk monitoring

CREATE TABLE IF NOT EXISTS kiosk_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kiosk_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value TEXT NOT NULL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT -- JSON metadata
);

-- Create indexes for telemetry queries
CREATE INDEX IF NOT EXISTS idx_kiosk_telemetry_kiosk_id ON kiosk_telemetry(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_telemetry_metric_name ON kiosk_telemetry(metric_name);
CREATE INDEX IF NOT EXISTS idx_kiosk_telemetry_recorded_at ON kiosk_telemetry(recorded_at);