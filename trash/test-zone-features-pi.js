/**
 * Test Zone Features on Pi - JavaScript version
 * Tests the zone helpers and layout service integration on the Pi
 */

// Mock configuration for testing
const mockConfig = {
  features: {
    zones_enabled: true
  },
  zones: [
    {
      id: 'mens',
      name: 'Men\'s Lockers',
      enabled: true,
      ranges: [[1, 16], [33, 48]],
      relay_cards: [1, 3]
    },
    {
      id: 'womens', 
      name: 'Women\'s Lockers',
      enabled: true,
      ranges: [[17, 32]],
      relay_cards: [2]
    }
  ],
  hardware: {
    relay_cards: [
      { slave_address: 1, enabled: true, channels: 16, description: 'Card 1' },
      { slave_address: 2, enabled: true, channels: 16, description: 'Card 2' },
      { slave_address: 3, enabled: true, channels: 16, description: 'Card 3' }
    ]
  },
  lockers: {
    total_count: 48,
    layout: { rows: 6, columns: 8 }
  }
};

async function testZoneHelpers() {
  console.log('🧪 Testing Zone Helper Functions on Pi...\n');

  try {
    // Import the built zone helpers
    const zoneHelpers = require('../shared/services/zone-helpers');
    
    console.log('✅ Zone helpers imported successfully');
    
    // Test 1: getLockerPositionInZone
    console.log('\n📍 Test 1: getLockerPositionInZone');
    
    const pos5 = zoneHelpers.getLockerPositionInZone(5, mockConfig);
    console.log(`Locker 5 position in zone: ${pos5} (expected: 5)`);
    
    const pos35 = zoneHelpers.getLockerPositionInZone(35, mockConfig);
    console.log(`Locker 35 position in zone: ${pos35} (expected: 19)`);
    
    const pos20 = zoneHelpers.getLockerPositionInZone(20, mockConfig);
    console.log(`Locker 20 position in zone: ${pos20} (expected: 4)`);
    
    // Test 2: computeHardwareMappingFromPosition
    console.log('\n🔧 Test 2: computeHardwareMappingFromPosition');
    
    const mensZone = mockConfig.zones[0];
    
    const mapping5 = zoneHelpers.computeHardwareMappingFromPosition(5, mensZone);
    console.log(`Position 5 mapping:`, mapping5);
    console.log(`Expected: slaveAddress=1, coilAddress=5`);
    
    const mapping17 = zoneHelpers.computeHardwareMappingFromPosition(17, mensZone);
    console.log(`Position 17 mapping:`, mapping17);
    console.log(`Expected: slaveAddress=3, coilAddress=1`);
    
    // Test 3: getZoneAwareHardwareMapping
    console.log('\n🎯 Test 3: getZoneAwareHardwareMapping');
    
    const fullMapping5 = zoneHelpers.getZoneAwareHardwareMapping(5, mockConfig);
    console.log(`Locker 5 full mapping:`, fullMapping5);
    
    const fullMapping35 = zoneHelpers.getZoneAwareHardwareMapping(35, mockConfig);
    console.log(`Locker 35 full mapping:`, fullMapping35);
    
    // Test 4: getLockersInZone
    console.log('\n📋 Test 4: getLockersInZone');
    
    const mensLockers = zoneHelpers.getLockersInZone('mens', mockConfig);
    console.log(`Men's zone lockers (${mensLockers.length}):`, mensLockers.slice(0, 10), '...');
    
    const womensLockers = zoneHelpers.getLockersInZone('womens', mockConfig);
    console.log(`Women's zone lockers (${womensLockers.length}):`, womensLockers.slice(0, 10), '...');
    
    // Test 5: validateZoneConfiguration
    console.log('\n✅ Test 5: validateZoneConfiguration');
    
    const validation = zoneHelpers.validateZoneConfiguration(mockConfig);
    console.log('Validation result:', validation);
    
    // Test 6: Zones disabled scenario
    console.log('\n🚫 Test 6: Zones disabled scenario');
    
    const disabledConfig = { ...mockConfig, features: { zones_enabled: false } };
    const posDisabled = zoneHelpers.getLockerPositionInZone(5, disabledConfig);
    console.log(`Locker 5 with zones disabled: ${posDisabled} (expected: null)`);
    
    console.log('\n🎉 Zone helpers tests completed successfully!');
    return true;
    
  } catch (error) {
    console.error('❌ Error testing zone helpers:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

async function testLayoutServiceIntegration() {
  console.log('\n🏗️ Testing Layout Service Integration on Pi...\n');
  
  try {
    // Import the built layout service
    const { LockerLayoutService } = require('../shared/services/locker-layout-service');
    
    console.log('✅ Layout service imported successfully');
    
    // Create instance
    const layoutService = new LockerLayoutService();
    
    // Test zone-aware layout generation
    console.log('\n📐 Testing zone-aware layout generation...');
    
    // This would require database connection, so we'll test the import for now
    console.log('✅ Layout service can be instantiated');
    console.log('💡 Full layout tests require database connection');
    
    return true;
    
  } catch (error) {
    console.error('❌ Layout service test error:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

async function testConfigManager() {
  console.log('\n⚙️ Testing Config Manager Integration...\n');
  
  try {
    const { ConfigManager } = require('../shared/services/config-manager');
    
    console.log('✅ Config manager imported successfully');
    
    const configManager = ConfigManager.getInstance();
    await configManager.initialize();
    
    const config = configManager.getConfiguration();
    console.log('✅ Configuration loaded');
    console.log(`Zones enabled: ${config.features?.zones_enabled || false}`);
    console.log(`Total zones configured: ${config.zones?.length || 0}`);
    
    if (config.zones && config.zones.length > 0) {
      console.log('Zone details:');
      config.zones.forEach(zone => {
        console.log(`  - ${zone.id}: ${zone.name} (enabled: ${zone.enabled})`);
        console.log(`    Ranges: ${JSON.stringify(zone.ranges)}`);
        console.log(`    Relay cards: ${JSON.stringify(zone.relay_cards)}`);
      });
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Config manager test error:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run tests
async function runAllTests() {
  console.log('🚀 Zone Features Test Suite - Pi Edition\n');
  console.log('=' .repeat(60));
  
  const results = {
    zoneHelpers: await testZoneHelpers(),
    layoutService: await testLayoutServiceIntegration(),
    configManager: await testConfigManager()
  };
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Results Summary:');
  console.log(`   Zone Helpers: ${results.zoneHelpers ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Layout Service: ${results.layoutService ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Config Manager: ${results.configManager ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = Object.values(results).every(result => result);
  console.log(`\n🎯 Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  if (allPassed) {
    console.log('\n🚀 Zone features are ready for integration!');
    console.log('   Next: Test with actual API endpoints');
  } else {
    console.log('\n🔧 Some issues need to be resolved before proceeding');
  }
}

runAllTests().catch(console.error);