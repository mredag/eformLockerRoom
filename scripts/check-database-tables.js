#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkDatabaseTables() {
  console.log('🔍 Checking Database Tables');
  console.log('===========================');
  
  const dbPath = path.join(process.cwd(), 'data', 'eform.db');
  console.log('📂 Database path:', dbPath);
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err);
        reject(err);
        return;
      }
      console.log('✅ Connected to database');
    });
    
    // List all tables
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
      if (err) {
        console.error('❌ Error querying tables:', err);
        db.close();
        reject(err);
        return;
      }
      
      console.log('\n📋 Tables in database:');
      if (rows.length === 0) {
        console.log('   (No tables found)');
      } else {
        rows.forEach((row, index) => {
          console.log(`   ${index + 1}. ${row.name}`);
        });
      }
      
      // Check if staff_users table exists (from migration 004)
      const hasStaffUsers = rows.some(row => row.name === 'staff_users');
      if (hasStaffUsers) {
        console.log('\n👥 Checking staff_users table:');
        db.all('SELECT * FROM staff_users', [], (err, users) => {
          if (err) {
            console.error('❌ Error querying staff_users:', err);
          } else {
            console.log(`   Found ${users.length} users:`);
            users.forEach(user => {
              console.log(`   - ID: ${user.id}, Username: ${user.username}, Role: ${user.role}`);
              console.log(`     Created: ${user.created_at}, PIN Expires: ${user.pin_expires_at}`);
            });
          }
          
          db.close((err) => {
            if (err) {
              console.error('❌ Error closing database:', err);
            } else {
              console.log('\n✅ Database connection closed');
            }
            resolve();
          });
        });
      } else {
        db.close((err) => {
          if (err) {
            console.error('❌ Error closing database:', err);
          } else {
            console.log('\n✅ Database connection closed');
          }
          resolve();
        });
      }
    });
  });
}

checkDatabaseTables()
  .then(() => {
    console.log('\n🎉 Database check completed!');
  })
  .catch((error) => {
    console.error('❌ Failed to check database:', error);
  });