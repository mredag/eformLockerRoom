-- Migration 029: Overdue and Suspected Locker Management Indexes
-- Ensures proper composite indexes exist for efficient querying

-- Composite indexes for overdue and suspected locker queries
CREATE INDEX IF NOT EXISTS idx_lockers_kiosk_overdue ON lockers(kiosk_id, overdue_from);
CREATE INDEX IF NOT EXISTS idx_lockers_kiosk_suspected ON lockers(kiosk_id, suspected_occupied);

-- User reports index for suspected locker analytics
CREATE INDEX IF NOT EXISTS idx_user_reports_kiosk_date ON user_reports(kiosk_id, reported_at);

-- Additional composite index for assignment queries (exclude problematic lockers)
CREATE INDEX IF NOT EXISTS idx_lockers_assignment_exclusion ON lockers(kiosk_id, status, overdue_from, suspected_occupied);