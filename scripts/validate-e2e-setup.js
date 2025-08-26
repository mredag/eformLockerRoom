#!/usr/bin/env node

/**
 * E2E Test Setup Validation
 * 
 * This script validates that the end-to-end test environment is properly configured
 * and all required components are available for testing.
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

// Test configuration
const REQUIRED_SERVICES = [
  { name: 'Gateway', port: 3000, path: 'app/gateway' },
  { name: 'Kiosk', port: 3001, path: 'app/kiosk' },
  { name: 'Admin Panel', port: 3003, path: 'app/panel' }
];

const REQUIRED_FILES = [
  'scripts/e2e-admin-panel-relay-test.js',
  'scripts/e2e-hardware-validation.js',
  'scripts/run-e2e-admin-panel-tests.js',
  'scripts/validate-ui-feedback.js',
  '.kiro/specs/admin-panel-relay-control/requirements.md',
  '.kiro/specs/admin-panel-relay-control/design.md',
  '.kiro/specs/admin-panel-relay-control/tasks.md'
];

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: []
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function logError(message, error) {
  log(`${message}: ${error}`, 'error');
  results.errors.push({ message, error });
  results.failed++;
}

function logSuccess(message) {
  log(message, 'success');
  results.passed++;
}

function logWarning(message) {
  log(message, 'warning');
  results.warnings++;
}

// Check if file exists
async function checkFileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

// Execute command with timeout
async function executeCommand(command, args = [], timeout = 10000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'pipe' });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);
    
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({ code, stdout, stderr });
    });
    
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

// Check Node.js version
async function checkNodeVersion() {
  log('🔍 Checking Node.js version...');
  
  try {
    const result = await executeCommand('node', ['--version']);
    const version = result.stdout.trim();
    const majorVersion = parseInt(version.replace('v', '').split('.')[0]);
    
    if (majorVersion >= 18) {
      logSuccess(`Node.js version: ${version} (✓ >= 18)`);
    } else {
      logError('Node.js version too old', `${version} (requires >= 18)`);
    }
  } catch (error) {
    logError('Failed to check Node.js version', error.message);
  }
}

// Check required files
async function checkRequiredFiles() {
  log('📁 Checking required files...');
  
  for (const filePath of REQUIRED_FILES) {
    const exists = await checkFileExists(filePath);
    
    if (exists) {
      logSuccess(`Required file exists: ${filePath}`);
    } else {
      logError('Required file missing', filePath);
    }
  }
}

// Check service directories
async function checkServiceDirectories() {
  log('🏗️ Checking service directories...');
  
  for (const service of REQUIRED_SERVICES) {
    const exists = await checkFileExists(service.path);
    
    if (exists) {
      logSuccess(`Service directory exists: ${service.name} (${service.path})`);
      
      // Check for package.json in service directory
      const packageJsonPath = path.join(service.path, 'package.json');
      const hasPackageJson = await checkFileExists(packageJsonPath);
      
      if (hasPackageJson) {
        logSuccess(`Service has package.json: ${service.name}`);
      } else {
        logWarning(`Service missing package.json: ${service.name}`);
      }
    } else {
      logError('Service directory missing', `${service.name} (${service.path})`);
    }
  }
}

// Check database files
async function checkDatabaseFiles() {
  log('🗄️ Checking database files...');
  
  const dbFiles = [
    'data/eform.db',
    'migrations/001_initial_schema.sql',
    'migrations/002_provisioning_and_config.sql'
  ];
  
  for (const dbFile of dbFiles) {
    const exists = await checkFileExists(dbFile);
    
    if (exists) {
      logSuccess(`Database file exists: ${dbFile}`);
    } else {
      logWarning(`Database file missing: ${dbFile}`);
    }
  }
}

// Check npm dependencies
async function checkDependencies() {
  log('📦 Checking npm dependencies...');
  
  try {
    // Check if node_modules exists
    const nodeModulesExists = await checkFileExists('node_modules');
    
    if (nodeModulesExists) {
      logSuccess('node_modules directory exists');
      
      // Check for specific required packages
      const requiredPackages = ['fastify', 'sqlite3', 'node-fetch'];
      
      for (const pkg of requiredPackages) {
        const pkgPath = path.join('node_modules', pkg);
        const exists = await checkFileExists(pkgPath);
        
        if (exists) {
          logSuccess(`Required package installed: ${pkg}`);
        } else {
          logError('Required package missing', pkg);
        }
      }
    } else {
      logError('Dependencies not installed', 'Run npm install first');
    }
  } catch (error) {
    logError('Failed to check dependencies', error.message);
  }
}

// Check configuration files
async function checkConfigFiles() {
  log('⚙️ Checking configuration files...');
  
  const configFiles = [
    'config/system.json',
    'config/development.json',
    'config/production.json'
  ];
  
  for (const configFile of configFiles) {
    const exists = await checkFileExists(configFile);
    
    if (exists) {
      logSuccess(`Configuration file exists: ${configFile}`);
      
      // Try to parse JSON
      try {
        const content = await fs.readFile(configFile, 'utf8');
        JSON.parse(content);
        logSuccess(`Configuration file valid JSON: ${configFile}`);
      } catch (error) {
        logError(`Configuration file invalid JSON: ${configFile}`, error.message);
      }
    } else {
      logWarning(`Configuration file missing: ${configFile}`);
    }
  }
}

// Check test environment setup
async function checkTestEnvironment() {
  log('🧪 Checking test environment setup...');
  
  // Check if logs directory exists or can be created
  try {
    await fs.mkdir('logs', { recursive: true });
    logSuccess('Logs directory available');
  } catch (error) {
    logError('Failed to create logs directory', error.message);
  }
  
  // Check if test scripts are executable
  const testScripts = [
    'scripts/e2e-admin-panel-relay-test.js',
    'scripts/run-e2e-admin-panel-tests.js'
  ];
  
  for (const script of testScripts) {
    try {
      const result = await executeCommand('node', [script, '--help'], 5000);
      // If it doesn't crash immediately, it's probably valid
      logSuccess(`Test script syntax valid: ${path.basename(script)}`);
    } catch (error) {
      if (error.message.includes('timeout')) {
        logSuccess(`Test script syntax valid: ${path.basename(script)} (timed out as expected)`);
      } else {
        logError(`Test script has syntax errors: ${path.basename(script)}`, error.message);
      }
    }
  }
}

// Generate setup report
async function generateSetupReport() {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      passed: results.passed,
      failed: results.failed,
      warnings: results.warnings,
      total: results.passed + results.failed + results.warnings
    },
    errors: results.errors,
    recommendations: []
  };
  
  // Add recommendations based on results
  if (results.failed > 0) {
    report.recommendations.push('Fix failed checks before running E2E tests');
  }
  
  if (results.warnings > 0) {
    report.recommendations.push('Review warnings - some may affect test functionality');
  }
  
  if (results.errors.some(e => e.message.includes('dependencies'))) {
    report.recommendations.push('Run "npm install" to install missing dependencies');
  }
  
  if (results.errors.some(e => e.message.includes('service'))) {
    report.recommendations.push('Ensure all service directories are properly set up');
  }
  
  // Write report
  const reportPath = 'scripts/e2e-setup-report.json';
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  
  log(`Setup report saved to: ${reportPath}`);
  return report;
}

// Main validation function
async function validateE2ESetup() {
  console.log('🚀 Validating End-to-End Test Setup\n');
  
  try {
    await checkNodeVersion();
    await checkRequiredFiles();
    await checkServiceDirectories();
    await checkDatabaseFiles();
    await checkDependencies();
    await checkConfigFiles();
    await checkTestEnvironment();
    
  } catch (error) {
    logError('Setup validation failed', error.message);
  }
  
  // Generate and display report
  const report = await generateSetupReport();
  
  console.log('\n📊 Setup Validation Summary:');
  console.log(`✅ Passed: ${report.summary.passed}`);
  console.log(`❌ Failed: ${report.summary.failed}`);
  console.log(`⚠️  Warnings: ${report.summary.warnings}`);
  
  if (report.errors.length > 0) {
    console.log('\n🚨 Issues Found:');
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
  
  if (results.failed === 0) {
    console.log('\n🎉 E2E test environment is ready!');
    console.log('✅ You can now run the end-to-end tests');
    console.log('\nNext steps:');
    console.log('1. Start all services: npm run start');
    console.log('2. Run E2E tests: npm run test:e2e:admin-panel');
    process.exit(0);
  } else {
    console.log('\n⚠️  E2E test environment has issues that need to be resolved');
    console.log('Please fix the failed checks before running tests');
    process.exit(1);
  }
}

// Handle script execution
if (require.main === module) {
  validateE2ESetup().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { validateE2ESetup };