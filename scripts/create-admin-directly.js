#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const argon2 = require('argon2');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function createAdminDirectly() {
  try {
    console.log('🔐 Creating admin user directly in database...');
    
    const dbPath = path.join(__dirname, '../data/eform.db');
    
    if (!fs.existsSync(dbPath)) {
      console.log('❌ Database file does not exist');
      rl.close();
      return;
    }
    
    const username = await question('Enter admin username: ');
    const password = await question('Enter admin password: ');
    
    if (!username || !password) {
      console.log('❌ Username and password are required');
      rl.close();
      return;
    }
    
    console.log('🔒 Hashing password...');
    const hashedPassword = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });
    
    console.log('💾 Inserting into database...');
    
    const db = new sqlite3.Database(dbPath);
    
    db.run(`
      INSERT INTO staff_users (username, password_hash, role, created_at, pin_expires_at, active)
      VALUES (?, ?, 'admin', datetime('now'), datetime('now', '+90 days'), 1)
    `, [username, hashedPassword], function(err) {
      if (err) {
        console.error('❌ Failed to create admin user:', err);
      } else {
        console.log('✅ Admin user created successfully!');
        console.log('  - ID:', this.lastID);
        console.log('  - Username:', username);
        console.log('  - Role: admin');
        console.log('');
        console.log('🚀 You can now login at http://192.168.1.8:3002/');
      }
      
      db.close();
      rl.close();
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    rl.close();
  }
}

createAdminDirectly();