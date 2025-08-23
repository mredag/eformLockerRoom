#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const argon2 = require('argon2');

async function testUserCreation() {
  console.log('🧪 Testing user creation directly...');
  
  const dbPath = path.join(__dirname, '../data/eform.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ Database file does not exist');
    return;
  }
  
  const db = new sqlite3.Database(dbPath);
  
  try {
    // Hash a test password
    const testPassword = await argon2.hash('testpass123', {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });
    
    console.log('✅ Password hashed successfully');
    
    const testUsername = 'testuser_' + Date.now();
    
    // Test insert
    db.run(`
      INSERT INTO staff_users (username, password_hash, role, created_at, pin_expires_at, active)
      VALUES (?, ?, 'admin', datetime('now'), datetime('now', '+90 days'), 1)
    `, [testUsername, testPassword], function(err) {
      if (err) {
        console.error('❌ Insert failed:', err);
      } else {
        console.log('✅ Insert successful!');
        console.log('  - lastID:', this.lastID);
        console.log('  - changes:', this.changes);
        
        // Verify the user was created
        db.get(`
          SELECT id, username, role, active 
          FROM staff_users 
          WHERE id = ?
        `, [this.lastID], (err, row) => {
          if (err) {
            console.error('❌ Verification failed:', err);
          } else if (row) {
            console.log('✅ User verified:', row);
            
            // Clean up
            db.run(`DELETE FROM staff_users WHERE id = ?`, [this.lastID], (err) => {
              if (err) {
                console.error('❌ Cleanup failed:', err);
              } else {
                console.log('🧹 Test user cleaned up');
              }
              db.close();
            });
          } else {
            console.log('❌ User not found after insert');
            db.close();
          }
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    db.close();
  }
}

testUserCreation();