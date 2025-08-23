#!/usr/bin/env node

/**
 * Test script to verify cookie path fix
 */

const http = require('http');
const { URL } = require('url');

const PANEL_URL = process.env.PANEL_URL || 'http://192.168.1.8:3002';
const TEST_USERNAME = process.env.TEST_USERNAME || 'admin';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'admin123';

console.log('🔍 Testing Cookie Path Fix');
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
        'User-Agent': 'Mozilla/5.0 (compatible; CookiePathTest/1.0)',
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

function parseCookies(setCookieHeaders) {
  const cookies = {};
  setCookieHeaders.forEach(header => {
    const parts = header.split(';');
    const [name, value] = parts[0].split('=');
    cookies[name.trim()] = {
      value: value?.trim(),
      attributes: parts.slice(1).map(p => p.trim())
    };
  });
  return cookies;
}

async function testCookiePathFix() {
  try {
    console.log('1️⃣ Testing Login and Cookie Path...');
    
    // Step 1: Login
    const loginResponse = await makeRequest(`${PANEL_URL}/auth/login`, {
      method: 'POST',
      body: {
        username: TEST_USERNAME,
        password: TEST_PASSWORD
      }
    });

    if (loginResponse.statusCode !== 200) {
      throw new Error(`Login failed with status ${loginResponse.statusCode}: ${loginResponse.body}`);
    }

    // Parse cookies
    const cookies = parseCookies(loginResponse.cookies);
    console.log('🍪 Set-Cookie Header:', loginResponse.cookies[0]);
    
    if (!cookies.session) {
      throw new Error('No session cookie found in login response');
    }

    const sessionCookie = cookies.session;
    console.log('✅ Session cookie found:', sessionCookie.value.substring(0, 16) + '...');
    console.log('🔒 Cookie attributes:', sessionCookie.attributes);

    // Check for path attribute
    const hasPath = sessionCookie.attributes.some(attr => attr.toLowerCase().startsWith('path='));
    const pathValue = sessionCookie.attributes.find(attr => attr.toLowerCase().startsWith('path='));
    
    console.log('');
    console.log('🔍 Cookie Path Analysis:');
    console.log(`   Has Path attribute: ${hasPath ? '✅ YES' : '❌ NO'}`);
    console.log(`   Path value: ${pathValue || '❌ NOT SET (defaults to /auth)'}`);
    
    if (pathValue === 'Path=/') {
      console.log('   ✅ Path is set to "/" - cookie will be available to all routes');
    } else if (!hasPath) {
      console.log('   ❌ No path set - cookie will only be available to /auth/* routes');
    } else {
      console.log(`   ⚠️  Path is set to "${pathValue}" - check if this is correct`);
    }

    console.log('');
    console.log('2️⃣ Testing Cookie on Different Routes...');

    const cookieHeader = `session=${sessionCookie.value}`;

    // Test /auth/me (should work regardless)
    console.log('   Testing /auth/me...');
    const authMeResponse = await makeRequest(`${PANEL_URL}/auth/me`, {
      headers: { 'Cookie': cookieHeader }
    });
    console.log(`   /auth/me: ${authMeResponse.statusCode === 200 ? '✅ SUCCESS' : '❌ FAILED'}`);

    // Test /dashboard (this is the critical test)
    console.log('   Testing /dashboard...');
    const dashboardResponse = await makeRequest(`${PANEL_URL}/dashboard`, {
      headers: { 
        'Cookie': cookieHeader,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    console.log(`   /dashboard: ${dashboardResponse.statusCode === 200 ? '✅ SUCCESS' : dashboardResponse.statusCode === 302 ? '❌ REDIRECT (cookie not sent)' : '❌ FAILED'}`);

    // Test root path
    console.log('   Testing / (root)...');
    const rootResponse = await makeRequest(`${PANEL_URL}/`, {
      headers: { 
        'Cookie': cookieHeader,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    console.log(`   /: ${rootResponse.statusCode === 302 && rootResponse.headers.location?.includes('dashboard') ? '✅ SUCCESS (redirects to dashboard)' : rootResponse.statusCode === 302 && rootResponse.headers.location?.includes('login') ? '❌ REDIRECT TO LOGIN (cookie not sent)' : '❌ UNEXPECTED'}`);

    console.log('');
    console.log('📊 SUMMARY:');
    console.log(`   Cookie Path Set: ${hasPath && pathValue === 'Path=/' ? '✅ CORRECT' : '❌ INCORRECT'}`);
    console.log(`   /auth/me works: ${authMeResponse.statusCode === 200 ? '✅ YES' : '❌ NO'}`);
    console.log(`   /dashboard works: ${dashboardResponse.statusCode === 200 ? '✅ YES' : '❌ NO'}`);
    console.log(`   Root redirect works: ${rootResponse.statusCode === 302 && rootResponse.headers.location?.includes('dashboard') ? '✅ YES' : '❌ NO'}`);

    console.log('');
    if (hasPath && pathValue === 'Path=/' && dashboardResponse.statusCode === 200) {
      console.log('🎉 COOKIE PATH FIX IS WORKING!');
      console.log('   The session cookie is now available to all routes.');
      console.log('   Browser should no longer have redirect loops.');
    } else if (!hasPath || pathValue !== 'Path=/') {
      console.log('❌ COOKIE PATH NOT FIXED');
      console.log('   The cookie is still scoped to /auth path only.');
      console.log('   Browser will continue to have redirect loops.');
      console.log('   Make sure to restart the panel service after the fix.');
    } else {
      console.log('⚠️  MIXED RESULTS');
      console.log('   Cookie path is set correctly but other issues may exist.');
      console.log('   Check server logs and browser developer tools.');
    }

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    console.error('');
    console.error('🔧 Troubleshooting:');
    console.error('   1. Make sure the panel service is running');
    console.error('   2. Verify the fix was applied to auth-routes.ts');
    console.error('   3. Restart the panel service after applying the fix');
    console.error('   4. Check if admin credentials are correct');
  }
}

testCookiePathFix();