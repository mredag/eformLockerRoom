#!/usr/bin/env node

/**
 * Quick service test script that starts services, tests them, and stops them automatically
 * This prevents blocking the terminal indefinitely
 */

const { spawn } = require('child_process');
// Use dynamic import for node-fetch
let fetch;

const SERVICES = [
  { name: 'Gateway', port: 3000, url: 'http://localhost:3000/health' },
  { name: 'Panel', port: 3001, url: 'http://localhost:3001/health' },
  { name: 'Kiosk', port: 3002, url: 'http://localhost:3002/health' }
];

const TEST_TIMEOUT = 30000; // 30 seconds max test time
const STARTUP_DELAY = 5000; // 5 seconds to let services start

let servicesProcess = null;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testService(service) {
  try {
    if (!fetch) {
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
    }
    console.log(`🔍 Testing ${service.name} at ${service.url}...`);
    const response = await fetch(service.url, { timeout: 5000 });
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ ${service.name} is healthy`);
      return true;
    } else {
      console.log(`❌ ${service.name} returned error: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${service.name} failed: ${error.message}`);
    return false;
  }
}

async function testJavaScriptError() {
  try {
    if (!fetch) {
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
    }
    console.log('🔍 Testing Panel lockers page for JavaScript errors...');
    
    // Test if static files are served correctly
    const staticResponse = await fetch('http://localhost:3001/static/i18n.js', { timeout: 5000 });
    if (staticResponse.ok) {
      console.log('✅ Static i18n.js file is accessible');
    } else {
      console.log(`❌ Static i18n.js file not accessible: ${staticResponse.status}`);
    }
    
    // Test i18n API endpoints
    const messagesResponse = await fetch('http://localhost:3001/api/i18n/messages', { timeout: 5000 });
    if (messagesResponse.ok) {
      const data = await messagesResponse.json();
      console.log('✅ i18n messages API is working');
      console.log(`   Language: ${data.language}`);
      console.log(`   Messages loaded: ${Object.keys(data.messages).length} sections`);
    } else {
      console.log(`❌ i18n messages API failed: ${messagesResponse.status}`);
    }
    
    // Test lockers page
    const lockersResponse = await fetch('http://localhost:3001/lockers', { timeout: 5000 });
    if (lockersResponse.ok) {
      console.log('✅ Lockers page is accessible');
    } else {
      console.log(`❌ Lockers page not accessible: ${lockersResponse.status}`);
    }
    
  } catch (error) {
    console.log(`❌ JavaScript error test failed: ${error.message}`);
  }
}

async function startServices() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting services...');
    
    servicesProcess = spawn('node', ['scripts/start-all.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });
    
    let output = '';
    
    servicesProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      
      // Look for the "All services started!" message
      if (text.includes('All services started!')) {
        console.log('✅ All services started successfully');
        resolve();
      }
    });
    
    servicesProcess.stderr.on('data', (data) => {
      console.log('Service stderr:', data.toString());
    });
    
    servicesProcess.on('error', (error) => {
      console.error('Failed to start services:', error);
      reject(error);
    });
    
    // Timeout if services don't start within reasonable time
    setTimeout(() => {
      if (servicesProcess && !servicesProcess.killed) {
        console.log('⏰ Services taking too long to start, proceeding with tests...');
        resolve();
      }
    }, 10000);
  });
}

function stopServices() {
  if (servicesProcess && !servicesProcess.killed) {
    console.log('🛑 Stopping services...');
    
    // Send SIGINT to gracefully stop services
    servicesProcess.kill('SIGINT');
    
    // Force kill if not stopped within 5 seconds
    setTimeout(() => {
      if (servicesProcess && !servicesProcess.killed) {
        console.log('🔨 Force killing services...');
        servicesProcess.kill('SIGKILL');
      }
    }, 5000);
  }
}

async function runTests() {
  const startTime = Date.now();
  
  try {
    // Start services
    await startServices();
    
    // Wait a bit for services to fully initialize
    console.log(`⏳ Waiting ${STARTUP_DELAY/1000} seconds for services to initialize...`);
    await sleep(STARTUP_DELAY);
    
    // Test each service
    const results = [];
    for (const service of SERVICES) {
      const result = await testService(service);
      results.push({ service: service.name, success: result });
    }
    
    // Test JavaScript error specifically
    await testJavaScriptError();
    
    // Summary
    console.log('\n📊 Test Results:');
    results.forEach(result => {
      console.log(`   ${result.success ? '✅' : '❌'} ${result.service}`);
    });
    
    const successCount = results.filter(r => r.success).length;
    console.log(`\n🎯 ${successCount}/${results.length} services are healthy`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Always stop services
    stopServices();
    
    const duration = Date.now() - startTime;
    console.log(`\n⏱️  Total test time: ${duration}ms`);
    console.log('✅ Test completed, services stopped');
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, stopping services...');
  stopServices();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, stopping services...');
  stopServices();
  process.exit(0);
});

// Set overall timeout
setTimeout(() => {
  console.log('\n⏰ Test timeout reached, stopping services...');
  stopServices();
  process.exit(1);
}, TEST_TIMEOUT);

// Run the tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  stopServices();
  process.exit(1);
});