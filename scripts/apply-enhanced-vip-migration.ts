#!/usr/bin/env ts-node

import { Database } from 'sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = process.env.DB_PATH || './data/eform.db';
const MIGRATION_FILE = './migrations/011_enhanced_vip_contracts.sql';

async function applyMigration() {
  console.log('🚀 Applying Enhanced VIP Contracts Migration...');
  
  const db = new Database(DB_PATH);
  
  try {
    // Read migration file
    const migrationSql = readFileSync(join(__dirname, '..', MIGRATION_FILE), 'utf8');
    
    console.log(`📝 Executing migration...`);
    
    // Execute the entire migration as one statement
    await new Promise<void>((resolve, reject) => {
      db.exec(migrationSql, (err) => {
        if (err) {
          console.error(`❌ Error executing migration:`, err.message);
          reject(err);
        } else {
          console.log('✅ Migration executed successfully');
          resolve();
        }
      });
    });
    
    // Verify tables were created
    console.log('🔍 Verifying migration...');
    
    const verifyQueries = [
      "SELECT name FROM sqlite_master WHERE type='table' AND name='contracts'",
      "SELECT name FROM sqlite_master WHERE type='table' AND name='payments'",
      "SELECT name FROM sqlite_master WHERE type='view' AND name='active_contracts_with_payments'",
      "SELECT name FROM sqlite_master WHERE type='view' AND name='expiring_contracts'",
      "SELECT name FROM sqlite_master WHERE type='view' AND name='payment_history_with_contracts'"
    ];
    
    for (const query of verifyQueries) {
      await new Promise<void>((resolve, reject) => {
        db.get(query, (err, row: any) => {
          if (err) {
            reject(err);
          } else if (!row) {
            reject(new Error(`Expected table/view not found: ${query}`));
          } else {
            console.log(`   ✅ ${row.name} created successfully`);
            resolve();
          }
        });
      });
    }
    
    // Test basic operations
    console.log('🧪 Testing basic operations...');
    
    // Test contracts table
    await new Promise<void>((resolve, reject) => {
      db.run("INSERT INTO contracts (member_name, phone, plan, price, start_at, end_at, created_by, kiosk_id, locker_id, rfid_card) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
        ['Test Member', '1234567890', 'basic', 100.00, '2024-01-01', '2024-12-31', 'test_user', 'kiosk1', 1, 'test_card'], 
        function(err) {
          if (err) {
            reject(err);
          } else {
            console.log('   ✅ Test contract created successfully');
            
            // Clean up test data
            db.run("DELETE FROM contracts WHERE member_name = 'Test Member'", (cleanupErr) => {
              if (cleanupErr) {
                console.warn('   ⚠️  Warning: Could not clean up test data:', cleanupErr.message);
              }
              resolve();
            });
          }
        }
      );
    });
    
    console.log('✅ Enhanced VIP Contracts Migration completed successfully!');
    console.log('');
    console.log('📊 New features available:');
    console.log('   • Enhanced contracts table with member info and pricing');
    console.log('   • Payments table with payment method tracking');
    console.log('   • Views for active contracts with payment summaries');
    console.log('   • Views for expiring contracts and payment history');
    console.log('   • Comprehensive indexes for performance');
    console.log('   • Repository classes for data access');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run migration if called directly
if (require.main === module) {
  applyMigration().catch(console.error);
}

export { applyMigration };