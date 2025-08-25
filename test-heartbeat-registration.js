const { DatabaseConnection } = require('./shared/dist/database/connection');
const { KioskHeartbeatRepository } = require('./shared/dist/database/kiosk-heartbeat-repository');

async function testHeartbeatRegistration() {
  try {
    console.log('=== Testing Heartbeat Registration ===\n');
    
    const db = DatabaseConnection.getInstance();
    await db.waitForInitialization();
    console.log('✅ Database connected');
    
    const repo = new KioskHeartbeatRepository(db);
    
    // Test 1: First registration (should succeed)
    console.log('\n1. First registration attempt...');
    try {
      const result1 = await repo.registerKiosk('kiosk-1', 'main', '1.0.0', 'hw-123');
      console.log('✅ First registration succeeded:', result1.kiosk_id);
    } catch (error) {
      console.error('❌ First registration failed:', error.message);
      console.error('Error code:', error.code);
      console.error('Full error:', error);
    }
    
    // Test 2: Second registration (should update existing)
    console.log('\n2. Second registration attempt (should update)...');
    try {
      console.log('About to call registerKiosk again...');
      const result2 = await repo.registerKiosk('kiosk-1', 'main', '1.0.0', 'hw-123');
      console.log('✅ Second registration succeeded:', result2.kiosk_id);
    } catch (error) {
      console.error('❌ Second registration failed:', error.message);
      console.error('Error code:', error.code);
      console.error('Error includes UNIQUE:', error.message.includes('UNIQUE constraint failed'));
      console.error('Full error:', error);
    }
    
    // Test 3: Check what's in the database
    console.log('\n3. Checking database contents...');
    const allKiosks = await db.all('SELECT * FROM kiosk_heartbeat');
    console.log('Kiosk records:', allKiosks);
    
    await db.close();
    console.log('\n=== Test completed ===');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testHeartbeatRegistration();