#!/usr/bin/env node

/**
 * Direct ModbusController Test Script
 * Tests relay activation by importing ModbusController directly from source
 */

const path = require('path');

// Set up environment before any imports
process.env.NODE_ENV = 'test';
process.env.EFORM_DB_PATH = path.join(process.cwd(), 'data', 'eform.db');

async function testModbusController() {
  console.log('🔧 Direct ModbusController Test');
  console.log('=' .repeat(50));
  
  try {
    // Import ModbusController directly from compiled source
    const { ModbusController } = await import('../app/kiosk/src/hardware/modbus-controller.js');
    
    console.log('✅ ModbusController imported successfully');
    
    // Create controller with test configuration
    const controller = new ModbusController({
      port: '/dev/ttyUSB0',
      baudrate: 9600,
      timeout_ms: 2000,
      pulse_duration_ms: 400,
      burst_duration_seconds: 10,
      burst_interval_ms: 2000,
      command_interval_ms: 300,
      use_multiple_coils: true,
      verify_writes: false,
      max_retries: 2,
      test_mode: true
    });

    console.log('📡 Initializing Modbus connection...');
    await controller.initialize();
    console.log('✅ Connection established successfully');
    
    // Test relay 1
    console.log('\n🔌 Testing Relay 1...');
    const result = await controller.openLocker(1);
    
    if (result) {
      console.log('✅ Relay 1 activation successful!');
    } else {
      console.log('❌ Relay 1 activation failed');
    }
    
    // Test multiple relays
    console.log('\n🔌 Testing Multiple Relays (1-3)...');
    for (let relay = 1; relay <= 3; relay++) {
      console.log(`   Testing relay ${relay}...`);
      const success = await controller.openLocker(relay);
      console.log(`   ${success ? '✅' : '❌'} Relay ${relay}: ${success ? 'SUCCESS' : 'FAILED'}`);
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Get health status
    console.log('\n📊 Controller Health Status:');
    const health = controller.getHealth();
    console.log(`   Status: ${health.status}`);
    console.log(`   Total Commands: ${health.total_commands}`);
    console.log(`   Failed Commands: ${health.failed_commands}`);
    console.log(`   Error Rate: ${health.error_rate_percent.toFixed(2)}%`);
    
    console.log('\n🔌 Closing connection...');
    await controller.close();
    console.log('✅ Test completed successfully');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.message.includes('timeout')) {
      console.log('\n🔍 Timeout Troubleshooting:');
      console.log('   - Check RS485 wiring (A+, B-, GND)');
      console.log('   - Verify relay card power (12V)');
      console.log('   - Confirm DIP switch addresses');
      console.log('   - Try different USB-RS485 converter');
    }
    
    if (error.message.includes('port') || error.message.includes('ENOENT')) {
      console.log('\n🔍 Port Troubleshooting:');
      console.log('   - Check USB connection');
      console.log('   - Verify /dev/ttyUSB0 exists: ls -la /dev/ttyUSB*');
      console.log('   - Check port permissions: sudo chmod 666 /dev/ttyUSB0');
      console.log('   - Check if port is in use: sudo lsof /dev/ttyUSB0');
    }
    
    process.exit(1);
  }
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

// Run the test
testModbusController().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});