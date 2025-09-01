const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');

console.log('Testing database...');

db.get("SELECT COUNT(*) as count FROM lockers WHERE kiosk_id = 'kiosk-1'", (err, row) => {
    if (err) {
        console.error('Error:', err);
    } else {
        console.log(`✅ Found ${row.count} lockers for kiosk-1`);
    }
    
    db.all("SELECT id, display_name FROM lockers WHERE kiosk_id = 'kiosk-1' AND display_name IS NOT NULL", (err, rows) => {
        if (err) {
            console.error('Error getting named lockers:', err);
        } else {
            console.log(`✅ Found ${rows.length} lockers with custom names:`);
            rows.forEach(row => {
                console.log(`   - Locker ${row.id}: ${row.display_name}`);
            });
        }
        
        db.close();
    });
});