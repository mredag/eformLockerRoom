#!/usr/bin/env node

/**
 * Test WebSocket Connection - Task 12
 * 
 * This script tests the real-time WebSocket communication system
 * by connecting to the WebSocket server and monitoring state updates.
 */

const WebSocket = require('ws');

const WEBSOCKET_URL = process.env.WEBSOCKET_URL || 'ws://localhost:8080';
const TEST_DURATION = 30000; // 30 seconds

console.log('🔌 Testing WebSocket Connection');
console.log(`📡 Connecting to: ${WEBSOCKET_URL}`);
console.log(`⏱️  Test duration: ${TEST_DURATION / 1000} seconds`);
console.log('');

let messageCount = 0;
let connectionStartTime = Date.now();

const ws = new WebSocket(WEBSOCKET_URL);

ws.on('open', () => {
    console.log('✅ WebSocket connection established');
    console.log(`🕐 Connected at: ${new Date().toISOString()}`);
    console.log('');
    
    // Send a test ping
    ws.send(JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
    }));
});

ws.on('message', (data) => {
    messageCount++;
    
    try {
        const message = JSON.parse(data.toString());
        const timestamp = new Date().toISOString();
        
        console.log(`📨 Message ${messageCount} received at ${timestamp}:`);
        console.log(`   Type: ${message.type}`);
        
        switch (message.type) {
            case 'state_update':
                console.log(`   🔄 Locker State Update:`);
                console.log(`      Kiosk: ${message.data.kioskId}`);
                console.log(`      Locker: ${message.data.lockerId} (${message.data.displayName})`);
                console.log(`      State: ${message.data.state}`);
                console.log(`      Changed: ${message.data.lastChanged}`);
                break;
                
            case 'connection_status':
                console.log(`   🔌 Connection Status:`);
                console.log(`      Status: ${message.data.status}`);
                console.log(`      Clients: ${message.data.connectedClients}`);
                console.log(`      Last Update: ${message.data.lastUpdate}`);
                break;
                
            case 'heartbeat':
                console.log(`   💓 Heartbeat: ${message.data.ping ? 'ping' : 'pong'}`);
                break;
                
            case 'error':
                console.log(`   🚨 Error: ${message.data.error}`);
                if (message.data.details) {
                    console.log(`      Details: ${JSON.stringify(message.data.details)}`);
                }
                break;
                
            default:
                console.log(`   📋 Data: ${JSON.stringify(message.data)}`);
        }
        
        console.log('');
        
    } catch (error) {
        console.error(`🚨 Failed to parse message: ${error.message}`);
        console.log(`   Raw data: ${data.toString()}`);
        console.log('');
    }
});

ws.on('close', (code, reason) => {
    const duration = Date.now() - connectionStartTime;
    console.log(`🔌 WebSocket connection closed`);
    console.log(`   Code: ${code}`);
    console.log(`   Reason: ${reason || 'No reason provided'}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Messages received: ${messageCount}`);
    console.log('');
});

ws.on('error', (error) => {
    console.error(`🚨 WebSocket error: ${error.message}`);
    console.log('');
});

// Auto-close after test duration
setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
        console.log(`⏰ Test duration reached (${TEST_DURATION / 1000}s), closing connection...`);
        ws.close(1000, 'Test completed');
    }
}, TEST_DURATION);

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted by user');
    if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Test interrupted');
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Test terminated');
    if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Test terminated');
    }
    process.exit(0);
});

console.log('🔍 Monitoring WebSocket messages...');
console.log('   Press Ctrl+C to stop the test early');
console.log('');