#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🔍 Simple Database Validation...\n');

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
    
    // Test 3: Try basic database operations
    console.log('\n3. Testing basic database operations...');
    
    // Test SELECT operation
    db.get("SELECT COUNT(*) as count FROM users", (err, result) => {
        if (err) {
            console.log('❌ Error counting users:', err.message);
            process.exit(1);
        }
        
        console.log('✅ Database SELECT operation works');
        console.log('   Current user count:', result.count);
        
        // Test 4: Check for admin users
        console.log('\n4. Checking for existing admin users...');
        
        db.all("SELECT username, role, created_at FROM users WHERE role = 'admin'", (err, admins) => {
            if (err) {
                console.log('❌ Error checking admin users:', err.message);
                process.exit(1);
            }
            
            console.log(`✅ Found ${admins.length} admin user(s):`);
            admins.forEach(admin => {
                console.log(`   - ${admin.username} (created: ${admin.created_at})`);
            });
            
            // Test 5: Test INSERT operation (with cleanup)
            console.log('\n5. Testing database INSERT operation...');
            
            const testUsername = 'test_validation_' + Date.now();
            const insertSql = `INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)`;
            
            db.run(insertSql, [testUsername, 'test_hash', 'user', new Date().toISOString()], function(err) {
                if (err) {
                    console.log('❌ Error inserting test user:', err.message);
                    process.exit(1);
                }
                
                console.log('✅ Database INSERT operation works (ID:', this.lastID, ')');
                
                // Clean up test user
                db.run("DELETE FROM users WHERE username = ?", [testUsername], (err) => {
                    if (err) {
                        console.log('⚠️  Warning: Could not clean up test user:', err.message);
                    } else {
                        console.log('✅ Test user cleaned up');
                    }
                    
                    console.log('\n🎉 All basic database tests passed!');
                    
                    if (admins.length === 0) {
                        console.log('\n⚠️  No admin users found. You should create one using:');
                        console.log('   node scripts/create-admin-directly.js');
                    } else {
                        console.log('\n✅ Database is ready for use!');
                    }
                    
                    console.log('\nNext steps:');
                    console.log('1. Build and start services: cd app/panel && npm run build && npm run start');
                    console.log('2. Visit http://192.168.1.8:3002/ to test the web interface');
                    
                    db.close();
                });
            });
        });
    });
});