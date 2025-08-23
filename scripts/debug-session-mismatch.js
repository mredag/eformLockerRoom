#!/usr/bin/env node

/**
 * Debug session ID mismatch issues
 */

const http = require('http');
const { URL } = require('url');

const PANEL_URL = process.env.PANEL_URL || 'http://192.168.1.8:3002';
const TEST_USERNAME = process.env.TEST_USERNAME || 'admin';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'admin123';

console.log('🔍 Debugging Session ID Mismatch');
console.log(`📍 Panel URL: ${PANEL_URL}`);
console.log('');

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SessionDebugger/1.0',
        ...options.headers
      }
    };

    console.log(`📤 ${requestOptions.method} ${url}`);
    if (options.headers?.Cookie) {
      console.log(`🍪 Sending: ${options.headers.Cookie.substring(0, 50)}...`);
    }

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`📥 Status: ${res.statusCode}`);
        if (res.headers['set-cookie']) {
          console.log(`🍪 Received: ${res.headers['set-cookie'][0]}`);
        }
        console.log('');
        
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

function extractSessionId(setCookieHeader) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

async function debugSessionMismatch() {
  try {
    console.log('1️⃣ Fresh Login - Creating New Session...');
    
    // Step 1: Fresh login
    const loginResponse = await makeRequest(`${PANEL_URL}/auth/login`, {
      method: 'POST',
      body: {
        username: TEST_USERNAME,
        password: TEST_PASSWORD
      }
    });

    if (loginResponse.statusCode !== 200) {
      throw new Error(`Login failed: ${loginResponse.statusCode} - ${loginResponse.body}`);
    }

    const sessionId1 = extractSessionId(loginResponse.cookies[0]);
    console.log(`✅ Login successful - Session ID: ${sessionId1?.substring(0, 16)}...`);

    // Step 2: Immediate test with same session
    console.log('2️⃣ Immediate Test with Same Session...');
    const cookieHeader = `session=${sessionId1}`;
    
    const immediateTest = await makeRequest(`${PANEL_URL}/auth/me`, {
      headers: { 'Cookie': cookieHeader }
    });
    
    console.log(`   /auth/me result: ${immediateTest.statusCode === 200 ? '✅ SUCCESS' : '❌ FAILED'}`);

    // Step 3: Test dashboard access
    console.log('3️⃣ Testing Dashboard Access...');
    const dashboardTest = await makeRequest(`${PANEL_URL}/dashboard`, {
      headers: { 
        'Cookie': cookieHeader,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    console.log(`   /dashboard result: ${dashboardTest.statusCode === 200 ? '✅ SUCCESS' : dashboardTest.statusCode === 302 ? '⚠️ REDIRECT' : '❌ FAILED'}`);
    if (dashboardTest.statusCode === 302) {
      console.log(`   Redirect to: ${dashboardTest.headers.location}`);
    }

    // Step 4: Wait a moment and test again
    console.log('4️⃣ Waiting 2 seconds and testing again...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const delayedTest = await makeRequest(`${PANEL_URL}/auth/me`, {
      headers: { 'Cookie': cookieHeader }
    });
    
    console.log(`   /auth/me after delay: ${delayedTest.statusCode === 200 ? '✅ SUCCESS' : '❌ FAILED'}`);

    // Step 5: Test root path (which might trigger session validation)
    console.log('5️⃣ Testing Root Path (/)...');
    const rootTest = await makeRequest(`${PANEL_URL}/`, {
      headers: { 
        'Cookie': cookieHeader,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    console.log(`   / result: ${rootTest.statusCode === 302 ? '⚠️ REDIRECT' : rootTest.statusCode === 200 ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (rootTest.statusCode === 302) {
      console.log(`   Redirect to: ${rootTest.headers.location}`);
    }

    // Step 6: Multiple rapid requests (simulate browser behavior)
    console.log('6️⃣ Multiple Rapid Requests (simulating browser)...');
    const rapidRequests = [
      makeRequest(`${PANEL_URL}/auth/me`, { headers: { 'Cookie': cookieHeader } }),
      makeRequest(`${PANEL_URL}/dashboard`, { headers: { 'Cookie': cookieHeader, 'Accept': 'text/html' } }),
      makeRequest(`${PANEL_URL}/auth/me`, { headers: { 'Cookie': cookieHeader } })
    ];
    
    const rapidResults = await Promise.all(rapidRequests);
    rapidResults.forEach((result, index) => {
      console.log(`   Request ${index + 1}: ${result.statusCode === 200 ? '✅ SUCCESS' : result.statusCode === 401 ? '❌ UNAUTHORIZED' : '⚠️ OTHER'}`);
    });

    console.log('');
    console.log('📊 ANALYSIS:');
    
    const allSuccessful = immediateTest.statusCode === 200 && 
                         delayedTest.statusCode === 200 && 
                         rapidResults.every(r => r.statusCode === 200);
    
    if (allSuccessful) {
      console.log('✅ Session is working correctly');
      console.log('   The issue might be browser-specific or timing-related');
    } else if (immediateTest.statusCode === 200 && delayedTest.statusCode !== 200) {
      console.log('❌ Session expires or gets cleaned up quickly');
      console.log('   Check session timeout settings and cleanup logic');
    } else if (immediateTest.statusCode !== 200) {
      console.log('❌ Session validation fails immediately');
      console.log('   Check session creation and validation logic');
    } else {
      console.log('⚠️ Intermittent session issues');
      console.log('   Check for race conditions or session conflicts');
    }

    console.log('');
    console.log('🔧 RECOMMENDATIONS:');
    console.log('1. Check server logs during this test');
    console.log('2. Look for session cleanup or expiration logic');
    console.log('3. Verify IP address validation in session manager');
    console.log('4. Check for multiple login attempts creating conflicts');
    console.log('5. Clear browser cookies and try fresh login');

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

debugSessionMismatch();