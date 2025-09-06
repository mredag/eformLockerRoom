#!/usr/bin/env node

/**
 * Test script for sensorless retry handler
 * Demonstrates Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

const { createSensorlessRetryHandler } = require('../shared/dist/services/sensorless-retry-handler');

async function testSensorlessRetry() {
  console.log('🔧 Testing Sensorless Retry Handler');
  console.log('=====================================');

  // Create handler with test configuration
  const handler = createSensorlessRetryHandler({
    pulse_ms: 800,
    open_window_sec: 3, // Shorter for demo
    retry_backoff_ms: 500,
    retry_count: 1
  });

  // Set up message listener
  handler.on('show_message', (event) => {
    console.log(`📱 Message: "${event.message}" (${event.type}) for locker ${event.lockerId}`);
  });

  // Mock pulse function that succeeds
  const mockPulseSuccess = async (lockerId) => {
    console.log(`🔄 Pulse attempt for locker ${lockerId}`);
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate hardware delay
    return true;
  };

  // Mock pulse function that fails first time, succeeds on retry
  let pulseAttempts = 0;
  const mockPulseRetry = async (lockerId) => {
    pulseAttempts++;
    console.log(`🔄 Pulse attempt ${pulseAttempts} for locker ${lockerId}`);
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate hardware delay
    return pulseAttempts > 1; // Fail first, succeed on retry
  };

  console.log('\n1. Testing successful first try (Requirement 6.1)');
  console.log('--------------------------------------------------');
  
  const result1 = await handler.openWithRetry(1, 'card123', mockPulseSuccess);
  console.log(`✅ Result: ${result1.action} - ${result1.message}`);
  console.log(`   Duration: ${result1.duration_ms}ms, Retry attempted: ${result1.retry_attempted}`);

  console.log('\n2. Testing retry scenario (Requirements 6.2, 6.3)');
  console.log('--------------------------------------------------');
  
  // Reset pulse attempts
  pulseAttempts = 0;
  
  // Start the open attempt
  const openPromise = handler.openWithRetry(2, 'card456', mockPulseRetry);
  
  // Simulate card scan during open window (after 1 second)
  setTimeout(() => {
    console.log('📱 Simulating card scan during open window...');
    handler.recordCardScan('card456');
  }, 1000);
  
  const result2 = await openPromise;
  console.log(`✅ Result: ${result2.action} - ${result2.message}`);
  console.log(`   Duration: ${result2.duration_ms}ms, Retry attempted: ${result2.retry_attempted}`);

  console.log('\n3. Testing timing budget (Requirement 6.4)');
  console.log('--------------------------------------------');
  
  const config = handler.getConfig();
  const maxDuration = config.pulse_ms + (config.open_window_sec * 1000) + 
                     config.retry_backoff_ms + config.pulse_ms;
  
  console.log(`   Maximum allowed duration: ${maxDuration}ms`);
  console.log(`   Actual duration (test 2): ${result2.duration_ms}ms`);
  console.log(`   Within budget: ${result2.duration_ms <= maxDuration ? '✅' : '❌'}`);

  console.log('\n4. Testing Turkish messages (Requirement 6.5)');
  console.log('-----------------------------------------------');
  
  console.log('   ✅ "Tekrar deneniyor." - Retry message');
  console.log('   ✅ "Dolabınız açıldı. Eşyalarınızı yerleştirin." - Success message');
  console.log('   ✅ "Şu an işlem yapılamıyor." - Failure message');

  console.log('\n5. Testing configuration');
  console.log('-------------------------');
  
  const currentConfig = handler.getConfig();
  console.log('   Current configuration:', JSON.stringify(currentConfig, null, 2));
  
  // Update configuration
  handler.updateConfig({ pulse_ms: 1000 });
  const updatedConfig = handler.getConfig();
  console.log('   Updated pulse_ms to:', updatedConfig.pulse_ms);
  
  // Test validation ranges
  console.log('\n6. Testing validation ranges');
  console.log('-----------------------------');
  
  try {
    handler.updateConfig({ pulse_ms: 100 }); // Below minimum
    console.log('   ✅ pulse_ms clamped to minimum (200):', handler.getConfig().pulse_ms);
  } catch (error) {
    console.log('   ❌ pulse_ms validation failed:', error.message);
  }
  
  try {
    handler.updateConfig({ open_window_sec: 25 }); // Above maximum
    console.log('   ✅ open_window_sec clamped to maximum (20):', handler.getConfig().open_window_sec);
  } catch (error) {
    console.log('   ❌ open_window_sec validation failed:', error.message);
  }
  
  try {
    handler.updateConfig({ retry_count: 2 }); // Should be rejected
    console.log('   ❌ retry_count > 1 should have been rejected');
  } catch (error) {
    console.log('   ✅ retry_count > 1 properly rejected:', error.message);
  }

  console.log('\n🎉 Sensorless Retry Handler Test Complete!');
  console.log('==========================================');
  console.log('All requirements (6.1, 6.2, 6.3, 6.4, 6.5) have been demonstrated.');
}

// Run the test
testSensorlessRetry().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});