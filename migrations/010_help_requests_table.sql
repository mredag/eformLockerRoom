-- Migration 010: Help Requests Table
-- Create help requests table for user support

CREATE TABLE IF NOT EXISTS help_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kiosk_id TEXT NOT NULL,
    user_email TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    resolved_by INTEGER,
    FOREIGN KEY (resolved_by) REFERENCES users(id)
);

-- Create indexes for help requests
CREATE INDEX IF NOT EXISTS idx_help_requests_kiosk_id ON help_requests(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_help_requests_status ON help_requests(status);
CREATE INDEX IF NOT EXISTS idx_help_requests_created_at ON help_requests(created_at);