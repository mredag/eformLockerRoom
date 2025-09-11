const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');

console.log('=== ADDING MISSING LOCKERS ===');

// Add lockers 31 and 32 if they don't exist
const lockersToAdd = [31, 32];

lockersToAdd.forEach((lockerId, index) => {
    db.get('SELECT id FROM lockers WHERE kiosk_id = ? AND id = ?', ['kiosk-1', lockerId], (err, row) => {
        if (err) {
            console.error(`Error checking locker ${lockerId}:`, err);
        } else if (!row) {
            // Locker doesn't exist, add it
            db.run(`
                INSERT INTO lockers (kiosk_id, id, status, is_vip, created_at, updated_at, version)
                VALUES (?, ?, 'Free', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
            `, ['kiosk-1', lockerId], (err) => {
                if (err) {
                    console.error(`Error adding locker ${lockerId}:`, err);
                } else {
                    console.log(`✅ Locker ${lockerId} added/verified`);
                }
            });
        } else {
            console.log(`✅ Locker ${lockerId} already exists`);
        }
        
        // Check total count after processing all
        if (index === lockersToAdd.length - 1) {
            setTimeout(() => {
                db.get('SELECT COUNT(*) as count FROM lockers WHERE kiosk_id = ?', ['kiosk-1'], (err, row) => {
                    if (err) {
                        console.error('Error counting lockers:', err);
                    } else {
                        console.log(`Total lockers for kiosk-1: ${row.count}`);
                    }
                    db.close();
                });
            }, 100);
        }
    });
});