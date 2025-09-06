#!/usr/bin/env node

/**
 * Verify Smart Assignment Migration columns
 */

const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('data/eform.db');

console.log('🔍 Verifying Smart Assignment Migration columns...\n');

db.all(`PRAGMA table_info(lockers)`, (err, columns) => {
  if (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }

  console.log('📊 Lockers table columns:');
  columns.forEach((col, index) => {
    const isNew = [
      'free_since', 'recent_owner', 'recent_owner_time', 'quarantine_until',
      'wear_count', 'return_hold_until', 'overdue_from', 'overdue_reason',
      'suspected_occupied', 'cleared_by', 'cleared_at', 'owner_hot_until'
    ].includes(col.name);
    
    const marker = isNew ? '🆕' : '  ';
    console.log(`${marker} ${index + 1}. ${col.name} (${col.type})`);
  });

  console.log(`\n✅ Total columns: ${columns.length}`);
  
  // Check required indexes
  db.all(`
    SELECT name FROM sqlite_master 
    WHERE type='index' AND name LIKE 'idx_lockers_%' 
    AND name IN (
      'idx_lockers_status_free_since',
      'idx_lockers_quarantine_query', 
      'idx_lockers_recent_owner_query'
    )
  `, (err, indexes) => {
    if (err) {
      console.error('❌ Error checking indexes:', err.message);
      process.exit(1);
    }

    console.log('\n📊 Required composite indexes:');
    indexes.forEach(index => {
      console.log(`✅ ${index.name}`);
    });

    console.log('\n🎉 Migration verification complete!');
    db.close();
  });
});