#!/usr/bin/env node

/**
 * Test Basic Relay Control
 * Tests if we can turn relay ON and OFF with simple commands
 */

const { SerialPort } = require('serialport');

async function testBasicRelayControl() {
  console.log('🔧 Testing basic relay control...');
  
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

    // Test 1: Turn ON relay 1 using standard Modbus command
    console.log('\n🔓 Test 1: Turn ON relay 1');
    const turnOnCommand = Buffer.from([0x01, 0x05, 0x00, 0x00, 0xFF, 0x00, 0x8C, 0x3A]);
    console.log(`📡 Command: ${turnOnCommand.toString('hex').toUpperCase()}`);
    
    port.write(turnOnCommand);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('🔊 Did you hear relay 1 click ON?');

    // Test 2: Turn OFF relay 1
    console.log('\n🔒 Test 2: Turn OFF relay 1');
    const turnOffCommand = Buffer.from([0x01, 0x05, 0x00, 0x00, 0x00, 0x00, 0x8C, 0x0A]);
    console.log(`📡 Command: ${turnOffCommand.toString('hex').toUpperCase()}`);
    
    port.write(turnOffCommand);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('🔊 Did you hear relay 1 click OFF?');

    // Test 3: Try Waveshare timed pulse (if basic commands work)
    console.log('\n⏱️  Test 3: Waveshare timed pulse (500ms)');
    const timedPulseCommand = Buffer.from([0x01, 0x05, 0x02, 0x00, 0x00, 0x05, 0x8D, 0xB0]);
    console.log(`📡 Command: ${timedPulseCommand.toString('hex').toUpperCase()}`);
    
    port.write(timedPulseCommand);
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('🔊 Did you hear TWO clicks (ON then OFF after 500ms)?');

    console.log('\n✅ Basic relay test complete');
    
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
testBasicRelayControl().catch(console.error);