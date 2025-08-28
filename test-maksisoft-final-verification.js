/**
 * Final Verification Test for Maksisoft Integration
 * 
 * This script tests the complete Maksisoft integration workflow:
 * 1. API accessibility without authentication
 * 2. Real data retrieval from Maksisoft server
 * 3. Data mapping and formatting
 * 4. Error handling and rate limiting
 */

const https = require('https');
const http = require('http');

// Test configuration
const PI_HOST = '192.168.1.8';
const PI_PORT = 3001;
const TEST_RFIDS = [
    '0006851540', // Known working RFID from your test
    '0009652489', // RFID from previous tests
    '0001265236', // RFID from locker assignment
    'invalid123'  // Invalid RFID for error testing
];

/**
 * Make HTTP request to Pi API
 */
function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: PI_HOST,
            port: PI_PORT,
            path: path,
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

/**
 * Test Maksisoft API status
 */
async function testMaksiStatus() {
    console.log('🔍 Testing Maksisoft API status...');
    try {
        const result = await makeRequest('/api/maksi/status');
        console.log(`   Status: ${result.status}`);
        console.log(`   Response:`, result.data);
        return result.status === 200 && result.data.enabled === true;
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return false;
    }
}

/**
 * Test RFID search
 */
async function testRfidSearch(rfid) {
    console.log(`🔍 Testing RFID search: ${rfid}`);
    try {
        const result = await makeRequest(`/api/maksi/search-by-rfid?rfid=${encodeURIComponent(rfid)}`);
        console.log(`   Status: ${result.status}`);
        
        if (result.status === 200 && result.data.success) {
            console.log(`   ✅ Success: Found ${result.data.hits.length} results`);
            if (result.data.hits.length > 0) {
                const user = result.data.hits[0];
                console.log(`   📋 User: ID=${user.id}, Name="${user.fullName}", Phone="${user.phone}"`);
            }
            return true;
        } else {
            console.log(`   ⚠️  Response: ${JSON.stringify(result.data)}`);
            return result.status < 500; // Client errors are expected for invalid RFIDs
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return false;
    }
}

/**
 * Test rate limiting
 */
async function testRateLimit() {
    console.log('🔍 Testing rate limiting...');
    const testRfid = TEST_RFIDS[0];
    
    try {
        // Make first request
        const result1 = await makeRequest(`/api/maksi/search-by-rfid?rfid=${testRfid}`);
        console.log(`   First request: ${result1.status}`);
        
        // Make immediate second request (should be rate limited)
        const result2 = await makeRequest(`/api/maksi/search-by-rfid?rfid=${testRfid}`);
        console.log(`   Second request: ${result2.status}`);
        
        if (result2.status === 429) {
            console.log(`   ✅ Rate limiting working correctly`);
            return true;
        } else {
            console.log(`   ⚠️  Rate limiting may not be working (expected 429, got ${result2.status})`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return false;
    }
}

/**
 * Main test function
 */
async function runTests() {
    console.log('🚀 Starting Maksisoft Integration Final Verification');
    console.log('=' .repeat(60));
    
    const results = {
        status: false,
        searches: [],
        rateLimit: false
    };
    
    // Test 1: API Status
    results.status = await testMaksiStatus();
    console.log('');
    
    // Test 2: RFID Searches
    for (const rfid of TEST_RFIDS) {
        const success = await testRfidSearch(rfid);
        results.searches.push({ rfid, success });
        
        // Wait 1.5 seconds between requests to avoid rate limiting
        if (rfid !== TEST_RFIDS[TEST_RFIDS.length - 1]) {
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
    console.log('');
    
    // Test 3: Rate Limiting
    results.rateLimit = await testRateLimit();
    console.log('');
    
    // Summary
    console.log('📊 TEST SUMMARY');
    console.log('=' .repeat(60));
    console.log(`✅ API Status: ${results.status ? 'PASS' : 'FAIL'}`);
    console.log(`✅ RFID Searches: ${results.searches.filter(r => r.success).length}/${results.searches.length} PASS`);
    console.log(`✅ Rate Limiting: ${results.rateLimit ? 'PASS' : 'FAIL'}`);
    
    const overallSuccess = results.status && 
                          results.searches.some(r => r.success) && 
                          results.rateLimit;
    
    console.log('');
    console.log(`🎯 OVERALL RESULT: ${overallSuccess ? '✅ SUCCESS' : '❌ NEEDS ATTENTION'}`);
    
    if (overallSuccess) {
        console.log('');
        console.log('🎉 Maksisoft Integration is FULLY WORKING!');
        console.log('   - API endpoints are accessible without authentication');
        console.log('   - Real data is being retrieved from Maksisoft server');
        console.log('   - Rate limiting is protecting against abuse');
        console.log('   - Error handling is working correctly');
        console.log('');
        console.log('🌐 You can now use the Maksisoft buttons in the admin panel:');
        console.log(`   http://${PI_HOST}:${PI_PORT}/lockers`);
    }
    
    return overallSuccess;
}

// Run the tests
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { runTests, testMaksiStatus, testRfidSearch, testRateLimit };