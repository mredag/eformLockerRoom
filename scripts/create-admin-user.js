#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const argon2 = require('argon2');
const path = require('path');

async function createAdminUser() {
  const dbPath = path.join(__dirname, '../data/eform.db');
  
  console.log('Connecting to database:', dbPath);
  
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      process.exit(1);
    }
    console.log('Connected to SQLite database');
  });

  try {
    // Check if staff_users table exists
    const tableExists = await new Promise((resolve, reject) => {
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='staff_users'", (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });

    if (!tableExists) {
      console.log('staff_users table does not exist. Creating it...');
      
      const createTableSQL = `
        CREATE TABLE staff_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'staff',
          active INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME,
          pin_expires_at DATETIME,
          CHECK (role IN ('admin', 'staff')),
          CHECK (active IN (0, 1))
        )
      `;
      
      await new Promise((resolve, reject) => {
        db.run(createTableSQL, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      console.log('staff_users table created');
    }

    // Check if admin user exists
    const adminExists = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM staff_users WHERE username = 'admin'", (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (adminExists) {
      console.log('Admin user already exists:', adminExists);
      console.log('Updating password to admin123...');
      
      // Hash the password
      const passwordHash = await argon2.hash('admin123');
      
      // Update the existing admin user
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
      
      console.log('Admin password updated successfully!');
    } else {
      console.log('Creating new admin user...');
      
      // Hash the password
      const passwordHash = await argon2.hash('admin123');
      
      // Create new admin user
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO staff_users (username, password_hash, role, pin_expires_at) VALUES (?, ?, 'admin', datetime('now', '+1 day'))",
          ['admin', passwordHash],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      console.log('Admin user created successfully!');
    }

    // Verify the user was created/updated
    const verifyUser = await new Promise((resolve, reject) => {
      db.get("SELECT username, role, active, created_at FROM staff_users WHERE username = 'admin'", (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    console.log('Verification - Admin user details:', verifyUser);
    console.log('\n✅ You can now login with:');
    console.log('Username: admin');
    console.log('Password: admin123');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
    });
  }
}

createAdminUser().catch(console.error);