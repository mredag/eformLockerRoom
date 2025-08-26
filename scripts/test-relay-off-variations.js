#!/usr/bin/env node

/**
 * Test Different OFF Command Variations
 * Tests multiple ways to turn OFF relay 1
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

async function testRelayOffVariations() {
  console.log('🔧 Testing different OFF command variations...');
  
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

    // First ensure relay is ON
    console.log('\n🔓 Step 1: Turn ON relay 1 (to test OFF commands)');
    const turnOnCommand = Buffer.from([0x01, 0x05, 0x00, 0x00, 0xFF, 0x00, 0x8C, 0x3A]);
    console.log(`📡 ON Command: ${turnOnCommand.toString('hex').toUpperCase()}`);
    port.write(turnOnCommand);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('🔊 Relay should be ON now');

    // Test different OFF command variations
    const offVariations = [
      {
        name: 'Standard OFF (0x0000)',
        command: Buffer.from([0x01, 0x05, 0x00, 0x00, 0x00, 0x00, 0x8C, 0x0A])
      },
      {
        name: 'Write Multiple Coils OFF',
        command: (() => {
          const cmd = Buffer.from([0x01, 0x0F, 0x00, 0x00, 0x00, 0x01, 0x01, 0x00]);
          const crc = calculateCRC16(cmd.slice(0, 7));
          cmd[7] = crc & 0xFF;
          cmd[8] = (crc >> 8) & 0xFF;
          return cmd;
        })()
      },
      {
        name: 'Toggle Command (0x5500)',
        command: Buffer.from([0x01, 0x05, 0x00, 0x00, 0x55, 0x00, 0xDC, 0xFA])
      }
    ];

    for (let i = 0; i < offVariations.length; i++) {
      const variation = offVariations[i];
      console.log(`\n🔒 Test ${i + 2}: ${variation.name}`);
      console.log(`📡 Command: ${variation.command.toString('hex').toUpperCase()}`);
      
      port.write(variation.command);
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('🔊 Did relay turn OFF?');
      
      if (i < offVariations.length - 1) {
        // Turn ON again for next test
        console.log('   🔄 Turning ON again for next test...');
        port.write(turnOnCommand);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n✅ OFF variation tests complete');
    
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
testRelayOffVariations().catch(console.error);