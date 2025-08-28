#!/usr/bin/env node

/**
 * Restore normal authentication after debugging
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Restoring Normal Authentication');
console.log('=================================\n');

const authMiddlewarePath = path.join(__dirname, '../app/panel/src/middleware/auth-middleware.ts');
const backupPath = authMiddlewarePath + '.backup';

try {
  if (!fs.existsSync(backupPath)) {
    console.log('❌ No backup found. Auth middleware may not have been bypassed.');
    process.exit(1);
  }
  
  // Restore original file
  fs.copyFileSync(backupPath, authMiddlewarePath);
  console.log('✅ Restored original auth-middleware.ts');
  
  // Remove backup
  fs.unlinkSync(backupPath);
  console.log('✅ Removed backup file');
  
  console.log('\n🔨 Rebuilding panel service...');
  const { execSync } = require('child_process');
  
  try {
    execSync('npm run build:panel', { stdio: 'inherit' });
    console.log('✅ Panel rebuilt with normal auth');
  } catch (error) {
    console.log('❌ Build failed:', error.message);
    throw error;
  }
  
  console.log('\n✅ Normal authentication restored!');
  console.log('\n🔄 Restart panel service:');
  console.log('pkill -f "node app/panel/dist/index.js"');
  console.log('npm run start:panel');
  
} catch (error) {
  console.error('❌ Failed to restore auth:', error.message);
  process.exit(1);
}