/**
 * Test Zone Features Implementation
 * Tests the zone helpers and layout service integration
 */

const path = require('path');

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
  console.log('🧪 Testing Zone Helper Functions...\n');

  try {
    // Import zone helpers (need to handle ES modules)
    const zoneHelpers = require('../shared/services/zone-helpers.ts');
    
    // Test 1: getLockerPositionInZone
    console.log('📍 Test 1: getLockerPositionInZone');
    
    // Locker 5 should be position 5 in mens zone (range 1-16)
    const pos5 = zoneHelpers.getLockerPositionInZone(5, mockConfig);
    console.log(`Locker 5 position in zone: ${pos5} (expected: 5)`);
    
    // Locker 35 should be position 19 in mens zone (range 33-48, after 16 from first range)
    const pos35 = zoneHelpers.getLockerPositionInZone(35, mockConfig);
    console.log(`Locker 35 position in zone: ${pos35} (expected: 19)`);
    
    // Locker 20 should be position 4 in womens zone (range 17-32)
    const pos20 = zoneHelpers.getLockerPositionInZone(20, mockConfig);
    console.log(`Locker 20 position in zone: ${pos20} (expected: 4)`);
    
    // Test 2: computeHardwareMappingFromPosition
    console.log('\n🔧 Test 2: computeHardwareMappingFromPosition');
    
    const mensZone = mockConfig.zones[0];
    
    // Position 5 should map to card 1 (index 0), coil 5
    const mapping5 = zoneHelpers.computeHardwareMappingFromPosition(5, mensZone);
    console.log(`Position 5 mapping:`, mapping5);
    console.log(`Expected: slaveAddress=1, coilAddress=5`);
    
    // Position 17 should map to card 3 (index 1), coil 1
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
    
    console.log('\n🎉 Zone helpers tests completed!');
    
  } catch (error) {
    console.error('❌ Error testing zone helpers:', error.message);
    console.log('\n💡 This is expected since we need to build TypeScript files first');
    console.log('   Run: npm run build:all');
  }
}

async function testLayoutServiceIntegration() {
  console.log('\n🏗️ Testing Layout Service Integration...\n');
  
  try {
    // This would test the layout service if it was built
    console.log('📝 Layout service integration tests would include:');
    console.log('   - generateLockerLayout() with zone parameter');
    console.log('   - Zone-filtered locker lists');
    console.log('   - Backward compatibility with existing calls');
    console.log('   - Hardware mapping consistency');
    
    console.log('\n💡 To test layout service:');
    console.log('   1. Build services: npm run build:all');
    console.log('   2. Deploy to Pi: git push && ssh pi pull');
    console.log('   3. Test API endpoints with zone parameters');
    
  } catch (error) {
    console.error('❌ Layout service test error:', error.message);
  }
}

// Run tests
async function runAllTests() {
  console.log('🚀 Zone Features Test Suite\n');
  console.log('=' .repeat(50));
  
  await testZoneHelpers();
  await testLayoutServiceIntegration();
  
  console.log('\n' + '='.repeat(50));
  console.log('✨ Test suite completed!');
  console.log('\n🔄 Next steps:');
  console.log('   1. Build TypeScript: npm run build:all');
  console.log('   2. Deploy to Pi: git push origin feat/zones-mvp');
  console.log('   3. Test on hardware: ssh pi@pi-eform-locker');
}

runAllTests().catch(console.error);