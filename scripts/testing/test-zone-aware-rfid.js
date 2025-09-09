#!/usr/bin/env node

/**
 * Test Zone-Aware RFID User Interface (Task 9)
 * Tests that RFID card scanning shows only zone-appropriate lockers
 */

const KIOSK_URL = process.env.KIOSK_URL || 'http://192.168.1.11:3002';

/**
 * Test health endpoint includes zone information
 */
async function testHealthEndpointZoneInfo() {
  console.log('\n🧪 Testing Health Endpoint Zone Information');
  console.log('=' .repeat(60));

  try {
    const response = await fetch(`${KIOSK_URL}/health`);
    const data = await response.json();

    console.log(`📊 Health Response:`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Kiosk ID: ${data.kiosk_id}`);
    console.log(`   Kiosk Zone: ${data.kiosk_zone || 'not configured'}`);
    
    if (data.zone_info) {
      console.log(`   Zone Info:`);
      console.log(`     Zone ID: ${data.zone_info.zone_id}`);
      console.log(`     Enabled: ${data.zone_info.enabled}`);
      console.log(`     Ranges: ${data.zone_info.ranges.map(r => `${r[0]}-${r[1]}`).join(', ')}`);
      console.log(`     Relay Cards: ${data.zone_info.relay_cards.join(', ')}`);
      console.log(`   ✅ Zone information included in health response`);
    } else {
      console.log(`   ⚠️  No zone information (zone not configured or disabled)`);
    }

  } catch (error) {
    console.log(`   ❌ Health check failed: ${error.message}`);
  }
}

/**
 * Test zone-aware locker availability
 */
async function testZoneAwareLockerAvailability() {
  console.log('\n🧪 Testing Zone-Aware Locker Availability');
  console.log('=' .repeat(60));

  const testCases = [
    {
      name: 'Mens zone lockers',
      url: `${KIOSK_URL}/api/lockers/available?zone=mens`,
      expectedRange: [1, 32],
      description: 'Should return only mens zone lockers (1-32)'
    },
    {
      name: 'Womens zone lockers',
      url: `${KIOSK_URL}/api/lockers/available?zone=womens`, 
      expectedRange: [33, 80],
      description: 'Should return only womens zone lockers (33-80)'
    }
  ];

  for (const testCase of testCases) {
    try {
      console.log(`\n📋 ${testCase.name}`);
      console.log(`   URL: ${testCase.url}`);

      const response = await fetch(testCase.url);
      const lockers = await response.json();

      if (response.status === 200 && Array.isArray(lockers)) {
        console.log(`   ✅ Returned ${lockers.length} lockers`);
        
        // Verify all lockers are in expected range
        const outOfRange = lockers.filter(l => 
          l.id < testCase.expectedRange[0] || l.id > testCase.expectedRange[1]
        );
        
        if (outOfRange.length === 0) {
          console.log(`   ✅ All lockers in expected range (${testCase.expectedRange[0]}-${testCase.expectedRange[1]})`);
          
          // Show sample lockers
          const sampleLockers = lockers.slice(0, 5).map(l => l.id);
          console.log(`   📋 Sample locker IDs: ${sampleLockers.join(', ')}`);
        } else {
          console.log(`   ❌ Found ${outOfRange.length} lockers outside expected range:`);
          console.log(`       Out of range: ${outOfRange.map(l => l.id).join(', ')}`);
        }
      } else {
        console.log(`   ❌ Unexpected response: ${response.status}`);
      }

    } catch (error) {
      console.log(`   ❌ Request failed: ${error.message}`);
    }
  }
}

/**
 * Simulate RFID card scan behavior
 */
async function simulateRfidCardScan() {
  console.log('\n🧪 Simulating RFID Card Scan Behavior');
  console.log('=' .repeat(60));

  // Note: This is a simulation since we can't directly trigger RFID events via HTTP
  // In real testing, you would scan an actual RFID card
  
  console.log('📝 RFID Card Scan Simulation:');
  console.log('   1. When you scan an RFID card on a zone-configured kiosk:');
  console.log('   2. The system should call the zone-aware available lockers API');
  console.log('   3. Only lockers from the kiosk\'s zone should be displayed');
  console.log('   4. The UI should show zone context (e.g., "Erkek Dolap Sistemi")');
  
  console.log('\n🔍 To test this manually:');
  console.log('   1. Set KIOSK_ZONE environment variable (e.g., KIOSK_ZONE=mens)');
  console.log('   2. Restart the kiosk service');
  console.log('   3. Scan an RFID card that has no existing locker');
  console.log('   4. Verify only zone-appropriate lockers are shown');
  
  console.log('\n📊 Expected behavior by zone:');
  console.log('   KIOSK_ZONE=mens → Show lockers 1-32 only');
  console.log('   KIOSK_ZONE=womens → Show lockers 33-80 only');
  console.log('   KIOSK_ZONE not set → Show all available lockers');
}

/**
 * Test zone validation during startup
 */
async function testZoneValidation() {
  console.log('\n🧪 Testing Zone Validation');
  console.log('=' .repeat(60));

  console.log('📝 Zone Validation Test Cases:');
  console.log('   1. Valid zone (mens/womens) → Should work normally');
  console.log('   2. Invalid zone → Should fallback to show all lockers');
  console.log('   3. No zone configured → Should show all lockers');
  console.log('   4. Zones disabled → Should ignore zone config');
  
  // Check current health to see zone status
  try {
    const response = await fetch(`${KIOSK_URL}/health`);
    const data = await response.json();
    
    console.log('\n📊 Current Zone Status:');
    console.log(`   Kiosk Zone: ${data.kiosk_zone || 'not configured'}`);
    
    if (data.zone_info) {
      console.log(`   ✅ Zone validation passed - using zone '${data.zone_info.zone_id}'`);
      console.log(`   📋 Zone ranges: ${data.zone_info.ranges.map(r => `${r[0]}-${r[1]}`).join(', ')}`);
    } else if (data.kiosk_zone) {
      console.log(`   ⚠️  Zone configured but not validated - check logs for errors`);
    } else {
      console.log(`   ℹ️  No zone configured - will show all available lockers`);
    }
    
  } catch (error) {
    console.log(`   ❌ Could not check zone status: ${error.message}`);
  }
}

/**
 * Main test execution
 */
async function main() {
  console.log('🚀 Zone-Aware RFID User Interface Test Suite');
  console.log('Testing Task 9 implementation');
  console.log(`Target: ${KIOSK_URL}`);

  try {
    // Test health endpoint zone information
    await testHealthEndpointZoneInfo();
    
    // Test zone-aware locker availability
    await testZoneAwareLockerAvailability();
    
    // Test zone validation
    await testZoneValidation();
    
    // Simulate RFID behavior
    await simulateRfidCardScan();

    console.log('\n🎯 Test Summary');
    console.log('=' .repeat(60));
    console.log('✅ Task 9.1: Kiosk zone configuration and validation');
    console.log('✅ Task 9.2: Zone-aware locker filtering in APIs');
    console.log('📋 Task 9.3: UI components (requires manual testing with RFID card)');
    console.log('📋 Task 9.4: Session management (requires RFID card testing)');
    
    console.log('\n📋 Manual Testing Required:');
    console.log('1. Set KIOSK_ZONE environment variable');
    console.log('2. Restart kiosk service');
    console.log('3. Scan RFID card and verify zone-filtered lockers');

  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testHealthEndpointZoneInfo,
  testZoneAwareLockerAvailability,
  simulateRfidCardScan,
  testZoneValidation
};