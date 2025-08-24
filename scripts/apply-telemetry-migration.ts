#!/usr/bin/env tsx

import { DatabaseConnection } from '../shared/database/connection';
import { readFileSync } from 'fs';
import { join } from 'path';

async function applyTelemetryMigration() {
  console.log('🔧 Applying kiosk telemetry migration...');
  
  const db = DatabaseConnection.getInstance();
  
  try {
    // Read the migration file
    const migrationPath = join(__dirname, '../migrations/013_kiosk_telemetry.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    // Clean up the SQL and split by semicolon
    const cleanSQL = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--') && line.trim().length > 0)
      .join('\n');
    
    const statements = cleanSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    console.log(`📝 Executing ${statements.length} migration statements...`);
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`   Executing: ${statement.substring(0, 50)}...`);
        console.log(`   Full statement: ${statement}`);
        await db.run(statement);
      }
    }
    
    console.log('✅ Telemetry migration applied successfully!');
    
    // Verify the migration
    console.log('🔍 Verifying migration...');
    
    // Check if telemetry columns were added
    const tableInfo = await db.all("PRAGMA table_info(kiosk_heartbeat)");
    const telemetryDataColumn = tableInfo.find((col: any) => col.name === 'telemetry_data');
    const telemetryUpdateColumn = tableInfo.find((col: any) => col.name === 'last_telemetry_update');
    
    if (telemetryDataColumn && telemetryUpdateColumn) {
      console.log('✅ Telemetry columns added to kiosk_heartbeat table');
    } else {
      console.error('❌ Failed to add telemetry columns');
      process.exit(1);
    }
    
    // Check if telemetry_history table was created
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='telemetry_history'");
    if (tables.length > 0) {
      console.log('✅ telemetry_history table created');
    } else {
      console.error('❌ Failed to create telemetry_history table');
      process.exit(1);
    }
    
    console.log('🎉 Telemetry migration verification completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  applyTelemetryMigration().catch(console.error);
}

export { applyTelemetryMigration };