/**
 * Simple test to verify session routes are working
 */

const fetch = require('node-fetch');

async function testSessionRoutes() {
    const baseUrl = 'http://localhost:3001';
    
    console.log('🧪 Testing session routes...');
    
    try {
        // Test live sessions endpoint
        console.log('Testing /api/sessions/live...');
        const liveResponse = await fetch(`${baseUrl}/api/sessions/live`);
        console.log(`Status: ${liveResponse.status}`);
        
        if (liveResponse.status === 401) {
            console.log('✅ Authentication required (expected for protected route)');
        } else if (liveResponse.status === 200) {
            const data = await liveResponse.json();
            console.log('✅ Live sessions endpoint working:', data);
        } else {
            console.log('❌ Unexpected status:', liveResponse.status);
        }
        
        // Test live sessions page
        console.log('\nTesting /live-sessions page...');
        const pageResponse = await fetch(`${baseUrl}/live-sessions`);
        console.log(`Status: ${pageResponse.status}`);
        
        if (pageResponse.status === 200) {
            console.log('✅ Live sessions page accessible');
        } else if (pageResponse.status === 401 || pageResponse.status === 302) {
            console.log('✅ Authentication required (expected)');
        } else {
            console.log('❌ Unexpected status:', pageResponse.status);
        }
        
        // Test analytics endpoint
        console.log('\nTesting /api/sessions/analytics...');
        const analyticsResponse = await fetch(`${baseUrl}/api/sessions/analytics`);
        console.log(`Status: ${analyticsResponse.status}`);
        
        if (analyticsResponse.status === 401) {
            console.log('✅ Authentication required (expected for protected route)');
        } else if (analyticsResponse.status === 200) {
            const data = await analyticsResponse.json();
            console.log('✅ Analytics endpoint working:', data);
        } else {
            console.log('❌ Unexpected status:', analyticsResponse.status);
        }
        
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log('❌ Panel service not running. Start it with: npm run start:panel');
        } else {
            console.error('❌ Test error:', error.message);
        }
    }
}

// Run the test
testSessionRoutes().then(() => {
    console.log('\n🏁 Session routes test completed');
}).catch(error => {
    console.error('❌ Test failed:', error);
});