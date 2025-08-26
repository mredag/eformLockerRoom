-- Migration 011: Enhanced VIP Contracts
-- Add additional fields to VIP contracts for better tracking

ALTER TABLE vip_contracts ADD COLUMN contract_type TEXT DEFAULT 'standard';
ALTER TABLE vip_contracts ADD COLUMN billing_cycle TEXT DEFAULT 'monthly';
ALTER TABLE vip_contracts ADD COLUMN auto_renew BOOLEAN DEFAULT 1;
ALTER TABLE vip_contracts ADD COLUMN notes TEXT;

-- Create index for contract type queries
CREATE INDEX IF NOT EXISTS idx_vip_contracts_type ON vip_contracts(contract_type);
CREATE INDEX IF NOT EXISTS idx_vip_contracts_auto_renew ON vip_contracts(auto_renew);