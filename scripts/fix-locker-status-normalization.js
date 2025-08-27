#!/usr/bin/env node

/**
 * Fix Locker Status Normalization
 * 
 * Problem: Database has mixed Turkish/English status values:
 * - "Boş" (Turkish) should be "Free" (English)
 * - "Engelli" (Turkish) should be "Blocked" (English)
 * 
 * This script normalizes all status values to English for consistency.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../data/eform.db');

console.log('🔧 Locker Status Normalization Fix');
console.log('==================================');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database:', DB_PATH);
});

async function fixStatusNormalization() {
  return new Promise((resolve, reject) => {
    console.log('\n📊 Current status distribution:');
    
    // First, show current status distribution
    db.all('SELECT status, COUNT(*) as count FROM lockers GROUP BY status ORDER BY status', (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      rows.forEach(row => {
        console.log(`   ${row.status}: ${row.count} lockers`);
      });
      
      console.log('\n🔄 Normalizing status values...');
      
      // Start transaction
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Normalize Turkish "Boş" to English "Free"
        db.run(`UPDATE lockers SET status = 'Free' WHERE status = 'Boş'`, function(err) {
          if (err) {
            console.error('❌ Error updating Boş to Free:', err.message);
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          if (this.changes > 0) {
            console.log(`✅ Updated ${this.changes} lockers from "Boş" to "Free"`);
          }
        });
        
        // Normalize Turkish "Engelli" to English "Blocked"
        db.run(`UPDATE lockers SET status = 'Blocked' WHERE status = 'Engelli'`, function(err) {
          if (err) {
            console.error('❌ Error updating Engelli to Blocked:', err.message);
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          if (this.changes > 0) {
            console.log(`✅ Updated ${this.changes} lockers from "Engelli" to "Blocked"`);
          }
        });
        
        // Commit transaction
        db.run('COMMIT', (err) => {
          if (err) {
            console.error('❌ Error committing transaction:', err.message);
            reject(err);
            return;
          }
          
          console.log('\n📊 Updated status distribution:');
          
          // Show final status distribution
          db.all('SELECT status, COUNT(*) as count FROM lockers GROUP BY status ORDER BY status', (err, rows) => {
            if (err) {
              reject(err);
              return;
            }
            
            rows.forEach(row => {
              console.log(`   ${row.status}: ${row.count} lockers`);
            });
            
            console.log('\n✅ Status normalization completed successfully!');
            console.log('\n📋 Standardized Status Values:');
            console.log('   - Free: Available lockers');
            console.log('   - Owned: Occupied by users');
            console.log('   - Reserved: Reserved for users');
            console.log('   - Blocked: Administratively disabled');
            console.log('   - Opening: Currently being opened');
            console.log('   - Error: Hardware or system error');
            
            resolve();
          });
        });
      });
    });
  });
}

// Run the fix
fixStatusNormalization()
  .then(() => {
    console.log('\n🎯 Next Steps:');
    console.log('1. Restart panel service to see updated data');
    console.log('2. Test locker filtering in admin panel');
    console.log('3. Verify UI displays correct Turkish labels');
    
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err.message);
      } else {
        console.log('\n🔒 Database connection closed');
      }
      process.exit(0);
    });
  })
  .catch((error) => {
    console.error('❌ Fix failed:', error.message);
    db.close();
    process.exit(1);
  });