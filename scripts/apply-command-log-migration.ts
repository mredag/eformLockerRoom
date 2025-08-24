#!/usr/bin/env tsx

import { DatabaseConnection } from '../shared/database/connection';
import { readFileSync } from 'fs';
import { join } from 'path';

async function applyCommandLogMigration() {
  console.log('🔄 Applying command_log table migration...\n');

  try {
    const db = DatabaseConnection.getInstance();
    
    // Check if command_log table exists
    const tableExists = await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='command_log'"
    );

    if (tableExists) {
      console.log('✅ command_log table already exists');
      return;
    }

    // Read and execute the migration
    const migrationPath = join(process.cwd(), 'migrations', '014_command_log_table.sql');
    const migrationSql = readFileSync(migrationPath, 'utf8');
    
    console.log('📝 Creating command_log table...');
    await db.exec(migrationSql);
    
    console.log('✅ command_log table created successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.getInstance().close();
  }
}

applyCommandLogMigration();