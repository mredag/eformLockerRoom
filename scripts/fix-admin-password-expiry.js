#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function fixAdminPasswordExpiry() {
  console.log('🔧 Fixing Admin Password Expiry');
  console.log('================================');
  
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
    
    // Check current admin user
    db.get('SELECT * FROM staff_users WHERE username = ?', ['admin'], (err, row) => {
      if (err) {
        console.error('❌ Error querying user:', err);
        db.close();
        reject(err);
        return;
      }
      
      if (!row) {
        console.log('❌ Admin user not found');
        db.close();
        reject(new Error('Admin user not found'));
        return;
      }
      
      console.log('👤 Current admin user:');
      console.log('   ID:', row.id);
      console.log('   Username:', row.username);
      console.log('   Role:', row.role);
      console.log('   Created:', row.created_at);
      console.log('   Last Login:', row.last_login);
      console.log('   PIN Expires:', row.pin_expires_at);
      
      // Update password expiry to future date
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1); // 1 year from now
      
      console.log('\n🔄 Updating password expiry to:', futureDate.toISOString());
      
      db.run(
        'UPDATE staff_users SET pin_expires_at = ? WHERE username = ?',
        [futureDate.toISOString(), 'admin'],
        function(err) {
          if (err) {
            console.error('❌ Error updating password expiry:', err);
            db.close();
            reject(err);
            return;
          }
          
          console.log('✅ Password expiry updated successfully');
          console.log('📝 Rows affected:', this.changes);
          
          // Verify the update
          db.get('SELECT pin_expires_at FROM staff_users WHERE username = ?', ['admin'], (err, row) => {
            if (err) {
              console.error('❌ Error verifying update:', err);
            } else {
              console.log('✅ Verified new expiry date:', row.pin_expires_at);
            }
            
            db.close((err) => {
              if (err) {
                console.error('❌ Error closing database:', err);
              } else {
                console.log('✅ Database connection closed');
              }
              resolve();
            });
          });
        }
      );
    });
  });
}

fixAdminPasswordExpiry()
  .then(() => {
    console.log('\n🎉 Admin password expiry fixed!');
    console.log('You can now login with:');
    console.log('Username: admin');
    console.log('Password: admin123');
  })
  .catch((error) => {
    console.error('❌ Failed to fix password expiry:', error);
  });