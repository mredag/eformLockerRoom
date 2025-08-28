#!/usr/bin/env node

/**
 * Comprehensive Relay Testing Suite
 * Consolidates all relay testing functionality into a single script
 * 
 * Tests:
 * - Basic relay control (ON/OFF)
 * - Multiple relay testing (1-8, 1-16, or custom range)
 * - Modbus communication validation
 * - Hardware diagnostics
 * - Integration with ModbusController
 */

const { SerialPort } = require('serialport');
const path = require('path');

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

async function detectSerialPort() {
  try {
    const ports = await SerialPort.list();
    const rs485Port = ports.find(p => 
      p.manufacturer?.toLowerCase().includes('ch340') ||
      p.manufacturer?.toLowerCase().includes('ftdi') ||
      p.manufacturer?.toLowerCase().includes('prolific') ||
      p.path.includes('ttyUSB') ||
      p.path.includes('COM')
    );
    
    return rs485Port ? rs485Port.path : '/dev/ttyUSB0';
  } catch (error) {
    return '/dev/ttyUSB0'; // Default fallback
  }
}

async function testBasicRelay(port, relayNumber = 1) {
  console.log(`\n🔧 Testing Basic Relay Control - Relay ${relayNumber}`);
  console.log('=' .repeat(50));
  
  const coil = relayNumber - 1; // Convert to 0-based coil address
  
  try {
    // Test 1: Turn ON relay using standard Modbus command
    console.log(`🔓 Turning ON relay ${relayNumber} (coil ${coil})`);
    const turnOnCommand = buildCommand(0x01, 0x05, coil, 0xFF00);
    console.log(`📡 Command: ${turnOnCommand.toString('hex').toUpperCase()}`);
    
    port.write(turnOnCommand);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('🔊 Listen for relay click ON...');

    // Test 2: Turn OFF relay
    console.log(`🔒 Turning OFF relay ${relayNumber} (coil ${coil})`);
    const turnOffCommand = buildCommand(0x01, 0x05, coil, 0x0000);
    console.log(`📡 Command: ${turnOffCommand.toString('hex').toUpperCase()}`);
    
    port.write(turnOffCommand);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('🔊 Listen for relay click OFF...');

    console.log(`✅ Basic test for relay ${relayNumber} complete`);
    return true;
    
  } catch (error) {
    console.error(`❌ Basic test for relay ${relayNumber} failed:`, error.message);
    return false;
  }
}

async function testMultipleRelays(port, startRelay = 1, endRelay = 8) {
  console.log(`\n🔧 Testing Multiple Relays (${startRelay}-${endRelay})`);
  console.log('=' .repeat(50));
  
  const results = [];
  
  for (let relay = startRelay; relay <= endRelay; relay++) {
    const coil = relay - 1; // Convert to 0-based coil address
    console.log(`\n🔧 Testing relay ${relay} (coil ${coil})`);
    
    try {
      // Turn ON
      const onCmd = buildCommand(0x01, 0x05, coil, 0xFF00);
      console.log(`📡 ON:  ${onCmd.toString('hex').toUpperCase()}`);
      port.write(onCmd);
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Turn OFF
      const offCmd = buildCommand(0x01, 0x05, coil, 0x0000);
      console.log(`📡 OFF: ${offCmd.toString('hex').toUpperCase()}`);
      port.write(offCmd);
      await new Promise(resolve => setTimeout(resolve, 800));
      
      console.log(`🔊 Relay ${relay}: Listen for ON-OFF clicks`);
      results.push({ relay, status: 'tested' });
      
    } catch (error) {
      console.error(`❌ Relay ${relay} error:`, error.message);
      results.push({ relay, status: 'error', error: error.message });
    }
  }
  
  console.log('\n📊 Test Results Summary:');
  console.log('=' .repeat(30));
  results.forEach(result => {
    if (result.status === 'tested') {
      console.log(`✅ Relay ${result.relay}: Tested (check for clicks)`);
    } else {
      console.log(`❌ Relay ${result.relay}: Error - ${result.error}`);
    }
  });
  
  return results;
}

async function testWithModbusController() {
  console.log('\n🔧 Testing with ModbusController Integration');
  console.log('=' .repeat(50));
  
  try {
    // Dynamic import to handle ES modules
    const { ModbusController } = await import('../app/kiosk/src/hardware/modbus-controller.js');
    
    const portPath = await detectSerialPort();
    console.log(`🔍 Using port: ${portPath}`);
    
    const controller = new ModbusController({
      port: portPath,
      baudrate: 9600,
      timeout_ms: 2000,
      pulse_duration_ms: 400,
      burst_duration_seconds: 10,
      burst_interval_ms: 2000,
      command_interval_ms: 300,
      use_multiple_coils: true,
      verify_writes: false,
      max_retries: 2,
      test_mode: true
    });

    console.log('📡 Connecting to ModbusController...');
    await controller.initialize();
    console.log('✅ Connected to Modbus');
    
    // Test locker opening (which activates relays)
    console.log('🔌 Testing locker 1 (relay 1)...');
    const success = await controller.openLocker(1, 1);
    
    if (success) {
      console.log('✅ Locker 1 opened successfully!');
    } else {
      console.log('❌ Locker 1 opening failed');
    }
    
    // Show health status
    const health = controller.getHealth();
    console.log('\n📊 ModbusController Health:');
    console.log(`   Status: ${health.status}`);
    console.log(`   Commands: ${health.total_commands} total, ${health.failed_commands} failed`);
    console.log(`   Success Rate: ${((health.total_commands - health.failed_commands) / health.total_commands * 100).toFixed(1)}%`);
    
    await controller.close();
    console.log('🔌 ModbusController disconnected');
    
    return true;
    
  } catch (error) {
    console.error('❌ ModbusController test failed:', error.message);
    console.log('ℹ️  This is normal if ModbusController is not available');
    return false;
  }
}

async function runDiagnostics(port) {
  console.log('\n🔧 Running Hardware Diagnostics');
  console.log('=' .repeat(50));
  
  try {
    // Test 1: Port connectivity
    console.log('📡 Testing serial port connectivity...');
    if (port.isOpen) {
      console.log('✅ Serial port is open and ready');
    } else {
      console.log('❌ Serial port is not open');
      return false;
    }
    
    // Test 2: Basic communication test
    console.log('📡 Testing basic Modbus communication...');
    const testCmd = buildCommand(0x01, 0x01, 0x00, 0x0001); // Read coil status
    console.log(`📡 Test command: ${testCmd.toString('hex').toUpperCase()}`);
    
    port.write(testCmd);
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('✅ Command sent (check for response in logs)');
    
    // Test 3: Multiple slave addresses
    console.log('📡 Testing multiple slave addresses...');
    for (let slave = 1; slave <= 3; slave++) {
      const cmd = buildCommand(slave, 0x01, 0x00, 0x0001);
      console.log(`📡 Slave ${slave}: ${cmd.toString('hex').toUpperCase()}`);
      port.write(cmd);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log('✅ Diagnostics complete');
    return true;
    
  } catch (error) {
    console.error('❌ Diagnostics failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Comprehensive Relay Testing Suite');
  console.log('=' .repeat(50));
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const testType = args[0] || 'basic';
  const relayNumber = parseInt(args[1]) || 1;
  const endRelay = parseInt(args[2]) || 8;
  
  console.log('Available test types:');
  console.log('  basic [relay]     - Test single relay (default: relay 1)');
  console.log('  multiple [start] [end] - Test relay range (default: 1-8)');
  console.log('  controller        - Test with ModbusController');
  console.log('  diagnostics       - Run hardware diagnostics');
  console.log('  all              - Run all tests');
  console.log('');
  
  const portPath = await detectSerialPort();
  console.log(`🔍 Detected serial port: ${portPath}`);
  
  let port;
  try {
    // Open serial port
    port = new SerialPort({
      path: portPath,
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    });

    await new Promise((resolve, reject) => {
      port.on('open', resolve);
      port.on('error', reject);
    });

    console.log('✅ Serial port opened successfully');
    
    // Run requested tests
    switch (testType) {
      case 'basic':
        await testBasicRelay(port, relayNumber);
        break;
        
      case 'multiple':
        await testMultipleRelays(port, relayNumber, endRelay);
        break;
        
      case 'controller':
        await port.close();
        await testWithModbusController();
        return; // ModbusController handles its own connection
        
      case 'diagnostics':
        await runDiagnostics(port);
        break;
        
      case 'all':
        await testBasicRelay(port, 1);
        await testMultipleRelays(port, 1, 8);
        await runDiagnostics(port);
        await port.close();
        await testWithModbusController();
        return;
        
      default:
        console.log(`❌ Unknown test type: ${testType}`);
        console.log('Use: basic, multiple, controller, diagnostics, or all');
        break;
    }
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    
    if (error.message.includes('ENOENT') || error.message.includes('cannot open')) {
      console.log('\n🔍 Troubleshooting:');
      console.log('   - Check USB-RS485 connection');
      console.log('   - Verify port exists: ls -la /dev/ttyUSB*');
      console.log('   - Check permissions: sudo chmod 666 /dev/ttyUSB0');
      console.log('   - Try different port: /dev/ttyUSB1, /dev/ttyAMA0');
    }
    
    if (error.message.includes('timeout')) {
      console.log('\n🔍 Troubleshooting:');
      console.log('   - Check relay card power (12V)');
      console.log('   - Verify RS485 wiring (A+, B-, GND)');
      console.log('   - Check DIP switch addresses on cards');
    }
    
  } finally {
    if (port && port.isOpen) {
      port.close();
      console.log('📡 Serial port closed');
    }
  }
  
  console.log('\n🎯 Test Suite Complete');
  console.log('=' .repeat(25));
  console.log('Usage examples:');
  console.log('  node scripts/test-relay-comprehensive.js basic 5');
  console.log('  node scripts/test-relay-comprehensive.js multiple 1 16');
  console.log('  node scripts/test-relay-comprehensive.js controller');
  console.log('  node scripts/test-relay-comprehensive.js all');
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

// Run the test suite
main().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});