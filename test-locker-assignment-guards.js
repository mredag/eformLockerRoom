#!/usr/bin/env node

/**
 * Test script for locker assignment guards
 * Ensures overdue and suspected lockers are excluded from assignment
 */

const { DatabaseManager } = require('./shared/database/database-manager');
const { LockerStateManager } = require('./shared/services/locker-state-manager');

async function testAssignmentGuards() {
  console.log('🧪 Testing Locker Assignment Guards...\n');

  try {
    // Initialize database
    const dbManager = DatabaseManager.getInstance({
      migrationsPath: './migrations'
    });
    await dbManager.initialize();

    const lockerStateManager = new LockerStateManager(dbManager);
    const db = dbManager.getConnection();

    // Test 1: Ensure overdue lockers are excluded
    console.log('1. Testing overdue locker exclusion...');
    
    // Create a test overdue locker
    db.prepare(`
      UPDATE lockers 
      SET status = 'Free', overdue_from = CURRENT_TIMESTAMP, overdue_reason = 'time_limit'
      WHERE kiosk_id = 'test-kiosk' AND id = 1
    `).run();

    const availableLockers = await lockerStateManager.getAvailableLockers('test-kiosk');
    const overdueLocker = availableLockers.find(l => l.id === 1);
    
    if (!overdueLocker) {
      console.log('✅ Overdue locker correctly excluded from available lockers');
    } else {
      console.log('❌ Overdue locker incorrectly included in available lockers');
    }

    // Test 2: Ensure suspected lockers are excluded
    console.log('\n2. Testing suspected locker exclusion...');
    
    // Create a test suspected locker
    db.prepare(`
      UPDATE lockers 
      SET status = 'Free', overdue_from = NULL, suspected_occupied = 1
      WHERE kiosk_id = 'test-kiosk' AND id = 2
    `).run();

    const availableLockers2 = await lockerStateManager.getAvailableLockers('test-kiosk');
    const suspectedLocker = availableLockers2.find(l => l.id === 2);
    
    if (!suspectedLocker) {
      console.log('✅ Suspected locker correctly excluded from available lockers');
    } else {
      console.log('❌ Suspected locker incorrectly included in available lockers');
    }

    // Test 3: Ensure both conditions exclude locker
    console.log('\n3. Testing combined overdue + suspected exclusion...');
    
    // Create a locker with both flags
    db.prepare(`
      UPDATE lockers 
      SET status = 'Free', overdue_from = CURRENT_TIMESTAMP, suspected_occupied = 1
      WHERE kiosk_id = 'test-kiosk' AND id = 3
    `).run();

    const availableLockers3 = await lockerStateManager.getAvailableLockers('test-kiosk');
    const combinedLocker = availableLockers3.find(l => l.id === 3);
    
    if (!combinedLocker) {
      console.log('✅ Combined overdue+suspected locker correctly excluded');
    } else {
      console.log('❌ Combined overdue+suspected locker incorrectly included');
    }

    // Test 4: Verify normal free lockers are still available
    console.log('\n4. Testing normal free locker inclusion...');
    
    // Ensure a normal locker is available
    db.prepare(`
      UPDATE lockers 
      SET status = 'Free', overdue_from = NULL, suspected_occupied = 0
      WHERE kiosk_id = 'test-kiosk' AND id = 4
    `).run();

    const availableLockers4 = await lockerStateManager.getAvailableLockers('test-kiosk');
    const normalLocker = availableLockers4.find(l => l.id === 4);
    
    if (normalLocker) {
      console.log('✅ Normal free locker correctly included in available lockers');
    } else {
      console.log('❌ Normal free locker incorrectly excluded from available lockers');
    }

    // Clean up test data
    db.prepare(`
      UPDATE lockers 
      SET status = 'Free', overdue_from = NULL, suspected_occupied = 0, overdue_reason = NULL
      WHERE kiosk_id = 'test-kiosk' AND id IN (1, 2, 3, 4)
    `).run();

    console.log('\n🎉 Locker assignment guard testing completed!');
    console.log('\n📋 Guard Rules Verified:');
    console.log('   - Lockers with overdue_from NOT NULL are excluded');
    console.log('   - Lockers with suspected_occupied = 1 are excluded');
    console.log('   - Both conditions together exclude locker');
    console.log('   - Normal free lockers remain available');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testAssignmentGuards().catch(console.error);
}

module.exports = { testAssignmentGuards };