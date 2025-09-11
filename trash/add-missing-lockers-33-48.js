#!/usr/bin/env node

/**
 * Add Missing Lockers 33-48 to Database
 * 
 * This script adds the missing lockers 33-48 to match the hardware configuration
 * that shows 3 relay cards (48 total channels) but database only has 32 lockers.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = './data/eform.db';
const KIOSK_ID = 'kiosk-1';

async function addMissingLockers() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
        reject(err);
        return;
      }
      console.log('✅ Connected to SQLite database');
    });

    // First, check current locker count
    db.get('SELECT COUNT(*) as count, MAX(id) as max_id FROM lockers WHERE kiosk_id = ?', [KIOSK_ID], (err, row) => {
      if (err) {
        console.error('❌ Error checking current lockers:', err.message);
        db.close();
        reject(err);
        return;
      }

      console.log(`📊 Current state: ${row.count} lockers, max ID: ${row.max_id}`);

      if (row.count >= 48) {
        console.log('✅ Database already has 48 or more lockers');
        db.close();
        resolve();
        return;
      }

      // Add missing lockers from 33 to 48
      const startId = Math.max(row.max_id + 1, 33);
      const endId = 48;
      
      console.log(`🔧 Adding lockers ${startId} to ${endId}...`);

      const stmt = db.prepare(`
        INSERT INTO lockers (kiosk_id, id, status, version, created_at, updated_at) 
        VALUES (?, ?, 'Free', 1, datetime('now'), datetime('now'))
      `);

      let addedCount = 0;
      
      for (let i = startId; i <= endId; i++) {
        stmt.run([KIOSK_ID, i], function(err) {
          if (err) {
            console.error(`❌ Error adding locker ${i}:`, err.message);
          } else {
            addedCount++;
            console.log(`✅ Added locker ${i}`);
          }

          // Check if we're done
          if (i === endId) {
            stmt.finalize();
            
            // Verify final count
            db.get('SELECT COUNT(*) as count FROM lockers WHERE kiosk_id = ?', [KIOSK_ID], (err, finalRow) => {
              if (err) {
                console.error('❌ Error verifying final count:', err.message);
              } else {
                console.log(`🎯 Final result: ${finalRow.count} total lockers`);
                console.log(`✅ Successfully added ${addedCount} new lockers`);
              }
              
              db.close((err) => {
                if (err) {
                  console.error('❌ Error closing database:', err.message);
                  reject(err);
                } else {
                  console.log('✅ Database connection closed');
                  resolve();
                }
              });
            });
          }
        });
      }
    });
  });
}

// Run the script
if (require.main === module) {
  console.log('🚀 Starting to add missing lockers 33-48...');
  
  addMissingLockers()
    .then(() => {
      console.log('🎉 Script completed successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('1. Restart the kiosk service: npm run start:kiosk');
      console.log('2. Test the session to see all 48 lockers');
      console.log('3. Verify hardware mapping for lockers 33-48');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

module.exports = { addMissingLockers };