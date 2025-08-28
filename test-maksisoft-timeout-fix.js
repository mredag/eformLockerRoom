#!/usr/bin/env node

/**
 * Test script to verify Maksisoft timeout fix
 */

console.log('🔍 Testing Maksisoft timeout fix...');

// Test the API directly
async function testMaksiAPI() {
  const config = {
    baseUrl: process.env.MAKSI_BASE || 'https://eformhatay.maksionline.com',
    searchPath: process.env.MAKSI_SEARCH_PATH || '/react-system/api_php/user_search/users.php',
    criteriaForRfid: process.env.MAKSI_CRITERIA_FOR_RFID || '0',
    bootstrapCookie: process.env.MAKSI_BOOTSTRAP_COOKIE || 'AC-C=ac-c; PHPSESSID=gcd3j9rreagcc990n7g555qlm5'
  };

  const rfid = '0006851540';
  const searchUrl = `${config.baseUrl}${config.searchPath}?text=${encodeURIComponent(rfid)}&criteria=${config.criteriaForRfid}`;
  
  console.log('📡 Making request to:', searchUrl);
  console.log('🍪 Using cookie:', config.bootstrapCookie.substring(0, 50) + '...');

  // Test with 10-second timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 10000);

  const startTime = Date.now();

  try {
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'eForm-Locker-System/1.0',
        'Cookie': config.bootstrapCookie
      },
      redirect: 'manual',
      signal: abortController.signal
    });

    const duration = Date.now() - startTime;
    console.log(`⏱️  Request completed in ${duration}ms`);

    if (!response.ok) {
      console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    console.log('✅ Success! Found', Array.isArray(data) ? data.length : 0, 'records');
    
    if (Array.isArray(data) && data.length > 0) {
      console.log('📋 Sample record:', {
        id: data[0].id,
        name: data[0].name || '(empty)',
        rfid: data[0].proximity,
        phone: data[0].gsm || data[0].phone || '(none)'
      });
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ Request failed after ${duration}ms:`, error.message);
    
    if (error.name === 'AbortError') {
      console.log('⚠️  Request timed out after 10 seconds');
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// Test Panel API endpoint
async function testPanelAPI() {
  console.log('\n🌐 Testing Panel API endpoint...');
  
  try {
    const response = await fetch('http://localhost:3001/api/maksi/search-by-rfid?rfid=0006851540', {
      headers: { 'Accept': 'application/json' }
    });

    const data = await response.json();
    
    if (response.ok && data.success !== false) {
      console.log('✅ Panel API working! Found', data.hits?.length || 0, 'records');
    } else {
      console.log('❌ Panel API error:', data.error || 'unknown');
    }
    
  } catch (error) {
    console.log('❌ Panel API connection failed:', error.message);
  }
}

// Run tests
async function runTests() {
  await testMaksiAPI();
  await testPanelAPI();
}

runTests().catch(console.error);