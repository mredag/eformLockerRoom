#!/usr/bin/env node

/**
 * Test runner for locker system fixes
 * This script runs comprehensive tests to verify all three main fixes are working
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestRunner {
  constructor() {
    this.testResults = [];
    this.services = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async checkServiceStatus() {
    this.log('Checking service status...');
    
    const services = [
      { name: 'Panel', port: 3001, path: '/health' },
      { name: 'Gateway', port: 3000, path: '/health' },
    ];

    for (const service of services) {
      try {
        const response = await this.makeHealthCheck(service.port, service.path);
        if (response) {
          this.log(`✅ ${service.name} service is running on port ${service.port}`, 'success');
          this.services.push(service);
        } else {
          this.log(`❌ ${service.name} service not responding on port ${service.port}`, 'error');
        }
      } catch (error) {
        this.log(`❌ ${service.name} service check failed: ${error.message}`, 'error');
      }
    }

    return this.services.length > 0;
  }

  async makeHealthCheck(port, path) {
    return new Promise((resolve) => {
      const http = require('http');
      const req = http.request({
        hostname: 'localhost',
        port: port,
        path: path,
        method: 'GET',
        timeout: 5000
      }, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      
      req.end();
    });
  }

  async startServices() {
    this.log('Starting services for testing...');
    
    // Check if services are already running
    const servicesRunning = await this.checkServiceStatus();
    
    if (!servicesRunning) {
      this.log('Services not running, attempting to start...');
      
      // Try to start services using the start script
      if (fs.existsSync('scripts/start-all.js')) {
        this.log('Starting services using start-all.js...');
        
        const startProcess = spawn('node', ['scripts/start-all.js'], {
          stdio: 'pipe',
          detached: false
        });

        // Give services time to start
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Check again
        const nowRunning = await this.checkServiceStatus();
        if (!nowRunning) {
          this.log('❌ Failed to start services automatically', 'error');
          this.log('Please start services manually and run tests again', 'info');
          return false;
        }
      } else {
        this.log('❌ start-all.js not found, please start services manually', 'error');
        return false;
      }
    }

    return true;
  }

  async runNodeTests() {
    this.log('Running Node.js test suite...');
    
    try {
      const LockerSystemTester = require('./test-locker-system-fixes.js');
      const tester = new LockerSystemTester();
      
      const success = await tester.runAllTests();
      
      if (success) {
        this.log('✅ All Node.js tests passed', 'success');
        this.testResults.push({ suite: 'Node.js Tests', status: 'PASSED' });
      } else {
        this.log('❌ Some Node.js tests failed', 'error');
        this.testResults.push({ suite: 'Node.js Tests', status: 'FAILED' });
      }
      
      return success;
    } catch (error) {
      this.log(`❌ Node.js test suite failed: ${error.message}`, 'error');
      this.testResults.push({ suite: 'Node.js Tests', status: 'ERROR', error: error.message });
      return false;
    }
  }

  async runManualTestInstructions() {
    this.log('\n📋 Manual Test Instructions:');
    this.log('='.repeat(50));
    
    this.log('\n1. Browser Tests:');
    this.log('   - Open http://localhost:3001/test-client-side-fixes.html');
    this.log('   - Click "Run All Tests" button');
    this.log('   - Verify all tests pass');
    
    this.log('\n2. Authentication Redirect Test:');
    this.log('   - Open browser dev tools (F12) → Network tab');
    this.log('   - Clear all cookies for localhost:3001');
    this.log('   - Navigate to http://localhost:3001/');
    this.log('   - Verify exactly ONE redirect (no loops)');
    this.log('   - Should redirect to /login.html or /dashboard');
    
    this.log('\n3. Locker Loading Test:');
    this.log('   - Log into the panel');
    this.log('   - Navigate to /lockers page');
    this.log('   - Select kiosk K1');
    this.log('   - Verify lockers load without "Network error"');
    this.log('   - Check Network tab shows 200 for /api/lockers?kioskId=K1');
    
    this.log('\n4. Error Handling Test:');
    this.log('   - In browser console, run: fetch("/api/lockers", {credentials: "same-origin"})');
    this.log('   - Should return 400 with {"code":"bad_request","message":"kioskId required"}');
    this.log('   - Clear session cookies and retry');
    this.log('   - Should return 401 with {"code":"unauthorized","message":"login required"}');
    
    this.log('\n5. Extension Interference Test:');
    this.log('   - Open panel in normal browser (with extensions)');
    this.log('   - Check console for JavaScript errors');
    this.log('   - Open in incognito mode or with --disable-extensions');
    this.log('   - Console should be cleaner without extensions');
    
    this.log('\n6. CSP Test:');
    this.log('   - Open browser dev tools → Network tab');
    this.log('   - Reload the panel page');
    this.log('   - Check response headers for Content-Security-Policy');
    this.log('   - Should include script-src \'self\' directive');
    
    this.log('\n✅ Expected Results:');
    this.log('   - No "Network error loading lockers" messages');
    this.log('   - No authentication redirect loops');
    this.log('   - Clean console when extensions disabled');
    this.log('   - Proper error messages in UI');
    this.log('   - Single 200 response for locker API calls');
  }

  async generateTestReport() {
    this.log('\n📊 Test Report Summary:');
    this.log('='.repeat(50));
    
    let passed = 0;
    let failed = 0;
    
    this.testResults.forEach(result => {
      const status = result.status === 'PASSED' ? '✅' : '❌';
      this.log(`${status} ${result.suite}: ${result.status}`);
      if (result.error) {
        this.log(`   Error: ${result.error}`);
      }
      
      if (result.status === 'PASSED') passed++;
      else failed++;
    });
    
    this.log(`\nTotal: ${this.testResults.length} test suites`);
    this.log(`Passed: ${passed}`);
    this.log(`Failed: ${failed}`);
    
    if (failed === 0) {
      this.log('\n🎉 All automated tests passed!', 'success');
      this.log('Please complete the manual tests above to fully verify the fixes.', 'info');
    } else {
      this.log(`\n⚠️ ${failed} test suite(s) failed. Please review the issues above.`, 'error');
    }
    
    return failed === 0;
  }

  async run() {
    this.log('🚀 Starting Locker System Fixes Test Suite');
    this.log('This will test all three main fixes:');
    this.log('1. Network error loading lockers (CSRF + error handling)');
    this.log('2. Authentication redirect loops');
    this.log('3. Browser extension interference (CSP)');
    
    // Check if services are running
    const servicesReady = await this.startServices();
    
    if (!servicesReady) {
      this.log('❌ Services not available for testing', 'error');
      this.log('Please start the services manually:', 'info');
      this.log('  npm run start:all', 'info');
      this.log('  or node scripts/start-all.js', 'info');
      return false;
    }
    
    // Run automated tests
    await this.runNodeTests();
    
    // Show manual test instructions
    await this.runManualTestInstructions();
    
    // Generate final report
    const success = await this.generateTestReport();
    
    return success;
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = TestRunner;