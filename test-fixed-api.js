#!/usr/bin/env node

/**
 * Test the fixed API with the correct kiosk ID
 */

async function testFixedAPI() {
  console.log('🔍 Testing Fixed API with Correct Kiosk ID...');
  console.log('============================================');
  
  try {
    // Import the database infrastructure
    const { DatabaseManager } = require('./shared/dist/database/database-manager.js');
    const { LockerStateManager } = require('./shared/dist/services/locker-state-manager.js');
    
    // Initialize database manager
    const dbPath = './data/eform.db';
    const dbManager = new DatabaseManager({ path: dbPath });
    await dbManager.initialize();
    
    // Create locker state manager
    const lockerStateManager = new LockerStateManager(dbManager);
    
    // Test with the correct kiosk ID that exists in the database
    console.log(`🔍 Testing with kioskId: "kiosk-1"`);
    const result = await lockerStateManager.getAllLockers('kiosk-1');
    
    console.log(`📊 LockerStateManager result type:`, typeof result);
    console.log(`📊 LockerStateManager is array:`, Array.isArray(result));
    console.log(`📊 LockerStateManager length:`, result ? result.length : 'N/A');
    
    if (result && result.length > 0) {
      console.log(`📊 First locker:`, result[0]);
      console.log(`📊 Sample locker structure:`, {
        id: result[0].id,
        kiosk_id: result[0].kiosk_id,
        status: result[0].status,
        is_vip: result[0].is_vip
      });
    }
    
    // Test the API response format that would be sent to the client
    const apiResponse = {
      lockers: result,
      total: result.length
    };
    
    console.log(`\n📤 API Response Format:`);
    console.log(`📊 Response structure:`, {
      hasLockers: 'lockers' in apiResponse,
      lockersType: typeof apiResponse.lockers,
      lockersIsArray: Array.isArray(apiResponse.lockers),
      lockersLength: apiResponse.lockers ? apiResponse.lockers.length : 'N/A',
      hasTotal: 'total' in apiResponse,
      totalValue: apiResponse.total
    });
    
    console.log(`✅ API Response JSON:`, JSON.stringify(apiResponse, null, 2));
    
  } catch (error) {
    console.log(`❌ Test failed:`, error.message);
    console.log(`❌ Error details:`, error);
  }
}

// Run the test
testFixedAPI().catch(console.error);