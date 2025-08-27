-- Migration 017: Fix Locker Naming Trigger
-- Fixes the trigger to only log when changed_by is not NULL

-- Drop the existing trigger
DROP TRIGGER IF EXISTS log_locker_name_changes;

-- Recreate the trigger with proper NULL check
CREATE TRIGGER IF NOT EXISTS log_locker_name_changes 
  AFTER UPDATE OF display_name ON lockers
  FOR EACH ROW
  WHEN (NEW.display_name != OLD.display_name OR (NEW.display_name IS NOT NULL AND OLD.display_name IS NULL) OR (NEW.display_name IS NULL AND OLD.display_name IS NOT NULL))
    AND NEW.name_updated_by IS NOT NULL
  BEGIN
    INSERT INTO locker_name_audit (kiosk_id, locker_id, old_name, new_name, changed_by)
    VALUES (NEW.kiosk_id, NEW.id, OLD.display_name, NEW.display_name, NEW.name_updated_by);
  END;