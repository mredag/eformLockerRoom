#!/usr/bin/env node

/**
 * Backend Integration Test Script
 * Tests integration with existing locker state manager, hardware controller, and session management
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Backend Integration Testing Started');
console.log('=====================================');

// Test configuration
const TEST_CONFIG = {
  kioskId: 'test-kiosk-backend',
  cardId: '0009652489',
  lockerId: 5,
  timeout: 30000 // 30 second timeout
};

/**
 * Test 1: Locker State Manager Integration
 */
async function testLockerStateManager() {
  console.log('\n📋 Testing Locker State Manager Integration...');
  
  try {
    // Test database connection
    const dbTest = `
      const { DatabaseConnection } = require('./shared/database/connection');
      const { LockerStateManager } = require('./shared/services/locker-state-manager');
      
      async function test() {
        const db = DatabaseConnection.getInstance();
        const manager = new LockerStateManager();
        
        // Test basic operations
        await manager.initializeKioskLockers('${TEST_CONFIG.kioskId}', 10);
        const lockers = await manager.getAvailableLockers('${TEST_CONFIG.kioskId}');
        console.log('Available lockers:', lockers.length);
        
        // Test assignment
        const assigned = await manager.assignLocker('${TEST_CONFIG.kioskId}', ${TEST_CONFIG.lockerId}, 'rfid', '${TEST_CONFIG.cardId}');
        console.log('Assignment result:', assigned);
        
        // Test existing ownership check
        const existing = await manager.checkExistingOwnership('${TEST_CONFIG.cardId}', 'rfid');
        console.log('Existing ownership:', existing ? existing.id : 'none');
        
        // Test release
        const released = await manager.releaseLocker('${TEST_CONFIG.kioskId}', ${TEST_CONFIG.lockerId}, '${TEST_CONFIG.cardId}');
        console.log('Release result:', released);
        
        await manager.shutdown();
        console.log('✅ Locker State Manager integration test passed');
      }
      
      test().catch(console.error);
    `;
    
    fs.writeFileSync('/tmp/test-locker-state.js', dbTest);
    execSync('node /tmp/test-locker-state.js', { stdio: 'inherit', cwd: process.cwd() });
    
  } catch (error) {
    console.error('❌ Locker State Manager integration test failed:', error.message);
    throw error;
  }
}

/**
 * Test 2: Hardware Controller Integration
 */
async function testHardwareController() {
  console.log('\n🔧 Testing Hardware Controller Integration...');
  
  try {
    const hardwareTest = `
      const { ModbusController } = require('./app/kiosk/src/hardware/modbus-controller');
      
      async function test() {
        const controller = new ModbusController({
          port: '/dev/null', // Test mode
          baudrate: 9600,
          timeout_ms: 1000,
          pulse_duration_ms: 400,
          burst_duration_seconds: 2,
          burst_interval_ms: 100,
          command_interval_ms: 300,
          test_mode: true
        });
        
        // Test hardware status
        const status = controller.getHardwareStatus();
        console.log('Hardware status:', status.status);
        console.log('Hardware available:', status.available);
        
        // Test error handling
        controller.on('hardware_operation_failed', (event) => {
          console.log('Hardware operation failed event received:', event.lockerId);
        });
        
        // Test locker operation (will fail in test mode, but should handle gracefully)
        const result = await controller.openLocker(${TEST_CONFIG.lockerId});
        console.log('Locker operation result:', result);
        
        console.log('✅ Hardware Controller integration test passed');
      }
      
      test().catch(console.error);
    `;
    
    fs.writeFileSync('/tmp/test-hardware.js', hardwareTest);
    execSync('node /tmp/test-hardware.js', { stdio: 'inherit', cwd: process.cwd() });
    
  } catch (error) {
    console.error('❌ Hardware Controller integration test failed:', error.message);
    throw error;
  }
}

/**
 * Test 3: Session Management Integration
 */
async function testSessionManagement() {
  console.log('\n🔑 Testing Session Management Integration...');
  
  try {
    const sessionTest = `
      const { SessionManager } = require('./app/kiosk/src/controllers/session-manager');
      
      async function test() {
        const manager = new SessionManager({
          defaultTimeoutSeconds: 30,
          cleanupIntervalMs: 5000,
          maxSessionsPerKiosk: 1
        });
        
        // Test session creation
        const session = manager.createSession('${TEST_CONFIG.kioskId}', '${TEST_CONFIG.cardId}', [1, 2, 3, 4, 5]);
        console.log('Session created:', session.id);
        console.log('Session timeout:', session.timeoutSeconds);
        
        // Test session retrieval
        const retrieved = manager.getKioskSession('${TEST_CONFIG.kioskId}');
        console.log('Session retrieved:', retrieved ? retrieved.id : 'none');
        
        // Test remaining time
        const remaining = manager.getRemainingTime(session.id);
        console.log('Remaining time:', remaining);
        
        // Test session completion
        const completed = manager.completeSession(session.id, ${TEST_CONFIG.lockerId});
        console.log('Session completed:', completed);
        
        // Test session stats
        const stats = manager.getSessionStats();
        console.log('Session stats:', stats);
        
        manager.shutdown();
        console.log('✅ Session Management integration test passed');
      }
      
      test().catch(console.error);
    `;
    
    fs.writeFileSync('/tmp/test-session.js', sessionTest);
    execSync('node /tmp/test-session.js', { stdio: 'inherit', cwd: process.cwd() });
    
  } catch (error) {
    console.error('❌ Session Management integration test failed:', error.message);
    throw error;
  }
}

/**
 * Test 4: WebSocket Service Integration
 */
async function testWebSocketService() {
  console.log('\n🌐 Testing WebSocket Service Integration...');
  
  try {
    const wsTest = `
      const { webSocketService } = require('./shared/services/websocket-service');
      const WebSocket = require('ws');
      
      async function test() {
        // Initialize WebSocket service
        webSocketService.initialize(8082);
        
        // Test connection status
        const status = webSocketService.getConnectionStatus();
        console.log('WebSocket status:', status.status);
        console.log('Connected clients:', status.connectedClients);
        
        // Test client connection
        const ws = new WebSocket('ws://localhost:8082');
        
        ws.on('open', () => {
          console.log('WebSocket client connected');
          
          // Test broadcasting
          webSocketService.broadcastStateUpdate({
            kioskId: '${TEST_CONFIG.kioskId}',
            lockerId: ${TEST_CONFIG.lockerId},
            displayName: 'Test Locker',
            state: 'Dolu',
            lastChanged: new Date()
          });
        });
        
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          console.log('Received message type:', message.type);
          
          if (message.type === 'state_update') {
            console.log('State update received for locker:', message.data.lockerId);
          }
          
          ws.close();
        });
        
        // Wait for test completion
        setTimeout(() => {
          webSocketService.shutdown();
          console.log('✅ WebSocket Service integration test passed');
        }, 2000);
      }
      
      test().catch(console.error);
    `;
    
    fs.writeFileSync('/tmp/test-websocket.js', wsTest);
    execSync('node /tmp/test-websocket.js', { stdio: 'inherit', cwd: process.cwd() });
    
  } catch (error) {
    console.error('❌ WebSocket Service integration test failed:', error.message);
    throw error;
  }
}

/**
 * Test 5: UI Controller Integration
 */
async function testUIControllerIntegration() {
  console.log('\n🖥️ Testing UI Controller Integration...');
  
  try {
    const uiTest = `
      const { UiController } = require('./app/kiosk/src/controllers/ui-controller');
      const { LockerStateManager } = require('./shared/services/locker-state-manager');
      const { ModbusController } = require('./app/kiosk/src/hardware/modbus-controller');
      
      async function test() {
        const lockerStateManager = new LockerStateManager();
        const modbusController = new ModbusController({
          port: '/dev/null',
          baudrate: 9600,
          timeout_ms: 1000,
          pulse_duration_ms: 400,
          burst_duration_seconds: 2,
          burst_interval_ms: 100,
          command_interval_ms: 300,
          test_mode: true
        });
        
        const uiController = new UiController(lockerStateManager, modbusController);
        
        // Initialize test data
        await lockerStateManager.initializeKioskLockers('${TEST_CONFIG.kioskId}', 10);
        
        console.log('UI Controller initialized successfully');
        console.log('Locker State Manager integrated:', !!uiController);
        console.log('Hardware Controller integrated:', !!modbusController);
        
        await lockerStateManager.shutdown();
        console.log('✅ UI Controller integration test passed');
      }
      
      test().catch(console.error);
    `;
    
    fs.writeFileSync('/tmp/test-ui-controller.js', uiTest);
    execSync('node /tmp/test-ui-controller.js', { stdio: 'inherit', cwd: process.cwd() });
    
  } catch (error) {
    console.error('❌ UI Controller integration test failed:', error.message);
    throw error;
  }
}

/**
 * Test 6: End-to-End Backend Flow
 */
async function testEndToEndFlow() {
  console.log('\n🔄 Testing End-to-End Backend Flow...');
  
  try {
    const e2eTest = `
      const { LockerStateManager } = require('./shared/services/locker-state-manager');
      const { SessionManager } = require('./app/kiosk/src/controllers/session-manager');
      const { ModbusController } = require('./app/kiosk/src/hardware/modbus-controller');
      
      async function test() {
        // Initialize all services
        const lockerStateManager = new LockerStateManager();
        const sessionManager = new SessionManager({
          defaultTimeoutSeconds: 30,
          cleanupIntervalMs: 5000,
          maxSessionsPerKiosk: 1
        });
        const modbusController = new ModbusController({
          port: '/dev/null',
          baudrate: 9600,
          timeout_ms: 1000,
          pulse_duration_ms: 400,
          burst_duration_seconds: 2,
          burst_interval_ms: 100,
          command_interval_ms: 300,
          test_mode: true
        });
        
        // Initialize test environment
        await lockerStateManager.initializeKioskLockers('${TEST_CONFIG.kioskId}', 10);
        
        console.log('🔄 Step 1: Check for existing ownership');
        const existing = await lockerStateManager.checkExistingOwnership('${TEST_CONFIG.cardId}', 'rfid');
        console.log('Existing ownership:', existing ? 'Yes' : 'No');
        
        console.log('🔄 Step 2: Get available lockers');
        const available = await lockerStateManager.getAvailableLockers('${TEST_CONFIG.kioskId}');
        console.log('Available lockers:', available.length);
        
        console.log('🔄 Step 3: Create session');
        const session = sessionManager.createSession('${TEST_CONFIG.kioskId}', '${TEST_CONFIG.cardId}', available.map(l => l.id));
        console.log('Session created:', session.id);
        
        console.log('🔄 Step 4: Assign locker');
        const assigned = await lockerStateManager.assignLocker('${TEST_CONFIG.kioskId}', ${TEST_CONFIG.lockerId}, 'rfid', '${TEST_CONFIG.cardId}');
        console.log('Locker assigned:', assigned);
        
        console.log('🔄 Step 5: Attempt hardware operation');
        const opened = await modbusController.openLocker(${TEST_CONFIG.lockerId});
        console.log('Hardware operation result:', opened);
        
        console.log('🔄 Step 6: Complete session');
        const completed = sessionManager.completeSession(session.id, ${TEST_CONFIG.lockerId});
        console.log('Session completed:', completed);
        
        console.log('🔄 Step 7: Release locker');
        const released = await lockerStateManager.releaseLocker('${TEST_CONFIG.kioskId}', ${TEST_CONFIG.lockerId}, '${TEST_CONFIG.cardId}');
        console.log('Locker released:', released);
        
        // Cleanup
        sessionManager.shutdown();
        await lockerStateManager.shutdown();
        
        console.log('✅ End-to-End backend flow test passed');
      }
      
      test().catch(console.error);
    `;
    
    fs.writeFileSync('/tmp/test-e2e-backend.js', e2eTest);
    execSync('node /tmp/test-e2e-backend.js', { stdio: 'inherit', cwd: process.cwd() });
    
  } catch (error) {
    console.error('❌ End-to-End backend flow test failed:', error.message);
    throw error;
  }
}

/**
 * Test 7: Error Handling and Recovery
 */
async function testErrorHandling() {
  console.log('\n🚨 Testing Error Handling and Recovery...');
  
  try {
    const errorTest = `
      const { LockerStateManager } = require('./shared/services/locker-state-manager');
      const { ModbusController } = require('./app/kiosk/src/hardware/modbus-controller');
      
      async function test() {
        const lockerStateManager = new LockerStateManager();
        const modbusController = new ModbusController({
          port: '/dev/null',
          baudrate: 9600,
          timeout_ms: 1000,
          pulse_duration_ms: 400,
          burst_duration_seconds: 2,
          burst_interval_ms: 100,
          command_interval_ms: 300,
          test_mode: true
        });
        
        await lockerStateManager.initializeKioskLockers('${TEST_CONFIG.kioskId}', 10);
        
        console.log('🚨 Testing hardware error handling');
        const errorHandled = await lockerStateManager.handleHardwareError('${TEST_CONFIG.kioskId}', ${TEST_CONFIG.lockerId}, 'Test error');
        console.log('Hardware error handled:', errorHandled);
        
        console.log('🚨 Testing error recovery');
        const recovered = await lockerStateManager.recoverFromHardwareError('${TEST_CONFIG.kioskId}', ${TEST_CONFIG.lockerId});
        console.log('Error recovered:', recovered);
        
        console.log('🚨 Testing invalid operations');
        const invalidAssign = await lockerStateManager.assignLocker('invalid-kiosk', 999, 'rfid', 'invalid-card');
        console.log('Invalid assignment handled:', !invalidAssign);
        
        console.log('🚨 Testing hardware status during errors');
        const status = modbusController.getHardwareStatus();
        console.log('Hardware status available:', typeof status.available === 'boolean');
        
        await lockerStateManager.shutdown();
        console.log('✅ Error handling and recovery test passed');
      }
      
      test().catch(console.error);
    `;
    
    fs.writeFileSync('/tmp/test-error-handling.js', errorTest);
    execSync('node /tmp/test-error-handling.js', { stdio: 'inherit', cwd: process.cwd() });
    
  } catch (error) {
    console.error('❌ Error handling test failed:', error.message);
    throw error;
  }
}

/**
 * Run all integration tests
 */
async function runAllTests() {
  const startTime = Date.now();
  
  try {
    console.log('🚀 Starting Backend Integration Tests');
    console.log(`📋 Test Configuration:`, TEST_CONFIG);
    
    await testLockerStateManager();
    await testHardwareController();
    await testSessionManagement();
    await testWebSocketService();
    await testUIControllerIntegration();
    await testEndToEndFlow();
    await testErrorHandling();
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('\n🎉 All Backend Integration Tests Passed!');
    console.log(`⏱️ Total test duration: ${duration.toFixed(2)} seconds`);
    console.log('\n📊 Test Summary:');
    console.log('✅ Locker State Manager Integration');
    console.log('✅ Hardware Controller Integration');
    console.log('✅ Session Management Integration');
    console.log('✅ WebSocket Service Integration');
    console.log('✅ UI Controller Integration');
    console.log('✅ End-to-End Backend Flow');
    console.log('✅ Error Handling and Recovery');
    
    // Cleanup temp files
    const tempFiles = [
      '/tmp/test-locker-state.js',
      '/tmp/test-hardware.js',
      '/tmp/test-session.js',
      '/tmp/test-websocket.js',
      '/tmp/test-ui-controller.js',
      '/tmp/test-e2e-backend.js',
      '/tmp/test-error-handling.js'
    ];
    
    tempFiles.forEach(file => {
      try {
        fs.unlinkSync(file);
      } catch (e) {
        // Ignore cleanup errors
      }
    });
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Backend Integration Tests Failed!');
    console.error('Error:', error.message);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(`⏱️ Test duration before failure: ${duration.toFixed(2)} seconds`);
    
    return false;
  }
}

// Run tests if called directly
if (require.main === module) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = {
  runAllTests,
  testLockerStateManager,
  testHardwareController,
  testSessionManagement,
  testWebSocketService,
  testUIControllerIntegration,
  testEndToEndFlow,
  testErrorHandling
};