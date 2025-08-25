#!/usr/bin/env node

/**
 * Debug script to test database response directly
 */

const path = require('path');
const Database = require('better-sqlite3');

async function testDatabaseResponse() {
  console.log('🔍 Testing Database Response Directly...');
  console.log('=====================================');
  
  try {
    // Try to connect to the database
    const dbPath = path.join(__dirname, 'data', 'lockroom.db');
    console.log(`📁 Database path: ${dbPath}`);
    
    const db = new Database(dbPath, { readonly: true });
    
    // Test the exact query used by getAllLockers
    const query = 'SELECT * FROM lockers WHERE kiosk_id = ? ORDER BY kiosk_id, id';
    const kioskId = 'K1';
    
    console.log(`🔍 Running query: ${query}`);
    console.log(`📊 Parameters: kioskId = "${kioskId}"`);
    
    const result = db.prepare(query).all(kioskId);
    
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
      const testResult = db.prepare(query).all(testKioskId);
      console.log(`📊 Result count: ${testResult ? testResult.length : 'null/undefined'}`);
      console.log(`📊 Result type: ${typeof testResult}`);
      console.log(`📊 Is array: ${Array.isArray(testResult)}`);
    }
    
    // Check what kiosk IDs actually exist
    console.log(`\n🔍 Checking existing kiosk IDs...`);
    const allKiosks = db.prepare('SELECT DISTINCT kiosk_id FROM lockers ORDER BY kiosk_id').all();
    console.log(`📊 Existing kiosk IDs:`, allKiosks);
    
    // Check total locker count
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM lockers').get();
    console.log(`📊 Total lockers in database:`, totalCount);
    
    db.close();
    
  } catch (error) {
    console.log(`❌ Database test failed:`, error.message);
    console.log(`❌ Error details:`, error);
  }
}

// Run the test
testDatabaseResponse().catch(console.error);