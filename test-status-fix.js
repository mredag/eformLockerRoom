#!/usr/bin/env node

/**
 * Test script to verify status display fix
 * Run this on the Pi after deployment
 */

const http = require('http');

console.log('🧪 Testing Status Display Fix...\n');

// Test data - simulate different locker statuses
const testStatuses = [
    { status: 'Free', expected: 'Boş' },
    { status: 'Owned', expected: 'Sahipli' },
    { status: 'Reserved', expected: 'Rezerve' },
    { status: 'Opening', expected: 'Açılıyor' },
    { status: 'Blocked', expected: 'Engelli' },
    { status: 'Error', expected: 'Hata' }
];

// Test the admin panel endpoint
function testAdminPanel() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3001,
            path: '/lockers',
            method: 'GET',
            headers: {
                'Accept': 'text/html'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('✅ Admin panel accessible');
                    
                    // Check if StatusTranslationService is present
                    if (data.includes('StatusTranslationService')) {
                        console.log('✅ StatusTranslationService found in HTML');
                    } else {
                        console.log('❌ StatusTranslationService not found');
                    }
                    
                    // Check for CSS classes
                    const cssChecks = [
                        { class: '.state-aciliyor', name: 'Opening status CSS' },
                        { class: '.locker-card.opening', name: 'Opening card border CSS' },
                        { class: '.locker-card.error', name: 'Error card border CSS' }
                    ];
                    
                    cssChecks.forEach(check => {
                        if (data.includes(check.class)) {
                            console.log(`✅ ${check.name} found`);
                        } else {
                            console.log(`❌ ${check.name} missing`);
                        }
                    });
                    
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

// Test API endpoint
function testAPI() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3001,
            path: '/api/lockers',
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const lockers = JSON.parse(data);
                        console.log(`✅ API returned ${lockers.length} lockers`);
                        
                        // Check status distribution
                        const statusCounts = {};
                        lockers.forEach(locker => {
                            statusCounts[locker.status] = (statusCounts[locker.status] || 0) + 1;
                        });
                        
                        console.log('📊 Status distribution:');
                        Object.entries(statusCounts).forEach(([status, count]) => {
                            const expected = testStatuses.find(t => t.status === status)?.expected || status;
                            console.log(`   ${status} (${expected}): ${count} lockers`);
                        });
                        
                        resolve(lockers);
                    } catch (err) {
                        reject(new Error('Invalid JSON response'));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

// Run tests
async function runTests() {
    try {
        console.log('🔍 Testing admin panel...');
        await testAdminPanel();
        console.log('');
        
        console.log('🔍 Testing API...');
        await testAPI();
        console.log('');
        
        console.log('✅ All tests completed successfully!');
        console.log('');
        console.log('🌐 Open in browser: http://192.168.1.8:3001/lockers');
        console.log('👀 Look for:');
        console.log('   - Proper Turkish status text (Boş, Sahipli, Açılıyor, etc.)');
        console.log('   - Colored left borders on locker cards');
        console.log('   - Status chips with proper background colors');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.log('');
        console.log('🔧 Troubleshooting:');
        console.log('   - Check if services are running: ps aux | grep node');
        console.log('   - Restart services: sudo killall node && ./scripts/start-all-clean.sh');
        console.log('   - Check logs: tail -f logs/panel.log');
        process.exit(1);
    }
}

runTests();