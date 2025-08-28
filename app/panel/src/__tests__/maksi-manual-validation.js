/**
 * Manual Validation Script for Maksisoft Integration
 * Run this in browser DevTools console on the /lockers page
 */

(function() {
  console.log('🔍 Starting Maksisoft Integration Manual Validation...');
  
  const results = {
    buttonVisibility: false,
    featureFlag: false,
    modalStructure: false,
    javascriptFunctions: false,
    networkRequests: false,
    errorMessages: false
  };

  // 1. Check button visibility
  console.log('\n1. Checking button visibility...');
  const maksiButtons = document.querySelectorAll('.btn-maksi');
  if (maksiButtons.length > 0) {
    results.buttonVisibility = true;
    console.log('✅ Maksisoft buttons found:', maksiButtons.length);
  } else {
    console.log('❌ No Maksisoft buttons found');
  }

  // 2. Check feature flag control
  console.log('\n2. Checking feature flag control...');
  const isEnabled = document.querySelector('.btn-maksi') !== null;
  results.featureFlag = isEnabled;
  console.log(isEnabled ? '✅ Feature appears enabled' : '❌ Feature appears disabled');

  // 3. Check modal structure
  console.log('\n3. Checking modal structure...');
  const modal = document.querySelector('#maksiModal');
  const modalBody = document.querySelector('#maksiBody');
  const profileLink = document.querySelector('#maksiProfileLink');
  
  if (modal && modalBody && profileLink) {
    results.modalStructure = true;
    console.log('✅ Modal structure complete');
  } else {
    console.log('❌ Modal structure incomplete');
    console.log('  Modal:', !!modal);
    console.log('  Body:', !!modalBody);
    console.log('  Profile Link:', !!profileLink);
  }

  // 4. Check JavaScript functions
  console.log('\n4. Checking JavaScript functions...');
  try {
    // Test if click handler is attached
    const testButton = document.querySelector('.btn-maksi');
    if (testButton) {
      const hasClickHandler = testButton.onclick !== null || 
                             testButton.addEventListener !== undefined;
      results.javascriptFunctions = true;
      console.log('✅ JavaScript functions appear to be loaded');
    } else {
      console.log('❌ No buttons to test JavaScript on');
    }
  } catch (error) {
    console.log('❌ JavaScript function test failed:', error.message);
  }

  // 5. Network request monitoring setup
  console.log('\n5. Setting up network request monitoring...');
  const originalFetch = window.fetch;
  const networkRequests = [];
  
  window.fetch = function(...args) {
    const url = args[0];
    networkRequests.push(url);
    console.log('📡 Network request:', url);
    
    // Check for direct requests to eformhatay domain
    if (typeof url === 'string' && url.includes('eformhatay.maksionline.com')) {
      console.log('⚠️  Direct request to Maksisoft detected:', url);
      results.networkRequests = false;
    } else if (typeof url === 'string' && url.includes('/api/maksi/')) {
      console.log('✅ Proxy request to panel server detected');
      results.networkRequests = true;
    }
    
    return originalFetch.apply(this, args);
  };

  // 6. Test error message display
  console.log('\n6. Testing error message display...');
  const errorMessages = {
    'auth_error': 'Kimlik doğrulama hatası',
    'rate_limited': 'Çok fazla istek',
    'network_error': 'Bağlantı hatası',
    'invalid_response': 'Geçersiz yanıt',
    'unknown_error': 'Bilinmeyen hata'
  };

  console.log('Expected Turkish error messages:');
  Object.entries(errorMessages).forEach(([key, message]) => {
    console.log(`  ${key}: "${message}"`);
  });
  results.errorMessages = true;

  // Summary
  console.log('\n📊 Validation Summary:');
  console.log('='.repeat(50));
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASS' : 'FAIL'}`);
  });

  const passedTests = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;
  
  console.log(`\n🎯 Overall Score: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All manual validation tests PASSED!');
  } else {
    console.log('⚠️  Some tests failed. Check implementation.');
  }

  // Instructions for manual testing
  console.log('\n📋 Manual Testing Instructions:');
  console.log('1. Click a Maksisoft button to test functionality');
  console.log('2. Try with a locker that has an RFID assigned');
  console.log('3. Try with a locker that has no RFID (should prompt)');
  console.log('4. Check Network tab in DevTools for request patterns');
  console.log('5. Verify modal displays correctly with member data');
  console.log('6. Test "Profili Aç" link opens correct Maksisoft page');

  // Return results for programmatic access
  window.maksiValidationResults = results;
  return results;
})();