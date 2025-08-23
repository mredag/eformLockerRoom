#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const readline = require('readline');

console.log('🔍 Authentication Debug Tool');
console.log('============================\n');

const dbPath = path.join(__dirname, '..', 'data', 'eform.db');
const db = new sqlite3.Database(dbPath);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function debugAuthentication() {
  try {
    // Step 1: List all users
    console.log('1. Listing all users in database:');
    
    db.all("SELECT id, username, role, created_at, LENGTH(password_hash) as hash_length FROM users", (err, users) => {
      if (err) {
        console.error('❌ Error querying users:', err.message);
        process.exit(1);
      }
      
      console.log(`Found ${users.length} user(s):`);
      users.forEach(user => {
        console.log(`   - ID: ${user.id}, Username: ${user.username}, Role: ${user.role}`);
        console.log(`     Created: ${user.created_at}, Hash Length: ${user.hash_length}`);
      });
      
      if (users.length === 0) {
        console.log('\n❌ No users found. Create a user first with:');
        console.log('   node scripts/create-admin-directly.js');
        process.exit(1);
      }
      
      // Step 2: Test authentication
      testAuthentication();
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function testAuthentication() {
  try {
    console.log('\n2. Testing authentication:');
    
    const username = await askQuestion('Enter username to test: ');
    const password = await askQuestion('Enter password to test: ');
    
    console.log('\n3. Retrieving user from database...');
    
    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
      if (err) {
        console.error('❌ Database error:', err.message);
        process.exit(1);
      }
      
      if (!user) {
        console.log('❌ User not found:', username);
        process.exit(1);
      }
      
      console.log('✅ User found:');
      console.log('   ID:', user.id);
      console.log('   Username:', user.username);
      console.log('   Role:', user.role);
      console.log('   Created:', user.created_at);
      console.log('   Hash Length:', user.password_hash.length);
      console.log('   Hash Preview:', user.password_hash.substring(0, 20) + '...');
      
      console.log('\n4. Testing password verification...');
      console.log('   Input password:', password);
      console.log('   Input password length:', password.length);
      console.log('   Input password bytes:', Buffer.from(password).toString('hex'));
      
      try {
        // Test bcrypt comparison
        const isValid = await bcrypt.compare(password, user.password_hash);
        console.log('   bcrypt.compare result:', isValid);
        
        if (isValid) {
          console.log('\n✅ Authentication SUCCESS!');
        } else {
          console.log('\n❌ Authentication FAILED!');
          
          // Additional debugging
          console.log('\n5. Additional debugging:');
          
          // Test if hash is valid bcrypt format
          const hashPattern = /^\$2[aby]?\$\d+\$/;
          const isValidHash = hashPattern.test(user.password_hash);
          console.log('   Hash format valid:', isValidHash);
          
          // Test creating a new hash with same password
          console.log('   Creating new hash with same password...');
          const newHash = await bcrypt.hash(password, 10);
          console.log('   New hash:', newHash.substring(0, 20) + '...');
          
          const newHashWorks = await bcrypt.compare(password, newHash);
          console.log('   New hash verification:', newHashWorks);
          
          // Test if stored hash works with different input
          console.log('\n   Possible issues:');
          console.log('   - Password might have been created with different input');
          console.log('   - Hash might be corrupted in database');
          console.log('   - Character encoding issues');
          console.log('   - bcrypt version compatibility issues');
        }
        
      } catch (bcryptError) {
        console.error('❌ bcrypt error:', bcryptError.message);
      }
      
      db.close();
      rl.close();
    });
    
  } catch (error) {
    console.error('❌ Error during authentication test:', error.message);
    process.exit(1);
  }
}

// Start debugging
debugAuthentication();