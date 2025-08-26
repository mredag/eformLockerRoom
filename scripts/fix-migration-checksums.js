#!/usr/bin/env node

/**
 * Fix Migration Checksums
 * This script updates migration files to match the checksums expected by the Pi database
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Expected checksums from Pi database
const expectedChecksums = {
  '009_sessions_table.sql': 'a5c60bde6a0ad8a5bf3f793b67d2077d0421930c4203181cda9eba0eede55237',
  '010_help_requests_table.sql': 'b3c031e7d08a8f91dc0b316e6d7357c46f49306b27ee752b71dacdb81c42f2e0',
  '011_enhanced_vip_contracts.sql': 'a07e07aac602f5f01f8e07a2c3e7ebe0eca12ae2bcb2f4a75baa081207694162',
  '012_master_pin_security.sql': '772a745dcd2ba6175c89c845a1c8ada309e5b6a635d610e9d10f520e642ecdc0',
  '013_kiosk_telemetry.sql': '445b242bfabb994033e818ed0a897343c5b25c6488f9639364dc3d6ffc17645b',
  '014_command_log_table.sql': 'c7c1d35d8ba0d59b1eab3f0e3e30d5613ab356c47c6448c7e8fe977264bdfa5a'
};

function calculateChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function getCurrentChecksum(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return calculateChecksum(content);
}

console.log('🔧 Fixing migration checksums to match Pi database...\n');

// Since we can't reverse-engineer the exact original content from checksums,
// we need to create placeholder migrations that will be skipped since they're already applied
const migrationsDir = path.join(__dirname, '..', 'migrations');

// Create minimal placeholder migrations that won't affect the database
const placeholderMigrations = {
  '009_sessions_table.sql': `-- Migration 009: Sessions Table (Already Applied)
-- This migration was already applied on the Pi
-- Placeholder to maintain checksum compatibility
SELECT 1; -- No-op`,
  
  '010_help_requests_table.sql': `-- Migration 010: Help Requests Table (Already Applied)  
-- This migration was already applied on the Pi
-- Placeholder to maintain checksum compatibility
SELECT 1; -- No-op`,
  
  '011_enhanced_vip_contracts.sql': `-- Migration 011: Enhanced VIP Contracts (Already Applied)
-- This migration was already applied on the Pi  
-- Placeholder to maintain checksum compatibility
SELECT 1; -- No-op`,
  
  '012_master_pin_security.sql': `-- Migration 012: Master PIN Security (Already Applied)
-- This migration was already applied on the Pi
-- Placeholder to maintain checksum compatibility  
SELECT 1; -- No-op`,
  
  '013_kiosk_telemetry.sql': `-- Migration 013: Kiosk Telemetry (Already Applied)
-- This migration was already applied on the Pi
-- Placeholder to maintain checksum compatibility
SELECT 1; -- No-op`,
  
  '014_command_log_table.sql': `-- Migration 014: Command Log Table (Already Applied)
-- This migration was already applied on the Pi
-- Placeholder to maintain checksum compatibility
SELECT 1; -- No-op`
};

// Since we can't match the exact checksums without the original content,
// we need to remove these migrations and let the Pi continue with its existing state
console.log('❌ Cannot match exact checksums without original migration content');
console.log('📋 Recommended solution: Remove conflicting migrations and renumber newer ones\n');

console.log('Run these commands on your development machine:');
console.log('git rm migrations/009_sessions_table.sql');
console.log('git rm migrations/010_help_requests_table.sql'); 
console.log('git rm migrations/011_enhanced_vip_contracts.sql');
console.log('git rm migrations/012_master_pin_security.sql');
console.log('git rm migrations/013_kiosk_telemetry.sql');
console.log('git rm migrations/014_command_log_table.sql');
console.log('git commit -m "fix: remove conflicting migrations that are already applied on Pi"');
console.log('git push origin main');