-- Migration 016: Locker Naming System
-- Adds display name functionality and audit tracking for locker names

-- Add naming columns to lockers table
ALTER TABLE lockers ADD COLUMN display_name VARCHAR(20);
ALTER TABLE lockers ADD COLUMN name_updated_at DATETIME;
ALTER TABLE lockers ADD COLUMN name_updated_by VARCHAR(50);

-- Create locker name audit table for tracking name changes
CREATE TABLE IF NOT EXISTS locker_name_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER NOT NULL,
  old_name VARCHAR(20),
  new_name VARCHAR(20),
  changed_by VARCHAR(50) NOT NULL,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kiosk_id, locker_id) REFERENCES lockers(kiosk_id, id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lockers_display_name ON lockers(display_name);
CREATE INDEX IF NOT EXISTS idx_locker_name_audit_kiosk_locker ON locker_name_audit(kiosk_id, locker_id);
CREATE INDEX IF NOT EXISTS idx_locker_name_audit_changed_at ON locker_name_audit(changed_at);
CREATE INDEX IF NOT EXISTS idx_locker_name_audit_changed_by ON locker_name_audit(changed_by);

-- Create trigger to automatically update name_updated_at when display_name changes
CREATE TRIGGER IF NOT EXISTS update_locker_name_timestamp 
  AFTER UPDATE OF display_name ON lockers
  FOR EACH ROW
  WHEN NEW.display_name != OLD.display_name OR (NEW.display_name IS NOT NULL AND OLD.display_name IS NULL) OR (NEW.display_name IS NULL AND OLD.display_name IS NOT NULL)
  BEGIN
    UPDATE lockers SET name_updated_at = CURRENT_TIMESTAMP WHERE kiosk_id = NEW.kiosk_id AND id = NEW.id;
  END;

-- Create trigger to automatically log name changes to audit table
CREATE TRIGGER IF NOT EXISTS log_locker_name_changes 
  AFTER UPDATE OF display_name ON lockers
  FOR EACH ROW
  WHEN (NEW.display_name != OLD.display_name OR (NEW.display_name IS NOT NULL AND OLD.display_name IS NULL) OR (NEW.display_name IS NULL AND OLD.display_name IS NOT NULL))
    AND NEW.name_updated_by IS NOT NULL
  BEGIN
    INSERT INTO locker_name_audit (kiosk_id, locker_id, old_name, new_name, changed_by)
    VALUES (NEW.kiosk_id, NEW.id, OLD.display_name, NEW.display_name, NEW.name_updated_by);
  END;