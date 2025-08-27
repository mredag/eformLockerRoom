#!/usr/bin/env node

/**
 * Test Hardware Communication Reliability
 * Tests the enhanced hardware communication with retry logic and error handling
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

const { ModbusController } = require('../app/kiosk/dist/hardware/modbus-controller');

async function testHardwareReliability() {
  console.log('🔧 Testing Hardware Communication Reliability');
  console.log('=' .repeat(60));

  // Test configuration with enhanced retry settings
  const config = {
    port: '/dev/ttyUSB0',
    baudrate: 9600,
    timeout_ms: 2000,
    pulse_duration_ms: 400,
    burst_duration_seconds: 2,
    burst_interval_ms: 100,
    command_interval_ms: 300,
    max_retries: 3, // Enhanced retry count
    retry_delay_base_ms: 1000,
    retry_delay_max_ms: 5000,
    connection_retry_attempts: 3,
    health_check_interval_ms: 30000,
    test_mode: false // Enable full functionality
  };

  let controller;
  
  try {
    // Initialize controller
    console.log('🔧 Initializing ModbusController with enhanced settings...');
    controller = new ModbusController(config);

    // Setup event listeners for monitoring
    controller.on('hardware_operation_failed', (event) => {
      console.error(`❌ Hardware operation failed:`, event);
    });

    controller.on('hardware_unavailable', (event) => {
      console.error(`❌ Hardware unavailable:`, event);
    });

    controller.on('command_error', (event) => {
      console.warn(`⚠️ Command error:`, event);
    });

    controller.on('operation_failed', (event) => {
      console.error(`❌ Operation failed:`, event);
    });

    controller.on('health_degraded', (event) => {
      console.warn(`⚠️ Health degraded:`, event);
    });

    controller.on('connected', () => {
      console.log('✅ Hardware connected');
    });

    controller.on('reconnected', () => {
      console.log('✅ Hardware reconnected');
    });

    controller.on('reconnection_failed', () => {
      console.error('❌ Hardware reconnection failed');
    });

    // Initialize connection
    await controller.initialize();
    console.log('✅ ModbusController initialized successfully');

    // Test 1: Hardware availability check
    console.log('\n📋 Test 1: Hardware Availability Check');
    console.log('-'.repeat(40));
    
    const isAvailable = controller.isHardwareAvailable();
    console.log(`Hardware Available: ${isAvailable ? '✅ Yes' : '❌ No'}`);
    
    const hardwareStatus = controller.getHardwareStatus();
    console.log('Hardware Status:', JSON.stringify(hardwareStatus, null, 2));

    if (!isAvailable) {
      console.log('⚠️ Hardware not available, some tests may fail');
    }

    // Test 2: Single locker operation with retry logic
    console.log('\n📋 Test 2: Single Locker Operation (Enhanced Retry)');
    console.log('-'.repeat(40));
    
    const testLocker = 5;
    console.log(`Testing locker ${testLocker} with enhanced retry logic...`);
    
    const startTime = Date.now();
    const success = await controller.openLocker(testLocker);
    const duration = Date.now() - startTime;
    
    console.log(`Result: ${success ? '✅ Success' : '❌ Failed'} (${duration}ms)`);
    
    // Get updated hardware status
    const statusAfterTest = controller.getHardwareStatus();
    console.log(`Error Rate: ${statusAfterTest.diagnostics.errorRate.toFixed(2)}%`);
    console.log(`Total Commands: ${statusAfterTest.health.total_commands}`);
    console.log(`Failed Commands: ${statusAfterTest.health.failed_commands}`);

    // Test 3: Multiple locker operations
    console.log('\n📋 Test 3: Multiple Locker Operations');
    console.log('-'.repeat(40));
    
    const testLockers = [1, 3, 7, 10];
    let successCount = 0;
    
    for (const lockerId of testLockers) {
      console.log(`Testing locker ${lockerId}...`);
      
      const operationStart = Date.now();
      const operationSuccess = await controller.openLocker(lockerId);
      const operationDuration = Date.now() - operationStart;
      
      if (operationSuccess) {
        successCount++;
        console.log(`  ✅ Success (${operationDuration}ms)`);
      } else {
        console.log(`  ❌ Failed (${operationDuration}ms)`);
      }
      
      // Wait between operations
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`\nMultiple Operations Result: ${successCount}/${testLockers.length} successful`);

    // Test 4: Health monitoring
    console.log('\n📋 Test 4: Health Monitoring');
    console.log('-'.repeat(40));
    
    const finalHealth = controller.getHealth();
    console.log('Final Health Status:');
    console.log(`  Status: ${finalHealth.status}`);
    console.log(`  Total Commands: ${finalHealth.total_commands}`);
    console.log(`  Failed Commands: ${finalHealth.failed_commands}`);
    console.log(`  Error Rate: ${finalHealth.error_rate_percent.toFixed(2)}%`);
    console.log(`  Connection Errors: ${finalHealth.connection_errors}`);
    console.log(`  Retry Attempts: ${finalHealth.retry_attempts}`);
    console.log(`  Uptime: ${finalHealth.uptime_seconds}s`);

    // Test 5: Relay status tracking
    console.log('\n📋 Test 5: Relay Status Tracking');
    console.log('-'.repeat(40));
    
    const relayStatuses = controller.getAllRelayStatuses();
    console.log(`Tracked Relays: ${relayStatuses.length}`);
    
    relayStatuses.forEach(status => {
      console.log(`  Relay ${status.channel}: ${status.total_operations} ops, ${status.failure_count} failures`);
    });

    // Test 6: Error simulation (if hardware is available)
    if (isAvailable) {
      console.log('\n📋 Test 6: Error Recovery Testing');
      console.log('-'.repeat(40));
      
      // Try to open a non-existent locker to test error handling
      console.log('Testing error handling with invalid locker...');
      const errorTest = await controller.openLocker(999); // Invalid locker
      console.log(`Invalid locker test: ${errorTest ? '⚠️ Unexpected success' : '✅ Properly failed'}`);
    }

    console.log('\n🎯 Hardware Reliability Test Summary');
    console.log('=' .repeat(60));
    console.log(`✅ Hardware communication reliability testing completed`);
    console.log(`📊 Final error rate: ${controller.getHealth().error_rate_percent.toFixed(2)}%`);
    console.log(`🔧 Hardware available: ${controller.isHardwareAvailable() ? 'Yes' : 'No'}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    // Cleanup
    if (controller) {
      try {
        await controller.close();
        console.log('✅ Hardware controller closed');
      } catch (closeError) {
        console.error('⚠️ Error closing controller:', closeError.message);
      }
    }
  }
}

// Run the test
if (require.main === module) {
  testHardwareReliability()
    .then(() => {
      console.log('✅ All tests completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { testHardwareReliability };