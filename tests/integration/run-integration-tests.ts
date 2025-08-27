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