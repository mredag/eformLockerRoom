import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../../database/connection';
import { LockerStateManager } from '../locker-state-manager';
import { EventType } from '../../types/core-entities';

const TABLE_LOCKERS_SQL = `
  CREATE TABLE lockers (
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
  )
`;

const TABLE_EVENTS_SQL = `
  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    kiosk_id TEXT NOT NULL,
    locker_id INTEGER,
    event_type TEXT NOT NULL,
    rfid_card TEXT,
    device_id TEXT,
    staff_user TEXT,
    details TEXT
  )
`;

describe('LockerStateManager auto-release', () => {
  let db: DatabaseConnection;
  let stateManager: LockerStateManager;

  beforeEach(async () => {
    DatabaseConnection.resetInstance();
    DatabaseConnection.resetInstance(':memory:');
    db = DatabaseConnection.getInstance(':memory:');
    await db.waitForInitialization();
    await db.exec(TABLE_LOCKERS_SQL);
    await db.exec(TABLE_EVENTS_SQL);
  });

  afterEach(async () => {
    if (stateManager) {
      await stateManager.shutdown();
    }
    DatabaseConnection.resetInstance();
    DatabaseConnection.resetInstance(':memory:');
  });

  it('releases lockers exceeding the auto-release threshold', async () => {
    stateManager = new LockerStateManager(db, {
      autoReleaseHoursOverride: 0.001, // ~3.6 seconds
      autoReleaseCheckIntervalMs: 0
    });

    const now = Date.now();
    const expiredTimestamp = new Date(now - 60 * 60 * 1000).toISOString(); // 1 hour ago
    const recentTimestamp = new Date(now - 1000).toISOString(); // 1 second ago

    await db.run(
      `INSERT INTO lockers (kiosk_id, id, status, owner_type, owner_key, reserved_at, owned_at, version, is_vip, created_at, updated_at)
       VALUES (?, ?, 'Owned', 'rfid', ?, ?, ?, 1, 0, datetime('now'), datetime('now'))`,
      ['kiosk-1', 1, 'card-expired', expiredTimestamp, expiredTimestamp]
    );

    await db.run(
      `INSERT INTO lockers (kiosk_id, id, status, owner_type, owner_key, reserved_at, owned_at, version, is_vip, created_at, updated_at)
       VALUES (?, ?, 'Owned', 'rfid', ?, ?, ?, 1, 0, datetime('now'), datetime('now'))`,
      ['kiosk-1', 2, 'card-fresh', recentTimestamp, recentTimestamp]
    );

    const cleaned = await stateManager.cleanupExpiredReservations();
    expect(cleaned).toBe(1);

    const releasedLocker = await stateManager.getLocker('kiosk-1', 1);
    expect(releasedLocker?.status).toBe('Free');
    expect(releasedLocker?.owner_key).toBeNull();
    expect(releasedLocker?.owner_type).toBeNull();

    const freshLocker = await stateManager.getLocker('kiosk-1', 2);
    expect(freshLocker?.status).toBe('Owned');
    expect(freshLocker?.owner_key).toBe('card-fresh');

    const events = await db.all<any>(
      `SELECT event_type, details FROM events WHERE kiosk_id = ? ORDER BY id`,
      ['kiosk-1']
    );
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe(EventType.AUTO_RELEASE);

    const details = JSON.parse(events[0].details);
    expect(details.triggered_by).toBe('auto_release');
    expect(details.owner_key).toBe('card-expired');
  });

  it('skips cleanup when auto-release is disabled', async () => {
    await db.run(
      `INSERT INTO lockers (kiosk_id, id, status, owner_type, owner_key, reserved_at, owned_at, version, is_vip, created_at, updated_at)
       VALUES (?, ?, 'Owned', 'rfid', ?, datetime('now'), datetime('now'), 1, 0, datetime('now'), datetime('now'))`,
      ['kiosk-1', 1, 'card-disabled']
    );

    stateManager = new LockerStateManager(db, {
      autoReleaseHoursOverride: null
    });

    const cleaned = await stateManager.cleanupExpiredReservations();
    expect(cleaned).toBe(0);

    const locker = await stateManager.getLocker('kiosk-1', 1);
    expect(locker?.status).toBe('Owned');
  });
});
