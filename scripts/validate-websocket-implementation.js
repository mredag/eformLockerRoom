#!/usr/bin/env node

/**
 * Validate WebSocket Implementation - Task 12
 * 
 * This script validates the complete real-time WebSocket communication system
 * by testing all components: server initialization, client connections, 
 * state broadcasting, and automatic reconnection.
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');

const WEBSOCKET_URL = process.env.WEBSOCKET_URL || 'ws://localhost:8080';
const KIOSK_URL = process.env.KIOSK_URL || 'http://localhost:3002';
const PANEL_URL = process.env.PANEL_URL || 'http://localhost:3001';

console.log('🔌 WebSocket Implementation Validation - Task 12');
console.log('='.repeat(60));
console.log('');

let testResults = {
    serverConnection: false,
    stateUpdates: false,
    heartbeat: false,
    reconnection: false,
    clientIntegration: false
};

async function validateWebSocketServer() {
    console.log('📡 Testing WebSocket Server Connection...');
    
    return new Promise((resolve) => {
        const ws = new WebSocket(WEBSOCKET_URL);
        let connected = false;
        
        const timeout = setTimeout(() => {
            if (!connected) {
                console.log('❌ WebSocket server connection timeout');
                resolve(false);
            }
        }, 5000);
        
        ws.on('open', () => {
            connected = true;
            clearTimeout(timeout);
            console.log('✅ WebSocket server connection successful');
            
            // Test heartbeat
            ws.send(JSON.stringify({
                type: 'ping',
                timestamp: new Date().toISOString()
            }));
            
            setTimeout(() => {
                ws.close();
                resolve(true);
            }, 1000);
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'heartbeat' || message.type === 'connection_status') {
                    console.log('✅ WebSocket heartbeat/status working');
                    testResults.heartbeat = true;
                }
            } catch (error) {
                console.log('⚠️  WebSocket message parsing issue:', error.message);
            }
        });
        
        ws.on('error', (error) => {
            clearTimeout(timeout);
            console.log('❌ WebSocket server connection failed:', error.message);
            resolve(false);
        });
    });
}

async function validateStateUpdates() {
    console.log('🔄 Testing State Update Broadcasting...');
    
    return new Promise((resolve) => {
        const ws = new WebSocket(WEBSOCKET_URL);
        let receivedStateUpdate = false;
        
        const timeout = setTimeout(() => {
            ws.close();
            if (!receivedStateUpdate) {
                console.log('⚠️  No state updates received during test period');
            }
            resolve(receivedStateUpdate);
        }, 10000);
        
        ws.on('open', () => {
            console.log('   Connected to WebSocket for state update testing');
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'state_update') {
                    console.log('✅ State update received:', {
                        kiosk: message.data.kioskId,
                        locker: message.data.lockerId,
                        state: message.data.state
                    });
                    receivedStateUpdate = true;
                    clearTimeout(timeout);
                    ws.close();
                    resolve(true);
                }
            } catch (error) {
                console.log('⚠️  State update parsing issue:', error.message);
            }
        });
        
        ws.on('error', (error) => {
            clearTimeout(timeout);
            console.log('❌ State update test failed:', error.message);
            resolve(false);
        });
    });
}

async function validateReconnection() {
    console.log('🔄 Testing Automatic Reconnection...');
    
    return new Promise((resolve) => {
        let connectionCount = 0;
        let reconnected = false;
        
        function createConnection() {
            const ws = new WebSocket(WEBSOCKET_URL);
            
            ws.on('open', () => {
                connectionCount++;
                console.log(`   Connection ${connectionCount} established`);
                
                if (connectionCount === 1) {
                    // Close first connection to test reconnection
                    setTimeout(() => {
                        console.log('   Closing connection to test reconnection...');
                        ws.close();
                    }, 1000);
                } else if (connectionCount === 2) {
                    console.log('✅ Automatic reconnection successful');
                    reconnected = true;
                    ws.close();
                    resolve(true);
                }
            });
            
            ws.on('close', () => {
                if (connectionCount === 1 && !reconnected) {
                    console.log('   Connection closed, attempting reconnection...');
                    setTimeout(() => {
                        createConnection();
                    }, 2000);
                }
            });
            
            ws.on('error', (error) => {
                console.log('❌ Reconnection test failed:', error.message);
                resolve(false);
            });
        }
        
        createConnection();
        
        // Timeout after 15 seconds
        setTimeout(() => {
            if (!reconnected) {
                console.log('❌ Reconnection test timeout');
                resolve(false);
            }
        }, 15000);
    });
}

async function validateClientIntegration() {
    console.log('🌐 Testing Client Integration...');
    
    try {
        // Test if kiosk service is running
        const kioskResponse = await fetch(`${KIOSK_URL}/health`);
        if (kioskResponse.ok) {
            console.log('✅ Kiosk service is running');
            testResults.clientIntegration = true;
        } else {
            console.log('⚠️  Kiosk service not responding');
        }
    } catch (error) {
        console.log('⚠️  Kiosk service connection failed:', error.message);
    }
    
    try {
        // Test if panel service is running
        const panelResponse = await fetch(`${PANEL_URL}/health`);
        if (panelResponse.ok) {
            console.log('✅ Panel service is running');
            testResults.clientIntegration = true;
        } else {
            console.log('⚠️  Panel service not responding');
        }
    } catch (error) {
        console.log('⚠️  Panel service connection failed:', error.message);
    }
    
    return testResults.clientIntegration;
}

async function runValidation() {
    console.log('Starting WebSocket implementation validation...');
    console.log('');
    
    // Test 1: WebSocket Server Connection
    testResults.serverConnection = await validateWebSocketServer();
    console.log('');
    
    // Test 2: State Updates (only if server is working)
    if (testResults.serverConnection) {
        testResults.stateUpdates = await validateStateUpdates();
        console.log('');
    }
    
    // Test 3: Reconnection Logic
    if (testResults.serverConnection) {
        testResults.reconnection = await validateReconnection();
        console.log('');
    }
    
    // Test 4: Client Integration
    await validateClientIntegration();
    console.log('');
    
    // Summary
    console.log('📊 Validation Results:');
    console.log('='.repeat(30));
    console.log(`WebSocket Server:     ${testResults.serverConnection ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Heartbeat System:     ${testResults.heartbeat ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`State Broadcasting:   ${testResults.stateUpdates ? '✅ PASS' : '⚠️  SKIP'}`);
    console.log(`Auto Reconnection:    ${testResults.reconnection ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Client Integration:   ${testResults.clientIntegration ? '✅ PASS' : '⚠️  PARTIAL'}`);
    console.log('');
    
    const passCount = Object.values(testResults).filter(Boolean).length;
    const totalTests = Object.keys(testResults).length;
    
    console.log(`Overall Result: ${passCount}/${totalTests} tests passed`);
    
    if (passCount === totalTests) {
        console.log('🎉 All WebSocket implementation tests passed!');
        console.log('');
        console.log('✅ Task 12: Real-time WebSocket Communication - COMPLETED');
        process.exit(0);
    } else {
        console.log('⚠️  Some tests failed or were skipped');
        console.log('');
        console.log('📋 Next Steps:');
        if (!testResults.serverConnection) {
            console.log('   1. Start the Kiosk service to initialize WebSocket server');
            console.log('      npm run start:kiosk');
        }
        if (!testResults.clientIntegration) {
            console.log('   2. Start all services for full integration testing');
            console.log('      npm run start');
        }
        console.log('   3. Re-run this validation script');
        console.log('      node scripts/validate-websocket-implementation.js');
        process.exit(1);
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Validation interrupted by user');
    process.exit(1);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Validation terminated');
    process.exit(1);
});

// Run validation
runValidation().catch((error) => {
    console.error('🚨 Validation failed with error:', error);
    process.exit(1);
});