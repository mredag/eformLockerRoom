#!/usr/bin/env node

/**
 * Simple Modbus Test Script
 * Tests basic Modbus communication with the relay board
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim().replace(/['"]/g, '');
    }
  });
}

console.log('🔧 Simple Modbus Test');
console.log('====================');

// Check environment variables
const modbusPort = process.env.MODBUS_PORT || '/dev/ttyUSB0';
const modbusBaud = parseInt(process.env.MODBUS_BAUD || '9600');
const modbusParity = process.env.MODBUS_PARITY || 'none';

console.log(`📋 Configuration:`);
console.log(`   Port: ${modbusPort}`);
console.log(`   Baud: ${modbusBaud}`);
console.log(`   Parity: ${modbusParity}`);
console.log('');

// Check if device exists
if (!fs.existsSync(modbusPort)) {
  console.log(`❌ Error: Device not found at ${modbusPort}`);
  console.log('');
  console.log('Available devices:');
  try {
    const devices = fs.readdirSync('/dev/serial/by-id/');
    devices.forEach(device => {
      console.log(`   /dev/serial/by-id/${device}`);
    });
  } catch (err) {
    console.log('   No devices found in /dev/serial/by-id/');
  }
  process.exit(1);
}

console.log(`✅ Device found: ${modbusPort}`);

// Check device permissions
try {
  fs.accessSync(modbusPort, fs.constants.R_OK | fs.constants.W_OK);
  console.log('✅ Device permissions OK');
} catch (err) {
  console.log('❌ Device permission error:', err.message);
  console.log('');
  console.log('Try running:');
  console.log(`   sudo chmod 666 ${modbusPort}`);
  console.log('   sudo usermod -a -G dialout pi');
  process.exit(1);
}

// Try to import and test Modbus
try {
  console.log('');
  console.log('🔌 Testing Modbus communication...');
  
  // Import the ModbusController from the bundled kiosk
  const { ModbusController } = require('../app/kiosk/dist/index.js');
  
  const controller = new ModbusController({
    port: modbusPort,
    baudRate: modbusBaud,
    parity: modbusParity
  });

  // Test connection
  controller.connect()
    .then(() => {
      console.log('✅ Modbus connection successful');
      
      // Test writing to a coil (locker 1)
      console.log('🔧 Testing relay activation (locker 1)...');
      return controller.activateRelay(1, 500); // 500ms pulse
    })
    .then(() => {
      console.log('✅ Relay activation command sent');
      console.log('🎉 Modbus test completed successfully!');
      process.exit(0);
    })
    .catch(err => {
      console.log('❌ Modbus test failed:', err.message);
      console.log('');
      console.log('Common issues:');
      console.log('- Wrong baud rate (try 9600, 19200, or 38400)');
      console.log('- Wrong parity setting (try "none", "even", or "odd")');
      console.log('- Device not properly connected');
      console.log('- Wrong device path');
      process.exit(1);
    });

} catch (err) {
  console.log('❌ Error loading Modbus controller:', err.message);
  console.log('');
  console.log('Make sure the project is built:');
  console.log('   npm run build');
  process.exit(1);
}