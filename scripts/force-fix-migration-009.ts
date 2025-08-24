#!/usr/bin/env tsx

import { DatabaseConnection } from '../shared/database/connection';

async function forceFix009Migration() {
  console.log('🔧 Force fixing migration 009 by creating sessions table directly...\n');

  try {
    const db = DatabaseConnection.getInstance();
    
    console.log('📋 Creating sessions table directly...');
    
    // Create the sessions table directly without any triggers
    await db.exec(`
      -- Sessions Table for SQLite Session Storage
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        user_agent TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        csrf_token TEXT NOT NULL,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        renewal_count INTEGER DEFAULT 0,
        max_renewals INTEGER DEFAULT 5,
        FOREIGN KEY (user_id) REFERENCES staff_users(id) ON DELETE CASCADE
      );
    `);
    
    console.log('✅ Sessions table created successfully');
    
    console.log('📋 Creating indexes...');
    
    // Create indexes
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
    `);
    
    console.log('✅ Indexes created successfully');
    
    // Mark migration as applied
    console.log('📋 Marking migration 009 as applied...');
    
    const checksum = 'force_applied_' + Date.now();
    
    await db.run(`
      INSERT OR REPLACE INTO schema_migrations (id, filename, checksum, applied_at) 
      VALUES (9, '009_sessions_table.sql', ?, CURRENT_TIMESTAMP)
    `, [checksum]);
    
    console.log('✅ Migration 009 marked as applied');
    
    // Verify the table was created
    const tableInfo = await db.all("PRAGMA table_info(sessions)");
    console.log('\n📊 Sessions table structure:');
    tableInfo.forEach((column: any) => {
      console.log(`  - ${column.name} (${column.type})`);
    });
    
    console.log('\n🎉 Migration 009 force-fixed successfully!');
    console.log('You can now run: npm run migrate');
    
  } catch (error) {
    console.error('❌ Failed to force fix migration:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.getInstance().close();
  }
}

forceFix009Migration();