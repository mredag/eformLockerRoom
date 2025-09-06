/**
 * Integration tests for Overdue and Suspected Handling System
 * Tests complete workflow from session expiry to overdue retrieval
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OverdueManager } from '../overdue-manager';
import { SmartSessionManager } from '../smart-session-manager';
import { DatabaseConnection } from '../../database/connection';
import { ConfigurationManager } from '../configuration-manager';
import path from 'path';
import fs from 'fs';

describe('Overdue Integration Tests', () => {
  let overdueManager: OverdueManager;
  let sessionManager: SmartSessionManager;
  let db: DatabaseConnection;
  let config: ConfigurationManager;
  let testDbPath: string;

  beforeEach(async () => {
    // Create test database
    testDbPath = path.join(__dirname, `test-overdue-${Date.now()}.db`);
    db = DatabaseConnection.getInstance(testDbPath);
    await db.initialize();

    // Create test configuration
    config = new ConfigurationManager(db);
    await config.initialize();

    // Initialize managers
    overdueManager = new OverdueManager(db, config);
    sessionManager = new SmartSessionManager(db, config);

    // Set up test schema
    await setupTestSchema(db);
  });

  afterEach(async () => {
    await db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  async function setupTestSchema(db: DatabaseConnection) {
    // Create lockers table with smart assignment columns
    await db.run(`
      CREATE TABLE lockers (
        kiosk_id TEXT NOT NULL,
        id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Free',
        owner_type TEXT,
        owner_key TEXT,
        owned_at DATETIME,
        overdue_from DATETIME,
        overdue_reason TEXT,
        suspected_occupied INTEGER NOT NULL DEFAULT 0,
        cleared_by TEXT,
        cleared_at DATETIME,
        quarantine_until DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kiosk_id, id)
      )
    `);

    // Create user_reports table
    await db.run(`
      CREATE TABLE user_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id TEXT NOT NULL,
        kiosk_id TEXT NOT NULL,
        locker_id INTEGER NOT NULL,
        report_type TEXT NOT NULL,
        reported_at DATETIME NOT NULL
      )
    `);

    // Create locker_operations table
    await db.run(`
      CREATE TABLE locker_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kiosk_id TEXT NOT NULL,
        locker_id INTEGER NOT NULL,
        card_id TEXT,
        operation_type TEXT NOT NULL,
        opened_at DATETIME,
        success BOOLEAN NOT NULL DEFAULT 1
      )
    `);

    // Create smart_sessions table
    await db.run(`
      CREATE TABLE smart_sessions (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        kiosk_id TEXT NOT NULL,
        locker_id INTEGER,
        start_time DATETIME NOT NULL,
        expires_time DATETIME NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      )
    `);

    // Insert test locker
    await db.run(`
      INSERT INTO lockers (kiosk_id, id, status, owner_type, owner_key, owned_at)
      VALUES ('kiosk-1', 5, 'Owned', 'rfid', 'card123', datetime('now'))
    `);
  }

  describe('Session Expiry to Overdue Flow', () => {
    it('should mark locker as overdue when session expires', async () => {
      // Create expired session
      const sessionId = 'session-123';
      const expiredTime = new Date(Date.now() - 60000); // 1 minute ago
      
      await db.run(`
        INSERT INTO smart_sessions (id, card_id, kiosk_id, locker_id, start_time, expires_time, status)
        VALUES (?, 'card123', 'kiosk-1', 5, datetime('now', '-3 hours'), ?, 'active')
      `, [sessionId, expiredTime.toISOString()]);

      // Mark session as overdue (simulating session manager)
      await sessionManager.markOverdue(sessionId);

      // Mark locker as overdue
      await overdueManager.markLockerOverdue('kiosk-1', 5, 'card123', 'time_limit');

      // Verify locker is marked as overdue
      const locker = await db.get(`
        SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 5
      `);

      expect(locker.overdue_from).toBeTruthy();
      expect(locker.overdue_reason).toBe('time_limit');
    });

    it('should allow one-time retrieval for overdue owner', async () => {
      // Mark locker as overdue
      await overdueManager.markLockerOverdue('kiosk-1', 5, 'card123', 'time_limit');

      // Check if retrieval is allowed
      const canRetrieve = await overdueManager.canRetrieveOverdue('kiosk-1', 5, 'card123');
      expect(canRetrieve.allowed).toBe(true);

      // Process retrieval
      await overdueManager.processOverdueRetrieval('kiosk-1', 5, 'card123');

      // Verify locker is cleared and quarantined
      const locker = await db.get(`
        SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 5
      `);

      expect(locker.overdue_from).toBeNull();
      expect(locker.cleared_by).toBe('card123');
      expect(locker.quarantine_until).toBeTruthy();
    });

    it('should deny second retrieval attempt', async () => {
      // Mark as overdue and process first retrieval
      await overdueManager.markLockerOverdue('kiosk-1', 5, 'card123', 'time_limit');
      await overdueManager.processOverdueRetrieval('kiosk-1', 5, 'card123');

      // Try second retrieval
      const canRetrieve = await overdueManager.canRetrieveOverdue('kiosk-1', 5, 'card123');
      expect(canRetrieve.allowed).toBe(false);
      expect(canRetrieve.reason).toBe('Already retrieved once');
    });
  });

  describe('Suspected Occupied Reporting Flow', () => {
    it('should accept suspected occupied report within daily limit', async () => {
      // Record locker operation (recent open)
      await db.run(`
        INSERT INTO locker_operations (kiosk_id, locker_id, card_id, operation_type, opened_at)
        VALUES ('kiosk-1', 5, 'card123', 'open', datetime('now'))
      `);

      // Report suspected occupied
      const result = await overdueManager.reportSuspectedOccupied('kiosk-1', 5, 'card123');

      expect(result.accepted).toBe(true);

      // Verify locker is marked as suspected
      const locker = await db.get(`
        SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 5
      `);

      expect(locker.suspected_occupied).toBe(1);
      expect(locker.overdue_from).toBeTruthy();
      expect(locker.overdue_reason).toBe('user_report');
    });

    it('should reject report when daily limit reached', async () => {
      // Add 2 reports for today (reaching daily limit)
      const today = new Date().toISOString();
      await db.run(`
        INSERT INTO user_reports (card_id, kiosk_id, locker_id, report_type, reported_at)
        VALUES ('card123', 'kiosk-1', 3, 'suspected_occupied', ?),
               ('card123', 'kiosk-1', 4, 'suspected_occupied', ?)
      `, [today, today]);

      // Try to report another
      const result = await overdueManager.reportSuspectedOccupied('kiosk-1', 5, 'card123');

      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('Daily report limit reached');
    });

    it('should track user report count correctly', async () => {
      // Add one report for today
      const today = new Date().toISOString();
      await db.run(`
        INSERT INTO user_reports (card_id, kiosk_id, locker_id, report_type, reported_at)
        VALUES ('card123', 'kiosk-1', 3, 'suspected_occupied', ?)
      `, [today]);

      const count = await overdueManager.getUserReportsToday('card123');
      expect(count).toBe(1);
    });
  });

  describe('Assignment Pool Exclusion', () => {
    it('should exclude overdue lockers from assignment', async () => {
      await overdueManager.markLockerOverdue('kiosk-1', 5, 'card123', 'time_limit');

      const exclusion = await overdueManager.shouldExcludeFromAssignment('kiosk-1', 5);

      expect(exclusion.exclude).toBe(true);
      expect(exclusion.reason).toBe('Locker is overdue');
    });

    it('should exclude suspected occupied lockers from assignment', async () => {
      await db.run(`
        UPDATE lockers SET suspected_occupied = 1 WHERE kiosk_id = 'kiosk-1' AND id = 5
      `);

      const exclusion = await overdueManager.shouldExcludeFromAssignment('kiosk-1', 5);

      expect(exclusion.exclude).toBe(true);
      expect(exclusion.reason).toBe('Locker is suspected occupied');
    });

    it('should not exclude normal lockers from assignment', async () => {
      const exclusion = await overdueManager.shouldExcludeFromAssignment('kiosk-1', 5);

      expect(exclusion.exclude).toBe(false);
    });
  });

  describe('Admin Management Functions', () => {
    it('should list overdue lockers for admin interface', async () => {
      await overdueManager.markLockerOverdue('kiosk-1', 5, 'card123', 'time_limit');

      const overdueLockers = await overdueManager.getOverdueLockers();

      expect(overdueLockers).toHaveLength(1);
      expect(overdueLockers[0]).toMatchObject({
        kioskId: 'kiosk-1',
        lockerId: 5,
        cardId: 'card123',
        reason: 'time_limit',
        retrievalAllowed: true
      });
    });

    it('should list suspected lockers for admin interface', async () => {
      await db.run(`
        UPDATE lockers SET suspected_occupied = 1 WHERE kiosk_id = 'kiosk-1' AND id = 5
      `);

      const suspectedLockers = await overdueManager.getSuspectedLockers();

      expect(suspectedLockers).toHaveLength(1);
      expect(suspectedLockers[0]).toMatchObject({
        kioskId: 'kiosk-1',
        lockerId: 5,
        cardId: 'card123'
      });
    });

    it('should allow admin to clear suspected flag', async () => {
      await db.run(`
        UPDATE lockers SET suspected_occupied = 1 WHERE kiosk_id = 'kiosk-1' AND id = 5
      `);

      await overdueManager.clearSuspectedOccupied('kiosk-1', 5, 'admin');

      const locker = await db.get(`
        SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 5
      `);

      expect(locker.suspected_occupied).toBe(0);
      expect(locker.cleared_by).toBe('admin');
    });

    it('should allow admin to force clear overdue locker', async () => {
      await overdueManager.markLockerOverdue('kiosk-1', 5, 'card123', 'time_limit');

      await overdueManager.forceCloseOverdue('kiosk-1', 5, 'admin');

      const locker = await db.get(`
        SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 5
      `);

      expect(locker.overdue_from).toBeNull();
      expect(locker.status).toBe('Free');
      expect(locker.owner_key).toBeNull();
      expect(locker.cleared_by).toBe('admin');
      expect(locker.quarantine_until).toBeTruthy();
    });
  });

  describe('Event Emission', () => {
    it('should emit events for overdue actions', async () => {
      const events: any[] = [];
      
      overdueManager.on('locker_overdue', (data) => events.push({ type: 'overdue', data }));
      overdueManager.on('overdue_retrieved', (data) => events.push({ type: 'retrieved', data }));
      overdueManager.on('suspected_occupied_reported', (data) => events.push({ type: 'suspected', data }));

      // Mark overdue
      await overdueManager.markLockerOverdue('kiosk-1', 5, 'card123', 'time_limit');
      
      // Process retrieval
      await overdueManager.processOverdueRetrieval('kiosk-1', 5, 'card123');

      // Report suspected (on different locker)
      await db.run(`
        INSERT INTO lockers (kiosk_id, id, status) VALUES ('kiosk-1', 6, 'Free')
      `);
      await overdueManager.reportSuspectedOccupied('kiosk-1', 6, 'card456');

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('overdue');
      expect(events[1].type).toBe('retrieved');
      expect(events[2].type).toBe('suspected');
    });
  });
});