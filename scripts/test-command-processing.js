#!/usr/bin/env node

/**
 * Test if Kiosk automatically processes pending commands
 * This checks if the command status changes from 'pending' to 'completed'
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = '/home/pi/eform-locker/data/eform.db';
const COMMAND_ID = 'db1948ca-ae36-4564-b0f4-2789e302ab1e';

console.log('🔍 Testing Command Processing');
console.log('============================');

function checkCommandStatus() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        
        db.get(
            `SELECT command_id, status, executed_at, completed_at, last_error 
             FROM command_queue 
             WHERE command_id = ?`,
            [COMMAND_ID],
            (err, row) => {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            }
        );
    });
}

async function testCommandProcessing() {
    try {
        console.log(`📋 Checking command: ${COMMAND_ID}`);
        
        // Check initial status
        const initialStatus = await checkCommandStatus();
        if (!initialStatus) {
            console.log('❌ Command not found in database');
            return;
        }
        
        console.log(`📊 Initial status: ${initialStatus.status}`);
        console.log(`⏰ Executed at: ${initialStatus.executed_at || 'Not executed'}`);
        console.log(`✅ Completed at: ${initialStatus.completed_at || 'Not completed'}`);
        
        if (initialStatus.status === 'completed') {
            console.log('🎉 Command already completed!');
            return;
        }
        
        if (initialStatus.status === 'pending') {
            console.log('⏳ Command is pending. Waiting 10 seconds to see if Kiosk processes it...');
            
            // Wait 10 seconds
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Check again
            const finalStatus = await checkCommandStatus();
            console.log('\n📊 Final status check:');
            console.log(`Status: ${finalStatus.status}`);
            console.log(`Executed at: ${finalStatus.executed_at || 'Not executed'}`);
            console.log(`Completed at: ${finalStatus.completed_at || 'Not completed'}`);
            console.log(`Error: ${finalStatus.last_error || 'None'}`);
            
            if (finalStatus.status === 'completed') {
                console.log('\n🎉 SUCCESS! Kiosk automatically processed the command!');
                console.log('✅ End-to-end flow is working:');
                console.log('   1. Admin Panel → Gateway ✅');
                console.log('   2. Gateway → Database ✅');
                console.log('   3. Kiosk polls Gateway ✅');
                console.log('   4. Kiosk processes command ✅');
            } else if (finalStatus.status === 'failed') {
                console.log('\n❌ Command failed to execute');
                console.log(`Error: ${finalStatus.last_error}`);
            } else {
                console.log('\n⚠️  Command still pending - Kiosk may not be processing commands');
                console.log('💡 Check if Kiosk service is running and polling correctly');
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testCommandProcessing();