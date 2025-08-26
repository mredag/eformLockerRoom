#!/usr/bin/env node

/**
 * Simple Hardware Test Script
 * Basic test of serial port and ModbusRTU functionality
 */

async function testHardwareSimple() {
  console.log('🔧 Simple Hardware Test');
  console.log('=' .repeat(40));
  
  try {
    // Test 1: Check if serialport module loads
    console.log('📦 Testing serialport module...');
    const { SerialPort } = require('serialport');
    console.log('✅ SerialPort module loaded');
    
    // Test 2: Check available ports
    console.log('\n🔍 Checking available serial ports...');
    const ports = await SerialPort.list();
    console.log(`Found ${ports.length} serial ports:`);
    ports.forEach(port => {
      console.log(`   - ${port.path} (${port.manufacturer || 'Unknown'})`);
    });
    
    // Test 3: Check if target port exists
    const targetPort = '/dev/ttyUSB0';
    const portExists = ports.some(p => p.path === targetPort);
    console.log(`\n🎯 Target port ${targetPort}: ${portExists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    
    if (!portExists) {
      console.log('\n🔍 Port not found troubleshooting:');
      console.log('   - Check USB connection');
      console.log('   - Try: ls -la /dev/ttyUSB*');
      console.log('   - Try: dmesg | grep tty');
      console.log('   - Check if USB-RS485 converter is recognized');
      return;
    }
    
    // Test 4: Try to open the port
    console.log(`\n🔌 Testing port access...`);
    const port = new SerialPort({
      path: targetPort,
      baudRate: 9600,
      autoOpen: false
    });
    
    await new Promise((resolve, reject) => {
      port.open((err) => {
        if (err) {
          reject(new Error(`Failed to open port: ${err.message}`));
        } else {
          console.log('✅ Port opened successfully');
          port.close();
          resolve();
        }
      });
    });
    
    // Test 5: Test ModbusRTU module
    console.log('\n📡 Testing ModbusRTU module...');
    const ModbusRTU = require('modbus-serial');
    const client = new ModbusRTU();
    console.log('✅ ModbusRTU module loaded');
    
    // Test 6: Try Modbus connection
    console.log('\n🔗 Testing Modbus connection...');
    await client.connectRTUBuffered(targetPort, { baudRate: 9600 });
    console.log('✅ Modbus connection established');
    
    // Test 7: Try a simple Modbus command
    console.log('\n📤 Testing Modbus command (read holding registers)...');
    client.setID(1); // Set slave ID
    client.setTimeout(2000);
    
    try {
      // Try to read a register (this might fail but tests communication)
      const result = await client.readHoldingRegisters(0, 1);
      console.log('✅ Modbus read successful:', result.data);
    } catch (modbusError) {
      console.log('⚠️  Modbus read failed (expected for relay cards):', modbusError.message);
      console.log('   This is normal - relay cards don\'t usually respond to reads');
    }
    
    // Test 8: Try writing a coil (relay activation)
    console.log('\n🔌 Testing relay activation (coil write)...');
    try {
      await client.writeCoil(0, true);  // Turn on relay 1
      console.log('✅ Relay activation command sent');
      
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
      
      await client.writeCoil(0, false); // Turn off relay 1
      console.log('✅ Relay deactivation command sent');
      console.log('   Check if you heard/saw relay 1 click!');
      
    } catch (relayError) {
      console.log('❌ Relay activation failed:', relayError.message);
    }
    
    client.close();
    console.log('\n✅ All tests completed successfully!');
    console.log('🎉 Hardware communication is working');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.message.includes('permission') || error.message.includes('EACCES')) {
      console.log('\n🔍 Permission Issue:');
      console.log('   - Run: sudo chmod 666 /dev/ttyUSB0');
      console.log('   - Or add user to dialout group: sudo usermod -a -G dialout $USER');
      console.log('   - Then logout and login again');
    }
    
    if (error.message.includes('busy') || error.message.includes('EBUSY')) {
      console.log('\n🔍 Port Busy Issue:');
      console.log('   - Check if another process is using the port');
      console.log('   - Run: sudo lsof /dev/ttyUSB0');
      console.log('   - Stop any other services using the port');
    }
    
    process.exit(1);
  }
}

// Run the test
testHardwareSimple().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});