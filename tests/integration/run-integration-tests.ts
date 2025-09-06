#!/usr/bin/env tsx

/**
 * Integration Test Runner for Locker UI Improvements
 * 
 * This script runs comprehensive integration tests to validate:
 * - Session management lifecycle (Requirements 2.3, 8.2, 8.3, 8.4)
 * - Real-time state synchronization (Requirements 2.3, 7.6, 8.2, 8.3, 8.4)
 * - Turkish language display and error messages (Requirements 7.6)
 * - Accessibility requirements (Requirements 2.3, 8.2, 8.3, 8.4)
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

interface TestSuite {
  name: string;
  file: string;
  requirements: string[];
  description: string;
}

const TEST_SUITES: TestSuite[] = [
  // Core System Integration Tests
  {
    name: 'Session Management Lifecycle',
    file: 'session-management-lifecycle.test.ts',
    requirements: ['1.1', '1.2', '1.4', '1.5', '2.3', '8.2', '8.3', '8.4'],
    description: 'Tests RFID session creation, timeout, cancellation, and multi-user support'
  },
  {
    name: 'Real-time State Synchronization',
    file: 'real-time-state-sync.test.ts',
    requirements: ['6.1', '6.2', '6.4', '6.6', '8.2', '8.3', '8.4'],
    description: 'Tests WebSocket broadcasting, connection monitoring, and performance'
  },
  {
    name: 'Turkish Language Validation',
    file: 'turkish-language-validation.test.ts',
    requirements: ['5.1', '5.3', '5.5', '7.1', '7.2', '7.3', '7.4', '7.5', '7.6'],
    description: 'Tests Turkish character support, error messages, and localization'
  },
  {
    name: 'Accessibility Requirements',
    file: 'accessibility-requirements.test.ts',
    requirements: ['2.3', '3.7', '8.2', '8.3', '8.4'],
    description: 'Tests 2m readability, color-blind safety, touch targets, and responsive design'
  },
  {
    name: 'Backend Integration',
    file: 'backend-integration.test.ts',
    requirements: ['3.2', '3.4', '3.5'],
    description: 'Tests backend service integration and API communication'
  },
  {
    name: 'Admin Panel UI Improvements',
    file: 'admin-panel-ui-improvements.test.ts',
    requirements: ['3.2', '3.4', '3.5'],
    description: 'Tests admin panel UI enhancements and user experience'
  },
  {
    name: 'WebSocket Real-time UI Updates',
    file: 'websocket-realtime-ui-updates.test.ts',
    requirements: ['3.2', '3.4', '3.5'],
    description: 'Tests real-time UI updates via WebSocket connections'
  },
  {
    name: 'VIP Workflow Integration',
    file: 'vip-workflow-integration.test.ts',
    requirements: ['3.2', '3.4', '3.5'],
    description: 'Tests VIP contract management workflows across services'
  },
  {
    name: 'RFID and QR Integration',
    file: 'rfid-qr-integration.test.ts',
    requirements: ['3.2', '3.4', '3.5'],
    description: 'Tests RFID and QR code integration and user journeys'
  },
  {
    name: 'Multi-Service Integration',
    file: 'multi-service-integration.test.ts',
    requirements: ['3.2', '3.4', '3.5'],
    description: 'Tests coordination between Gateway, Kiosk, and Panel services'
  },
  {
    name: 'Multi-Room Coordination',
    file: 'multi-room-coordination.test.ts',
    requirements: ['3.2', '3.4', '3.5'],
    description: 'Tests cross-room locker operations and coordination'
  },
  {
    name: 'Gateway Service Integration',
    file: 'gateway-service-integration.test.ts',
    requirements: ['3.2', '3.4', '3.5'],
    description: 'Tests Gateway service coordination and command queue management'
  },
  
  // Smart Assignment Integration Tests
  {
    name: 'Smart Assignment E2E Flow',
    file: 'smart-assignment-e2e-flow.test.ts',
    requirements: ['1.1', '1.2', '1.3', '1.4', '1.5', '2.1', '2.2', '2.3', '2.4', '2.5'],
    description: 'Tests complete smart assignment flows from card scan to locker opening'
  },
  {
    name: 'Smart Assignment Feature Flag',
    file: 'smart-assignment-feature-flag.test.ts',
    requirements: ['9.1', '9.2', '9.3', '9.4', '9.5'],
    description: 'Tests feature flag switching between manual and smart assignment modes'
  },
  {
    name: 'Smart Assignment Concurrency',
    file: 'smart-assignment-concurrency.test.ts',
    requirements: ['19.1', '19.2', '19.3', '19.4', '19.5'],
    description: 'Tests concurrent assignment scenarios and race condition handling'
  },
  {
    name: 'Smart Assignment Hardware Retry',
    file: 'smart-assignment-hardware-retry.test.ts',
    requirements: ['6.1', '6.2', '6.3', '6.4', '6.5'],
    description: 'Tests hardware integration, sensorless retry logic, and timing constraints'
  },
  {
    name: 'Smart Assignment Performance Load',
    file: 'smart-assignment-performance-load.test.ts',
    requirements: ['All requirements under load conditions'],
    description: 'Tests performance requirements and load handling capabilities'
  }
];

class IntegrationTestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Integration Tests for Locker UI Improvements');
    console.log('=' .repeat(80));
    
    this.startTime = Date.now();

    // Validate test environment
    await this.validateEnvironment();

    // Run each test suite
    for (const suite of TEST_SUITES) {
      await this.runTestSuite(suite);
    }

    // Generate summary report
    this.generateSummaryReport();
  }

  private async validateEnvironment(): Promise<void> {
    console.log('🔍 Validating test environment...');

    // Check if test files exist
    for (const suite of TEST_SUITES) {
      const testPath = join(process.cwd(), 'tests/integration', suite.file);
      if (!existsSync(testPath)) {
        throw new Error(`Test file not found: ${testPath}`);
      }
    }

    // Check if vitest is available
    try {
      execSync('npx vitest --version', { stdio: 'pipe' });
    } catch (error) {
      throw new Error('Vitest is not available. Please install it: npm install -D vitest');
    }

    // Check if required dependencies are available
    const requiredFiles = [
      'shared/services/i18n-service.ts',
      'shared/services/locker-naming-service.ts',
      'shared/services/locker-state-manager.ts',
      'shared/services/websocket-service.ts',
      'app/kiosk/src/controllers/session-manager.ts'
    ];

    for (const file of requiredFiles) {
      const filePath = join(process.cwd(), file);
      if (!existsSync(filePath)) {
        console.warn(`⚠️  Warning: Required file not found: ${file}`);
      }
    }

    console.log('✅ Environment validation complete');
    console.log('');
  }

  private async runTestSuite(suite: TestSuite): Promise<void> {
    console.log(`📋 Running: ${suite.name}`);
    console.log(`   File: ${suite.file}`);
    console.log(`   Requirements: ${suite.requirements.join(', ')}`);
    console.log(`   Description: ${suite.description}`);
    console.log('');

    const startTime = Date.now();
    let passed = false;
    let error: string | undefined;

    try {
      // Run the test using vitest
      const testPath = join('tests/integration', suite.file);
      const command = `npx vitest run ${testPath} --reporter=verbose`;
      
      execSync(command, { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      passed = true;
      console.log(`✅ ${suite.name} - PASSED`);
    } catch (err) {
      passed = false;
      error = err instanceof Error ? err.message : 'Unknown error';
      console.log(`❌ ${suite.name} - FAILED`);
      console.log(`   Error: ${error}`);
    }

    const duration = Date.now() - startTime;
    
    this.results.push({
      name: suite.name,
      passed,
      duration,
      error
    });

    console.log(`   Duration: ${duration}ms`);
    console.log('');
  }

  private generateSummaryReport(): void {
    const totalDuration = Date.now() - this.startTime;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = this.results.filter(r => !r.passed).length;
    const totalTests = this.results.length;

    console.log('📊 Integration Test Summary Report');
    console.log('=' .repeat(80));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log('');

    // Detailed results
    console.log('📋 Detailed Results:');
    console.log('-'.repeat(80));
    
    this.results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${result.name} (${result.duration}ms)`);
      
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    });

    console.log('');

    // Requirements coverage
    this.generateRequirementsCoverage();

    // Performance analysis
    this.generatePerformanceAnalysis();

    // Exit with appropriate code
    if (failedTests > 0) {
      console.log('❌ Some tests failed. Please review the errors above.');
      process.exit(1);
    } else {
      console.log('✅ All integration tests passed successfully!');
      process.exit(0);
    }
  }

  private generateRequirementsCoverage(): void {
    console.log('📋 Requirements Coverage:');
    console.log('-'.repeat(80));

    const allRequirements = new Set<string>();
    const coveredRequirements = new Set<string>();

    TEST_SUITES.forEach(suite => {
      suite.requirements.forEach(req => {
        allRequirements.add(req);
        
        const testResult = this.results.find(r => r.name === suite.name);
        if (testResult?.passed) {
          coveredRequirements.add(req);
        }
      });
    });

    const coveragePercentage = (coveredRequirements.size / allRequirements.size) * 100;

    console.log(`Requirements Covered: ${coveredRequirements.size}/${allRequirements.size} (${coveragePercentage.toFixed(1)}%)`);
    console.log('');

    // List covered requirements
    console.log('✅ Covered Requirements:');
    Array.from(coveredRequirements).sort().forEach(req => {
      console.log(`   - Requirement ${req}`);
    });

    // List uncovered requirements
    const uncoveredRequirements = Array.from(allRequirements).filter(req => 
      !coveredRequirements.has(req)
    );

    if (uncoveredRequirements.length > 0) {
      console.log('');
      console.log('❌ Uncovered Requirements:');
      uncoveredRequirements.sort().forEach(req => {
        console.log(`   - Requirement ${req}`);
      });
    }

    console.log('');
  }

  private generatePerformanceAnalysis(): void {
    console.log('⚡ Performance Analysis:');
    console.log('-'.repeat(80));

    const totalDuration = this.results.reduce((sum, result) => sum + result.duration, 0);
    const averageDuration = totalDuration / this.results.length;

    console.log(`Average Test Duration: ${averageDuration.toFixed(0)}ms`);

    // Performance thresholds
    const performanceThresholds = {
      fast: 5000,    // Under 5 seconds
      medium: 15000, // Under 15 seconds
      slow: 30000    // Under 30 seconds
    };

    this.results.forEach(result => {
      let performance = '🐌 Slow';
      if (result.duration < performanceThresholds.fast) {
        performance = '🚀 Fast';
      } else if (result.duration < performanceThresholds.medium) {
        performance = '⚡ Medium';
      }

      console.log(`${performance} ${result.name}: ${result.duration}ms`);
    });

    console.log('');

    // Performance recommendations
    const slowTests = this.results.filter(r => r.duration > performanceThresholds.medium);
    if (slowTests.length > 0) {
      console.log('💡 Performance Recommendations:');
      slowTests.forEach(test => {
        console.log(`   - Optimize ${test.name} (${test.duration}ms)`);
      });
      console.log('');
    }
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    const runner = new IntegrationTestRunner();
    await runner.runAllTests();
  } catch (error) {
    console.error('❌ Integration test runner failed:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { IntegrationTestRunner, TEST_SUITES };