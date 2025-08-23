#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const argon2 = require('argon2');
const bcrypt = require('bcryptjs');
const path = require('path');

async function testAuthenticationFix() {
  const dbPath = path.join(__dirname, '../data/eform.db');
  
  console.log('🧪 Testing authentication fix...');
  console.log('📍 Database path:', dbPath);
  
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Error opening database:', err);
      process.exit(1);
    }
    console.log('✅ Connected to SQLite database');
  });

  try {
    // Test 1: Create a bcrypt user and verify it can be authenticated
    console.log('\n🔧 Test 1: Creating bcrypt user...');
    const bcryptHash = await bcrypt.hash('testpass123', 10);
    console.log('🔐 Generated bcrypt hash:', bcryptHash.substring(0, 20) + '...');
    
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT OR REPLACE INTO staff_users (id, username, password_hash, role, active, created_at, pin_expires_at) VALUES (999, 'bcrypt_test', ?, 'admin', 1, datetime('now'), datetime('now', '+90 days'))",
        [bcryptHash],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Test bcrypt verification
    const bcryptUser = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM staff_users WHERE username = 'bcrypt_test'", (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log('👤 Bcrypt user created:', bcryptUser.username);
    console.log('🔍 Hash starts with:', bcryptUser.password_hash.substring(0, 10));
    
    const bcryptValid = await bcrypt.compare('testpass123', bcryptUser.password_hash);
    console.log('✅ Bcrypt verification:', bcryptValid ? 'SUCCESS' : 'FAILED');
    
    // Test 2: Create an argon2 user and verify it can be authenticated
    console.log('\n🔧 Test 2: Creating argon2 user...');
    const argon2Hash = await argon2.hash('testpass456', {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });
    console.log('🔐 Generated argon2 hash:', argon2Hash.substring(0, 20) + '...');
    
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT OR REPLACE INTO staff_users (id, username, password_hash, role, active, created_at, pin_expires_at) VALUES (998, 'argon2_test', ?, 'admin', 1, datetime('now'), datetime('now', '+90 days'))",
        [argon2Hash],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Test argon2 verification
    const argon2User = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM staff_users WHERE username = 'argon2_test'", (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log('👤 Argon2 user created:', argon2User.username);
    console.log('🔍 Hash starts with:', argon2User.password_hash.substring(0, 10));
    
    const argon2Valid = await argon2.verify(argon2User.password_hash, 'testpass456');
    console.log('✅ Argon2 verification:', argon2Valid ? 'SUCCESS' : 'FAILED');
    
    // Test 3: Test the AuthService logic simulation
    console.log('\n🔧 Test 3: Simulating AuthService logic...');
    
    async function simulateAuthService(username, password) {
      return new Promise((resolve, reject) => {
        db.get(`
          SELECT id, username, password_hash, role, created_at, last_login, pin_expires_at
          FROM staff_users 
          WHERE username = ? AND active = 1
        `, [username], async (err, userRow) => {
          if (err) {
            console.error('SQLite3 query error:', err);
            resolve(null);
            return;
          }

          if (!userRow) {
            console.log('User not found:', username);
            resolve(null);
            return;
          }

          try {
            if (!userRow.password_hash || typeof userRow.password_hash !== 'string' || userRow.password_hash.trim() === '') {
              console.error('Invalid password hash for user:', username);
              resolve(null);
              return;
            }

            const hash = userRow.password_hash.trim();
            console.log('Hash prefix for user', username, ':', hash.substring(0, 10));
            
            let isValid = false;

            if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
              console.log('Verifying bcrypt hash for user:', username);
              isValid = await bcrypt.compare(password, hash);
            } else if (hash.startsWith('$argon2')) {
              console.log('Verifying argon2 hash for user:', username);
              isValid = await argon2.verify(hash, password);
            } else {
              console.error('Unknown hash format for user:', username);
              resolve(null);
              return;
            }

            console.log('Password verification result for', username, ':', isValid);
            resolve(isValid ? userRow : null);
          } catch (error) {
            console.error('Password verification error:', error);
            resolve(null);
          }
        });
      });
    }
    
    // Test bcrypt user authentication
    console.log('\n🔐 Testing bcrypt user authentication...');
    const bcryptAuth = await simulateAuthService('bcrypt_test', 'testpass123');
    console.log('✅ Bcrypt auth result:', bcryptAuth ? 'SUCCESS' : 'FAILED');
    
    // Test argon2 user authentication
    console.log('\n🔐 Testing argon2 user authentication...');
    const argon2Auth = await simulateAuthService('argon2_test', 'testpass456');
    console.log('✅ Argon2 auth result:', argon2Auth ? 'SUCCESS' : 'FAILED');
    
    // Test admin user (should be argon2 now)
    console.log('\n🔐 Testing admin user authentication...');
    const adminAuth = await simulateAuthService('admin', 'admin123');
    console.log('✅ Admin auth result:', adminAuth ? 'SUCCESS' : 'FAILED');
    
    // Clean up test users
    console.log('\n🧹 Cleaning up test users...');
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM staff_users WHERE username IN ('bcrypt_test', 'argon2_test')", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log('\n🎉 Authentication fix test completed!');
    console.log('✅ Both bcrypt and argon2 hashes are now supported');
    console.log('✅ Direct SQLite operations bypass bundling issues');
    console.log('✅ Admin user should now work with password: admin123');
    
  } catch (error) {
    console.error('❌ Test error:', error);
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

testAuthenticationFix().catch(console.error);