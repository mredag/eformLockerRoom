#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../data/eform.db');

console.log('🔧 Fixing Boş Status');
console.log('====================');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

db.run(`UPDATE lockers SET status = 'Free' WHERE status = 'Boş'`, function(err) {
  if (err) {
    console.error('❌ Error updating status:', err.message);
  } else {
    console.log(`✅ Updated ${this.changes} lockers from 'Boş' to 'Free'`);
  }
  
  // Verify the fix
  db.all(`SELECT status, COUNT(*) as count FROM lockers GROUP BY status ORDER BY count DESC`, (err, rows) => {
    if (err) {
      console.error('❌ Error checking status:', err.message);
    } else {
      console.log('\n📊 Final status distribution:');
      rows.forEach(row => {
        console.log(`   ${row.status}: ${row.count} lockers`);
      });
    }
    
    db.close();
    console.log('\n✅ Database normalized - all statuses are now English');
  });
});