const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

console.log('=== FIXING CORRUPTED DATABASE ===');

// Backup the corrupted database first
const corruptedDbPath = '/home/pi/eform-locker/data/eform_locker.db';
const backupPath = '/home/pi/eform-locker/data/eform_locker.db.corrupted.backup';

if (fs.existsSync(corruptedDbPath)) {
    console.log('1. Backing up corrupted database...');
    fs.copyFileSync(corruptedDbPath, backupPath);
    console.log('✅ Corrupted database backed up');
    
    // Remove the corrupted database
    fs.unlinkSync(corruptedDbPath);
    console.log('✅ Corrupted database removed');
}

// Open the main database (source of truth)
const mainDb = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');

console.log('2. Reading data from main database...');
mainDb.all("SELECT * FROM lockers WHERE kiosk_id='kiosk-1' ORDER BY id", (err, lockers) => {
    if (err) {
        console.error('Error reading main database:', err);
        return;
    }
    
    console.log(`Found ${lockers.length} lockers in main database`);
    
    // Create new clean database
    console.log('3. Creating new clean database...');
    const newDb = new sqlite3.Database(corruptedDbPath);
    
    // Create the lockers table with proper schema
    newDb.run(`
        CREATE TABLE lockers (
            kiosk_id TEXT NOT NULL,
            id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'Free',
            owner_key TEXT,
            assigned_at DATETIME,
            is_vip INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            version INTEGER DEFAULT 1,
            display_name VARCHAR(20),
            PRIMARY KEY (kiosk_id, id)
        )
    `, (err) => {
        if (err) {
            console.error('Error creating lockers table:', err);
            return;
        }
        
        console.log('✅ Created lockers table');
        
        // Create the index properly
        newDb.run('CREATE INDEX idx_lockers_display_name ON lockers(display_name)', (err) => {
            if (err) {
                console.error('Error creating index:', err);
                return;
            }
            
            console.log('✅ Created display_name index');
            
            // Insert all lockers from main database
            console.log('4. Inserting locker data...');
            
            const stmt = newDb.prepare(`
                INSERT INTO lockers (
                    kiosk_id, id, status, owner_key, assigned_at, is_vip, 
                    created_at, updated_at, version, display_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            let insertCount = 0;
            lockers.forEach(locker => {
                stmt.run([
                    locker.kiosk_id,
                    locker.id,
                    locker.status,
                    locker.owner_key,
                    locker.assigned_at,
                    locker.is_vip,
                    locker.created_at,
                    locker.updated_at,
                    locker.version,
                    locker.display_name
                ], (err) => {
                    if (err) {
                        console.error(`Error inserting locker ${locker.id}:`, err);
                    } else {
                        insertCount++;
                        console.log(`✅ Inserted locker ${locker.id}${locker.display_name ? ` (${locker.display_name})` : ''}`);
                    }
                    
                    if (insertCount === lockers.length) {
                        stmt.finalize();
                        
                        // Add missing lockers 31 and 32 if they don't exist
                        const existingIds = lockers.map(l => l.id);
                        const missingIds = [31, 32].filter(id => !existingIds.includes(id));
                        
                        if (missingIds.length > 0) {
                            console.log('5. Adding missing lockers...');
                            const addStmt = newDb.prepare(`
                                INSERT INTO lockers (kiosk_id, id, status, is_vip, created_at, updated_at, version)
                                VALUES (?, ?, 'Free', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
                            `);
                            
                            let addCount = 0;
                            missingIds.forEach(id => {
                                addStmt.run(['kiosk-1', id], (err) => {
                                    if (err) {
                                        console.error(`Error adding locker ${id}:`, err);
                                    } else {
                                        console.log(`✅ Added missing locker ${id}`);
                                    }
                                    
                                    addCount++;
                                    if (addCount === missingIds.length) {
                                        addStmt.finalize();
                                        finishUp();
                                    }
                                });
                            });
                        } else {
                            finishUp();
                        }
                    }
                });
            });
            
            function finishUp() {
                // Verify the new database
                newDb.get('SELECT COUNT(*) as count FROM lockers WHERE kiosk_id = ?', ['kiosk-1'], (err, row) => {
                    if (err) {
                        console.error('Error verifying new database:', err);
                    } else {
                        console.log(`\n✅ SUCCESS: New database has ${row.count} lockers`);
                    }
                    
                    // Test the index
                    newDb.all('SELECT id, display_name FROM lockers WHERE display_name IS NOT NULL', (err, named) => {
                        if (err) {
                            console.error('Error testing index:', err);
                        } else {
                            console.log(`✅ Index working: Found ${named.length} lockers with custom names`);
                            named.forEach(l => console.log(`   - Locker ${l.id}: ${l.display_name}`));
                        }
                        
                        newDb.close();
                        mainDb.close();
                        
                        console.log('\n🎉 Database recovery complete!');
                        console.log('You can now restart the kiosk service.');
                    });
                });
            }
        });
    });
});