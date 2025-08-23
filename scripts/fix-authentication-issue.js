#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const readline = require('readline');

console.log('🔧 Authentication Issue Fix Tool');
console.log('=================================\n');

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

async function fixAuthenticationIssue() {
  try {
    console.log('This tool will help fix authentication issues by:');
    console.log('1. Checking existing users');
    console.log('2. Recreating password hashes');
    console.log('3. Testing authentication');
    console.log('');
    
    // Step 1: List existing users
    console.log('1. Checking existing users...');
    
    db.all("SELECT id, username, role FROM users", async (err, users) => {
      if (err) {
        console.error('❌ Error querying users:', err.message);
        process.exit(1);
      }
      
      if (users.length === 0) {
        console.log('❌ No users found. Create a user first.');
        process.exit(1);
      }
      
      console.log(`Found ${users.length} user(s):`);
      users.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.username} (${user.role})`);
      });
      
      // Step 2: Select user to fix
      const userChoice = await askQuestion('\nSelect user number to fix (or 0 to create new): ');
      const userIndex = parseInt(userChoice) - 1;
      
      if (userChoice === '0') {
        await createNewUser();
      } else if (userIndex >= 0 && userIndex < users.length) {
        await fixExistingUser(users[userIndex]);
      } else {
        console.log('❌ Invalid selection');
        process.exit(1);
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function createNewUser() {
  try {
    console.log('\n2. Creating new user...');
    
    const username = await askQuestion('Enter username: ');
    const password = await askQuestion('Enter password: ');
    const role = await askQuestion('Enter role (admin/user) [admin]: ') || 'admin';
    
    console.log('\n3. Creating password hash...');
    
    // Use explicit salt rounds and log the process
    const saltRounds = 10;
    console.log('   Salt rounds:', saltRounds);
    
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log('   Hash created successfully');
    console.log('   Hash length:', hashedPassword.length);
    console.log('   Hash preview:', hashedPassword.substring(0, 20) + '...');
    
    // Test the hash immediately
    console.log('\n4. Testing hash before saving...');
    const testResult = await bcrypt.compare(password, hashedPassword);
    console.log('   Hash test result:', testResult);
    
    if (!testResult) {
      console.log('❌ Hash test failed! Something is wrong with bcrypt.');
      process.exit(1);
    }
    
    console.log('\n5. Saving user to database...');
    
    db.run(
      'INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, role, new Date().toISOString()],
      function(err) {
        if (err) {
          console.error('❌ Error saving user:', err.message);
          process.exit(1);
        }
        
        console.log('✅ User created successfully!');
        console.log('   ID:', this.lastID);
        console.log('   Username:', username);
        console.log('   Role:', role);
        
        // Test authentication immediately
        testAuthentication(username, password);
      }
    );
    
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    process.exit(1);
  }
}

async function fixExistingUser(user) {
  try {
    console.log(`\n2. Fixing user: ${user.username}`);
    
    const newPassword = await askQuestion('Enter new password for this user: ');
    
    console.log('\n3. Creating new password hash...');
    
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Test the hash
    const testResult = await bcrypt.compare(newPassword, hashedPassword);
    if (!testResult) {
      console.log('❌ Hash test failed!');
      process.exit(1);
    }
    
    console.log('✅ Hash test passed');
    
    console.log('\n4. Updating user in database...');
    
    db.run(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [hashedPassword, new Date().toISOString(), user.id],
      function(err) {
        if (err) {
          console.error('❌ Error updating user:', err.message);
          process.exit(1);
        }
        
        console.log('✅ User password updated successfully!');
        
        // Test authentication
        testAuthentication(user.username, newPassword);
      }
    );
    
  } catch (error) {
    console.error('❌ Error fixing user:', error.message);
    process.exit(1);
  }
}

async function testAuthentication(username, password) {
  console.log('\n6. Testing authentication...');
  
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err) {
      console.error('❌ Database error:', err.message);
      process.exit(1);
    }
    
    if (!user) {
      console.log('❌ User not found after creation!');
      process.exit(1);
    }
    
    try {
      const isValid = await bcrypt.compare(password, user.password_hash);
      
      if (isValid) {
        console.log('✅ Authentication test PASSED!');
        console.log('\n🎉 User is ready for login!');
        console.log(`   Username: ${username}`);
        console.log(`   Password: ${password}`);
        console.log(`   Role: ${user.role}`);
        console.log('\nYou can now try logging in via the web interface.');
      } else {
        console.log('❌ Authentication test FAILED!');
        console.log('   This indicates a deeper issue with bcrypt or the system.');
      }
      
    } catch (authError) {
      console.error('❌ Authentication error:', authError.message);
    }
    
    db.close();
    rl.close();
  });
}

// Start the fix process
fixAuthenticationIssue();