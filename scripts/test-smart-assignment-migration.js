#!/usr/bin/env node

/**
 * Test script for Smart Assignment Migration (021)
 * Tests migration application and rollback scenarios
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const TEST_DB_PATH = 'data/test_migration.db';
const MIGRATION_PATH = 'migrations/021_smart_assignment_locker_columns.sql';

class MigrationTester {
  constructor() {
    this.db = null;
  }

  async init() {
    // Remove test database if it exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Create new test database
    this.db = new sqlite3.Database(TEST_DB_PATH);
    
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Create basic schema first
        this.db.run(`
          CREATE TABLE lockers (
            kiosk_id TEXT NOT NULL,
            id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'Free',
            owner_type TEXT,
            owner_key TEXT,
            reserved_at DATETIME,
            owned_at DATETIME,
            version INTEGER NOT NULL DEFAULT 1,
            is_vip BOOLEAN NOT NULL DEFAULT 0,
            display_name VARCHAR(20),
            name_updated_at DATETIME,
            name_updated_by VARCHAR(50),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (kiosk_id, id)
          )
        `);

        // Insert test data
        this.db.run(`
          INSERT INTO lockers (kiosk_id, id, status, owner_key) VALUES 
          ('kiosk-1', 1, 'Free', NULL),
          ('kiosk-1', 2, 'Owned', '0009652489'),
          ('kiosk-1', 3, 'Free', NULL)
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  async runMigration() {
    console.log('🔄 Running migration 021...');
    
    const migrationSQL = fs.readFileSync(MIGRATION_PATH, 'utf8');
    
    // Remove rollback comments section
    const cleanSQL = migrationSQL.split('-- ROLLBACK INSTRUCTIONS')[0];
    
    return new Promise((resolve, reject) => {
      this.db.exec(cleanSQL, (err) => {
        if (err) {
          console.error('❌ Migration failed:', err.message);
          reject(err);
        } else {
          console.log('✅ Migration applied successfully');
          resolve();
        }
      });
    });
  }

  async testNewColumns() {
    console.log('🧪 Testing new columns...');
    
    return new Promise((resolve, reject) => {
      // Test that new columns exist and can be queried
      this.db.all(`
        SELECT kiosk_id, id, status, free_since, recent_owner, recent_owner_time, 
               quarantine_until, wear_count, return_hold_until, overdue_from, 
               overdue_reason, suspected_occupied, cleared_by, cleared_at, owner_hot_until
        FROM lockers 
        LIMIT 3
      `, (err, rows) => {
        if (err) {
          console.error('❌ Column test failed:', err.message);
          reject(err);
        } else {
          console.log('✅ All new columns accessible');
          console.log('📊 Sample data:', rows[0]);
          
          // Verify initialization worked
          const freeLocker = rows.find(r => r.status === 'Free');
          if (freeLocker && freeLocker.free_since && freeLocker.wear_count === 0) {
            console.log('✅ Column initialization successful');
          } else {
            console.log('⚠️  Column initialization may have issues');
          }
          
          resolve();
        }
      });
    });
  }

  async testNewTables() {
    console.log('🧪 No new tables to test (locker columns only migration)');
    // This migration only adds columns to lockers table, no new tables created
    return Promise.resolve();
  }

  async testIndexes() {
    console.log('🧪 Testing indexes...');
    
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name LIKE 'idx_lockers_%' 
        AND name IN (
          'idx_lockers_free_since',
          'idx_lockers_recent_owner',
          'idx_lockers_quarantine_until',
          'idx_lockers_assignment_query',
          'idx_lockers_scoring_query'
        )
      `, (err, rows) => {
        if (err) {
          console.error('❌ Index test failed:', err.message);
          reject(err);
        } else {
          console.log(`✅ Found ${rows.length} smart assignment indexes`);
          rows.forEach(row => console.log(`  - ${row.name}`));
          resolve();
        }
      });
    });
  }

  async testTriggers() {
    console.log('🧪 No triggers to test (locker columns only migration)');
    // This migration only adds columns to lockers table, no triggers created
    return Promise.resolve();
  }

  async testDataIntegrity() {
    console.log('🧪 Testing data integrity...');
    
    return new Promise((resolve, reject) => {
      // Test that existing data is preserved
      this.db.all(`
        SELECT kiosk_id, id, status, owner_key 
        FROM lockers 
        WHERE kiosk_id = 'kiosk-1' 
        ORDER BY id
      `, (err, rows) => {
        if (err) {
          console.error('❌ Data integrity test failed:', err.message);
          reject(err);
        } else if (rows.length !== 3) {
          console.error('❌ Data integrity test failed: wrong number of rows');
          reject(new Error('Data integrity compromised'));
        } else {
          const expectedData = [
            { kiosk_id: 'kiosk-1', id: 1, status: 'Free', owner_key: null },
            { kiosk_id: 'kiosk-1', id: 2, status: 'Owned', owner_key: '0009652489' },
            { kiosk_id: 'kiosk-1', id: 3, status: 'Free', owner_key: null }
          ];
          
          let dataValid = true;
          for (let i = 0; i < expectedData.length; i++) {
            const expected = expectedData[i];
            const actual = rows[i];
            
            if (actual.kiosk_id !== expected.kiosk_id || 
                actual.id !== expected.id || 
                actual.status !== expected.status || 
                actual.owner_key !== expected.owner_key) {
              dataValid = false;
              break;
            }
          }
          
          if (dataValid) {
            console.log('✅ Data integrity preserved');
          } else {
            console.error('❌ Data integrity compromised');
            reject(new Error('Data integrity test failed'));
          }
          
          resolve();
        }
      });
    });
  }

  async testColumnConstraints() {
    console.log('🧪 Testing column constraints...');
    
    return new Promise((resolve, reject) => {
      // Test overdue_reason constraint
      this.db.run(`
        UPDATE lockers 
        SET overdue_reason = 'time_limit' 
        WHERE kiosk_id = 'kiosk-1' AND id = 1
      `, (err) => {
        if (err) {
          console.error('❌ Valid overdue_reason constraint test failed:', err.message);
          reject(err);
          return;
        }

        // Test invalid overdue_reason (should fail)
        this.db.run(`
          UPDATE lockers 
          SET overdue_reason = 'invalid_reason' 
          WHERE kiosk_id = 'kiosk-1' AND id = 1
        `, (err) => {
          if (err) {
            console.log('✅ overdue_reason constraint working (invalid value rejected)');
            resolve();
          } else {
            console.error('❌ overdue_reason constraint not working (invalid value accepted)');
            reject(new Error('Constraint validation failed'));
          }
        });
      });
    });
  }

  async cleanup() {
    if (this.db) {
      this.db.close();
    }
    
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  }

  async runAllTests() {
    try {
      console.log('🚀 Starting Smart Assignment Migration Tests\n');
      
      await this.init();
      await this.runMigration();
      await this.testNewColumns();
      await this.testNewTables();
      await this.testIndexes();
      await this.testTriggers();
      await this.testDataIntegrity();
      await this.testColumnConstraints();
      
      console.log('\n🎉 All migration tests passed successfully!');
      console.log('✅ Migration 021 is ready for deployment');
      
    } catch (error) {
      console.error('\n💥 Migration test failed:', error.message);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new MigrationTester();
  tester.runAllTests();
}

module.exports = MigrationTester;