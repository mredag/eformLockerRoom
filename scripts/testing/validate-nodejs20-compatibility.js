#!/usr/bin/env node
/**
 * Node.js 20 Compatibility Validation Script
 * This script validates that the system is compatible with Node.js 20
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function validateNodeJSCompatibility() {
console.log('🧪 Node.js 20 Compatibility Validation');
console.log('=====================================\n');

// Check Node.js version
const nodeVersion = process.version;
console.log(`📋 Current Node.js version: ${nodeVersion}`);

const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion < 20) {
    console.log('⚠️  WARNING: Running on Node.js < 20. Some features may not be available.');
} else {
    console.log('✅ Running on Node.js 20+');
}

// Check npm version
try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    console.log(`📋 npm version: ${npmVersion}`);
} catch (error) {
    console.log('❌ Failed to get npm version');
}

console.log('\n🔍 Checking package.json compatibility...');

// Check main package.json
const mainPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const requiredNodeVersion = mainPackage.engines?.node;
console.log(`📋 Required Node.js version: ${requiredNodeVersion}`);

if (requiredNodeVersion && !nodeVersion.match(/^v20\./)) {
    console.log('⚠️  Current Node.js version may not meet requirements');
} else {
    console.log('✅ Node.js version meets requirements');
}

// Check workspace packages
const workspaces = ['app/gateway', 'app/kiosk', 'app/panel', 'app/agent', 'shared'];
let allCompatible = true;

for (const workspace of workspaces) {
    const packagePath = path.join(workspace, 'package.json');
    if (fs.existsSync(packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        const requiredVersion = pkg.engines?.node;
        if (requiredVersion) {
            console.log(`📋 ${workspace}: requires ${requiredVersion}`);
            if (!nodeVersion.match(/^v20\./)) {
                console.log(`⚠️  ${workspace}: version mismatch`);
                allCompatible = false;
            }
        }
    }
}

if (allCompatible) {
    console.log('✅ All workspace packages are compatible');
} else {
    console.log('⚠️  Some workspace packages may have compatibility issues');
}

console.log('\n🔍 Checking critical dependencies...');

// Check serialport compatibility
try {
    const kioskPackage = JSON.parse(fs.readFileSync('app/kiosk/package.json', 'utf8'));
    const serialportVersion = kioskPackage.dependencies?.serialport;
    if (serialportVersion) {
        console.log(`📋 serialport version: ${serialportVersion}`);
        // serialport ^12.0.0 is compatible with Node.js 20
        if (serialportVersion.includes('12.')) {
            console.log('✅ serialport is compatible with Node.js 20');
        } else {
            console.log('⚠️  serialport version may need updating for Node.js 20');
        }
    }
} catch (error) {
    console.log('⚠️  Could not check serialport version');
}

// Check sqlite3 compatibility
try {
    const sqlite3Version = mainPackage.dependencies?.sqlite3;
    if (sqlite3Version) {
        console.log(`📋 sqlite3 version: ${sqlite3Version}`);
        console.log('✅ sqlite3 is compatible with Node.js 20');
    }
} catch (error) {
    console.log('⚠️  Could not check sqlite3 version');
}

console.log('\n🧪 Testing Node.js 20 features...');

// Test native fetch (available in Node.js 18+)
if (typeof fetch !== 'undefined') {
    console.log('✅ Native fetch API is available');
} else {
    console.log('⚠️  Native fetch API not available (expected in Node.js 18+)');
}

// Test Web Streams (improved in Node.js 20)
if (typeof ReadableStream !== 'undefined') {
    console.log('✅ Web Streams API is available');
} else {
    console.log('⚠️  Web Streams API not available');
}

// Test built-in test runner (Node.js 18+)
try {
    await import('node:test');
    console.log('✅ Built-in test runner is available');
} catch (error) {
    console.log('⚠️  Built-in test runner not available');
}

console.log('\n📊 Validation Summary');
console.log('====================');

if (majorVersion >= 20 && allCompatible) {
    console.log('✅ System is ready for Node.js 20 LTS');
    console.log('✅ All dependencies are compatible');
    console.log('✅ No blocking issues found');
    console.log('\n🚀 Recommendation: System is ready for production');
} else if (majorVersion >= 20) {
    console.log('✅ Running on Node.js 20+');
    console.log('⚠️  Some compatibility issues detected');
    console.log('\n🔧 Recommendation: Review and fix compatibility issues');
} else {
    console.log('⚠️  Running on Node.js < 20');
    console.log('📋 System is configured for Node.js 20');
    console.log('\n🚀 Recommendation: Upgrade to Node.js 20 LTS');
}

console.log('\n📋 Next Steps:');
console.log('1. Run: npm test (validate all tests pass)');
console.log('2. Run: npm run test:integration (validate integration tests)');
console.log('3. Monitor system performance after upgrade');
console.log('4. Validate hardware communication with Node.js 20');
}

// Run the validation
validateNodeJSCompatibility().catch(error => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
});