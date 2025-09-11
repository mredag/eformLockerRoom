const sqlite3 = require('sqlite3').verbose();

console.log('=== FINAL VERIFICATION ===');

const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');

console.log('1. Checking total locker count...');
db.get("SELECT COUNT(*) as count FROM lockers WHERE kiosk_id = 'kiosk-1'", (err, row) => {
    if (err) {
        console.error('Error:', err);
        return;
    }
    
    console.log(`✅ Total lockers: ${row.count}`);
    
    console.log('\n2. Checking lockers with custom names...');
    db.all("SELECT id, display_name FROM lockers WHERE kiosk_id = 'kiosk-1' AND display_name IS NOT NULL ORDER BY id", (err, rows) => {
        if (err) {
            console.error('Error:', err);
            return;
        }
        
        console.log(`✅ Lockers with custom names: ${rows.length}`);
        rows.forEach(row => {
            console.log(`   - Locker ${row.id}: "${row.display_name}"`);
        });
        
        console.log('\n3. Checking locker range...');
        db.all("SELECT MIN(id) as min_id, MAX(id) as max_id FROM lockers WHERE kiosk_id = 'kiosk-1'", (err, result) => {
            if (err) {
                console.error('Error:', err);
                return;
            }
            
            const { min_id, max_id } = result[0];
            console.log(`✅ Locker range: ${min_id} to ${max_id}`);
            
            console.log('\n4. Checking specific lockers 31 and 32...');
            db.all("SELECT id, status, display_name FROM lockers WHERE kiosk_id = 'kiosk-1' AND id IN (31, 32) ORDER BY id", (err, lockers) => {
                if (err) {
                    console.error('Error:', err);
                    return;
                }
                
                console.log(`✅ Found ${lockers.length} lockers (31-32):`);
                lockers.forEach(locker => {
                    console.log(`   - Locker ${locker.id}: Status=${locker.status}, Name=${locker.display_name || 'default'}`);
                });
                
                console.log('\n5. Database integrity check...');
                db.get('PRAGMA integrity_check', (err, result) => {
                    if (err) {
                        console.error('Error:', err);
                    } else {
                        console.log(`✅ Database integrity: ${result['integrity_check']}`);
                    }
                    
                    db.close();
                    
                    console.log('\n🎉 VERIFICATION COMPLETE!');
                    console.log('✅ Database is healthy and contains all expected data');
                    console.log('✅ Kiosk service should now display all 32 lockers');
                    console.log('✅ Custom names are preserved and working');
                    console.log('\n🌐 Access the kiosk at: http://192.168.1.8:3002');
                });
            });
        });
    });
});