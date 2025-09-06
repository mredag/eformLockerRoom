#!/usr/bin/env node

/**
 * Test Smart Assignment Migration on clean database
 * Tests the complete migration process from scratch
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

class CleanMigrationTest {
  constructor() {
    this.testDbPath = 'data/clean_test.db';
  }

  async createCleanDatabase() {
    console.log('🆕 Creating clean test database...');
    
    if (fs.existsSync(this.testDbPath)) {
      fs.unlinkSync(this.testDbPath);
    }

    const db = new sqlite3.Database(this.testDbPath);
    
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Apply initial schema (migrations 001-020)
        const initialSchema = `
          -- Basic lockers table
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
          );

          -- Configuration tables (from migration 020)
          CREATE TABLE settings_global (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            data_type TEXT NOT NULL DEFAULT 'string',
            description TEXT,
            updated_by TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            CHECK (data_type IN ('string', 'number', 'boolean', 'json'))
          );

          CREATE TABLE settings_kiosk (
            kiosk_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            data_type TEXT NOT NULL DEFAULT 'string',
            description TEXT,
            updated_by TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (kiosk_id, key),
            CHECK (data_type IN ('string', 'number', 'boolean', 'json'))
          );

          -- Insert test data
          INSERT INTO lockers (kiosk_id, id, status, owner_key) VALUES 
          ('kiosk-1', 1, 'Free', NULL),
          ('kiosk-1', 2, 'Owned', '0009652489'),
          ('kiosk-1', 3, 'Free', NULL),
          ('kiosk-1', 4, 'Free', NULL),
          ('kiosk-1', 5, 'Owned', '0009652490');

          -- Insert some configuration
          INSERT INTO settings_global (key, value, data_type) VALUES 
          ('smart_assignment_enabled', 'false', 'boolean');
        `;

        db.exec(initialSchema, (err) => {
          if (err) {
            console.error('❌ Failed to create clean database:', err.message);
            reject(err);
          } else {
            console.log('✅ Clean test database created with 5 lockers');
            resolve();
          }
        });
      });
    }).finally(() => {
      db.close();
    });
  }

  async testMigrationApplication() {
    console.log('🔄 Testing migration application...');
    
    const db = new sqlite3.Database(this.testDbPath);
    
    return new Promise((resolve, reject) => {
      // Apply migration 021
      const migrationSQL = fs.readFileSync('migrations/021_smart_assignment_locker_columns.sql', 'utf8');
      const cleanSQL = migrationSQL.split('-- ROLLBACK INSTRUCTIONS')[0];
      
      db.exec(cleanSQL, (err) => {
        if (err) {
          console.error('❌ Migration application failed:', err.message);
          reject(err);
        } else {
          console.log('✅ Migration applied successfully');
          
          // Verify columns exist
          db.all(`PRAGMA table_info(lockers)`, (err, columns) => {
            if (err) {
              reject(err);
              return;
            }

            const columnNames = columns.map(col => col.name);
            const requiredColumns = [
              'free_since', 'recent_owner', 'recent_owner_time', 'quarantine_until',
              'wear_count', 'return_hold_until'
            ];

            const missingColumns = requiredColumns.filter(col => 
              !columnNames.includes(col)
            );

            if (missingColumns.length > 0) {
              reject(new Error(`Missing columns: ${missingColumns.join(', ')}`));
              return;
            }

            console.log(`✅ All required columns present (${columns.length} total)`);
            resolve();
          });
        }
      });
    }).finally(() => {
      db.close();
    });
  }

  async testDataPreservation() {
    console.log('🔍 Testing data preservation...');
    
    const db = new sqlite3.Database(this.testDbPath);
    
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT kiosk_id, id, status, owner_key, wear_count, free_since 
        FROM lockers 
        ORDER BY id
      `, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        if (rows.length !== 5) {
          reject(new Error(`Expected 5 lockers, found ${rows.length}`));
          return;
        }

        // Check that original data is preserved
        const expectedData = [
          { id: 1, status: 'Free', owner_key: null },
          { id: 2, status: 'Owned', owner_key: '0009652489' },
          { id: 3, status: 'Free', owner_key: null },
          { id: 4, status: 'Free', owner_key: null },
          { id: 5, status: 'Owned', owner_key: '0009652490' }
        ];

        let dataValid = true;
        for (let i = 0; i < expectedData.length; i++) {
          const expected = expectedData[i];
          const actual = rows[i];
          
          if (actual.id !== expected.id || 
              actual.status !== expected.status || 
              actual.owner_key !== expected.owner_key) {
            dataValid = false;
            console.error(`❌ Data mismatch at row ${i}:`, { expected, actual });
            break;
          }

          // Check new columns are initialized
          if (actual.wear_count === null) {
            dataValid = false;
            console.error(`❌ wear_count not initialized for locker ${actual.id}`);
            break;
          }

          // Check free_since is set for free lockers
          if (actual.status === 'Free' && !actual.free_since) {
            dataValid = false;
            console.error(`❌ free_since not set for free locker ${actual.id}`);
            break;
          }
        }

        if (dataValid) {
          console.log('✅ Data preservation verified');
          console.log('✅ New columns properly initialized');
          resolve();
        } else {
          reject(new Error('Data preservation test failed'));
        }
      });
    }).finally(() => {
      db.close();
    });
  }

  async testIndexCreation() {
    console.log('📋 Testing index creation...');
    
    const db = new sqlite3.Database(this.testDbPath);
    
    return new Promise((resolve, reject) => {
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
          reject(err);
          return;
        }

        if (indexes.length !== 3) {
          reject(new Error(`Expected 3 required indexes, found ${indexes.length}: ${indexes.map(i => i.name).join(', ')}`));
          return;
        }

        console.log('✅ All required composite indexes created successfully');
        indexes.forEach(index => {
          console.log(`  - ${index.name}`);
        });

        resolve();
      });
    }).finally(() => {
      db.close();
    });
  }

  async testRollback() {
    console.log('🔄 Testing rollback functionality...');
    
    const MigrationRollback = require('./rollback-smart-assignment-migration.js');
    const rollback = new MigrationRollback(this.testDbPath);
    
    try {
      await rollback.performRollback();
      console.log('✅ Rollback completed successfully');
      
      // Verify rollback worked
      const db = new sqlite3.Database(this.testDbPath);
      
      return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(lockers)`, (err, columns) => {
          if (err) {
            reject(err);
            return;
          }

          const columnNames = columns.map(col => col.name);
          const smartColumns = [
            'free_since', 'recent_owner', 'recent_owner_time', 'quarantine_until',
            'wear_count', 'return_hold_until'
          ];

          const remainingSmartColumns = smartColumns.filter(col => 
            columnNames.includes(col)
          );

          if (remainingSmartColumns.length > 0) {
            reject(new Error(`Rollback failed: smart columns still present: ${remainingSmartColumns.join(', ')}`));
            return;
          }

          console.log('✅ Rollback verification successful');
          resolve();
        });
      }).finally(() => {
        db.close();
      });
      
    } catch (error) {
      console.error('❌ Rollback test failed:', error.message);
      throw error;
    }
  }

  async cleanup() {
    if (fs.existsSync(this.testDbPath)) {
      fs.unlinkSync(this.testDbPath);
      console.log('🧹 Test database cleaned up');
    }
  }

  async runCompleteTest() {
    try {
      console.log('🚀 Starting Complete Migration Test\n');
      
      await this.createCleanDatabase();
      await this.testMigrationApplication();
      await this.testDataPreservation();
      await this.testIndexCreation();
      await this.testRollback();
      
      console.log('\n🎉 Complete migration test passed!');
      console.log('✅ Migration 021 is fully validated and production-ready');
      
    } catch (error) {
      console.error('\n💥 Complete migration test failed:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Run complete test if called directly
if (require.main === module) {
  const completeTest = new CleanMigrationTest();
  completeTest.runCompleteTest().catch(error => {
    console.error('Complete migration test failed:', error.message);
    process.exit(1);
  });
}

module.exports = CleanMigrationTest;