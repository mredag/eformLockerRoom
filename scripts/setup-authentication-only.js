#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const readline = require('readline');

console.log('🔐 Authentication Setup Tool');
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

async function setupAuthentication() {
  try {
    console.log('This tool will set up authentication for your existing database.');
    console.log('');
    
    // Step 1: Verify users table exists
    console.log('1. Checking users table...');
    
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", async (err, table) => {
      if (err) {
        console.error('❌ Database error:', err.message);
        process.exit(1);
      }
      
      if (!table) {
        console.log('❌ Users table does not exist!');
        console.log('   Run: node scripts/fix-database-setup.js first');
        process.exit(1);
      }
      
      console.log('✅ Users table exists');
      
      // Step 2: Check existing users
      console.log('\n2. Checking existing users...');
      
      db.all("SELECT id, username, role FROM users", async (err, users) => {
        if (err) {
          console.error('❌ Error querying users:', err.message);
          process.exit(1);
        }
        
        console.log(`Found ${users.length} existing user(s):`);
        users.forEach((user, index) => {
          console.log(`   ${index + 1}. ${user.username} (${user.role})`);
        });
        
        if (users.length === 0) {
          console.log('\n📝 No users found. Let\'s create an admin user.');
          await createNewUser();
        } else {
          console.log('\n🔧 Users exist. Choose an option:');
          console.log('   1. Create new admin user');
          console.log('   2. Reset password for existing user');
          console.log('   3. Test authentication with existing user');
          
          const choice = await askQuestion('\nEnter choice (1-3): ');
          
          switch (choice) {
            case '1':
              await createNewUser();
              break;
            case '2':
              await resetUserPassword(users);
              break;
            case '3':
              await testAuthentication(users);
              break;
            default:
              console.log('❌ Invalid choice');
              process.exit(1);
          }
        }
      });
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function createNewUser() {
  try {
    console.log('\n3. Creating new admin user...');
    
    const username = await askQuestion('Enter username: ');
    const password = await askQuestion('Enter password: ');
    
    // Check if username already exists
    db.get("SELECT id FROM users WHERE username = ?", [username], async (err, existingUser) => {
      if (err) {
        console.error('❌ Database error:', err.message);
        process.exit(1);
      }
      
      if (existingUser) {
        console.log('❌ Username already exists!');
        process.exit(1);
      }
      
      console.log('\n4. Creating password hash...');
      
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log('✅ Password hashed successfully');
      
      console.log('\n5. Saving user to database...');
      
      db.run(
        'INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
        [username, hashedPassword, 'admin', new Date().toISOString()],
        function(err) {
          if (err) {
            console.error('❌ Error creating user:', err.message);
            process.exit(1);
          }
          
          console.log('✅ Admin user created successfully!');
          console.log('   ID:', this.lastID);
          console.log('   Username:', username);
          console.log('   Role: admin');
          
          // Test authentication immediately
          testNewAuthentication(username, password);
        }
      );
    });
    
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    process.exit(1);
  }
}

async function resetUserPassword(users) {
  try {
    console.log('\n3. Resetting user password...');
    
    const userChoice = await askQuestion('Enter user number to reset: ');
    const userIndex = parseInt(userChoice) - 1;
    
    if (userIndex < 0 || userIndex >= users.length) {
      console.log('❌ Invalid user selection');
      process.exit(1);
    }
    
    const selectedUser = users[userIndex];
    const newPassword = await askQuestion(`Enter new password for ${selectedUser.username}: `);
    
    console.log('\n4. Creating new password hash...');
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    console.log('\n5. Updating password in database...');
    
    db.run(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [hashedPassword, new Date().toISOString(), selectedUser.id],
      function(err) {
        if (err) {
          console.error('❌ Error updating password:', err.message);
          process.exit(1);
        }
        
        console.log('✅ Password updated successfully!');
        
        // Test authentication
        testNewAuthentication(selectedUser.username, newPassword);
      }
    );
    
  } catch (error) {
    console.error('❌ Error resetting password:', error.message);
    process.exit(1);
  }
}

async function testAuthentication(users) {
  try {
    console.log('\n3. Testing authentication...');
    
    const userChoice = await askQuestion('Enter user number to test: ');
    const userIndex = parseInt(userChoice) - 1;
    
    if (userIndex < 0 || userIndex >= users.length) {
      console.log('❌ Invalid user selection');
      process.exit(1);
    }
    
    const selectedUser = users[userIndex];
    const password = await askQuestion(`Enter password for ${selectedUser.username}: `);
    
    testNewAuthentication(selectedUser.username, password);
    
  } catch (error) {
    console.error('❌ Error testing authentication:', error.message);
    process.exit(1);
  }
}

async function testNewAuthentication(username, password) {
  console.log('\n6. Testing authentication...');
  
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err) {
      console.error('❌ Database error:', err.message);
      process.exit(1);
    }
    
    if (!user) {
      console.log('❌ User not found!');
      process.exit(1);
    }
    
    try {
      const isValid = await bcrypt.compare(password, user.password_hash);
      
      if (isValid) {
        console.log('✅ Authentication test PASSED!');
        console.log('\n🎉 Authentication is working correctly!');
        console.log('\nCredentials for web login:');
        console.log(`   Username: ${username}`);
        console.log(`   Password: ${password}`);
        console.log(`   Role: ${user.role}`);
        console.log('\nNext steps:');
        console.log('1. Build panel: cd app/panel && npm run build');
        console.log('2. Start panel: npm run start');
        console.log('3. Visit: http://192.168.1.8:3002/');
        console.log('4. Log in with the credentials above');
      } else {
        console.log('❌ Authentication test FAILED!');
        console.log('   Password verification failed - there may be a deeper issue.');
      }
      
    } catch (authError) {
      console.error('❌ Authentication error:', authError.message);
    }
    
    db.close();
    rl.close();
  });
}

// Start setup
setupAuthentication();