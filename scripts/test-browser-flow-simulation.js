#!/usr/bin/env node

/**
 * Simulate exact browser flow to identify redirect loop cause
 */

const http = require('http');

async function simulateBrowserFlow() {
  console.log('🌐 Simulating Browser Flow');
  console.log('==========================\n');
  
  const baseUrl = 'http://localhost:3002';
  
  // Step 1: Login (we know this works)
  console.log('📋 Step 1: Login...');
  const loginData = JSON.stringify({
    username: 'admin',
    password: 'admin123'
  });
  
  const loginResponse = await makeRequest('POST', `${baseUrl}/auth/login`, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginData),
    'User-Agent': 'Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36'
  }, loginData);
  
  if (loginResponse.statusCode !== 200) {
    console.log('❌ Login failed:', loginResponse.statusCode);
    return;
  }
  
  console.log('✅ Login successful');
  
  // Extract session cookie
  const setCookieHeader = loginResponse.headers['set-cookie'];
  let sessionCookie = null;
  
  if (setCookieHeader) {
    const sessionMatch = setCookieHeader.find(cookie => cookie.startsWith('session='));
    if (sessionMatch) {
      sessionCookie = sessionMatch.split(';')[0];
      console.log('🍪 Session cookie:', sessionCookie);
    }
  }
  
  if (!sessionCookie) {
    console.log('❌ No session cookie found');
    return;
  }
  
  // Step 2: Test /auth/me (session validation)
  console.log('\n📋 Step 2: Testing session validation (/auth/me)...');
  const meResponse = await makeRequest('GET', `${baseUrl}/auth/me`, {
    'Cookie': sessionCookie,
    'User-Agent': 'Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36'
  });
  
  console.log('👤 /auth/me status:', meResponse.statusCode);
  if (meResponse.statusCode === 200) {
    console.log('✅ Session validation successful');
    console.log('👤 User data:', meResponse.data);
  } else {
    console.log('❌ Session validation failed:', meResponse.data);
    return;
  }
  
  // Step 3: Simulate browser accessing root (/) - this is what browsers do after login
  console.log('\n📋 Step 3: Accessing root route (/) like a browser...');
  const rootResponse = await makeRequest('GET', `${baseUrl}/`, {
    'Cookie': sessionCookie,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  });
  
  console.log('🏠 Root route status:', rootResponse.statusCode);
  console.log('🏠 Root route headers:', rootResponse.headers);
  
  if (rootResponse.statusCode === 302) {
    console.log('🔄 Root redirected to:', rootResponse.headers.location);
    
    // Step 4: Follow the redirect
    const redirectUrl = rootResponse.headers.location;
    if (redirectUrl) {
      console.log('\n📋 Step 4: Following redirect to:', redirectUrl);
      
      const redirectResponse = await makeRequest('GET', `${baseUrl}${redirectUrl}`, {
        'Cookie': sessionCookie,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      });
      
      console.log('📄 Redirect target status:', redirectResponse.statusCode);
      console.log('📄 Redirect target headers:', redirectResponse.headers);
      
      if (redirectResponse.statusCode === 302) {
        console.log('🔄 Redirect target also redirects to:', redirectResponse.headers.location);
        console.log('🚨 REDIRECT LOOP DETECTED!');
        
        // Step 5: Test the auth middleware directly on dashboard
        console.log('\n📋 Step 5: Testing dashboard.html directly...');
        const dashboardResponse = await makeRequest('GET', `${baseUrl}/dashboard.html`, {
          'Cookie': sessionCookie,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        });
        
        console.log('📊 Dashboard status:', dashboardResponse.statusCode);
        console.log('📊 Dashboard headers:', dashboardResponse.headers);
        
        if (dashboardResponse.statusCode === 302) {
          console.log('🔄 Dashboard redirects to:', dashboardResponse.headers.location);
          console.log('🚨 AUTH MIDDLEWARE IS REJECTING VALID SESSION!');
        } else if (dashboardResponse.statusCode === 200) {
          console.log('✅ Dashboard accessible directly - issue is in root route logic');
        }
      } else if (redirectResponse.statusCode === 200) {
        console.log('✅ Redirect successful - no loop detected');
      }
    }
  } else if (rootResponse.statusCode === 200) {
    console.log('✅ Root route accessible directly');
  }
  
  // Step 6: Test session validation with exact same parameters as auth middleware
  console.log('\n📋 Step 6: Testing session validation with middleware parameters...');
  
  // Simulate what the auth middleware does
  const sessionToken = sessionCookie.split('=')[1]; // Extract just the token part
  console.log('🔑 Session token:', sessionToken);
  
  // Test if the issue is IP address related
  console.log('\n📋 Step 7: Testing different IP scenarios...');
  
  const ipTests = [
    { name: 'localhost', ip: '127.0.0.1' },
    { name: 'Pi IP', ip: '192.168.1.8' },
    { name: 'unknown', ip: 'unknown' }
  ];
  
  for (const ipTest of ipTests) {
    console.log(`\n🌐 Testing with ${ipTest.name} (${ipTest.ip})...`);
    
    const ipTestResponse = await makeRequest('GET', `${baseUrl}/auth/me`, {
      'Cookie': sessionCookie,
      'User-Agent': 'Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36',
      'X-Forwarded-For': ipTest.ip,
      'X-Real-IP': ipTest.ip
    });
    
    console.log(`📊 ${ipTest.name} result:`, ipTestResponse.statusCode);
    if (ipTestResponse.statusCode !== 200) {
      console.log(`❌ ${ipTest.name} failed:`, ipTestResponse.data);
    }
  }
  
  console.log('\n📋 Summary:');
  console.log('✅ Login works perfectly');
  console.log('✅ Session validation works');
  console.log('❓ Issue is likely in:');
  console.log('   1. Root route session validation logic');
  console.log('   2. Auth middleware IP address handling');
  console.log('   3. Browser vs script request differences');
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

simulateBrowserFlow().catch(console.error);