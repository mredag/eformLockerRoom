/**
 * Simple test script to verify basic reporting functionality
 */

const { ReportingService } = require('./shared/services/reporting-service');
const Database = require('sqlite3').Database;

async function testBasicReporting() {
  console.log('Testing basic reporting functionality...');
  
  // Create in-memory database for testing
  const db = new Database(':memory:');
  
  // Create test tables
  await new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create events table
      db.run(`
        CREATE TABLE events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          kiosk_id TEXT NOT NULL,
          locker_id INTEGER,
          event_type TEXT NOT NULL,
          rfid_card TEXT,
          device_id TEXT,
          staff_user TEXT,
          details TEXT
        )
      `, (err) => {
        if (err) reject(err);
      });
      
      // Create lockers table
      db.run(`
        CREATE TABLE lockers (
          kiosk_id TEXT NOT NULL,
          id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'Free',
          owner_type TEXT,
          owner_key TEXT,
          reserved_at DATETIME,
          owned_at DATETIME,
          version INTEGER NOT NULL DEFAULT 1,
          is_vip BOOLEAN NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (kiosk_id, id)
        )
      `, (err) => {
        if (err) reject(err);
      });
      
      // Insert test data
      const today = new Date().toISOString().split('T')[0];
      
      // Insert test events
      db.run(`INSERT INTO events (timestamp, kiosk_id, locker_id, event_type, rfid_card) VALUES 
        ('${today} 10:00:00', 'kiosk1', 1, 'rfid_assign', 'CARD123'),
        ('${today} 11:00:00', 'kiosk1', 2, 'qr_assign', NULL),
        ('${today} 12:00:00', 'kiosk1', 3, 'staff_open', NULL)
      `, (err) => {
        if (err) reject(err);
      });
      
      // Insert test lockers
      db.run(`INSERT INTO lockers (kiosk_id, id, status, is_vip) VALUES 
        ('kiosk1', 1, 'Owned', 0),
        ('kiosk1', 2, 'Free', 0),
        ('kiosk1', 3, 'Blocked', 0),
        ('kiosk1', 4, 'Owned', 1),
        ('kiosk1', 5, 'Free', 0)
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
  
  const reportingService = new ReportingService(db);
  
  try {
    // Test daily usage
    console.log('Testing daily usage...');
    const today = new Date().toISOString().split('T')[0];
    const dailyUsage = await reportingService.getDailyUsage(today);
    console.log('Daily usage:', dailyUsage);
    
    // Test locker status overview
    console.log('Testing locker status overview...');
    const lockerStatus = await reportingService.getLockerStatusOverview();
    console.log('Locker status:', lockerStatus);
    
    // Test basic statistics
    console.log('Testing basic statistics...');
    const statistics = await reportingService.getBasicStatistics();
    console.log('Basic statistics:', statistics);
    
    // Test CSV export
    console.log('Testing CSV export...');
    const csvData = await reportingService.exportDailyEventsCSV(today);
    console.log('CSV data:', csvData);
    
    const csvContent = reportingService.formatCSV(csvData);
    console.log('CSV content preview:', csvContent.substring(0, 200) + '...');
    
    console.log('✅ All basic reporting tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    db.close();
  }
}

testBasicReporting();