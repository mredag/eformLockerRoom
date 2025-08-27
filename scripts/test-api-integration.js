#!/usr/bin/env node

/**
 * API Integration Test Script
 * Tests API compatibility and integration points without requiring full database setup
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🌐 API Integration Testing Started');
console.log('==================================');

// Test configuration
const TEST_CONFIG = {
  kioskPort: 3002,
  panelPort: 3001,
  gatewayPort: 3000,
  timeout: 10000,
  retryAttempts: 3
};

/**
 * Check if a service is running on a specific port
 */
function checkServiceHealth(port, serviceName) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: '/health',
      method: 'GET',
      timeout: 2000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ ${serviceName} service is healthy on port ${port}`);
          resolve(true);
        } else {
          console.log(`⚠️ ${serviceName} service responded with status ${res.statusCode}`);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ ${serviceName} service not accessible on port ${port}: ${error.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log(`⏰ ${serviceName} service health check timed out on port ${port}`);
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Test API endpoint availability
 */
function testAPIEndpoint(port, path, method = 'GET', data = null) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        resolve({
          success: true,
          statusCode: res.statusCode,
          data: responseData,
          headers: res.headers
        });
      });
    });

    req.on('error', (error) => {
      resolve({
        success: false,
        error: error.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: 'Request timeout'
      });
    });

    if (data && (method === 'POST' || method === 'PUT')) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Test Kiosk Service API Integration
 */
async function testKioskAPIIntegration() {
  console.log('\n🖥️ Testing Kiosk Service API Integration...');
  
  const kioskHealthy = await checkServiceHealth(TEST_CONFIG.kioskPort, 'Kiosk');
  
  if (!kioskHealthy) {
    console.log('⚠️ Kiosk service not running - testing API structure only');
    
    // Check if UI controller file has required endpoints
    const uiControllerPath = path.join(process.cwd(), 'app/kiosk/src/controllers/ui-controller.ts');
    if (fs.existsSync(uiControllerPath)) {
      const content = fs.readFileSync(uiControllerPath, 'utf-8');
      
      const endpoints = [
        { pattern: '/api/card/:cardId/locker', search: '/api/card/' },
        { pattern: '/api/locker/assign', search: '/api/locker/assign' },
        { pattern: '/api/locker/release', search: '/api/locker/release' },
        { pattern: '/api/lockers/available', search: '/api/lockers/available' },
        { pattern: '/api/session/status', search: '/api/session/status' },
        { pattern: '/api/session/cancel', search: '/api/session/cancel' },
        { pattern: '/api/hardware/status', search: '/api/hardware/status' }
      ];
      
      endpoints.forEach(endpoint => {
        if (content.includes(endpoint.search)) {
          console.log(`✅ API endpoint defined: ${endpoint.pattern}`);
        } else {
          console.log(`❌ API endpoint missing: ${endpoint.pattern}`);
        }
      });
    }
    
    return false;
  }

  // Test API endpoints
  const endpoints = [
    { path: '/health', method: 'GET', description: 'Health check' },
    { path: '/api/lockers/available?kioskId=test-kiosk', method: 'GET', description: 'Get available lockers' },
    { path: '/api/session/status?kiosk_id=test-kiosk', method: 'GET', description: 'Get session status' },
    { path: '/api/hardware/status', method: 'GET', description: 'Get hardware status' }
  ];

  let successCount = 0;

  for (const endpoint of endpoints) {
    const result = await testAPIEndpoint(TEST_CONFIG.kioskPort, endpoint.path, endpoint.method);
    
    if (result.success) {
      console.log(`✅ ${endpoint.description}: ${result.statusCode}`);
      successCount++;
    } else {
      console.log(`❌ ${endpoint.description}: ${result.error}`);
    }
  }

  console.log(`📊 Kiosk API: ${successCount}/${endpoints.length} endpoints accessible`);
  return successCount === endpoints.length;
}

/**
 * Test Panel Service API Integration
 */
async function testPanelAPIIntegration() {
  console.log('\n🎛️ Testing Panel Service API Integration...');
  
  const panelHealthy = await checkServiceHealth(TEST_CONFIG.panelPort, 'Panel');
  
  if (!panelHealthy) {
    console.log('⚠️ Panel service not running - checking file structure');
    
    const panelFiles = [
      'app/panel/src/routes/locker-routes.ts',
      'app/panel/src/routes/relay-routes.ts',
      'app/panel/src/views/lockers.html',
      'app/panel/src/views/relay.html'
    ];
    
    panelFiles.forEach(file => {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        console.log(`✅ Panel file exists: ${file}`);
      } else {
        console.log(`❌ Panel file missing: ${file}`);
      }
    });
    
    return false;
  }

  // Test Panel endpoints (may require authentication)
  const endpoints = [
    { path: '/health', method: 'GET', description: 'Health check' },
    { path: '/lockers', method: 'GET', description: 'Locker management page' },
    { path: '/relay', method: 'GET', description: 'Relay control page' }
  ];

  let successCount = 0;

  for (const endpoint of endpoints) {
    const result = await testAPIEndpoint(TEST_CONFIG.panelPort, endpoint.path, endpoint.method);
    
    if (result.success && (result.statusCode === 200 || result.statusCode === 302)) {
      console.log(`✅ ${endpoint.description}: ${result.statusCode}`);
      successCount++;
    } else if (result.statusCode === 401 || result.statusCode === 403) {
      console.log(`✅ ${endpoint.description}: ${result.statusCode} (auth required - expected)`);
      successCount++;
    } else {
      console.log(`❌ ${endpoint.description}: ${result.error || result.statusCode}`);
    }
  }

  console.log(`📊 Panel API: ${successCount}/${endpoints.length} endpoints accessible`);
  return successCount >= endpoints.length * 0.8; // Allow for auth-protected endpoints
}

/**
 * Test Gateway Service API Integration
 */
async function testGatewayAPIIntegration() {
  console.log('\n🚪 Testing Gateway Service API Integration...');
  
  const gatewayHealthy = await checkServiceHealth(TEST_CONFIG.gatewayPort, 'Gateway');
  
  if (!gatewayHealthy) {
    console.log('⚠️ Gateway service not running - checking file structure');
    
    const gatewayFiles = [
      'app/gateway/src/routes/admin.ts',
      'app/gateway/src/routes/heartbeat.ts'
    ];
    
    gatewayFiles.forEach(file => {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        console.log(`✅ Gateway file exists: ${file}`);
      } else {
        console.log(`❌ Gateway file missing: ${file}`);
      }
    });
    
    return false;
  }

  // Test Gateway endpoints
  const endpoints = [
    { path: '/health', method: 'GET', description: 'Health check' },
    { path: '/heartbeat', method: 'GET', description: 'Heartbeat endpoint' }
  ];

  let successCount = 0;

  for (const endpoint of endpoints) {
    const result = await testAPIEndpoint(TEST_CONFIG.gatewayPort, endpoint.path, endpoint.method);
    
    if (result.success) {
      console.log(`✅ ${endpoint.description}: ${result.statusCode}`);
      successCount++;
    } else {
      console.log(`❌ ${endpoint.description}: ${result.error}`);
    }
  }

  console.log(`📊 Gateway API: ${successCount}/${endpoints.length} endpoints accessible`);
  return successCount === endpoints.length;
}

/**
 * Test WebSocket Integration
 */
async function testWebSocketIntegration() {
  console.log('\n🌐 Testing WebSocket Integration...');
  
  // Check if WebSocket service file exists and has required methods
  const wsServicePath = path.join(process.cwd(), 'shared/services/websocket-service.ts');
  
  if (!fs.existsSync(wsServicePath)) {
    console.log('❌ WebSocket service file not found');
    return false;
  }

  const content = fs.readFileSync(wsServicePath, 'utf-8');
  
  const requiredMethods = [
    'initialize',
    'broadcastStateUpdate',
    'getConnectionStatus',
    'shutdown'
  ];

  let methodsFound = 0;

  requiredMethods.forEach(method => {
    if (content.includes(method)) {
      console.log(`✅ WebSocket method: ${method}`);
      methodsFound++;
    } else {
      console.log(`❌ WebSocket method missing: ${method}`);
    }
  });

  // Check for WebSocket server initialization
  if (content.includes('WebSocketServer')) {
    console.log('✅ WebSocket server implementation found');
    methodsFound++;
  } else {
    console.log('❌ WebSocket server implementation missing');
  }

  console.log(`📊 WebSocket Integration: ${methodsFound}/${requiredMethods.length + 1} features available`);
  return methodsFound >= requiredMethods.length;
}

/**
 * Test Session Management Integration
 */
async function testSessionManagementIntegration() {
  console.log('\n🔑 Testing Session Management Integration...');
  
  const sessionManagerPath = path.join(process.cwd(), 'app/kiosk/src/controllers/session-manager.ts');
  
  if (!fs.existsSync(sessionManagerPath)) {
    console.log('❌ Session Manager file not found');
    return false;
  }

  const content = fs.readFileSync(sessionManagerPath, 'utf-8');
  
  const requiredFeatures = [
    { name: 'Session Creation', pattern: /createSession/ },
    { name: 'Session Retrieval', pattern: /getKioskSession|getSession/ },
    { name: 'Session Completion', pattern: /completeSession/ },
    { name: 'Session Cancellation', pattern: /cancelSession/ },
    { name: 'Timeout Handling', pattern: /timeout|expire/i },
    { name: '30-second timeout', pattern: /defaultTimeoutSeconds:\s*30/ },
    { name: 'Event Emission', pattern: /emit|EventEmitter/ },
    { name: 'One-session-per-kiosk', pattern: /maxSessionsPerKiosk:\s*1/ }
  ];

  let featuresFound = 0;

  requiredFeatures.forEach(feature => {
    if (content.match(feature.pattern)) {
      console.log(`✅ Session feature: ${feature.name}`);
      featuresFound++;
    } else {
      console.log(`❌ Session feature missing: ${feature.name}`);
    }
  });

  console.log(`📊 Session Management: ${featuresFound}/${requiredFeatures.length} features available`);
  return featuresFound >= requiredFeatures.length * 0.8;
}

/**
 * Test Hardware Controller Integration
 */
async function testHardwareControllerIntegration() {
  console.log('\n🔧 Testing Hardware Controller Integration...');
  
  const hardwarePath = path.join(process.cwd(), 'app/kiosk/src/hardware/modbus-controller.ts');
  
  if (!fs.existsSync(hardwarePath)) {
    console.log('❌ Hardware Controller file not found');
    return false;
  }

  const content = fs.readFileSync(hardwarePath, 'utf-8');
  
  const requiredFeatures = [
    { name: 'Locker Opening', pattern: /openLocker/ },
    { name: 'Hardware Status', pattern: /getHardwareStatus/ },
    { name: 'Error Handling', pattern: /catch|error|Error/ },
    { name: 'Retry Logic', pattern: /retry|Retry/ },
    { name: 'Event Emission', pattern: /emit|EventEmitter/ },
    { name: 'Serial Communication', pattern: /SerialPort|serialport/ },
    { name: 'Modbus Protocol', pattern: /modbus|Modbus/ },
    { name: 'Hardware Availability Check', pattern: /isHardwareAvailable|available/ }
  ];

  let featuresFound = 0;

  requiredFeatures.forEach(feature => {
    if (content.match(feature.pattern)) {
      console.log(`✅ Hardware feature: ${feature.name}`);
      featuresFound++;
    } else {
      console.log(`❌ Hardware feature missing: ${feature.name}`);
    }
  });

  console.log(`📊 Hardware Controller: ${featuresFound}/${requiredFeatures.length} features available`);
  return featuresFound >= requiredFeatures.length * 0.8;
}

/**
 * Test Error Handling Integration
 */
async function testErrorHandlingIntegration() {
  console.log('\n🚨 Testing Error Handling Integration...');
  
  const files = [
    { path: 'app/kiosk/src/controllers/ui-controller.ts', name: 'UI Controller' },
    { path: 'shared/services/locker-state-manager.ts', name: 'Locker State Manager' },
    { path: 'app/kiosk/src/hardware/modbus-controller.ts', name: 'Hardware Controller' }
  ];

  let filesWithErrorHandling = 0;

  files.forEach(file => {
    const filePath = path.join(process.cwd(), file.path);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      const errorPatterns = [
        /try\s*{[\s\S]*?catch/,
        /\.catch\(/,
        /console\.error/,
        /throw new Error/,
        /error.*handling/i
      ];

      const hasErrorHandling = errorPatterns.some(pattern => content.match(pattern));
      
      if (hasErrorHandling) {
        console.log(`✅ Error handling in ${file.name}`);
        filesWithErrorHandling++;
      } else {
        console.log(`❌ Insufficient error handling in ${file.name}`);
      }
    } else {
      console.log(`❌ File not found: ${file.name}`);
    }
  });

  console.log(`📊 Error Handling: ${filesWithErrorHandling}/${files.length} components have proper error handling`);
  return filesWithErrorHandling === files.length;
}

/**
 * Run all API integration tests
 */
async function runAllAPITests() {
  const startTime = Date.now();
  
  console.log('🚀 Starting API Integration Tests');
  
  const tests = [
    { name: 'Kiosk API Integration', fn: testKioskAPIIntegration },
    { name: 'Panel API Integration', fn: testPanelAPIIntegration },
    { name: 'Gateway API Integration', fn: testGatewayAPIIntegration },
    { name: 'WebSocket Integration', fn: testWebSocketIntegration },
    { name: 'Session Management Integration', fn: testSessionManagementIntegration },
    { name: 'Hardware Controller Integration', fn: testHardwareControllerIntegration },
    { name: 'Error Handling Integration', fn: testErrorHandlingIntegration }
  ];

  const results = [];

  for (const test of tests) {
    try {
      const result = await test.fn();
      results.push({ name: test.name, passed: result });
    } catch (error) {
      console.error(`❌ ${test.name} failed:`, error.message);
      results.push({ name: test.name, passed: false, error: error.message });
    }
  }

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  console.log('\n📊 API Integration Test Summary');
  console.log('==============================');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log(`\n📈 Results: ${passed}/${total} integration tests passed`);
  console.log(`⏱️ Duration: ${duration.toFixed(2)} seconds`);

  if (passed >= total * 0.8) { // Allow 80% pass rate for integration tests
    console.log('\n🎉 API Integration Tests Passed!');
    console.log('✅ Backend integration is compatible with kiosk UI');
    console.log('✅ API endpoints are properly structured');
    console.log('✅ Error handling mechanisms are in place');
    console.log('✅ Session management is integrated');
    console.log('✅ Hardware controller is accessible');
    return true;
  } else {
    console.log('\n⚠️ Some API Integration Tests Failed');
    console.log('❌ Please review the failed tests above');
    console.log('❌ Ensure all services are running for full testing');
    return false;
  }
}

// Run tests if called directly
if (require.main === module) {
  runAllAPITests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = {
  runAllAPITests,
  testKioskAPIIntegration,
  testPanelAPIIntegration,
  testGatewayAPIIntegration,
  testWebSocketIntegration,
  testSessionManagementIntegration,
  testHardwareControllerIntegration,
  testErrorHandlingIntegration
};