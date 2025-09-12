-- Migration 001: Initial Schema (Simplified)
-- Creates the core tables for the Eform Locker System

-- Lockers Table (composite primary key: kiosk_id, id)
CREATE TABLE IF NOT EXISTS lockers (
  kiosk_id TEXT NOT NULL,
  id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Free',
  owner_type TEXT,
  owner_key TEXT,
  reserved_at DATETIME,
  owned_at DATETIME,
  version INTEGER NOT NULL DEFAULT 1,
  is_vip BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kiosk_id, id)
);

-- Events Table (audit logging)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  kiosk_id TEXT,
  locker_id INTEGER,
  event_type TEXT NOT NULL,
  rfid_card TEXT,
  device_id TEXT,
  staff_user TEXT,
  details TEXT
);

-- Kiosk Heartbeat Table
CREATE TABLE IF NOT EXISTS kiosk_heartbeat (
  kiosk_id TEXT PRIMARY KEY,
  last_seen DATETIME NOT NULL,
  zone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'online',
  version TEXT NOT NULL,
  last_config_hash TEXT,
  offline_threshold_seconds INTEGER DEFAULT 30,
  hardware_id TEXT,
  registration_secret TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_lockers_kiosk_status ON lockers(kiosk_id, status);
CREATE INDEX IF NOT EXISTS idx_lockers_owner_key ON lockers(owner_key);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_kiosk_locker ON events(kiosk_id, locker_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_heartbeat_status ON kiosk_heartbeat(status);