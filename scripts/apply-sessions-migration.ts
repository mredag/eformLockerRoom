#!/usr/bin/env tsx

import { DatabaseConnection } from '../shared/database/connection';
import { readFileSync } from 'fs';
import { join } from 'path';

async function applySessionsMigration() {
  console.log('🔄 Applying sessions table migration...\n');

  try {
    const db = DatabaseConnection.getInstance();
    
    // Check if sessions table already exists
    const tableExists = await db.get(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='sessions'
    `);

    if (tableExists) {
      console.log('✅ Sessions table already exists');
      return;
    }

    console.log('📝 Creating sessions table...');

    // Read and execute the migration
    const migrationPath = join(process.cwd(), 'migrations', '009_sessions_table.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    await db.beginTransaction();
    
    try {
      await db.exec(migrationSQL);
      
      // Record the migration as applied
      await db.run(`
        INSERT INTO schema_migrations (id, filename, checksum) 
        VALUES (9, '009_sessions_table.sql', ?)
      `, ['manual_application_' + Date.now()]);
      
      await db.commit();
      console.log('✅ Sessions table created successfully');
      
      // Verify the table was created
      const verification = await db.get(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='sessions'
      `);
      
      if (verification) {
        console.log('✅ Sessions table verified');
      } else {
        throw new Error('Sessions table not found after creation');
      }
      
    } catch (error) {
      await db.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.getInstance().close();
  }
}

applySessionsMigration();