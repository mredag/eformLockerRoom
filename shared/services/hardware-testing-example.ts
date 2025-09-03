/**
 * Hardware Testing Service Usage Example
 * Demonstrates how to use the HardwareTestingService for hardware validation
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { HardwareTestingService } from './hardware-testing-service';
import { ModbusConfig } from '../../app/kiosk/src/hardware/modbus-controller';

/**
 * Example: Basic Hardware Testing
 */
async function basicHardwareTest() {
  const testingService = new HardwareTestingService();

  // Configuration for testing
  const config: ModbusConfig = {
    port: '/dev/ttyUSB0',
    baudrate: 9600,
    timeout_ms: 5000,
    pulse_duration_ms: 400,
    burst_duration_seconds: 2,
    burst_interval_ms: 100,
    command_interval_ms: 300,
    test_mode: true // Important: Enable test mode
  };

  try {
    // Initialize the testing service
    console.log('🔧 Initializing hardware testing service...');
    await testingService.initialize(config);

    // Test communication with device at address 1
    console.log('📡 Testing communication...');
    const commResult = await testingService.testCommunication(1);
    console.log(`Communication test: ${commResult.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Details: ${commResult.details}`);

    if (commResult.success) {
      // Measure response time
      console.log('⏱️ Measuring response time...');
      const responseTime = await testingService.measureResponseTime(1);
      console.log(`Response time: ${responseTime}ms`);

      // Test individual relay
      console.log('🔌 Testing relay activation...');
      const relayResult = await testingService.testRelayActivation(1, 5);
      console.log(`Relay test: ${relayResult.success ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`Details: ${relayResult.details}`);
    }

  } catch (error) {
    console.error('❌ Hardware testing failed:', error);
  } finally {
    await testingService.cleanup();
  }
}

/**
 * Example: Comprehensive Hardware Testing
 */
async function comprehensiveHardwareTest() {
  const testingService = new HardwareTestingService();

  const config: ModbusConfig = {
    port: '/dev/ttyUSB0',
    baudrate: 9600,
    timeout_ms: 5000,
    pulse_duration_ms: 400,
    burst_duration_seconds: 2,
    burst_interval_ms: 100,
    command_interval_ms: 300,
    test_mode: true
  };

  // Set up event listeners for real-time feedback
  testingService.on('full_test_started', (data) => {
    console.log(`🚀 Starting full hardware test for address ${data.address}`);
  });

  testingService.on('test_completed', (data) => {
    console.log(`✅ Test completed: ${data.testName} - ${data.success ? 'PASS' : 'FAIL'}`);
  });

  testingService.on('relay_test_progress', (data) => {
    console.log(`🔄 Relay test progress: ${data.completedTests}/${data.totalTests} (Current: Relay ${data.currentRelay})`);
  });

  try {
    await testingService.initialize(config);

    // Run full hardware test suite
    console.log('🧪 Running comprehensive hardware test...');
    const testSuite = await testingService.runFullHardwareTest(1);

    console.log('\n📊 Test Results Summary:');
    console.log(`Total Tests: ${testSuite.totalTests}`);
    console.log(`Passed: ${testSuite.passedTests}`);
    console.log(`Failed: ${testSuite.failedTests}`);
    console.log(`Overall Success: ${testSuite.overallSuccess ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Duration: ${testSuite.duration}ms`);

    // Show individual test results
    console.log('\n📋 Individual Test Results:');
    testSuite.results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${result.testName} (${result.duration}ms)`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

  } catch (error) {
    console.error('❌ Comprehensive testing failed:', error);
  } finally {
    await testingService.cleanup();
  }
}

/**
 * Example: Reliability Testing
 */
async function reliabilityTest() {
  const testingService = new HardwareTestingService();

  const config: ModbusConfig = {
    port: '/dev/ttyUSB0',
    baudrate: 9600,
    timeout_ms: 5000,
    pulse_duration_ms: 400,
    burst_duration_seconds: 2,
    burst_interval_ms: 100,
    command_interval_ms: 300,
    test_mode: true
  };

  // Set up progress monitoring
  testingService.on('reliability_test_progress', (data) => {
    const percentage = Math.round((data.iteration / data.totalIterations) * 100);
    console.log(`🔄 Reliability test progress: ${percentage}% (${data.iteration}/${data.totalIterations}) - ${data.success ? 'PASS' : 'FAIL'} (${data.responseTime}ms)`);
  });

  try {
    await testingService.initialize(config);

    console.log('🔬 Running reliability test (20 iterations)...');
    const reliabilityResult = await testingService.testReliability(1, 20, {
      delayBetweenTests: 500,
      includeStressTest: true,
      maxConcurrentTests: 3
    });

    console.log('\n📈 Reliability Test Results:');
    console.log(`Total Iterations: ${reliabilityResult.totalIterations}`);
    console.log(`Successful: ${reliabilityResult.successfulIterations}`);
    console.log(`Failed: ${reliabilityResult.failedIterations}`);
    console.log(`Reliability: ${(reliabilityResult.reliability * 100).toFixed(2)}%`);
    console.log(`Error Rate: ${(reliabilityResult.errorRate * 100).toFixed(2)}%`);
    console.log(`Average Response Time: ${reliabilityResult.averageResponseTime.toFixed(2)}ms`);
    console.log(`Min Response Time: ${reliabilityResult.minResponseTime}ms`);
    console.log(`Max Response Time: ${reliabilityResult.maxResponseTime}ms`);

    if (reliabilityResult.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      reliabilityResult.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }

  } catch (error) {
    console.error('❌ Reliability testing failed:', error);
  } finally {
    await testingService.cleanup();
  }
}

/**
 * Example: System Integration Validation
 */
async function systemIntegrationTest() {
  const testingService = new HardwareTestingService();

  const config: ModbusConfig = {
    port: '/dev/ttyUSB0',
    baudrate: 9600,
    timeout_ms: 5000,
    pulse_duration_ms: 400,
    burst_duration_seconds: 2,
    burst_interval_ms: 100,
    command_interval_ms: 300,
    test_mode: true
  };

  try {
    await testingService.initialize(config);

    console.log('🔍 Validating system integration...');
    const integrationResult = await testingService.validateSystemIntegration();

    console.log('\n🏥 System Health Report:');
    console.log(`Overall System Health: ${integrationResult.systemHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
    console.log(`Services Running: ${integrationResult.servicesRunning ? '✅' : '❌'}`);
    console.log(`Configuration Valid: ${integrationResult.configurationValid ? '✅' : '❌'}`);
    console.log(`Hardware Responding: ${integrationResult.hardwareResponding ? '✅' : '❌'}`);
    console.log(`Lockers Accessible: ${integrationResult.lockersAccessible ? '✅' : '❌'}`);

    if (integrationResult.issues.length > 0) {
      console.log('\n⚠️ Issues Found:');
      integrationResult.issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`);
      });
    }

    if (integrationResult.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      integrationResult.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }

  } catch (error) {
    console.error('❌ System integration validation failed:', error);
  } finally {
    await testingService.cleanup();
  }
}

/**
 * Example: Wizard Integration Testing
 * Shows how the service would be used in the hardware configuration wizard
 */
async function wizardIntegrationExample() {
  const testingService = new HardwareTestingService();

  const config: ModbusConfig = {
    port: '/dev/ttyUSB0',
    baudrate: 9600,
    timeout_ms: 5000,
    pulse_duration_ms: 400,
    burst_duration_seconds: 2,
    burst_interval_ms: 100,
    command_interval_ms: 300,
    test_mode: true
  };

  // Simulate wizard step 4: Testing and Validation
  console.log('🧙‍♂️ Hardware Configuration Wizard - Step 4: Testing and Validation');

  try {
    await testingService.initialize(config);

    const newCardAddress = 2; // Newly configured card

    // Step 4.1: Test basic communication
    console.log('\n📡 Step 4.1: Testing communication...');
    const commTest = await testingService.testCommunication(newCardAddress);
    
    if (!commTest.success) {
      console.log('❌ Communication test failed. Please check connections.');
      return;
    }
    console.log('✅ Communication test passed');

    // Step 4.2: Test relay functionality
    console.log('\n🔌 Step 4.2: Testing relay functionality...');
    const relayTests = await testingService.testAllRelays(newCardAddress, {
      testRelays: [1, 8, 16], // Test relays as per requirements
      confirmationRequired: false // Automated testing
    });

    const relaysPassed = relayTests.filter(r => r.success).length;
    console.log(`Relay tests: ${relaysPassed}/${relayTests.length} passed`);

    if (relaysPassed < relayTests.length) {
      console.log('⚠️ Some relay tests failed. Please check hardware connections.');
    }

    // Step 4.3: Run comprehensive validation
    console.log('\n🧪 Step 4.3: Running comprehensive validation...');
    const fullTest = await testingService.runFullHardwareTest(newCardAddress);
    
    console.log(`\n📊 Final Results: ${fullTest.overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log(`Tests completed in ${fullTest.duration}ms`);

    if (fullTest.overallSuccess) {
      console.log('🎉 Hardware is ready for integration!');
    } else {
      console.log('⚠️ Please resolve issues before proceeding to integration.');
    }

  } catch (error) {
    console.error('❌ Wizard testing failed:', error);
  } finally {
    await testingService.cleanup();
  }
}

// Export examples for use
export {
  basicHardwareTest,
  comprehensiveHardwareTest,
  reliabilityTest,
  systemIntegrationTest,
  wizardIntegrationExample
};

// Run example if called directly
if (require.main === module) {
  console.log('🔧 Hardware Testing Service Examples\n');
  
  // Uncomment the example you want to run:
  // basicHardwareTest();
  // comprehensiveHardwareTest();
  // reliabilityTest();
  // systemIntegrationTest();
  wizardIntegrationExample();
}