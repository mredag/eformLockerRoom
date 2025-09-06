#!/usr/bin/env node

/**
 * Test script for Overdue and Suspected Handling System
 * Tests all aspects of task 18 implementation
 */

const path = require('path');
const fs = require('fs');

// Add shared directory to module path
const sharedPath = path.join(__dirname, '..', 'shared');
process.env.NODE_PATH = `${process.env.NODE_PATH || ''}:${sharedPath}`;
require('module')._initPaths();

const { DatabaseManager } = require('../shared/database/database-manager');
const { ConfigurationManager } = require('../shared/services/configuration-manager');
const { OverdueManager } = require('../shared/services/overdue-manager');
const { SmartSessionManager } = require('../shared/services/smart-session-manager');

async function runTests() {
  console.log('🧪 Testing Overdue and Suspected Handling System\n');

  // Create test database
  const testDbPath = path.join(__dirname, `test-overdue-${Date.now()}.db`);
  const db = new DatabaseManager(testDbPath);
  
  try {
    await db.initialize();
    console.log('✅ Database initialized');

    // Set up test schema
    await setupTestSchema(db);
    console.log('✅ Test schema created');

    // Initialize services
    const config = new ConfigurationManager(db);
    await config.initialize();
    
    const overdueManager = new OverdueManager(db, config);
    const sessionManager = new SmartSessionManager(db, config);
    
    console.log('✅ Services initialized\n');

    // Run test scenarios
    await testOverdueMarking(overdueManager);
    await testOverdueRetrieval(overdueManager);
    await testSuspectedOccupiedReporting(overdueManager);
    await testDailyReportLimits(overdueManager);
    await testAssignmentPoolExclusion(overdueManager);
    await testAdminManagement(overdueManager);
    
    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  }
}

async function setupTestSchema(db) {
  // Create lockers table
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

  // Insert test lockers
  for (let i = 1; i <= 10; i++) {
    await db.run(`
      INSERT INTO lockers (kiosk_id, id, status)
      VALUES ('kiosk-1', ?, 'Free')
    `, [i]);
  }

  // Insert test locker with owner
  await db.run(`
    INSERT INTO lockers (kiosk_id, id, status, owner_type, owner_key, owned_at)
    VALUES ('kiosk-1', 5, 'Owned', 'rfid', 'card123', datetime('now'))
  `);
}

async function testOverdueMarking(overdueManager) {
  console.log('📋 Testing overdue locker marking...');

  // Test marking locker as overdue due to time limit
  await overdueManager.markLockerOverdue('kiosk-1', 5, 'card123', 'time_limit');
  
  const locker = await overdueManager.db.get(`
    SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 5
  `);
  
  if (!locker.overdue_from || locker.overdue_reason !== 'time_limit') {
    throw new Error('Locker not marked as overdue correctly');
  }
  
  console.log('  ✅ Locker marked as overdue with time_limit reason');

  // Test marking locker as overdue due to user report
  await overdueManager.markLockerOverdue('kiosk-1', 6, 'card456', 'user_report');
  
  const locker2 = await overdueManager.db.get(`
    SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 6
  `);
  
  if (!locker2.overdue_from || locker2.overdue_reason !== 'user_report') {
    throw new Error('Locker not marked as overdue with user_report reason');
  }
  
  console.log('  ✅ Locker marked as overdue with user_report reason');
}

async function testOverdueRetrieval(overdueManager) {
  console.log('📋 Testing overdue retrieval logic...');

  // Test that overdue owner can retrieve once
  const canRetrieve1 = await overdueManager.canRetrieveOverdue('kiosk-1', 5, 'card123');
  if (!canRetrieve1.allowed) {
    throw new Error('Overdue owner should be allowed to retrieve');
  }
  console.log('  ✅ Overdue owner can retrieve locker');

  // Process retrieval
  await overdueManager.processOverdueRetrieval('kiosk-1', 5, 'card123');
  
  const locker = await overdueManager.db.get(`
    SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 5
  `);
  
  if (locker.overdue_from || !locker.cleared_by || !locker.quarantine_until) {
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

async function testSuspectedOccupiedReporting(overdueManager) {
  console.log('📋 Testing suspected occupied reporting...');

  // Add recent locker operation
  await overdueManager.db.run(`
    INSERT INTO locker_operations (kiosk_id, locker_id, card_id, operation_type, opened_at)
    VALUES ('kiosk-1', 7, 'card789', 'open', datetime('now'))
  `);

  // Test suspected occupied report
  const result = await overdueManager.reportSuspectedOccupied('kiosk-1', 7, 'card789');
  if (!result.accepted) {
    throw new Error('Suspected occupied report should be accepted');
  }
  console.log('  ✅ Suspected occupied report accepted');

  // Verify locker is marked as suspected and overdue
  const locker = await overdueManager.db.get(`
    SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 7
  `);
  
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

async function testDailyReportLimits(overdueManager) {
  console.log('📋 Testing daily report limits...');

  // Add one more report to reach limit (already have 1 from previous test)
  const today = new Date().toISOString();
  await overdueManager.db.run(`
    INSERT INTO user_reports (card_id, kiosk_id, locker_id, report_type, reported_at)
    VALUES ('card789', 'kiosk-1', 8, 'suspected_occupied', ?)
  `, [today]);

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

async function testAssignmentPoolExclusion(overdueManager) {
  console.log('📋 Testing assignment pool exclusion...');

  // Test overdue locker exclusion
  const exclusion1 = await overdueManager.shouldExcludeFromAssignment('kiosk-1', 6); // overdue
  if (!exclusion1.exclude || exclusion1.reason !== 'Locker is overdue') {
    throw new Error('Overdue locker should be excluded');
  }
  console.log('  ✅ Overdue locker excluded from assignment');

  // Test suspected occupied locker exclusion
  const exclusion2 = await overdueManager.shouldExcludeFromAssignment('kiosk-1', 7); // suspected
  if (!exclusion2.exclude || exclusion2.reason !== 'Locker is suspected occupied') {
    throw new Error('Suspected occupied locker should be excluded');
  }
  console.log('  ✅ Suspected occupied locker excluded from assignment');

  // Test normal locker inclusion
  const exclusion3 = await overdueManager.shouldExcludeFromAssignment('kiosk-1', 1); // normal
  if (exclusion3.exclude) {
    throw new Error('Normal locker should not be excluded');
  }
  console.log('  ✅ Normal locker not excluded from assignment');
}

async function testAdminManagement(overdueManager) {
  console.log('📋 Testing admin management functions...');

  // Test getting overdue lockers
  const overdueLockers = await overdueManager.getOverdueLockers('kiosk-1');
  if (overdueLockers.length < 1) {
    throw new Error('Should have at least one overdue locker');
  }
  console.log(`  ✅ Found ${overdueLockers.length} overdue lockers`);

  // Test getting suspected lockers
  const suspectedLockers = await overdueManager.getSuspectedLockers('kiosk-1');
  if (suspectedLockers.length < 1) {
    throw new Error('Should have at least one suspected locker');
  }
  console.log(`  ✅ Found ${suspectedLockers.length} suspected lockers`);

  // Test clearing suspected flag
  await overdueManager.clearSuspectedOccupied('kiosk-1', 7, 'admin');
  const clearedLocker = await overdueManager.db.get(`
    SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 7
  `);
  
  if (clearedLocker.suspected_occupied !== 0 || clearedLocker.cleared_by !== 'admin') {
    throw new Error('Suspected flag not cleared correctly');
  }
  console.log('  ✅ Suspected flag cleared by admin');

  // Test force clearing overdue locker
  await overdueManager.forceCloseOverdue('kiosk-1', 6, 'admin');
  const forceClearedLocker = await overdueManager.db.get(`
    SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = 6
  `);
  
  if (forceClearedLocker.overdue_from || forceClearedLocker.status !== 'Free' || 
      forceClearedLocker.owner_key || !forceClearedLocker.quarantine_until) {
    throw new Error('Overdue locker not force cleared correctly');
  }
  console.log('  ✅ Overdue locker force cleared by admin');
}

// Run tests
runTests().catch(console.error);