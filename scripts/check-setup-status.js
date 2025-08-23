#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

function checkSetupStatus() {
  console.log('🔍 Checking setup status...');
  
  const dbPath = path.join(__dirname, '../data/eform.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ Database file does not exist');
    console.log('🚀 Setup is needed - fresh installation');
    return;
  }
  
  const db = new sqlite3.Database(dbPath);
  
  // Check if staff_users table exists
  db.get(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='staff_users'
  `, (err, row) => {
    if (err) {
      console.error('❌ Error checking table:', err);
      db.close();
      return;
    }
    
    if (!row) {
      console.log('❌ staff_users table does not exist');
      console.log('🚀 Setup is needed - no user table');
      db.close();
      return;
    }
    
    console.log('✅ staff_users table exists');
    
    // Check existing users
    db.all(`
      SELECT id, username, role, active, created_at 
      FROM staff_users 
      ORDER BY id
    `, (err, users) => {
      if (err) {
        console.error('❌ Error querying users:', err);
        db.close();
        return;
      }
      
      console.log(`📊 Found ${users.length} users in database:`);
      users.forEach(user => {
        console.log(`  - ID: ${user.id}, Username: ${user.username}, Role: ${user.role}, Active: ${user.active}`);
      });
      
      // Check active admin users
      db.get(`
        SELECT COUNT(*) as count FROM staff_users WHERE active = 1 AND role = 'admin'
      `, (err, result) => {
        if (err) {
          console.error('❌ Error counting admin users:', err);
        } else {
          console.log(`👑 Active admin users: ${result.count}`);
          
          if (result.count === 0) {
            console.log('🚀 Setup is needed - no active admin users found');
          } else {
            console.log('✅ Setup is complete - admin users exist');
          }
        }
        
        db.close();
      });
    });
  });
}

checkSetupStatus();