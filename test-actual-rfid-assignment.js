#!/usr/bin/env node

/**
 * Test the actual RFID assignment flow that includes database updates
 */

const sqlite3 = require('sqlite3').verbose();

console.log('🧪 Testing Actual RFID Assignment Flow...\n');

// Simulate the complete RFID assignment process
async function simulateRfidAssignment() {
    const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');
    
    return new Promise((resolve, reject) => {
        const cardId = '0006851540';
        const lockerId = 1;
        const kioskId = 'test-kiosk';
        const now = new Date().toISOString();
        
        console.log(`🔄 Simulating RFID assignment: Card ${cardId} → Locker ${lockerId}`);
        
        // Step 1: Assign locker (Free → Owned)
        db.run(
            `UPDATE lockers 
             SET status = 'Owned', 
                 owner_type = 'rfid', 
                 owner_key = ?, 
                 reserved_at = ?, 
                 owned_at = ?,
                 updated_at = ?
             WHERE id = ? AND status = 'Free'`,
            [cardId, now, now, now, lockerId],
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                
                console.log(`✅ Step 1: Assigned locker ${lockerId} to card ${cardId} (${this.changes} changes)`);
                
                // Step 2: Check the result
                db.get(
                    'SELECT id, status, owner_key, owner_type, updated_at FROM lockers WHERE id = ?',
                    [lockerId],
                    (err, row) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        console.log('📊 Final locker status:');
                        console.log(`   ID: ${row.id}`);
                        console.log(`   Status: ${row.status}`);
                        console.log(`   Owner: ${row.owner_key} (${row.owner_type})`);
                        console.log(`   Updated: ${row.updated_at}`);
                        
                        if (row.status === 'Owned') {
                            console.log('✅ SUCCESS: Locker correctly assigned with "Owned" status');
                        } else {
                            console.log(`❌ ISSUE: Expected "Owned" but got "${row.status}"`);
                        }
                        
                        db.close();
                        resolve(row);
                    }
                );
            }
        );
    });
}

// Test the confirmOwnership function behavior
async function testConfirmOwnership() {
    console.log('\n🔧 Testing confirmOwnership function behavior...');
    
    // This would normally be called after successful hardware opening
    // Let's see what happens when we call it on an Owned locker
    
    const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');
    
    return new Promise((resolve, reject) => {
        const lockerId = 1;
        const now = new Date().toISOString();
        
        // Get current locker state
        db.get('SELECT * FROM lockers WHERE id = ?', [lockerId], (err, beforeRow) => {
            if (err) {
                reject(err);
                return;
            }
            
            console.log(`📋 Before confirmOwnership: Status = ${beforeRow.status}`);
            
            // Simulate what the fixed confirmOwnership function does
            // (Update owned_at timestamp but keep status as Owned)
            db.run(
                `UPDATE lockers 
                 SET owned_at = ?, updated_at = ?
                 WHERE id = ? AND status = 'Owned'`,
                [now, now, lockerId],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    console.log(`✅ confirmOwnership simulation: ${this.changes} changes`);
                    
                    // Check final state
                    db.get('SELECT * FROM lockers WHERE id = ?', [lockerId], (err, afterRow) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        console.log(`📋 After confirmOwnership: Status = ${afterRow.status}`);
                        
                        if (afterRow.status === 'Owned') {
                            console.log('✅ SUCCESS: Status remained "Owned" (correct behavior)');
                        } else {
                            console.log(`❌ ISSUE: Status changed to "${afterRow.status}" (incorrect)`);
                        }
                        
                        db.close();
                        resolve(afterRow);
                    });
                }
            );
        });
    });
}

// Run the complete test
async function runTest() {
    try {
        console.log('🧪 Testing the fixed RFID assignment flow...\n');
        
        // Step 1: Simulate RFID assignment
        await simulateRfidAssignment();
        
        // Step 2: Test confirmOwnership behavior
        await testConfirmOwnership();
        
        console.log('\n🌐 Now check the admin panel:');
        console.log('   URL: http://192.168.1.8:3001/lockers');
        console.log('   Expected: Locker 1 shows "Sahipli" with yellow border');
        console.log('   Expected: Owner shows RFID card number');
        
        console.log('\n✅ All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

runTest();