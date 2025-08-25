#!/usr/bin/env node

/**
 * Test script to verify CSP Report-Only functionality
 * This script tests the CSP configuration and report endpoint
 */

const http = require('http');

async function testCSPConfiguration() {
  console.log('🔍 Testing CSP Report-Only Configuration...\n');

  try {
    // Test 1: Check if CSP headers are properly set
    console.log('Test 1: Checking CSP headers...');
    
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/health',
      method: 'GET'
    };

    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve({ headers: res.headers, data, statusCode: res.statusCode }));
      });
      req.on('error', reject);
      req.setTimeout(5000, () => reject(new Error('Request timeout')));
      req.end();
    });

    // Check for CSP Report-Only header
    const cspHeader = response.headers['content-security-policy-report-only'];
    if (cspHeader) {
      console.log('✅ CSP Report-Only header found:', cspHeader);
      
      // Verify script-src is set to 'self' only
      if (cspHeader.includes("script-src 'self'") && !cspHeader.includes("'unsafe-inline'")) {
        console.log('✅ script-src correctly set to \'self\' only (no unsafe-inline)');
      } else {
        console.log('❌ script-src configuration incorrect');
      }
      
      // Verify report-uri is present
      if (cspHeader.includes('report-uri /csp-report')) {
        console.log('✅ report-uri correctly configured');
      } else {
        console.log('❌ report-uri not found or incorrect');
      }
    } else {
      console.log('❌ CSP Report-Only header not found');
      console.log('Available headers:', Object.keys(response.headers));
    }

    console.log('\nTest 2: Testing CSP report endpoint...');
    
    // Test 2: Send a mock CSP violation report
    const reportData = JSON.stringify({
      'csp-report': {
        'blocked-uri': 'chrome-extension://test-extension-id/content.js',
        'violated-directive': 'script-src \'self\'',
        'source-file': 'http://localhost:3001/lockers',
        'line-number': 2,
        'column-number': 1,
        'original-policy': 'script-src \'self\'; report-uri /csp-report'
      }
    });

    const reportOptions = {
      hostname: 'localhost',
      port: 3001,
      path: '/csp-report',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(reportData)
      }
    };

    const reportResponse = await new Promise((resolve, reject) => {
      const req = http.request(reportOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve({ data, statusCode: res.statusCode }));
      });
      req.on('error', reject);
      req.setTimeout(5000, () => reject(new Error('Request timeout')));
      req.write(reportData);
      req.end();
    });

    if (reportResponse.statusCode === 204) {
      console.log('✅ CSP report endpoint accepts violations (status 204)');
    } else {
      console.log(`❌ CSP report endpoint returned status ${reportResponse.statusCode}`);
    }

    console.log('\n🎉 CSP functionality test completed!');
    console.log('\nNext steps:');
    console.log('1. Test with browser extensions enabled to see CSP violations in logs');
    console.log('2. Test with --disable-extensions to verify no line 2 JavaScript errors');
    console.log('3. Check server logs for CSP violation reports');

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to panel service on localhost:3001');
      console.log('Please start the panel service first with: npm run start');
    } else {
      console.log('❌ Test failed:', error.message);
    }
  }
}

// Run the test
testCSPConfiguration();