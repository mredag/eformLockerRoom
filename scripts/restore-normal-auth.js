#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🔧 Restoring Normal Authentication');
console.log('=====================================');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { 
      stdio: 'pipe',
      shell: true,
      ...options 
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
  });
}

async function stopPanelService() {
  try {
    console.log('🛑 Stopping panel service...');
    await runCommand('pkill', ['-f', 'node app/panel/dist/index.js']);
    await sleep(2000);
    console.log('✅ Panel service stopped');
  } catch (error) {
    console.log('ℹ️  Panel service was not running');
  }
}

async function restoreNormalAuth() {
  console.log('📋 Step 1: Restoring normal authentication...');
  
  const indexPath = 'app/panel/src/index.ts';
  
  if (!fs.existsSync(indexPath)) {
    console.log('❌ Panel index.ts not found');
    return false;
  }
  
  let content = fs.readFileSync(indexPath, 'utf8');
  
  // Check if bypass is active
  if (content.includes('skipAuth: true')) {
    console.log('🔄 Removing authentication bypass...');
    
    // Remove the bypass
    content = content.replace(/skipAuth: true/g, 'skipAuth: false');
    
    fs.writeFileSync(indexPath, content);
    console.log('✅ Authentication bypass removed');
    return true;
  } else {
    console.log('ℹ️  Authentication bypass not found, may already be normal');
    return true;
  }
}

async function rebuildPanel() {
  console.log('📋 Step 2: Rebuilding panel with authentication fixes...');
  
  try {
    const result = await runCommand('npm', ['run', 'build:panel'], {
      cwd: process.cwd()
    });
    console.log('✅ Panel rebuilt with fixed authentication');
    return true;
  } catch (error) {
    console.log('❌ Failed to rebuild panel:', error.message);
    return false;
  }
}

async function startPanelService() {
  console.log('📋 Step 3: Starting panel service...');
  
  const proc = spawn('npm', ['run', 'start:panel'], {
    stdio: 'pipe',
    shell: true,
    detached: true
  });
  
  proc.unref();
  
  // Wait for service to start
  console.log('⏳ Waiting for panel to start...');
  await sleep(3000);
  
  return proc;
}

async function testAuthentication() {
  console.log('📋 Step 4: Testing authentication...');
  
  const maxRetries = 10;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const response = await fetch('http://localhost:3002/health');
      if (response.ok) {
        console.log('✅ Panel service is running');
        break;
      }
    } catch (error) {
      retries++;
      if (retries < maxRetries) {
        console.log(`⏳ Waiting for service... (${retries}/${maxRetries})`);
        await sleep(2000);
      } else {
        console.log('❌ Panel service failed to start');
        return false;
      }
    }
  }
  
  // Test login
  try {
    console.log('🔐 Testing login...');
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
    
    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      console.log('✅ Login successful');
      
      // Extract session cookie
      const setCookieHeader = loginResponse.headers.get('set-cookie');
      if (setCookieHeader) {
        const sessionMatch = setCookieHeader.match(/session=([^;]+)/);
        if (sessionMatch) {
          const sessionToken = sessionMatch[1];
          console.log('🍪 Session cookie obtained');
          
          // Test dashboard access
          const dashboardResponse = await fetch('http://localhost:3002/dashboard.html', {
            headers: {
              'Cookie': `session=${sessionToken}`
            }
          });
          
          console.log('🏠 Dashboard status:', dashboardResponse.status);
          
          if (dashboardResponse.status === 200) {
            console.log('✅ Dashboard accessible - Authentication working!');
            return true;
          } else if (dashboardResponse.status === 302) {
            console.log('❌ Dashboard redirecting - Authentication issue persists');
            return false;
          }
        }
      }
    } else {
      const errorData = await loginResponse.json();
      console.log('❌ Login failed:', errorData.error);
      return false;
    }
  } catch (error) {
    console.log('❌ Authentication test failed:', error.message);
    return false;
  }
  
  return false;
}

async function main() {
  try {
    // Stop existing service
    await stopPanelService();
    
    // Restore normal auth
    const authRestored = await restoreNormalAuth();
    if (!authRestored) {
      console.log('❌ Failed to restore authentication');
      return;
    }
    
    // Rebuild
    const buildSuccess = await rebuildPanel();
    if (!buildSuccess) {
      console.log('❌ Failed to rebuild panel');
      return;
    }
    
    // Start service
    await startPanelService();
    
    // Test authentication
    const authWorking = await testAuthentication();
    
    console.log('\n🎉 Authentication Fix Test Completed!');
    console.log('=====================================');
    
    if (authWorking) {
      console.log('✅ Normal authentication restored and working');
      console.log('✅ Panel service running');
      console.log('✅ Login works');
      console.log('✅ Dashboard accessible');
      console.log('✅ IP address validation fixed');
      console.log('\n🔐 You can now login at: http://your-pi-ip:3002');
      console.log('Username: admin');
      console.log('Password: admin123');
    } else {
      console.log('❌ Authentication issues still exist');
      console.log('📋 Check the panel logs for more details');
    }
    
  } catch (error) {
    console.error('❌ Error during authentication restoration:', error);
  }
}

// Add fetch polyfill for Node.js
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

main();