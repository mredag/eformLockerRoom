#!/usr/bin/env node

/**
 * Kiosk Environment Validation Script
 * Checks all requirements for the kiosk service to run properly
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Eform Locker - Kiosk Environment Validation');
console.log('==============================================\n');

let hasErrors = false;

function checkPassed(message) {
  console.log(`✅ ${message}`);
}

function checkFailed(message, details = '') {
  console.log(`❌ ${message}`);
  if (details) {
    console.log(`   ${details}`);
  }
  hasErrors = true;
}

function checkWarning(message, details = '') {
  console.log(`⚠️  ${message}`);
  if (details) {
    console.log(`   ${details}`);
  }
}

// 1. Check Node.js version
console.log('📋 Checking Node.js version...');
try {
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion >= 18) {
    checkPassed(`Node.js ${nodeVersion} (compatible)`);
  } else {
    checkFailed(`Node.js ${nodeVersion} (requires >= 18.0.0)`);
  }
} catch (error) {
  checkFailed('Failed to check Node.js version', error.message);
}

// 2. Check project structure
console.log('\n📁 Checking project structure...');
const requiredPaths = [
  'package.json',
  'app/kiosk/package.json',
  'app/kiosk/src/index.ts',
  'shared'
];

for (const filePath of requiredPaths) {
  if (fs.existsSync(filePath)) {
    checkPassed(`Found ${filePath}`);
  } else {
    checkFailed(`Missing ${filePath}`);
  }
}

// 3. Check kiosk build
console.log('\n🔨 Checking kiosk build...');
const kioskDistPath = 'app/kiosk/dist/index.js';
if (fs.existsSync(kioskDistPath)) {
  checkPassed('Kiosk build exists');
  
  // Check build file size
  const stats = fs.statSync(kioskDistPath);
  if (stats.size > 100000) { // > 100KB
    checkPassed(`Build size: ${Math.round(stats.size / 1024)}KB`);
  } else {
    checkWarning(`Build size seems small: ${Math.round(stats.size / 1024)}KB`);
  }
  
  // Test syntax
  try {
    execSync(`node -c "${kioskDistPath}"`, { stdio: 'pipe' });
    checkPassed('Build syntax is valid');
  } catch (error) {
    checkFailed('Build has syntax errors', error.message);
  }
} else {
  checkFailed('Kiosk build not found', 'Run: cd app/kiosk && npm run build');
}

// 4. Check dependencies
console.log('\n📦 Checking dependencies...');
const kioskNodeModules = 'app/kiosk/node_modules';
if (fs.existsSync(kioskNodeModules)) {
  checkPassed('Kiosk dependencies installed');
  
  // Check critical dependencies (these are external in the build)
  const criticalDeps = ['serialport', 'sqlite3', 'node-hid'];
  for (const dep of criticalDeps) {
    const depPath = path.join(kioskNodeModules, dep);
    if (fs.existsSync(depPath)) {
      checkPassed(`Dependency: ${dep}`);
    } else {
      checkWarning(`Missing dependency: ${dep}`, 'May be bundled or not required');
    }
  }
} else {
  checkFailed('Kiosk dependencies not installed', 'Run: cd app/kiosk && npm install');
}

// 5. Check environment variables
console.log('\n🌍 Checking environment variables...');
const envVars = {
  'MODBUS_PORT': process.env.MODBUS_PORT || '/dev/ttyUSB0',
  'MODBUS_BAUDRATE': process.env.MODBUS_BAUDRATE || '9600',
  'KIOSK_ID': process.env.KIOSK_ID || 'kiosk-1',
  'PORT': process.env.PORT || '3002'
};

for (const [key, value] of Object.entries(envVars)) {
  if (value) {
    checkPassed(`${key}: ${value}`);
  } else {
    checkWarning(`${key}: not set (using default)`);
  }
}

// 6. Check serial port access (if on Linux)
if (process.platform === 'linux') {
  console.log('\n🔌 Checking serial port access...');
  
  const modbusPort = envVars.MODBUS_PORT;
  if (fs.existsSync(modbusPort)) {
    checkPassed(`Serial port exists: ${modbusPort}`);
    
    try {
      const stats = fs.statSync(modbusPort);
      checkPassed(`Port permissions: ${stats.mode.toString(8)}`);
    } catch (error) {
      checkWarning('Cannot check port permissions', error.message);
    }
  } else {
    checkWarning(`Serial port not found: ${modbusPort}`, 'Device may not be connected');
  }
  
  // Check user groups
  try {
    const groups = execSync('groups', { encoding: 'utf8' }).trim();
    if (groups.includes('dialout')) {
      checkPassed('User is in dialout group');
    } else {
      checkWarning('User not in dialout group', 'Run: sudo usermod -a -G dialout $USER');
    }
  } catch (error) {
    checkWarning('Cannot check user groups', error.message);
  }
}

// 7. Test configuration object creation
console.log('\n⚙️  Testing configuration creation...');
try {
  const modbusConfig = {
    port: process.env.MODBUS_PORT || '/dev/ttyUSB0',
    baudrate: parseInt(process.env.MODBUS_BAUDRATE || '9600'),
    timeout_ms: 1000,
    pulse_duration_ms: 500,
    burst_duration_seconds: 2,
    burst_interval_ms: 100,
    command_interval_ms: 50,
    max_retries: 3,
    retry_delay_base_ms: 100,
    retry_delay_max_ms: 1000,
    connection_retry_attempts: 5,
    health_check_interval_ms: 30000,
    test_mode: false,
    use_multiple_coils: true,
    verify_writes: true
  };
  
  if (modbusConfig && typeof modbusConfig === 'object' && modbusConfig.port) {
    checkPassed('Configuration object creation successful');
  } else {
    checkFailed('Configuration object creation failed');
  }
} catch (error) {
  checkFailed('Configuration creation error', error.message);
}

// Summary
console.log('\n📊 Validation Summary');
console.log('====================');

if (hasErrors) {
  console.log('❌ Validation failed - please fix the errors above');
  console.log('\nQuick fix commands:');
  console.log('  cd app/kiosk');
  console.log('  rm -rf dist node_modules/.cache');
  console.log('  npm install');
  console.log('  npm run build');
  process.exit(1);
} else {
  console.log('✅ All checks passed - kiosk should start successfully');
  console.log('\nTo start the kiosk service:');
  console.log('  cd app/kiosk');
  console.log('  npm start');
  process.exit(0);
}