#!/usr/bin/env node

/**
 * Quick panel service status checker
 */

const { execSync } = require('child_process');
const http = require('http');

async function checkPanelStatus() {
  console.log('🔍 Checking Panel Service Status');
  console.log('================================\n');
  
  // Check if process is running
  console.log('📋 1. Process Status:');
  try {
    const processes = execSync('ps aux | grep "node app/panel/dist/index.js" | grep -v grep', { encoding: 'utf8' });
    if (processes.trim()) {
      console.log('✅ Panel process is running');
      console.log('📝 Process info:', processes.trim());
    } else {
      console.log('❌ Panel process is NOT running');
    }
  } catch (error) {
    console.log('❌ Panel process is NOT running');
  }
  
  // Check port availability
  console.log('\n📋 2. Port Status:');
  try {
    const netstat = execSync('netstat -tlnp | grep :3002', { encoding: 'utf8' });
    if (netstat.trim()) {
      console.log('✅ Port 3002 is in use');
      console.log('📝 Port info:', netstat.trim());
    } else {
      console.log('❌ Port 3002 is NOT in use');
    }
  } catch (error) {
    console.log('❌ Port 3002 is NOT in use');
  }
  
  // Test HTTP connectivity
  console.log('\n📋 3. HTTP Connectivity:');
  try {
    const response = await makeRequest('GET', 'http://localhost:3002/health');
    console.log('✅ HTTP service is accessible');
    console.log('📊 Response:', response.statusCode, response.data);
  } catch (error) {
    console.log('❌ HTTP service is NOT accessible:', error.message);
  }
  
  // Check authentication
  console.log('\n📋 4. Authentication Test:');
  try {
    const loginData = JSON.stringify({
      username: 'admin',
      password: 'admin123'
    });
    
    const loginResponse = await makeRequest('POST', 'http://localhost:3002/auth/login', {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }, loginData);
    
    if (loginResponse.statusCode === 200) {
      console.log('✅ Authentication is working');
    } else {
      console.log('❌ Authentication failed:', loginResponse.statusCode, loginResponse.data);
    }
  } catch (error) {
    console.log('❌ Authentication test failed:', error.message);
  }
  
  // Check database
  console.log('\n📋 5. Database Status:');
  try {
    execSync('node scripts/test-panel-login.js', { stdio: 'pipe' });
    console.log('✅ Database authentication is working');
  } catch (error) {
    console.log('❌ Database authentication failed');
  }
  
  console.log('\n📋 Summary:');
  console.log('If all checks pass, the panel should be accessible at: http://localhost:3002');
  console.log('If any checks fail, run: node scripts/fix-panel-startup-complete.js');
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
      timeout: 5000
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

checkPanelStatus().catch(console.error);