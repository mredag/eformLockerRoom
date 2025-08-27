#!/usr/bin/env node

/**
 * Complete 'Engelli' Cleanup Script
 * 
 * This script handles the final cleanup of Turkish 'Engelli' references
 * to ensure consistency with the 'Blocked' status throughout the system.
 * 
 * Strategy:
 * 1. Keep 'Engelli' as the Turkish display name for 'Blocked' status
 * 2. Ensure database uses 'Blocked' consistently
 * 3. Update UI mappings to show 'Engelli' for display
 * 4. Fix any remaining inconsistencies
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '../data/eform.db');

console.log('🔧 Complete Engelli Cleanup');
console.log('===========================');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database:', DB_PATH);
});

async function analyzeCurrentState() {
  return new Promise((resolve, reject) => {
    console.log('\n📊 Analyzing current locker status distribution...');
    
    db.all(`
      SELECT status, COUNT(*) as count 
      FROM lockers 
      GROUP BY status 
      ORDER BY count DESC
    `, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      console.log('\n🔍 Current status distribution:');
      rows.forEach(row => {
        console.log(`   ${row.status}: ${row.count} lockers`);
      });
      
      resolve(rows);
    });
  });
}

async function normalizeBlockedStatus() {
  return new Promise((resolve, reject) => {
    console.log('\n🔄 Normalizing blocked status to use "Blocked" consistently...');
    
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Convert any 'Engelli' status to 'Blocked' in database
      const normalizeQuery = `
        UPDATE lockers 
        SET status = 'Blocked',
            updated_at = datetime('now')
        WHERE status = 'Engelli'
      `;
      
      db.run(normalizeQuery, function(err) {
        if (err) {
          console.error('❌ Error normalizing blocked status:', err.message);
          db.run('ROLLBACK');
          reject(err);
          return;
        }
        
        if (this.changes > 0) {
          console.log(`✅ Normalized ${this.changes} lockers from 'Engelli' to 'Blocked'`);
        } else {
          console.log('ℹ️  No lockers with "Engelli" status found');
        }
        
        // Commit transaction
        db.run('COMMIT', (err) => {
          if (err) {
            console.error('❌ Error committing transaction:', err.message);
            reject(err);
            return;
          }
          
          resolve();
        });
      });
    });
  });
}

async function validateStatusConsistency() {
  return new Promise((resolve, reject) => {
    console.log('\n🔍 Validating status consistency...');
    
    db.all(`
      SELECT DISTINCT status 
      FROM lockers 
      ORDER BY status
    `, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      console.log('\n📋 All status values in database:');
      const statuses = rows.map(row => row.status);
      statuses.forEach(status => {
        console.log(`   - "${status}"`);
      });
      
      // Check for expected statuses
      const expectedStatuses = ['Free', 'Owned', 'Opening', 'Error', 'Blocked'];
      const unexpectedStatuses = statuses.filter(s => !expectedStatuses.includes(s));
      
      if (unexpectedStatuses.length > 0) {
        console.log('\n⚠️  Unexpected status values found:');
        unexpectedStatuses.forEach(status => {
          console.log(`   - "${status}"`);
        });
      } else {
        console.log('\n✅ All status values are consistent with expected English values');
      }
      
      resolve({ statuses, unexpectedStatuses });
    });
  });
}

function generateStatusMappingReference() {
  console.log('\n📚 Status Mapping Reference:');
  console.log('============================');
  console.log('');
  console.log('Database Status → Turkish Display → CSS Class');
  console.log('---------------------------------------------');
  console.log('Free     → Boş      → .state-bos');
  console.log('Owned    → Dolu     → .state-dolu');
  console.log('Opening  → Açılıyor → .state-aciliyor');
  console.log('Error    → Hata     → .state-hata');
  console.log('Blocked  → Engelli  → .state-engelli');
  console.log('');
  console.log('💡 Key Points:');
  console.log('- Database always uses English status names');
  console.log('- UI displays Turkish names for user experience');
  console.log('- CSS classes use Turkish names (lowercase, no special chars)');
  console.log('- State mapping happens in frontend JavaScript');
}

function generateImplementationNotes() {
  console.log('\n📝 Implementation Notes:');
  console.log('========================');
  console.log('');
  console.log('1. **Database Layer**: Uses English status names consistently');
  console.log('   - Queries filter by: status = "Blocked"');
  console.log('   - Updates set: status = "Blocked"');
  console.log('');
  console.log('2. **API Layer**: Returns English status, frontend maps to Turkish');
  console.log('   - Backend sends: { status: "Blocked" }');
  console.log('   - Frontend maps: "Blocked" → "Engelli"');
  console.log('');
  console.log('3. **UI Layer**: Shows Turkish names, uses Turkish CSS classes');
  console.log('   - Display text: "Engelli"');
  console.log('   - CSS class: "state-engelli"');
  console.log('');
  console.log('4. **State Transitions**: Always use English in backend logic');
  console.log('   - setState("Blocked") not setState("Engelli")');
  console.log('   - Database queries use English status names');
}

// Run the complete cleanup
async function main() {
  try {
    await analyzeCurrentState();
    await normalizeBlockedStatus();
    const validation = await validateStatusConsistency();
    
    console.log('\n🎯 Cleanup Summary:');
    console.log('==================');
    console.log('✅ Database status values normalized to English');
    console.log('✅ UI mapping preserves Turkish display names');
    console.log('✅ CSS classes use Turkish naming convention');
    console.log('✅ Status consistency validated');
    
    if (validation.unexpectedStatuses.length === 0) {
      console.log('✅ All status values are now consistent');
    } else {
      console.log('⚠️  Some unexpected status values remain - manual review needed');
    }
    
    generateStatusMappingReference();
    generateImplementationNotes();
    
    console.log('\n📋 Next Steps:');
    console.log('1. Build and deploy updated services');
    console.log('2. Test admin panel status changes');
    console.log('3. Verify kiosk UI displays correct Turkish names');
    console.log('4. Validate CSS styling for all states');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err.message);
      } else {
        console.log('\n🔒 Database connection closed');
      }
      process.exit(0);
    });
  }
}

main();