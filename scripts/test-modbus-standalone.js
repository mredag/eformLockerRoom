#!/usr/bin/env node

/**
 * Standalone ModbusController Test Script
 * Tests relay activation using require() from bundled kiosk
 */

const path = require('path');

// Set up minimal environment
process.env.NODE_ENV = 'test';
process.env.EFORM_DB_PATH = path.join(process.cwd(), 'data', 'eform.db');

async function testModbusStandalone() {
  console.log('🔧 Standalone ModbusController Test');
  console.log('=' .repeat(50));
  
  try {
    // Import the entire bundled kiosk module
    console.log('📦 Loading bundled kiosk module...');
    
    // We'll extract ModbusController from the bundled file differently
    // First, let's try to load it and see what's available
    const kioskModule = require('../app/kiosk/dist/index.js');
    
    console.log('Available exports:', Object.keys(kioskModule));
    
    // If ModbusController is not directly exported, we need to access it differently
    // Let's try to create it from the source file directly
    const ModbusController = require('../app/kiosk/src/hardware/modbus-controller.ts').ModbusController;
    
    if (!ModbusController) {
      throw new Error('ModbusController not found in exports');
    }
    
    console.log('✅ ModbusController loaded successfully');
    
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
      console.log('   - Relay should have clicked for 400ms');
      console.log('   - Check if you heard/saw the relay activate');
    } else {
      console.log('❌ Relay 1 activation failed');
    }
    
    // Test multiple relays with delays
    console.log('\n🔌 Testing Multiple Relays (1-3)...');
    for (let relay = 1; relay <= 3; relay++) {
      console.log(`   Testing relay ${relay}...`);
      const success = await controller.openLocker(relay);
      console.log(`   ${success ? '✅' : '❌'} Relay ${relay}: ${success ? 'SUCCESS' : 'FAILED'}`);
      
      // Wait between tests to hear individual clicks
      if (relay < 3) {
        console.log(`   Waiting 2 seconds before next relay...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
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
    
    if (error.message.includes('Cannot find module')) {
      console.log('\n🔍 Module Loading Issue:');
      console.log('   - Make sure you ran: npm run build:kiosk');
      console.log('   - Check if file exists: ls -la app/kiosk/dist/index.js');
      console.log('   - Try: npm run build && npm run build:kiosk');
    }
    
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
testModbusStandalone().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});