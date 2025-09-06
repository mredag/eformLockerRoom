#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

async function runMigration() {
  console.log('🔧 Running overdue and suspected handling migration...');

  // Create test database
  const dbPath = './data/test-overdue.db';
  
  // Ensure data directory exists
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new sqlite3.Database(dbPath);

  try {
    // First create base schema
    console.log('📋 Creating base schema...');
    const baseSchemaSql = `
      CREATE TABLE IF NOT EXISTS lockers (
        id INTEGER PRIMARY KEY,
        kiosk_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Free',
        owner_type TEXT,
        owner_key TEXT,
        owned_at DATETIME,
        is_vip INTEGER NOT NULL DEFAULT 0,
        quarantine_until DATETIME,
        overdue_from DATETIME,
        overdue_reason TEXT,
        suspected_occupied INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    await new Promise((resolve, reject) => {
      db.run(baseSchemaSql, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('✅ Base schema created');
          resolve();
        }
      });
    });

    // Read migration file
    const migrationPath = './migrations/025_overdue_suspected_system_fixed.sql';
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // Split by semicolon and execute each statement
    const statements = migrationSql.split(';').filter(stmt => stmt.trim());

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (stmt) {
        await new Promise((resolve, reject) => {
          db.run(stmt, (err) => {
            if (err) {
              console.error(`❌ Error executing statement ${i + 1}:`, err.message);
              console.error('Statement:', stmt);
              reject(err);
            } else {
              console.log(`✅ Executed statement ${i + 1}`);
              resolve();
            }
          });
        });
      }
    }

    console.log('🎉 Migration completed successfully!');

    // Test the tables were created
    await new Promise((resolve, reject) => {
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='user_reports'", (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          console.log('✅ user_reports table created');
          resolve();
        } else {
          reject(new Error('user_reports table not found'));
        }
      });
    });

    await new Promise((resolve, reject) => {
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='locker_operations'", (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          console.log('✅ locker_operations table created');
          resolve();
        } else {
          reject(new Error('locker_operations table not found'));
        }
      });
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('📝 Database closed');
      }
    });
  }
}

runMigration().catch(console.error);