#!/usr/bin/env node

/**
 * Debug script to test the locker API directly
 */

const http = require('http');

async function testLockerAPI() {
  console.log('🔍 Testing Locker API directly...');
  console.log('==================================');
  
  const testCases = [
    { path: '/api/lockers', description: 'Without kioskId (should return 400)' },
    { path: '/api/lockers?kioskId=K1', description: 'With kioskId=K1' },
    { path: '/api/lockers?kioskId=kiosk-1', description: 'With kioskId=kiosk-1' },
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📋 Testing: ${testCase.description}`);
    console.log(`🔗 URL: http://localhost:3001${testCase.path}`);
    
    try {
      const response = await makeRequest(testCase.path);
      
      console.log(`📊 Status: ${response.statusCode}`);
      console.log(`📊 Headers:`, response.headers);
      console.log(`📄 Body:`, response.body);
      
      if (response.statusCode === 200) {
        try {
          const data = JSON.parse(response.body);
          console.log(`✅ JSON parsed successfully`);
          console.log(`📊 Data structure:`, {
            hasLockers: 'lockers' in data,
            lockersType: typeof data.lockers,
            lockersIsArray: Array.isArray(data.lockers),
            lockersLength: data.lockers ? data.lockers.length : 'N/A',
            hasTotal: 'total' in data,
            totalValue: data.total
          });
          
          if (data.lockers && data.lockers.length > 0) {
            console.log(`📊 Sample locker:`, data.lockers[0]);
          }
        } catch (e) {
          console.log(`❌ Failed to parse JSON:`, e.message);
        }
      }
      
    } catch (error) {
      console.log(`❌ Request failed:`, error.message);
    }
    
    console.log('─'.repeat(50));
  }
}

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DebugScript/1.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

// Run the test
testLockerAPI().catch(console.error);