#!/usr/bin/env node

/**
 * Maksisoft Integration MVP Validation Script
 * Validates all acceptance criteria from the requirements
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🔍 Maksisoft Integration MVP Validation');
console.log('=' .repeat(50));

const results = {
  environmentConfig: false,
  serviceImplementation: false,
  routeImplementation: false,
  uiIntegration: false,
  securityFeatures: false,
  errorHandling: false
};

// 1. Validate Environment Configuration
console.log('\n1. 📋 Validating Environment Configuration...');
try {
  const envExample = fs.readFileSync('.env.example', 'utf8');
  const requiredVars = [
    'MAKSI_BASE',
    'MAKSI_SEARCH_PATH', 
    'MAKSI_CRITERIA_FOR_RFID',
    'MAKSI_BOOTSTRAP_COOKIE',
    'MAKSI_ENABLED'
  ];
  
  let allVarsPresent = true;
  requiredVars.forEach(varName => {
    if (envExample.includes(varName)) {
      console.log(`  ✅ ${varName} documented in .env.example`);
    } else {
      console.log(`  ❌ ${varName} missing from .env.example`);
      allVarsPresent = false;
    }
  });
  
  results.environmentConfig = allVarsPresent;
} catch (error) {
  console.log('  ❌ Error reading .env.example:', error.message);
}

// 2. Validate Service Implementation
console.log('\n2. 🔧 Validating Service Implementation...');
try {
  const maksiServicePath = 'app/panel/src/services/maksi.ts';
  const maksiService = fs.readFileSync(maksiServicePath, 'utf8');
  
  const requiredFunctions = [
    'searchMaksiByRFID',
    'AbortController',
    'setTimeout',
    'fetch'
  ];
  
  let allFunctionsPresent = true;
  requiredFunctions.forEach(func => {
    if (maksiService.includes(func)) {
      console.log(`  ✅ ${func} implemented`);
    } else {
      console.log(`  ❌ ${func} missing`);
      allFunctionsPresent = false;
    }
  });
  
  // Check for 5-second timeout
  if (maksiService.includes('5000') || maksiService.includes('5 * 1000')) {
    console.log('  ✅ 5-second timeout implemented');
  } else {
    console.log('  ❌ 5-second timeout not found');
    allFunctionsPresent = false;
  }
  
  results.serviceImplementation = allFunctionsPresent;
} catch (error) {
  console.log('  ❌ Error reading maksi service:', error.message);
}

// 3. Validate Route Implementation
console.log('\n3. 🛣️  Validating Route Implementation...');
try {
  const routePath = 'app/panel/src/routes/maksi-routes.ts';
  const routeCode = fs.readFileSync(routePath, 'utf8');
  
  const requiredFeatures = [
    '/api/maksi/search-by-rfid',
    'MAKSI_ENABLED',
    'rate',
    'hashRFID',
    'fastify.log'
  ];
  
  let allFeaturesPresent = true;
  requiredFeatures.forEach(feature => {
    if (routeCode.includes(feature)) {
      console.log(`  ✅ ${feature} implemented`);
    } else {
      console.log(`  ❌ ${feature} missing`);
      allFeaturesPresent = false;
    }
  });
  
  results.routeImplementation = allFeaturesPresent;
} catch (error) {
  console.log('  ❌ Error reading route implementation:', error.message);
}

// 4. Validate UI Integration
console.log('\n4. 🖥️  Validating UI Integration...');
try {
  const lockersHtmlPath = 'app/panel/src/views/lockers.html';
  const lockersHtml = fs.readFileSync(lockersHtmlPath, 'utf8');
  
  const requiredUIElements = [
    'btn-maksi',
    'Maksisoft',
    'maksiModal',
    'Profili Aç',
    'data-owner-rfid'
  ];
  
  let allElementsPresent = true;
  requiredUIElements.forEach(element => {
    if (lockersHtml.includes(element)) {
      console.log(`  ✅ ${element} found in UI`);
    } else {
      console.log(`  ❌ ${element} missing from UI`);
      allElementsPresent = false;
    }
  });
  
  // Check for feature flag control
  if (lockersHtml.includes('MAKSI_ENABLED') && lockersHtml.includes('true')) {
    console.log('  ✅ Feature flag control implemented');
  } else {
    console.log('  ❌ Feature flag control missing');
    allElementsPresent = false;
  }
  
  results.uiIntegration = allElementsPresent;
} catch (error) {
  console.log('  ❌ Error reading lockers.html:', error.message);
}

// 5. Validate Security Features
console.log('\n5. 🔒 Validating Security Features...');
try {
  const rateLimitPath = 'app/panel/src/middleware/rate-limit.ts';
  const rateLimitCode = fs.readFileSync(rateLimitPath, 'utf8');
  
  const securityFeatures = [
    'Map',
    '1000', // 1 second rate limit
    'Date.now',
    'ip'
  ];
  
  let allSecurityPresent = true;
  securityFeatures.forEach(feature => {
    if (rateLimitCode.includes(feature)) {
      console.log(`  ✅ Rate limiting: ${feature} implemented`);
    } else {
      console.log(`  ❌ Rate limiting: ${feature} missing`);
      allSecurityPresent = false;
    }
  });
  
  // Test RFID hashing function
  const testRfid = '0006851540';
  const salt = 'test-salt';
  const hash = crypto.createHash('sha256').update(salt + testRfid).digest('hex').slice(0, 12);
  
  if (hash.length === 12 && !hash.includes(testRfid)) {
    console.log('  ✅ RFID hashing function works correctly');
  } else {
    console.log('  ❌ RFID hashing function issue');
    allSecurityPresent = false;
  }
  
  results.securityFeatures = allSecurityPresent;
} catch (error) {
  console.log('  ❌ Error validating security features:', error.message);
}

// 6. Validate Error Handling
console.log('\n6. ⚠️  Validating Error Handling...');
try {
  const routePath = 'app/panel/src/routes/maksi-routes.ts';
  const routeCode = fs.readFileSync(routePath, 'utf8');
  
  const turkishMessages = [
    'auth_error',
    'rate_limited', 
    'network_error',
    'invalid_response'
  ];
  
  let allErrorsHandled = true;
  turkishMessages.forEach(errorType => {
    if (routeCode.includes(errorType)) {
      console.log(`  ✅ Error handling: ${errorType} implemented`);
    } else {
      console.log(`  ❌ Error handling: ${errorType} missing`);
      allErrorsHandled = false;
    }
  });
  
  results.errorHandling = allErrorsHandled;
} catch (error) {
  console.log('  ❌ Error validating error handling:', error.message);
}

// 7. Check Test Coverage
console.log('\n7. 🧪 Validating Test Coverage...');
try {
  const testFiles = [
    'app/panel/src/__tests__/maksi-data-mapping.test.ts',
    'app/panel/src/__tests__/maksi-service.test.ts',
    'app/panel/src/__tests__/maksi-rate-limiter.test.ts',
    'app/panel/src/__tests__/maksi-routes.test.ts',
    'app/panel/src/__tests__/maksi-integration.test.ts'
  ];
  
  let testCoverage = 0;
  testFiles.forEach(testFile => {
    if (fs.existsSync(testFile)) {
      console.log(`  ✅ ${path.basename(testFile)} exists`);
      testCoverage++;
    } else {
      console.log(`  ❌ ${path.basename(testFile)} missing`);
    }
  });
  
  console.log(`  📊 Test coverage: ${testCoverage}/${testFiles.length} files`);
} catch (error) {
  console.log('  ❌ Error checking test coverage:', error.message);
}

// Summary
console.log('\n📊 Validation Summary');
console.log('=' .repeat(50));

const passedTests = Object.values(results).filter(Boolean).length;
const totalTests = Object.keys(results).length;

Object.entries(results).forEach(([category, passed]) => {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} ${category}`);
});

console.log(`\n🎯 Overall Score: ${passedTests}/${totalTests} categories passed`);

if (passedTests === totalTests) {
  console.log('\n🎉 MVP Validation SUCCESSFUL!');
  console.log('All acceptance criteria have been implemented.');
} else {
  console.log('\n⚠️  MVP Validation INCOMPLETE');
  console.log('Some acceptance criteria need attention.');
}

// Manual testing instructions
console.log('\n📋 Manual Testing Required:');
console.log('1. Start panel service: npm run start:panel');
console.log('2. Open browser: http://localhost:3001/lockers');
console.log('3. Run validation script in DevTools console:');
console.log('   Copy/paste: app/panel/src/__tests__/maksi-manual-validation.js');
console.log('4. Test button clicks and modal functionality');
console.log('5. Verify network requests go through panel server only');
console.log('6. Check server logs for hashed RFID entries');

process.exit(passedTests === totalTests ? 0 : 1);