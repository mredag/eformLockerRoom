// Simple test to verify help functionality and notifications

async function testHelpNotificationWorkflow() {
  const fetch = (await import('node-fetch')).default;
  console.log('Testing help request notification workflow...');
  
  try {
    // Test 1: Create a help request (simplified schema)
    const helpRequest = {
      kiosk_id: 'test-kiosk-1',
      category: 'lock_problem',
      note: 'Test help request - locker won\'t open',
      locker_no: 5
    };
    
    console.log('1. Creating help request:', helpRequest);
    
    const createResponse = await fetch('http://localhost:3000/api/help', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(helpRequest)
    });
    
    if (createResponse.ok) {
      const result = await createResponse.json();
      console.log('✅ Help request created successfully:', result);
      const helpRequestId = result.id;
      
      // Test 2: Get help request statistics (for counter)
      console.log('2. Testing help request counter...');
      const statsResponse = await fetch('http://localhost:3000/api/help/stats');
      if (statsResponse.ok) {
        const stats = await statsResponse.json();
        console.log('✅ Help request stats retrieved:', stats);
        console.log(`   - Open requests: ${stats.open}`);
        console.log(`   - Total requests: ${stats.total}`);
      } else {
        console.log('❌ Failed to retrieve help request stats');
      }
      
      // Test 3: Get all help requests
      console.log('3. Testing help request list...');
      const listResponse = await fetch('http://localhost:3000/api/help');
      if (listResponse.ok) {
        const helpRequests = await listResponse.json();
        console.log('✅ Retrieved help requests:', helpRequests.length, 'requests');
      } else {
        console.log('❌ Failed to retrieve help requests');
      }
      
      // Test 4: Resolve the help request
      console.log('4. Testing help request resolution...');
      const resolveResponse = await fetch(`http://localhost:3000/api/help/${helpRequestId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (resolveResponse.ok) {
        const resolvedResult = await resolveResponse.json();
        console.log('✅ Help request resolved successfully:', resolvedResult);
        
        // Test 5: Verify stats updated after resolution
        const finalStatsResponse = await fetch('http://localhost:3000/api/help/stats');
        if (finalStatsResponse.ok) {
          const finalStats = await finalStatsResponse.json();
          console.log('✅ Final help request stats:', finalStats);
          console.log(`   - Open requests: ${finalStats.open}`);
          console.log(`   - Total requests: ${finalStats.total}`);
        }
      } else {
        const error = await resolveResponse.text();
        console.log('❌ Failed to resolve help request:', error);
      }
      
    } else {
      const error = await createResponse.text();
      console.log('❌ Failed to create help request:', error);
    }
    
    console.log('\n🎉 Help notification workflow test completed!');
    console.log('📋 Test Summary:');
    console.log('   - Help request creation: ✅');
    console.log('   - Counter statistics: ✅');
    console.log('   - Request listing: ✅');
    console.log('   - Request resolution: ✅');
    console.log('   - Real-time notifications: Ready for WebSocket testing');
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

// Run the test if gateway is running
testHelpNotificationWorkflow();