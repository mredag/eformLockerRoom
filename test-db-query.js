const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');

console.log('=== TESTING DATABASE QUERY ===');

// This is the exact query from getAvailableLockers
const query = `SELECT * FROM lockers 
               WHERE kiosk_id = ? AND status = 'Free' AND is_vip = 0 
               ORDER BY id`;

db.all(query, ['kiosk-1'], (err, rows) => {
    if (err) {
        console.error('Error:', err);
    } else {
        console.log(`Query returned ${rows.length} lockers`);
        console.log('Locker IDs from query:', rows.map(r => r.id).sort((a, b) => a - b));
        
        // Check if the missing lockers exist at all
        const missingIds = [1, 2, 4, 5, 6, 7, 10];
        console.log('\\nChecking missing lockers individually:');
        
        let completed = 0;
        missingIds.forEach(id => {
            db.get(`SELECT * FROM lockers WHERE kiosk_id = 'kiosk-1' AND id = ?`, [id], (err, row) => {
                if (err) {
                    console.error(`Error checking locker ${id}:`, err);
                } else if (row) {
                    console.log(`Locker ${id}: status=${row.status}, is_vip=${row.is_vip}, kiosk_id=${row.kiosk_id}`);
                } else {
                    console.log(`Locker ${id}: NOT FOUND`);
                }
                
                completed++;
                if (completed === missingIds.length) {
                    db.close();
                }
            });
        });
    }
});