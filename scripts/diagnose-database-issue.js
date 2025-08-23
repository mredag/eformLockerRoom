#!/usr/bin/env node

/**
 * Database Issue Diagnostic Script
 * Checks database file locations and table existence
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Database Issue Diagnostic');
console.log('===========================\n');

// Check current directory
console.log('📁 Current directory:', process.cwd());

// Check for database files in various locations
const possibleDbFiles = [
  'eform_locker.db',
  './eform_locker.db',
  'app/kiosk/eform_locker.db',
  'shared/eform_locker.db',
  '/tmp/eform_locker.db'
];

console.log('\n🗄️  Checking for database files:');
possibleDbFiles.forEach(dbPath => {
  const exists = fs.existsSync(dbPath);
  console.log(`  ${exists ? '✅' : '❌'} ${dbPath}`);
  
  if (exists) {
    try {
      // Check if it has tables
      const tables = execSync(`sqlite3 "${dbPath}" ".tables"`, { encoding: 'utf8' });
      console.log(`     Tables: ${tables.trim() || 'none'}`);
      
      // Check specifically for lockers table
      const lockersExists = execSync(`sqlite3 "${dbPath}" "SELECT name FROM sqlite_master WHERE type='table' AND name='lockers';"`, { encoding: 'utf8' });
      console.log(`     Lockers table: ${lockersExists.trim() ? '✅' : '❌'}`);
      
      // Get file info
      const stats = fs.statSync(dbPath);
      console.log(`     Size: ${stats.size} bytes`);
      console.log(`     Modified: ${stats.mtime.toISOString()}`);
    } catch (error) {
      console.log(`     Error checking: ${error.message}`);
    }
  }
});

// Check database connection configuration
console.log('\n⚙️  Checking database configuration...');

// Check if there's a database connection file
const connectionFiles = [
  'shared/database/connection.ts',
  'shared/database/connection.js'
];

connectionFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`📄 Found connection file: ${file}`);
    try {
      const content = fs.readFileSync(file, 'utf8');
      
      // Look for database path configuration
      const dbPathMatch = content.match(/database.*?['"`]([^'"`]+)['"`]/i);
      if (dbPathMatch) {
        console.log(`   Database path in config: ${dbPathMatch[1]}`);
      }
      
      // Look for any hardcoded paths
      const pathMatches = content.match(/['"`]([^'"`]*\.db)['"`]/g);
      if (pathMatches) {
        console.log(`   Found .db references: ${pathMatches.join(', ')}`);
      }
    } catch (error) {
      console.log(`   Error reading file: ${error.message}`);
    }
  }
});

// Check environment variables
console.log('\n🌍 Environment variables:');
const dbEnvVars = ['DATABASE_URL', 'DB_PATH', 'SQLITE_DB', 'DATABASE_PATH'];
dbEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  console.log(`  ${envVar}: ${value || 'not set'}`);
});

// Check working directory when kiosk starts
console.log('\n📂 Checking kiosk working directory...');
try {
  const kioskIndexPath = 'app/kiosk/dist/index.js';
  if (fs.existsSync(kioskIndexPath)) {
    console.log('✅ Kiosk build exists');
    
    // Check if there are any database path references in the built file
    const content = fs.readFileSync(kioskIndexPath, 'utf8');
    const dbMatches = content.match(/['"`]([^'"`]*\.db)['"`]/g);
    if (dbMatches) {
      console.log(`   Database references in build: ${dbMatches.slice(0, 3).join(', ')}${dbMatches.length > 3 ? '...' : ''}`);
    }
  } else {
    console.log('❌ Kiosk build not found');
  }
} catch (error) {
  console.log(`Error checking kiosk build: ${error.message}`);
}

console.log('\n💡 Recommendations:');
console.log('1. Check if the kiosk service is running from the correct directory');
console.log('2. Verify the database file path in the connection configuration');
console.log('3. Ensure the database file has proper permissions');
console.log('4. Try running the kiosk from the project root directory');

console.log('\n🔧 Quick fixes to try:');
console.log('1. Copy database to kiosk directory:');
console.log('   cp eform_locker.db app/kiosk/');
console.log('2. Run kiosk from project root:');
console.log('   node app/kiosk/dist/index.js');
console.log('3. Set absolute database path in environment');