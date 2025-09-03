/**
 * Test Runner for Hardware Configuration Wizard
 * Runs all test suites in the correct order with proper setup and teardown
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface TestSuite {
  name: string;
  command: string;
  description: string;
  timeout: number;
}

const testSuites: TestSuite[] = [
  {
    name: 'unit',
    command: 'vitest run tests/unit/wizard-services.test.ts --reporter=verbose',
    description: 'Unit tests for wizard services',
    timeout: 60000
  },
  {
    name: 'integration',
    command: 'vitest run tests/integration/hardware-wizard-api.test.ts --reporter=verbose',
    description: 'Integration tests for API endpoints',
    timeout: 120000
  },
  {
    name: 'e2e',
    command: 'playwright test tests/e2e/hardware-wizard-flow.test.ts',
    description: 'End-to-end tests for wizard flow',
    timeout: 300000
  }
];

class TestRunner {
  private results: Map<string, { success: boolean; duration: number; error?: string }> = new Map();
  private startTime: number = 0;

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Hardware Configuration Wizard Test Suite');
    console.log('=' .repeat(60));
    
    this.startTime = Date.now();
    
    // Ensure test results directory exists
    const resultsDir = join(process.cwd(), 'test-results');
    if (!existsSync(resultsDir)) {
      mkdirSync(resultsDir, { recursive: true });
    }

    // Run each test suite
    for (const suite of testSuites) {
      await this.runTestSuite(suite);
    }

    // Generate summary report
    this.generateSummaryReport();
  }

  private async runTestSuite(suite: TestSuite): Promise<void> {
    console.log(`\n📋 Running ${suite.name} tests: ${suite.description}`);
    console.log('-'.repeat(50));
    
    const suiteStartTime = Date.now();
    
    try {
      // Set environment variables for testing
      process.env.NODE_ENV = 'test';
      process.env.TEST_TIMEOUT = suite.timeout.toString();
      
      // Run the test command
      execSync(suite.command, {
        stdio: 'inherit',
        timeout: suite.timeout,
        env: {
          ...process.env,
          FORCE_COLOR: '1' // Ensure colored output
        }
      });
      
      const duration = Date.now() - suiteStartTime;
      this.results.set(suite.name, { success: true, duration });
      
      console.log(`✅ ${suite.name} tests completed successfully in ${duration}ms`);
      
    } catch (error) {
      const duration = Date.now() - suiteStartTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.results.set(suite.name, { 
        success: false, 
        duration, 
        error: errorMessage 
      });
      
      console.error(`❌ ${suite.name} tests failed after ${duration}ms`);
      console.error(`Error: ${errorMessage}`);
      
      // Continue with other test suites even if one fails
    }
  }

  private generateSummaryReport(): void {
    const totalDuration = Date.now() - this.startTime;
    const totalSuites = testSuites.length;
    const passedSuites = Array.from(this.results.values()).filter(r => r.success).length;
    const failedSuites = totalSuites - passedSuites;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY REPORT');
    console.log('='.repeat(60));
    
    console.log(`Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
    console.log(`Total Test Suites: ${totalSuites}`);
    console.log(`Passed: ${passedSuites}`);
    console.log(`Failed: ${failedSuites}`);
    console.log(`Success Rate: ${((passedSuites / totalSuites) * 100).toFixed(1)}%`);
    
    console.log('\nDetailed Results:');
    console.log('-'.repeat(30));
    
    for (const suite of testSuites) {
      const result = this.results.get(suite.name);
      if (result) {
        const status = result.success ? '✅ PASS' : '❌ FAIL';
        const duration = `${result.duration}ms`;
        console.log(`${status} ${suite.name.padEnd(12)} ${duration.padStart(8)} - ${suite.description}`);
        
        if (!result.success && result.error) {
          console.log(`     Error: ${result.error}`);
        }
      }
    }
    
    // Generate JSON report
    this.generateJSONReport();
    
    // Exit with appropriate code
    const exitCode = failedSuites > 0 ? 1 : 0;
    console.log(`\n${exitCode === 0 ? '🎉' : '💥'} Test run completed with exit code ${exitCode}`);
    
    if (exitCode !== 0) {
      console.log('\n🔍 Check the detailed logs above for failure information');
      console.log('📁 Test artifacts are available in the test-results/ directory');
    }
    
    process.exit(exitCode);
  }

  private generateJSONReport(): void {
    const report = {
      timestamp: new Date().toISOString(),
      totalDuration: Date.now() - this.startTime,
      summary: {
        total: testSuites.length,
        passed: Array.from(this.results.values()).filter(r => r.success).length,
        failed: Array.from(this.results.values()).filter(r => !r.success).length
      },
      suites: testSuites.map(suite => ({
        name: suite.name,
        description: suite.description,
        command: suite.command,
        result: this.results.get(suite.name) || { success: false, duration: 0, error: 'Not run' }
      }))
    };
    
    try {
      const fs = require('fs');
      fs.writeFileSync(
        join(process.cwd(), 'test-results', 'wizard-test-summary.json'),
        JSON.stringify(report, null, 2)
      );
      console.log('\n📄 JSON report saved to test-results/wizard-test-summary.json');
    } catch (error) {
      console.warn('⚠️  Failed to save JSON report:', error);
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.runAllTests().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  });
}

export { TestRunner };