const sqlite3 = require('sqlite3').verbose();

// Mock the database connection and repository
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

const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');
const mockDb = new MockDatabaseConnection(db);
const namingService = new MockLockerNamingService(mockDb);

console.log('=== TESTING NAMING SERVICE ===');

const missingIds = [1, 2, 4, 5, 6, 7, 10];
let completed = 0;

missingIds.forEach(async (id) => {
  try {
    const displayName = await namingService.getDisplayName('kiosk-1', id);
    console.log(`✅ Locker ${id}: ${displayName}`);
  } catch (error) {
    console.log(`❌ Locker ${id}: ERROR - ${error.message}`);
  }
  
  completed++;
  if (completed === missingIds.length) {
    db.close();
  }
});