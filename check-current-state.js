const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');

console.log('=== CHECKING CURRENT DATABASE STATE ===');

// Check total lockers
db.all("SELECT COUNT(*) as count FROM lockers WHERE kiosk_id='kiosk-1'", (err, rows) => {
    if (err) {
        console.error('Error counting lockers:', err);
    } else {
        console.log(`Total lockers in database: ${rows[0].count}`);
    }
    
    // Check locker range
    db.all("SELECT MIN(id) as min_id, MAX(id) as max_id FROM lockers WHERE kiosk_id='kiosk-1'", (err, rows) => {
        if (err) {
            console.error('Error checking locker range:', err);
        } else {
            console.log(`Locker ID range: ${rows[0].min_id} to ${rows[0].max_id}`);
        }
        
        // Check missing lockers
        db.all(`
            WITH RECURSIVE numbers(x) AS (
                SELECT 1
                UNION ALL
                SELECT x+1 FROM numbers WHERE x < 32
            )
            SELECT x as missing_id 
            FROM numbers 
            WHERE x NOT IN (SELECT id FROM lockers WHERE kiosk_id='kiosk-1')
        `, (err, rows) => {
            if (err) {
                console.error('Error checking missing lockers:', err);
            } else {
                console.log('Missing locker IDs:', rows.map(r => r.missing_id));
            }
            
            // Check locker_names table
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='locker_names'", (err, row) => {
                if (err) {
                    console.error('Error checking locker_names table:', err);
                } else if (row) {
                    console.log('✅ locker_names table exists');
                    
                    // Check custom names
                    db.all("SELECT * FROM locker_names WHERE kiosk_id='kiosk-1'", (err, rows) => {
                        if (err) {
                            console.error('Error checking custom names:', err);
                        } else {
                            console.log('Custom names:', rows);
                        }
                        
                        // Check locker statuses
                        db.all("SELECT id, status FROM lockers WHERE kiosk_id='kiosk-1' AND status != 'Free' ORDER BY id", (err, rows) => {
                            if (err) {
                                console.error('Error checking locker statuses:', err);
                            } else {
                                console.log('Non-free lockers:', rows);
                            }
                            db.close();
                        });
                    });
                } else {
                    console.log('❌ locker_names table does not exist');
                    db.close();
                }
            });
        });
    });
});