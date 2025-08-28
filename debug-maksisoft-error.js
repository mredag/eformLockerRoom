#!/usr/bin/env node

/**
 * Debug script to identify the exact error from Maksisoft service
 */

// Set environment variables
process.env.MAKSI_BASE = 'https://eformhatay.maksionline.com';
process.env.MAKSI_SEARCH_PATH = '/react-system/api_php/user_search/users.php';
process.env.MAKSI_CRITERIA_FOR_RFID = '0';
process.env.MAKSI_BOOTSTRAP_COOKIE = 'AC-C=ac-c; PHPSESSID=gcd3j9rreagcc990n7g555qlm5';
process.env.MAKSI_ENABLED = 'true';

console.log('🔍 Testing Maksisoft service directly...');
console.log('📋 Environment:');
console.log('   MAKSI_BASE:', process.env.MAKSI_BASE);
console.log('   MAKSI_ENABLED:', process.env.MAKSI_ENABLED);

// Test the raw fetch first
async function testRawFetch() {
  console.log('\n🌐 Testing raw fetch...');
  
  const searchUrl = `${process.env.MAKSI_BASE}${process.env.MAKSI_SEARCH_PATH}?text=0006851540&criteria=0`;
  console.log('📡 URL:', searchUrl);
  
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 10000);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'eForm-Locker-System/1.0',
        'Cookie': process.env.MAKSI_BOOTSTRAP_COOKIE
      },
      redirect: 'manual',
      signal: abortController.signal
    });
    
    const duration = Date.now() - startTime;
    console.log(`⏱️  Raw fetch completed in ${duration}ms`);
    console.log('📊 Status:', response.status, response.statusText);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Raw fetch success! Records:', Array.isArray(data) ? data.length : 0);
    } else {
      console.log('❌ Raw fetch HTTP error:', response.status);
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ Raw fetch failed after ${duration}ms`);
    console.log('   Error name:', error.name);
    console.log('   Error message:', error.message);
    console.log('   Error code:', error.code);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Test the service function
async function testService() {
  console.log('\n🔧 Testing Maksisoft service function...');
  
  try {
    // Import the service - this might fail if the module structure is different
    const serviceModule = require('./app/panel/dist/index.js');
    console.log('📦 Module loaded, available exports:', Object.keys(serviceModule));
    
    // Try to find the search function
    if (typeof serviceModule.searchMaksiByRFID === 'function') {
      console.log('✅ Found searchMaksiByRFID function');
      
      const result = await serviceModule.searchMaksiByRFID('0006851540');
      console.log('✅ Service success:', JSON.stringify(result, null, 2));
      
    } else {
      console.log('❌ searchMaksiByRFID function not found in exports');
      console.log('Available functions:', Object.keys(serviceModule).filter(k => typeof serviceModule[k] === 'function'));
    }
    
  } catch (error) {
    console.log('❌ Service error:');
    console.log('   Error name:', error.name);
    console.log('   Error message:', error.message);
    console.log('   Error code:', error.code);
    console.log('   Stack:', error.stack?.split('\n').slice(0, 3).join('\n'));
  }
}

// Run tests
async function runTests() {
  await testRawFetch();
  await testService();
}

runTests().catch(console.error);