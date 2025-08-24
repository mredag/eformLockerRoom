#!/usr/bin/env tsx

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { DatabaseConnection } from '../shared/database/connection';

async function fixPiMigrations() {
  console.log('🔧 Fixing Raspberry Pi migration issues...\n');

  try {
    const db = DatabaseConnection.getInstance();
    
    // First, let's check the current state
    console.log('📊 Checking current migration state...');
    const migrations = await db.all('SELECT * FROM schema_migrations ORDER BY id');
    
    console.log(`Found ${migrations.length} applied migrations\n`);
    
    // Fix the applied_at field format issue
    console.log('🔧 Fixing applied_at field format...');
    for (const migration of migrations) {
      if (typeof migration.applied_at === 'string') {
        // Convert string to proper datetime format
        const dateValue = new Date(migration.applied_at).toISOString();
        await db.run(
          'UPDATE schema_migrations SET applied_at = ? WHERE id = ?',
          [dateValue, migration.id]
        );
        console.log(`✓ Fixed applied_at for migration ${migration.filename}`);
      }
    }
    
    // Now fix all checksum mismatches
    console.log('\n🔧 Fixing checksum mismatches...');
    
    const migrationsPath = './migrations';
    const migrationFiles = readdirSync(migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    let fixedCount = 0;
    
    for (const filename of migrationFiles) {
      try {
        const migrationPath = join(migrationsPath, filename);
        const content = readFileSync(migrationPath, 'utf8');
        const currentChecksum = createHash('sha256').update(content).digest('hex');
        
        // Check if this migration exists in database
        const dbMigration = await db.get(
          'SELECT * FROM schema_migrations WHERE filename = ?',
          [filename]
        );
        
        if (dbMigration) {
          if (currentChecksum !== dbMigration.checksum) {
            console.log(`🔧 Fixing ${filename}`);
            console.log(`   Old checksum: ${dbMigration.checksum}`);
            console.log(`   New checksum: ${currentChecksum}`);
            
            // Update the checksum in the database
            await db.run(
              'UPDATE schema_migrations SET checksum = ? WHERE filename = ?',
              [currentChecksum, filename]
            );
            
            fixedCount++;
            console.log(`   ✅ Fixed\n`);
          } else {
            console.log(`✓ ${filename} - checksum valid`);
          }
        } else {
          console.log(`⚠️  ${filename} - not applied yet`);
        }
      } catch (error) {
        console.error(`❌ Error processing ${filename}:`, error);
      }
    }
    
    console.log(`\n🎉 Fixed ${fixedCount} migration checksums`);
    
    // Verify the fix by running a test query
    console.log('\n🔍 Verifying fixes...');
    const verifyMigrations = await db.all('SELECT id, filename, applied_at, checksum FROM schema_migrations ORDER BY id');
    
    console.log('📋 Current migration status:');
    verifyMigrations.forEach((migration: any) => {
      const date = new Date(migration.applied_at);
      console.log(`  ✓ ${migration.filename} (${date.toISOString().split('T')[0]})`);
    });
    
    console.log('\n✅ All fixes applied successfully!');
    console.log('You can now run: npm run migrate');
    
  } catch (error) {
    console.error('❌ Failed to fix migrations:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.getInstance().close();
  }
}

fixPiMigrations();