#!/usr/bin/env node

/**
 * Simple test script for locker system fixes
 * Tests the three main fixes without starting/stopping services
 */

const http = require('http');

async function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'TestClient/1.0',
        'Accept': 'application/json',
        ...options.headers
      }
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function testAPI() {
  console.log('🧪 Testing Locker System Fixes');
  console.log('================================');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: API endpoint without kioskId (should return 400)
  try {
    console.log('\n1. Testing API without kioskId parameter...');
    const response = await makeRequest('/api/lockers');
    
    if (response.statusCode === 400) {
      try {
        const data = JSON.parse(response.body);
        if (data.code === 'bad_request') {
          console.log('✅ PASS: API returns 400 with proper error format');
          passed++;
        } else {
          console.log('❌ FAIL: API returns 400 but wrong error format');
          failed++;
        }
      } catch (e) {
        console.log('❌ FAIL: API returns 400 but non-JSON response');
        failed++;
      }
    } else {
      console.log(`❌ FAIL: Expected 400, got ${response.statusCode}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: Request failed - ${error.message}`);
    failed++;
  }
  
  // Test 2: API endpoint with kioskId (should work or return 401)
  try {
    console.log('\n2. Testing API with kioskId parameter...');
    const response = await makeRequest('/api/lockers?kioskId=K1');
    
    if (response.statusCode === 200) {
      try {
        const data = JSON.parse(response.body);
        if (data.lockers && Array.isArray(data.lockers)) {
          console.log(`✅ PASS: API returns 200 with ${data.lockers.length} lockers`);
          passed++;
        } else {
          console.log('❌ FAIL: API returns 200 but missing lockers array');
          failed++;
        }
      } catch (e) {
        console.log('❌ FAIL: API returns 200 but non-JSON response');
        failed++;
      }
    } else if (response.statusCode === 401) {
      try {
        const data = JSON.parse(response.body);
        if (data.code === 'unauthorized' && data.message === 'login required') {
          console.log('✅ PASS: API returns 401 with proper error format');
          passed++;
        } else {
          console.log('❌ FAIL: API returns 401 but wrong error format');
          failed++;
        }
      } catch (e) {
        console.log('❌ FAIL: API returns 401 but non-JSON response');
        failed++;
      }
    } else {
      console.log(`❌ FAIL: Expected 200 or 401, got ${response.statusCode}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: Request failed - ${error.message}`);
    failed++;
  }
  
  // Test 3: Root route redirect behavior
  try {
    console.log('\n3. Testing root route redirect behavior...');
    const response = await makeRequest('/');
    
    if (response.statusCode === 302) {
      const location = response.headers.location;
      if (location && (location.includes('/login') || location.includes('/dashboard'))) {
        console.log(`✅ PASS: Root route redirects to ${location}`);
        passed++;
      } else {
        console.log(`❌ FAIL: Root route redirects to unexpected location: ${location}`);
        failed++;
      }
    } else if (response.statusCode === 200) {
      console.log('✅ PASS: Root route serves content directly');
      passed++;
    } else {
      console.log(`❌ FAIL: Unexpected root route response: ${response.statusCode}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: Root route test failed - ${error.message}`);
    failed++;
  }
  
  // Test 4: Check if lockers page exists
  try {
    console.log('\n4. Testing lockers page accessibility...');
    const response = await makeRequest('/lockers');
    
    if (response.statusCode === 200 || response.statusCode === 302) {
      console.log('✅ PASS: Lockers page is accessible');
      passed++;
    } else {
      console.log(`❌ FAIL: Lockers page returned ${response.statusCode}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: Lockers page test failed - ${error.message}`);
    failed++;
  }
  
  // Test 5: Check CSP headers
  try {
    console.log('\n5. Testing CSP headers...');
    const response = await makeRequest('/');
    
    const cspHeader = response.headers['content-security-policy'] || 
                     response.headers['content-security-policy-report-only'];
    
    if (cspHeader) {
      console.log(`✅ PASS: CSP header found - ${cspHeader.substring(0, 50)}...`);
      passed++;
    } else {
      console.log('ℹ️  INFO: No CSP header found (may not be implemented yet)');
      // Don't count as pass or fail
    }
  } catch (error) {
    console.log(`❌ FAIL: CSP test failed - ${error.message}`);
    failed++;
  }
  
  // Summary
  console.log('\n📊 Test Results Summary');
  console.log('=======================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! The main fixes appear to be working.');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed. Please review the issues above.`);
  }
  
  console.log('\n📋 Manual Tests Still Needed:');
  console.log('- Open browser and test login flow (no redirect loops)');
  console.log('- Test locker loading in browser UI');
  console.log('- Test with/without browser extensions');
  console.log('- Verify error messages appear in UI');
  
  return failed === 0;
}

// Run the test
testAPI().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});