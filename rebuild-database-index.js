const sqlite3 = require('sqlite3').verbose();

console.log('=== REBUILDING DATABASE INDEX ===');

const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');

console.log('1. Checking current index...');
db.all("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_lockers_display_name'", (err, rows) => {
    if (err) {
        console.error('Error checking index:', err);
        return;
    }
    
    console.log(`Found ${rows.length} matching indexes`);
    
    console.log('2. Dropping existing index...');
    db.run('DROP INDEX IF EXISTS idx_lockers_display_name', (err) => {
        if (err) {
            console.error('Error dropping index:', err);
            return;
        }
        
        console.log('✅ Dropped existing index');
        
        console.log('3. Recreating index...');
        db.run('CREATE INDEX idx_lockers_display_name ON lockers(display_name)', (err) => {
            if (err) {
                console.error('Error creating index:', err);
                return;
            }
            
            console.log('✅ Recreated index successfully');
            
            console.log('4. Testing index...');
            db.all('SELECT id, display_name FROM lockers WHERE display_name IS NOT NULL', (err, rows) => {
                if (err) {
                    console.error('Error testing index:', err);
                } else {
                    console.log(`✅ Index test successful: Found ${rows.length} lockers with custom names`);
                    rows.forEach(row => {
                        console.log(`   - Locker ${row.id}: ${row.display_name}`);
                    });
                }
                
                console.log('5. Running integrity check...');
                db.get('PRAGMA integrity_check', (err, result) => {
                    if (err) {
                        console.error('Error in integrity check:', err);
                    } else {
                        console.log(`✅ Integrity check: ${result['integrity_check']}`);
                    }
                    
                    db.close();
                    console.log('\n🎉 Database index rebuild complete!');
                });
            });
        });
    });
});