#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

console.log('🔍 Validating Complete Fix...\n');

// Test 1: Database Connection
console.log('1. Testing database connection...');
const dbPath = path.join(__dirname, '..', 'data', 'eform.db');

if (!fs.existsSync(dbPath)) {
    console.log('❌ Database file not found at:', dbPath);
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);

// Test 2: Check if users table exists and has correct structure
console.log('2. Checking users table structure...');
db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
    if (err) {
        console.log('❌ Error checking users table:', err.message);
        process.exit(1);
    }
    
    if (!row) {
        console.log('❌ Users table does not exist');
        process.exit(1);
    }
    
    console.log('✅ Users table exists');
    console.log('   Structure:', row.sql);
    
    // Test 3: Try to create a test user using direct SQLite3
    console.log('\n3. Testing user creation with direct SQLite3...');
    
    const testUsername = 'test_user_' + Date.now();
    const testPassword = 'test123';
    
    bcrypt.hash(testPassword, 10, (err, hashedPassword) => {
        if (err) {
            console.log('❌ Error hashing password:', err.message);
            process.exit(1);
        }
        
        const insertSql = `INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)`;
        
        db.run(insertSql, [testUsername, hashedPassword, 'admin', new Date().toISOString()], function(err) {
            if (err) {
                console.log('❌ Error creating test user:', err.message);
                process.exit(1);
            }
            
            console.log('✅ Test user created successfully with ID:', this.lastID);
            
            // Test 4: Verify user can be retrieved
            console.log('\n4. Testing user retrieval...');
            
            db.get("SELECT * FROM users WHERE username = ?", [testUsername], (err, user) => {
                if (err) {
                    console.log('❌ Error retrieving user:', err.message);
                    process.exit(1);
                }
                
                if (!user) {
                    console.log('❌ User not found after creation');
                    process.exit(1);
                }
                
                console.log('✅ User retrieved successfully');
                console.log('   User data:', {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    created_at: user.created_at
                });
                
                // Test 5: Test password verification
                console.log('\n5. Testing password verification...');
                
                bcrypt.compare(testPassword, user.password_hash, (err, isValid) => {
                    if (err) {
                        console.log('❌ Error verifying password:', err.message);
                        process.exit(1);
                    }
                    
                    if (!isValid) {
                        console.log('❌ Password verification failed');
                        process.exit(1);
                    }
                    
                    console.log('✅ Password verification successful');
                    
                    // Clean up test user
                    db.run("DELETE FROM users WHERE username = ?", [testUsername], (err) => {
                        if (err) {
                            console.log('⚠️  Warning: Could not clean up test user:', err.message);
                        } else {
                            console.log('✅ Test user cleaned up');
                        }
                        
                        // Test 6: Check for existing admin users
                        console.log('\n6. Checking for existing admin users...');
                        
                        db.all("SELECT username, role, created_at FROM users WHERE role = 'admin'", (err, admins) => {
                            if (err) {
                                console.log('❌ Error checking admin users:', err.message);
                                process.exit(1);
                            }
                            
                            console.log(`✅ Found ${admins.length} admin user(s):`);
                            admins.forEach(admin => {
                                console.log(`   - ${admin.username} (created: ${admin.created_at})`);
                            });
                            
                            if (admins.length === 0) {
                                console.log('\n⚠️  No admin users found. You should create one using:');
                                console.log('   node scripts/create-admin-directly.js');
                            }
                            
                            console.log('\n🎉 All tests passed! The fix is working correctly.');
                            console.log('\nNext steps:');
                            console.log('1. If no admin users exist, run: node scripts/create-admin-directly.js');
                            console.log('2. Build and start the panel: cd app/panel && npm run build && npm run start');
                            console.log('3. Visit http://192.168.1.8:3002/ to test the web interface');
                            
                            db.close();
                        });
                    });
                });
            });
        });
    });
});