-- Migration 014: Command Log Table
-- Create comprehensive command logging for audit trail

CREATE TABLE IF NOT EXISTS command_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kiosk_id TEXT NOT NULL,
    command_type TEXT NOT NULL,
    command_data TEXT, -- JSON command data
    status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_at DATETIME,
    completed_at DATETIME,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    user_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create indexes for command log queries
CREATE INDEX IF NOT EXISTS idx_command_log_kiosk_id ON command_log(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_command_log_status ON command_log(status);
CREATE INDEX IF NOT EXISTS idx_command_log_created_at ON command_log(created_at);
CREATE INDEX IF NOT EXISTS idx_command_log_command_type ON command_log(command_type);