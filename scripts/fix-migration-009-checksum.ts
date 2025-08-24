#!/usr/bin/env tsx

import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { DatabaseConnection } from '../shared/database/connection';

async function fixMigration009Checksum() {
  console.log('🔧 Fixing migration 009 checksum after trigger removal...\n');

  try {
    const db = DatabaseConnection.getInstance();
    
    // Calculate current checksum for 009_sessions_table.sql
    const migrationPath = join('./migrations', '009_sessions_table.sql');
    const content = readFileSync(migrationPath, 'utf8');
    const currentChecksum = createHash('sha256').update(content).digest('hex');
    
    console.log(`📄 Migration file: 009_sessions_table.sql`);
    console.log(`🔢 New checksum: ${currentChecksum}`);
    
    // Check if migration exists in database
    const migration = await db.get(
      'SELECT * FROM schema_migrations WHERE filename = ?',
      ['009_sessions_table.sql']
    );
    
    if (migration) {
      console.log(`📋 Migration already applied, updating checksum...`);
      
      // Update the checksum in the database
      await db.run(
        'UPDATE schema_migrations SET checksum = ? WHERE filename = ?',
        [currentChecksum, '009_sessions_table.sql']
      );
      
      console.log('✅ Checksum updated successfully');
    } else {
      console.log('📋 Migration not yet applied - checksum will be set during migration');
    }
    
  } catch (error) {
    console.error('❌ Failed to fix migration checksum:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.getInstance().close();
  }
}

fixMigration009Checksum();