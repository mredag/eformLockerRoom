#!/usr/bin/env node

/**
 * Quick Database Fix for Raspberry Pi
 * Creates the database tables if they don't exist
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🗄️  Quick Database Fix for Eform Locker');
console.log('======================================');

// Check if we're in the right directory
if (!fs.existsSync('package.json')) {
  console.error('❌ Error: Not in the project root directory');
  console.error('Please run this script from the eform-locker project root');
  process.exit(1);
}

// Check if migrations directory exists
if (!fs.existsSync('migrations')) {
  console.error('❌ Error: migrations directory not found');
  process.exit(1);
}

console.log('📋 Checking database status...');

// Check if database file exists
const dbFile = 'eform_locker.db';
const dbExists = fs.existsSync(dbFile);

console.log(`Database file exists: ${dbExists ? '✅' : '❌'}`);

// Function to run SQL file
function runSqlFile(filename) {
  const sqlPath = path.join('migrations', filename);
  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ Migration file not found: ${filename}`);
    return false;
  }
  
  try {
    console.log(`📄 Running ${filename}...`);
    execSync(`sqlite3 ${dbFile} < "${sqlPath}"`, { stdio: 'pipe' });
    console.log(`✅ ${filename} completed`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to run ${filename}:`, error.message);
    return false;
  }
}

// Function to check if table exists
function tableExists(tableName) {
  try {
    const result = execSync(`sqlite3 ${dbFile} "SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}';"`, { encoding: 'utf8' });
    return result.trim() === tableName;
  } catch (error) {
    return false;
  }
}

console.log('\n🔍 Checking if lockers table exists...');
if (tableExists('lockers')) {
  console.log('✅ Lockers table already exists');
  console.log('\n🚀 Database is ready! You can start the kiosk service:');
  console.log('  cd app/kiosk');
  console.log('  npm start');
  process.exit(0);
}

console.log('❌ Lockers table does not exist');
console.log('\n🔧 Creating database tables...');

// List of migration files in order
const migrations = [
  '001_initial_schema.sql',
  '002_provisioning_and_config.sql', 
  '003_complete_schema.sql',
  '004_staff_users.sql',
  '005_vip_transfer_audit.sql',
  '006_pin_rotation_system.sql',
  '007_soak_testing_tables.sql'
];

// Run each migration
let success = true;
for (const migration of migrations) {
  if (!runSqlFile(migration)) {
    success = false;
    break;
  }
}

if (success) {
  console.log('\n✅ All migrations completed successfully!');
  
  // Verify the lockers table was created
  if (tableExists('lockers')) {
    console.log('✅ Lockers table verified');
    
    // Show all tables
    try {
      const tables = execSync(`sqlite3 ${dbFile} ".tables"`, { encoding: 'utf8' });
      console.log('\n📊 Created tables:');
      console.log(tables);
    } catch (error) {
      console.log('⚠️  Could not list tables, but migration completed');
    }
    
    console.log('\n🚀 Database is ready! You can now start the kiosk service:');
    console.log('  cd app/kiosk');
    console.log('  npm start');
  } else {
    console.error('\n❌ Lockers table still not found after migration');
    process.exit(1);
  }
} else {
  console.error('\n❌ Migration failed!');
  console.error('\nTry running migrations manually:');
  migrations.forEach(migration => {
    console.error(`  sqlite3 ${dbFile} < migrations/${migration}`);
  });
  process.exit(1);
}