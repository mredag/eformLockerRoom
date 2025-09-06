#!/usr/bin/env node

/**
 * Apply Smart Assignment Migration (021) to development database
 * Safe application with verification
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = 'data/eform.db';
const MIGRATION_PATH = 'migrations/021_smart_assignment_locker_columns.sql';

class MigrationApplier {
  constructor() {
    this.db = null;
  }

  async init() {
    console.log(`🔄 Connecting to database: ${DB_PATH}`);
    
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(`Database file not found: ${DB_PATH}`);
    }

    if (!fs.existsSync(MIGRATION_PATH)) {
      throw new Error(`Migration file not found: ${MIGRATION_PATH}`);
    }

    this.db = new sqlite3.Database(DB_PATH);
    
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

  async checkIfAlreadyApplied() {
    console.log('🔍 Checking if migration already applied...');
    
    return new Promise((resolve, reject) => {
      this.db.all(`PRAGMA table_info(lockers)`, (err, columns) => {
        if (err) {
          reject(err);
          return;
        }

        const columnNames = columns.map(col => col.name);
        const smartAssignmentColumns = [
          'free_since', 'recent_owner', 'recent_owner_time', 'quarantine_until',
          'wear_count', 'return_hold_until'
        ];

        const existingSmartColumns = smartAssignmentColumns.filter(col => 
          columnNames.includes(col)
        );

        if (existingSmartColumns.length > 0) {
          console.log('⚠️  Migration appears to be already applied');
          console.log(`   Found columns: ${existingSmartColumns.join(', ')}`);
          resolve(true);
        } else {
          console.log('✅ Migration not yet applied');
          resolve(false);
        }
      });
    });
  }

  async createBackup() {
    console.log('📦 Creating backup before migration...');
    
    const backupPath = `${DB_PATH}.backup.${Date.now()}`;
    
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(DB_PATH);
      const writeStream = fs.createWriteStream(backupPath);
      
      readStream.pipe(writeStream);
      
      writeStream.on('finish', () => {
        console.log(`✅ Backup created: ${backupPath}`);
        resolve(backupPath);
      });
      
      writeStream.on('error', reject);
      readStream.on('error', reject);
    });
  }

  async applyMigration() {
    console.log('🔄 Applying migration 021...');
    
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

  async verifyMigration() {
    console.log('🔍 Verifying migration...');
    
    return new Promise((resolve, reject) => {
      // Check new columns exist
      this.db.all(`PRAGMA table_info(lockers)`, (err, columns) => {
        if (err) {
          reject(err);
          return;
        }

        const columnNames = columns.map(col => col.name);
        const requiredColumns = [
          'free_since', 'recent_owner', 'recent_owner_time', 'quarantine_until',
          'wear_count', 'return_hold_until', 'overdue_from', 'overdue_reason',
          'suspected_occupied', 'cleared_by', 'cleared_at', 'owner_hot_until'
        ];

        const missingColumns = requiredColumns.filter(col => 
          !columnNames.includes(col)
        );

        if (missingColumns.length > 0) {
          reject(new Error(`Missing columns: ${missingColumns.join(', ')}`));
          return;
        }

        // Check required indexes exist
        this.db.all(`
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
            reject(new Error(`Missing required indexes. Found: ${indexes.map(i => i.name).join(', ')}`));
            return;
          }

          console.log('✅ Migration verification successful');
          console.log(`📊 Lockers table now has ${columns.length} columns`);
          console.log(`📊 Created ${indexes.length} required composite indexes`);
          resolve();
        });
      });
    });
  }

  async close() {
    if (this.db) {
      this.db.close();
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Smart Assignment Migration Application\n');
      
      await this.init();
      
      const alreadyApplied = await this.checkIfAlreadyApplied();
      if (alreadyApplied) {
        console.log('⏭️  Migration already applied, skipping');
        return;
      }
      
      const backupPath = await this.createBackup();
      await this.applyMigration();
      await this.verifyMigration();
      
      console.log('\n🎉 Migration applied successfully!');
      console.log('✅ Smart assignment database schema ready');
      console.log(`💾 Backup available at: ${backupPath}`);
      
    } catch (error) {
      console.error('\n💥 Migration failed:', error.message);
      console.error('🔧 Check backup and consider rollback if needed');
      throw error;
    } finally {
      await this.close();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const applier = new MigrationApplier();
  applier.run().catch(error => {
    console.error('Migration application failed:', error.message);
    process.exit(1);
  });
}

module.exports = MigrationApplier;