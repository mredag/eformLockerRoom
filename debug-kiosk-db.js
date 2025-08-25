const { DatabaseConnection } = require('./shared/dist/database/connection');
const { LockerStateManager } = require('./shared/dist/services/locker-state-manager');

async function debugKioskDatabase() {
  try {
    console.log('=== Debugging Kiosk Database Issue ===\n');
    
    // Test 1: Direct database connection
    console.log('1. Testing direct database connection...');
    const db = DatabaseConnection.getInstance();
    await db.waitForInitialization();
    console.log('✅ Database connected');
    console.log('Database path:', db.getDatabasePath());
    
    // Test 2: Check if lockers table exists
    console.log('\n2. Checking lockers table...');
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='lockers'");
    console.log('Lockers table exists:', tables.length > 0);
    
    // Test 3: Check existing lockers
    console.log('\n3. Checking existing lockers...');
    const allLockers = await db.all("SELECT kiosk_id, COUNT(*) as count FROM lockers GROUP BY kiosk_id");
    console.log('Lockers by kiosk_id:', allLockers);
    
    // Test 4: Test LockerStateManager initialization
    console.log('\n4. Testing LockerStateManager...');
    const lockerStateManager = new LockerStateManager();
    
    // Test 5: Try to get kiosk-1 lockers
    console.log('\n5. Getting kiosk-1 lockers...');
    const kiosk1Lockers = await lockerStateManager.getKioskLockers('kiosk-1');
    console.log('kiosk-1 lockers count:', kiosk1Lockers.length);
    
    // Test 6: Try the exact same call that fails in kiosk service
    console.log('\n6. Testing initializeKioskLockers...');
    try {
      await lockerStateManager.initializeKioskLockers('kiosk-1', 30);
      console.log('✅ initializeKioskLockers succeeded');
    } catch (error) {
      console.error('❌ initializeKioskLockers failed:', error.message);
      console.error('Error details:', error);
    }
    
    await db.close();
    console.log('\n=== Debug completed ===');
    
  } catch (error) {
    console.error('Debug failed:', error);
    process.exit(1);
  }
}

debugKioskDatabase();