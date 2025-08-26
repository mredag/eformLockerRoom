#!/usr/bin/env node

/**
 * Debug Relay Behavior Script
 * Tests pulse vs burst behavior and auto-close functionality
 */

const axios = require('axios');

const KIOSK_URL = 'http://localhost:3002';
const GATEWAY_URL = 'http://localhost:3000';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testRelayBehavior() {
  console.log('🔧 Debug: Relay Behavior Analysis');
  console.log('============================================================');
  
  try {
    // Test 1: Direct Kiosk API call
    console.log('\n📡 Test 1: Direct Kiosk API Call');
    console.log('----------------------------------------');
    
    const startTime = Date.now();
    
    const response = await axios.post(`${KIOSK_URL}/api/locker/open`, {
      locker_id: 1,
      staff_user: 'debug-test',
      reason: 'Testing relay behavior'
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Response: ${JSON.stringify(response.data, null, 2)}`);
    console.log(`⏱️  Duration: ${duration}ms`);
    
    // Wait and check if relay is still active
    console.log('\n⏳ Waiting 5 seconds to check relay status...');
    await sleep(5000);
    
    // Test 2: Check if we can activate again (relay should be closed)
    console.log('\n📡 Test 2: Second Activation (Should Work if Auto-Close Works)');
    console.log('----------------------------------------');
    
    const secondStart = Date.now();
    
    const secondResponse = await axios.post(`${KIOSK_URL}/api/locker/open`, {
      locker_id: 1,
      staff_user: 'debug-test-2',
      reason: 'Testing if relay closed properly'
    });
    
    const secondEnd = Date.now();
    const secondDuration = secondEnd - secondStart;
    
    console.log(`✅ Second Response: ${JSON.stringify(secondResponse.data, null, 2)}`);
    console.log(`⏱️  Second Duration: ${secondDuration}ms`);
    
    // Analysis
    console.log('\n🔍 Analysis:');
    console.log('----------------------------------------');
    
    if (duration > 2000) {
      console.log('⚠️  First activation took >2s - likely using BURST mode');
      console.log('   - Pulse (500ms) probably failed');
      console.log('   - Fell back to burst (2s + auto-close)');
    } else {
      console.log('✅ First activation took <2s - likely using PULSE mode');
      console.log('   - Pulse (500ms) succeeded with auto-close');
    }
    
    if (secondDuration > 2000) {
      console.log('❌ Second activation also took >2s - relay might be stuck');
      console.log('   - Auto-close might not be working');
    } else {
      console.log('✅ Second activation normal - auto-close working');
    }
    
    console.log('\n📋 Recommendations:');
    console.log('----------------------------------------');
    
    if (duration > 2000) {
      console.log('1. Pulse mode is failing - check hardware communication');
      console.log('2. Burst mode is working but takes longer');
      console.log('3. Consider improving pulse reliability');
    }
    
    if (secondDuration > 2000) {
      console.log('1. Auto-close might be failing');
      console.log('2. Check sendCloseRelay implementation');
      console.log('3. Verify hardware responds to close commands');
    }
    
  } catch (error) {
    console.error('❌ Error during relay behavior test:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Make sure Kiosk service is running on port 3002');
    }
  }
}

// Run the test
testRelayBehavior().catch(console.error);