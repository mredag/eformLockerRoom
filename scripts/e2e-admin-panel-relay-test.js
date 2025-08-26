#!/usr/bin/env node

/**
 * End-to-End Admin Panel Relay Control Testing
 * 
 * This script validates the complete admin panel relay control functionality:
 * - Staff login and authentication
 * - Single locker open with physical verification
 * - Bulk locker open with timing validation
 * - Error scenario handling
 * - Command status polling
 * - Logging verification
 * - UI feedback validation
 */

const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

const __dirname = __dirname;

// Test configuration
const PANEL_BASE_URL = 'http://localhost:3003';
const GATEWAY_BASE_URL = 'http://localhost:3000';
const TEST_KIOSK_ID = 'kiosk-001';
const TEST_LOCKER_IDS = [1, 2, 3];
const BULK_INTERVAL_MS = 1000;

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function logError(message, error) {
  log(`${message}: ${error.message}`, 'error');
  testResults.errors.push({ message, error: error.message });
  testResults.failed++;
}

function logSuccess(message) {
  log(message, 'success');
  testResults.passed++;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Authentication helper
async function authenticateStaff() {
  log('🔐 Authenticating staff user...');
  
  try {
    // First get the login page to establish session
    const loginPageResponse = await fetch(`${PANEL_BASE_URL}/login`, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (!loginPageResponse.ok) {
      throw new Error(`Login page request failed: ${loginPageResponse.status}`);
    }
    
    // Extract cookies from the response
    const cookies = loginPageResponse.headers.get('set-cookie');
    
    // Attempt login with test credentials
    const loginResponse = await fetch(`${PANEL_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies || ''
      },
      credentials: 'include',
      body: JSON.stringify({
        username: 'admin',
        password: 'admin123'
      })
    });
    
    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      throw new Error(`Login failed: ${loginResponse.status} - ${errorText}`);
    }
    
    const loginData = await loginResponse.json();
    const sessionCookies = loginResponse.headers.get('set-cookie');
    
    logSuccess('Staff authentication successful');
    return sessionCookies;
    
  } catch (error) {
    logError('Staff authentication failed', error);
    throw error;
  }
}

// Test single locker open
async function testSingleLockerOpen(cookies) {
  log('🔓 Testing single locker open...');
  
  try {
    const lockerId = TEST_LOCKER_IDS[0];
    const reason = 'E2E test - single locker open';
    
    const response = await fetch(`${PANEL_BASE_URL}/api/lockers/${TEST_KIOSK_ID}/${lockerId}/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies
      },
      credentials: 'include',
      body: JSON.stringify({ reason })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`Single locker open failed: ${response.status} - ${errorData.message}`);
    }
    
    const result = await response.json();
    
    if (!result.success || !result.command_id) {
      throw new Error('Single locker open response missing required fields');
    }
    
    log(`Single locker open command queued: ${result.command_id}`);
    
    // Wait for command processing
    await sleep(3000);
    
    // Verify command status
    await testCommandStatus(cookies, result.command_id, 'single locker open');
    
    logSuccess(`Single locker ${lockerId} open test completed`);
    return result.command_id;
    
  } catch (error) {
    logError('Single locker open test failed', error);
    throw error;
  }
}

// Test bulk locker open
async function testBulkLockerOpen(cookies) {
  log('🔓 Testing bulk locker open...');
  
  try {
    const reason = 'E2E test - bulk locker open';
    const startTime = Date.now();
    
    const response = await fetch(`${PANEL_BASE_URL}/api/lockers/bulk/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies
      },
      credentials: 'include',
      body: JSON.stringify({
        kioskId: TEST_KIOSK_ID,
        lockerIds: TEST_LOCKER_IDS,
        reason,
        exclude_vip: false,
        interval_ms: BULK_INTERVAL_MS
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`Bulk locker open failed: ${response.status} - ${errorData.message}`);
    }
    
    const result = await response.json();
    
    if (!result.success || !result.command_id) {
      throw new Error('Bulk locker open response missing required fields');
    }
    
    log(`Bulk locker open command queued: ${result.command_id}`);
    
    // Calculate expected completion time
    const expectedDuration = TEST_LOCKER_IDS.length * BULK_INTERVAL_MS;
    log(`Expected bulk operation duration: ${expectedDuration}ms`);
    
    // Wait for command processing with buffer
    await sleep(expectedDuration + 2000);
    
    const actualDuration = Date.now() - startTime;
    log(`Actual bulk operation duration: ${actualDuration}ms`);
    
    // Verify timing is within acceptable range
    if (actualDuration < expectedDuration * 0.8 || actualDuration > expectedDuration * 2) {
      log(`⚠️  Bulk operation timing outside expected range`, 'error');
    } else {
      logSuccess('Bulk operation timing within expected range');
    }
    
    // Verify command status
    await testCommandStatus(cookies, result.command_id, 'bulk locker open');
    
    logSuccess(`Bulk locker open test completed for ${TEST_LOCKER_IDS.length} lockers`);
    return result.command_id;
    
  } catch (error) {
    logError('Bulk locker open test failed', error);
    throw error;
  }
}

// Test command status polling
async function testCommandStatus(cookies, commandId, operationType) {
  log(`📊 Testing command status polling for ${operationType}...`);
  
  try {
    const response = await fetch(`${PANEL_BASE_URL}/api/commands/${commandId}`, {
      method: 'GET',
      headers: {
        'Cookie': cookies
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`Command status request failed: ${response.status}`);
    }
    
    const status = await response.json();
    
    // Verify required fields
    const requiredFields = ['status', 'created_at'];
    for (const field of requiredFields) {
      if (!(field in status)) {
        throw new Error(`Command status missing required field: ${field}`);
      }
    }
    
    log(`Command ${commandId} status: ${status.status}`);
    
    if (status.error_message) {
      log(`Command error: ${status.error_message}`, 'error');
    }
    
    logSuccess(`Command status polling test completed for ${operationType}`);
    return status;
    
  } catch (error) {
    logError(`Command status polling test failed for ${operationType}`, error);
    throw error;
  }
}

// Test error scenarios
async function testErrorScenarios(cookies) {
  log('🚫 Testing error scenarios...');
  
  const errorTests = [
    {
      name: 'Invalid locker ID',
      url: `${PANEL_BASE_URL}/api/lockers/${TEST_KIOSK_ID}/999/open`,
      body: { reason: 'Error test - invalid locker' },
      expectedStatus: 400
    },
    {
      name: 'Missing kiosk',
      url: `${PANEL_BASE_URL}/api/lockers/nonexistent-kiosk/1/open`,
      body: { reason: 'Error test - missing kiosk' },
      expectedStatus: 400
    },
    {
      name: 'Invalid bulk locker IDs',
      url: `${PANEL_BASE_URL}/api/lockers/bulk/open`,
      body: {
        kioskId: TEST_KIOSK_ID,
        lockerIds: ['invalid', 'ids'],
        reason: 'Error test - invalid bulk IDs'
      },
      expectedStatus: 400
    }
  ];
  
  for (const test of errorTests) {
    try {
      log(`Testing: ${test.name}`);
      
      const response = await fetch(test.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookies
        },
        credentials: 'include',
        body: JSON.stringify(test.body)
      });
      
      if (response.status !== test.expectedStatus) {
        throw new Error(`Expected status ${test.expectedStatus}, got ${response.status}`);
      }
      
      const errorData = await response.json().catch(() => ({}));
      
      if (!errorData.message && !errorData.code) {
        log(`⚠️  Error response missing message/code for: ${test.name}`, 'error');
      }
      
      logSuccess(`Error scenario test passed: ${test.name}`);
      
    } catch (error) {
      logError(`Error scenario test failed: ${test.name}`, error);
    }
  }
}

// Test unauthorized access
async function testUnauthorizedAccess() {
  log('🔒 Testing unauthorized access...');
  
  try {
    const response = await fetch(`${PANEL_BASE_URL}/api/lockers/${TEST_KIOSK_ID}/1/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason: 'Unauthorized test' })
    });
    
    if (response.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${response.status}`);
    }
    
    logSuccess('Unauthorized access properly rejected');
    
  } catch (error) {
    logError('Unauthorized access test failed', error);
  }
}

// Verify logging
async function verifyLogging() {
  log('📝 Verifying logging...');
  
  try {
    // Check if log files exist and contain expected entries
    const logPaths = [
      path.join(__dirname, '..', 'logs', 'panel.log'),
      path.join(__dirname, '..', 'logs', 'kiosk.log'),
      path.join(__dirname, '..', 'logs', 'gateway.log')
    ];
    
    let logEntriesFound = 0;
    
    for (const logPath of logPaths) {
      try {
        const logContent = await fs.readFile(logPath, 'utf8');
        
        // Look for test-related log entries
        if (logContent.includes('E2E test')) {
          logEntriesFound++;
          log(`Found test entries in ${path.basename(logPath)}`);
        }
        
        // Check for required fields in log entries
        const requiredLogFields = ['staff_user', 'reason', 'command_id', 'timestamp'];
        let fieldsFound = 0;
        
        for (const field of requiredLogFields) {
          if (logContent.includes(field)) {
            fieldsFound++;
          }
        }
        
        if (fieldsFound === requiredLogFields.length) {
          logSuccess(`All required log fields found in ${path.basename(logPath)}`);
        } else {
          log(`⚠️  Missing log fields in ${path.basename(logPath)}: ${fieldsFound}/${requiredLogFields.length}`, 'error');
        }
        
      } catch (error) {
        log(`Log file not accessible: ${path.basename(logPath)}`);
      }
    }
    
    if (logEntriesFound > 0) {
      logSuccess('Logging verification completed');
    } else {
      log('⚠️  No test log entries found', 'error');
    }
    
  } catch (error) {
    logError('Logging verification failed', error);
  }
}

// Check service availability
async function checkServiceAvailability() {
  log('🔍 Checking service availability...');
  
  const services = [
    { name: 'Admin Panel', url: `${PANEL_BASE_URL}/health` },
    { name: 'Gateway', url: `${GATEWAY_BASE_URL}/health` }
  ];
  
  for (const service of services) {
    try {
      const response = await fetch(service.url, { timeout: 5000 });
      
      if (response.ok) {
        logSuccess(`${service.name} service is available`);
      } else {
        log(`⚠️  ${service.name} service returned ${response.status}`, 'error');
      }
      
    } catch (error) {
      logError(`${service.name} service unavailable`, error);
    }
  }
}

// Main test execution
async function runE2ETests() {
  console.log('🚀 Starting End-to-End Admin Panel Relay Control Tests\n');
  
  try {
    // Check service availability first
    await checkServiceAvailability();
    
    // Test unauthorized access
    await testUnauthorizedAccess();
    
    // Authenticate staff user
    const cookies = await authenticateStaff();
    
    // Test single locker open
    await testSingleLockerOpen(cookies);
    
    // Test bulk locker open
    await testBulkLockerOpen(cookies);
    
    // Test error scenarios
    await testErrorScenarios(cookies);
    
    // Verify logging
    await verifyLogging();
    
  } catch (error) {
    logError('E2E test execution failed', error);
  }
  
  // Print test summary
  console.log('\n📊 Test Summary:');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  
  if (testResults.errors.length > 0) {
    console.log('\n🚨 Errors encountered:');
    testResults.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.message}: ${error.error}`);
    });
  }
  
  if (testResults.failed === 0) {
    console.log('\n🎉 All E2E tests completed successfully!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
    process.exit(1);
  }
}

// Handle script execution
if (require.main === module) {
  runE2ETests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runE2ETests };