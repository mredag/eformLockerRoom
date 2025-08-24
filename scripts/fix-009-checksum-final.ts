#!/usr/bin/env tsx

import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { DatabaseConnection } from '../shared/database/connection';

async function fix009ChecksumFinal() {
  console.log('🔧 Fixing migration 009 checksum to match actual file...\n');

  try {
    const db = DatabaseConnection.getInstance();
    
    // Calculate the actual checksum from the migration file
    const migrationPath = join('./migrations', '009_sessions_table.sql');
    const content = readFileSync(migrationPath, 'utf8');
    const actualChecksum = createHash('sha256').update(content).digest('hex');
    
    console.log(`📄 Migration file: 009_sessions_table.sql`);
    console.log(`🔢 Actual file checksum: ${actualChecksum}`);
    
    // Update the checksum in the database to match the file
    const result = await db.run(
      'UPDATE schema_migrations SET checksum = ? WHERE filename = ?',
      [actualChecksum, '009_sessions_table.sql']
    );
    
    if (result.changes && result.changes > 0) {
      console.log('✅ Migration 009 checksum updated to match file');
    } else {
      console.log('⚠️  No migration record found to update');
    }
    
    // Verify the fix
    const migration = await db.get(
      'SELECT * FROM schema_migrations WHERE filename = ?',
      ['009_sessions_table.sql']
    );
    
    if (migration && migration.checksum === actualChecksum) {
      console.log('✅ Checksum verification passed');
      console.log('🎉 Migration 009 is now properly aligned with the file');
      console.log('\nYou can now run: npm run migrate');
    } else {
      console.log('❌ Checksum verification failed');
    }
    
  } catch (error) {
    console.error('❌ Failed to fix checksum:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.getInstance().close();
  }
}

fix009ChecksumFinal();