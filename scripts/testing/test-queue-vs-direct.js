#!/usr/bin/env node

/**
 * Test Queue vs Direct Relay Activation
 * Compares queue-based locker opening vs direct relay activation
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

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
    const curlCmd = `curl -s -X POST ${PANEL_URL}/api/relay/activate \\
      -H "Content-Type: application/json" \\
      -d '{"relay_number": ${TEST_LOCKER_ID}, "staff_user": "test-admin", "reason": "Testing direct relay"}' \\
      --connect-timeout 5`;
    
    const { stdout, stderr } = await execAsync(curlCmd);
    
    if (stderr) {
      console.log("   ❌ Direct activation: ERROR");
      console.log(`   📊 Error: ${stderr}`);
    } else {
      const response = JSON.parse(stdout);
      if (response.success) {
        console.log("   ✅ Direct activation: SUCCESS");
        console.log(`   📊 Response: ${JSON.stringify(response, null, 2)}`);
      } else {
        console.log("   ❌ Direct activation: FAILED");
        console.log(`   📊 Response: ${JSON.stringify(response, null, 2)}`);
      }
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
    const curlCmd = `curl -s -X POST ${GATEWAY_URL}/api/admin/lockers/${TEST_LOCKER_ID}/open \\
      -H "Content-Type: application/json" \\
      -d '{"staff_user": "test-admin", "reason": "Testing queue system after ModbusController fix"}' \\
      --connect-timeout 10`;
    
    const { stdout, stderr } = await execAsync(curlCmd);
    
    if (stderr) {
      console.log("   ❌ Queue-based activation: ERROR");
      console.log(`   📊 Error: ${stderr}`);
    } else {
      const response = JSON.parse(stdout);
      if (response.success) {
        console.log("   ✅ Queue-based activation: SUCCESS");
        console.log(`   📊 Response: ${JSON.stringify(response, null, 2)}`);
      } else {
        console.log("   ❌ Queue-based activation: FAILED");
        console.log(`   📊 Response: ${JSON.stringify(response, null, 2)}`);
      }
    }
  } catch (error) {
    console.log("   ❌ Queue-based activation: ERROR");
    console.log(`   📊 Error: ${error.message}`);
  }

  // Test 3: Check Services Status
  console.log("\n🎯 Test 3: Services Health Check");
  console.log("-".repeat(40));
  
  try {
    console.log("   Checking Panel service...");
    const panelCmd = `curl -s ${PANEL_URL}/health --connect-timeout 3`;
    const { stdout: panelHealth } = await execAsync(panelCmd);
    console.log(`   📊 Panel: ${panelHealth}`);
    
    console.log("   Checking Gateway service...");
    const gatewayCmd = `curl -s ${GATEWAY_URL}/health --connect-timeout 3`;
    const { stdout: gatewayHealth } = await execAsync(gatewayCmd);
    console.log(`   📊 Gateway: ${gatewayHealth}`);
    
    console.log("   Checking Kiosk service...");
    const kioskCmd = `curl -s http://localhost:3002/health --connect-timeout 3`;
    const { stdout: kioskHealth } = await execAsync(kioskCmd);
    console.log(`   📊 Kiosk: ${kioskHealth}`);
    
  } catch (error) {
    console.log("   ❌ Health check error:");
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