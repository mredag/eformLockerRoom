#!/usr/bin/env node

/**
 * Quick test to verify the console error fixes
 */

const http = require('http');

async function testAPI() {
  console.log('🧪 Testing Console Error Fixes');
  console.log('===============================');
  
  try {
    // Test the API endpoint
    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/api/lockers?kioskId=K1',
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }, resolve);
      
      req.on('error', reject);
      req.end();
    });
    
    let data = '';
    response.on('data', chunk => data += chunk);
    
    await new Promise(resolve => response.on('end', resolve));
    
    console.log(`Status: ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      try {
        const parsed = JSON.parse(data);
        if (parsed.lockers && Array.isArray(parsed.lockers)) {
          console.log('✅ API returns proper array format');
          console.log(`✅ Found ${parsed.lockers.length} lockers`);
        } else {
          console.log('❌ API response missing lockers array');
          console.log('Response:', data);
        }
      } catch (e) {
        console.log('❌ API response not valid JSON');
        console.log('Response:', data);
      }
    } else if (response.statusCode === 401) {
      try {
        const parsed = JSON.parse(data);
        if (parsed.code === 'unauthorized') {
          console.log('✅ 401 error has proper format');
        }
      } catch (e) {
        console.log('❌ 401 response not valid JSON');
      }
    } else {
      console.log(`Response: ${data}`);
    }
    
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`);
  }
  
  console.log('\n📋 Manual Browser Tests:');
  console.log('1. Open http://localhost:3001/lockers');
  console.log('2. Check console - should have fewer CSP violations');
  console.log('3. Select a kiosk and verify lockers load');
  console.log('4. Check Network tab for CSP report responses');
}

testAPI();