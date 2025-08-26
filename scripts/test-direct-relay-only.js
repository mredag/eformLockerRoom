#!/usr/bin/env node

/**
 * Test Direct Relay Only (No Authentication)
 * Tests if the direct relay functionality works when Kiosk is not running
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function testDirectRelayOnly() {
  console.log("🔌 Testing Direct Relay Functionality (No Auth)");
  console.log("=".repeat(50));

  const PANEL_URL = 'http://localhost:3001';
  const TEST_LOCKER_ID = 1;

  // First check if Kiosk is running
  console.log("🔍 Step 1: Check if Kiosk service is running");
  console.log("-".repeat(30));
  
  try {
    const kioskCmd = `curl -s http://localhost:3002/health --connect-timeout 2`;
    await execAsync(kioskCmd);
    console.log("   ⚠️  Kiosk service IS running - direct relay may be blocked");
    console.log("   💡 Stop Kiosk service to test direct relay: pkill -f 'node.*kiosk'");
  } catch (error) {
    console.log("   ✅ Kiosk service NOT running - direct relay should work");
  }

  // Test relay connection first
  console.log("\n🔧 Step 2: Test relay connection");
  console.log("-".repeat(30));
  
  try {
    console.log("   Testing relay connection...");
    const testCmd = `curl -s -X POST ${PANEL_URL}/api/relay/test \\
      -H "Content-Type: application/json" \\
      -d '{"test_type": "connection"}' \\
      --connect-timeout 5`;
    
    const { stdout } = await execAsync(testCmd);
    const response = JSON.parse(stdout);
    
    if (response.success) {
      console.log("   ✅ Relay connection: SUCCESS");
      console.log(`   📊 Message: ${response.message}`);
    } else {
      console.log("   ❌ Relay connection: FAILED");
      console.log(`   📊 Message: ${response.message}`);
      console.log("   💡 This means direct relay won't work - hardware issue or port conflict");
    }
  } catch (error) {
    console.log("   ❌ Relay connection test failed");
    console.log(`   📊 Error: ${error.message}`);
  }

  // Test single relay activation
  console.log("\n🎯 Step 3: Test single relay activation");
  console.log("-".repeat(30));
  
  try {
    console.log(`   Activating relay ${TEST_LOCKER_ID}...`);
    const activateCmd = `curl -s -X POST ${PANEL_URL}/api/relay/activate \\
      -H "Content-Type: application/json" \\
      -d '{"relay_number": ${TEST_LOCKER_ID}, "staff_user": "test-script", "reason": "Direct relay test"}' \\
      --connect-timeout 10`;
    
    const { stdout } = await execAsync(activateCmd);
    const response = JSON.parse(stdout);
    
    if (response.success) {
      console.log("   ✅ Relay activation: SUCCESS");
      console.log(`   📊 Locker ${TEST_LOCKER_ID} activated successfully`);
      console.log(`   ⏱️  Timestamp: ${response.timestamp}`);
    } else {
      console.log("   ❌ Relay activation: FAILED");
      console.log(`   📊 Error: ${response.error}`);
      if (response.suggestion) {
        console.log(`   💡 Suggestion: ${response.suggestion}`);
      }
    }
  } catch (error) {
    console.log("   ❌ Relay activation failed");
    console.log(`   📊 Error: ${error.message}`);
  }

  // Check relay service status
  console.log("\n📊 Step 4: Check relay service status");
  console.log("-".repeat(30));
  
  try {
    const statusCmd = `curl -s ${PANEL_URL}/api/relay/status --connect-timeout 3`;
    const { stdout } = await execAsync(statusCmd);
    const response = JSON.parse(stdout);
    
    if (response.success) {
      console.log("   ✅ Relay service status: OK");
      console.log(`   📊 Connected: ${response.status.connected}`);
      console.log(`   📊 Port: ${response.status.config.port}`);
      console.log(`   📊 Baud Rate: ${response.status.config.baudRate}`);
    } else {
      console.log("   ❌ Relay service status: ERROR");
      console.log(`   📊 Error: ${response.error}`);
    }
  } catch (error) {
    console.log("   ❌ Status check failed");
    console.log(`   📊 Error: ${error.message}`);
  }

  // Summary
  console.log("\n📋 Test Summary");
  console.log("=".repeat(50));
  console.log("🎯 This test checks if direct relay works when Kiosk is not running");
  console.log("✅ If connection and activation succeed: Direct relay is working!");
  console.log("❌ If they fail: Check hardware connections or port conflicts");
  console.log("\n💡 Next steps:");
  console.log("   - If direct relay works: Your Panel → Hardware path is good");
  console.log("   - Start Kiosk service and test queue-based activation");
  console.log("   - Use Panel UI at http://localhost:3001/relay for manual testing");
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

// Run the test
testDirectRelayOnly().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});