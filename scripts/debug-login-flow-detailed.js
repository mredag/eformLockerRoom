#!/usr/bin/env node

/**
 * Detailed login flow debugging for redirect loop issue
 */

const http = require('http');

async function debugLoginFlow() {
  console.log('🔍 Detailed Login Flow Debug');
  console.log('============================\n');
  
  const baseUrl = 'http://localhost:3002';
  
  // Step 1: Test health endpoint
  console.log('📋 Step 1: Testing health endpoint...');
  try {
    const health = await makeRequest('GET', `${baseUrl}/health`);
    console.log('✅ Health check:', health.statusCode);
    console.log('📊 Health data:', health.data);
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
    return;
  }
  
  // Step 2: Test login endpoint
  console.log('\n📋 Step 2: Testing login endpoint...');
  const loginData = JSON.stringify({
    username: 'admin',
    password: 'admin123'
  });
  
  try {
    const loginResponse = await makeRequest('POST', `${baseUrl}/auth/login`, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }, loginData);
    
    console.log('🔐 Login response status:', loginResponse.statusCode);
    console.log('🔐 Login response data:', loginResponse.data);
    console.log('🍪 Set-Cookie headers:', loginResponse.headers['set-cookie']);
    
    if (loginResponse.statusCode !== 200) {
      console.log('❌ Login failed, cannot continue');
      return;
    }
    
    // Extract session cookie
    const setCookieHeader = loginResponse.headers['set-cookie'];
    let sessionCookie = null;
    
    if (setCookieHeader) {
      const sessionMatch = setCookieHeader.find(cookie => cookie.startsWith('session='));
      if (sessionMatch) {
        sessionCookie = sessionMatch.split(';')[0];
        console.log('📝 Extracted session cookie:', sessionCookie);
      }
    }
    
    if (!sessionCookie) {
      console.log('❌ No session cookie found in login response');
      return;
    }
    
    // Step 3: Test /auth/me endpoint
    console.log('\n📋 Step 3: Testing /auth/me endpoint...');
    try {
      const meResponse = await makeRequest('GET', `${baseUrl}/auth/me`, {
        'Cookie': sessionCookie
      });
      
      console.log('👤 /auth/me status:', meResponse.statusCode);
      console.log('👤 /auth/me data:', meResponse.data);
      
      if (meResponse.statusCode !== 200) {
        console.log('❌ Session validation failed at /auth/me');
        return;
      }
    } catch (error) {
      console.log('❌ /auth/me request failed:', error.message);
      return;
    }
    
    // Step 4: Test root route (/)
    console.log('\n📋 Step 4: Testing root route (/)...');
    try {
      const rootResponse = await makeRequest('GET', `${baseUrl}/`, {
        'Cookie': sessionCookie,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; DebugBot/1.0)'
      });
      
      console.log('🏠 Root route status:', rootResponse.statusCode);
      console.log('🏠 Root route headers:', rootResponse.headers);
      
      if (rootResponse.statusCode === 302) {
        console.log('🔄 Root route redirected to:', rootResponse.headers.location);
      }
    } catch (error) {
      console.log('❌ Root route request failed:', error.message);
    }
    
    // Step 5: Test dashboard.html directly
    console.log('\n📋 Step 5: Testing dashboard.html directly...');
    try {
      const dashboardResponse = await makeRequest('GET', `${baseUrl}/dashboard.html`, {
        'Cookie': sessionCookie,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; DebugBot/1.0)'
      });
      
      console.log('📊 Dashboard status:', dashboardResponse.statusCode);
      console.log('📊 Dashboard headers:', dashboardResponse.headers);
      
      if (dashboardResponse.statusCode === 302) {
        console.log('🔄 Dashboard redirected to:', dashboardResponse.headers.location);
      } else if (dashboardResponse.statusCode === 200) {
        console.log('✅ Dashboard accessible!');
      }
    } catch (error) {
      console.log('❌ Dashboard request failed:', error.message);
    }
    
    // Step 6: Test auth middleware behavior
    console.log('\n📋 Step 6: Testing auth middleware with different paths...');
    
    const testPaths = [
      '/dashboard',
      '/lockers',
      '/vip',
      '/config'
    ];
    
    for (const testPath of testPaths) {
      try {
        const pathResponse = await makeRequest('GET', `${baseUrl}${testPath}`, {
          'Cookie': sessionCookie,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; DebugBot/1.0)'
        });
        
        console.log(`🔗 ${testPath} status:`, pathResponse.statusCode);
        if (pathResponse.statusCode === 302) {
          console.log(`🔄 ${testPath} redirected to:`, pathResponse.headers.location);
        }
      } catch (error) {
        console.log(`❌ ${testPath} request failed:`, error.message);
      }
    }
    
    // Step 7: Test without session cookie
    console.log('\n📋 Step 7: Testing without session cookie (should redirect to login)...');
    try {
      const noAuthResponse = await makeRequest('GET', `${baseUrl}/dashboard.html`, {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; DebugBot/1.0)'
      });
      
      console.log('🚫 No auth status:', noAuthResponse.statusCode);
      if (noAuthResponse.statusCode === 302) {
        console.log('🔄 No auth redirected to:', noAuthResponse.headers.location);
        if (noAuthResponse.headers.location === '/login.html') {
          console.log('✅ Correct redirect behavior when not authenticated');
        }
      }
    } catch (error) {
      console.log('❌ No auth test failed:', error.message);
    }
    
  } catch (error) {
    console.log('❌ Login test failed:', error.message);
  }
  
  console.log('\n📋 Debug Summary:');
  console.log('If login succeeds but dashboard redirects to login, the issue is likely:');
  console.log('1. Session validation failing in auth middleware');
  console.log('2. IP address or user agent mismatch');
  console.log('3. Session cookie not being sent properly');
  console.log('4. Auth middleware incorrectly identifying protected routes');
}

function makeRequest(method, url, headers = {}, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: headers,
      timeout: 10000
    };
    
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = responseData ? JSON.parse(responseData) : null;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: responseData
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

debugLoginFlow().catch(console.error);