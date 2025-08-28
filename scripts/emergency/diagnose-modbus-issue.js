#!/usr/bin/env node

/**
 * Modbus Issue Diagnostic Script
 * Helps diagnose timeout and connection issues
 */

import { SerialPort } from 'serialport';

async function diagnoseModbusIssue() {
  console.log('🔍 Modbus Connection Diagnostic');
  console.log('=' .repeat(40));
  
  try {
    // Step 1: Check available ports
    console.log('1️⃣  Checking available serial ports...');
    const ports = await SerialPort.list();
    
    if (ports.length === 0) {
      console.log('❌ No serial ports found');
      return;
    }
    
    console.log('✅ Available ports:');
    ports.forEach(port => {
      console.log(`   - ${port.path} (${port.manufacturer || 'Unknown'})`);
    });
    
    // Step 2: Find USB-RS485 converter
    const rs485Port = ports.find(p => 
      p.path.includes('ttyUSB') || 
      p.manufacturer?.toLowerCase().includes('1a86') ||
      p.manufacturer?.toLowerCase().includes('ftdi')
    );
    
    if (!rs485Port) {
      console.log('\n❌ No USB-RS485 converter found');
      console.log('💡 Troubleshooting:');
      console.log('   - Connect USB-RS485 converter');
      console.log('   - Install CH340 driver if needed');
      console.log('   - Check USB cable connection');
      return;
    }
    
    console.log(`\n✅ Found RS485 converter: ${rs485Port.path}`);
    
    // Step 3: Test port opening
    console.log('\n2️⃣  Testing port connection...');
    
    const testPort = new SerialPort({
      path: rs485Port.path,
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: false
    });
    
    await new Promise((resolve, reject) => {
      testPort.open((err) => {
        if (err) {
          reject(new Error(`Port open failed: ${err.message}`));
        } else {
          console.log('✅ Port opened successfully');
          resolve(true);
        }
      });
    });
    
    // Step 4: Test basic communication
    console.log('\n3️⃣  Testing basic Modbus communication...');
    
    // Simple Modbus RTU command to read coils from slave 1
    const readCommand = Buffer.from([
      0x01,  // Slave address
      0x01,  // Function code (Read Coils)
      0x00,  // Start address high
      0x00,  // Start address low
      0x00,  // Quantity high
      0x01,  // Quantity low (read 1 coil)
      0xFD,  // CRC low
      0xCA   // CRC high
    ]);
    
    let responseReceived = false;
    let responseData = Buffer.alloc(0);
    
    testPort.on('data', (data) => {
      responseReceived = true;
      responseData = Buffer.concat([responseData, data]);
      console.log('📨 Received response:', data.toString('hex'));
    });
    
    testPort.write(readCommand);
    console.log('📤 Sent command:', readCommand.toString('hex'));
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (responseReceived) {
      console.log('✅ Communication successful!');
      console.log(`   Response: ${responseData.toString('hex')}`);
    } else {
      console.log('❌ No response received');
      console.log('💡 Possible issues:');
      console.log('   - Relay card not powered (check 12V supply)');
      console.log('   - Wrong DIP switch address (should be 1)');
      console.log('   - RS485 wiring issue (A+, B-, GND)');
      console.log('   - Baud rate mismatch (check DIP switch 9)');
    }
    
    // Step 5: Test with different slave addresses
    console.log('\n4️⃣  Testing different slave addresses...');
    
    for (let addr = 1; addr <= 3; addr++) {
      const cmd = Buffer.from([
        addr,  // Slave address
        0x01,  // Function code
        0x00, 0x00,  // Start address
        0x00, 0x01,  // Quantity
        0x00, 0x00   // CRC placeholder
      ]);
      
      // Calculate CRC (simplified)
      const crc = calculateCRC16(cmd.slice(0, 6));
      cmd[6] = crc & 0xFF;
      cmd[7] = (crc >> 8) & 0xFF;
      
      responseReceived = false;
      testPort.write(cmd);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log(`   Address ${addr}: ${responseReceived ? '✅ RESPONSE' : '❌ NO RESPONSE'}`);
    }
    
    testPort.close();
    console.log('\n✅ Diagnostic complete');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
    
    if (error.message.includes('Permission denied')) {
      console.log('\n💡 Permission Fix:');
      console.log('   sudo chmod 666 /dev/ttyUSB0');
      console.log('   sudo usermod -a -G dialout pi');
    }
    
    if (error.message.includes('Device or resource busy')) {
      console.log('\n💡 Port Busy Fix:');
      console.log('   sudo fuser -k /dev/ttyUSB0');
      console.log('   Wait a few seconds and try again');
    }
  }
}

// Simple CRC16 calculation for Modbus RTU
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

// Run diagnostic
diagnoseModbusIssue().catch(error => {
  console.error('Diagnostic error:', error);
  process.exit(1);
});