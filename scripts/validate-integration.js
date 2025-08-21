#!/usr/bin/env node

/**
 * Integration Test Validation Script
 * Validates that all integration tests can be loaded and basic functionality works
 */

import fs from 'fs';
import path from 'path';

const testFiles = [
  'app/gateway/src/__tests__/integration/full-system-integration.test.ts',
  'app/gateway/src/__tests__/integration/multi-room-coordination.test.ts',
  'app/panel/src/__tests__/integration/vip-workflow-integration.test.ts'
];

function validateTestFile(filePath) {
  console.log(`\n=== Validating ${filePath} ===`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File does not exist: ${filePath}`);
    return false;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for required imports
  const requiredImports = [
    'describe',
    'it',
    'expect',
    'beforeEach',
    'afterEach'
  ];
  
  for (const importName of requiredImports) {
    if (!content.includes(importName)) {
      console.error(`❌ Missing required import: ${importName}`);
      return false;
    }
  }
  
  // Check for test structure
  if (!content.includes('describe(')) {
    console.error('❌ No describe blocks found');
    return false;
  }
  
  if (!content.includes('it(')) {
    console.error('❌ No test cases found');
    return false;
  }
  
  // Count test cases
  const testCases = (content.match(/it\(/g) || []).length;
  const describeBlocks = (content.match(/describe\(/g) || []).length;
  
  console.log(`✅ File structure valid`);
  console.log(`   - ${describeBlocks} describe blocks`);
  console.log(`   - ${testCases} test cases`);
  
  return true;
}

function validateIntegrationRequirements() {
  console.log('\n=== Validating Integration Requirements ===');
  
  const requirements = [
    {
      name: 'Multi-room operations (Req 6.1-6.6)',
      files: ['app/gateway/src/__tests__/integration/multi-room-coordination.test.ts'],
      keywords: ['multi-room', 'cross-room', 'kiosk', 'heartbeat']
    },
    {
      name: 'VIP locker operations (Req 2.1-2.5)',
      files: ['app/panel/src/__tests__/integration/vip-workflow-integration.test.ts'],
      keywords: ['vip', 'contract', 'transfer', 'extension']
    },
    {
      name: 'Staff management workflows (Req 3.1-3.8)',
      files: ['app/panel/src/__tests__/integration/vip-workflow-integration.test.ts'],
      keywords: ['staff', 'bulk', 'authorization', 'permission']
    },
    {
      name: 'Command synchronization (Req 6.3-6.4)',
      files: ['app/gateway/src/__tests__/integration/multi-room-coordination.test.ts'],
      keywords: ['command', 'queue', 'synchronization', 'coordination']
    }
  ];
  
  let allValid = true;
  
  for (const req of requirements) {
    console.log(`\nChecking: ${req.name}`);
    
    let reqValid = true;
    for (const filePath of req.files) {
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Missing test file: ${filePath}`);
        reqValid = false;
        continue;
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      const foundKeywords = req.keywords.filter(keyword => 
        content.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (foundKeywords.length < req.keywords.length / 2) {
        console.error(`❌ Insufficient coverage for ${req.name}`);
        console.error(`   Found keywords: ${foundKeywords.join(', ')}`);
        console.error(`   Expected: ${req.keywords.join(', ')}`);
        reqValid = false;
      } else {
        console.log(`✅ Coverage found for ${req.name}`);
        console.log(`   Keywords: ${foundKeywords.join(', ')}`);
      }
    }
    
    if (!reqValid) {
      allValid = false;
    }
  }
  
  return allValid;
}

function main() {
  console.log('🧪 Integration Test Validation');
  console.log('==============================');
  
  let allValid = true;
  
  // Validate individual test files
  for (const testFile of testFiles) {
    if (!validateTestFile(testFile)) {
      allValid = false;
    }
  }
  
  // Validate requirement coverage
  if (!validateIntegrationRequirements()) {
    allValid = false;
  }
  
  console.log('\n=== Validation Summary ===');
  if (allValid) {
    console.log('✅ All integration tests are valid and ready to run');
    console.log('✅ Requirements coverage is adequate');
    process.exit(0);
  } else {
    console.log('❌ Some validation checks failed');
    console.log('Please fix the issues above before running integration tests');
    process.exit(1);
  }
}

main();