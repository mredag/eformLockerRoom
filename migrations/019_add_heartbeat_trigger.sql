-- Migration 019: Add kiosk_heartbeat trigger
-- Adds the updated_at trigger to the kiosk_heartbeat table.

CREATE TRIGGER IF NOT EXISTS update_kiosk_heartbeat_timestamp
  AFTER UPDATE ON kiosk_heartbeat
  FOR EACH ROW
  BEGIN
    UPDATE kiosk_heartbeat SET updated_at = CURRENT_TIMESTAMP WHERE kiosk_id = NEW.kiosk_id;
  END;
