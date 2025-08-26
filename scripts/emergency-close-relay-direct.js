#!/usr/bin/env node

/**
 * Emergency Direct Relay Close Script
 * Bypasses all software layers and directly closes relay via Modbus
 */

const { SerialPort } = require('serialport');

async function emergencyCloseRelay() {
  console.log('🚨 EMERGENCY: Direct relay close starting...');
  
  let port;
  try {
    // Open serial port directly
    port = new SerialPort({
      path: '/dev/ttyUSB0',
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    });

    await new Promise((resolve, reject) => {
      port.on('open', resolve);
      port.on('error', reject);
    });

    console.log('✅ Serial port opened');

    // Direct Modbus command to close relay 1 (turn OFF)
    // Command: 01 05 00 00 00 00 8C 0A
    // 01 = Slave address
    // 05 = Write single coil
    // 00 00 = Coil address (relay 1)
    // 00 00 = Value (OFF)
    // 8C 0A = CRC
    const closeCommand = Buffer.from([0x01, 0x05, 0x00, 0x00, 0x00, 0x00, 0x8C, 0x0A]);
    
    console.log('🔒 Sending direct close command to relay 1...');
    port.write(closeCommand);
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('✅ EMERGENCY CLOSE COMPLETE - Relay 1 should be OFF');
    console.log('🔊 Listen for click - relay should close now');
    
  } catch (error) {
    console.error('❌ Emergency close failed:', error);
  } finally {
    if (port && port.isOpen) {
      port.close();
      console.log('📡 Serial port closed');
    }
  }
}

// Run emergency close
emergencyCloseRelay().catch(console.error);