#!/usr/bin/env tsx

/**
 * Smart Assignment Test Execution Script
 * 
 * Provides multiple execution modes for smart assignment integration tests
 * Usage: npx tsx tests/run-smart-assignment-tests.ts [mode]
 * Modes: all, e2e, feature-flag, concurrency, hardware, performance
 */

import { execSync } from 'child_process';
import { SmartAssignmentTestRunner } from './integration/smart-assignment-integration-runner';

interface TestMode {
  name: string;
  description: string;
  files: string[];
}

const TEST_MODES: Record<string, TestMode> = {
  all: {
    name: 'All Smart Assignment Tests',
    description: 'Run complete smart assignment test suite',
    files: [
      'smart-assignment-e2e-flow.test.ts',
      'smart-assignment-feature-flag.test.ts',
      'smart-assignment-concurrency.test.ts',
      'smart-assignment-hardware-retry.test.ts',
      'smart-assignment-performance-load.test.ts'
    ]
  },
  e2e: {
    name: 'End-to-End Flow Tests',
    description: 'Test complete assignment flows from card scan to locker opening',
    files: ['smart-assignment-e2e-flow.test.ts']
  },
  'feature-flag': {
    name: 'Feature Flag Tests',
    description: 'Test feature flag switching and backward compatibility',
    files: ['smart-assignment-feature-flag.test.ts']
  },
  concurrency: {
    name: 'Concurrency Tests',
    description: 'Test concurrent assignments and race condition handling',
    files: ['smart-assignment-concurrency.test.ts']
  },
  hardware: {
    name: 'Hardware Integration Tests',
    description: 'Test hardware integration and retry logic',
    files: ['smart-assignment-hardware-retry.test.ts']
  },
  performance: {
    name: 'Performance and Load Tests',
    description: 'Test performance requirements and load handling',
    files: ['smart-assignment-performance-load.test.ts']
  }
};

async function runTests(mode: string = 'all'): Promise<void> {
  const testMode = TEST_MODES[mode];
  
  if (!testMode) {
    console.error(`❌ Invalid test mode: ${mode}`);
    console.log('Available modes:');
    Object.entries(TEST_MODES).forEach(([key, value]) => {
      console.log(`  ${key.padEnd(15)} - ${value.description}`);
    });
    process.exit(1);
  }

  console.log(`🚀 Running ${testMode.name}`);
  console.log(`📋 ${testMode.description}`);
  console.log('=' .repeat(80));

  if (mode === 'all') {
    // Use comprehensive test runner for all tests
    const runner = new SmartAssignmentTestRunner();
    await runner.runAllTests();
  } else {
    // Run specific test files
    let allPassed = true;
    
    for (const testFile of testMode.files) {
      console.log(`\n🧪 Running ${testFile}...`);
      
      try {
        const command = `npx vitest run tests/integration/${testFile} --reporter=verbose --timeout=30000`;
        execSync(command, { stdio: 'inherit' });
        console.log(`✅ ${testFile} - PASSED`);
      } catch (error) {
        console.log(`❌ ${testFile} - FAILED`);
        allPassed = false;
      }
    }

    if (allPassed) {
      console.log('\n✅ All tests in this mode passed successfully!');
      process.exit(0);
    } else {
      console.log('\n❌ Some tests failed. Please review the errors above.');
      process.exit(1);
    }
  }
}

// Parse command line arguments
const mode = process.argv[2] || 'all';

// Show usage if help requested
if (mode === '--help' || mode === '-h') {
  console.log('Smart Assignment Test Runner');
  console.log('');
  console.log('Usage: npx tsx tests/run-smart-assignment-tests.ts [mode]');
  console.log('');
  console.log('Available modes:');
  Object.entries(TEST_MODES).forEach(([key, value]) => {
    console.log(`  ${key.padEnd(15)} - ${value.description}`);
  });
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx tests/run-smart-assignment-tests.ts all');
  console.log('  npx tsx tests/run-smart-assignment-tests.ts e2e');
  console.log('  npx tsx tests/run-smart-assignment-tests.ts performance');
  process.exit(0);
}

// Run tests
runTests(mode).catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});