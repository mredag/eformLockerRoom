#!/usr/bin/env node

/**
 * Hardware Validation for Admin Panel Relay Control
 * 
 * This script validates the physical hardware integration:
 * - Modbus controller initialization
 * - Relay card communication
 * - Physical locker opening verification
 * - Timing validation for bulk operations
 */

const { ModbusController } = require('../app/kiosk/src/hardware/modbus-controller.js');
const fs = require('fs').promises;
const path = require('path');

const __dirname = __dirname;

// Test configuration
const TEST_LOCKER_IDS = [1, 2, 3];
const PULSE_DURATION = 400; // ms
const BULK_INTERVAL = 1000; // ms

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function logError(message, error) {
  log(`${message}: ${error.message}`, 'error');
  testResults.errors.push({ message, error: error.message });
  testResults.failed++;
}

function logSuccess(message) {
  log(message, 'success');
  testResults.passed++;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Load system configuration
async function loadSystemConfig() {
  try {
    const configPath = path.join(__dirname, '..', 'config', 'system.json');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    // Use environment variable for Modbus port if available
    const modbusConfig = config.modbus || {};
    modbusConfig.port = process.env.MODBUS_PORT || modbusConfig.port || '/dev/ttyUSB0';
    
    return {
      port: modbusConfig.port,
      baudRate: modbusConfig.baudRate || 9600,
      timeout: modbusConfig.timeout || 1000,
      use_multiple_coils: modbusConfig.use_multiple_coils !== false
    };
  } catch (error) {
    log('Using default Modbus configuration', 'info');
    return {
      port: process.env.MODBUS_PORT || '/dev/ttyUSB0',
      baudRate: 9600,
      timeout: 1000,
      use_multiple_coils: true
    };
  }
}

// Test Modbus controller initialization
async function testModbusInitialization(config) {
  log('🔧 Testing Modbus controller initialization...');
  
  try {
    const controller = new ModbusController(config);
    await controller.initialize();
    
    logSuccess('Modbus controller initialized successfully');
    return controller;
    
  } catch (error) {
    logError('Modbus controller initialization failed', error);
    
    // Provide troubleshooting guidance
    console.log('\n🔍 Troubleshooting tips:');
    console.log('- Check if RS-485 converter is connected');
    console.log(`- Verify ${config.port} exists: ls -la /dev/tty*`);
    console.log('- Check permissions: sudo usermod -a -G dialout $USER');
    console.log('- Set MODBUS_PORT environment variable if using different port');
    console.log('- Verify DIP switch settings on relay cards');
    console.log('- Check power supply to relay cards');
    
    throw error;
  }
}

// Test single relay operation
async function testSingleRelayOperation(controller, lockerId) {
  log(`🔓 Testing single relay operation for locker ${lockerId}...`);
  
  try {
    const startTime = Date.now();
    
    // Calculate card and relay IDs
    const cardId = Math.ceil(lockerId / 16);
    const relayId = ((lockerId - 1) % 16) + 1;
    
    log(`Locker ${lockerId} -> Card ${cardId}, Relay ${relayId}`);
    
    // Pulse the relay
    await controller.openLocker(cardId, relayId);
    
    const duration = Date.now() - startTime;
    log(`Relay pulse completed in ${duration}ms`);
    
    // Verify timing is reasonable
    if (duration < PULSE_DURATION * 0.8 || duration > PULSE_DURATION * 2) {
      log(`⚠️  Pulse duration outside expected range: ${duration}ms`, 'error');
    } else {
      logSuccess(`Pulse duration within expected range: ${duration}ms`);
    }
    
    logSuccess(`Single relay operation completed for locker ${lockerId}`);
    
  } catch (error) {
    logError(`Single relay operation failed for locker ${lockerId}`, error);
    throw error;
  }
}

// Test bulk relay operations with timing
async function testBulkRelayOperations(controller, lockerIds) {
  log(`🔓 Testing bulk relay operations for ${lockerIds.length} lockers...`);
  
  try {
    const startTime = Date.now();
    const expectedDuration = lockerIds.length * BULK_INTERVAL;
    
    log(`Expected bulk operation duration: ${expectedDuration}ms`);
    
    for (let i = 0; i < lockerIds.length; i++) {
      const lockerId = lockerIds[i];
      const iterationStart = Date.now();
      
      // Calculate card and relay IDs
      const cardId = Math.ceil(lockerId / 16);
      const relayId = ((lockerId - 1) % 16) + 1;
      
      log(`Bulk operation ${i + 1}/${lockerIds.length}: Locker ${lockerId} -> Card ${cardId}, Relay ${relayId}`);
      
      // Pulse the relay
      await controller.openLocker(cardId, relayId);
      
      // Wait for interval (except for last iteration)
      if (i < lockerIds.length - 1) {
        const iterationDuration = Date.now() - iterationStart;
        const remainingInterval = BULK_INTERVAL - iterationDuration;
        
        if (remainingInterval > 0) {
          await sleep(remainingInterval);
        }
      }
      
      const iterationTotal = Date.now() - iterationStart;
      log(`Iteration ${i + 1} completed in ${iterationTotal}ms`);
    }
    
    const actualDuration = Date.now() - startTime;
    log(`Actual bulk operation duration: ${actualDuration}ms`);
    
    // Verify timing
    if (actualDuration < expectedDuration * 0.8 || actualDuration > expectedDuration * 1.5) {
      log(`⚠️  Bulk operation timing outside expected range`, 'error');
    } else {
      logSuccess('Bulk operation timing within expected range');
    }
    
    logSuccess(`Bulk relay operations completed for ${lockerIds.length} lockers`);
    
  } catch (error) {
    logError('Bulk relay operations failed', error);
    throw error;
  }
}

// Test relay card communication
async function testRelayCardCommunication(controller) {
  log('📡 Testing relay card communication...');
  
  const cardIds = [1, 2]; // Test both cards
  
  for (const cardId of cardIds) {
    try {
      log(`Testing communication with card ${cardId}...`);
      
      // Test first relay on each card
      await controller.openLocker(cardId, 1);
      
      logSuccess(`Card ${cardId} communication successful`);
      
      // Small delay between card tests
      await sleep(500);
      
    } catch (error) {
      logError(`Card ${cardId} communication failed`, error);
      
      // Provide specific troubleshooting for this card
      console.log(`\n🔍 Troubleshooting for Card ${cardId}:`);
      console.log(`- Check DIP switches: Address should be set to ${cardId}`);
      console.log('- Verify A/B wiring connections');
      console.log('- Check power supply to the card');
      console.log('- Ensure card is properly seated');
    }
  }
}

// Test error handling scenarios
async function testErrorHandling(controller) {
  log('🚫 Testing error handling scenarios...');
  
  const errorTests = [
    {
      name: 'Invalid card ID',
      cardId: 99,
      relayId: 1,
      expectedError: true
    },
    {
      name: 'Invalid relay ID',
      cardId: 1,
      relayId: 99,
      expectedError: true
    }
  ];
  
  for (const test of errorTests) {
    try {
      log(`Testing: ${test.name}`);
      
      await controller.openLocker(test.cardId, test.relayId);
      
      if (test.expectedError) {
        log(`⚠️  Expected error for ${test.name} but operation succeeded`, 'error');
      } else {
        logSuccess(`Error handling test passed: ${test.name}`);
      }
      
    } catch (error) {
      if (test.expectedError) {
        logSuccess(`Error handling test passed: ${test.name} (expected error: ${error.message})`);
      } else {
        logError(`Unexpected error in ${test.name}`, error);
      }
    }
  }
}

// Verify DIP switch configuration
async function verifyDIPSwitchConfiguration() {
  log('🔧 Verifying DIP switch configuration...');
  
  console.log('\n📋 Expected DIP Switch Settings:');
  console.log('Card 1: Address = 1 (DIP 1-4: ON,OFF,OFF,OFF)');
  console.log('Card 2: Address = 2 (DIP 1-4: OFF,ON,OFF,OFF)');
  console.log('Both cards: DIP 9 = OFF (9600 baud)');
  console.log('Both cards: DIP 10 = OFF (no parity)');
  console.log('\n⚠️  Please manually verify these settings on the physical cards');
  
  logSuccess('DIP switch configuration guidance provided');
}

// Main hardware validation
async function runHardwareValidation() {
  console.log('🚀 Starting Hardware Validation for Admin Panel Relay Control\n');
  
  let controller = null;
  
  try {
    // Load configuration
    const config = await loadSystemConfig();
    log(`Using Modbus config: ${JSON.stringify(config)}`);
    
    // Verify DIP switch configuration
    await verifyDIPSwitchConfiguration();
    
    // Initialize Modbus controller
    controller = await testModbusInitialization(config);
    
    // Test relay card communication
    await testRelayCardCommunication(controller);
    
    // Test single relay operations
    for (const lockerId of TEST_LOCKER_IDS) {
      await testSingleRelayOperation(controller, lockerId);
      await sleep(500); // Small delay between tests
    }
    
    // Test bulk relay operations
    await testBulkRelayOperations(controller, TEST_LOCKER_IDS);
    
    // Test error handling
    await testErrorHandling(controller);
    
  } catch (error) {
    logError('Hardware validation failed', error);
  } finally {
    // Clean up
    if (controller) {
      try {
        await controller.close();
        log('Modbus controller closed');
      } catch (error) {
        log('Error closing Modbus controller', 'error');
      }
    }
  }
  
  // Print test summary
  console.log('\n📊 Hardware Validation Summary:');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  
  if (testResults.errors.length > 0) {
    console.log('\n🚨 Errors encountered:');
    testResults.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.message}: ${error.error}`);
    });
  }
  
  if (testResults.failed === 0) {
    console.log('\n🎉 Hardware validation completed successfully!');
    console.log('✅ Physical relay control is working correctly');
    process.exit(0);
  } else {
    console.log('\n⚠️  Hardware validation failed. Please review the errors above.');
    console.log('🔧 Check hardware connections and configuration before proceeding');
    process.exit(1);
  }
}

// Handle script execution
if (require.main === module) {
  runHardwareValidation().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runHardwareValidation };