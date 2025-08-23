#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🗄️  Database Initialization Tool');
console.log('=================================\n');

const dbPath = path.join(__dirname, '..', 'data', 'eform.db');
const dataDir = path.join(__dirname, '..', 'data');
const migrationsDir = path.join(__dirname, '..', 'migrations');

async function initializeDatabase() {
  try {
    console.log('1. Setting up database environment...');
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      console.log('📁 Creating data directory...');
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    console.log('   Database path:', dbPath);
    
    // Open database connection
    const db = new sqlite3.Database(dbPath);
    
    console.log('\n2. Creating core tables...');
    
    // Create users table (essential for authentication)
    const createUsersTable = `
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
    
    await runSQL(db, createUsersTable, 'Users table');
    
    // Create lockers table
    const createLockersTable = `
      CREATE TABLE IF NOT EXISTS lockers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          locker_number INTEGER UNIQUE NOT NULL,
          status TEXT NOT NULL DEFAULT 'available',
          assigned_user_id INTEGER,
          assigned_at TEXT,
          expires_at TEXT,
          is_vip BOOLEAN DEFAULT 0,
          relay_address INTEGER NOT NULL,
          relay_channel INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (assigned_user_id) REFERENCES users(id)
      );
    `;
    
    await runSQL(db, createLockersTable, 'Lockers table');
    
    // Create events table for logging
    const createEventsTable = `
      CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          user_id INTEGER,
          locker_id INTEGER,
          details TEXT,
          timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (locker_id) REFERENCES lockers(id)
      );
    `;
    
    await runSQL(db, createEventsTable, 'Events table');
    
    // Create sessions table
    const createSessionsTable = `
      CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT NOT NULL,
          is_active BOOLEAN DEFAULT 1,
          FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `;
    
    await runSQL(db, createSessionsTable, 'Sessions table');
    
    console.log('\n3. Creating indexes...');
    
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);",
      "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);",
      "CREATE INDEX IF NOT EXISTS idx_lockers_number ON lockers(locker_number);",
      "CREATE INDEX IF NOT EXISTS idx_lockers_status ON lockers(status);",
      "CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);",
      "CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);",
      "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);"
    ];
    
    for (let i = 0; i < indexes.length; i++) {
      await runSQL(db, indexes[i], `Index ${i + 1}`);
    }
    
    console.log('\n4. Initializing default data...');
    
    // Check if lockers exist, if not create default ones
    const lockerCount = await getCount(db, 'lockers');
    console.log(`   Current locker count: ${lockerCount}`);
    
    if (lockerCount === 0) {
      console.log('   Creating default lockers...');
      
      // Create 32 default lockers (2 relay cards with 16 channels each)
      for (let i = 1; i <= 32; i++) {
        const relayAddress = i <= 16 ? 1 : 2;
        const relayChannel = i <= 16 ? i : i - 16;
        const isVip = i <= 4; // First 4 lockers are VIP
        
        const insertLocker = `
          INSERT INTO lockers (locker_number, relay_address, relay_channel, is_vip, created_at)
          VALUES (?, ?, ?, ?, ?)
        `;
        
        await runSQL(db, insertLocker, `Locker ${i}`, [i, relayAddress, relayChannel, isVip ? 1 : 0, new Date().toISOString()]);
      }
      
      console.log('✅ Created 32 default lockers');
    }
    
    console.log('\n5. Database summary...');
    
    // Show table counts
    const tables = ['users', 'lockers', 'events', 'sessions'];
    for (const table of tables) {
      const count = await getCount(db, table);
      console.log(`   ${table}: ${count} records`);
    }
    
    console.log('\n✅ Database initialization complete!');
    console.log('\nNext steps:');
    console.log('1. Create admin user: node scripts/create-admin-directly.js');
    console.log('2. Test authentication: node scripts/debug-authentication.js');
    console.log('3. Start panel service: cd app/panel && npm run build && npm run start');
    
    db.close();
    
  } catch (error) {
    console.error('❌ Error during initialization:', error.message);
    process.exit(1);
  }
}

function runSQL(db, sql, description, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        console.error(`❌ Error creating ${description}:`, err.message);
        reject(err);
      } else {
        console.log(`✅ ${description} created/updated`);
        resolve(this);
      }
    });
  });
}

function getCount(db, tableName) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result.count);
      }
    });
  });
}

// Start initialization
initializeDatabase();