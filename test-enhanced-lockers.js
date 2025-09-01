const sqlite3 = require('sqlite3').verbose();

// Mock the database connection and repository (same as before)
class MockDatabaseConnection {
  constructor(db) {
    this.db = db;
  }
  
  async get(query, params) {
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  async all(query, params) {
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

class MockLockerRepository {
  constructor(db) {
    this.db = db;
  }
  
  async findByKioskAndId(kioskId, lockerId) {
    return await this.db.get(
      'SELECT * FROM lockers WHERE kiosk_id = ? AND id = ?',
      [kioskId, lockerId]
    );
  }
}

class MockLockerNamingService {
  constructor(db) {
    this.db = db;
    this.lockerRepository = new MockLockerRepository(db);
  }
  
  async getDisplayName(kioskId, lockerId) {
    const locker = await this.lockerRepository.findByKioskAndId(kioskId, lockerId);
    if (!locker) {
      throw new Error(`Locker ${lockerId} not found in kiosk ${kioskId}`);
    }

    // Return custom name if set, otherwise fallback to default format
    if (locker.display_name && locker.display_name.trim()) {
      return locker.display_name.trim();
    }

    // Fallback to default format using relay number
    return `Dolap ${lockerId}`;
  }
}

class MockLockerStateManager {
  constructor(db) {
    this.db = db;
    this.namingService = new MockLockerNamingService(db);
  }
  
  async getAvailableLockers(kioskId) {
    return await this.db.all(
      `SELECT * FROM lockers 
       WHERE kiosk_id = ? AND status = 'Free' AND is_vip = 0 
       ORDER BY id`,
      [kioskId]
    );
  }
  
  async getEnhancedAvailableLockers(kioskId) {
    console.log('🔍 Getting available lockers...');
    const lockers = await this.getAvailableLockers(kioskId);
    console.log(`📊 Found ${lockers.length} available lockers: ${lockers.map(l => l.id).join(', ')}`);
    
    console.log('🏷️ Getting display names...');
    const enhancedLockers = await Promise.all(
      lockers.map(async (locker, index) => {
        try {
          console.log(`  Processing locker ${locker.id} (${index + 1}/${lockers.length})`);
          const displayName = await this.namingService.getDisplayName(kioskId, locker.id);
          console.log(`  ✅ Locker ${locker.id}: ${displayName}`);
          return {
            ...locker,
            displayName
          };
        } catch (error) {
          console.log(`  ❌ Locker ${locker.id}: ERROR - ${error.message}`);
          throw error; // This would cause Promise.all to fail
        }
      })
    );

    console.log(`✅ Enhanced lockers complete: ${enhancedLockers.length} lockers`);
    return enhancedLockers;
  }
}

async function testEnhancedLockers() {
  const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');
  const mockDb = new MockDatabaseConnection(db);
  const stateManager = new MockLockerStateManager(mockDb);

  console.log('=== TESTING ENHANCED AVAILABLE LOCKERS ===');

  try {
    const enhancedLockers = await stateManager.getEnhancedAvailableLockers('kiosk-1');
    console.log(`\\n🎯 FINAL RESULT: ${enhancedLockers.length} enhanced lockers`);
    console.log('Locker IDs:', enhancedLockers.map(l => l.id).sort((a, b) => a - b));
    
    // Check for missing ones
    const returnedIds = enhancedLockers.map(l => l.id);
    const expectedIds = Array.from({length: 30}, (_, i) => i + 1);
    const missingIds = expectedIds.filter(id => !returnedIds.includes(id));
    
    if (missingIds.length > 0) {
      console.log('❌ Missing locker IDs:', missingIds);
    } else {
      console.log('✅ All lockers present');
    }
    
  } catch (error) {
    console.error('❌ ERROR in getEnhancedAvailableLockers:', error.message);
  }
  
  db.close();
}

testEnhancedLockers();