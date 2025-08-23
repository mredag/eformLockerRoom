#!/usr/bin/env node

// Add fetch polyfill for Node.js
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

async function debugSessionValidation() {
  console.log('🔍 Debugging Session Validation');
  console.log('===============================');
  
  try {
    // Step 1: Login and get session
    console.log('📝 Step 1: Login...');
    const loginResponse = await fetch('http://localhost:3002/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'admin123'
      })
    });
    
    console.log('Login status:', loginResponse.status);
    
    if (!loginResponse.ok) {
      const errorData = await loginResponse.text();
      console.log('❌ Login failed:', errorData);
      return;
    }
    
    const loginData = await loginResponse.json();
    console.log('✅ Login successful');
    
    // Extract session cookie
    const setCookieHeader = loginResponse.headers.get('set-cookie');
    console.log('Set-Cookie header:', setCookieHeader);
    
    if (!setCookieHeader) {
      console.log('❌ No session cookie set');
      return;
    }
    
    const sessionMatch = setCookieHeader.match(/session=([^;]+)/);
    if (!sessionMatch) {
      console.log('❌ No session token in cookie');
      return;
    }
    
    const sessionToken = sessionMatch[1];
    console.log('🍪 Session token:', sessionToken.substring(0, 16) + '...');
    
    // Step 2: Test session validation with /auth/me
    console.log('\n📝 Step 2: Test session validation...');
    const meResponse = await fetch('http://localhost:3002/auth/me', {
      headers: {
        'Cookie': `session=${sessionToken}`
      }
    });
    
    console.log('Session validation status:', meResponse.status);
    
    if (meResponse.ok) {
      const meData = await meResponse.json();
      console.log('✅ Session validation successful');
      console.log('User:', meData.user.username);
    } else {
      const errorData = await meResponse.text();
      console.log('❌ Session validation failed:', errorData);
    }
    
    // Step 3: Test root route
    console.log('\n📝 Step 3: Test root route...');
    const rootResponse = await fetch('http://localhost:3002/', {
      headers: {
        'Cookie': `session=${sessionToken}`
      },
      redirect: 'manual'
    });
    
    console.log('Root route status:', rootResponse.status);
    
    if (rootResponse.status === 302) {
      const location = rootResponse.headers.get('location');
      console.log('✅ Root redirects to:', location);
    } else if (rootResponse.status === 401) {
      console.log('❌ Root route authentication failed');
      const errorData = await rootResponse.text();
      console.log('Error:', errorData);
    } else {
      console.log('Root route response:', rootResponse.status);
    }
    
    // Step 4: Test dashboard directly
    console.log('\n📝 Step 4: Test dashboard access...');
    const dashResponse = await fetch('http://localhost:3002/dashboard.html', {
      headers: {
        'Cookie': `session=${sessionToken}`
      }
    });
    
    console.log('Dashboard status:', dashResponse.status);
    
    if (dashResponse.status === 200) {
      console.log('✅ Dashboard accessible');
    } else if (dashResponse.status === 401) {
      console.log('❌ Dashboard authentication failed');
    } else if (dashResponse.status === 302) {
      console.log('❌ Dashboard redirecting (possible loop)');
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

debugSessionValidation();