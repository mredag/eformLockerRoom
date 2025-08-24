-- Migration 013: Kiosk Telemetry System
-- Add telemetry support to existing heartbeat system

-- Note: telemetry_data and last_telemetry_update columns already exist
-- This migration ensures the telemetry_history table and indexes are created

-- Create telemetry_history table for historical data
CREATE TABLE IF NOT EXISTS telemetry_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  telemetry_data TEXT NOT NULL,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kiosk_id) REFERENCES kiosk_heartbeat(kiosk_id)
);

-- Add indexes for telemetry queries
CREATE INDEX IF NOT EXISTS idx_telemetry_history_kiosk_id ON telemetry_history(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_history_recorded_at ON telemetry_history(recorded_at);