#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🔧 Database Setup Fix Tool');
console.log('===========================\n');

const dbPath = path.join(__dirname, '..', 'data', 'eform.db');
const dataDir = path.join(__dirname, '..', 'data');

async function fixDatabaseSetup() {
  try {
    console.log('1. Checking database directory and file...');
    
    // Check if data directory exists
    if (!fs.existsSync(dataDir)) {
      console.log('📁 Creating data directory...');
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('✅ Data directory created');
    } else {
      console.log('✅ Data directory exists');
    }
    
    // Check if database file exists
    console.log('   Database path:', dbPath);
    if (fs.existsSync(dbPath)) {
      console.log('✅ Database file exists');
      
      // Check file size
      const stats = fs.statSync(dbPath);
      console.log('   Database size:', stats.size, 'bytes');
      
      if (stats.size === 0) {
        console.log('⚠️  Database file is empty');
      }
    } else {
      console.log('❌ Database file does not exist');
    }
    
    console.log('\n2. Opening database connection...');
    const db = new sqlite3.Database(dbPath);
    
    console.log('\n3. Checking existing tables...');
    
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
      if (err) {
        console.error('❌ Error querying tables:', err.message);
        process.exit(1);
      }
      
      console.log(`Found ${tables.length} table(s):`);
      tables.forEach(table => {
        console.log(`   - ${table.name}`);
      });
      
      // Check if users table exists
      const hasUsersTable = tables.some(table => table.name === 'users');
      
      if (!hasUsersTable) {
        console.log('\n❌ Users table missing! Creating it now...');
        createUsersTable(db);
      } else {
        console.log('\n✅ Users table exists');
        checkUsersTableStructure(db);
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

function createUsersTable(db) {
  console.log('\n4. Creating users table...');
  
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_login TEXT,
        is_active BOOLEAN DEFAULT 1
    );
  `;
  
  db.run(createTableSQL, (err) => {
    if (err) {
      console.error('❌ Error creating users table:', err.message);
      process.exit(1);
    }
    
    console.log('✅ Users table created successfully');
    
    // Create indexes
    console.log('\n5. Creating indexes...');
    
    const createIndexes = [
      "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);",
      "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);"
    ];
    
    let indexCount = 0;
    createIndexes.forEach((indexSQL, i) => {
      db.run(indexSQL, (err) => {
        if (err) {
          console.error('❌ Error creating index:', err.message);
        } else {
          console.log(`✅ Index ${i + 1} created`);
        }
        
        indexCount++;
        if (indexCount === createIndexes.length) {
          console.log('\n6. Database setup complete!');
          console.log('\nNext steps:');
          console.log('1. Create admin user: node scripts/create-admin-directly.js');
          console.log('2. Test authentication: node scripts/debug-authentication.js');
          
          db.close();
        }
      });
    });
  });
}

function checkUsersTableStructure(db) {
  console.log('\n4. Checking users table structure...');
  
  db.all("PRAGMA table_info(users)", (err, columns) => {
    if (err) {
      console.error('❌ Error checking table structure:', err.message);
      process.exit(1);
    }
    
    console.log('Users table columns:');
    columns.forEach(col => {
      console.log(`   - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
    });
    
    // Check if all required columns exist
    const requiredColumns = ['id', 'username', 'password_hash', 'role', 'created_at'];
    const existingColumns = columns.map(col => col.name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length > 0) {
      console.log('\n❌ Missing required columns:', missingColumns.join(', '));
      console.log('   The table structure is incomplete.');
      
      // Offer to recreate the table
      console.log('\n🔧 Recreating users table with correct structure...');
      
      db.run("DROP TABLE IF EXISTS users", (err) => {
        if (err) {
          console.error('❌ Error dropping table:', err.message);
          process.exit(1);
        }
        
        console.log('✅ Old table dropped');
        createUsersTable(db);
      });
    } else {
      console.log('\n✅ Table structure is correct');
      
      // Check for existing users
      db.get("SELECT COUNT(*) as count FROM users", (err, result) => {
        if (err) {
          console.error('❌ Error counting users:', err.message);
          process.exit(1);
        }
        
        console.log(`\n📊 Current user count: ${result.count}`);
        
        if (result.count === 0) {
          console.log('\n⚠️  No users found. Create an admin user:');
          console.log('   node scripts/create-admin-directly.js');
        } else {
          console.log('\n✅ Users exist. Test authentication:');
          console.log('   node scripts/debug-authentication.js');
        }
        
        db.close();
      });
    }
  });
}

// Start the fix process
fixDatabaseSetup();