/**
 * Slave Address Service Usage Examples
 * 
 * This file demonstrates how to use the SlaveAddressService for
 * automated Modbus slave address configuration in the Hardware
 * Configuration Wizard.
 * 
 * Based on proven dual relay card solution patterns.
 */

import { SlaveAddressService, AddressConflict } from './slave-address-service';

/**
 * Example 1: Basic Address Configuration
 * Configure a single card to a specific address using broadcast
 */
async function basicAddressConfiguration() {
  const service = new SlaveAddressService({
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    timeout: 2000,
    maxRetries: 3,
    retryDelay: 1000
  });

  try {
    await service.initialize();
    
    console.log('🔧 Configuring card to address 2...');
    const result = await service.configureBroadcastAddress(2);
    
    if (result.success) {
      console.log(`✅ Card configured successfully to address ${result.address}`);
      console.log(`📊 Response time: ${result.responseTime}ms`);
      console.log(`✅ Verification: ${result.verificationPassed ? 'PASSED' : 'FAILED'}`);
    } else {
      console.error(`❌ Configuration failed: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Service error:', error);
  } finally {
    await service.close();
  }
}

/**
 * Example 2: Address Discovery and Validation
 * Find available addresses and validate specific addresses
 */
async function addressDiscoveryExample() {
  const service = new SlaveAddressService({
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    timeout: 2000,
    maxRetries: 3,
    retryDelay: 1000
  });

  try {
    await service.initialize();
    
    // Find next available address
    console.log('🔍 Finding next available address...');
    const availableAddress = await service.findNextAvailableAddress([1, 2]); // Exclude 1 and 2
    console.log(`✅ Next available address: ${availableAddress}`);
    
    // Validate specific address
    console.log('🔍 Checking if address 5 is available...');
    const isAvailable = await service.validateAddressAvailability(5);
    console.log(`📋 Address 5 is ${isAvailable ? 'available' : 'occupied'}`);
    
    // Detect conflicts
    console.log('🔍 Scanning for address conflicts...');
    const conflicts = await service.detectAddressConflicts();
    console.log(`📋 Found ${conflicts.length} address conflicts`);
    
    for (const conflict of conflicts) {
      console.log(`⚠️ Conflict at address ${conflict.address}: ${conflict.devices.length} devices`);
    }
    
  } catch (error) {
    console.error('❌ Discovery error:', error);
  } finally {
    await service.close();
  }
}

/**
 * Example 3: Bulk Configuration for Multiple Cards
 * Configure multiple cards sequentially with progress reporting
 */
async function bulkConfigurationExample() {
  const service = new SlaveAddressService({
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    timeout: 2000,
    maxRetries: 3,
    retryDelay: 1000
  });

  try {
    await service.initialize();
    
    console.log('🔧 Configuring 4 cards sequentially (addresses 1-4)...');
    
    // Progress callback
    const progressCallback = (progress: number, currentAddress: number, result: any) => {
      console.log(`📊 Progress: ${progress}% - Address ${currentAddress}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    };
    
    const results = await service.configureSequentialAddresses(1, 4, progressCallback);
    
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Bulk configuration complete: ${successCount}/4 cards configured`);
    
    // Display detailed results
    results.forEach((result, index) => {
      const address = index + 1;
      if (result.success) {
        console.log(`✅ Card ${address}: Configured successfully (${result.responseTime}ms)`);
      } else {
        console.error(`❌ Card ${address}: Failed - ${result.error}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Bulk configuration error:', error);
  } finally {
    await service.close();
  }
}

/**
 * Example 4: Conflict Resolution
 * Automatically resolve address conflicts
 */
async function conflictResolutionExample() {
  const service = new SlaveAddressService({
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    timeout: 2000,
    maxRetries: 3,
    retryDelay: 1000
  });

  try {
    await service.initialize();
    
    // First, detect conflicts
    console.log('🔍 Scanning for address conflicts...');
    const conflicts = await service.detectAddressConflicts();
    
    if (conflicts.length === 0) {
      console.log('✅ No conflicts detected');
      return;
    }
    
    console.log(`⚠️ Found ${conflicts.length} conflicts, resolving...`);
    
    // Resolve conflicts automatically
    const resolutions = await service.resolveAddressConflicts(conflicts);
    
    const successCount = resolutions.filter(r => r.success).length;
    console.log(`✅ Conflict resolution complete: ${successCount}/${resolutions.length} resolved`);
    
    // Display resolution results
    resolutions.forEach(resolution => {
      if (resolution.success) {
        console.log(`✅ Moved device from address ${resolution.originalAddress} to ${resolution.newAddress}`);
      } else {
        console.error(`❌ Failed to resolve conflict at address ${resolution.originalAddress}: ${resolution.error}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Conflict resolution error:', error);
  } finally {
    await service.close();
  }
}

/**
 * Example 5: Event-Driven Configuration with Monitoring
 * Use events to monitor configuration progress and status
 */
async function eventDrivenExample() {
  const service = new SlaveAddressService({
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    timeout: 2000,
    maxRetries: 3,
    retryDelay: 1000
  });

  // Set up event listeners
  service.on('initialized', () => {
    console.log('🚀 Service initialized');
  });

  service.on('address_configured', (data) => {
    console.log(`✅ Address configured: ${data.address} via ${data.method}`);
  });

  service.on('bulk_configuration_complete', (data) => {
    console.log(`📊 Bulk configuration: ${data.successCount}/${data.count} cards configured`);
  });

  service.on('conflicts_resolved', (data) => {
    console.log(`🔧 Conflicts resolved: ${data.successCount} successful resolutions`);
  });

  try {
    await service.initialize();
    
    // Configure multiple cards with event monitoring
    await service.configureSequentialAddresses(1, 3);
    
  } catch (error) {
    console.error('❌ Event-driven configuration error:', error);
  } finally {
    await service.close();
  }
}

/**
 * Example 6: Configuration Backup and Rollback
 * Demonstrate backup and rollback functionality
 */
async function backupRollbackExample() {
  const service = new SlaveAddressService({
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    timeout: 2000,
    maxRetries: 3,
    retryDelay: 1000
  });

  try {
    await service.initialize();
    
    // Create backup before configuration
    console.log('💾 Creating configuration backup...');
    const backup = service.createConfigurationBackup();
    console.log(`💾 Backup created with ${backup.size} devices`);
    
    try {
      // Attempt risky configuration
      console.log('🔧 Attempting bulk configuration...');
      await service.configureSequentialAddresses(1, 5);
      
    } catch (configError) {
      console.error('❌ Configuration failed, restoring backup...');
      service.restoreConfigurationBackup(backup);
      console.log('🔄 Configuration restored from backup');
    }
    
    // Display current device cache
    const devices = service.getKnownDevices();
    console.log(`📋 Current device cache: ${devices.size} devices`);
    
  } catch (error) {
    console.error('❌ Backup/rollback error:', error);
  } finally {
    await service.close();
  }
}

/**
 * Example 7: Integration with Hardware Configuration Wizard
 * Show how the service integrates with the wizard workflow
 */
async function wizardIntegrationExample() {
  const service = new SlaveAddressService({
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    timeout: 2000,
    maxRetries: 3,
    retryDelay: 1000
  });

  try {
    await service.initialize();
    
    // Step 1: Scan for existing devices and conflicts
    console.log('📋 Step 1: Scanning existing configuration...');
    const conflicts = await service.detectAddressConflicts();
    
    if (conflicts.length > 0) {
      console.log(`⚠️ Found ${conflicts.length} conflicts, resolving...`);
      await service.resolveAddressConflicts(conflicts);
    }
    
    // Step 2: Find next available address for new card
    console.log('📋 Step 2: Finding address for new card...');
    const newAddress = await service.findNextAvailableAddress();
    console.log(`✅ New card will be configured to address ${newAddress}`);
    
    // Step 3: Configure new card
    console.log('📋 Step 3: Configuring new card...');
    const result = await service.configureBroadcastAddress(newAddress);
    
    if (result.success) {
      console.log(`✅ New card configured successfully to address ${newAddress}`);
      console.log(`📊 Configuration time: ${result.responseTime}ms`);
      console.log(`✅ Verification: ${result.verificationPassed ? 'PASSED' : 'FAILED'}`);
      
      // Step 4: Update system configuration (would be done by wizard)
      console.log('📋 Step 4: Card ready for system integration');
      
    } else {
      console.error(`❌ Card configuration failed: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Wizard integration error:', error);
  } finally {
    await service.close();
  }
}

// Export examples for use in other modules
export {
  basicAddressConfiguration,
  addressDiscoveryExample,
  bulkConfigurationExample,
  conflictResolutionExample,
  eventDrivenExample,
  backupRollbackExample,
  wizardIntegrationExample
};

// Run examples if called directly
if (require.main === module) {
  console.log('🚀 Slave Address Service Examples');
  console.log('==================================');
  
  // Uncomment the example you want to run:
  // basicAddressConfiguration();
  // addressDiscoveryExample();
  // bulkConfigurationExample();
  // conflictResolutionExample();
  // eventDrivenExample();
  // backupRollbackExample();
  wizardIntegrationExample();
}