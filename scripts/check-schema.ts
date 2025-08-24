#!/usr/bin/env tsx

import { DatabaseConnection } from '../shared/database/connection';

async function checkSchema() {
  console.log('🔍 Checking current database schema...');
  
  const db = DatabaseConnection.getInstance();
  
  try {
    // Check kiosk_heartbeat table structure
    const tableInfo = await db.all("PRAGMA table_info(kiosk_heartbeat)");
    console.log('\n📋 kiosk_heartbeat table columns:');
    tableInfo.forEach((col: any) => {
      console.log(`   ${col.name} (${col.type}) - ${col.notnull ? 'NOT NULL' : 'NULL'} - Default: ${col.dflt_value || 'None'}`);
    });
    
    // Check if telemetry_history table exists
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='telemetry_history'");
    console.log(`\n📋 telemetry_history table exists: ${tables.length > 0 ? 'YES' : 'NO'}`);
    
    if (tables.length > 0) {
      const historyTableInfo = await db.all("PRAGMA table_info(telemetry_history)");
      console.log('\n📋 telemetry_history table columns:');
      historyTableInfo.forEach((col: any) => {
        console.log(`   ${col.name} (${col.type}) - ${col.notnull ? 'NOT NULL' : 'NULL'} - Default: ${col.dflt_value || 'None'}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Schema check failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run the schema check if this script is executed directly
if (require.main === module) {
  checkSchema().catch(console.error);
}

export { checkSchema };