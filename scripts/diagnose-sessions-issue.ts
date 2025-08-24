#!/usr/bin/env tsx

import { DatabaseConnection } from '../shared/database/connection';

async function diagnoseSessions() {
  console.log('🔍 Diagnosing sessions table issue...\n');

  try {
    const db = DatabaseConnection.getInstance();
    
    // Check if sessions table exists
    console.log('📋 Checking if sessions table exists...');
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'");
    
    if (tables.length > 0) {
      console.log('✅ Sessions table exists');
      
      // Get table structure
      const tableInfo = await db.all("PRAGMA table_info(sessions)");
      console.log('\n📊 Current sessions table structure:');
      tableInfo.forEach((column: any) => {
        console.log(`  - ${column.name} (${column.type}) ${column.notnull ? 'NOT NULL' : 'NULL'}`);
      });
      
      // Check indexes
      console.log('\n📋 Checking existing indexes...');
      const indexes = await db.all("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='sessions'");
      if (indexes.length > 0) {
        indexes.forEach((index: any) => {
          console.log(`  - ${index.name}: ${index.sql}`);
        });
      } else {
        console.log('  No indexes found');
      }
      
      // Try to drop the table
      console.log('\n🗑️  Attempting to drop existing sessions table...');
      await db.run('DROP TABLE IF EXISTS sessions');
      console.log('✅ Sessions table dropped');
      
    } else {
      console.log('❌ Sessions table does not exist');
    }
    
    // Check migration status
    console.log('\n📋 Checking migration 009 status...');
    const migration = await db.get("SELECT * FROM schema_migrations WHERE filename = '009_sessions_table.sql'");
    
    if (migration) {
      console.log('⚠️  Migration 009 is marked as applied but table creation failed');
      console.log(`   Applied at: ${migration.applied_at}`);
      console.log(`   Checksum: ${migration.checksum}`);
      
      // Remove the migration record
      console.log('\n🗑️  Removing migration 009 record...');
      await db.run("DELETE FROM schema_migrations WHERE filename = '009_sessions_table.sql'");
      console.log('✅ Migration 009 record removed');
    } else {
      console.log('✅ Migration 009 not yet applied');
    }
    
    // Now try to create the table step by step
    console.log('\n📋 Creating sessions table step by step...');
    
    // Step 1: Create basic table
    await db.run(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        user_agent TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        csrf_token TEXT NOT NULL
      )
    `);
    console.log('✅ Basic sessions table created');
    
    // Step 2: Add additional columns
    await db.run('ALTER TABLE sessions ADD COLUMN last_activity DATETIME DEFAULT CURRENT_TIMESTAMP');
    await db.run('ALTER TABLE sessions ADD COLUMN renewal_count INTEGER DEFAULT 0');
    await db.run('ALTER TABLE sessions ADD COLUMN max_renewals INTEGER DEFAULT 5');
    console.log('✅ Additional columns added');
    
    // Step 3: Create indexes one by one
    await db.run('CREATE INDEX idx_sessions_expires_at ON sessions(expires_at)');
    console.log('✅ expires_at index created');
    
    await db.run('CREATE INDEX idx_sessions_user_id ON sessions(user_id)');
    console.log('✅ user_id index created');
    
    await db.run('CREATE INDEX idx_sessions_last_activity ON sessions(last_activity)');
    console.log('✅ last_activity index created');
    
    await db.run('CREATE INDEX idx_sessions_created_at ON sessions(created_at)');
    console.log('✅ created_at index created');
    
    // Mark migration as applied
    await db.run(`
      INSERT INTO schema_migrations (id, filename, checksum, applied_at) 
      VALUES (9, '009_sessions_table.sql', 'manual_fix_${Date.now()}', CURRENT_TIMESTAMP)
    `);
    console.log('✅ Migration 009 marked as applied');
    
    console.log('\n🎉 Sessions table created successfully!');
    console.log('You can now run: npm run migrate');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.getInstance().close();
  }
}

diagnoseSessions();