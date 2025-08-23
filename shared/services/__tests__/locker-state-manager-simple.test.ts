import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../../database/connection';
import { LockerStateManager } from '../locker-state-manager';

describe('LockerStateManager - Simple Tests', () => {
  let db: DatabaseConnection;
  let stateManager: LockerStateManager;

  beforeEach(async () => {
    DatabaseConnection.resetInstance();
    db = DatabaseConnection.getInstance(':memory:');
    await db.waitForInitialization();
    
    // Create minimal tables
    await db.exec(`
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
    `);

    await db.exec(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        kiosk_id TEXT NOT NULL,
        locker_id INTEGER,
        event_type TEXT NOT NULL,
        details TEXT,
        staff_user TEXT
      )
    `);

    stateManager = new LockerStateManager();
  }, 20000);

  afterEach(async () => {
    if (stateManager) {
      await stateManager.shutdown();
    }
    DatabaseConnection.resetInstance();
  });

  it('should create state manager instance', () => {
    expect(stateManager).toBeDefined();
  });

  it('should get valid transitions', () => {
    const transitions = stateManager.getValidTransitions();
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions[0]).toHaveProperty('from');
    expect(transitions[0]).toHaveProperty('to');
    expect(transitions[0]).toHaveProperty('trigger');
  });

  it('should get possible next states', () => {
    const nextStates = stateManager.getPossibleNextStates('Free');
    expect(nextStates).toContain('Reserved');
    expect(nextStates).toContain('Blocked');
  });
});
