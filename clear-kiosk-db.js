const { DatabaseManager } = require('./shared/database/database-manager.js');

async function clearKioskRegistration() {
  try {
    const dbManager = DatabaseManager.getInstance({
      migrationsPath: './migrations'
    });
    await dbManager.initialize();
    
    const db = dbManager.getConnection();
    
    // Clear existing kiosk registration
    const result = db.prepare('DELETE FROM kiosk_heartbeat WHERE kiosk_id = ?').run('kiosk-1');
    console.log(`Deleted ${result.changes} kiosk registration(s)`);
    
    // Show remaining kiosks
    const kiosks = db.prepare('SELECT * FROM kiosk_heartbeat').all();
    console.log('Remaining kiosks:', kiosks);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

clearKioskRegistration();