#!/usr/bin/env node

/**
 * Serial Port Resolution Utility
 * Resolves /dev/ttyUSB0 to /dev/serial/by-id for replug survival
 */

const fs = require('fs');
const path = require('path');

async function resolveSerialPort(defaultPort = '/dev/ttyUSB0') {
  console.log('🔍 Resolving Serial Port');
  console.log('========================');
  
  // Check if we're on Linux with /dev/serial/by-id
  const byIdPath = '/dev/serial/by-id';
  
  if (!fs.existsSync(byIdPath)) {
    console.log(`${byIdPath} not found, using default: ${defaultPort}`);
    return defaultPort;
  }
  
  try {
    const devices = fs.readdirSync(byIdPath);
    console.log(`Found ${devices.length} serial devices by ID:`);
    
    for (const device of devices) {
      const fullPath = path.join(byIdPath, device);
      const realPath = fs.readlinkSync(fullPath);
      const resolvedPath = path.resolve(byIdPath, realPath);
      
      console.log(`  ${device} -> ${resolvedPath}`);
      
      // Look for USB-to-RS485 converters (common patterns)
      if (device.includes('USB') && 
          (device.includes('RS485') || 
           device.includes('FTDI') || 
           device.includes('CH340') ||
           device.includes('CP210'))) {
        console.log(`✅ Found RS-485 converter: ${fullPath}`);
        return fullPath;
      }
    }
    
    // If no specific RS-485 device found, use the first USB serial device
    const usbDevices = devices.filter(d => d.includes('USB'));
    if (usbDevices.length > 0) {
      const selectedDevice = path.join(byIdPath, usbDevices[0]);
      console.log(`⚠️  Using first USB device: ${selectedDevice}`);
      return selectedDevice;
    }
    
  } catch (error) {
    console.error('Error reading serial devices:', error.message);
  }
  
  console.log(`⚠️  No suitable device found, using default: ${defaultPort}`);
  return defaultPort;
}

// Export for use in other modules
module.exports = { resolveSerialPort };

// Run if called directly
if (require.main === module) {
  resolveSerialPort().then(port => {
    console.log(`\n🔧 Recommended MODBUS_PORT: ${port}`);
    console.log('\nTo use this in your environment:');
    console.log(`export MODBUS_PORT="${port}"`);
  });
}