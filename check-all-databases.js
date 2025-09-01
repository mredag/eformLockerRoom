const sqlite3 = require('sqlite3').verbose();

const dbPaths = [
    '/home/pi/eform-locker/data/eform.db',
    '/home/pi/eform-locker/data/eform_locker.db',
    '/home/pi/eform-locker/eform_locker.db',
    '/home/pi/eform-locker/app/panel/data/eform.db',
    '/home/pi/eform-locker/app/kiosk/data/eform.db'
];

console.log('=== CHECKING ALL DATABASE FILES ===');

let completed = 0;

dbPaths.forEach((dbPath, index) => {
    console.log(`\\n${index + 1}. Checking: ${dbPath}`);
    
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            console.log(`   ❌ Cannot open: ${err.message}`);
            completed++;
            if (completed === dbPaths.length) process.exit(0);
            return;
        }
        
        // Check if lockers table exists
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='lockers'", (err, row) => {
            if (err || !row) {
                console.log(`   ❌ No lockers table`);
                db.close();
                completed++;
                if (completed === dbPaths.length) process.exit(0);
                return;
            }
            
            // Count lockers
            db.get("SELECT COUNT(*) as count FROM lockers WHERE kiosk_id='kiosk-1'", (err, countRow) => {
                if (err) {
                    console.log(`   ❌ Error counting: ${err.message}`);
                } else {
                    console.log(`   📊 Lockers: ${countRow.count}`);
                }
                
                // Check locker 3 name
                db.get("SELECT display_name FROM lockers WHERE kiosk_id='kiosk-1' AND id=3", (err, nameRow) => {
                    if (err) {
                        console.log(`   ❌ Error checking locker 3: ${err.message}`);
                    } else if (nameRow) {
                        console.log(`   🏷️  Locker 3 name: "${nameRow.display_name || 'NULL'}"`);
                    } else {
                        console.log(`   ❌ Locker 3 not found`);
                    }
                    
                    db.close();
                    completed++;
                    if (completed === dbPaths.length) process.exit(0);
                });
            });
        });
    });
});