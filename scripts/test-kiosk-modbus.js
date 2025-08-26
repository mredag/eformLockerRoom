#!/usr/bin/env node

/**
 * Test Kiosk ModbusController Integration
 * Tests the exact same way the Kiosk service uses ModbusController
 */

console.log('🔧 Kiosk ModbusController Test');
console.log('==============================');

// Set up environment like the Kiosk service
process.env.MODBUS_PORT = process.env.MODBUS_PORT || '/dev/serial/by-id/usb-1a86_USB_Serial-if00-port0';
process.env.MODBUS_BAUDRATE = process.env.MODBUS_BAUDRATE || '9600';

console.log(`📋 Configuration:`);
console.log(`   Port: ${process.env.MODBUS_PORT}`);
console.log(`   Baud Rate: ${process.env.MODBUS_BAUDRATE}`);
console.log('');

async function testKioskModbus() {
  try {
    // Import ModbusController the same way Kiosk does
    const { ModbusController } = require('../app/kiosk/dist/index.js');
    
    // Create config exactly like Kiosk service
    const modbusConfig = {
      port: process.env.MODBUS_PORT || "/dev/ttyUSB0",
      baudrate: parseInt(process.env.MODBUS_BAUDRATE || "9600"),
      timeout_ms: 1000,
      pulse_duration_ms: 500,
      burst_duration_seconds: 2,
      burst_interval_ms: 100,
      command_interval_ms: 50,
      max_retries: 3,
      retry_delay_base_ms: 100,
      retry_delay_max_ms: 1000,
      connection_retry_attempts: 5,
      health_check_interval_ms: 30000,
      test_mode: false,
      use_multiple_coils: true,
      verify_writes: true,
    };

    console.log('🔌 Creating ModbusController...');
    const modbusController = new ModbusController(modbusConfig);
    
    console.log('✅ ModbusController created');
    
    // Test opening locker 4 (same as admin panel command)
    console.log('🧪 Testing locker 4 opening...');
    
    const success = await modbusController.openLocker(4);
    
    if (success) {
      console.log('🎉 SUCCESS! Locker 4 opened successfully');
      console.log('✅ Hardware integration is working');
    } else {
      console.log('❌ FAILED! Locker 4 opening failed');
      console.log('This matches the service error');
    }
    
  } catch (error) {
    console.error('❌ Error testing ModbusController:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.message.includes('ModbusController is not a constructor')) {
      console.log('');
      console.log('💡 Build issue detected. Try:');
      console.log('   npm run build');
    } else if (error.message.includes('ENOENT') || error.message.includes('No such file')) {
      console.log('');
      console.log('💡 Port access issue detected. Try:');
      console.log('   sudo chmod 666 /dev/ttyUSB0');
      console.log('   sudo usermod -a -G dialout pi');
    } else if (error.message.includes('EBUSY') || error.message.includes('Resource busy')) {
      console.log('');
      console.log('💡 Port busy issue detected. Try:');
      console.log('   sudo fuser -k /dev/ttyUSB0');
      console.log('   # Stop other services using the port');
    }
  }
}

testKioskModbus();