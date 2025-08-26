#!/usr/bin/env node

/**
 * Basic Serial Port Test
 * Tests if we can open and communicate with the serial device
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

console.log('🔧 Basic Serial Port Test');
console.log('=========================');

const modbusPort = process.env.MODBUS_PORT || '/dev/ttyUSB0';
console.log(`📋 Testing device: ${modbusPort}`);

// Check if device exists
if (!fs.existsSync(modbusPort)) {
  console.log(`❌ Error: Device not found at ${modbusPort}`);
  process.exit(1);
}

console.log('✅ Device found');

// Try to use Node.js serialport library if available
try {
  const { SerialPort } = require('serialport');
  
  console.log('🔌 Opening serial port...');
  
  const port = new SerialPort({
    path: modbusPort,
    baudRate: parseInt(process.env.MODBUS_BAUD || '9600'),
    parity: process.env.MODBUS_PARITY || 'none',
    dataBits: 8,
    stopBits: 1
  });

  port.on('open', () => {
    console.log('✅ Serial port opened successfully');
    
    // Try to write some test data (Modbus read coils command)
    const testCommand = Buffer.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x08, 0x3D, 0xCC]);
    
    console.log('📤 Sending test Modbus command...');
    port.write(testCommand, (err) => {
      if (err) {
        console.log('❌ Write error:', err.message);
      } else {
        console.log('✅ Test command sent successfully');
      }
      
      setTimeout(() => {
        port.close();
        console.log('🎉 Serial port test completed');
      }, 1000);
    });
  });

  port.on('error', (err) => {
    console.log('❌ Serial port error:', err.message);
    console.log('');
    console.log('Common solutions:');
    console.log('- Check device permissions: sudo chmod 666 ' + modbusPort);
    console.log('- Add user to dialout group: sudo usermod -a -G dialout pi');
    console.log('- Try different baud rate: 19200, 38400');
    process.exit(1);
  });

  port.on('data', (data) => {
    console.log('📥 Received data:', data.toString('hex'));
  });

} catch (err) {
  console.log('❌ SerialPort library not available:', err.message);
  console.log('');
  console.log('Installing serialport library...');
  console.log('Run: npm install serialport');
  
  // Fallback: basic file descriptor test
  console.log('');
  console.log('🔧 Trying basic file access test...');
  
  try {
    const fd = fs.openSync(modbusPort, 'r+');
    console.log('✅ Can open device for read/write');
    fs.closeSync(fd);
    console.log('✅ Basic serial access test passed');
  } catch (err) {
    console.log('❌ Cannot access device:', err.message);
    console.log('');
    console.log('Fix permissions:');
    console.log(`  sudo chmod 666 ${modbusPort}`);
    console.log('  sudo usermod -a -G dialout pi');
    process.exit(1);
  }
}