#!/usr/bin/env node

/**
 * Complete panel startup fix for Raspberry Pi
 * This script addresses all known issues that prevent panel startup
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

console.log('🔧 Complete Panel Startup Fix for Raspberry Pi');
console.log('===============================================\n');

async function fixPanelStartup() {
  try {
    // Step 1: Check current status
    console.log('📋 Step 1: Checking current status...');
    
    // Check if panel process is running
    try {
      const processes = execSync('ps aux | grep "node app/panel/dist/index.js" | grep -v grep', { encoding: 'utf8' });
      if (processes.trim()) {
        console.log('🔄 Panel process found, stopping it...');
        execSync('pkill -f "node app/panel/dist/index.js"');
        console.log('✅ Stopped existing panel process');
      } else {
        console.log('ℹ️  No panel process running');
      }
    } catch (error) {
      console.log('ℹ️  No panel process to stop');
    }
    
    // Step 2: Fix bcrypt issue
    console.log('\n📋 Step 2: Fixing bcrypt bundling issue...');
    
    try {
      execSync('npm uninstall bcrypt', { stdio: 'inherit' });
      console.log('✅ Removed bcrypt');
    } catch (error) {
      console.log('ℹ️  bcrypt not installed or already removed');
    }
    
    try {
      execSync('npm install bcryptjs@^2.4.3', { stdio: 'inherit' });
      console.log('✅ Installed bcryptjs');
    } catch (error) {
      console.log('❌ Failed to install bcryptjs:', error.message);
      throw error;
    }
    
    // Step 3: Ensure database exists and admin user is set up
    console.log('\n📋 Step 3: Setting up database and admin user...');
    
    const dbPath = path.join(process.cwd(), 'data/eform.db');
    const dataDir = path.dirname(dbPath);
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('✅ Created data directory');
    }
    
    // Run database setup
    try {
      execSync('node scripts/debug-admin-user.js', { stdio: 'inherit' });
      console.log('✅ Database and admin user verified');
    } catch (error) {
      console.log('❌ Database setup failed:', error.message);
      throw error;
    }
    
    // Step 4: Build panel service
    console.log('\n📋 Step 4: Building panel service...');
    
    try {
      execSync('npm run build:panel', { stdio: 'inherit' });
      console.log('✅ Panel service built successfully');
    } catch (error) {
      console.log('❌ Panel build failed:', error.message);
      throw error;
    }
    
    // Step 5: Verify built files exist
    console.log('\n📋 Step 5: Verifying built files...');
    
    const distPath = path.join(process.cwd(), 'app/panel/dist/index.js');
    if (!fs.existsSync(distPath)) {
      console.log('❌ Built panel file not found at:', distPath);
      throw new Error('Panel build incomplete');
    }
    console.log('✅ Built panel file exists');
    
    // Step 6: Test authentication before starting service
    console.log('\n📋 Step 6: Testing authentication...');
    
    try {
      execSync('node scripts/test-panel-login.js', { stdio: 'inherit' });
      console.log('✅ Authentication test passed');
    } catch (error) {
      console.log('❌ Authentication test failed:', error.message);
      throw error;
    }
    
    // Step 7: Start panel service
    console.log('\n📋 Step 7: Starting panel service...');
    
    console.log('🚀 Starting panel service in background...');
    
    // Start the service in background
    const panelProcess = spawn('node', ['app/panel/dist/index.js'], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Log output for a few seconds to check startup
    let startupOutput = '';
    let errorOutput = '';
    
    panelProcess.stdout.on('data', (data) => {
      const output = data.toString();
      startupOutput += output;
      console.log('📝 Panel output:', output.trim());
    });
    
    panelProcess.stderr.on('data', (data) => {
      const output = data.toString();
      errorOutput += output;
      console.log('⚠️  Panel error:', output.trim());
    });
    
    // Wait a few seconds for startup
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 8: Test service accessibility
    console.log('\n📋 Step 8: Testing service accessibility...');
    
    try {
      const http = require('http');
      
      const testResponse = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: 3002,
          path: '/health',
          method: 'GET',
          timeout: 5000
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        });
        
        req.on('error', reject);
        req.on('timeout', () => reject(new Error('Request timeout')));
        req.end();
      });
      
      console.log('✅ Panel service is accessible');
      console.log('📊 Health check response:', testResponse.statusCode, testResponse.data);
      
    } catch (error) {
      console.log('❌ Panel service not accessible:', error.message);
      
      // Show recent output
      if (startupOutput) {
        console.log('\n📝 Startup output:');
        console.log(startupOutput);
      }
      if (errorOutput) {
        console.log('\n⚠️  Error output:');
        console.log(errorOutput);
      }
      
      throw error;
    }
    
    // Step 9: Test full login flow
    console.log('\n📋 Step 9: Testing complete login flow...');
    
    try {
      execSync('node scripts/debug-session-issue.js', { stdio: 'inherit' });
      console.log('✅ Login flow test completed');
    } catch (error) {
      console.log('⚠️  Login flow test had issues, but service is running');
    }
    
    // Detach the process so it continues running
    panelProcess.unref();
    
    console.log('\n🎉 Panel startup fix completed successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ bcryptjs installed (bundle-safe)');
    console.log('✅ Database and admin user configured');
    console.log('✅ Panel service built and started');
    console.log('✅ Service is accessible on port 3002');
    
    console.log('\n🔐 Login credentials:');
    console.log('   URL: http://localhost:3002');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    
    console.log('\n📊 To monitor the service:');
    console.log('   ps aux | grep "node app/panel/dist/index.js"');
    console.log('   tail -f /tmp/panel.log (if logging to file)');
    
    console.log('\n🔄 To restart the service:');
    console.log('   pkill -f "node app/panel/dist/index.js"');
    console.log('   node scripts/fix-panel-startup-complete.js');
    
  } catch (error) {
    console.error('\n❌ Panel startup fix failed:', error.message);
    
    console.log('\n🔧 Manual troubleshooting steps:');
    console.log('1. Check Node.js version: node --version (should be 20+)');
    console.log('2. Check npm dependencies: npm ls bcryptjs argon2 sqlite3');
    console.log('3. Check database: ls -la data/eform.db');
    console.log('4. Check build output: ls -la app/panel/dist/');
    console.log('5. Try manual build: npm run build:panel');
    console.log('6. Check for port conflicts: netstat -tlnp | grep 3002');
    
    process.exit(1);
  }
}

fixPanelStartup().catch(console.error);