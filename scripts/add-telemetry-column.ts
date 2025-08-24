#!/usr/bin/env tsx

import { DatabaseConnection } from '../shared/database/connection';

async function addTelemetryColumn() {
  console.log('🔧 Adding telemetry_data column to kiosk_heartbeat table...');
  
  const db = DatabaseConnection.getInstance();
  
  try {
    // Check if the column already exists
    const tableInfo = await db.all("PRAGMA table_info(kiosk_heartbeat)");
    const telemetryDataColumn = tableInfo.find((col: any) => col.name === 'telemetry_data');
    
    if (telemetryDataColumn) {
      console.log('✅ telemetry_data column already exists');
      return;
    }
    
    // Add the column
    await db.run('ALTER TABLE kiosk_heartbeat ADD COLUMN telemetry_data TEXT');
    console.log('✅ telemetry_data column added successfully');
    
  } catch (error) {
    console.error('❌ Failed to add telemetry_data column:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run if this script is executed directly
if (require.main === module) {
  addTelemetryColumn().catch(console.error);
}

export { addTelemetryColumn };