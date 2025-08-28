#!/usr/bin/env node

/**
 * Test the complete RFID flow with the ownership confirmation fix
 */

const http = require('http');

console.log('🧪 Testing Fixed RFID Flow...\n');

// Simulate the complete RFID flow via API
async function testRfidFlow() {
    return new Promise((resolve, reject) => {
        // Simulate locker selection via kiosk API
        const postData = JSON.stringify({
            locker_id: 1,
            staff_user: 'test-rfid-flow',
            reason: 'Testing fixed ownership confirmation'
        });

        const options = {
            hostname: 'localhost',
            port: 3002,
            path: '/api/locker/open',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    console.log('📡 API Response:', response);
                    
                    if (res.statusCode === 200) {
                        console.log('✅ Locker opening request successful');
                        resolve(response);
                    } else {
                        console.log(`❌ API returned status ${res.statusCode}`);
                        reject(new Error(`HTTP ${res.statusCode}: ${response.message || 'Unknown error'}`));
                    }
                } catch (err) {
                    console.log('❌ Invalid JSON response:', data);
                    reject(new Error('Invalid JSON response'));
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(postData);
        req.end();
    });
}

// Check database status after the operation
async function checkDatabaseStatus() {
    const sqlite3 = require('sqlite3').verbose();
    
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database('/home/pi/eform-locker/data/eform.db');
        
        db.all('SELECT id, status, owner_key, owner_type, updated_at FROM lockers WHERE id = 1', (err, rows) => {
            if (err) {
                reject(err);
            } else {
                console.log('📊 Database status for locker 1:');
                if (rows.length > 0) {
                    const locker = rows[0];
                    console.log(`   Status: ${locker.status}`);
                    console.log(`   Owner: ${locker.owner_key || 'None'} (${locker.owner_type || 'None'})`);
                    console.log(`   Updated: ${locker.updated_at}`);
                    
                    if (locker.status === 'Owned') {
                        console.log('✅ SUCCESS: Locker correctly shows "Owned" status');
                    } else if (locker.status === 'Opening') {
                        console.log('❌ ISSUE: Locker still stuck in "Opening" status');
                    } else {
                        console.log(`ℹ️  INFO: Locker status is "${locker.status}"`);
                    }
                } else {
                    console.log('❌ Locker 1 not found');
                }
                resolve(rows);
            }
        });
        
        db.close();
    });
}

// Run the complete test
async function runCompleteTest() {
    try {
        console.log('🔄 Step 1: Testing locker opening via API...');
        await testRfidFlow();
        console.log('');
        
        console.log('🔍 Step 2: Checking database status...');
        await checkDatabaseStatus();
        console.log('');
        
        console.log('🌐 Step 3: Check admin panel...');
        console.log('   Open: http://192.168.1.8:3001/lockers');
        console.log('   Look for locker 1 - it should show "Sahipli" with yellow border');
        console.log('');
        
        console.log('✅ Test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.log('');
        console.log('🔧 Troubleshooting:');
        console.log('   - Check if services are running: ps aux | grep node');
        console.log('   - Check logs: tail -f logs/kiosk.log');
        process.exit(1);
    }
}

runCompleteTest();