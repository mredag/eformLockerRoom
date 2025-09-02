#!/usr/bin/env node

/**
 * Test Hardware Connectivity Fix
 * Tests the new hardware connectivity logic to ensure it doesn't mark hardware as offline
 * during periods of inactivity.
 */

const { ModbusController } = require('./app/kiosk/dist/index.js');

async function testHardwareConnectivity() {
  console.log('🔧 Testing Hardware Connectivity Fix...\n');

  // Test configuration
  const config = {
    port: '/dev/ttyUSB0',
    baudrate: 9600,
    timeout_ms: 5000,
    pulse_duration_ms: 400,
    burst_duration_seconds: 2,
    burst_interval_ms: 100,
    command_interval_ms: 300,
    max_retries: 3,
    retry_delay_base_ms: 1000,
    retry_delay_max_ms: 5000,
    connection_retry_attempts: 3,
    health_check_interval_ms: 10000, // 10 seconds for testing
    test_mode: false
  };

  try {
    console.log('1. Creating ModbusController...');
    const controller = new ModbusController(config);

    console.log('2. Initializing connection...');
    await controller.initialize();
    console.log('✅ Connection initialized successfully');

    console.log('\n3. Testing initial hardware availability...');
    const initialStatus = controller.getHardwareStatus();
    console.log(`   Available: ${initialStatus.available}`);
    console.log(`   Connected: ${initialStatus.connected}`);
    console.log(`   Health Status: ${initialStatus.health.status}`);
    console.log(`   Error Rate: ${initialStatus.health.error_rate_percent}%`);

    console.log('\n4. Testing hardware connectivity test method...');
    const testResult = await controller.testHardwareConnectivity();
    console.log(`   Test Success: ${testResult.success}`);
    console.log(`   Test Message: ${testResult.message}`);

    console.log('\n5. Simulating period of inactivity (30 seconds)...');
    console.log('   (In the old version, this would mark hardware as offline after 10 minutes)');
    
    // Wait 30 seconds to simulate inactivity
    for (let i = 30; i > 0; i--) {
      process.stdout.write(`\r   Waiting: ${i} seconds remaining...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('\r   ✅ Inactivity period completed                    ');

    console.log('\n6. Checking hardware availability after inactivity...');
    const afterInactivityStatus = controller.getHardwareStatus();
    console.log(`   Available: ${afterInactivityStatus.available}`);
    console.log(`   Connected: ${afterInactivityStatus.connected}`);
    console.log(`   Health Status: ${afterInactivityStatus.health.status}`);
    console.log(`   Error Rate: ${afterInactivityStatus.health.error_rate_percent}%`);

    if (afterInactivityStatus.available) {
      console.log('✅ SUCCESS: Hardware remains available after inactivity period');
    } else {
      console.log('❌ FAILURE: Hardware marked as unavailable after inactivity');
    }

    console.log('\n7. Testing actual locker operation...');
    const openResult = await controller.openLocker(5);
    console.log(`   Locker open result: ${openResult}`);

    console.log('\n8. Final hardware status check...');
    const finalStatus = controller.getHardwareStatus();
    console.log(`   Available: ${finalStatus.available}`);
    console.log(`   Connected: ${finalStatus.connected}`);
    console.log(`   Health Status: ${finalStatus.health.status}`);
    console.log(`   Total Commands: ${finalStatus.health.total_commands}`);
    console.log(`   Failed Commands: ${finalStatus.health.failed_commands}`);
    console.log(`   Error Rate: ${finalStatus.health.error_rate_percent}%`);

    console.log('\n9. Closing connection...');
    await controller.close();
    console.log('✅ Connection closed successfully');

    console.log('\n🎉 Hardware connectivity test completed successfully!');
    console.log('The fix should prevent false "HARDWARE_OFFLINE" errors during inactivity periods.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testHardwareConnectivity().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { testHardwareConnectivity };