const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'eform.db');
const db = new sqlite3.Database(dbPath);

console.log('Checking database tables...\n');

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  console.log('Tables in database:');
  rows.forEach(row => {
    console.log(`  - ${row.name}`);
  });
  
  // Check if lockers table exists and has data
  db.all("SELECT COUNT(*) as count FROM lockers", (err, result) => {
    if (err) {
      console.error('\nError checking lockers table:', err.message);
    } else {
      console.log(`\nLockers table has ${result[0].count} records`);
    }
    
    db.close();
  });
});