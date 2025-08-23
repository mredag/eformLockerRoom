#!/usr/bin/env node

/**
 * Debug script for session management issues
 * This helps identify why users get stuck in login loops
 */

const http = require('http');
const https = require('https');

async function debugSessionIssue() {
  console.log('🔍 Debugging session management issue...');
  
  const baseUrl = 'http://localhost:3002';
  
  // Test 1: Check if panel service is running
  console.log('\n🧪 Test 1: Checking panel service...');
  try {
    const response = await makeRequest('GET', `${baseUrl}/health`);
    console.log('✅ Panel service is running');
    console.log('Response:', response.statusCode, response.data);
  } catch (error) {
    console.log('❌ Panel service not accessible:', error.message);
    return;
  }
  
  // Test 2: Test login endpoint
  console.log('\n🧪 Test 2: Testing login endpoint...');
  try {
    const loginData = JSON.stringify({
      username: 'admin',
      password: 'admin123'
    });
    
    const loginResponse = await makeRequest('POST', `${baseUrl}/auth/login`, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }, loginData);
    
    console.log('Login response status:', loginResponse.statusCode);
    console.log('Login response headers:', loginResponse.headers);
    console.log('Login response data:', loginResponse.data);
    
    if (loginResponse.statusCode === 200) {
      console.log('✅ Login successful');
      
      // Extract session cookie
      const setCookieHeader = loginResponse.headers['set-cookie'];
      let sessionCookie = null;
      
      if (setCookieHeader) {
        const sessionMatch = setCookieHeader.find(cookie => cookie.startsWith('session='));
        if (sessionMatch) {
          sessionCookie = sessionMatch.split(';')[0];
          console.log('📝 Session cookie:', sessionCookie);
        }
      }
      
      if (sessionCookie) {
        // Test 3: Test /auth/me endpoint with session
        console.log('\n🧪 Test 3: Testing /auth/me with session...');
        try {
          const meResponse = await makeRequest('GET', `${baseUrl}/auth/me`, {
            'Cookie': sessionCookie
          });
          
          console.log('Me response status:', meResponse.statusCode);
          console.log('Me response data:', meResponse.data);
          
          if (meResponse.statusCode === 200) {
            console.log('✅ Session validation successful');
          } else {
            console.log('❌ Session validation failed');
          }
        } catch (error) {
          console.log('❌ Error testing /auth/me:', error.message);
        }
        
        // Test 4: Test dashboard access
        console.log('\n🧪 Test 4: Testing dashboard access...');
        try {
          const dashboardResponse = await makeRequest('GET', `${baseUrl}/dashboard.html`, {
            'Cookie': sessionCookie,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          });
          
          console.log('Dashboard response status:', dashboardResponse.statusCode);
          console.log('Dashboard response headers:', dashboardResponse.headers);
          
          if (dashboardResponse.statusCode === 200) {
            console.log('✅ Dashboard access successful');
          } else if (dashboardResponse.statusCode === 302) {
            console.log('❌ Dashboard redirected to:', dashboardResponse.headers.location);
          } else {
            console.log('❌ Dashboard access failed');
          }
        } catch (error) {
          console.log('❌ Error testing dashboard:', error.message);
        }
      }
    } else {
      console.log('❌ Login failed');
    }
  } catch (error) {
    console.log('❌ Error testing login:', error.message);
  }
  
  console.log('\n📋 Debugging completed!');
  console.log('\n💡 If you see redirect loops:');
  console.log('1. Check that session cookies are being set correctly');
  console.log('2. Verify that /auth/me returns 200 with valid session');
  console.log('3. Ensure auth middleware is not rejecting valid sessions');
  console.log('4. Check for IP address or user agent validation issues');
}

function makeRequest(method, url, headers = {}, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: headers
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
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

debugSessionIssue().catch(console.error);