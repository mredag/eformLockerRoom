#!/usr/bin/env node

/**
 * Debug script to investigate cookie setting and retrieval issues
 */

const http = require('http');
const { URL } = require('url');

const PANEL_URL = process.env.PANEL_URL || 'http://192.168.1.8:3002';
const TEST_USERNAME = process.env.TEST_USERNAME || 'admin';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'admin123';

console.log('🔍 Debugging Cookie Issue');
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...options.headers
      }
    };

    console.log(`📤 Making ${requestOptions.method} request to ${url}`);
    console.log(`📋 Headers:`, requestOptions.headers);

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`📥 Response Status: ${res.statusCode}`);
        console.log(`📋 Response Headers:`, res.headers);
        console.log(`🍪 Set-Cookie Headers:`, res.headers['set-cookie'] || 'NONE');
        console.log(`📄 Response Body:`, data.substring(0, 200) + (data.length > 200 ? '...' : ''));
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
      const bodyStr = JSON.stringify(options.body);
      console.log(`📤 Request Body:`, bodyStr);
      req.write(bodyStr);
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

async function debugCookieIssue() {
  try {
    console.log('1️⃣ Testing Login and Cookie Setting...');
    
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
    console.log('🍪 Parsed Cookies:', JSON.stringify(cookies, null, 2));

    if (!cookies.session) {
      throw new Error('No session cookie found in login response');
    }

    const sessionCookie = cookies.session;
    console.log('✅ Session cookie found:', sessionCookie.value.substring(0, 16) + '...');
    console.log('🔒 Cookie attributes:', sessionCookie.attributes);

    // Check for problematic attributes
    const hasSecure = sessionCookie.attributes.some(attr => attr.toLowerCase() === 'secure');
    const hasSameSite = sessionCookie.attributes.find(attr => attr.toLowerCase().startsWith('samesite'));
    const hasHttpOnly = sessionCookie.attributes.some(attr => attr.toLowerCase() === 'httponly');

    console.log('');
    console.log('🔍 Cookie Analysis:');
    console.log(`   Secure: ${hasSecure ? '❌ YES (problematic for HTTP)' : '✅ NO (correct for HTTP)'}`);
    console.log(`   HttpOnly: ${hasHttpOnly ? '✅ YES' : '❌ NO'}`);
    console.log(`   SameSite: ${hasSameSite || '❌ NOT SET'}`);

    console.log('');
    console.log('2️⃣ Testing Cookie Sending in Subsequent Request...');

    // Step 2: Test with cookie
    const cookieHeader = `session=${sessionCookie.value}`;
    console.log(`🍪 Sending Cookie Header: ${cookieHeader.substring(0, 30)}...`);

    const meResponse = await makeRequest(`${PANEL_URL}/auth/me`, {
      headers: {
        'Cookie': cookieHeader
      }
    });

    console.log('');
    console.log('3️⃣ Testing Dashboard Access...');

    const dashboardResponse = await makeRequest(`${PANEL_URL}/dashboard`, {
      headers: {
        'Cookie': cookieHeader,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    console.log('');
    console.log('4️⃣ Testing Browser-like Request (with all headers)...');

    const browserResponse = await makeRequest(`${PANEL_URL}/dashboard`, {
      headers: {
        'Cookie': cookieHeader,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    console.log('');
    console.log('📊 SUMMARY:');
    console.log(`   Login: ${loginResponse.statusCode === 200 ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   Cookie Set: ${cookies.session ? '✅ YES' : '❌ NO'}`);
    console.log(`   Cookie Secure: ${hasSecure ? '❌ YES (problematic)' : '✅ NO (correct)'}`);
    console.log(`   /auth/me: ${meResponse.statusCode === 200 ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   Dashboard (curl): ${dashboardResponse.statusCode === 200 ? '✅ SUCCESS' : dashboardResponse.statusCode === 302 ? '⚠️ REDIRECT' : '❌ FAILED'}`);
    console.log(`   Dashboard (browser-like): ${browserResponse.statusCode === 200 ? '✅ SUCCESS' : browserResponse.statusCode === 302 ? '⚠️ REDIRECT' : '❌ FAILED'}`);

    console.log('');
    if (hasSecure) {
      console.log('🚨 PROBLEM IDENTIFIED: Cookie has Secure flag but server is HTTP');
      console.log('   This prevents browsers from sending the cookie over HTTP connections.');
      console.log('   The fix should have removed this flag. Check your environment configuration.');
    } else if (meResponse.statusCode === 200 && dashboardResponse.statusCode !== 200) {
      console.log('🚨 PROBLEM IDENTIFIED: Cookie works with curl but not with browser requests');
      console.log('   This suggests a browser-specific issue or additional security headers.');
    } else if (meResponse.statusCode !== 200) {
      console.log('🚨 PROBLEM IDENTIFIED: Cookie is not being accepted by the server');
      console.log('   Check server-side session validation logic.');
    } else {
      console.log('✅ Cookie appears to be working correctly with curl');
      console.log('   If browser still has issues, check browser developer tools for cookie storage.');
    }

  } catch (error) {
    console.error('');
    console.error('❌ Debug failed:', error.message);
    console.error('');
    console.error('🔧 Troubleshooting steps:');
    console.error('   1. Ensure the panel service is running');
    console.error('   2. Check if the URL is correct');
    console.error('   3. Verify admin credentials');
    console.error('   4. Check server logs for errors');
  }
}

debugCookieIssue();