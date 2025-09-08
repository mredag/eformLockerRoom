/**
 * Test script for zone-aware API endpoints
 * Run with: node test-zone-api.js
 */

const PI_IP = '192.168.1.11';
const KIOSK_PORT = '3002';
const BASE_URL = `http://${PI_IP}:${KIOSK_PORT}`;

async function testZoneAPI() {
  console.log('🧪 Testing Zone-Aware Kiosk API\n');

  try {
    // Test 1: Get all lockers (no zone)
    console.log('📋 Test 1: GET /api/lockers/all (no zone)');
    const allResponse = await fetch(`${BASE_URL}/api/lockers/all?kiosk_id=kiosk-1`);
    const allLockers = await allResponse.json();
    console.log(`✅ Found ${allLockers.length} total lockers`);
    console.log('Sample:', allLockers.slice(0, 3));
    console.log();

    // Test 2: Get all lockers (with zone)
    console.log('📋 Test 2: GET /api/lockers/all?zone=mens');
    const zoneAllResponse = await fetch(`${BASE_URL}/api/lockers/all?kiosk_id=kiosk-1&zone=mens`);
    const zoneAllLockers = await zoneAllResponse.json();
    console.log(`✅ Found ${zoneAllLockers.length} lockers in mens zone`);
    console.log('Sample:', zoneAllLockers.slice(0, 3));
    console.log();

    // Test 3: Get available lockers (no zone)
    console.log('📋 Test 3: GET /api/lockers/available (no zone)');
    const availableResponse = await fetch(`${BASE_URL}/api/lockers/available?kiosk_id=kiosk-1`);
    const availableLockers = await availableResponse.json();
    console.log(`✅ Found ${availableLockers.length} available lockers`);
    console.log('Sample:', availableLockers.slice(0, 3));
    console.log();

    // Test 4: Get available lockers (with zone)
    console.log('📋 Test 4: GET /api/lockers/available?zone=mens');
    const zoneAvailableResponse = await fetch(`${BASE_URL}/api/lockers/available?kiosk_id=kiosk-1&zone=mens`);
    const zoneAvailableLockers = await zoneAvailableResponse.json();
    console.log(`✅ Found ${zoneAvailableLockers.length} available lockers in mens zone`);
    console.log('Sample:', zoneAvailableLockers.slice(0, 3));
    console.log();

    // Test 5: Open locker with zone mapping
    console.log('🔓 Test 5: POST /api/locker/open (zone-aware)');
    const openResponse = await fetch(`${BASE_URL}/api/locker/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        locker_id: 17,
        staff_user: 'zone-test',
        reason: 'Testing zone-aware hardware mapping'
      })
    });
    
    const openResult = await openResponse.json();
    console.log('✅ Open result:', openResult);
    
    if (openResult.zone_mapping) {
      console.log(`🎯 Zone mapping used: locker 17 → slave ${openResult.zone_mapping.slave_address}, coil ${openResult.zone_mapping.coil_address}`);
      console.log(`Expected for mens zone [1-32] on cards [1,2]: slave 2, coil 1`);
    } else {
      console.log('🔧 Traditional mapping used (zones disabled or locker not in zone)');
    }
    console.log();

    // Test 6: Validation - compare zone vs no-zone results
    console.log('🔍 Test 6: Validation');
    console.log(`Total lockers (no zone): ${allLockers.length}`);
    console.log(`Zone lockers (mens): ${zoneAllLockers.length}`);
    console.log(`Available (no zone): ${availableLockers.length}`);
    console.log(`Available (mens): ${zoneAvailableLockers.length}`);
    
    // Check if zone filtering is working
    if (zoneAllLockers.length > 0 && zoneAllLockers.length <= allLockers.length) {
      console.log('✅ Zone filtering appears to be working correctly');
    } else {
      console.log('⚠️  Zone filtering may not be working as expected');
    }

    console.log('\n✅ All zone API tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error(`💡 Make sure the kiosk service is running on ${BASE_URL}`);
      console.error('   Try: ssh pi@pi-eform-locker "cd /home/pi/eform-locker && npm run start:kiosk"');
    }
  }
}

// Run tests
testZoneAPI();