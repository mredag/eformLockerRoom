#!/usr/bin/env node

/**
 * Test script to validate the authentication cookie fix
 * This script tests the session cookie behavior over HTTP
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Configuration
const PANEL_URL = process.env.PANEL_URL || 'http://localhost:3002';
const TEST_USERNAME = process.env.TEST_USERNAME || 'admin';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'admin123';

console.log('🧪 Testing Authentication Cookie Fix');
console.log(`📍 Panel URL: ${PANEL_URL}`);
console.log(`👤 Test User: ${TEST_USERNAME}`);
console.log('');

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AuthTestScript/1.0',
        ...options.headers
      }
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          cookies: res.headers['set-cookie'] || []
        });
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// Extract session cookie from Set-Cookie headers
function extractSessionCookie(cookies) {
  for (const cookie of cookies) {
    if (cookie.startsWith('session=')) {
      return cookie.split(';')[0].split('=')[1];
    }
  }
  return null;
}

// Check if cookie has Secure flag
function hasSecureFlag(cookies) {
  for (const cookie of cookies) {
    if (cookie.startsWith('session=')) {
      return cookie.toLowerCase().includes('secure');
    }
  }
  return false;
}

async function testAuthenticationFlow() {
  try {
    console.log('1️⃣ Testing login endpoint...');
    
    // Step 1: Login
    const loginResponse = await makeRequest(`${PANEL_URL}/auth/login`, {
      method: 'POST',
      body: {
        username: TEST_USERNAME,
        password: TEST_PASSWORD
      }
    });

    console.log(`   Status: ${loginResponse.statusCode}`);
    
    if (loginResponse.statusCode !== 200) {
      console.log(`   Response: ${loginResponse.body}`);
      throw new Error(`Login failed with status ${loginResponse.statusCode}`);
    }

    // Check cookie settings
    const sessionCookie = extractSessionCookie(loginResponse.cookies);
    const hasSecure = hasSecureFlag(loginResponse.cookies);
    
    console.log(`   ✅ Login successful`);
    console.log(`   🍪 Session cookie: ${sessionCookie ? sessionCookie.substring(0, 16) + '...' : 'NOT FOUND'}`);
    console.log(`   🔒 Secure flag: ${hasSecure ? 'YES (❌ PROBLEM for HTTP)' : 'NO (✅ CORRECT for HTTP)'}`);
    console.log(`   📋 Set-Cookie headers:`, loginResponse.cookies);

    if (!sessionCookie) {
      throw new Error('No session cookie received');
    }

    console.log('');
    console.log('2️⃣ Testing /auth/me endpoint with session cookie...');

    // Step 2: Test /auth/me with the session cookie
    const meResponse = await makeRequest(`${PANEL_URL}/auth/me`, {
      headers: {
        'Cookie': `session=${sessionCookie}`
      }
    });

    console.log(`   Status: ${meResponse.statusCode}`);
    
    if (meResponse.statusCode === 200) {
      console.log(`   ✅ /auth/me successful - cookie is being sent and accepted`);
      const userData = JSON.parse(meResponse.body);
      console.log(`   👤 User: ${userData.user.username} (${userData.user.role})`);
    } else {
      console.log(`   ❌ /auth/me failed - cookie not being sent or accepted`);
      console.log(`   Response: ${meResponse.body}`);
    }

    console.log('');
    console.log('3️⃣ Testing dashboard access...');

    // Step 3: Test dashboard access
    const dashboardResponse = await makeRequest(`${PANEL_URL}/dashboard`, {
      headers: {
        'Cookie': `session=${sessionCookie}`,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    console.log(`   Status: ${dashboardResponse.statusCode}`);
    
    if (dashboardResponse.statusCode === 200) {
      console.log(`   ✅ Dashboard access successful`);
    } else if (dashboardResponse.statusCode === 302) {
      console.log(`   ⚠️  Dashboard redirected to: ${dashboardResponse.headers.location}`);
      if (dashboardResponse.headers.location?.includes('login')) {
        console.log(`   ❌ Still redirecting to login - authentication issue persists`);
      }
    } else {
      console.log(`   ❌ Dashboard access failed`);
      console.log(`   Response: ${dashboardResponse.body.substring(0, 200)}...`);
    }

    console.log('');
    console.log('4️⃣ Testing logout...');

    // Step 4: Test logout
    const logoutResponse = await makeRequest(`${PANEL_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Cookie': `session=${sessionCookie}`
      }
    });

    console.log(`   Status: ${logoutResponse.statusCode}`);
    console.log(`   ✅ Logout completed`);

    console.log('');
    console.log('🎉 Authentication cookie test completed!');
    
    // Summary
    console.log('');
    console.log('📊 SUMMARY:');
    console.log(`   • Login: ${loginResponse.statusCode === 200 ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   • Cookie Secure flag: ${hasSecure ? '❌ ENABLED (problematic for HTTP)' : '✅ DISABLED (correct for HTTP)'}`);
    console.log(`   • /auth/me: ${meResponse.statusCode === 200 ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   • Dashboard: ${dashboardResponse.statusCode === 200 ? '✅ SUCCESS' : dashboardResponse.statusCode === 302 ? '⚠️ REDIRECT' : '❌ FAILED'}`);

    if (!hasSecure && meResponse.statusCode === 200) {
      console.log('');
      console.log('🎯 RESULT: Cookie fix appears to be working correctly!');
      console.log('   The session cookie is not marked as Secure and is being sent over HTTP.');
    } else if (hasSecure) {
      console.log('');
      console.log('⚠️  RESULT: Cookie is still marked as Secure - this will cause issues over HTTP');
      console.log('   Please check the cookie configuration in the auth routes.');
    } else {
      console.log('');
      console.log('❓ RESULT: Mixed results - please review the test output above.');
    }

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    console.error('');
    console.error('🔧 Troubleshooting tips:');
    console.error('   1. Make sure the panel service is running');
    console.error('   2. Check if the admin user exists and password is correct');
    console.error('   3. Verify the panel URL is accessible');
    console.error('   4. Check the panel logs for any errors');
    process.exit(1);
  }
}

// Run the test
testAuthenticationFlow();