#!/usr/bin/env node

/**
 * Test Relays 1-8 Control
 * Tests which relays in the first 8 work properly (ON and OFF)
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

async function testRelays1to8() {
  console.log('🔧 Testing relays 1-8 control...');
  console.log('📋 This will identify which relays work properly\n');
  
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

    console.log('✅ Serial port opened\n');

    const workingRelays = [];
    const faultyRelays = [];

    // Test each relay from 1 to 8
    for (let relay = 1; relay <= 8; relay++) {
      const coil = relay - 1; // Convert to 0-based coil address
      console.log(`🔧 Testing relay ${relay} (coil ${coil})`);
      
      // Turn ON
      const onCmd = buildCommand(0x01, 0x05, coil, 0xFF00);
      console.log(`📡 ON:  ${onCmd.toString('hex').toUpperCase()}`);
      port.write(onCmd);
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Turn OFF
      const offCmd = buildCommand(0x01, 0x05, coil, 0x0000);
      console.log(`📡 OFF: ${offCmd.toString('hex').toUpperCase()}`);
      port.write(offCmd);
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log(`🔊 Did relay ${relay} click ON then OFF? (y/n)`);
      console.log('   ✅ = Working relay (both ON and OFF work)');
      console.log('   ❌ = Faulty relay (stuck ON or no response)\n');
    }

    console.log('📊 SUMMARY:');
    console.log('Please note which relays worked properly:');
    console.log('- Relay 1: ✅ Working / ❌ Faulty');
    console.log('- Relay 2: ✅ Working / ❌ Faulty');
    console.log('- Relay 3: ✅ Working / ❌ Faulty');
    console.log('- Relay 4: ✅ Working / ❌ Faulty');
    console.log('- Relay 5: ✅ Working / ❌ Faulty');
    console.log('- Relay 6: ✅ Working / ❌ Faulty');
    console.log('- Relay 7: ✅ Working / ❌ Faulty');
    console.log('- Relay 8: ✅ Working / ❌ Faulty');
    console.log('\n🎯 We need at least ONE working relay for testing!');

    console.log('\n✅ Relay 1-8 test complete');
    
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
testRelays1to8().catch(console.error);