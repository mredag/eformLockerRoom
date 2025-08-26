#!/usr/bin/env node

const path = require('path');

console.log('🔧 Database Path Fix Verification');
console.log('=================================');

// Get the absolute database path
const projectRoot = process.cwd();
const dbPath = path.join(projectRoot, 'data', 'eform.db');

console.log('Project root:', projectRoot);
console.log('Database path:', dbPath);
console.log('EFORM_DB_PATH env var:', process.env.EFORM_DB_PATH || 'not set');

// Set the environment variable
process.env.EFORM_DB_PATH = dbPath;
console.log('✅ Set EFORM_DB_PATH to:', process.env.EFORM_DB_PATH);

// Test database connection with the new path
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database(process.env.EFORM_DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error connecting to database:', err.message);
    process.exit(1);
  }
  
  console.log('✅ Successfully connected to database');
  
  // Test command count
  db.get('SELECT COUNT(*) as count FROM command_queue WHERE status = "pending"', (err, row) => {
    if (err) {
      console.error('❌ Error querying database:', err.message);
    } else {
      console.log('📊 Pending commands found:', row.count);
    }
    
    db.close();
    console.log('');
    console.log('💡 Now restart services with: npm run start');
    console.log('   The services will use the absolute database path');
  });
});