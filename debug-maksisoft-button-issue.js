/**
 * Debug Script for Maksisoft Button Issue
 * 
 * This script helps diagnose why the "Üye Bilgisi" button is not working
 */

const http = require('http');

// Test configuration
const PI_HOST = '192.168.1.8';
const PI_PORT = 3001;
const TEST_RFID = '0006851540'; // Known working RFID

/**
 * Make HTTP request to test API
 */
function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: PI_HOST,
            port: PI_PORT,
            path: path,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Debug-Script/1.0'
            }
        };

        console.log(`🔍 Making request to: http://${PI_HOST}:${PI_PORT}${path}`);

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log(`📡 Response Status: ${res.statusCode}`);
                console.log(`📡 Response Headers:`, res.headers);
                
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed, raw: data });
                } catch (e) {
                    console.log(`📡 Raw Response: ${data}`);
                    resolve({ status: res.statusCode, data: null, raw: data, parseError: e.message });
                }
            });
        });

        req.on('error', (err) => {
            console.error(`❌ Request Error: ${err.message}`);
            reject(err);
        });

        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

/**
 * Test panel service health
 */
async function testPanelHealth() {
    console.log('\n🏥 Testing Panel Service Health...');
    try {
        const result = await makeRequest('/health');
        if (result.status === 200) {
            console.log('✅ Panel service is healthy');
            console.log('📊 Health data:', result.data);
            return true;
        } else {
            console.log(`❌ Panel service unhealthy: ${result.status}`);
            return false;
        }
    } catch (error) {
        console.log(`❌ Panel service unreachable: ${error.message}`);
        return false;
    }
}

/**
 * Test Maksisoft API status
 */
async function testMaksiStatus() {
    console.log('\n🔍 Testing Maksisoft API Status...');
    try {
        const result = await makeRequest('/api/maksi/status');
        console.log(`📊 Status Response:`, result);
        
        if (result.status === 200 && result.data) {
            console.log(`✅ Maksisoft API Status: enabled=${result.data.enabled}, available=${result.data.available}`);
            return result.data.enabled === true;
        } else {
            console.log(`❌ Maksisoft API Status failed: ${result.status}`);
            return false;
        }
    } catch (error) {
        console.log(`❌ Maksisoft API Status error: ${error.message}`);
        return false;
    }
}

/**
 * Test RFID search with detailed logging
 */
async function testRfidSearch(rfid) {
    console.log(`\n🔍 Testing RFID Search: ${rfid}`);
    try {
        const result = await makeRequest(`/api/maksi/search-by-rfid?rfid=${encodeURIComponent(rfid)}`);
        
        console.log(`📊 Search Response Status: ${result.status}`);
        console.log(`📊 Search Response Data:`, result.data);
        console.log(`📊 Raw Response:`, result.raw);
        
        if (result.parseError) {
            console.log(`❌ JSON Parse Error: ${result.parseError}`);
        }
        
        if (result.status === 200 && result.data && result.data.success) {
            console.log(`✅ Search successful: Found ${result.data.hits.length} results`);
            if (result.data.hits.length > 0) {
                console.log(`👤 First result:`, result.data.hits[0]);
            }
            return true;
        } else if (result.data && result.data.error) {
            console.log(`⚠️ Search returned error: ${result.data.error}`);
            return false;
        } else {
            console.log(`❌ Unexpected response format`);
            return false;
        }
    } catch (error) {
        console.log(`❌ Search request failed: ${error.message}`);
        return false;
    }
}

/**
 * Test browser-side JavaScript simulation
 */
async function testBrowserSimulation() {
    console.log('\n🌐 Testing Browser-side Simulation...');
    
    // Simulate the exact same call that the browser makes
    const testRfid = TEST_RFID;
    console.log(`🔍 Simulating browser call for RFID: ${testRfid}`);
    
    try {
        const result = await makeRequest(`/api/maksi/search-by-rfid?rfid=${encodeURIComponent(testRfid)}`);
        
        // Simulate the browser's response handling
        const ok = result.status === 200 && result.data && result.data.success !== false;
        const data = result.data || { success: false, error: 'network_error' };
        
        console.log(`🌐 Browser simulation result: ok=${ok}, data=`, data);
        
        if (!ok) {
            const errorMessages = {
                auth_error: 'Kimlik doğrulama hatası',
                rate_limited: 'Çok fazla istek',
                network_error: 'Bağlantı hatası',
                invalid_response: 'Geçersiz yanıt',
                unknown_error: 'Bilinmeyen hata',
                disabled: 'Özellik devre dışı'
            };
            
            const errorMsg = errorMessages[data.error] || 'Hata';
            console.log(`⚠️ Browser would show error: "${errorMsg}"`);
            return false;
        } else {
            const hits = Array.isArray(data.hits) ? data.hits : [];
            console.log(`✅ Browser would show ${hits.length} results`);
            return true;
        }
    } catch (error) {
        console.log(`❌ Browser simulation failed: ${error.message}`);
        return false;
    }
}

/**
 * Main diagnostic function
 */
async function runDiagnostics() {
    console.log('🚀 Starting Maksisoft Button Diagnostics');
    console.log('=' .repeat(60));
    
    const results = {
        panelHealth: false,
        maksiStatus: false,
        rfidSearch: false,
        browserSim: false
    };
    
    // Test 1: Panel Health
    results.panelHealth = await testPanelHealth();
    
    // Test 2: Maksisoft Status
    if (results.panelHealth) {
        results.maksiStatus = await testMaksiStatus();
    }
    
    // Test 3: RFID Search
    if (results.maksiStatus) {
        results.rfidSearch = await testRfidSearch(TEST_RFID);
    }
    
    // Test 4: Browser Simulation
    if (results.panelHealth) {
        results.browserSim = await testBrowserSimulation();
    }
    
    // Summary
    console.log('\n📊 DIAGNOSTIC SUMMARY');
    console.log('=' .repeat(60));
    console.log(`✅ Panel Health: ${results.panelHealth ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Maksisoft Status: ${results.maksiStatus ? 'PASS' : 'FAIL'}`);
    console.log(`✅ RFID Search: ${results.rfidSearch ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Browser Simulation: ${results.browserSim ? 'PASS' : 'FAIL'}`);
    
    // Diagnosis
    console.log('\n🔍 DIAGNOSIS');
    console.log('=' .repeat(60));
    
    if (!results.panelHealth) {
        console.log('❌ ISSUE: Panel service is not running or unreachable');
        console.log('💡 SOLUTION: Restart panel service or check network connectivity');
    } else if (!results.maksiStatus) {
        console.log('❌ ISSUE: Maksisoft integration is disabled or not configured');
        console.log('💡 SOLUTION: Check MAKSI_ENABLED=true in .env file');
    } else if (!results.rfidSearch && !results.browserSim) {
        console.log('❌ ISSUE: API is working but returning errors');
        console.log('💡 SOLUTION: Check network connectivity to Maksisoft server or session cookie');
    } else if (results.rfidSearch && !results.browserSim) {
        console.log('❌ ISSUE: API works but browser simulation fails');
        console.log('💡 SOLUTION: Check browser JavaScript console for errors');
    } else if (results.rfidSearch && results.browserSim) {
        console.log('✅ DIAGNOSIS: API is working correctly');
        console.log('💡 ISSUE: Problem might be in browser JavaScript or button event handling');
        console.log('💡 SOLUTION: Check browser console, ensure button has correct data attributes');
    }
    
    console.log('\n🌐 NEXT STEPS');
    console.log('=' .repeat(60));
    console.log('1. Open browser developer tools (F12)');
    console.log('2. Go to Console tab');
    console.log('3. Click the "Üye Bilgisi" button');
    console.log('4. Look for JavaScript errors or network requests');
    console.log('5. Check if the button has data-owner-rfid attribute');
    
    return results;
}

// Run diagnostics
if (require.main === module) {
    runDiagnostics().catch(console.error);
}

module.exports = { runDiagnostics, testPanelHealth, testMaksiStatus, testRfidSearch };