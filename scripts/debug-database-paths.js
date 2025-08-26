#!/usr/bin/env node

const path = require('path');

console.log('🔍 Database Path Debug');
console.log('=====================');

console.log('Current working directory:', process.cwd());
console.log('EFORM_DB_PATH env var:', process.env.EFORM_DB_PATH || 'not set');

const defaultPath = './data/eform.db';
const resolvedPath = path.resolve(defaultPath);

console.log('Default relative path:', defaultPath);
console.log('Resolved absolute path:', resolvedPath);

// Test both database files
const fs = require('fs');

console.log('\n📁 File existence check:');
console.log('eform.db exists:', fs.existsSync('./data/eform.db'));
console.log('eform_locker.db exists:', fs.existsSync('./data/eform_locker.db'));

// Check if they're the same file
try {
  const stat1 = fs.statSync('./data/eform.db');
  const stat2 = fs.statSync('./data/eform_locker.db');
  console.log('Same file:', stat1.ino === stat2.ino);
} catch (e) {
  console.log('Cannot compare files:', e.message);
}

console.log('\n🔍 Testing database connection from different paths:');

const sqlite3 = require('sqlite3').verbose();

// Test from current directory
const db1 = new sqlite3.Database('./data/eform.db', (err) => {
  if (err) {
    console.log('❌ Error connecting to ./data/eform.db:', err.message);
  } else {
    console.log('✅ Connected to ./data/eform.db');
    db1.get('SELECT COUNT(*) as count FROM command_queue WHERE status = "pending"', (err, row) => {
      if (err) {
        console.log('❌ Error querying:', err.message);
      } else {
        console.log('📊 Pending commands in ./data/eform.db:', row.count);
      }
      db1.close();
    });
  }
});

// Test absolute path
const db2 = new sqlite3.Database(resolvedPath, (err) => {
  if (err) {
    console.log('❌ Error connecting to', resolvedPath, ':', err.message);
  } else {
    console.log('✅ Connected to', resolvedPath);
    db2.get('SELECT COUNT(*) as count FROM command_queue WHERE status = "pending"', (err, row) => {
      if (err) {
        console.log('❌ Error querying:', err.message);
      } else {
        console.log('📊 Pending commands in', resolvedPath, ':', row.count);
      }
      db2.close();
    });
  }
});