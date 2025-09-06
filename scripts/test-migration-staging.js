#!/usr/bin/env node

/**
 * Test Smart Assignment Migration on staging database
 * Creates a staging copy and tests migration
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

class StagingMigrationTest {
  constructor() {
    this.stagingDbPath = 'data/staging_test.db';
    this.productionDbPath = 'data/eform.db';
  }

  async createStagingCopy() {
    console.log('📋 Creating staging database copy...');
    
    if (fs.existsSync(this.stagingDbPath)) {
      fs.unlinkSync(this.stagingDbPath);
    }

    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(this.productionDbPath);
      const writeStream = fs.createWriteStream(this.stagingDbPath);
      
      readStream.pipe(writeStream);
      
      writeStream.on('finish', () => {
        console.log('✅ Staging database created');
        resolve();
      });
      
      writeStream.on('error', reject);
      readStream.on('error', reject);
    });
  }

  async testMigrationOnStaging() {
    console.log('🧪 Testing migration on staging database...');
    
    const MigrationTester = require('./test-smart-assignment-migration.js');
    
    // Modify the tester to use staging database
    const tester = new MigrationTester();
    tester.TEST_DB_PATH = this.stagingDbPath;
    
    // Create a staging database with production-like data
    const db = new sqlite3.Database(this.stagingDbPath);
    
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Test with existing data
        db.all('SELECT COUNT(*) as count FROM lockers', (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          
          const lockerCount = rows[0].count;
          console.log(`📊 Testing with ${lockerCount} existing lockers`);
          
          // Apply migration to staging
          const migrationSQL = fs.readFileSync('migrations/021_smart_assignment_locker_columns.sql', 'utf8');
          const cleanSQL = migrationSQL.split('-- ROLLBACK INSTRUCTIONS')[0];
          
          db.exec(cleanSQL, (err) => {
            if (err) {
              console.error('❌ Staging migration failed:', err.message);
              reject(err);
            } else {
              console.log('✅ Staging migration applied successfully');
              
              // Verify data integrity
              db.all('SELECT COUNT(*) as count FROM lockers', (err, rows) => {
                if (err) {
                  reject(err);
                  return;
                }
                
                const newCount = rows[0].count;
                if (newCount === lockerCount) {
                  console.log('✅ Data integrity preserved in staging');
                  resolve();
                } else {
                  reject(new Error(`Data integrity compromised: ${lockerCount} -> ${newCount}`));
                }
              });
            }
          });
        });
      });
    }).finally(() => {
      db.close();
    });
  }

  async testRollbackOnStaging() {
    console.log('🔄 Testing rollback on staging database...');
    
    const MigrationRollback = require('./rollback-smart-assignment-migration.js');
    const rollback = new MigrationRollback(this.stagingDbPath);
    
    try {
      await rollback.performRollback();
      console.log('✅ Staging rollback test successful');
    } catch (error) {
      console.error('❌ Staging rollback test failed:', error.message);
      throw error;
    }
  }

  async cleanup() {
    if (fs.existsSync(this.stagingDbPath)) {
      fs.unlinkSync(this.stagingDbPath);
      console.log('🧹 Staging database cleaned up');
    }
  }

  async runStagingTests() {
    try {
      console.log('🚀 Starting Staging Migration Tests\n');
      
      await this.createStagingCopy();
      await this.testMigrationOnStaging();
      await this.testRollbackOnStaging();
      
      console.log('\n🎉 All staging tests passed!');
      console.log('✅ Migration is production-ready');
      
    } catch (error) {
      console.error('\n💥 Staging test failed:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Run staging tests if called directly
if (require.main === module) {
  const stagingTest = new StagingMigrationTest();
  stagingTest.runStagingTests().catch(error => {
    console.error('Staging tests failed:', error.message);
    process.exit(1);
  });
}

module.exports = StagingMigrationTest;