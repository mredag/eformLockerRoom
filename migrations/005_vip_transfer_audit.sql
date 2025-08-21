-- Migration 005: VIP Transfer and Audit System
-- Adds tables for VIP contract transfers and comprehensive audit logging

-- VIP Transfer Requests Table
CREATE TABLE IF NOT EXISTS vip_transfer_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  from_kiosk_id TEXT NOT NULL,
  from_locker_id INTEGER NOT NULL,
  to_kiosk_id TEXT NOT NULL,
  to_locker_id INTEGER NOT NULL,
  new_rfid_card TEXT, -- Optional new card for transfer
  reason TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME,
  completed_at DATETIME,
  CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  FOREIGN KEY (contract_id) REFERENCES vip_contracts(id),
  FOREIGN KEY (from_kiosk_id, from_locker_id) REFERENCES lockers(kiosk_id, id),
  FOREIGN KEY (to_kiosk_id, to_locker_id) REFERENCES lockers(kiosk_id, id)
);

-- VIP Contract History Table for detailed audit trail
CREATE TABLE IF NOT EXISTS vip_contract_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  old_values TEXT, -- JSON of old values
  new_values TEXT, -- JSON of new values
  performed_by TEXT NOT NULL,
  reason TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  details TEXT, -- JSON of additional details
  CHECK (action_type IN ('created', 'extended', 'card_changed', 'transferred', 'cancelled')),
  FOREIGN KEY (contract_id) REFERENCES vip_contracts(id)
);

-- Indexes for VIP transfer requests
CREATE INDEX IF NOT EXISTS idx_vip_transfer_contract ON vip_transfer_requests(contract_id);
CREATE INDEX IF NOT EXISTS idx_vip_transfer_status ON vip_transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_vip_transfer_requested_by ON vip_transfer_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_vip_transfer_from_locker ON vip_transfer_requests(from_kiosk_id, from_locker_id);
CREATE INDEX IF NOT EXISTS idx_vip_transfer_to_locker ON vip_transfer_requests(to_kiosk_id, to_locker_id);

-- Indexes for VIP contract history
CREATE INDEX IF NOT EXISTS idx_vip_history_contract ON vip_contract_history(contract_id);
CREATE INDEX IF NOT EXISTS idx_vip_history_action_type ON vip_contract_history(action_type);
CREATE INDEX IF NOT EXISTS idx_vip_history_performed_by ON vip_contract_history(performed_by);
CREATE INDEX IF NOT EXISTS idx_vip_history_timestamp ON vip_contract_history(timestamp);

-- Trigger to automatically create history entries for VIP contract changes
CREATE TRIGGER IF NOT EXISTS vip_contract_history_trigger
  AFTER UPDATE ON vip_contracts
  FOR EACH ROW
  WHEN OLD.rfid_card != NEW.rfid_card 
    OR OLD.end_date != NEW.end_date 
    OR OLD.status != NEW.status
  BEGIN
    INSERT INTO vip_contract_history (
      contract_id,
      action_type,
      old_values,
      new_values,
      performed_by,
      details
    ) VALUES (
      NEW.id,
      CASE 
        WHEN OLD.status != NEW.status AND NEW.status = 'cancelled' THEN 'cancelled'
        WHEN OLD.end_date != NEW.end_date THEN 'extended'
        WHEN OLD.rfid_card != NEW.rfid_card THEN 'card_changed'
        ELSE 'modified'
      END,
      json_object(
        'rfid_card', OLD.rfid_card,
        'backup_card', OLD.backup_card,
        'end_date', OLD.end_date,
        'status', OLD.status
      ),
      json_object(
        'rfid_card', NEW.rfid_card,
        'backup_card', NEW.backup_card,
        'end_date', NEW.end_date,
        'status', NEW.status
      ),
      'system', -- Will be updated by application logic with actual user
      json_object(
        'trigger', 'automatic',
        'updated_at', datetime('now')
      )
    );
  END;

-- Trigger to create history entry for new VIP contracts
CREATE TRIGGER IF NOT EXISTS vip_contract_created_history_trigger
  AFTER INSERT ON vip_contracts
  FOR EACH ROW
  BEGIN
    INSERT INTO vip_contract_history (
      contract_id,
      action_type,
      new_values,
      performed_by,
      details
    ) VALUES (
      NEW.id,
      'created',
      json_object(
        'kiosk_id', NEW.kiosk_id,
        'locker_id', NEW.locker_id,
        'rfid_card', NEW.rfid_card,
        'backup_card', NEW.backup_card,
        'start_date', NEW.start_date,
        'end_date', NEW.end_date,
        'status', NEW.status
      ),
      NEW.created_by,
      json_object(
        'trigger', 'creation',
        'created_at', datetime('now')
      )
    );
  END;