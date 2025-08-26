#!/usr/bin/env node

/**
 * Debug Hardware Communication
 * Tests different Modbus configurations to find what works with your hardware
 */

const { SerialPort } = require('serialport');

console.log('🔧 Hardware Communication Debug');
console.log('===============================');

const port = process.env.MODBUS_PORT || '/dev/ttyUSB0';
const baudRate = parseInt(process.env.MODBUS_BAUDRATE || '9600');

console.log(`📋 Configuration:`);
console.log(`   Port: ${port}`);
console.log(`   Baud Rate: ${baudRate}`);
console.log('');

// CRC16 calculation for Modbus RTU
function calculateCRC16(buffer) {
  let crc = 0xFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
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
  buffer.writeUInt8(slaveId, 0);
  buffer.writeUInt8(functionCode, 1);
  buffer.writeUInt16BE(address, 2);
  buffer.writeUInt16BE(data, 4);
  
  const crc = calculateCRC16(buffer.subarray(0, 6));
  buffer.writeUInt16LE(crc, 6);
  
  return buffer;
}

async function testHardware() {
  try {
    console.log('🔌 Opening serial port...');
    const serialPort = new SerialPort({
      path: port,
      baudRate: baudRate,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    });

    await new Promise((resolve, reject) => {
      serialPort.on('open', resolve);
      serialPort.on('error', reject);
    });

    console.log('✅ Serial port opened successfully');

    // Test different configurations
    const testConfigs = [
      { slave: 1, channel: 1, name: 'Standard (Slave 1, Channel 1)' },
      { slave: 1, channel: 4, name: 'Locker 4 (Slave 1, Channel 4)' },
      { slave: 0, channel: 1, name: 'Broadcast (Slave 0, Channel 1)' },
      { slave: 255, channel: 1, name: 'Broadcast Alt (Slave 255, Channel 1)' }
    ];

    for (const config of testConfigs) {
      console.log(`\n🧪 Testing: ${config.name}`);
      
      try {
        // Build command to turn ON relay (Function 0x05, Data 0xFF00)
        const onCommand = buildModbusCommand(config.slave, 0x05, config.channel - 1, 0xFF00);
        console.log(`   ON Command:  ${onCommand.toString('hex').toUpperCase()}`);
        
        // Send command
        serialPort.write(onCommand);
        
        // Wait for response
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Build command to turn OFF relay (Function 0x05, Data 0x0000)
        const offCommand = buildModbusCommand(config.slave, 0x05, config.channel - 1, 0x0000);
        console.log(`   OFF Command: ${offCommand.toString('hex').toUpperCase()}`);
        
        // Send command
        serialPort.write(offCommand);
        
        // Wait for response
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('   ✅ Commands sent successfully');
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }

    // Listen for any responses
    let responseReceived = false;
    serialPort.on('data', (data) => {
      responseReceived = true;
      console.log(`\n📥 Response received: ${data.toString('hex').toUpperCase()}`);
    });

    // Wait a bit more for responses
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (!responseReceived) {
      console.log('\n⚠️  No responses received from hardware');
      console.log('This could mean:');
      console.log('- Wrong slave address (try different values)');
      console.log('- Wrong baud rate (try 19200, 38400, or 115200)');
      console.log('- Hardware expects different protocol');
      console.log('- Hardware is not Modbus RTU compatible');
    }

    serialPort.close();
    console.log('\n🎉 Hardware test completed');

  } catch (error) {
    console.error('❌ Hardware test failed:', error.message);
  }
}

testHardware();