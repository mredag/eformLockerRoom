#!/usr/bin/env node

/**
 * Fix for bcrypt bundling issue on Raspberry Pi
 * This script migrates from bcrypt to bcryptjs for bundle compatibility
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Fixing bcrypt bundling issue for Raspberry Pi...');

try {
  // 1. Remove bcrypt and install bcryptjs
  console.log('📦 Installing bcryptjs (pure JavaScript, bundle-safe)...');
  
  try {
    execSync('npm uninstall bcrypt', { stdio: 'inherit' });
  } catch (error) {
    console.log('ℹ️  bcrypt was not installed or already removed');
  }
  
  execSync('npm install bcryptjs@^2.4.3', { stdio: 'inherit' });
  
  console.log('✅ bcryptjs installed successfully');
  
  // 2. Rebuild the panel service
  console.log('🔨 Rebuilding panel service...');
  execSync('npm run build:panel', { stdio: 'inherit' });
  
  console.log('✅ Panel service rebuilt with bcryptjs');
  
  // 3. Test the authentication
  console.log('🧪 Testing authentication...');
  execSync('node scripts/test-panel-login.js', { stdio: 'inherit' });
  
  console.log('\n🎉 Bcrypt bundling issue fixed!');
  console.log('✅ Panel service now uses bcryptjs (pure JavaScript)');
  console.log('✅ No more native module bundling issues');
  console.log('✅ Authentication works on ARM64 Raspberry Pi');
  
  console.log('\n🚀 You can now start the panel service:');
  console.log('   npm run start:panel');
  console.log('\n🔐 Login credentials:');
  console.log('   Username: admin');
  console.log('   Password: admin123');
  
} catch (error) {
  console.error('❌ Error fixing bcrypt issue:', error.message);
  console.log('\n🔧 Manual fix steps:');
  console.log('1. npm uninstall bcrypt');
  console.log('2. npm install bcryptjs@^2.4.3');
  console.log('3. npm run build:panel');
  console.log('4. npm run start:panel');
  process.exit(1);
}