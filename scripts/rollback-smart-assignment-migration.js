#!/usr/bin/env node

/**
 * Rollback script for Smart Assignment Migration (021)
 * Safely removes smart assignment columns and tables
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class MigrationRollback {
  constructor(dbPath = 'data/eform.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    console.log(`🔄 Connecting to database: ${this.dbPath}`);
    
    if (!fs.existsSync(this.dbPath)) {
      throw new Error(`Database file not found: ${this.dbPath}`);
    }

    this.db = new sqlite3.Database(this.dbPath);
    
    return new Promise((resolve, reject) => {
      this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='lockers'", (err, row) => {
        if (err) reject(err);
        else if (!row) reject(new Error('Lockers table not found'));
        else {
          console.log('✅ Database connection established');
          resolve();
        }
      });
    });
  }

  async createBackup() {
    console.log('📦 Creating backup of current locker data...');
    
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Create backup table with original structure
        this.db.run(`
          CREATE TABLE IF NOT EXISTS lockers_backup AS 
          SELECT kiosk_id, id, status, owner_type, owner_key, reserved_at, owned_at, 
                 version, is_vip, display_name, name_updated_at, name_updated_by, 
                 created_at, updated_at 
          FROM lockers
        `, (err) => {
          if (err) {
            console.error('❌ Backup creation failed:', err.message);
            reject(err);
          } else {
            console.log('✅ Backup table created');
            resolve();
          }
        });
      });
    });
  }

  async verifyBackup() {
    console.log('🔍 Verifying backup integrity...');
    
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT COUNT(*) as original_count FROM lockers
      `, (err, originalRows) => {
        if (err) {
          reject(err);
          return;
        }

        this.db.all(`
          SELECT COUNT(*) as backup_count FROM lockers_backup
        `, (err, backupRows) => {
          if (err) {
            reject(err);
            return;
          }

          const originalCount = originalRows[0].original_count;
          const backupCount = backupRows[0].backup_count;

          if (originalCount === backupCount) {
            console.log(`✅ Backup verified: ${backupCount} records`);
            resolve();
          } else {
            reject(new Error(`Backup verification failed: ${originalCount} vs ${backupCount} records`));
          }
        });
      });
    });
  }

  async dropSmartAssignmentTables() {
    console.log('🗑️  No additional tables to drop (locker columns only migration)');
    // This migration only adds columns to lockers table, no new tables created
    return Promise.resolve();
  }

  async recreateOriginalLockersTable() {
    console.log('🔄 Recreating original lockers table...');
    
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Drop current lockers table
        this.db.run(`DROP TABLE lockers`, (err) => {
          if (err) {
            console.error('❌ Failed to drop lockers table:', err.message);
            reject(err);
            return;
          }

          // Recreate original table structure
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
          `, (err) => {
            if (err) {
              console.error('❌ Failed to recreate lockers table:', err.message);
              reject(err);
              return;
            }

            // Restore data from backup
            this.db.run(`
              INSERT INTO lockers 
              SELECT kiosk_id, id, status, owner_type, owner_key, reserved_at, owned_at, 
                     version, is_vip, display_name, name_updated_at, name_updated_by, 
                     created_at, updated_at 
              FROM lockers_backup
            `, (err) => {
              if (err) {
                console.error('❌ Failed to restore data:', err.message);
                reject(err);
              } else {
                console.log('✅ Original lockers table recreated and data restored');
                resolve();
              }
            });
          });
        });
      });
    });
  }

  async recreateOriginalIndexes() {
    console.log('📊 Recreating original indexes...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_lockers_kiosk_status ON lockers(kiosk_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_lockers_owner_key ON lockers(owner_key)',
      'CREATE INDEX IF NOT EXISTS idx_lockers_display_name ON lockers(display_name)'
    ];

    for (const indexSQL of indexes) {
      await new Promise((resolve, reject) => {
        this.db.run(indexSQL, (err) => {
          if (err) {
            console.error('❌ Failed to create index:', err.message);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

    console.log('✅ Original indexes recreated');
  }

  async verifyRollback() {
    console.log('🔍 Verifying rollback...');
    
    return new Promise((resolve, reject) => {
      // Check that smart assignment columns are gone
      this.db.all(`PRAGMA table_info(lockers)`, (err, columns) => {
        if (err) {
          reject(err);
          return;
        }

        const columnNames = columns.map(col => col.name);
        const smartAssignmentColumns = [
          'free_since', 'recent_owner', 'recent_owner_time', 'quarantine_until',
          'wear_count', 'return_hold_until', 'overdue_from', 'overdue_reason',
          'suspected_occupied', 'cleared_by', 'cleared_at', 'owner_hot_until'
        ];

        const remainingSmartColumns = smartAssignmentColumns.filter(col => 
          columnNames.includes(col)
        );

        if (remainingSmartColumns.length > 0) {
          reject(new Error(`Smart assignment columns still present: ${remainingSmartColumns.join(', ')}`));
          return;
        }

        // Check that original columns are present
        const requiredColumns = [
          'kiosk_id', 'id', 'status', 'owner_type', 'owner_key', 
          'reserved_at', 'owned_at', 'version', 'is_vip'
        ];

        const missingColumns = requiredColumns.filter(col => 
          !columnNames.includes(col)
        );

        if (missingColumns.length > 0) {
          reject(new Error(`Required columns missing: ${missingColumns.join(', ')}`));
          return;
        }

        console.log('✅ Rollback verification successful');
        console.log(`📊 Lockers table has ${columns.length} columns`);
        resolve();
      });
    });
  }

  async cleanupBackup() {
    console.log('🧹 Cleaning up backup table...');
    
    return new Promise((resolve, reject) => {
      this.db.run(`DROP TABLE IF EXISTS lockers_backup`, (err) => {
        if (err) {
          console.error('❌ Failed to cleanup backup:', err.message);
          reject(err);
        } else {
          console.log('✅ Backup table removed');
          resolve();
        }
      });
    });
  }

  async close() {
    if (this.db) {
      this.db.close();
    }
  }

  async performRollback() {
    try {
      console.log('🚀 Starting Smart Assignment Migration Rollback\n');
      
      await this.init();
      await this.createBackup();
      await this.verifyBackup();
      await this.dropSmartAssignmentTables();
      await this.recreateOriginalLockersTable();
      await this.recreateOriginalIndexes();
      await this.verifyRollback();
      await this.cleanupBackup();
      
      console.log('\n🎉 Migration rollback completed successfully!');
      console.log('✅ System restored to pre-smart-assignment state');
      
    } catch (error) {
      console.error('\n💥 Rollback failed:', error.message);
      console.error('⚠️  Database may be in inconsistent state');
      console.error('🔧 Manual intervention may be required');
      throw error;
    } finally {
      await this.close();
    }
  }
}

// Run rollback if called directly
if (require.main === module) {
  const rollback = new MigrationRollback();
  rollback.performRollback().catch(error => {
    console.error('Rollback failed:', error.message);
    process.exit(1);
  });
}

module.exports = MigrationRollback;