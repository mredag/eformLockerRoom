#!/usr/bin/env node

/**
 * Test Relay Activation Script
 * Tests individual relay activation using proper ModbusController interface
 */

const { ModbusController } = require("../app/kiosk/dist/index.js");

async function testRelayActivation() {
  console.log("🔧 Testing Individual Relay Activation");
  console.log("=".repeat(50));

  // Create controller with proper configuration
  const controller = new ModbusController({
    port: "/dev/ttyUSB0",
    baudrate: 9600,
    timeout_ms: 2000,
    pulse_duration_ms: 400,
    burst_duration_seconds: 10,
    burst_interval_ms: 2000,
    command_interval_ms: 300,
    use_multiple_coils: true,
    verify_writes: false,
    max_retries: 2,
    test_mode: true, // Important: Enable test mode to avoid queue processor
  });

  try {
    console.log("📡 Initializing Modbus connection...");
    await controller.initialize();
    console.log("✅ Connection established successfully");

    // Test relay 1 on slave address 1
    console.log("\n🔌 Testing Relay 1 (3 second activation)...");
    const result = await controller.openLocker(1, 1);

    if (result) {
      console.log("✅ Relay activation successful!");
      console.log("   - Relay 1 was activated for 400ms pulse");
      console.log("   - Command completed without errors");
    } else {
      console.log("❌ Relay activation failed");
      console.log("   - Check hardware connections");
      console.log("   - Verify relay card address settings");
    }

    // Test multiple relays
    console.log("\n🔌 Testing Multiple Relays (1-3)...");
    for (let relay = 1; relay <= 3; relay++) {
      console.log(`   Testing relay ${relay}...`);
      const success = await controller.openLocker(relay, 1);
      console.log(
        `   ${success ? "✅" : "❌"} Relay ${relay}: ${
          success ? "SUCCESS" : "FAILED"
        }`
      );

      // Wait between tests
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Get health status
    console.log("\n📊 Controller Health Status:");
    const health = controller.getHealth();
    console.log(`   Status: ${health.status}`);
    console.log(`   Total Commands: ${health.total_commands}`);
    console.log(`   Failed Commands: ${health.failed_commands}`);
    console.log(`   Error Rate: ${health.error_rate_percent.toFixed(2)}%`);
  } catch (error) {
    console.error("❌ Test failed:", error.message);

    if (error.message.includes("timeout")) {
      console.log("\n🔍 Timeout Troubleshooting:");
      console.log("   - Check RS485 wiring (A+, B-, GND)");
      console.log("   - Verify relay card power (12V)");
      console.log("   - Confirm DIP switch addresses");
      console.log("   - Try different USB-RS485 converter");
    }

    if (error.message.includes("port")) {
      console.log("\n🔍 Port Troubleshooting:");
      console.log("   - Check USB connection");
      console.log("   - Verify /dev/ttyUSB0 exists");
      console.log("   - Check port permissions");
      console.log("   - Try: sudo chmod 666 /dev/ttyUSB0");
    }
  } finally {
    console.log("\n🔌 Closing connection...");
    await controller.close();
    console.log("✅ Connection closed");
  }
}

// Handle errors gracefully
process.on("unhandledRejection", (error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});

// Run the test
testRelayActivation().catch((error) => {
  console.error("Test execution failed:", error);
  process.exit(1);
});
