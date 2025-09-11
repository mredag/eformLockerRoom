const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');

console.log('=== CHECKING TABLES ===');
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
    if (err) {
        console.error('Error querying tables:', err);
        return;
    }
    console.log('Tables found:', rows.map(r => r.name).join(', '));
    
    // Check if locker_names table exists
    const hasLockerNames = rows.some(r => r.name === 'locker_names');
    console.log('Has locker_names table:', hasLockerNames);
    
    if (!hasLockerNames) {
        console.log('\n=== CREATING LOCKER_NAMES TABLE ===');
        db.run(`CREATE TABLE IF NOT EXISTS locker_names (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kiosk_id TEXT NOT NULL,
            locker_id INTEGER NOT NULL,
            display_name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(kiosk_id, locker_id)
        )`, (err) => {
            if (err) {
                console.error('Error creating table:', err);
            } else {
                console.log('✅ locker_names table created successfully');
            }
            db.close();
        });
    } else {
        db.close();
    }
});