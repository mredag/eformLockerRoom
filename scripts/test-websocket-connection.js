#!/usr/bin/env node

/**
 * Test WebSocket connection to Panel service
 * This script tests the WebSocket server that should be running on port 8080
 */

const WebSocket = require('ws');

const WEBSOCKET_URL = 'ws://192.168.1.8:8080';
const TEST_TIMEOUT = 10000; // 10 seconds

console.log('🔌 Testing WebSocket connection to Panel service...');
console.log(`📡 Connecting to: ${WEBSOCKET_URL}`);

const ws = new WebSocket(WEBSOCKET_URL);
let connected = false;
let messageReceived = false;

// Set timeout for the test
const timeout = setTimeout(() => {
  if (!connected) {
    console.log('❌ Test failed: Connection timeout');
    process.exit(1);
  }
}, TEST_TIMEOUT);

ws.on('open', () => {
  connected = true;
  console.log('✅ WebSocket connection established');
  
  // Send a ping message
  const pingMessage = {
    type: 'ping',
    timestamp: new Date().toISOString()
  };
  
  console.log('📤 Sending ping message:', pingMessage);
  ws.send(JSON.stringify(pingMessage));
});

ws.on('message', (data) => {
  messageReceived = true;
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 Received message:', message);
    
    if (message.type === 'heartbeat' && message.data.pong) {
      console.log('✅ Ping-pong test successful');
      console.log('🎉 WebSocket connection test PASSED');
      clearTimeout(timeout);
      ws.close();
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Failed to parse message:', error);
  }
});

ws.on('close', (code, reason) => {
  console.log(`🔌 WebSocket connection closed: ${code} ${reason}`);
  if (connected && messageReceived) {
    console.log('✅ Test completed successfully');
    process.exit(0);
  } else {
    console.log('❌ Test failed: Connection closed unexpectedly');
    process.exit(1);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  console.log('💡 Make sure the Panel service is running with WebSocket enabled');
  console.log('💡 Check if port 8080 is accessible and not blocked by firewall');
  clearTimeout(timeout);
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  clearTimeout(timeout);
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  process.exit(1);
});

console.log('⏳ Waiting for WebSocket connection...');