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

-- No default users - setup process will create the first admin user