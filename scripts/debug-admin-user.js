#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const argon2 = require('argon2');
const path = require('path');

async function debugAdminUser() {
  const dbPath = path.join(__dirname, '../data/eform.db');
  
  console.log('🔍 Debugging admin user in database:', dbPath);
  
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Error opening database:', err);
      process.exit(1);
    }
    console.log('✅ Connected to SQLite database');
  });

  try {
    // Check if staff_users table exists
    const tableExists = await new Promise((resolve, reject) => {
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='staff_users'", (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });

    console.log('📋 staff_users table exists:', tableExists);

    if (!tableExists) {
      console.log('❌ staff_users table does not exist!');
      return;
    }

    // Get all users
    const allUsers = await new Promise((resolve, reject) => {
      db.all("SELECT id, username, password_hash, role, active, created_at FROM staff_users", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log('\n👥 All users in database:');
    allUsers.forEach(user => {
      console.log(`  - ID: ${user.id}, Username: ${user.username}, Role: ${user.role}, Active: ${user.active}`);
      console.log(`    Password hash: ${user.password_hash ? user.password_hash.substring(0, 50) + '...' : 'NULL/EMPTY'}`);
      console.log(`    Hash length: ${user.password_hash ? user.password_hash.length : 0}`);
      console.log('');
    });

    // Find admin user specifically
    const adminUser = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM staff_users WHERE username = 'admin'", (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!adminUser) {
      console.log('❌ Admin user not found!');
      console.log('🔧 Creating admin user...');
      
      const passwordHash = await argon2.hash('admin123');
      console.log('🔐 Generated password hash:', passwordHash.substring(0, 50) + '...');
      
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO staff_users (username, password_hash, role, active, pin_expires_at) VALUES (?, ?, 'admin', 1, datetime('now', '+1 day'))",
          ['admin', passwordHash],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      console.log('✅ Admin user created!');
    } else {
      console.log('👤 Admin user found:', {
        id: adminUser.id,
        username: adminUser.username,
        role: adminUser.role,
        active: adminUser.active,
        password_hash_length: adminUser.password_hash ? adminUser.password_hash.length : 0,
        password_hash_preview: adminUser.password_hash ? adminUser.password_hash.substring(0, 50) + '...' : 'NULL/EMPTY'
      });

      // Check if password hash is valid
      if (!adminUser.password_hash || adminUser.password_hash.trim() === '') {
        console.log('❌ Password hash is empty or null!');
        console.log('🔧 Fixing password hash...');
        
        const passwordHash = await argon2.hash('admin123');
        console.log('🔐 Generated new password hash:', passwordHash.substring(0, 50) + '...');
        
        await new Promise((resolve, reject) => {
          db.run(
            "UPDATE staff_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = 'admin'",
            [passwordHash],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        
        console.log('✅ Password hash updated!');
      } else {
        console.log('🔧 Password hash exists, testing verification...');
        
        try {
          const isValid = await argon2.verify(adminUser.password_hash, 'admin123');
          console.log('🔐 Password verification result:', isValid);
          
          if (!isValid) {
            console.log('❌ Current hash does not verify correctly!');
            console.log('🔧 Regenerating password hash...');
            
            const passwordHash = await argon2.hash('admin123');
            console.log('🔐 Generated new password hash:', passwordHash.substring(0, 50) + '...');
            
            await new Promise((resolve, reject) => {
              db.run(
                "UPDATE staff_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = 'admin'",
                [passwordHash],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            
            console.log('✅ Password hash regenerated and updated!');
          } else {
            console.log('✅ Password hash is valid!');
          }
        } catch (error) {
          console.log('❌ Error verifying password:', error.message);
          console.log('🔧 Regenerating password hash...');
          
          const passwordHash = await argon2.hash('admin123');
          
          await new Promise((resolve, reject) => {
            db.run(
              "UPDATE staff_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = 'admin'",
              [passwordHash],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          
          console.log('✅ Password hash regenerated!');
        }
      }
    }

    console.log('\n🎉 Final verification:');
    const finalUser = await new Promise((resolve, reject) => {
      db.get("SELECT username, role, active FROM staff_users WHERE username = 'admin'", (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    console.log('👤 Final admin user:', finalUser);
    console.log('\n✅ You should now be able to login with:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err);
      } else {
        console.log('🔒 Database connection closed');
      }
    });
  }
}

debugAdminUser().catch(console.error);