#!/usr/bin/env node

/**
 * Test Queue vs Direct Relay Activation
 * Compares queue-based locker opening vs direct relay activation
 */

const axios = require('axios');

async function testQueueVsDirect() {
  console.log("🔧 Testing Queue vs Direct Relay Activation");
  console.log("=".repeat(60));

  const PANEL_URL = 'http://localhost:3001';
  const GATEWAY_URL = 'http://localhost:3000';
  const TEST_LOCKER_ID = 1;

  console.log(`📡 Testing locker ${TEST_LOCKER_ID} activation methods`);
  console.log(`   Panel URL: ${PANEL_URL}`);
  console.log(`   Gateway URL: ${GATEWAY_URL}`);

  // Test 1: Direct Relay Activation (Panel)
  console.log("\n🔌 Test 1: Direct Relay Activation (Panel)");
  console.log("-".repeat(40));
  
  try {
    console.log("   Sending direct relay activation request...");
    const directResponse = await axios.post(`${PANEL_URL}/api/relay/activate`, {
      channel: TEST_LOCKER_ID,
      duration: 400
    }, { timeout: 5000 });

    if (directResponse.data.success) {
      console.log("   ✅ Direct activation: SUCCESS");
      console.log(`   📊 Response: ${JSON.stringify(directResponse.data, null, 2)}`);
    } else {
      console.log("   ❌ Direct activation: FAILED");
      console.log(`   📊 Response: ${JSON.stringify(directResponse.data, null, 2)}`);
    }
  } catch (error) {
    console.log("   ❌ Direct activation: ERROR");
    console.log(`   📊 Error: ${error.message}`);
  }

  // Wait between tests
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Queue-based Activation (Gateway -> Kiosk)
  console.log("\n🔄 Test 2: Queue-based Activation (Gateway -> Kiosk)");
  console.log("-".repeat(40));
  
  try {
    console.log("   Sending queue-based locker opening request...");
    const queueResponse = await axios.post(`${GATEWAY_URL}/api/admin/lockers/${TEST_LOCKER_ID}/open`, {
      staff_user: 'test-admin',
      reason: 'Testing queue system after ModbusController fix'
    }, { timeout: 10000 });

    if (queueResponse.data.success) {
      console.log("   ✅ Queue-based activation: SUCCESS");
      console.log(`   📊 Response: ${JSON.stringify(queueResponse.data, null, 2)}`);
    } else {
      console.log("   ❌ Queue-based activation: FAILED");
      console.log(`   📊 Response: ${JSON.stringify(queueResponse.data, null, 2)}`);
    }
  } catch (error) {
    console.log("   ❌ Queue-based activation: ERROR");
    console.log(`   📊 Error: ${error.message}`);
    
    if (error.response) {
      console.log(`   📊 Status: ${error.response.status}`);
      console.log(`   📊 Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }

  // Test 3: Individual Locker Control from Panel
  console.log("\n🎯 Test 3: Individual Locker Control (Panel -> Direct)");
  console.log("-".repeat(40));
  
  try {
    console.log("   Sending individual locker open request...");
    const individualResponse = await axios.post(`${PANEL_URL}/api/lockers/${TEST_LOCKER_ID}/open-direct`, {
      staff_user: 'test-admin',
      reason: 'Testing individual locker control'
    }, { timeout: 5000 });

    if (individualResponse.data.success) {
      console.log("   ✅ Individual locker control: SUCCESS");
      console.log(`   📊 Response: ${JSON.stringify(individualResponse.data, null, 2)}`);
    } else {
      console.log("   ❌ Individual locker control: FAILED");
      console.log(`   📊 Response: ${JSON.stringify(individualResponse.data, null, 2)}`);
    }
  } catch (error) {
    console.log("   ❌ Individual locker control: ERROR");
    console.log(`   📊 Error: ${error.message}`);
  }

  // Summary
  console.log("\n📋 Test Summary");
  console.log("=".repeat(60));
  console.log("✅ If all tests pass, both queue and direct systems work");
  console.log("❌ If queue fails but direct works, check Kiosk ModbusController initialization");
  console.log("🔧 If both fail, check hardware connections and relay card power");
  console.log("\n🔍 Root Cause Analysis:");
  console.log("   - Direct relay works: Panel -> SimpleRelayService -> Hardware");
  console.log("   - Queue system works: Panel -> Gateway -> Kiosk -> ModbusController -> Hardware");
  console.log("   - The fix: Added missing modbusController.initialize() in Kiosk startup");
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

// Run the test
testQueueVsDirect().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});