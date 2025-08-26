-- Migration 012: Master PIN Security Enhancements
-- Add security features for master PIN management

CREATE TABLE IF NOT EXISTS master_pin_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    old_pin_hash TEXT NOT NULL,
    changed_by INTEGER,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    FOREIGN KEY (changed_by) REFERENCES users(id)
);

-- Add master PIN attempt tracking
CREATE TABLE IF NOT EXISTS master_pin_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kiosk_id TEXT NOT NULL,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL DEFAULT 0,
    ip_address TEXT
);

-- Create indexes for security tracking
CREATE INDEX IF NOT EXISTS idx_master_pin_attempts_kiosk_id ON master_pin_attempts(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_master_pin_attempts_attempted_at ON master_pin_attempts(attempted_at);