-- Migration 011: Enhanced VIP Contracts and Payments System
-- Creates new contracts and payments tables with comprehensive member and payment tracking
-- Extends existing vip_contracts functionality with enhanced features

-- Enhanced Contracts Table with member info, plan details, and pricing
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  plan TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  start_at DATE NOT NULL,
  end_at DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER NOT NULL,
  rfid_card TEXT NOT NULL,
  backup_card TEXT,
  notes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('active', 'expired', 'cancelled')),
  CHECK (plan IN ('basic', 'premium', 'executive')),
  CHECK (price >= 0)
);

-- Payments Table with payment method tracking and references
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  method TEXT NOT NULL,
  paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reference TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (method IN ('cash', 'card', 'transfer', 'other')),
  CHECK (amount > 0)
);

-- Indexes for contracts table (performance optimization)
CREATE INDEX IF NOT EXISTS idx_contracts_member_name ON contracts(member_name);
CREATE INDEX IF NOT EXISTS idx_contracts_phone ON contracts(phone);
CREATE INDEX IF NOT EXISTS idx_contracts_email ON contracts(email);
CREATE INDEX IF NOT EXISTS idx_contracts_plan ON contracts(plan);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_start_at ON contracts(start_at);
CREATE INDEX IF NOT EXISTS idx_contracts_end_at ON contracts(end_at);
CREATE INDEX IF NOT EXISTS idx_contracts_created_by ON contracts(created_by);
CREATE INDEX IF NOT EXISTS idx_contracts_kiosk_locker ON contracts(kiosk_id, locker_id);
CREATE INDEX IF NOT EXISTS idx_contracts_rfid_card ON contracts(rfid_card);
CREATE INDEX IF NOT EXISTS idx_contracts_backup_card ON contracts(backup_card);
CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts(created_at);

-- Indexes for payments table (performance optimization)
CREATE INDEX IF NOT EXISTS idx_payments_contract ON payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON payments(created_by);
CREATE INDEX IF NOT EXISTS idx_payments_amount ON payments(amount);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);

-- Trigger for contracts updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_contracts_timestamp 
  AFTER UPDATE ON contracts
  FOR EACH ROW
  BEGIN
    UPDATE contracts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

-- View for active contracts with payment summary
CREATE VIEW IF NOT EXISTS active_contracts_with_payments AS
SELECT 
  c.*,
  COALESCE(p.total_paid, 0) as total_paid,
  COALESCE(p.payment_count, 0) as payment_count,
  COALESCE(p.last_payment_date, NULL) as last_payment_date,
  CASE 
    WHEN c.end_at < DATE('now') THEN 'expired'
    WHEN c.end_at <= DATE('now', '+30 days') THEN 'expiring_soon'
    ELSE 'active'
  END as contract_status
FROM contracts c
LEFT JOIN (
  SELECT 
    contract_id,
    SUM(amount) as total_paid,
    COUNT(*) as payment_count,
    MAX(paid_at) as last_payment_date
  FROM payments 
  GROUP BY contract_id
) p ON c.id = p.contract_id
WHERE c.status = 'active';

-- View for expiring contracts (within 30 days)
CREATE VIEW IF NOT EXISTS expiring_contracts AS
SELECT c.*, 
  (julianday(c.end_at) - julianday('now')) as days_until_expiry
FROM contracts c
WHERE c.status = 'active' 
  AND c.end_at <= DATE('now', '+30 days')
  AND c.end_at >= DATE('now')
ORDER BY c.end_at ASC;

-- View for payment history with contract details
CREATE VIEW IF NOT EXISTS payment_history_with_contracts AS
SELECT 
  p.*,
  c.member_name,
  c.phone,
  c.plan,
  c.kiosk_id,
  c.locker_id
FROM payments p
JOIN contracts c ON p.contract_id = c.id
ORDER BY p.paid_at DESC;