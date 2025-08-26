#!/usr/bin/env node

/**
 * Test Relay 10 Control (Coil Address 9)
 * Tests if relay 10 works better than relay 1
 */

const { SerialPort } = require('serialport');

// CRC16 calculation for Modbus RTU
function calculateCRC16(data) {
  let crc = 0xFFFF;
  
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  
  return crc;
}

function buildCommand(slaveAddr, func, coilAddr, value) {
  const cmd = Buffer.alloc(8);
  cmd[0] = slaveAddr;
  cmd[1] = func;
  cmd[2] = (coilAddr >> 8) & 0xFF;  // Coil address high
  cmd[3] = coilAddr & 0xFF;         // Coil address low
  cmd[4] = (value >> 8) & 0xFF;     // Value high
  cmd[5] = value & 0xFF;            // Value low
  
  const crc = calculateCRC16(cmd.slice(0, 6));
  cmd[6] = crc & 0xFF;              // CRC low
  cmd[7] = (crc >> 8) & 0xFF;       // CRC high
  
  return cmd;
}

async function testRelay10Control() {
  console.log('🔧 Testing relay 10 control (coil address 9)...');
  
  let port;
  try {
    // Open serial port
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

    // Test relay 10 (coil address 9)
    const coilAddress = 9; // Relay 10 = coil 9 (0-based)
    
    console.log('\n🔓 Test 1: Turn ON relay 10');
    const turnOnCommand = buildCommand(0x01, 0x05, coilAddress, 0xFF00);
    console.log(`📡 ON Command: ${turnOnCommand.toString('hex').toUpperCase()}`);
    
    port.write(turnOnCommand);
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('🔊 Did you hear relay 10 click ON? (Check LED indicator)');

    console.log('\n🔒 Test 2: Turn OFF relay 10');
    const turnOffCommand = buildCommand(0x01, 0x05, coilAddress, 0x0000);
    console.log(`📡 OFF Command: ${turnOffCommand.toString('hex').toUpperCase()}`);
    
    port.write(turnOffCommand);
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('🔊 Did you hear relay 10 click OFF?');

    console.log('\n⏱️  Test 3: Pulse test (ON -> wait -> OFF)');
    console.log('🔓 Turning ON...');
    port.write(turnOnCommand);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('🔒 Turning OFF...');
    port.write(turnOffCommand);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('🔊 Did you hear TWO clicks (ON then OFF)?');

    // Test other relays in range 9-16
    console.log('\n🔄 Testing other relays (11-16)...');
    for (let relay = 11; relay <= 16; relay++) {
      const coil = relay - 1; // Convert to 0-based
      console.log(`\n🔧 Testing relay ${relay} (coil ${coil})`);
      
      const onCmd = buildCommand(0x01, 0x05, coil, 0xFF00);
      console.log(`📡 ON: ${onCmd.toString('hex').toUpperCase()}`);
      port.write(onCmd);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const offCmd = buildCommand(0x01, 0x05, coil, 0x0000);
      console.log(`📡 OFF: ${offCmd.toString('hex').toUpperCase()}`);
      port.write(offCmd);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log(`🔊 Did relay ${relay} click ON then OFF?`);
    }

    console.log('\n✅ Relay 10-16 test complete');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (port && port.isOpen) {
      port.close();
      console.log('📡 Serial port closed');
    }
  }
}

// Run test
testRelay10Control().catch(console.error);