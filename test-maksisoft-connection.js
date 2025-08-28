#!/usr/bin/env node

/**
 * Test Maksisoft Integration Connection
 * 
 * This script tests the connection to Maksisoft API using the configured
 * environment variables. It helps verify that the integration is working
 * before deploying to production.
 */

// Load environment variables manually
const fs = require('fs');
const path = require('path');

function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    const env = {};
    
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split('=');
            if (key && !key.startsWith('#')) {
                env[key.trim()] = valueParts.join('=').trim();
            }
        });
    }
    
    return env;
}

const env = loadEnv();

const BASE_URL = env.MAKSI_BASE || 'https://eformhatay.maksionline.com';
const SEARCH_PATH = env.MAKSI_SEARCH_PATH || '/react-system/api_php/user_search/users.php';
const CRITERIA = env.MAKSI_CRITERIA_FOR_RFID || '0';
const COOKIE = env.MAKSI_BOOTSTRAP_COOKIE || '';
const ENABLED = env.MAKSI_ENABLED === 'true';

console.log('🔍 Testing Maksisoft Integration Connection...\n');

console.log('📋 Configuration:');
console.log(`   Base URL: ${BASE_URL}`);
console.log(`   Search Path: ${SEARCH_PATH}`);
console.log(`   Criteria: ${CRITERIA}`);
console.log(`   Cookie: ${COOKIE ? COOKIE.substring(0, 30) + '...' : 'NOT SET'}`);
console.log(`   Enabled: ${ENABLED}`);
console.log('');

if (!ENABLED) {
    console.log('❌ MAKSI_ENABLED is not set to "true"');
    console.log('   Set MAKSI_ENABLED=true in your .env file');
    process.exit(1);
}

if (!COOKIE) {
    console.log('❌ MAKSI_BOOTSTRAP_COOKIE is not set');
    console.log('   Update MAKSI_BOOTSTRAP_COOKIE in your .env file');
    process.exit(1);
}

async function testConnection() {
    // Test with a sample RFID number
    const testRfid = '0006851540';
    const searchUrl = `${BASE_URL}${SEARCH_PATH}?text=${encodeURIComponent(testRfid)}&criteria=${CRITERIA}`;
    
    console.log(`🌐 Testing connection to: ${searchUrl}`);
    console.log('');

    try {
        const response = await fetch(searchUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'eForm-Locker-System/1.0',
                'Cookie': COOKIE
            },
            redirect: 'manual'
        });

        console.log(`📡 Response Status: ${response.status} ${response.statusText}`);
        console.log(`📡 Content-Type: ${response.headers.get('content-type')}`);
        
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                console.log('❌ Authentication failed - cookie may be expired or invalid');
                console.log('   Please update MAKSI_BOOTSTRAP_COOKIE with a fresh session cookie');
            } else if (response.status >= 500) {
                console.log('❌ Server error - Maksisoft system may be down');
            } else {
                console.log(`❌ HTTP Error: ${response.status}`);
            }
            
            const errorText = await response.text();
            console.log('📄 Error Response:', errorText.substring(0, 200));
            return false;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            console.log('❌ Invalid response format - expected JSON');
            const responseText = await response.text();
            console.log('📄 Response:', responseText.substring(0, 200));
            return false;
        }

        const data = await response.json();
        console.log('✅ Connection successful!');
        console.log('');
        
        if (Array.isArray(data)) {
            console.log(`📊 Search Results: ${data.length} records found`);
            
            if (data.length > 0) {
                console.log('📋 Sample Record:');
                const sample = data[0];
                console.log(`   ID: ${sample.id}`);
                console.log(`   Name: ${sample.name || 'N/A'}`);
                console.log(`   RFID: ${sample.proximity || 'N/A'}`);
                console.log(`   Phone: ${sample.phone || sample.gsm || 'N/A'}`);
                console.log(`   Type: ${sample.type || 'N/A'}`);
                console.log(`   End Date: ${sample.endDate || 'N/A'}`);
            } else {
                console.log('ℹ️ No records found for test RFID');
            }
        } else {
            console.log('⚠️ Unexpected response format');
            console.log('📄 Response:', JSON.stringify(data, null, 2));
        }
        
        return true;

    } catch (error) {
        console.log('❌ Connection failed:', error.message);
        
        if (error.code === 'ENOTFOUND') {
            console.log('   DNS resolution failed - check BASE_URL');
        } else if (error.code === 'ECONNREFUSED') {
            console.log('   Connection refused - server may be down');
        } else if (error.code === 'ETIMEDOUT') {
            console.log('   Connection timeout - network or server issue');
        }
        
        return false;
    }
}

async function testPanelAPI() {
    console.log('\n🔧 Testing Panel API Integration...');
    
    try {
        // Test the panel API status endpoint
        const statusResponse = await fetch('http://localhost:3001/api/maksi/status');
        
        if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            console.log('✅ Panel API Status:', statusData);
        } else {
            console.log('⚠️ Panel API not running or not accessible');
            console.log('   Start the panel service: npm run start:panel');
        }
        
        // Test the search endpoint
        const searchResponse = await fetch('http://localhost:3001/api/maksi/search-by-rfid?rfid=0006851540');
        
        if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            console.log('✅ Panel API Search:', searchData.success ? 'Working' : 'Failed');
            if (searchData.hits) {
                console.log(`   Found ${searchData.hits.length} records`);
            }
        } else {
            console.log('⚠️ Panel API search failed');
            const errorData = await searchResponse.json().catch(() => ({}));
            console.log('   Error:', errorData.error || 'Unknown error');
        }
        
    } catch (error) {
        console.log('⚠️ Panel API test failed:', error.message);
        console.log('   Make sure the panel service is running on port 3001');
    }
}

async function main() {
    const directSuccess = await testConnection();
    
    if (directSuccess) {
        console.log('\n🎉 Maksisoft integration is ready to use!');
        console.log('\nNext steps:');
        console.log('1. Build and deploy: npm run build:panel');
        console.log('2. Restart services: ./scripts/start-all-clean.sh');
        console.log('3. Open admin panel: http://192.168.1.8:3001/lockers');
        console.log('4. Look for "Maksisoft" buttons on locker cards');
    } else {
        console.log('\n❌ Maksisoft integration needs configuration');
        console.log('\nTroubleshooting:');
        console.log('1. Check your internet connection');
        console.log('2. Verify MAKSI_BASE URL is correct');
        console.log('3. Update MAKSI_BOOTSTRAP_COOKIE with fresh session');
        console.log('4. Ensure Maksisoft system is accessible');
    }
    
    // Test panel API if it's running
    await testPanelAPI();
}

main().catch(console.error);