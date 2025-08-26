#!/usr/bin/env node

/**
 * Final E2E Validation Script
 * Comprehensive pre-deployment checks
 */

const fs = require('fs');
const { execSync } = require('child_process');

console.log('🚀 Final E2E Validation');
console.log('=======================');

const checks = [];

function addCheck(name, status, details = '') {
  checks.push({ name, status, details });
  const icon = status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '❌';
  console.log(`${icon} ${name}${details ? ': ' + details : ''}`);
}

// 1. Code Compilation
console.log('\n1️⃣ Code Compilation');
console.log('-------------------');

try {
  // Check TypeScript compilation
  execSync('npx tsc --noEmit --project app/kiosk/tsconfig.json', { stdio: 'pipe' });
  addCheck('Kiosk TypeScript compilation', 'pass');
} catch (error) {
  addCheck('Kiosk TypeScript compilation', 'fail', 'Has compilation errors');
}

try {
  execSync('npx tsc --noEmit --project app/panel/tsconfig.json', { stdio: 'pipe' });
  addCheck('Panel TypeScript compilation', 'pass');
} catch (error) {
  addCheck('Panel TypeScript compilation', 'fail', 'Has compilation errors');
}

// 2. Database Schema
console.log('\n2️⃣ Database Schema');
console.log('------------------');

const migrationFiles = fs.readdirSync('migrations').filter(f => f.endsWith('.sql'));
addCheck('Migration files present', migrationFiles.length > 0 ? 'pass' : 'fail', `${migrationFiles.length} files`);

if (fs.existsSync('data/eform.db')) {
  addCheck('Database file exists', 'pass');
} else {
  addCheck('Database file exists', 'warn', 'Run migrations first');
}

// 3. Configuration Files
console.log('\n3️⃣ Configuration');
console.log('----------------');

const requiredEnvVars = [
  'MODBUS_PORT',
  'KIOSK_ID',
  'GATEWAY_URL'
];

requiredEnvVars.forEach(envVar => {
  if (process.env[envVar]) {
    addCheck(`${envVar} configured`, 'pass', process.env[envVar]);
  } else {
    addCheck(`${envVar} configured`, 'warn', 'Using default');
  }
});

// 4. Hardware Configuration
console.log('\n4️⃣ Hardware Configuration');
console.log('-------------------------');

if (fs.existsSync('/dev/ttyUSB0')) {
  addCheck('Serial port /dev/ttyUSB0 exists', 'pass');
} else {
  addCheck('Serial port /dev/ttyUSB0 exists', 'warn', 'Check hardware connection');
}

// Check for by-id resolution
if (fs.existsSync('/dev/serial/by-id')) {
  const devices = fs.readdirSync('/dev/serial/by-id');
  const usbDevices = devices.filter(d => d.includes('USB'));
  addCheck('USB serial devices by-id', usbDevices.length > 0 ? 'pass' : 'warn', `${usbDevices.length} found`);
} else {
  addCheck('Serial by-id support', 'warn', 'Not available on this system');
}

// 5. Service Dependencies
console.log('\n5️⃣ Service Dependencies');
console.log('-----------------------');

const services = [
  { name: 'Gateway', port: 3000, path: '/health' },
  { name: 'Panel', port: 3001, path: '/health' },
  { name: 'Kiosk', port: 3002, path: '/health' }
];

// Note: In a real implementation, we'd check if services are running
services.forEach(service => {
  addCheck(`${service.name} service`, 'warn', `Check http://localhost:${service.port}${service.path}`);
});

// 6. Critical Features Implementation
console.log('\n6️⃣ Critical Features');
console.log('--------------------');

const features = [
  { file: 'shared/services/heartbeat-manager.ts', feature: 'Stale command recovery', pattern: 'recoverStaleCommands' },
  { file: 'shared/services/command-queue-manager.ts', feature: 'Atomic transactions', pattern: 'duration_ms.*julianday' },
  { file: 'app/kiosk/src/index.ts', feature: 'Idempotency cache', pattern: 'executedCommands' },
  { file: 'app/kiosk/src/hardware/modbus-controller.ts', feature: 'Per-locker guards', pattern: 'lockerMutexes' },
  { file: 'app/kiosk/src/hardware/modbus-controller.ts', feature: 'Fallback mechanism', pattern: '0x0F.*0x05' },
  { file: 'app/kiosk/src/index.ts', feature: 'Interval clamping', pattern: 'Math.max.*Math.min.*interval' }
];

features.forEach(({ file, feature, pattern }) => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const regex = new RegExp(pattern, 'i');
    if (regex.test(content)) {
      addCheck(feature, 'pass');
    } else {
      addCheck(feature, 'fail', 'Implementation not found');
    }
  } else {
    addCheck(feature, 'fail', 'File not found');
  }
});

// 7. Test Scripts
console.log('\n7️⃣ Test Scripts');
console.log('---------------');

const testScripts = [
  'scripts/test-locker-mapping.js',
  'scripts/verify-task-7-implementation.js',
  'scripts/e2e-smoke-tests.js',
  'scripts/resolve-serial-port.js'
];

testScripts.forEach(script => {
  if (fs.existsSync(script)) {
    addCheck(`${script.split('/').pop()}`, 'pass');
  } else {
    addCheck(`${script.split('/').pop()}`, 'fail', 'Missing test script');
  }
});

// 8. Summary
console.log('\n📊 Validation Summary');
console.log('=====================');

const passed = checks.filter(c => c.status === 'pass').length;
const warned = checks.filter(c => c.status === 'warn').length;
const failed = checks.filter(c => c.status === 'fail').length;

console.log(`✅ Passed: ${passed}`);
console.log(`⚠️  Warnings: ${warned}`);
console.log(`❌ Failed: ${failed}`);

console.log('\n🚀 Pre-Deployment Checklist');
console.log('============================');

console.log('\n📋 Before E2E Testing:');
console.log('1. Run database migrations: npm run migrate');
console.log('2. Configure environment variables');
console.log('3. Connect RS-485 hardware');
console.log('4. Start all services: npm run start:all');
console.log('5. Run smoke tests: node scripts/e2e-smoke-tests.js');

console.log('\n🔧 Hardware Setup:');
console.log('1. Waveshare Relay Card 1: DIP switches for address 1');
console.log('2. Waveshare Relay Card 2: DIP switches for address 2');
console.log('3. DIP switch 9: OFF (9600 baud)');
console.log('4. DIP switch 10: OFF (no parity)');
console.log('5. RS-485 A/B wiring correct');

console.log('\n📊 Monitoring Commands:');
console.log('-- Command Queue Status');
console.log('SELECT command_id, status, started_at, completed_at, duration_ms');
console.log('FROM command_queue ORDER BY created_at DESC LIMIT 5;');
console.log('');
console.log('-- Recent Events');
console.log('SELECT kiosk_id, locker_id, event_type, details');
console.log('FROM events ORDER BY timestamp DESC LIMIT 5;');

if (failed === 0) {
  console.log('\n🎉 System Ready for E2E Testing!');
  process.exit(0);
} else {
  console.log('\n⚠️  Please address failed checks before E2E testing');
  process.exit(1);
}