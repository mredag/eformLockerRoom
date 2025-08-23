#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

function resetUsers() {
  console.log('🔄 Resetting users table...');
  
  const dbPath = path.join(__dirname, '../data/eform.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ Database file does not exist');
    console.log('✅ Nothing to reset - fresh installation');
    return;
  }
  
  const db = new sqlite3.Database(dbPath);
  
  // Delete all users
  db.run(`DELETE FROM staff_users`, function(err) {
    if (err) {
      console.error('❌ Error deleting users:', err);
      db.close();
      return;
    }
    
    console.log(`🗑️  Deleted ${this.changes} users`);
    
    // Reset auto-increment
    db.run(`DELETE FROM sqlite_sequence WHERE name='staff_users'`, function(err) {
      if (err) {
        console.error('❌ Error resetting auto-increment:', err);
      } else {
        console.log('🔄 Reset auto-increment counter');
      }
      
      console.log('✅ Users table reset complete');
      console.log('🚀 You can now access /setup to create the first admin user');
      
      db.close();
    });
  });
}

resetUsers();