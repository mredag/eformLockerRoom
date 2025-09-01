const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');

console.log('=== CHECKING VIP LOCKER STATUS ===');

db.all("SELECT id, status, is_vip FROM lockers WHERE kiosk_id='kiosk-1' ORDER BY id", (err, rows) => {
    if (err) {
        console.error('Error:', err);
    } else {
        console.log('All lockers with VIP status:');
        rows.forEach(row => {
            console.log(`Locker ${row.id}: status=${row.status}, is_vip=${row.is_vip}`);
        });
        
        // Count VIP vs non-VIP
        db.all(`
            SELECT is_vip, COUNT(*) as count 
            FROM lockers 
            WHERE kiosk_id='kiosk-1' 
            GROUP BY is_vip
        `, (err, vipRows) => {
            if (err) {
                console.error('Error counting VIP:', err);
            } else {
                console.log('\\nVIP counts:');
                vipRows.forEach(row => {
                    console.log(`is_vip=${row.is_vip}: ${row.count} lockers`);
                });
            }
            
            // Show which lockers are being filtered out
            db.all(`
                SELECT id FROM lockers 
                WHERE kiosk_id='kiosk-1' AND (status != 'Free' OR is_vip = 1)
                ORDER BY id
            `, (err, filteredRows) => {
                if (err) {
                    console.error('Error checking filtered lockers:', err);
                } else {
                    console.log('\\nLockers filtered out (not Free or VIP):');
                    console.log(filteredRows.map(r => r.id));
                }
                db.close();
            });
        });
    }
});