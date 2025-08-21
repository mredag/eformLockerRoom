-- Migration 004: Staff Users and Authentication
-- Adds staff_users table for panel authentication

-- Staff Users Table
CREATE TABLE IF NOT EXISTS staff_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  pin_expires_at DATETIME,
  CHECK (role IN ('admin', 'staff')),
  CHECK (active IN (0, 1))
);

-- Indexes for staff_users
CREATE INDEX IF NOT EXISTS idx_staff_users_username ON staff_users(username);
CREATE INDEX IF NOT EXISTS idx_staff_users_role ON staff_users(role);
CREATE INDEX IF NOT EXISTS idx_staff_users_active ON staff_users(active);
CREATE INDEX IF NOT EXISTS idx_staff_users_pin_expires ON staff_users(pin_expires_at);

-- Update staff_users table to add trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_staff_users_timestamp 
  AFTER UPDATE ON staff_users
  FOR EACH ROW
  BEGIN
    UPDATE staff_users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

-- Create default admin user (password: admin123 - should be changed immediately)
-- Password hash for 'admin123' using Argon2id
INSERT OR IGNORE INTO staff_users (username, password_hash, role, pin_expires_at) 
VALUES ('admin', '$argon2id$v=19$m=65536,t=3,p=1$YWRtaW4xMjM$8rKZZKjTGxGfaCDLKDT8Dw', 'admin', datetime('now', '+1 day'));