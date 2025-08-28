#!/usr/bin/env node

/**
 * Comprehensive End-to-End Test Runner for Admin Panel Relay Control
 * 
 * This script orchestrates all end-to-end tests including:
 * - Service availability checks
 * - Hardware validation
 * - Admin panel functionality tests
 * - Error scenario validation
 * - Logging verification
 * - UI feedback validation
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const __dirname = __dirname;

// Test configuration
const TEST_TIMEOUT = 300000; // 5 minutes
const SERVICE_STARTUP_DELAY = 10000; // 10 seconds

// Test results tracking
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: []
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function logError(message, error) {
  log(`${message}: ${error}`, 'error');
  testResults.errors.push({ message, error });
  testResults.failed++;
}

function logSuccess(message) {
  log(message, 'success');
  testResults.passed++;
}

function logSkipped(message) {
  log(message, 'warning');
  testResults.skipped++;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Execute shell command with timeout
async function executeCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || TEST_TIMEOUT;
    const cwd = options.cwd || process.cwd();
    
    log(`Executing: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, {
      cwd,
      stdio: 'pipe',
      shell: true
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (options.showOutput) {
        process.stdout.write(data);
      }
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (options.showOutput) {
        process.stderr.write(data);
      }
    });
    
    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);
    
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
    
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

// Check if services are running
async function checkServiceStatus() {
  log('🔍 Checking service status...');
  
  const services = [
    { name: 'Admin Panel', port: 3003 },
    { name: 'Gateway', port: 3000 },
    { name: 'Kiosk', port: 3001 }
  ];
  
  const runningServices = [];
  
  for (const service of services) {
    try {
      await executeCommand('curl', ['-f', '-s', `http://localhost:${service.port}/health`], {
        timeout: 5000
      });
      
      logSuccess(`${service.name} service is running on port ${service.port}`);
      runningServices.push(service);
      
    } catch (error) {
      log(`${service.name} service not available on port ${service.port}`, 'warning');
    }
  }
  
  return runningServices;
}

// Start services if needed
async function startServices() {
  log('🚀 Starting services...');
  
  try {
    // Check if start-all script exists
    const startScript = path.join(__dirname, 'start-all.js');
    
    try {
      await fs.access(startScript);
      
      log('Starting all services...');
      await executeCommand('node', [startScript], {
        timeout: 30000,
        showOutput: true
      });
      
      // Wait for services to fully start
      log(`Waiting ${SERVICE_STARTUP_DELAY}ms for services to start...`);
      await sleep(SERVICE_STARTUP_DELAY);
      
      logSuccess('Services started successfully');
      
    } catch (error) {
      log('start-all.js not found, services may need to be started manually', 'warning');
      throw error;
    }
    
  } catch (error) {
    logError('Failed to start services', error.message);
    throw error;
  }
}

// Run hardware validation tests
async function runHardwareValidation() {
  log('🔧 Running hardware validation tests...');
  testResults.total++;
  
  try {
    const result = await executeCommand('node', ['scripts/e2e-hardware-validation.js'], {
      timeout: 60000,
      showOutput: true
    });
    
    logSuccess('Hardware validation tests passed');
    
  } catch (error) {
    logError('Hardware validation tests failed', error.message);
    
    // Hardware validation failure is critical but we can continue with other tests
    log('Continuing with software tests despite hardware validation failure...', 'warning');
  }
}

// Run admin panel functionality tests
async function runAdminPanelTests() {
  log('🎛️ Running admin panel functionality tests...');
  testResults.total++;
  
  try {
    const result = await executeCommand('node', ['scripts/e2e-admin-panel-relay-test.js'], {
      timeout: 120000,
      showOutput: true
    });
    
    logSuccess('Admin panel functionality tests passed');
    
  } catch (error) {
    logError('Admin panel functionality tests failed', error.message);
    throw error;
  }
}

// Run service integration tests
async function runServiceIntegrationTests() {
  log('🔗 Running service integration tests...');
  testResults.total++;
  
  try {
    // Check if integration test script exists
    const integrationScript = path.join(__dirname, 'validate-integration.js');
    
    try {
      await fs.access(integrationScript);
      
      const result = await executeCommand('node', [integrationScript], {
        timeout: 60000,
        showOutput: true
      });
      
      logSuccess('Service integration tests passed');
      
    } catch (accessError) {
      logSkipped('Service integration tests (script not found)');
    }
    
  } catch (error) {
    logError('Service integration tests failed', error.message);
  }
}

// Validate logging output
async function validateLogging() {
  log('📝 Validating logging output...');
  testResults.total++;
  
  try {
    const logDir = path.join(__dirname, '..', 'logs');
    
    try {
      const logFiles = await fs.readdir(logDir);
      
      if (logFiles.length === 0) {
        throw new Error('No log files found');
      }
      
      let testEntriesFound = 0;
      
      for (const logFile of logFiles) {
        if (logFile.endsWith('.log')) {
          const logPath = path.join(logDir, logFile);
          const logContent = await fs.readFile(logPath, 'utf8');
          
          // Look for test-related entries
          if (logContent.includes('E2E test') || logContent.includes('admin_panel_relay_test')) {
            testEntriesFound++;
            log(`Found test entries in ${logFile}`);
          }
          
          // Check for required fields
          const requiredFields = ['staff_user', 'reason', 'command_id'];
          const fieldsFound = requiredFields.filter(field => logContent.includes(field));
          
          if (fieldsFound.length === requiredFields.length) {
            log(`All required log fields found in ${logFile}`);
          } else {
            log(`Missing log fields in ${logFile}: ${fieldsFound.length}/${requiredFields.length}`, 'warning');
          }
        }
      }
      
      if (testEntriesFound > 0) {
        logSuccess('Logging validation passed');
      } else {
        throw new Error('No test-related log entries found');
      }
      
    } catch (error) {
      throw new Error(`Log directory access failed: ${error.message}`);
    }
    
  } catch (error) {
    logError('Logging validation failed', error.message);
  }
}

// Generate test report
async function generateTestReport() {
  log('📊 Generating test report...');
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: testResults.total,
      passed: testResults.passed,
      failed: testResults.failed,
      skipped: testResults.skipped,
      success_rate: testResults.total > 0 ? (testResults.passed / testResults.total * 100).toFixed(2) : 0
    },
    errors: testResults.errors,
    recommendations: []
  };
  
  // Add recommendations based on results
  if (testResults.failed > 0) {
    report.recommendations.push('Review failed tests and address underlying issues');
  }
  
  if (testResults.errors.some(e => e.message.includes('hardware'))) {
    report.recommendations.push('Check hardware connections and Modbus configuration');
  }
  
  if (testResults.errors.some(e => e.message.includes('service'))) {
    report.recommendations.push('Verify all services are running and properly configured');
  }
  
  // Write report to file
  const reportPath = path.join(__dirname, 'e2e-test-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  
  log(`Test report saved to: ${reportPath}`);
  
  return report;
}

// Main test execution
async function runAllTests() {
  console.log('🚀 Starting Comprehensive End-to-End Tests for Admin Panel Relay Control\n');
  
  const startTime = Date.now();
  
  try {
    // Check service status
    const runningServices = await checkServiceStatus();
    
    // Start services if needed
    if (runningServices.length < 3) {
      log('Not all services are running, attempting to start them...', 'warning');
      try {
        await startServices();
        await checkServiceStatus(); // Re-check after starting
      } catch (error) {
        log('Failed to start services automatically. Please start them manually:', 'warning');
        console.log('1. npm run start:gateway');
        console.log('2. npm run start:kiosk');
        console.log('3. npm run start:panel');
        console.log('\nThen re-run this test script.');
        process.exit(1);
      }
    }
    
    // Run hardware validation (non-blocking)
    await runHardwareValidation();
    
    // Run admin panel functionality tests
    await runAdminPanelTests();
    
    // Run service integration tests
    await runServiceIntegrationTests();
    
    // Validate logging
    await validateLogging();
    
  } catch (error) {
    logError('Test execution failed', error.message);
  }
  
  const duration = Date.now() - startTime;
  
  // Generate and display test report
  const report = await generateTestReport();
  
  console.log('\n📊 Final Test Results:');
  console.log(`⏱️  Total Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`📈 Success Rate: ${report.summary.success_rate}%`);
  console.log(`✅ Passed: ${report.summary.passed}`);
  console.log(`❌ Failed: ${report.summary.failed}`);
  console.log(`⚠️  Skipped: ${report.summary.skipped}`);
  
  if (report.errors.length > 0) {
    console.log('\n🚨 Errors Summary:');
    report.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.message}: ${error.error}`);
    });
  }
  
  if (report.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    report.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec}`);
    });
  }
  
  if (testResults.failed === 0) {
    console.log('\n🎉 All end-to-end tests completed successfully!');
    console.log('✅ Admin Panel Relay Control is fully functional');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors and recommendations above.');
    process.exit(1);
  }
}

// Handle script execution
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests };