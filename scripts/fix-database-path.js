#!/usr/bin/env node

/**
 * Fix Database Path Issue
 * Ensures the database is in the correct location for the kiosk service
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Fixing Database Path Issue');
console.log('=============================\n');

// Check current directory
console.log('📁 Current directory:', process.cwd());

// The kiosk expects the database at ./data/eform.db
const expectedDbPath = './data/eform.db';
const currentDbPath = './eform_locker.db';

console.log('\n🔍 Checking database locations...');
console.log(`Expected location: ${expectedDbPath}`);
console.log(`Current location: ${currentDbPath}`);

// Check if current database exists
if (fs.existsSync(currentDbPath)) {
  console.log('✅ Found database at current location');
  
  // Check if it has tables
  try {
    const tables = execSync(`sqlite3 "${currentDbPath}" ".tables"`, { encoding: 'utf8' });
    console.log(`   Tables: ${tables.trim()}`);
    
    const lockersExists = execSync(`sqlite3 "${currentDbPath}" "SELECT name FROM sqlite_master WHERE type='table' AND name='lockers';"`, { encoding: 'utf8' });
    console.log(`   Lockers table: ${lockersExists.trim() ? '✅' : '❌'}`);
  } catch (error) {
    console.log(`   Error checking tables: ${error.message}`);
  }
} else {
  console.log('❌ No database found at current location');
}

// Create data directory if it doesn't exist
const dataDir = './data';
if (!fs.existsSync(dataDir)) {
  console.log('\n📁 Creating data directory...');
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✅ Data directory created');
} else {
  console.log('\n📁 Data directory already exists');
}

// Check if expected database exists
if (fs.existsSync(expectedDbPath)) {
  console.log('✅ Database already exists at expected location');
  
  // Check if it has tables
  try {
    const tables = execSync(`sqlite3 "${expectedDbPath}" ".tables"`, { encoding: 'utf8' });
    console.log(`   Tables: ${tables.trim()}`);
    
    const lockersExists = execSync(`sqlite3 "${expectedDbPath}" "SELECT name FROM sqlite_master WHERE type='table' AND name='lockers';"`, { encoding: 'utf8' });
    if (lockersExists.trim()) {
      console.log('   ✅ Lockers table exists - database is ready!');
      console.log('\n🚀 You can now start the kiosk service:');
      console.log('   cd app/kiosk');
      console.log('   npm start');
      process.exit(0);
    } else {
      console.log('   ❌ Lockers table missing - need to recreate database');
    }
  } catch (error) {
    console.log(`   Error checking tables: ${error.message}`);
  }
}

// Copy or create database at expected location
if (fs.existsSync(currentDbPath)) {
  console.log('\n📋 Copying database to expected location...');
  try {
    fs.copyFileSync(currentDbPath, expectedDbPath);
    console.log('✅ Database copied successfully');
  } catch (error) {
    console.log(`❌ Failed to copy database: ${error.message}`);
    process.exit(1);
  }
} else {
  console.log('\n🔨 Creating new database at expected location...');
  
  // Run all migrations to create the database
  const migrations = [
    '001_initial_schema.sql',
    '002_provisioning_and_config.sql', 
    '003_complete_schema.sql',
    '004_staff_users.sql',
    '005_vip_transfer_audit.sql',
    '006_pin_rotation_system.sql',
    '007_soak_testing_tables.sql'
  ];

  let success = true;
  for (const migration of migrations) {
    const sqlPath = path.join('migrations', migration);
    if (!fs.existsSync(sqlPath)) {
      console.log(`❌ Migration file not found: ${migration}`);
      success = false;
      break;
    }
    
    try {
      console.log(`📄 Running ${migration}...`);
      execSync(`sqlite3 "${expectedDbPath}" < "${sqlPath}"`, { stdio: 'pipe' });
      console.log(`✅ ${migration} completed`);
    } catch (error) {
      console.log(`❌ Failed to run ${migration}: ${error.message}`);
      success = false;
      break;
    }
  }
  
  if (!success) {
    console.log('\n❌ Database creation failed!');
    process.exit(1);
  }
}

// Verify the final database
console.log('\n🔍 Verifying final database...');
try {
  const tables = execSync(`sqlite3 "${expectedDbPath}" ".tables"`, { encoding: 'utf8' });
  console.log(`✅ Tables created: ${tables.trim()}`);
  
  const lockersExists = execSync(`sqlite3 "${expectedDbPath}" "SELECT name FROM sqlite_master WHERE type='table' AND name='lockers';"`, { encoding: 'utf8' });
  if (lockersExists.trim()) {
    console.log('✅ Lockers table verified');
    
    // Get database file info
    const stats = fs.statSync(expectedDbPath);
    console.log(`📊 Database size: ${stats.size} bytes`);
    
    console.log('\n🎉 Database setup completed successfully!');
    console.log('\n🚀 You can now start the kiosk service:');
    console.log('   cd app/kiosk');
    console.log('   npm start');
  } else {
    console.log('❌ Lockers table still missing');
    process.exit(1);
  }
} catch (error) {
  console.log(`❌ Error verifying database: ${error.message}`);
  process.exit(1);
}