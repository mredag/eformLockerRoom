#!/usr/bin/env node

/**
 * Test script to simulate proper locker assignment flow
 * This will help verify the status transitions work correctly
 */

const http = require('http');
const sqlite3 = require('sqlite3').verbose();

console.log('🧪 Testing Locker Assignment Flow...\n');

// Simulate assigning a locker to an RFID card
async function assignLocker(lockerId, rfidCard) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');
        
        const query = `
            UPDATE lockers 
            SET status = 'Owned', 
                owner_key = ?, 
                owner_type = 'rfid',
                updated_at = datetime('now')
            WHERE id = ? AND status = 'Free'
        `;
        
        db.run(query, [rfidCard, lockerId], function(err) {
            if (err) {
                reject(err);
            } else {
                console.log(`✅ Assigned locker ${lockerId} to RFID card ${rfidCard}`);
                console.log(`   Changes made: ${this.changes}`);
                resolve(this.changes);
            }
        });
        
        db.close();
    });
}

// Check current locker status
async function checkLockerStatus() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');
        
        db.all('SELECT id, status, owner_key, owner_type, updated_at FROM lockers WHERE owner_key IS NOT NULL', (err, rows) => {
            if (err) {
                reject(err);
            } else {
                console.log('📊 Current assigned lockers:');
                if (rows.length === 0) {
                    console.log('   No lockers currently assigned');
                } else {
                    rows.forEach(row => {
                        console.log(`   Locker ${row.id}: ${row.status} - Owner: ${row.owner_key} (${row.owner_type})`);
                    });
                }
                resolve(rows);
            }
        });
        
        db.close();
    });
}

// Test the assignment flow
async function testAssignmentFlow() {
    try {
        console.log('🔍 Checking current status...');
        await checkLockerStatus();
        console.log('');
        
        console.log('🔄 Assigning test lockers...');
        await assignLocker(1, '0006851540');
        await assignLocker(2, '0001265236');
        console.log('');
        
        console.log('✅ Assignment complete! Checking final status...');
        await checkLockerStatus();
        console.log('');
        
        console.log('🌐 Now refresh the admin panel: http://192.168.1.8:3001/lockers');
        console.log('👀 You should see:');
        console.log('   - Locker 1: "Sahipli" status with yellow border');
        console.log('   - Locker 2: "Sahipli" status with yellow border');
        console.log('   - RFID numbers displayed as owner information');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

testAssignmentFlow();