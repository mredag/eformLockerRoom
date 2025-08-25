const { DatabaseConnection } = require('./shared/dist/database/connection');
const { LockerStateManager } = require('./shared/dist/services/locker-state-manager');

async function testKioskDatabase() {
  try {
    console.log('Testing kiosk database connection...');
    
    const db = DatabaseConnection.getInstance();
    await db.waitForInitialization();
    
    console.log('Database connected successfully');
    
    // Test if lockers table exists
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='lockers'");
    console.log('Lockers table exists:', tables.length > 0);
    
    if (tables.length > 0) {
      // Test getting lockers
      const lockers = await db.all("SELECT * FROM lockers LIMIT 5");
      console.log('Sample lockers:', lockers);
      
      // Test LockerStateManager
      const lockerStateManager = new LockerStateManager();
      const kioskLockers = await lockerStateManager.getKioskLockers('KIOSK-001');
      console.log('Kiosk lockers count:', kioskLockers.length);
    }
    
    await db.close();
    console.log('Test completed successfully');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testKioskDatabase();