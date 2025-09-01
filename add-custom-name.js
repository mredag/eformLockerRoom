const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');

console.log('=== ADDING CUSTOM NAME FOR LOCKER 3 ===');

db.run(`UPDATE lockers 
        SET display_name = 'dolap 3 emre', 
            name_updated_at = CURRENT_TIMESTAMP, 
            name_updated_by = 'admin'
        WHERE kiosk_id = 'kiosk-1' AND id = 3`, (err) => {
    if (err) {
        console.error('Error updating custom name:', err);
    } else {
        console.log('✅ Custom name "dolap 3 emre" updated for locker 3');
    }
    
    // Verify it was updated
    db.get("SELECT * FROM lockers WHERE kiosk_id='kiosk-1' AND id=3", (err, row) => {
        if (err) {
            console.error('Error verifying custom name:', err);
        } else if (row) {
            console.log(`✅ Verified: Locker ${row.id} has name "${row.display_name}"`);
        } else {
            console.log('❌ Locker 3 not found');
        }
        db.close();
    });
});