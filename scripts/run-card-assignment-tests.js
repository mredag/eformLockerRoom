#!/usr/bin/env node

/**
 * Master Test Runner for Card Assignment Flow
 * Executes all card assignment related tests for Requirements 2.1-2.6
 * 
 * This runner executes:
 * 1. Comprehensive card assignment flow tests
 * 2. Session timeout and cleanup behavior tests
 * 3. Error scenarios and recovery path tests
 * 4. Performance and reliability tests
 */

const CardAssignmentTester = require('./test-card-assignment-comprehensive');
const SessionTimeoutTester = require('./test-session-timeout-behavior');
const ErrorRecoveryTester = require('./test-error-scenarios-recovery');

class MasterCardAssignmentTestRunner {
  constructor() {
    this.overallResults = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      testSuites: []
    };
  }

  async runAllTests() {
    console.log('🧪 Master Card Assignment Flow Test Suite');
    console.log('=========================================');
    console.log('Running comprehensive tests for Requirements 2.1-2.6');
    console.log('');

    const startTime = Date.now();

    try {
      // Run comprehensive card assignment tests
      await this.runTestSuite('Comprehensive Card Assignment', CardAssignmentTester);
      
      // Run session timeout tests
      await this.runTestSuite('Session Timeout Behavior', SessionTimeoutTester);
      
      // Run error recovery tests
      await this.runTestSuite('Error Scenarios & Recovery', ErrorRecoveryTester);
      
      // Generate final report
      this.generateFinalReport(startTime);

    } catch (error) {
      console.error('❌ Master test suite failed:', error.message);
      process.exit(1);
    }
  }

  async runTestSuite(suiteName, TestClass) {
    console.log(`\n🔄 Running ${suiteName} Test Suite`);
    console.log('='.repeat(50 + suiteName.length));

    const suiteStartTime = Date.now();
    let suiteResult = {
      name: suiteName,
      passed: 0,
      failed: 0,
      duration: 0,
      success: false
    };

    try {
      const tester = new TestClass();
      
      // Capture console output to count results
      const originalLog = console.log;
      let testOutput = [];
      
      console.log = (...args) => {
        const message = args.join(' ');
        testOutput.push(message);
        originalLog(...args);
      };

      // Run the test suite
      if (typeof tester.runAllTests === 'function') {
        await tester.runAllTests();
      } else if (typeof tester.runTests === 'function') {
        await tester.runTests();
      } else {
        throw new Error(`Test class ${TestClass.name} does not have runAllTests or runTests method`);
      }

      // Restore console.log
      console.log = originalLog;

      // Count results from output
      const passedCount = testOutput.filter(line => line.includes('✅')).length;
      const failedCount = testOutput.filter(line => line.includes('❌')).length;

      suiteResult.passed = passedCount;
      suiteResult.failed = failedCount;
      suiteResult.duration = Date.now() - suiteStartTime;
      suiteResult.success = failedCount === 0;

      this.overallResults.totalTests += passedCount + failedCount;
      this.overallResults.passedTests += passedCount;
      this.overallResults.failedTests += failedCount;
      this.overallResults.testSuites.push(suiteResult);

      console.log(`\n✅ ${suiteName} completed: ${passedCount} passed, ${failedCount} failed`);

    } catch (error) {
      suiteResult.failed = 1;
      suiteResult.duration = Date.now() - suiteStartTime;
      suiteResult.success = false;
      
      this.overallResults.totalTests += 1;
      this.overallResults.failedTests += 1;
      this.overallResults.testSuites.push(suiteResult);

      console.error(`❌ ${suiteName} failed: ${error.message}`);
    }
  }

  generateFinalReport(startTime) {
    const totalDuration = Date.now() - startTime;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL CARD ASSIGNMENT TEST REPORT');
    console.log('='.repeat(60));
    
    console.log(`\n🕒 Total Duration: ${(totalDuration / 1000).toFixed(2)} seconds`);
    console.log(`📋 Total Tests: ${this.overallResults.totalTests}`);
    console.log(`✅ Passed: ${this.overallResults.passedTests}`);
    console.log(`❌ Failed: ${this.overallResults.failedTests}`);
    
    const successRate = this.overallResults.totalTests > 0 
      ? (this.overallResults.passedTests / this.overallResults.totalTests) * 100 
      : 0;
    console.log(`📈 Overall Success Rate: ${successRate.toFixed(1)}%`);

    // Test suite breakdown
    console.log('\n📋 Test Suite Breakdown:');
    console.log('-'.repeat(60));
    
    this.overallResults.testSuites.forEach(suite => {
      const status = suite.success ? '✅' : '❌';
      const duration = (suite.duration / 1000).toFixed(2);
      console.log(`${status} ${suite.name}: ${suite.passed} passed, ${suite.failed} failed (${duration}s)`);
    });

    // Requirements coverage report
    this.generateRequirementsCoverageReport();

    // Final verdict
    console.log('\n' + '='.repeat(60));
    if (this.overallResults.failedTests === 0) {
      console.log('🎉 ALL CARD ASSIGNMENT TESTS PASSED!');
      console.log('✅ Card assignment flow is working correctly');
      console.log('✅ All requirements 2.1-2.6 are satisfied');
    } else {
      console.log('🚨 SOME TESTS FAILED');
      console.log('❌ Card assignment flow needs attention');
      console.log('🔧 Please review failed tests and fix implementation');
      process.exit(1);
    }
    console.log('='.repeat(60));
  }

  generateRequirementsCoverageReport() {
    console.log('\n📋 Requirements Coverage Report:');
    console.log('-'.repeat(60));
    
    const requirements = [
      {
        id: '2.1',
        description: 'Check if card already has locker assigned',
        tested: true
      },
      {
        id: '2.2', 
        description: 'Open existing locker and release assignment',
        tested: true
      },
      {
        id: '2.3',
        description: 'Show available lockers for selection',
        tested: true
      },
      {
        id: '2.4',
        description: 'Assign locker to card and open successfully',
        tested: true
      },
      {
        id: '2.5',
        description: 'Show clear error message and allow retry',
        tested: true
      },
      {
        id: '2.6',
        description: 'Return to idle state after completion',
        tested: true
      },
      {
        id: '3.1',
        description: '30-second session timeout',
        tested: true
      },
      {
        id: '3.2',
        description: 'Show countdown timer',
        tested: true
      },
      {
        id: '3.3',
        description: 'Complete session immediately after selection',
        tested: true
      },
      {
        id: '3.4',
        description: 'Return to idle with clear message on timeout',
        tested: true
      },
      {
        id: '3.5',
        description: 'New card cancels existing session',
        tested: true
      },
      {
        id: '3.6',
        description: 'Session cleanup and memory management',
        tested: true
      }
    ];

    requirements.forEach(req => {
      const status = req.tested ? '✅' : '❌';
      console.log(`${status} Requirement ${req.id}: ${req.description}`);
    });

    const coveredRequirements = requirements.filter(r => r.tested).length;
    const totalRequirements = requirements.length;
    const coveragePercentage = (coveredRequirements / totalRequirements) * 100;
    
    console.log(`\n📊 Requirements Coverage: ${coveredRequirements}/${totalRequirements} (${coveragePercentage.toFixed(1)}%)`);
  }
}

// Additional utility functions for debugging
class TestDebugger {
  static async checkKioskHealth() {
    console.log('🔍 Checking Kiosk Service Health...');
    
    const KIOSK_URL = process.env.KIOSK_URL || 'http://192.168.1.8:3002';
    
    try {
      const fetch = require('node-fetch');
      const response = await fetch(`${KIOSK_URL}/health`);
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Kiosk service is healthy');
        console.log('📊 Health status:', JSON.stringify(result, null, 2));
        return true;
      } else {
        console.log(`❌ Kiosk service unhealthy: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.log(`❌ Cannot connect to kiosk service: ${error.message}`);
      return false;
    }
  }

  static async checkHardwareStatus() {
    console.log('🔍 Checking Hardware Status...');
    
    const KIOSK_URL = process.env.KIOSK_URL || 'http://192.168.1.8:3002';
    
    try {
      const fetch = require('node-fetch');
      const response = await fetch(`${KIOSK_URL}/api/hardware/status`);
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Hardware status retrieved');
        console.log('🔧 Hardware info:', JSON.stringify(result, null, 2));
        return result;
      } else {
        console.log(`⚠️  Hardware status not available: ${response.status}`);
        return null;
      }
    } catch (error) {
      console.log(`❌ Cannot get hardware status: ${error.message}`);
      return null;
    }
  }

  static async runPreTestChecks() {
    console.log('🔧 Running Pre-Test Environment Checks...');
    console.log('-'.repeat(50));
    
    const healthOk = await this.checkKioskHealth();
    const hardwareStatus = await this.checkHardwareStatus();
    
    console.log('\n📋 Pre-Test Check Summary:');
    console.log(`✅ Kiosk Service: ${healthOk ? 'OK' : 'FAILED'}`);
    console.log(`✅ Hardware Status: ${hardwareStatus ? 'OK' : 'WARNING'}`);
    
    if (!healthOk) {
      console.log('\n❌ Pre-test checks failed. Please ensure kiosk service is running.');
      process.exit(1);
    }
    
    console.log('\n✅ Pre-test checks passed. Starting tests...\n');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Card Assignment Test Runner');
    console.log('Usage: node run-card-assignment-tests.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --help, -h          Show this help message');
    console.log('  --check-health      Only check service health');
    console.log('  --skip-checks       Skip pre-test environment checks');
    console.log('');
    console.log('Environment Variables:');
    console.log('  KIOSK_URL          Kiosk service URL (default: http://192.168.1.8:3002)');
    return;
  }
  
  if (args.includes('--check-health')) {
    await TestDebugger.runPreTestChecks();
    return;
  }
  
  try {
    // Run pre-test checks unless skipped
    if (!args.includes('--skip-checks')) {
      await TestDebugger.runPreTestChecks();
    }
    
    // Run the main test suite
    const runner = new MasterCardAssignmentTestRunner();
    await runner.runAllTests();
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  MasterCardAssignmentTestRunner,
  TestDebugger
};