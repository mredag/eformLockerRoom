#!/usr/bin/env node

/**
 * Debug script to test database response using the existing infrastructure
 */

const path = require('path');

async function testDatabaseDirect() {
  console.log('🔍 Testing Database Response Using Existing Infrastructure...');
  console.log('========================================================');
  
  try {
    // Import the database connection class
    const { DatabaseConnection } = require('./shared/dist/database/connection.js');
    
    // Get database instance
    const dbPath = path.join(__dirname, 'data', 'eform.db');
    console.log(`📁 Database path: ${dbPath}`);
    
    const db = DatabaseConnection.getInstance(dbPath);
    await db.waitForInitialization();
    
    // Test the exact query used by getAllLockers
    const query = 'SELECT * FROM lockers WHERE kiosk_id = ? ORDER BY kiosk_id, id';
    const kioskId = 'K1';
    
    console.log(`🔍 Running query: ${query}`);
    console.log(`📊 Parameters: kioskId = "${kioskId}"`);
    
    const result = await db.all(query, [kioskId]);
    
    console.log(`📊 Raw database result:`, result);
    console.log(`📊 Result type:`, typeof result);
    console.log(`📊 Is array:`, Array.isArray(result));
    console.log(`📊 Length:`, result ? result.length : 'N/A');
    
    if (result && result.length > 0) {
      console.log(`📊 First locker:`, result[0]);
    }
    
    // Test with different kiosk IDs
    const testKiosks = ['K1', 'kiosk-1', 'KIOSK1'];
    
    for (const testKioskId of testKiosks) {
      console.log(`\n🔍 Testing with kioskId: "${testKioskId}"`);
      const testResult = await db.all(query, [testKioskId]);
      console.log(`📊 Result count: ${testResult ? testResult.length : 'null/undefined'}`);
      console.log(`📊 Result type: ${typeof testResult}`);
      console.log(`📊 Is array: ${Array.isArray(testResult)}`);
    }
    
    // Check what kiosk IDs actually exist
    console.log(`\n🔍 Checking existing kiosk IDs...`);
    const allKiosks = await db.all('SELECT DISTINCT kiosk_id FROM lockers ORDER BY kiosk_id');
    console.log(`📊 Existing kiosk IDs:`, allKiosks);
    
    // Check total locker count
    const totalCount = await db.get('SELECT COUNT(*) as count FROM lockers');
    console.log(`📊 Total lockers in database:`, totalCount);
    
    // Test the LockerStateManager directly
    console.log(`\n🔍 Testing LockerStateManager directly...`);
    const { DatabaseManager } = require('./shared/dist/database/database-manager.js');
    const { LockerStateManager } = require('./shared/dist/services/locker-state-manager.js');
    
    const dbManager = new DatabaseManager(dbPath);
    await dbManager.initialize();
    
    const lockerStateManager = new LockerStateManager(dbManager);
    
    const managedResult = await lockerStateManager.getAllLockers('K1');
    console.log(`📊 LockerStateManager result:`, managedResult);
    console.log(`📊 LockerStateManager result type:`, typeof managedResult);
    console.log(`📊 LockerStateManager is array:`, Array.isArray(managedResult));
    console.log(`📊 LockerStateManager length:`, managedResult ? managedResult.length : 'N/A');
    
    await db.close();
    
  } catch (error) {
    console.log(`❌ Database test failed:`, error.message);
    console.log(`❌ Error details:`, error);
    console.log(`❌ Stack trace:`, error.stack);
  }
}

// Run the test
testDatabaseDirect().catch(console.error);