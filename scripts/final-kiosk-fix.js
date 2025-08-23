#!/usr/bin/env node

/**
 * Final Kiosk Fix - Comprehensive solution for database issues
 * This script addresses all possible causes of the "no such table: lockers" error
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Final Kiosk Fix - Comprehensive Solution');
console.log('==========================================\n');

// Step 1: Check current working directory
console.log('📁 Current directory:', process.cwd());

// Step 2: Ensure we're in the project root
if (!fs.existsSync('package.json') || !fs.existsSync('app/kiosk')) {
  console.error('❌ Error: Not in the project root directory');
  console.error('Please run this script from the eform-locker project root');
  process.exit(1);
}

// Step 3: Check and rebuild kiosk
console.log('\n🔨 Rebuilding kiosk service...');
try {
  process.chdir('app/kiosk');
  console.log('📁 Changed to kiosk directory');
  
  // Clean old build
  if (fs.existsSync('dist')) {
    execSync('rm -rf dist', { stdio: 'inherit' });
    console.log('🧹 Cleaned old build');
  }
  
  // Rebuild
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Kiosk rebuilt successfully');
  
  // Go back to project root
  process.chdir('..');
  process.chdir('..');
  console.log('📁 Back to project root');
} catch (error) {
  console.error('❌ Failed to rebuild kiosk:', error.message);
  process.exit(1);
}

// Step 4: Ensure database exists at correct location
console.log('\n🗄️  Checking database setup...');
const dbPath = './data/eform.db';
const dataDir = './data';

// Create data directory if needed
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('📁 Created data directory');
}

// Check if database exists and has tables
let needsDatabase = true;
if (fs.existsSync(dbPath)) {
  try {
    const tables = execSync(`sqlite3 "${dbPath}" ".tables"`, { encoding: 'utf8' });
    const lockersExists = execSync(`sqlite3 "${dbPath}" "SELECT name FROM sqlite_master WHERE type='table' AND name='lockers';"`, { encoding: 'utf8' });
    
    if (lockersExists.trim()) {
      console.log('✅ Database exists with lockers table');
      needsDatabase = false;
    } else {
      console.log('⚠️  Database exists but missing lockers table');
    }
  } catch (error) {
    console.log('⚠️  Database exists but has issues');
  }
}

// Create/recreate database if needed
if (needsDatabase) {
  console.log('🔨 Creating database with all tables...');
  
  // Remove existing database if corrupted
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  
  // Run all migrations
  const migrations = [
    '001_initial_schema.sql',
    '002_provisioning_and_config.sql', 
    '003_complete_schema.sql',
    '004_staff_users.sql',
    '005_vip_transfer_audit.sql',
    '006_pin_rotation_system.sql',
    '007_soak_testing_tables.sql'
  ];

  for (const migration of migrations) {
    const sqlPath = path.join('migrations', migration);
    if (!fs.existsSync(sqlPath)) {
      console.error(`❌ Migration file not found: ${migration}`);
      process.exit(1);
    }
    
    try {
      console.log(`📄 Running ${migration}...`);
      execSync(`sqlite3 "${dbPath}" < "${sqlPath}"`, { stdio: 'pipe' });
    } catch (error) {
      console.error(`❌ Failed to run ${migration}: ${error.message}`);
      process.exit(1);
    }
  }
  
  console.log('✅ Database created successfully');
}

// Step 5: Verify database
console.log('\n🔍 Verifying database...');
try {
  const tables = execSync(`sqlite3 "${dbPath}" ".tables"`, { encoding: 'utf8' });
  console.log('📊 Tables:', tables.trim());
  
  const lockersCount = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='lockers';"`, { encoding: 'utf8' });
  if (parseInt(lockersCount.trim()) === 1) {
    console.log('✅ Lockers table verified');
  } else {
    console.error('❌ Lockers table missing');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Database verification failed:', error.message);
  process.exit(1);
}

// Step 6: Set environment variable for database path
console.log('\n🌍 Setting database environment...');
process.env.EFORM_DB_PATH = path.resolve(dbPath);
console.log(`📍 Database path: ${process.env.EFORM_DB_PATH}`);

// Step 7: Test database connection
console.log('\n🧪 Testing database connection...');
try {
  const testQuery = `sqlite3 "${dbPath}" "SELECT COUNT(*) FROM lockers;"`;
  const result = execSync(testQuery, { encoding: 'utf8' });
  console.log(`✅ Database connection test passed (lockers count: ${result.trim()})`);
} catch (error) {
  console.error('❌ Database connection test failed:', error.message);
  process.exit(1);
}

// Step 8: Create startup script with proper environment
console.log('\n📝 Creating startup script...');
const startupScript = `#!/bin/bash

# Eform Kiosk Startup Script
# This script ensures the kiosk starts with the correct environment

echo "🚀 Starting Eform Kiosk Service"
echo "==============================="

# Set working directory to project root
cd "$(dirname "$0")/.."

# Set database path
export EFORM_DB_PATH="$(pwd)/data/eform.db"

# Verify database exists
if [ ! -f "$EFORM_DB_PATH" ]; then
    echo "❌ Database not found at: $EFORM_DB_PATH"
    exit 1
fi

echo "📍 Database path: $EFORM_DB_PATH"
echo "📁 Working directory: $(pwd)"

# Start kiosk service
cd app/kiosk
echo "🔄 Starting kiosk service..."
npm start
`;

fs.writeFileSync('scripts/start-kiosk.sh', startupScript);
execSync('chmod +x scripts/start-kiosk.sh');
console.log('✅ Startup script created: scripts/start-kiosk.sh');

// Step 9: Final verification
console.log('\n🎯 Final System Check');
console.log('====================');
console.log('✅ Project structure verified');
console.log('✅ Kiosk service rebuilt');
console.log('✅ Database created and verified');
console.log('✅ Environment configured');
console.log('✅ Startup script ready');

console.log('\n🚀 Ready to Start Kiosk Service!');
console.log('================================');
console.log('Option 1 - Use the startup script (recommended):');
console.log('  ./scripts/start-kiosk.sh');
console.log('');
console.log('Option 2 - Manual start:');
console.log('  export EFORM_DB_PATH="$(pwd)/data/eform.db"');
console.log('  cd app/kiosk');
console.log('  npm start');
console.log('');
console.log('The kiosk service should now start without database errors!');