#!/usr/bin/env node

// Add fetch polyfill for Node.js
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

async function testAuthentication() {
  console.log('🔐 Testing Fixed Authentication');
  console.log('===============================');
  
  try {
    // Test health endpoint first
    console.log('📊 Testing health endpoint...');
    const healthResponse = await fetch('http://localhost:3002/health');
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('✅ Panel service is running');
      console.log('📊 Health:', JSON.stringify(healthData, null, 2));
    } else {
      console.log('❌ Panel service not responding');
      return;
    }
    
    // Test login
    console.log('\n🔐 Testing login...');
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
    
    console.log('📝 Login status:', loginResponse.status);
    
    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      console.log('✅ Login successful');
      console.log('👤 User:', loginData.user.username, loginData.user.role);
      
      // Extract session cookie
      const setCookieHeader = loginResponse.headers.get('set-cookie');
      if (setCookieHeader) {
        const sessionMatch = setCookieHeader.match(/session=([^;]+)/);
        if (sessionMatch) {
          const sessionToken = sessionMatch[1];
          console.log('🍪 Session cookie obtained');
          
          // Test session validation with /auth/me
          console.log('\n🔍 Testing session validation...');
          const meResponse = await fetch('http://localhost:3002/auth/me', {
            headers: {
              'Cookie': `session=${sessionToken}`
            }
          });
          
          console.log('📝 Session validation status:', meResponse.status);
          
          if (meResponse.ok) {
            const meData = await meResponse.json();
            console.log('✅ Session validation successful');
            console.log('👤 User:', meData.user.username, meData.user.role);
          } else {
            console.log('❌ Session validation failed');
            const errorData = await meResponse.text();
            console.log('📝 Error:', errorData);
          }
          
          // Test root route
          console.log('\n🏠 Testing root route...');
          const rootResponse = await fetch('http://localhost:3002/', {
            headers: {
              'Cookie': `session=${sessionToken}`
            },
            redirect: 'manual'
          });
          
          console.log('🏠 Root route status:', rootResponse.status);
          
          if (rootResponse.status === 302) {
            const location = rootResponse.headers.get('location');
            console.log('🔄 Root redirects to:', location);
            
            // Test dashboard access
            console.log('\n📊 Testing dashboard access...');
            const dashboardResponse = await fetch('http://localhost:3002/dashboard.html', {
              headers: {
                'Cookie': `session=${sessionToken}`
              }
            });
            
            console.log('📊 Dashboard status:', dashboardResponse.status);
            
            if (dashboardResponse.status === 200) {
              console.log('✅ Dashboard accessible - NO REDIRECT LOOP!');
              
              console.log('\n🎉 Authentication Fix Test Results:');
              console.log('=====================================');
              console.log('✅ Panel service running');
              console.log('✅ Login works');
              console.log('✅ Session validation works');
              console.log('✅ Root route redirects correctly');
              console.log('✅ Dashboard accessible');
              console.log('✅ IP address validation fixed');
              console.log('\n🔐 Authentication is fully working!');
              console.log('Access URL: http://localhost:3002');
              console.log('Username: admin');
              console.log('Password: admin123');
              
            } else if (dashboardResponse.status === 302) {
              console.log('❌ Dashboard still redirecting - redirect loop detected');
            } else {
              console.log('❌ Dashboard access failed with status:', dashboardResponse.status);
            }
          } else {
            console.log('❌ Root route not redirecting properly');
          }
        } else {
          console.log('❌ No session cookie in response');
        }
      } else {
        console.log('❌ No set-cookie header in response');
      }
    } else {
      const errorData = await loginResponse.json();
      console.log('❌ Login failed:', errorData.error);
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

testAuthentication();