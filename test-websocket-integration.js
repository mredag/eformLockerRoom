#!/usr/bin/env node

/**
 * Integration test script for WebSocket locker updates
 * This script tests the real-time locker grid updates functionality
 * 
 * Usage: node test-websocket-integration.js
 */

const WebSocket = require('ws');
const fetch = require('node-fetch');

const GATEWAY_URL = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001';

async function testWebSocketIntegration() {
  console.log('🧪 Testing WebSocket Integration for Real-time Locker Updates');
  console.log('=' .repeat(60));

  try {
    // Test 1: Check if gateway is running
    console.log('1. Checking if gateway service is running...');
    try {
      const response = await fetch(`${GATEWAY_URL}/health`);
      if (response.ok) {
        console.log('✅ Gateway service is running');
      } else {
        throw new Error(`Gateway returned ${response.status}`);
      }
    } catch (error) {
      console.log('❌ Gateway service is not running');
      console.log('   Please start the gateway service first:');
      console.log('   cd app/gateway && npm run dev');
      return;
    }

    // Test 2: Test locker API endpoints
    console.log('\n2. Testing locker API endpoints...');
    try {
      const lockersResponse = await fetch(`${GATEWAY_URL}/api/lockers`);
      if (lockersResponse.ok) {
        const lockersData = await lockersResponse.json();
        console.log(`✅ Lockers API working - found ${lockersData.data?.length || 0} lockers`);
      } else {
        console.log('⚠️  Lockers API not available yet (expected for new setup)');
      }
    } catch (error) {
      console.log('⚠️  Lockers API not available:', error.message);
    }

    // Test 3: Test WebSocket connection
    console.log('\n3. Testing WebSocket connection...');
    
    const ws = new WebSocket(`${WS_URL}/ws/lockers?sessionId=test-session-123`);
    
    let connectionEstablished = false;
    let messageReceived = false;

    ws.on('open', () => {
      console.log('✅ WebSocket connection established');
      connectionEstablished = true;
      
      // Join locker updates room
      ws.send(JSON.stringify({
        type: 'join_room',
        data: { room: 'locker_updates' }
      }));
      
      console.log('📡 Joined locker_updates room');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 Received message:', message.type);
        
        if (message.type === 'locker_state_changed') {
          console.log('✅ Locker state change event received!');
          console.log('   Locker ID:', message.data?.lockerId);
          console.log('   Old State:', message.data?.oldState);
          console.log('   New State:', message.data?.newState);
          messageReceived = true;
        } else if (message.type === 'room_joined') {
          console.log('✅ Successfully joined room:', message.data?.room);
        } else if (message.type === 'connection') {
          console.log('✅ Connection confirmed:', message.data?.connectionId);
        }
      } catch (error) {
        console.log('❌ Error parsing message:', error.message);
      }
    });

    ws.on('error', (error) => {
      console.log('❌ WebSocket error:', error.message);
    });

    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket connection closed: ${code} ${reason}`);
    });

    // Test 4: Simulate locker state change (if API is available)
    setTimeout(async () => {
      console.log('\n4. Testing locker state change simulation...');
      
      try {
        // Try to trigger a locker state change
        const response = await fetch(`${GATEWAY_URL}/api/kiosks/test-kiosk/lockers/1/action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'assign',
            ownerType: 'rfid',
            ownerKey: 'test-card-123',
            staffUser: 'test-user'
          })
        });

        if (response.ok) {
          console.log('✅ Locker action triggered successfully');
          console.log('   Waiting for WebSocket event...');
        } else {
          console.log('⚠️  Could not trigger locker action (expected for new setup)');
        }
      } catch (error) {
        console.log('⚠️  Could not test locker action:', error.message);
      }
    }, 2000);

    // Test 5: Performance test
    setTimeout(() => {
      console.log('\n5. Testing WebSocket performance...');
      
      const startTime = Date.now();
      let pingReceived = false;

      const pingHandler = (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'pong') {
            const latency = Date.now() - startTime;
            console.log(`✅ WebSocket latency: ${latency}ms`);
            
            if (latency < 300) {
              console.log('✅ Latency meets requirement (<300ms on LAN)');
            } else {
              console.log('⚠️  Latency exceeds 300ms target');
            }
            
            pingReceived = true;
            ws.off('message', pingHandler);
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      ws.on('message', pingHandler);
      
      // Send ping
      ws.send(JSON.stringify({ type: 'ping' }));
      
      setTimeout(() => {
        if (!pingReceived) {
          console.log('⚠️  No pong response received');
        }
      }, 1000);
    }, 3000);

    // Cleanup and summary
    setTimeout(() => {
      console.log('\n' + '='.repeat(60));
      console.log('📊 Test Summary:');
      console.log(`   WebSocket Connection: ${connectionEstablished ? '✅' : '❌'}`);
      console.log(`   Message Handling: ${messageReceived ? '✅' : '⚠️  (no events triggered)'}`);
      console.log('\n🎯 Next Steps:');
      console.log('   1. Start the panel frontend: cd app/panel/frontend && npm run dev');
      console.log('   2. Open http://localhost:5173/lockers to see the real-time grid');
      console.log('   3. Use the API to trigger locker state changes and watch them update in real-time');
      
      ws.close();
      process.exit(0);
    }, 5000);

  } catch (error) {
    console.log('❌ Integration test failed:', error.message);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Test terminated');
  process.exit(0);
});

// Run the test
testWebSocketIntegration().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});