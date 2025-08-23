#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

function debugDatabase() {
  console.log('🔍 Debugging database structure...');
  
  const dbPath = path.join(__dirname, '../data/eform.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ Database file does not exist at:', dbPath);
    return;
  }
  
  console.log('✅ Database file exists at:', dbPath);
  
  const db = new sqlite3.Database(dbPath);
  
  // Check all tables
  db.all(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    ORDER BY name
  `, (err, tables) => {
    if (err) {
      console.error('❌ Error listing tables:', err);
      db.close();
      return;
    }
    
    console.log('📋 Tables in database:');
    tables.forEach(table => {
      console.log(`  - ${table.name}`);
    });
    
    // Check staff_users table structure
    db.all(`PRAGMA table_info(staff_users)`, (err, columns) => {
      if (err) {
        console.error('❌ Error getting table info:', err);
      } else if (columns.length === 0) {
        console.log('❌ staff_users table does not exist');
      } else {
        console.log('📊 staff_users table structure:');
        columns.forEach(col => {
          console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
        });
      }
      
      // Try to insert a test user
      console.log('🧪 Testing user insertion...');
      
      const testUsername = 'test_' + Date.now();
      const testPassword = '$argon2id$v=19$m=65536,t=3,p=1$test$test';
      
      db.run(`
        INSERT INTO staff_users (username, password_hash, role, created_at, pin_expires_at, active)
        VALUES (?, ?, 'admin', datetime('now'), datetime('now', '+90 days'), 1)
      `, [testUsername, testPassword], function(err) {
        if (err) {
          console.error('❌ Test insert failed:', err);
        } else {
          console.log('✅ Test insert successful, ID:', this.lastID);
          
          // Clean up test user
          db.run(`DELETE FROM staff_users WHERE id = ?`, [this.lastID], (err) => {
            if (err) {
              console.error('❌ Failed to clean up test user:', err);
            } else {
              console.log('🧹 Test user cleaned up');
            }
            
            db.close();
          });
        }
      });
    });
  });
}

debugDatabase();