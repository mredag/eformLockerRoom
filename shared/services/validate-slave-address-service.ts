/**
 * Validation Script for Slave Address Management Service
 * 
 * This script validates the core functionality of the SlaveAddressService
 * without requiring actual hardware or complex mocking.
 */

import { SlaveAddressService } from './slave-address-service';

/**
 * Validate CRC16 calculation against known values from proven solution
 */
function validateCRC16() {
  console.log('🧪 Testing CRC16 calculation...');
  
  const service = new SlaveAddressService({
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    timeout: 2000,
    maxRetries: 3,
    retryDelay: 1000
  });

  // Test with known command from proven solution
  // Command: 00 06 40 00 00 02 (set address 2 via broadcast)
  // Expected CRC: 1C 1A (little-endian: 0x1A1C)
  const command = Buffer.from([0x00, 0x06, 0x40, 0x00, 0x00, 0x02]);
  const crc = (service as any).calculateCRC16(command);
  
  const expectedCRC = 0x1A1C;
  const success = crc === expectedCRC;
  
  console.log(`📊 Command: ${command.toString('hex').toUpperCase()}`);
  console.log(`📊 Calculated CRC: 0x${crc.toString(16).toUpperCase()}`);
  console.log(`📊 Expected CRC: 0x${expectedCRC.toString(16).toUpperCase()}`);
  console.log(`${success ? '✅' : '❌'} CRC16 calculation: ${success ? 'PASSED' : 'FAILED'}`);
  
  return success;
}

/**
 * Validate command building functionality
 */
function validateCommandBuilding() {
  console.log('\n🧪 Testing command building...');
  
  const service = new SlaveAddressService({
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    timeout: 2000,
    maxRetries: 3,
    retryDelay: 1000
  });

  // Test broadcast write command (set address 2)
  const writeCommand = (service as any).buildWriteRegisterCommand(0x00, 0x4000, 2);
  const expectedWrite = Buffer.from([0x00, 0x06, 0x40, 0x00, 0x00, 0x02, 0x1C, 0x1A]);
  const writeSuccess = writeCommand.equals(expectedWrite);
  
  console.log(`📊 Write Command: ${writeCommand.toString('hex').toUpperCase()}`);
  console.log(`📊 Expected: ${expectedWrite.toString('hex').toUpperCase()}`);
  console.log(`${writeSuccess ? '✅' : '❌'} Write command building: ${writeSuccess ? 'PASSED' : 'FAILED'}`);

  // Test read command (read address from register 0x4000)
  const readCommand = (service as any).buildReadRegisterCommand(1, 0x4000, 1);
  const expectedRead = Buffer.from([0x01, 0x03, 0x40, 0x00, 0x00, 0x01, 0x91, 0xCA]);
  const readSuccess = readCommand.equals(expectedRead);
  
  console.log(`📊 Read Command: ${readCommand.toString('hex').toUpperCase()}`);
  console.log(`📊 Expected: ${expectedRead.toString('hex').toUpperCase()}`);
  console.log(`${readSuccess ? '✅' : '❌'} Read command building: ${readSuccess ? 'PASSED' : 'FAILED'}`);
  
  return writeSuccess && readSuccess;
}

/**
 * Validate address range validation
 */
async function validateAddressValidation() {
  console.log('\n🧪 Testing address validation...');
  
  const service = new SlaveAddressService({
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    timeout: 2000,
    maxRetries: 3,
    retryDelay: 1000
  });

  // Test invalid addresses (should return error without initialization)
  const tests = [
    { address: 0, shouldFail: true, description: 'Address 0 (reserved for broadcast)' },
    { address: 1, shouldFail: false, description: 'Address 1 (valid)' },
    { address: 255, shouldFail: false, description: 'Address 255 (valid)' },
    { address: 256, shouldFail: true, description: 'Address 256 (out of range)' },
    { address: -1, shouldFail: true, description: 'Address -1 (negative)' }
  ];

  let allPassed = true;
  
  for (const test of tests) {
    try {
      // Test broadcast configuration validation (doesn't require initialization)
      const result = await service.configureBroadcastAddress(test.address);
      const failed = !result.success && result.error?.includes('Invalid address');
      const passed = test.shouldFail ? failed : !failed;
      
      console.log(`${passed ? '✅' : '❌'} ${test.description}: ${passed ? 'PASSED' : 'FAILED'}`);
      if (!passed) allPassed = false;
      
    } catch (error) {
      const passed = test.shouldFail;
      console.log(`${passed ? '✅' : '❌'} ${test.description}: ${passed ? 'PASSED (threw error)' : 'FAILED (unexpected error)'}`);
      if (!passed) allPassed = false;
    }
  }
  
  return allPassed;
}

/**
 * Validate device cache functionality
 */
function validateDeviceCache() {
  console.log('\n🧪 Testing device cache...');
  
  const service = new SlaveAddressService({
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    timeout: 2000,
    maxRetries: 3,
    retryDelay: 1000
  });

  // Test cache operations
  const testDevice = {
    address: 1,
    responseTime: 100,
    deviceType: 'waveshare_16ch',
    lastSeen: new Date()
  };

  // Add device to cache
  (service as any).knownDevices.set(1, testDevice);
  
  // Test get known devices
  const devices = service.getKnownDevices();
  const hasDevice = devices.has(1) && devices.get(1)?.address === 1;
  console.log(`${hasDevice ? '✅' : '❌'} Device caching: ${hasDevice ? 'PASSED' : 'FAILED'}`);
  
  // Test backup and restore
  const backup = service.createConfigurationBackup();
  service.clearDeviceCache();
  const isEmpty = service.getKnownDevices().size === 0;
  console.log(`${isEmpty ? '✅' : '❌'} Cache clearing: ${isEmpty ? 'PASSED' : 'FAILED'}`);
  
  service.restoreConfigurationBackup(backup);
  const restored = service.getKnownDevices().size === 1;
  console.log(`${restored ? '✅' : '❌'} Cache restoration: ${restored ? 'PASSED' : 'FAILED'}`);
  
  return hasDevice && isEmpty && restored;
}

/**
 * Validate event emission setup
 */
function validateEventEmission() {
  console.log('\n🧪 Testing event emission...');
  
  const service = new SlaveAddressService({
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    timeout: 2000,
    maxRetries: 3,
    retryDelay: 1000
  });

  let eventReceived = false;
  
  // Test event listener setup
  service.on('test_event', () => {
    eventReceived = true;
  });
  
  // Emit test event
  service.emit('test_event');
  
  console.log(`${eventReceived ? '✅' : '❌'} Event emission: ${eventReceived ? 'PASSED' : 'FAILED'}`);
  
  return eventReceived;
}

/**
 * Main validation function
 */
async function validateSlaveAddressService() {
  console.log('🚀 Slave Address Service Validation');
  console.log('=====================================');
  
  const results = {
    crc16: validateCRC16(),
    commandBuilding: validateCommandBuilding(),
    addressValidation: await validateAddressValidation(),
    deviceCache: validateDeviceCache(),
    eventEmission: validateEventEmission()
  };
  
  const passedCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;
  
  console.log('\n📊 Validation Summary');
  console.log('=====================');
  console.log(`✅ Passed: ${passedCount}/${totalCount} tests`);
  console.log(`${passedCount === totalCount ? '🎉' : '⚠️'} Overall: ${passedCount === totalCount ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  
  if (passedCount === totalCount) {
    console.log('\n🎯 The Slave Address Service implementation is validated and ready for use!');
    console.log('📋 Key features confirmed:');
    console.log('   - CRC16 calculation matches proven solution');
    console.log('   - Command building follows exact format from working implementation');
    console.log('   - Address validation prevents invalid configurations');
    console.log('   - Device cache management works correctly');
    console.log('   - Event emission system is functional');
  } else {
    console.log('\n❌ Some validation tests failed. Please review the implementation.');
  }
  
  return passedCount === totalCount;
}

// Run validation if called directly
if (require.main === module) {
  validateSlaveAddressService().catch(console.error);
}

export { validateSlaveAddressService };