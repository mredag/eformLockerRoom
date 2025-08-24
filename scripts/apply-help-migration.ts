#!/usr/bin/env tsx

import { DatabaseConnection } from '../shared/database/connection.js';
import { readFileSync } from 'fs';
import { join } from 'path';

async function applyHelpMigration() {
  console.log('🔄 Applying help requests migration...\n');

  try {
    const db = DatabaseConnection.getInstance();
    await db.waitForInitialization();

    // Read the migration file
    const migrationPath = join(process.cwd(), 'migrations', '010_help_requests_table.sql');
    const migrationSql = readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration content:');
    console.log(migrationSql);
    console.log('\n🔄 Executing migration...');

    // Execute the migration
    await db.exec(migrationSql);

    console.log('✅ Help requests migration applied successfully!');

    // Verify the table was created
    const tableInfo = await db.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='help_requests'
    `);

    if (tableInfo.length > 0) {
      console.log('✅ help_requests table created successfully');
      
      // Show table structure
      const columns = await db.all(`PRAGMA table_info(help_requests)`);
      console.log('\n📋 Table structure:');
      columns.forEach((col: any) => {
        console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
      });
    } else {
      console.error('❌ help_requests table was not created');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.getInstance().close();
  }
}

applyHelpMigration();