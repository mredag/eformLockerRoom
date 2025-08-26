#!/usr/bin/env node

/**
 * Fix Duplicate Migrations
 * This script removes duplicate migration entries that were accidentally created
 * when migrations 015 and 016 duplicated the functionality of 009 and 010
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'eform.db');

console.log('🔧 Fixing duplicate migration entries...\n');

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.log('ℹ️  Database not found, no cleanup needed');
  process.exit(0);
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Check if the duplicate migrations exist in the database
  db.all("SELECT filename FROM schema_migrations WHERE filename IN ('015_command_queue_enhancements.sql', '016_add_cancelled_status.sql')", (err, rows) => {
    if (err) {
      console.error('Error checking migrations:', err);
      process.exit(1);
    }
    
    if (rows.length === 0) {
      console.log('✅ No duplicate migrations found in database');
      db.close();
      return;
    }
    
    console.log(`Found ${rows.length} duplicate migration(s) to remove:`);
    rows.forEach(row => {
      console.log(`  - ${row.filename}`);
    });
    
    // Remove the duplicate migration entries
    db.run("DELETE FROM schema_migrations WHERE filename IN ('015_command_queue_enhancements.sql', '016_add_cancelled_status.sql')", function(err) {
      if (err) {
        console.error('Error removing duplicate migrations:', err);
        process.exit(1);
      }
      
      console.log(`\n✅ Removed ${this.changes} duplicate migration entries`);
      console.log('🎉 Migration cleanup completed successfully!');
      
      db.close();
    });
  });
});