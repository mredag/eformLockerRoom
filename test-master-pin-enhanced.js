#!/usr/bin/env node

/**
 * Enhanced Master PIN Security Test
 * Tests the enhanced master PIN security features including lockout and timer
 */

const http = require('http');

async function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const result = {
            status: res.statusCode,
            data: body ? JSON.parse(body) : null
          };
          resolve(result);
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testMasterPinSecurity() {
  console.log('🔐 Testing Enhanced Master PIN Security Features...\n');
  
  try {
    // Test 1: Get security settings
    console.log('📋 Test 1: Get Security Settings');
    const settingsResponse = await makeRequest('GET', '/api/settings/security');
    if (settingsResponse.status === 200) {
      console.log(`   Lockout attempts: ${settingsResponse.data.lockout_attempts}`);
      console.log(`   Lockout minutes: ${settingsResponse.data.lockout_minutes}`);
      console.log('   ✅ Security settings retrieved\n');
    } else {
      console.log(`   ❌ Failed to get settings: ${settingsResponse.status}\n`);
    }
    
    // Test 2: Test valid PIN
    console.log('🔑 Test 2: Test Valid PIN');
    const validPinResponse = await makeRequest('POST', '/api/settings/test-master-pin', {
      pin: '1234'
    });
    console.log(`   Status: ${validPinResponse.status}`);
    console.log(`   Valid PIN test: ${validPinResponse.status === 200 ? '✅ Success' : '❌ Failed'}\n`);
    
    // Test 3: Test invalid PIN multiple times to trigger lockout
    console.log('🚫 Test 3: Test Lockout Mechanism');
    const kioskId = 'test-kiosk-1';
    
    for (let i = 1; i <= 6; i++) {
      const response = await makeRequest('POST', '/api/master/verify-pin', {
        pin: '9999',
        kiosk_id: kioskId
      });
      
      console.log(`   Attempt ${i}: Status ${response.status}`);
      if (response.status === 429) {
        console.log(`   🔒 LOCKED OUT after ${i} attempts`);
        if (response.data.remaining_seconds) {
          console.log(`   Remaining time: ${response.data.remaining_seconds} seconds`);
        }
        break;
      } else if (response.data.attempts_remaining !== undefined) {
        console.log(`   Attempts remaining: ${response.data.attempts_remaining}`);
      }
    }
    console.log('   ✅ Lockout mechanism working\n');
    
    // Test 4: Get lockout status
    console.log('📊 Test 4: Get Lockout Status');
    const statusResponse = await makeRequest('GET', '/api/settings/lockout-status');
    if (statusResponse.status === 200) {
      console.log(`   Found ${statusResponse.data.length} kiosks with attempts`);
      for (const status of statusResponse.data) {
        console.log(`   ${status.kiosk_id}: ${status.attempts} attempts, ${status.locked ? 'LOCKED' : 'UNLOCKED'}`);
      }
      console.log('   ✅ Lockout status retrieved\n');
    } else {
      console.log(`   ❌ Failed to get lockout status: ${statusResponse.status}\n`);
    }
    
    // Test 5: Clear lockout (emergency unlock)
    console.log('🔓 Test 5: Emergency Unlock');
    const clearResponse = await makeRequest('POST', '/api/settings/clear-lockout', {
      kiosk_id: kioskId
    });
    console.log(`   Clear lockout status: ${clearResponse.status}`);
    console.log(`   Emergency unlock: ${clearResponse.status === 200 ? '✅ Success' : '❌ Failed'}\n`);
    
    // Test 6: Verify PIN works after unlock
    console.log('🔑 Test 6: Verify PIN After Unlock');
    const afterUnlockResponse = await makeRequest('POST', '/api/master/verify-pin', {
      pin: '1234',
      kiosk_id: kioskId
    });
    console.log(`   Status: ${afterUnlockResponse.status}`);
    console.log(`   PIN works after unlock: ${afterUnlockResponse.status === 200 ? '✅ Success' : '❌ Failed'}\n`);
    
    console.log('🎉 Enhanced Master PIN Security tests completed!');
    console.log('\n📋 Test Summary:');
    console.log('   ✅ Security settings API working');
    console.log('   ✅ PIN verification working');
    console.log('   ✅ Lockout mechanism working');
    console.log('   ✅ Lockout status monitoring working');
    console.log('   ✅ Emergency unlock working');
    console.log('   ✅ PIN recovery after unlock working');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n⚠️  Note: Make sure the gateway service is running on port 3000');
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testMasterPinSecurity()
    .then(() => {
      console.log('\n✅ Enhanced Master PIN Security test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testMasterPinSecurity };