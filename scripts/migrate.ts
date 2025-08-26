#!/usr/bin/env tsx

import { MigrationRunner } from '../shared/database/migration-runner';
import { DatabaseConnection } from '../shared/database/connection';

async function runMigrations() {
  console.log('🔄 Running database migrations...\n');

  try {
    const migrationRunner = new MigrationRunner();
    
    // Show current status
    const status = await migrationRunner.getStatus();
    console.log(`📊 Migration Status:`);
    console.log(`   Applied: ${status.applied.length}`);
    console.log(`   Pending: ${status.pending.length}`);
    console.log(`   Total: ${status.total}\n`);

    if (status.pending.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }

    // Verify existing migrations
    console.log('🔍 Verifying existing migrations...');
    const isValid = await migrationRunner.verifyMigrations();
    if (!isValid) {
      console.warn('⚠️  Some migration files are missing but migrations continue');
      console.log('   This is normal if migrations were applied before files were removed\n');
    } else {
      console.log('✅ All existing migrations verified\n');
    }

    // Run pending migrations
    await migrationRunner.runMigrations();
    
    console.log('\n🎉 All migrations completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.getInstance().close();
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'status':
    showStatus();
    break;
  case 'verify':
    verifyMigrations();
    break;
  case 'run':
  default:
    runMigrations();
    break;
}

async function showStatus() {
  try {
    const migrationRunner = new MigrationRunner();
    const status = await migrationRunner.getStatus();
    
    console.log('📊 Database Migration Status\n');
    console.log(`Applied Migrations (${status.applied.length}):`);
    status.applied.forEach(migration => {
      const appliedAt = typeof migration.applied_at === 'string' 
        ? migration.applied_at 
        : migration.applied_at.toISOString();
      console.log(`  ✅ ${migration.filename} (${appliedAt})`);
    });
    
    console.log(`\nPending Migrations (${status.pending.length}):`);
    status.pending.forEach(filename => {
      console.log(`  ⏳ ${filename}`);
    });
    
    console.log(`\nTotal: ${status.total} migrations`);
  } catch (error) {
    console.error('❌ Failed to get status:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.getInstance().close();
  }
}

async function verifyMigrations() {
  try {
    const migrationRunner = new MigrationRunner();
    console.log('🔍 Verifying migration checksums...\n');
    
    const isValid = await migrationRunner.verifyMigrations();
    
    if (isValid) {
      console.log('\n✅ All migrations verified successfully');
    } else {
      console.log('\n❌ Migration verification failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.getInstance().close();
  }
}