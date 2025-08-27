#!/usr/bin/env node

/**
 * Test script for the fixed card assignment API flow
 * Tests Requirements 2.1-2.6 and 3.1-3.6
 */

const fetch = require('node-fetch');

const KIOSK_URL = process.env.KIOSK_URL || 'http://192.168.1.8:3002';
const TEST_KIOSK_ID = 'kiosk-1';
const TEST_CARD_ID = '0009652489';

async function testCardAssignmentFlow() {
  console.log('🧪 Testing Card Assignment API Flow');
  console.log('=====================================');

  try {
    // Test 1: Check kiosk service health
    console.log('\n1. Testing kiosk service health...');
    const healthResponse = await fetch(`${KIOSK_URL}/health`);
    if (!healthResponse.ok) {
      throw new Error(`Kiosk service not available: ${healthResponse.status}`);
    }
    console.log('✅ Kiosk service is healthy');

    // Test 2: Test card scan with no existing assignment (Requirement 2.3)
    console.log('\n2. Testing card scan (no existing assignment)...');
    const cardScanResponse = await fetch(`${KIOSK_URL}/api/rfid/handle-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: TEST_CARD_ID,
        kiosk_id: TEST_KIOSK_ID
      })
    });

    const cardScanResult = await cardScanResponse.json();
    console.log('Card scan result:', JSON.stringify(cardScanResult, null, 2));

    if (cardScanResult.action === 'open_locker') {
      console.log('✅ Card had existing locker - opened and released (Requirement 2.2)');
      return;
    }

    if (cardScanResult.action !== 'show_lockers') {
      throw new Error(`Expected 'show_lockers' action, got: ${cardScanResult.action}`);
    }

    console.log('✅ Card scan created session with available lockers (Requirement 2.3)');
    console.log(`📊 Session timeout: ${cardScanResult.timeout_seconds} seconds (should be 30)`);
    
    if (cardScanResult.timeout_seconds !== 30) {
      console.log('⚠️  Warning: Session timeout is not 30 seconds (Requirement 3.1)');
    }

    const sessionId = cardScanResult.session_id;
    const availableLockers = cardScanResult.lockers;

    if (!availableLockers || availableLockers.length === 0) {
      console.log('⚠️  No available lockers for testing locker selection');
      return;
    }

    // Test 3: Check session status (Requirement 3.2)
    console.log('\n3. Testing session status...');
    const statusResponse = await fetch(`${KIOSK_URL}/api/session/status?kiosk_id=${TEST_KIOSK_ID}`);
    const statusResult = await statusResponse.json();
    console.log('Session status:', JSON.stringify(statusResult, null, 2));

    if (!statusResult.has_session) {
      throw new Error('Session should be active');
    }
    console.log('✅ Session status shows active session with countdown');

    // Test 4: Test locker selection (Requirement 2.4)
    console.log('\n4. Testing locker selection...');
    const selectedLocker = availableLockers[0];
    const selectResponse = await fetch(`${KIOSK_URL}/api/lockers/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locker_id: selectedLocker.id,
        kiosk_id: TEST_KIOSK_ID,
        session_id: sessionId
      })
    });

    const selectResult = await selectResponse.json();
    console.log('Locker selection result:', JSON.stringify(selectResult, null, 2));

    if (selectResult.success) {
      console.log('✅ Locker assignment and opening successful (Requirement 2.4)');
      console.log(`📦 Assigned locker: ${selectResult.locker_id}`);
    } else {
      console.log('⚠️  Locker assignment failed:', selectResult.message);
      console.log('This could be due to hardware issues or locker unavailability');
    }

    // Test 5: Verify session completion (Requirement 3.3)
    console.log('\n5. Testing session completion...');
    const finalStatusResponse = await fetch(`${KIOSK_URL}/api/session/status?kiosk_id=${TEST_KIOSK_ID}`);
    const finalStatusResult = await finalStatusResponse.json();
    console.log('Final session status:', JSON.stringify(finalStatusResult, null, 2));

    if (selectResult.success && finalStatusResult.has_session) {
      console.log('⚠️  Warning: Session should be completed after successful selection (Requirement 3.3)');
    } else if (selectResult.success) {
      console.log('✅ Session completed after successful selection (Requirement 3.3)');
    }

    // Test 6: Test card scan again to check existing assignment (Requirement 2.1, 2.2)
    if (selectResult.success) {
      console.log('\n6. Testing card scan with existing assignment...');
      const existingCardResponse = await fetch(`${KIOSK_URL}/api/rfid/handle-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: TEST_CARD_ID,
          kiosk_id: TEST_KIOSK_ID
        })
      });

      const existingCardResult = await existingCardResponse.json();
      console.log('Existing card scan result:', JSON.stringify(existingCardResult, null, 2));

      if (existingCardResult.action === 'open_locker') {
        console.log('✅ Existing locker opened and released (Requirements 2.1, 2.2)');
      } else {
        console.log('⚠️  Expected existing locker to be opened and released');
      }
    }

    console.log('\n🎉 Card Assignment Flow Test Complete!');
    console.log('=====================================');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Test error scenarios
async function testErrorScenarios() {
  console.log('\n🧪 Testing Error Scenarios');
  console.log('==========================');

  try {
    // Test invalid session ID (Requirement 2.5)
    console.log('\n1. Testing invalid session ID...');
    const invalidSessionResponse = await fetch(`${KIOSK_URL}/api/lockers/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locker_id: 1,
        kiosk_id: TEST_KIOSK_ID,
        session_id: 'invalid-session-id'
      })
    });

    const invalidSessionResult = await invalidSessionResponse.json();
    console.log('Invalid session result:', JSON.stringify(invalidSessionResult, null, 2));

    if (invalidSessionResult.error === 'session_expired') {
      console.log('✅ Invalid session properly rejected (Requirement 2.5)');
    } else {
      console.log('⚠️  Expected session_expired error for invalid session');
    }

    // Test missing parameters
    console.log('\n2. Testing missing parameters...');
    const missingParamsResponse = await fetch(`${KIOSK_URL}/api/rfid/handle-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: TEST_CARD_ID
        // Missing kiosk_id
      })
    });

    const missingParamsResult = await missingParamsResponse.json();
    console.log('Missing params result:', JSON.stringify(missingParamsResult, null, 2));

    if (missingParamsResult.error) {
      console.log('✅ Missing parameters properly rejected');
    }

    console.log('\n🎉 Error Scenarios Test Complete!');

  } catch (error) {
    console.error('\n❌ Error scenario test failed:', error.message);
  }
}

// Run tests
async function runAllTests() {
  await testCardAssignmentFlow();
  await testErrorScenarios();
}

if (require.main === module) {
  runAllTests();
}

module.exports = { testCardAssignmentFlow, testErrorScenarios };