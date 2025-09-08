#!/usr/bin/env node
/**
 * Test Pi Connection - 192.168.1.11
 * Quick test script to verify Pi connectivity and service status
 */

const http = require('http');

const PI_IP = '192.168.1.11';
const SERVICES = [
  { name: 'Gateway', port: 3000, path: '/health' },
  { name: 'Panel', port: 3001, path: '/health' },
  { name: 'Kiosk', port: 3002, path: '/health' }
];

async function testPiConnection() {
  console.log('🔍 Testing Pi Connection - 192.168.1.11');
  console.log('=====================================\n');

  for (const service of SERVICES) {
    const url = `http://${PI_IP}:${service.port}${service.path}`;
    
    try {
      console.log(`📡 Testing ${service.name} (${url})...`);
      
      const result = await makeRequest(url);
      
      if (result.status === 'ok' || result.status === 'healthy') {
        console.log(`✅ ${service.name} - OK`);
        if (result.uptime) {
          console.log(`   Uptime: ${Math.floor(result.uptime)}s`);
        }
      } else {
        console.log(`⚠️ ${service.name} - Responded but status: ${result.status}`);
      }
      
    } catch (error) {
      console.log(`❌ ${service.name} - Failed: ${error.message}`);
    }
    
    console.log('');
  }

  // Test basic locker API
  console.log('🔧 Testing Locker API...');
  try {
    const lockerUrl = `http://${PI_IP}:3000/api/admin/lockers`;
    const lockers = await makeRequest(lockerUrl);
    
    if (Array.isArray(lockers)) {
      console.log(`✅ Locker API - OK (${lockers.length} lockers found)`);
      
      // Show first few lockers
      const sampleLockers = lockers.slice(0, 3);
      sampleLockers.forEach(locker => {
        console.log(`   Locker ${locker.id}: ${locker.status} (${locker.owner_key || 'No owner'})`);
      });
    } else {
      console.log(`⚠️ Locker API - Unexpected response format`);
    }
  } catch (error) {
    console.log(`❌ Locker API - Failed: ${error.message}`);
  }

  console.log('\n🎯 Pi Connection Test Complete!');
  console.log(`📋 Access URLs:`);
  console.log(`   - Gateway: http://${PI_IP}:3000`);
  console.log(`   - Panel:   http://${PI_IP}:3001`);
  console.log(`   - Kiosk:   http://${PI_IP}:3002`);
}

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 5000 }, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (error) {
          resolve({ status: 'ok', raw: data });
        }
      });
    });
    
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
    
    request.on('error', (error) => {
      reject(error);
    });
  });
}

// Run the test
testPiConnection().catch(console.error);