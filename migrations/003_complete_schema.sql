-- Migration 003: Complete Schema
-- Adds missing tables for VIP contracts and command queue

-- VIP Contracts Table
CREATE TABLE IF NOT EXISTS vip_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER NOT NULL,
  rfid_card TEXT NOT NULL,
  backup_card TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('active', 'expired', 'cancelled')),
  FOREIGN KEY (kiosk_id, locker_id) REFERENCES lockers(kiosk_id, id)
);

-- Command Queue Table
CREATE TABLE IF NOT EXISTS command_queue (
  command_id TEXT PRIMARY KEY,
  kiosk_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  executed_at DATETIME,
  CHECK (status IN ('pending', 'executing', 'completed', 'failed')),
  UNIQUE(command_id)
);

-- Add constraint to events table for staff operations
-- This will be handled in application logic since SQLite doesn't support complex CHECK constraints easily

-- Indexes for VIP contracts
CREATE INDEX IF NOT EXISTS idx_vip_contracts_kiosk_locker ON vip_contracts(kiosk_id, locker_id);
CREATE INDEX IF NOT EXISTS idx_vip_contracts_rfid_card ON vip_contracts(rfid_card);
CREATE INDEX IF NOT EXISTS idx_vip_contracts_status ON vip_contracts(status);
CREATE INDEX IF NOT EXISTS idx_vip_contracts_end_date ON vip_contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_vip_contracts_created_by ON vip_contracts(created_by);

-- Indexes for command queue
CREATE INDEX IF NOT EXISTS idx_command_queue_kiosk ON command_queue(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_command_queue_status ON command_queue(status);
CREATE INDEX IF NOT EXISTS idx_command_queue_next_attempt ON command_queue(next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_command_queue_created_at ON command_queue(created_at);

-- Update lockers table to add trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_lockers_timestamp 
  AFTER UPDATE ON lockers
  FOR EACH ROW
  BEGIN
    UPDATE lockers SET updated_at = CURRENT_TIMESTAMP WHERE kiosk_id = NEW.kiosk_id AND id = NEW.id;
  END;

-- Update vip_contracts table to add trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_vip_contracts_timestamp 
  AFTER UPDATE ON vip_contracts
  FOR EACH ROW
  BEGIN
    UPDATE vip_contracts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

-- Update kiosk_heartbeat table to add trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_kiosk_heartbeat_timestamp 
  AFTER UPDATE ON kiosk_heartbeat
  FOR EACH ROW
  BEGIN
    UPDATE kiosk_heartbeat SET updated_at = CURRENT_TIMESTAMP WHERE kiosk_id = NEW.kiosk_id;
  END;