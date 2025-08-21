import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseConnection } from '../../database/connection.js';
import { LockerStateManager } from '../locker-state-manager.js';
import { LockerStatus, OwnerType, EventType } from '../../types/core-entities.js';

describe('LockerStateManager', () => {
  let db: DatabaseConnection;
  let stateManager: LockerStateManager;

  beforeEach(async () => {
    // Use in-memory database for testing
    DatabaseConnection.resetInstance();
    db = DatabaseConnection.getInstance(':memory:');
    await db.waitForInitialization();
    
    // Create tables
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
        rfid_card TEXT,
        device_id TEXT,
        staff_user TEXT,
        details TEXT
      )
    `);

    stateManager = new LockerStateManager();
  }, 15000); // Increase timeout to 15 seconds

  afterEach(async () => {
    if (stateManager) {
      await stateManager.shutdown();
    }
    DatabaseConnection.resetInstance();
  });

  describe('State Machine Validation', () => {
    it('should validate correct state transitions', () => {
      const transitions = stateManager.getValidTransitions();
      
      expect(transitions).toContainEqual({
        from: 'Free',
        to: 'Reserved',
        trigger: 'assign',
        conditions: ['not_vip', 'no_existing_ownership']
      });

      expect(transitions).toContainEqual({
        from: 'Reserved',
        to: 'Owned',
        trigger: 'confirm_opening',
        conditions: ['same_owner']
      });

      expect(transitions).toContainEqual({
        from: 'Reserved',
        to: 'Free',
        trigger: 'timeout',
        conditions: ['expired_90_seconds']
      });
    });

    it('should get possible next states', () => {
      const freeStates = stateManager.getPossibleNextStates('Free');
      expect(freeStates).toContain('Reserved');
      expect(freeStates).toContain('Blocked');

      const reservedStates = stateManager.getPossibleNextStates('Reserved');
      expect(reservedStates).toContain('Owned');
      expect(reservedStates).toContain('Free');
      expect(reservedStates).toContain('Blocked');
    });
  });

  describe('assignLocker', () => {
    beforeEach(async () => {
      // Create test lockers
      await db.run(`
        INSERT INTO lockers (kiosk_id, id, status, version, is_vip)
        VALUES (?, ?, ?, ?, ?)
      `, ['kiosk-1', 1, 'Free', 1, 0]);

      await db.run(`
        INSERT INTO lockers (kiosk_id, id, status, version, is_vip)
        VALUES (?, ?, ?, ?, ?)
      `, ['kiosk-1', 2, 'Free', 1, 1]); // VIP locker

      await db.run(`
        INSERT INTO lockers (kiosk_id, id, status, version, is_vip)
        VALUES (?, ?, ?, ?, ?)
      `, ['kiosk-1', 3, 'Owned', 1, 0]);
    });

    it('should assign Free locker successfully', async () => {
      const result = await stateManager.assignLocker('kiosk-1', 1, 'rfid', 'card-123');
      
      expect(result).toBe(true);

      const locker = await stateManager.getLocker('kiosk-1', 1);
      expect(locker?.status).toBe('Reserved');
      expect(locker?.owner_type).toBe('rfid');
      expect(locker?.owner_key).toBe('card-123');
      expect(locker?.reserved_at).toBeInstanceOf(Date);
      expect(locker?.version).toBe(2);
    });

    it('should reject assignment to VIP locker', async () => {
      const result = await stateManager.assignLocker('kiosk-1', 2, 'rfid', 'card-123');
      
      expect(result).toBe(false);

      const locker = await stateManager.getLocker('kiosk-1', 2);
      expect(locker?.status).toBe('Free');
      expect(locker?.owner_key).toBeNull();
    });

    it('should reject assignment to non-Free locker', async () => {
      const result = await stateManager.assignLocker('kiosk-1', 3, 'rfid', 'card-123');
      
      expect(result).toBe(false);
    });

    it('should enforce one card, one locker rule', async () => {
      // First assignment should succeed
      const result1 = await stateManager.assignLocker('kiosk-1', 1, 'rfid', 'card-123');
      expect(result1).toBe(true);

      // Create another free locker
      await db.run(`
        INSERT INTO lockers (kiosk_id, id, status, version, is_vip)
        VALUES (?, ?, ?, ?, ?)
      `, ['kiosk-1', 4, 'Free', 1, 0]);

      // Second assignment with same card should fail
      const result2 = await stateManager.assignLocker('kiosk-1', 4, 'rfid', 'card-123');
      expect(result2).toBe(false);
    });

    it('should log assignment event', async () => {
      await stateManager.assignLocker('kiosk-1', 1, 'rfid', 'card-123');

      const events = await db.all(
        'SELECT * FROM events WHERE kiosk_id = ? AND locker_id = ? AND event_type = ?',
        ['kiosk-1', 1, EventType.RFID_ASSIGN]
      );

      expect(events).toHaveLength(1);
      const details = JSON.parse(events[0].details);
      expect(details.owner_type).toBe('rfid');
      expect(details.owner_key).toBe('card-123');
      expect(details.previous_status).toBe('Free');
    });
  });

  describe('releaseLocker', () => {
    beforeEach(async () => {
      // Create test lockers in different states
      await db.run(`
        INSERT INTO lockers (kiosk_id, id, status, owner_type, owner_key, reserved_at, version, is_vip)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['kiosk-1', 1, 'Reserved', 'rfid', 'card-123', new Date().toISOString(), 1, 0]);

      await db.run(`
        INSERT INTO lockers (kiosk_id, id, status, owner_type, owner_key, owned_at, version, is_vip)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['kiosk-1', 2, 'Owned', 'rfid', 'card-456', new Date().toISOString(), 1, 0]);
    });

    it('should release Reserved locker', async () => {
      const result = await stateManager.releaseLocker('kiosk-1', 1, 'card-123');
      
      expect(result).toBe(true);

      const locker = await stateManager.getLocker('kiosk-1', 1);
      expect(locker?.status).toBe('Free');
      expect(locker?.owner_type).toBeNull();
      expect(locker?.owner_key).toBeNull();
      expect(locker?.reserved_at).toBeNull();
      expect(locker?.version).toBe(2);
    });

    it('should release Owned locker', async () => {
      const result = await stateManager.releaseLocker('kiosk-1', 2, 'card-456');
      
      expect(result).toBe(true);

      const locker = await stateManager.getLocker('kiosk-1', 2);
      expect(locker?.status).toBe('Free');
      expect(locker?.owner_type).toBeNull();
      expect(locker?.owner_key).toBeNull();
      expect(locker?.owned_at).toBeNull();
    });

    it('should reject release with wrong owner key', async () => {
      const result = await stateManager.releaseLocker('kiosk-1', 1, 'wrong-card');
      
      expect(result).toBe(false);

      const locker = await stateManager.getLocker('kiosk-1', 1);
      expect(locker?.status).toBe('Reserved');
      expect(locker?.owner_key).toBe('card-123');
    });

    it('should log release event', async () => {
      await stateManager.releaseLocker('kiosk-1', 1, 'card-123');

      const events = await db.all(
        'SELECT * FROM events WHERE kiosk_id = ? AND locker_id = ? AND event_type = ?',
        ['kiosk-1', 1, EventType.RFID_RELEASE]
      );

      expect(events).toHaveLength(1);
      const details = JSON.parse(events[0].details);
      expect(details.owner_type).toBe('rfid');
      expect(details.owner_key).toBe('card-123');
      expect(details.previous_status).toBe('Reserved');
    });
  });

  describe('getAvailableLockers', () => {
    beforeEach(async () => {
      // Create lockers in different states
      const lockers = [
        { id: 1, status: 'Free', is_vip: 0 },      // Available
        { id: 2, status: 'Reserved', is_vip: 0 },  // Not available
        { id: 3, status: 'Owned', is_vip: 0 },     // Not available
        { id: 4, status: 'Blocked', is_vip: 0 },   // Not available
        { id: 5, status: 'Free', is_vip: 1 },      // Not available (VIP)
        { id: 6, status: 'Free', is_vip: 0 }       // Available
      ];

      for (const locker of lockers) {
        await db.run(`
          INSERT INTO lockers (kiosk_id, id, status, version, is_vip)
          VALUES (?, ?, ?, ?, ?)
        `, ['kiosk-1', locker.id, locker.status, 1, locker.is_vip]);
      }
    });

    it('should return only Free, non-VIP lockers', async () => {
      const available = await stateManager.getAvailableLockers('kiosk-1');
      
      expect(available).toHaveLength(2);
      expect(available.map(l => l.id)).toEqual([1, 6]);
      
      for (const locker of available) {
        expect(locker.status).toBe('Free');
        expect(locker.is_vip).toBe(false);
      }
    });
  });

  describe('cleanupExpiredReservations', () => {
    beforeEach(async () => {
      const now = new Date();
      const expired = new Date(now.getTime() - 120000); // 2 minutes ago (expired)
      const recent = new Date(now.getTime() - 30000);   // 30 seconds ago (not expired)

      // Create expired reservation
      await db.run(`
        INSERT INTO lockers (kiosk_id, id, status, owner_type, owner_key, reserved_at, version, is_vip)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['kiosk-1', 1, 'Reserved', 'rfid', 'card-123', expired.toISOString(), 1, 0]);

      // Create recent reservation (should not be cleaned up)
      await db.run(`
        INSERT INTO lockers (kiosk_id, id, status, owner_type, owner_key, reserved_at, version, is_vip)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['kiosk-1', 2, 'Reserved', 'rfid', 'card-456', recent.toISOString(), 1, 0]);
    });

    it('should cleanup expired reservations only', async () => {
      const cleanedCount = await stateManager.cleanupExpiredReservations();
      
      expect(cleanedCount).toBe(1);

      // Check expired locker is now Free
      const expiredLocker = await stateManager.getLocker('kiosk-1', 1);
      expect(expiredLocker?.status).toBe('Free');
      expect(expiredLocker?.owner_key).toBeNull();

      // Check recent locker is still Reserved
      const recentLocker = await stateManager.getLocker('kiosk-1', 2);
      expect(recentLocker?.status).toBe('Reserved');
      expect(recentLocker?.owner_key).toBe('card-456');
    });

    it('should log cleanup events', async () => {
      await stateManager.cleanupExpiredReservations();

      const events = await db.all(
        'SELECT * FROM events WHERE event_type = ? AND details LIKE ?',
        [EventType.RFID_RELEASE, '%timeout_cleanup%']
      );

      expect(events).toHaveLength(1);
      const details = JSON.parse(events[0].details);
      expect(details.reason).toBe('timeout_cleanup');
      expect(details.timeout_seconds).toBe(90);
    });
  });

  describe('checkExistingOwnership', () => {
    beforeEach(async () => {
      await db.run(`
        INSERT INTO lockers (kiosk_id, id, status, owner_type, owner_key, version, is_vip)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, ['kiosk-1', 1, 'Owned', 'rfid', 'card-123', 1, 0]);
    });

    it('should find existing ownership', async () => {
      const existing = await stateManager.checkExistingOwnership('card-123', 'rfid');
      
      expect(existing).not.toBeNull();
      expect(existing?.owner_key).toBe('card-123');
      expect(existing?.status).toBe('Owned');
    });

    it('should return null for non-existent ownership', async () => {
      const existing = await stateManager.checkExistingOwnership('card-999', 'rfid');
      
      expect(existing).toBeNull();
    });
  });

  describe('validateOwnership', () => {
    beforeEach(async () => {
      await db.run(`
        INSERT INTO lockers (kiosk_id, id, status, owner_type, owner_key, version, is_vip)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, ['kiosk-1', 1, 'Owned', 'rfid', 'card-123', 1, 0]);
    });

    it('should validate correct ownership', async () => {
      const isValid = await stateManager.validateOwnership('kiosk-1', 1, 'card-123', 'rfid');
      expect(isValid).toBe(true);
    });

    it('should reject incorrect owner key', async () => {
      const isValid = await stateManager.validateOwnership('kiosk-1', 1, 'wrong-card', 'rfid');
      expect(isValid).toBe(false);
    });

    it('should reject incorrect owner type', async () => {
      const isValid = await stateManager.validateOwnership('kiosk-1', 1, 'card-123', 'device');
      expect(isValid).toBe(false);
    });
  });

  describe('forceStateTransition', () => {
    beforeEach(async () => {
      await db.run(`
        INSERT INTO lockers (kiosk_id, id, status, version, is_vip)
        VALUES (?, ?, ?, ?, ?)
      `, ['kiosk-1', 1, 'Owned', 1, 0]);
    });

    it('should force state transition for staff operations', async () => {
      const result = await stateManager.forceStateTransition(
        'kiosk-1', 1, 'Free', 'staff-user', 'maintenance'
      );
      
      expect(result).toBe(true);

      const locker = await stateManager.getLocker('kiosk-1', 1);
      expect(locker?.status).toBe('Free');
      expect(locker?.version).toBe(2);
    });

    it('should log forced transition event', async () => {
      await stateManager.forceStateTransition(
        'kiosk-1', 1, 'Free', 'staff-user', 'maintenance'
      );

      const events = await db.all(
        'SELECT * FROM events WHERE staff_user = ? AND event_type = ?',
        ['staff-user', EventType.STAFF_OPEN]
      );

      expect(events).toHaveLength(1);
      const details = JSON.parse(events[0].details);
      expect(details.previous_status).toBe('Owned');
      expect(details.new_status).toBe('Free');
      expect(details.reason).toBe('maintenance');
      expect(details.forced_transition).toBe(true);
    });
  });

  describe('Automatic Cleanup Timer', () => {
    it('should start cleanup timer on initialization', () => {
      // Timer should be running (tested indirectly by checking it exists)
      expect(stateManager['cleanupInterval']).not.toBeNull();
    });

    it('should stop cleanup timer on shutdown', async () => {
      await stateManager.shutdown();
      expect(stateManager['cleanupInterval']).toBeNull();
    });
  });

  describe('getLockerHistory', () => {
    beforeEach(async () => {
      // Create some events
      const events = [
        { event_type: EventType.RFID_ASSIGN, details: { action: 'assign' } },
        { event_type: EventType.RFID_RELEASE, details: { action: 'release' } },
        { event_type: EventType.STAFF_OPEN, details: { action: 'staff_open' } }
      ];

      for (const event of events) {
        await db.run(`
          INSERT INTO events (kiosk_id, locker_id, event_type, details)
          VALUES (?, ?, ?, ?)
        `, ['kiosk-1', 1, event.event_type, JSON.stringify(event.details)]);
      }
    });

    it('should return locker history', async () => {
      const history = await stateManager.getLockerHistory('kiosk-1', 1);
      
      expect(history).toHaveLength(3);
      expect(history[0].event_type).toBe(EventType.STAFF_OPEN); // Most recent first
    });

    it('should respect limit parameter', async () => {
      const history = await stateManager.getLockerHistory('kiosk-1', 1, 2);
      
      expect(history).toHaveLength(2);
    });
  });
});