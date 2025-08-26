#!/usr/bin/env node

/**
 * End-to-End Smoke Tests
 * Comprehensive testing of the locker control system
 */

const fetch = require('node-fetch');
const { DatabaseConnection } = require('../shared/database/connection');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:3000';
const PANEL_URL = process.env.PANEL_URL || 'http://127.0.0.1:3001';
const KIOSK_ID = process.env.KIOSK_ID || 'kiosk-1';

console.log('🧪 E2E Smoke Tests');
console.log('==================');
console.log(`Gateway: ${GATEWAY_URL}`);
console.log(`Panel: ${PANEL_URL}`);
console.log(`Kiosk: ${KIOSK_ID}`);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    const data = await response.json();
    return { status: response.status, data, ok: response.ok };
  } catch (error) {
    return { status: 0, error: error.message, ok: false };
  }
}

async function queryDatabase(query, params = []) {
  const db = DatabaseConnection.getInstance();
  try {
    return await db.all(query, params);
  } catch (error) {
    console.error('Database query failed:', error);
    return [];
  }
}

// Test 1: Single Open
async function testSingleOpen() {
  console.log('\n🧪 Test 1: Single Open');
  console.log('======================');
  
  const lockerId = 1;
  const url = `${PANEL_URL}/api/lockers/${lockerId}/open`;
  
  console.log(`POST ${url}`);
  
  const response = await makeRequest(url, {
    method: 'POST',
    body: JSON.stringify({
      staff_user: 'test-admin',
      reason: 'E2E smoke test'
    })
  });
  
  console.log(`Response: ${response.status} ${JSON.stringify(response.data)}`);
  
  if (response.status === 202) {
    console.log('✅ Command enqueued successfully');
    
    // Wait and check command status
    await sleep(2000);
    
    const commands = await queryDatabase(
      'SELECT command_id, status, started_at, completed_at, duration_ms FROM command_queue ORDER BY created_at DESC LIMIT 1'
    );
    
    if (commands.length > 0) {
      const command = commands[0];
      console.log(`Command Status: ${command.status}`);
      console.log(`Duration: ${command.duration_ms}ms`);
      
      if (command.status === 'completed') {
        console.log('✅ Command completed successfully');
      } else if (command.status === 'failed') {
        console.log('❌ Command failed');
      } else {
        console.log('⏳ Command still processing');
      }
    }
    
    // Check for events
    const events = await queryDatabase(
      'SELECT kiosk_id, locker_id, event_type, details FROM events ORDER BY timestamp DESC LIMIT 1'
    );
    
    if (events.length > 0) {
      console.log(`Event logged: ${events[0].event_type}`);
      console.log('✅ Database event written');
    }
    
  } else {
    console.log('❌ Command failed to enqueue');
  }
}

// Test 2: Bulk Open
async function testBulkOpen() {
  console.log('\n🧪 Test 2: Bulk Open');
  console.log('====================');
  
  const lockerIds = [2, 3, 4];
  const intervalMs = 1000;
  const url = `${PANEL_URL}/api/lockers/bulk-open`;
  
  console.log(`POST ${url}`);
  console.log(`Lockers: ${lockerIds.join(', ')}`);
  console.log(`Interval: ${intervalMs}ms`);
  
  const startTime = Date.now();
  
  const response = await makeRequest(url, {
    method: 'POST',
    body: JSON.stringify({
      locker_ids: lockerIds,
      staff_user: 'test-admin',
      interval_ms: intervalMs,
      exclude_vip: true
    })
  });
  
  console.log(`Response: ${response.status} ${JSON.stringify(response.data)}`);
  
  if (response.status === 202) {
    console.log('✅ Bulk command enqueued successfully');
    
    // Wait for completion (should take approximately 3 × interval_ms)
    const expectedDuration = lockerIds.length * intervalMs;
    console.log(`Expected duration: ~${expectedDuration}ms`);
    
    await sleep(expectedDuration + 2000); // Add buffer
    
    const actualDuration = Date.now() - startTime;
    console.log(`Actual duration: ${actualDuration}ms`);
    
    // Check command status
    const commands = await queryDatabase(
      'SELECT command_id, status, duration_ms FROM command_queue WHERE command_type = "bulk_open" ORDER BY created_at DESC LIMIT 1'
    );
    
    if (commands.length > 0) {
      const command = commands[0];
      console.log(`Bulk Command Status: ${command.status}`);
      console.log(`Command Duration: ${command.duration_ms}ms`);
      
      if (Math.abs(actualDuration - expectedDuration) < 1000) {
        console.log('✅ Timing within expected range');
      } else {
        console.log('⚠️  Timing outside expected range');
      }
    }
    
  } else {
    console.log('❌ Bulk command failed to enqueue');
  }
}

// Test 3: Duplicate Open
async function testDuplicateOpen() {
  console.log('\n🧪 Test 3: Duplicate Open');
  console.log('=========================');
  
  const lockerId = 5;
  const url = `${PANEL_URL}/api/lockers/${lockerId}/open`;
  
  console.log(`POST ${url} (first request)`);
  
  // First request
  const response1 = await makeRequest(url, {
    method: 'POST',
    body: JSON.stringify({
      staff_user: 'test-admin',
      reason: 'Duplicate test - first'
    })
  });
  
  console.log(`First Response: ${response1.status}`);
  
  // Immediate second request
  console.log(`POST ${url} (duplicate request)`);
  
  const response2 = await makeRequest(url, {
    method: 'POST',
    body: JSON.stringify({
      staff_user: 'test-admin',
      reason: 'Duplicate test - second'
    })
  });
  
  console.log(`Second Response: ${response2.status}`);
  
  if (response2.status === 409) {
    console.log('✅ Duplicate request properly rejected (409)');
  } else if (response2.status === 202) {
    console.log('⚠️  Duplicate request accepted - check idempotency');
  } else {
    console.log('❌ Unexpected response to duplicate request');
  }
  
  // Wait and verify only one command was actually executed
  await sleep(3000);
  
  const commands = await queryDatabase(
    'SELECT COUNT(*) as count FROM command_queue WHERE payload LIKE ? AND created_at > datetime("now", "-1 minute")',
    [`%"locker_id":${lockerId}%`]
  );
  
  if (commands.length > 0) {
    console.log(`Commands created: ${commands[0].count}`);
    if (commands[0].count === 1) {
      console.log('✅ Only one command created despite duplicate request');
    } else {
      console.log('⚠️  Multiple commands created for duplicate request');
    }
  }
}

// Test 4: Failure Path
async function testFailurePath() {
  console.log('\n🧪 Test 4: Failure Path');
  console.log('=======================');
  console.log('Note: This test requires manual RS-485 disconnection');
  console.log('1. Unplug RS-485 converter');
  console.log('2. Press Enter to continue...');
  
  // Wait for user input (simplified for script)
  await sleep(2000);
  
  const lockerId = 6;
  const url = `${PANEL_URL}/api/lockers/${lockerId}/open`;
  
  console.log(`POST ${url} (with RS-485 disconnected)`);
  
  const response = await makeRequest(url, {
    method: 'POST',
    body: JSON.stringify({
      staff_user: 'test-admin',
      reason: 'Failure path test'
    })
  });
  
  console.log(`Response: ${response.status}`);
  
  if (response.status === 202) {
    console.log('✅ Command enqueued (expected)');
    
    // Wait for failure
    await sleep(5000);
    
    const commands = await queryDatabase(
      'SELECT status, last_error FROM command_queue ORDER BY created_at DESC LIMIT 1'
    );
    
    if (commands.length > 0) {
      const command = commands[0];
      console.log(`Command Status: ${command.status}`);
      
      if (command.status === 'failed' && command.last_error) {
        console.log(`Error Message: ${command.last_error}`);
        console.log('✅ Failed with error_message as expected');
      } else {
        console.log('⚠️  Command did not fail as expected');
      }
    }
  }
  
  console.log('\nNow reconnect RS-485 and test recovery...');
  await sleep(2000);
  
  // Test recovery
  const retryResponse = await makeRequest(url, {
    method: 'POST',
    body: JSON.stringify({
      staff_user: 'test-admin',
      reason: 'Recovery test'
    })
  });
  
  console.log(`Recovery Response: ${retryResponse.status}`);
  
  if (retryResponse.status === 202) {
    await sleep(3000);
    
    const retryCommands = await queryDatabase(
      'SELECT status FROM command_queue ORDER BY created_at DESC LIMIT 1'
    );
    
    if (retryCommands.length > 0 && retryCommands[0].status === 'completed') {
      console.log('✅ Recovery successful after reconnection');
    } else {
      console.log('⚠️  Recovery may have failed');
    }
  }
}

// Database validation queries
async function runDatabaseValidation() {
  console.log('\n📊 Database Validation');
  console.log('======================');
  
  console.log('\n-- Recent Commands --');
  const commands = await queryDatabase(
    'SELECT command_id, status, started_at, completed_at, duration_ms FROM command_queue ORDER BY created_at DESC LIMIT 5'
  );
  
  commands.forEach(cmd => {
    console.log(`${cmd.command_id}: ${cmd.status} (${cmd.duration_ms || 0}ms)`);
  });
  
  console.log('\n-- Recent Events --');
  const events = await queryDatabase(
    'SELECT kiosk_id, locker_id, event_type, details FROM events ORDER BY timestamp DESC LIMIT 5'
  );
  
  events.forEach(evt => {
    console.log(`${evt.kiosk_id}/${evt.locker_id}: ${evt.event_type}`);
  });
}

// Main test runner
async function runSmokeTests() {
  try {
    await testSingleOpen();
    await testBulkOpen();
    await testDuplicateOpen();
    await testFailurePath();
    await runDatabaseValidation();
    
    console.log('\n✅ E2E Smoke Tests Complete');
    console.log('============================');
    console.log('Review the results above for any issues.');
    
  } catch (error) {
    console.error('\n❌ Test Suite Failed:', error);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runSmokeTests();
}

module.exports = {
  testSingleOpen,
  testBulkOpen,
  testDuplicateOpen,
  testFailurePath,
  runDatabaseValidation
};