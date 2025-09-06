#!/usr/bin/env node

/**
 * Simple test for Overdue and Suspected Handling System
 * Tests core functionality without complex dependencies
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Simple mock implementations
class MockConfigurationManager {
  async getEffectiveConfig(kioskId) {
    return {
      user_report_window_seconds: 30,
      suspect_ttl_minutes: 60,
      daily_report_cap: 2,
      retrieval_grace_period_minutes: 10
    };
  }
}

class MockEventEmitter {
  constructor() {
    this.events = {};
  }
  
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }
  
  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(callback => callback(data));
    }
  }
}

// Simple OverdueManager implementation for testing
class SimpleOverdueManager extends MockEventEmitter {
  constructor(db, config) {
    super();
    this.db = db;
    this.config = config;
    this.defaultConfig = {
      userReportWindowSeconds: 30,
      suspectTtlMinutes: 60,
      dailyReportCap: 2,
      retrievalGracePeriodMinutes: 10
    };
  }

  async markLockerOverdue(kioskId, lockerId, cardId, reason) {
    const now = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE lockers 
        SET overdue_from = ?, 
            overdue_reason = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE kiosk_id = ? AND id = ?
      `, [now, reason, kioskId, lockerId], (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`Locker marked overdue: locker=${lockerId}, reason=${reason}.`);
          this.emit('locker_overdue', { kioskId, lockerId, cardId, reason, overdueFrom: new Date(now) });
          resolve();
        }
      });
    });
  }

  async canRetrieveOverdue(kioskId, lockerId, cardId) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT * FROM lockers 
        WHERE kiosk_id = ? AND id = ? AND owner_key = ? AND overdue_from IS NOT NULL
      `, [kioskId, lockerId, cardId], (err, locker) => {
        if (err) {
          reject(err);
          return;
        }

        if (!locker) {
          resolve({ allowed: false, reason: 'Not overdue owner or locker not found' });
          return;
        }

        if (locker.retrieved_once === 1) {
          resolve({ allowed: false, reason: 'Already retrieved once' });
          return;
        }

        resolve({ allowed: true });
      });
    });
  }

  async processOverdueRetrieval(kioskId, lockerId, cardId) {
    const now = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE lockers 
        SET overdue_from = NULL,
            overdue_reason = NULL,
            retrieved_once = 1,
            retrieved_at = ?,
            quarantine_until = datetime('now', '+20 minutes'),
            updated_at = CURRENT_TIMESTAMP
        WHERE kiosk_id = ? AND id = ?
      `, [now, kioskId, lockerId], (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`Overdue retrieval executed: locker=${lockerId}, quarantine=20min.`);
          this.emit('overdue_retrieved', {
            kioskId, lockerId, cardId,
            retrievedAt: new Date(now),
            quarantineUntil: new Date(Date.now() + 20 * 60 * 1000)
          });
          resolve();
        }
      });
    });
  }

  async reportSuspectedOccupied(kioskId, lockerId, cardId) {
    try {
      // Check daily report cap
      const reportsToday = await this.getUserReportsToday(cardId);
      if (reportsToday >= this.defaultConfig.dailyReportCap) {
        return { 
          accepted: false, 
          reason: `Daily report limit reached (${this.defaultConfig.dailyReportCap} reports per day)` 
        };
      }

      const now = new Date().toISOString();
      
      // Mark locker as suspected occupied
      await new Promise((resolve, reject) => {
        this.db.run(`
          UPDATE lockers 
          SET suspected_occupied = 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE kiosk_id = ? AND id = ?
        `, [kioskId, lockerId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Record the report
      await new Promise((resolve, reject) => {
        this.db.run(`
          INSERT INTO user_reports (card_id, kiosk_id, locker_id, report_type, reported_at)
          VALUES (?, ?, ?, 'suspected_occupied', ?)
        `, [cardId, kioskId, lockerId, now], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Mark as overdue with user report reason
      await this.markLockerOverdue(kioskId, lockerId, cardId, 'user_report');

      console.log(`Suspected occupied reported: locker=${lockerId}.`);
      this.emit('suspected_occupied_reported', { kioskId, lockerId, cardId, reportedAt: new Date(now) });

      return { accepted: true };

    } catch (error) {
      console.error(`❌ Failed to report suspected occupied for locker ${lockerId}:`, error);
      return { accepted: false, reason: 'Database error' };
    }
  }

  async getUserReportsToday(cardId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT COUNT(*) as count 
        FROM user_reports 
        WHERE card_id = ? 
        AND reported_at >= ? 
        AND reported_at < ?
      `, [cardId, today.toISOString(), tomorrow.toISOString()], (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result?.count || 0);
        }
      });
    });
  }

  async shouldExcludeFromAssignment(kioskId, lockerId) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT overdue_from, suspected_occupied 
        FROM lockers 
        WHERE kiosk_id = ? AND id = ?
      `, [kioskId, lockerId], (err, locker) => {
        if (err) {
          reject(err);
          return;
        }

        if (!locker) {
          resolve({ exclude: true, reason: 'Locker not found' });
          return;
        }

        if (locker.overdue_from) {
          resolve({ exclude: true, reason: 'Locker is overdue' });
          return;
        }

        if (locker.suspected_occupied === 1) {
          resolve({ exclude: true, reason: 'Locker is suspected occupied' });
          return;
        }

        resolve({ exclude: false });
      });
    });
  }
}

async function runTests() {
  console.log('🧪 Testing Overdue and Suspected Handling System (Simple)\n');

  const dbPath = './data/test-overdue.db';
  const db = new sqlite3.Database(dbPath);
  
  try {
    // Set up test data
    await setupTestData(db);
    console.log('✅ Test data setup complete');

    // Initialize services
    const config = new MockConfigurationManager();
    const overdueManager = new SimpleOverdueManager(db, config);
    
    console.log('✅ Services initialized\n');

    // Run test scenarios
    await testOverdueMarking(overdueManager, db);
    await testOverdueRetrieval(overdueManager, db);
    await testSuspectedOccupiedReporting(overdueManager, db);
    await testDailyReportLimits(overdueManager, db);
    await testAssignmentPoolExclusion(overdueManager, db);
    
    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

async function setupTestData(db) {
  // Clean up existing data
  await new Promise((resolve, reject) => {
    db.run(`DELETE FROM user_reports`, (err) => {
      if (err && !err.message.includes('no such table')) reject(err);
      else resolve();
    });
  });

  await new Promise((resolve, reject) => {
    db.run(`DELETE FROM lockers`, (err) => {
      if (err && !err.message.includes('no such table')) reject(err);
      else resolve();
    });
  });

  // Create lockers table with smart assignment columns
  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS lockers (
        kiosk_id TEXT NOT NULL,
        id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Free',
        owner_type TEXT,
        owner_key TEXT,
        owned_at DATETIME,
        overdue_from DATETIME,
        overdue_reason TEXT,
        suspected_occupied INTEGER NOT NULL DEFAULT 0,
        retrieved_once INTEGER NOT NULL DEFAULT 0,
        retrieved_at DATETIME,
        quarantine_until DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kiosk_id, id)
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Insert test locker with owner
  await new Promise((resolve, reject) => {
    db.run(`
      INSERT OR REPLACE INTO lockers (kiosk_id, id, status, owner_type, owner_key, owned_at)
      VALUES ('kiosk-1', 5, 'Owned', 'rfid', 'card123', datetime('now'))
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Insert additional test lockers
  for (let i = 6; i <= 10; i++) {
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT OR REPLACE INTO lockers (kiosk_id, id, status)
        VALUES ('kiosk-1', ?, 'Free')
      `, [i], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

async function testOverdueMarking(overdueManager, db) {
  console.log('📋 Testing overdue locker marking...');

  // Test marking locker as overdue due to time limit
  await overdueManager.markLockerOverdue('kiosk-1', 5, 'card123', 'time_limit');
  
  const locker = await new Promise((resolve, reject) => {
    db.get(`SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 5`, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  
  if (!locker.overdue_from || locker.overdue_reason !== 'time_limit') {
    throw new Error('Locker not marked as overdue correctly');
  }
  
  console.log('  ✅ Locker marked as overdue with time_limit reason');
}

async function testOverdueRetrieval(overdueManager, db) {
  console.log('📋 Testing overdue retrieval logic...');

  // Test that overdue owner can retrieve once
  const canRetrieve1 = await overdueManager.canRetrieveOverdue('kiosk-1', 5, 'card123');
  if (!canRetrieve1.allowed) {
    throw new Error('Overdue owner should be allowed to retrieve');
  }
  console.log('  ✅ Overdue owner can retrieve locker');

  // Process retrieval
  await overdueManager.processOverdueRetrieval('kiosk-1', 5, 'card123');
  
  const locker = await new Promise((resolve, reject) => {
    db.get(`SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 5`, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  
  if (locker.overdue_from || locker.retrieved_once !== 1 || !locker.quarantine_until) {
    throw new Error('Overdue retrieval not processed correctly');
  }
  console.log('  ✅ Overdue retrieval processed, quarantine applied');

  // Test that second retrieval is denied
  const canRetrieve2 = await overdueManager.canRetrieveOverdue('kiosk-1', 5, 'card123');
  if (canRetrieve2.allowed) {
    throw new Error('Second retrieval should be denied');
  }
  console.log('  ✅ Second retrieval attempt denied');
}

async function testSuspectedOccupiedReporting(overdueManager, db) {
  console.log('📋 Testing suspected occupied reporting...');

  // Test suspected occupied report
  const result = await overdueManager.reportSuspectedOccupied('kiosk-1', 7, 'card789');
  console.log('  Debug: report result =', result);
  
  if (!result.accepted) {
    throw new Error(`Suspected occupied report should be accepted. Reason: ${result.reason}`);
  }
  console.log('  ✅ Suspected occupied report accepted');

  // Verify locker is marked as suspected and overdue
  const locker = await new Promise((resolve, reject) => {
    db.get(`SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 7`, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  
  if (locker.suspected_occupied !== 1 || !locker.overdue_from || locker.overdue_reason !== 'user_report') {
    throw new Error('Locker not marked as suspected occupied and overdue correctly');
  }
  console.log('  ✅ Locker marked as suspected occupied and moved to overdue');

  // Verify report is recorded
  const reportCount = await overdueManager.getUserReportsToday('card789');
  if (reportCount !== 1) {
    throw new Error('Report not recorded correctly');
  }
  console.log('  ✅ Report recorded in database');
}

async function testDailyReportLimits(overdueManager, db) {
  console.log('📋 Testing daily report limits...');

  // Add one more report to reach limit (already have 1 from previous test)
  const today = new Date().toISOString();
  await new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO user_reports (card_id, kiosk_id, locker_id, report_type, reported_at)
      VALUES ('card789', 'kiosk-1', 8, 'suspected_occupied', ?)
    `, [today], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Try to report another (should be rejected)
  const result = await overdueManager.reportSuspectedOccupied('kiosk-1', 9, 'card789');
  if (result.accepted) {
    throw new Error('Report should be rejected due to daily limit');
  }
  console.log('  ✅ Report rejected when daily limit reached');

  // Verify report count
  const reportCount = await overdueManager.getUserReportsToday('card789');
  if (reportCount !== 2) {
    throw new Error(`Expected 2 reports, got ${reportCount}`);
  }
  console.log('  ✅ Daily report count tracked correctly');
}

async function testAssignmentPoolExclusion(overdueManager, db) {
  console.log('📋 Testing assignment pool exclusion...');

  // Test overdue locker exclusion (locker 7 is overdue from previous test)
  const exclusion1 = await overdueManager.shouldExcludeFromAssignment('kiosk-1', 7);
  console.log('  Debug: exclusion1 =', exclusion1);
  
  // Locker 7 should be excluded for being suspected occupied OR overdue
  if (!exclusion1.exclude) {
    throw new Error('Suspected occupied locker should be excluded');
  }
  
  if (exclusion1.reason !== 'Locker is suspected occupied' && exclusion1.reason !== 'Locker is overdue') {
    throw new Error(`Expected exclusion reason to be 'Locker is suspected occupied' or 'Locker is overdue', got: ${exclusion1.reason}`);
  }
  
  console.log('  ✅ Suspected occupied locker excluded from assignment');

  // Test normal locker inclusion
  const exclusion2 = await overdueManager.shouldExcludeFromAssignment('kiosk-1', 6);
  if (exclusion2.exclude) {
    throw new Error('Normal locker should not be excluded');
  }
  console.log('  ✅ Normal locker not excluded from assignment');
}

// Run tests
runTests().catch(console.error);