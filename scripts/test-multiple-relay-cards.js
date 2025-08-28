#!/usr/bin/env node

/**
 * Test script for multiple Waveshare 16-channel relay cards
 * Tests locker mapping across 3 cards (48 lockers total)
 */

const { SerialPort } = require('serialport');

// Configuration
const SERIAL_PORT = process.env.MODBUS_PORT || '/dev/ttyUSB0';
const BAUDRATE = 9600;
const PULSE_DURATION = 500; // ms

// CRC16 calculation (same as working implementation)
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

// Build Modbus command
function buildModbusCommand(slaveId, functionCode, address, data) {
  const buffer = Buffer.alloc(8);
  buffer[0] = slaveId;
  buffer[1] = functionCode;
  buffer[2] = (address >> 8) & 0xFF;
  buffer[3] = address & 0xFF;
  buffer[4] = (data >> 8) & 0xFF;
  buffer[5] = data & 0xFF;
  
  const crc = calculateCRC16(buffer.subarray(0, 6));
  buffer[6] = crc & 0xFF;
  buffer[7] = (crc >> 8) & 0xFF;
  
  return buffer;
}

// Map locker to hardware (same as production code)
function mapLockerToHardware(lockerId) {
  const cardId = Math.ceil(lockerId / 16);
  const relayId = ((lockerId - 1) % 16) + 1;
  const coilAddress = relayId - 1;
  
  return { cardId, relayId, coilAddress, slaveAddress: cardId };
}

// Send command to serial port
async function sendCommand(port, command) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Command timeout'));
    }, 2000);
    
    port.write(command, (err) => {
      clearTimeout(timeout);
      if (err) reject(err);
      else resolve();
    });
  });
}

// Test specific locker
async function testLocker(port, lockerId) {
  const { cardId, relayId, coilAddress, slaveAddress } = mapLockerToHardware(lockerId);
  
  console.log(`\n🔧 Testing Locker ${lockerId}:`);
  console.log(`   Card: ${cardId}, Relay: ${relayId}, Slave Address: ${slaveAddress}`);
  
  try {
    // Turn ON
    const onCommand = buildModbusCommand(slaveAddress, 0x05, coilAddress, 0xFF00);
    console.log(`   ON Command:  ${onCommand.toString('hex').toUpperCase()}`);
    await sendCommand(port, onCommand);
    
    // Wait
    await new Promise(resolve => setTimeout(resolve, PULSE_DURATION));
    
    // Turn OFF
    const offCommand = buildModbusCommand(slaveAddress, 0x05, coilAddress, 0x0000);
    console.log(`   OFF Command: ${offCommand.toString('hex').toUpperCase()}`);
    await sendCommand(port, offCommand);
    
    console.log(`   ✅ Locker ${lockerId} test completed`);
    return true;
    
  } catch (error) {
    console.log(`   ❌ Locker ${lockerId} test failed: ${error.message}`);
    return false;
  }
}

// Main test function
async function testMultipleCards() {
  console.log('🚀 Testing Multiple Relay Cards (48 Lockers)');
  console.log(`📡 Serial Port: ${SERIAL_PORT}`);
  console.log(`⚡ Baudrate: ${BAUDRATE}`);
  
  // Test lockers from each card
  const testLockers = [
    // Card 1 (Slave Address 1)
    1, 8, 16,
    // Card 2 (Slave Address 2) 
    17, 24, 32,
    // Card 3 (Slave Address 3)
    33, 40, 48
  ];
  
  console.log(`\n📋 Testing lockers: ${testLockers.join(', ')}`);
  
  try {
    // Open serial port
    const port = new SerialPort({
      path: SERIAL_PORT,
      baudRate: BAUDRATE,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    });
    
    await new Promise((resolve, reject) => {
      port.on('open', resolve);
      port.on('error', reject);
    });
    
    console.log('✅ Serial port opened successfully');
    
    // Test each locker
    let successCount = 0;
    for (const lockerId of testLockers) {
      const success = await testLocker(port, lockerId);
      if (success) successCount++;
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Close port
    port.close();
    
    console.log(`\n📊 Test Results:`);
    console.log(`   Successful: ${successCount}/${testLockers.length}`);
    console.log(`   Failed: ${testLockers.length - successCount}/${testLockers.length}`);
    
    if (successCount === testLockers.length) {
      console.log('🎉 All tests passed! Multiple card setup is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Check hardware connections and DIP switch settings.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Show mapping table
function showMappingTable() {
  console.log('\n📋 Locker to Hardware Mapping Table:');
  console.log('┌────────┬──────┬───────┬─────────────────┐');
  console.log('│ Locker │ Card │ Relay │ Slave Address   │');
  console.log('├────────┼──────┼───────┼─────────────────┤');
  
  for (let i = 1; i <= 48; i++) {
    const { cardId, relayId, slaveAddress } = mapLockerToHardware(i);
    if (i === 1 || i === 17 || i === 33 || i % 8 === 1) {
      console.log(`│ ${i.toString().padStart(6)} │ ${cardId.toString().padStart(4)} │ ${relayId.toString().padStart(5)} │ ${slaveAddress.toString().padStart(15)} │`);
    }
  }
  
  console.log('└────────┴──────┴───────┴─────────────────┘');
  console.log('(Showing sample entries - full range 1-48 supported)');
}

// Run tests
if (require.main === module) {
  showMappingTable();
  testMultipleCards().catch(console.error);
}

module.exports = { mapLockerToHardware, buildModbusCommand, calculateCRC16 };