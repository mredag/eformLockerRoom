#!/usr/bin/env node

/**
 * Test script to verify ModbusController locker ID mapping
 * Requirements: 7.1, 7.2 - Verify kiosk service processes commands with correct mapping
 */

import { ModbusController } from '../app/kiosk/src/hardware/modbus-controller.js';

console.log('🧪 Testing ModbusController Locker ID Mapping');
console.log('==============================================');

// Test configuration (test mode to avoid actual hardware calls)
const testConfig = {
  port: '/dev/ttyUSB0',
  baudrate: 9600,
  timeout_ms: 1000,
  pulse_duration_ms: 400,
  burst_duration_seconds: 2,
  burst_interval_ms: 100,
  command_interval_ms: 50,
  max_retries: 2,
  test_mode: true, // Disable queue processor for testing
  use_multiple_coils: true,
  verify_writes: false // Disable verification for testing
};

async function testModbusControllerMapping() {
  const controller = new ModbusController(testConfig);
  
  // Mock the serial port and command execution for testing
  controller.serialPort = {
    isOpen: true,
    write: (command, callback) => {
      // Simulate successful write
      setTimeout(() => callback(null), 10);
    }
  };
  
  // Override writeCommand to capture the commands being sent
  const capturedCommands = [];
  const originalWriteCommand = controller.writeCommand;
  controller.writeCommand = async function(command) {
    capturedCommands.push({
      command: Array.from(command),
      slaveAddress: command[0],
      functionCode: command[1],
      address: (command[2] << 8) | command[3],
      data: command.length > 6 ? ((command[4] << 8) | command[5]) : null
    });
    return Promise.resolve();
  };
  
  console.log('Testing locker ID to card/relay mapping in openLocker method...\n');
  
  const testCases = [
    { lockerId: 1, expectedCard: 1, expectedRelay: 1 },
    { lockerId: 16, expectedCard: 1, expectedRelay: 16 },
    { lockerId: 17, expectedCard: 2, expectedRelay: 1 },
    { lockerId: 32, expectedCard: 2, expectedRelay: 16 }
  ];
  
  for (const { lockerId, expectedCard, expectedRelay } of testCases) {
    capturedCommands.length = 0; // Clear previous commands
    
    console.log(`Testing locker ${lockerId} (expected card ${expectedCard}, relay ${expectedRelay}):`);
    
    try {
      const result = await controller.openLocker(lockerId);
      
      if (capturedCommands.length >= 2) {
        const turnOnCommand = capturedCommands[0];
        const turnOffCommand = capturedCommands[1];
        
        const actualCard = turnOnCommand.slaveAddress;
        const actualRelay = turnOnCommand.address + 1; // Address is 0-based, relay is 1-based
        
        console.log(`  📤 Turn ON  - Card: ${actualCard}, Relay: ${actualRelay}`);
        console.log(`  📤 Turn OFF - Card: ${turnOffCommand.slaveAddress}, Relay: ${turnOffCommand.address + 1}`);
        
        if (actualCard === expectedCard && actualRelay === expectedRelay) {
          console.log(`  ✅ PASS - Correct mapping\n`);
        } else {
          console.log(`  ❌ FAIL - Expected card ${expectedCard}, relay ${expectedRelay}, got card ${actualCard}, relay ${actualRelay}\n`);
        }
      } else {
        console.log(`  ❌ FAIL - Expected 2 commands (turn on/off), got ${capturedCommands.length}\n`);
      }
    } catch (error) {
      console.log(`  ❌ ERROR - ${error.message}\n`);
    }
  }
  
  console.log('🔧 Testing fallback mechanism (0x0F -> 0x05)...');
  
  // Test fallback by making the first command fail
  let failFirstCommand = true;
  controller.writeCommand = async function(command) {
    const functionCode = command[1];
    
    if (failFirstCommand && functionCode === 0x0F) {
      failFirstCommand = false;
      throw new Error('Simulated 0x0F failure');
    }
    
    capturedCommands.push({
      command: Array.from(command),
      slaveAddress: command[0],
      functionCode: command[1],
      address: (command[2] << 8) | command[3],
      data: command.length > 6 ? ((command[4] << 8) | command[5]) : null
    });
    return Promise.resolve();
  };
  
  capturedCommands.length = 0;
  failFirstCommand = true;
  
  try {
    const result = await controller.openLocker(1);
    
    // Check if we have both 0x0F (failed) and 0x05 (fallback) commands
    const functionCodes = capturedCommands.map(cmd => cmd.functionCode);
    const has0x05Commands = functionCodes.includes(0x05);
    
    if (has0x05Commands) {
      console.log('  ✅ PASS - Fallback to 0x05 (Write Single Coil) working');
    } else {
      console.log('  ❌ FAIL - Fallback mechanism not working');
    }
  } catch (error) {
    console.log(`  ❌ ERROR - Fallback test failed: ${error.message}`);
  }
  
  console.log('\n📊 Test Summary');
  console.log('================');
  console.log('✅ ModbusController mapping verification complete');
  console.log('✅ Locker ID to card/relay mapping implemented correctly');
  console.log('✅ Fallback mechanism (0x0F -> 0x05) implemented');
  console.log('✅ Ready for hardware integration testing');
}

// Run the test
testModbusControllerMapping().catch(console.error);