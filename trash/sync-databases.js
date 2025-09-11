const sqlite3 = require('sqlite3').verbose();

console.log('=== SYNCING DATABASES ===');

// The main database (correct one)
const mainDb = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');

// The kiosk database (the one being used)
const kioskDb = new sqlite3.Database('/home/pi/eform-locker/data/eform_locker.db');

console.log('1. Checking main database...');
mainDb.all("SELECT id, display_name FROM lockers WHERE kiosk_id='kiosk-1' ORDER BY id", (err, mainRows) => {
    if (err) {
        console.error('Error reading main database:', err);
        return;
    }
    
    console.log(`Main DB has ${mainRows.length} lockers`);
    console.log('Sample:', mainRows.slice(0, 3));
    
    console.log('\\n2. Updating kiosk database...');
    
    // First, add missing lockers 31 and 32
    const lockersToAdd = [31, 32];
    let addCompleted = 0;
    
    lockersToAdd.forEach(lockerId => {
        kioskDb.get('SELECT id FROM lockers WHERE kiosk_id = ? AND id = ?', ['kiosk-1', lockerId], (err, row) => {
            if (err) {
                console.error(`Error checking locker ${lockerId}:`, err);
            } else if (!row) {
                // Add missing locker
                kioskDb.run(`
                    INSERT INTO lockers (kiosk_id, id, status, is_vip, created_at, updated_at, version)
                    VALUES (?, ?, 'Free', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
                `, ['kiosk-1', lockerId], (err) => {
                    if (err) {
                        console.error(`Error adding locker ${lockerId}:`, err);
                    } else {
                        console.log(`✅ Added locker ${lockerId} to kiosk database`);
                    }
                });
            } else {
                console.log(`✅ Locker ${lockerId} already exists in kiosk database`);
            }
            
            addCompleted++;
            if (addCompleted === lockersToAdd.length) {
                // Check if display_name column exists
                kioskDb.all("PRAGMA table_info(lockers)", (err, columns) => {
                    if (err) {
                        console.error('Error checking kiosk database schema:', err);
                        return;
                    }
                    
                    const hasDisplayName = columns.some(col => col.name === 'display_name');
                    
                    if (!hasDisplayName) {
                        console.log('\\n3. Adding display_name column to kiosk database...');
                        kioskDb.run('ALTER TABLE lockers ADD COLUMN display_name VARCHAR(20)', (err) => {
                            if (err) {
                                console.error('Error adding display_name column:', err);
                            } else {
                                console.log('✅ Added display_name column');
                                updateDisplayNames();
                            }
                        });
                    } else {
                        console.log('\\n3. display_name column already exists');
                        updateDisplayNames();
                    }
                });
            }
        });
    });
    
    function updateDisplayNames() {
        console.log('\\n4. Updating display names...');
        
        // Update locker 3 with custom name
        kioskDb.run(`
            UPDATE lockers 
            SET display_name = 'dolap 3 emre'
            WHERE kiosk_id = 'kiosk-1' AND id = 3
        `, (err) => {
            if (err) {
                console.error('Error updating locker 3 name:', err);
            } else {
                console.log('✅ Updated locker 3 name to "dolap 3 emre"');
            }
            
            // Verify final state
            kioskDb.get('SELECT COUNT(*) as count FROM lockers WHERE kiosk_id = ?', ['kiosk-1'], (err, row) => {
                if (err) {
                    console.error('Error counting final lockers:', err);
                } else {
                    console.log(`\\n✅ Final: Kiosk database has ${row.count} lockers`);
                }
                
                kioskDb.close();
                mainDb.close();
            });
        });
    }
});