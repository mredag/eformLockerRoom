const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');

console.log('=== CHECKING ALL LOCKER STATUSES ===');

db.all("SELECT id, status FROM lockers WHERE kiosk_id='kiosk-1' ORDER BY id", (err, rows) => {
    if (err) {
        console.error('Error:', err);
    } else {
        console.log('All lockers:');
        rows.forEach(row => {
            console.log(`Locker ${row.id}: ${row.status}`);
        });
        
        // Count by status
        db.all(`
            SELECT status, COUNT(*) as count 
            FROM lockers 
            WHERE kiosk_id='kiosk-1' 
            GROUP BY status
        `, (err, statusRows) => {
            if (err) {
                console.error('Error counting by status:', err);
            } else {
                console.log('\\nStatus counts:');
                statusRows.forEach(row => {
                    console.log(`${row.status}: ${row.count}`);
                });
            }
            db.close();
        });
    }
});