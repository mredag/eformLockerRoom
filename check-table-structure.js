const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');

console.log('=== CHECKING LOCKERS TABLE STRUCTURE ===');

db.all("PRAGMA table_info(lockers)", (err, rows) => {
    if (err) {
        console.error('Error:', err);
    } else {
        console.log('Lockers table columns:');
        rows.forEach(row => {
            console.log(`  ${row.name}: ${row.type} (nullable: ${row.notnull === 0})`);
        });
        
        // Show a sample row
        db.get("SELECT * FROM lockers WHERE kiosk_id='kiosk-1' LIMIT 1", (err, row) => {
            if (err) {
                console.error('Error getting sample row:', err);
            } else {
                console.log('\\nSample row:');
                console.log(row);
            }
            db.close();
        });
    }
});