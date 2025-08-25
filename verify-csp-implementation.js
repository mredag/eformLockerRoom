#!/usr/bin/env node

/**
 * Verification script for CSP Report-Only implementation
 * This script verifies the code changes without requiring a running service
 */

const fs = require('fs');
const path = require('path');

function verifyCSPImplementation() {
  console.log('🔍 Verifying CSP Report-Only Implementation...\n');

  let allTestsPassed = true;

  // Test 1: Verify SecurityMiddleware interface updates
  console.log('Test 1: Checking SecurityMiddleware interface...');
  try {
    const securityMiddlewareContent = fs.readFileSync(
      path.join(__dirname, 'app/panel/src/middleware/security-middleware.ts'), 
      'utf8'
    );

    if (securityMiddlewareContent.includes('reportUri?: string;')) {
      console.log('✅ reportUri property added to SecurityConfig interface');
    } else {
      console.log('❌ reportUri property missing from SecurityConfig interface');
      allTestsPassed = false;
    }

    if (securityMiddlewareContent.includes('reportOnly?: boolean;')) {
      console.log('✅ reportOnly property added to SecurityConfig interface');
    } else {
      console.log('❌ reportOnly property missing from SecurityConfig interface');
      allTestsPassed = false;
    }

    if (securityMiddlewareContent.includes('reportUri: "/csp-report"')) {
      console.log('✅ Default reportUri configured in DEFAULT_SECURITY_CONFIG');
    } else {
      console.log('❌ Default reportUri not configured');
      allTestsPassed = false;
    }

    if (securityMiddlewareContent.includes('Content-Security-Policy-Report-Only')) {
      console.log('✅ Report-Only header implementation found');
    } else {
      console.log('❌ Report-Only header implementation missing');
      allTestsPassed = false;
    }

  } catch (error) {
    console.log('❌ Error reading SecurityMiddleware file:', error.message);
    allTestsPassed = false;
  }

  // Test 2: Verify main index.ts CSP configuration
  console.log('\nTest 2: Checking main index.ts CSP configuration...');
  try {
    const indexContent = fs.readFileSync(
      path.join(__dirname, 'app/panel/src/index.ts'), 
      'utf8'
    );

    if (indexContent.includes('scriptSrc: ["\'self\'"]') && 
        !indexContent.includes('scriptSrc: ["\'self\'", "\'unsafe-inline\'"]')) {
      console.log('✅ script-src correctly set to \'self\' only (no unsafe-inline)');
    } else {
      console.log('❌ script-src configuration incorrect - should be [\'self\'] only');
      allTestsPassed = false;
    }

    if (indexContent.includes('reportOnly: true')) {
      console.log('✅ Report-Only mode enabled in SecurityMiddleware configuration');
    } else {
      console.log('❌ Report-Only mode not enabled');
      allTestsPassed = false;
    }

    if (indexContent.includes('reportUri: "/csp-report"')) {
      console.log('✅ reportUri configured in SecurityMiddleware');
    } else {
      console.log('❌ reportUri not configured in SecurityMiddleware');
      allTestsPassed = false;
    }

  } catch (error) {
    console.log('❌ Error reading index.ts file:', error.message);
    allTestsPassed = false;
  }

  // Test 3: Verify CSP report endpoint
  console.log('\nTest 3: Checking CSP report endpoint...');
  try {
    const indexContent = fs.readFileSync(
      path.join(__dirname, 'app/panel/src/index.ts'), 
      'utf8'
    );

    if (indexContent.includes('fastify.post(\'/csp-report\'')) {
      console.log('✅ CSP report endpoint (/csp-report) found');
    } else {
      console.log('❌ CSP report endpoint missing');
      allTestsPassed = false;
    }

    if (indexContent.includes('chrome-extension://') && 
        indexContent.includes('moz-extension://')) {
      console.log('✅ Extension detection logic found in CSP report handler');
    } else {
      console.log('❌ Extension detection logic missing');
      allTestsPassed = false;
    }

    if (indexContent.includes('Browser Extension Interference Detected')) {
      console.log('✅ Extension interference logging found');
    } else {
      console.log('❌ Extension interference logging missing');
      allTestsPassed = false;
    }

  } catch (error) {
    console.log('❌ Error checking CSP report endpoint:', error.message);
    allTestsPassed = false;
  }

  // Test 4: Verify CSP test page exists
  console.log('\nTest 4: Checking CSP test page...');
  try {
    const testPagePath = path.join(__dirname, 'app/panel/src/views/csp-test.html');
    if (fs.existsSync(testPagePath)) {
      console.log('✅ CSP test page (csp-test.html) created');
      
      const testPageContent = fs.readFileSync(testPagePath, 'utf8');
      if (testPageContent.includes('securitypolicyviolation')) {
        console.log('✅ CSP violation event listener found in test page');
      } else {
        console.log('❌ CSP violation event listener missing from test page');
        allTestsPassed = false;
      }
    } else {
      console.log('❌ CSP test page not found');
      allTestsPassed = false;
    }

    // Check if route is added
    const indexContent = fs.readFileSync(
      path.join(__dirname, 'app/panel/src/index.ts'), 
      'utf8'
    );
    if (indexContent.includes('fastify.get("/csp-test"')) {
      console.log('✅ CSP test route (/csp-test) added');
    } else {
      console.log('❌ CSP test route missing');
      allTestsPassed = false;
    }

  } catch (error) {
    console.log('❌ Error checking CSP test page:', error.message);
    allTestsPassed = false;
  }

  // Test 5: Verify build artifacts
  console.log('\nTest 5: Checking build artifacts...');
  try {
    const distIndexPath = path.join(__dirname, 'app/panel/dist/index.js');
    const distViewsPath = path.join(__dirname, 'app/panel/dist/views/csp-test.html');
    
    if (fs.existsSync(distIndexPath)) {
      console.log('✅ Built index.js exists');
    } else {
      console.log('❌ Built index.js missing');
      allTestsPassed = false;
    }

    if (fs.existsSync(distViewsPath)) {
      console.log('✅ Built csp-test.html exists in dist/views');
    } else {
      console.log('❌ Built csp-test.html missing from dist/views');
      allTestsPassed = false;
    }

  } catch (error) {
    console.log('❌ Error checking build artifacts:', error.message);
    allTestsPassed = false;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  if (allTestsPassed) {
    console.log('🎉 All CSP Report-Only implementation tests PASSED!');
    console.log('\nImplementation Summary:');
    console.log('✅ SecurityMiddleware updated with reportOnly and reportUri support');
    console.log('✅ CSP configured with script-src \'self\' (no unsafe-inline)');
    console.log('✅ Report-Only mode enabled for extension interference detection');
    console.log('✅ CSP violation report endpoint (/csp-report) implemented');
    console.log('✅ Extension detection and logging added');
    console.log('✅ CSP test page created for manual testing');
    
    console.log('\nNext Steps:');
    console.log('1. Start the panel service: npm start (in app/panel directory)');
    console.log('2. Visit http://localhost:3001/csp-test to test CSP functionality');
    console.log('3. Test with browser extensions enabled to see violations');
    console.log('4. Test with --disable-extensions to verify clean operation');
    console.log('5. Check server logs for CSP violation reports');
  } else {
    console.log('❌ Some CSP implementation tests FAILED!');
    console.log('Please review the failed tests above and fix the issues.');
  }
}

// Run verification
verifyCSPImplementation();