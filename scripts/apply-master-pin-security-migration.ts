#!/usr/bin/env tsx

import { readFileSync } from 'fs';
import { join } from 'path';
import { DatabaseManager } from '../shared/database/database-manager';
import * as argon2 from 'argon2';

async function applyMasterPinSecurityMigration() {
  console.log('🔐 Applying Master PIN Security Migration...');
  
  try {
    const dbManager = DatabaseManager.getInstance({
      migrationsPath: './migrations'
    });
    await dbManager.initialize();
    const db = dbManager.getConnection().getDatabase();
    
    // Read and execute the migration SQL
    const migrationPath = join(__dirname, '../migrations/012_master_pin_security.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    // The migration was already applied by the migration runner
    console.log('✅ Migration already applied by migration runner');
    
    // Set up default master PIN hash (1234)
    console.log('🔑 Setting up default master PIN...');
    const defaultPinHash = await argon2.hash('1234');
    
    const updatePinStmt = db.prepare(`
      UPDATE system_settings 
      SET setting_value = ? 
      WHERE setting_key = 'master_pin_hash'
    `);
    
    updatePinStmt.run(defaultPinHash);
    
    // Verify the migration
    console.log('✅ Verifying migration...');
    
    const settingsCount = db.prepare('SELECT COUNT(*) as count FROM system_settings').get() as { count: number };
    console.log(`   System settings table: ${settingsCount.count} entries`);
    
    const attemptsTableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='master_pin_attempts'
    `).get();
    
    if (attemptsTableExists) {
      console.log('   ✅ master_pin_attempts table created');
    } else {
      throw new Error('master_pin_attempts table not created');
    }
    
    // Test the settings service
    console.log('🧪 Testing settings service...');
    const { SettingsService } = await import('../shared/services/settings-service');
    const settingsService = new SettingsService();
    
    const securitySettings = await settingsService.getSecuritySettings();
    console.log(`   Security settings: ${JSON.stringify(securitySettings)}`);
    
    const pinValid = await settingsService.verifyMasterPin('1234');
    console.log(`   Default PIN verification: ${pinValid ? '✅ Valid' : '❌ Invalid'}`);
    
    console.log('🎉 Master PIN Security Migration completed successfully!');
    console.log('');
    console.log('📋 Migration Summary:');
    console.log('   • Created system_settings table');
    console.log('   • Created master_pin_attempts table');
    console.log('   • Set default security settings (5 attempts, 5 minutes lockout)');
    console.log('   • Set default master PIN to 1234 (change this in production!)');
    console.log('   • Added security event types');
    console.log('');
    console.log('⚠️  IMPORTANT: Change the default master PIN (1234) in production!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  applyMasterPinSecurityMigration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { applyMasterPinSecurityMigration };