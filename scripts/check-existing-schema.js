#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

console.log('🔍 Database Schema Analysis');
console.log('===========================\n');

const dbPath = path.join(__dirname, '..', 'data', 'eform.db');
const db = new sqlite3.Database(dbPath);

async function analyzeSchema() {
  try {
    console.log('1. Analyzing existing tables...');
    
    // Get all tables
    db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
      if (err) {
        console.error('❌ Error querying tables:', err.message);
        process.exit(1);
      }
      
      console.log(`Found ${tables.length} tables:`);
      tables.forEach(table => {
        console.log(`   - ${table.name}`);
      });
      
      // Check specific tables we need
      const requiredTables = ['users', 'lockers'];
      const existingTableNames = tables.map(t => t.name);
      
      console.log('\n2. Checking required tables...');
      
      requiredTables.forEach(tableName => {
        if (existingTableNames.includes(tableName)) {
          console.log(`✅ ${tableName} table exists`);
        } else {
          console.log(`❌ ${tableName} table missing`);
        }
      });
      
      // Analyze users table structure
      if (existingTableNames.includes('users')) {
        analyzeUsersTable();
      }
      
      // Analyze lockers table structure
      if (existingTableNames.includes('lockers')) {
        analyzeLockersTable();
      } else {
        console.log('\n❌ Lockers table missing - this needs to be created');
        db.close();
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

function analyzeUsersTable() {
  console.log('\n3. Analyzing users table structure...');
  
  db.all("PRAGMA table_info(users)", (err, columns) => {
    if (err) {
      console.error('❌ Error checking users table:', err.message);
      return;
    }
    
    console.log('Users table columns:');
    columns.forEach(col => {
      console.log(`   - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
    });
    
    // Check for required columns
    const requiredColumns = ['id', 'username', 'password_hash', 'role'];
    const existingColumns = columns.map(col => col.name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length === 0) {
      console.log('✅ Users table has all required columns');
      
      // Check if there are any users
      db.get("SELECT COUNT(*) as count FROM users", (err, result) => {
        if (err) {
          console.error('❌ Error counting users:', err.message);
        } else {
          console.log(`   Current user count: ${result.count}`);
          if (result.count === 0) {
            console.log('   ⚠️  No users exist - you need to create an admin user');
          }
        }
      });
    } else {
      console.log('❌ Missing required columns:', missingColumns.join(', '));
    }
  });
}

function analyzeLockersTable() {
  console.log('\n4. Analyzing lockers table structure...');
  
  db.all("PRAGMA table_info(lockers)", (err, columns) => {
    if (err) {
      console.error('❌ Error checking lockers table:', err.message);
      return;
    }
    
    console.log('Lockers table columns:');
    columns.forEach(col => {
      console.log(`   - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
    });
    
    // Check locker count
    db.get("SELECT COUNT(*) as count FROM lockers", (err, result) => {
      if (err) {
        console.error('❌ Error counting lockers:', err.message);
      } else {
        console.log(`   Current locker count: ${result.count}`);
      }
      
      console.log('\n5. Database analysis complete!');
      console.log('\nRecommendations:');
      
      // Check if users table is ready
      db.get("SELECT COUNT(*) as count FROM users", (err, userResult) => {
        if (err || userResult.count === 0) {
          console.log('1. Create admin user: node scripts/create-admin-directly.js');
        } else {
          console.log('1. ✅ Users exist - test authentication: node scripts/debug-authentication.js');
        }
        
        console.log('2. Build panel: cd app/panel && npm run build');
        console.log('3. Start panel: npm run start');
        console.log('4. Visit: http://192.168.1.8:3002/');
        
        db.close();
      });
    });
  });
}

// Start analysis
analyzeSchema();