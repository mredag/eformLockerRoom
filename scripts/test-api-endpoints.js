#!/usr/bin/env node

/**
 * Test script to verify the new API endpoints are working
 */

const http = require('http');

async function testEndpoint(path, description) {
  return new Promise((resolve) => {
    console.log(`🔍 Testing ${description}...`);
    
    const req = http.get(`http://localhost:3001${path}`, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            console.log(`✅ ${description}: SUCCESS`);
            if (parsed.success) {
              console.log(`   - Layout: ${parsed.layout?.lockers?.length || 'N/A'} lockers`);
              console.log(`   - Stats: ${parsed.stats?.enabledCards || 'N/A'} cards, ${parsed.stats?.totalChannels || 'N/A'} channels`);
            }
          } catch (e) {
            console.log(`✅ ${description}: SUCCESS (HTML response)`);
            console.log(`   - Response length: ${data.length} characters`);
          }
        } else {
          console.log(`❌ ${description}: FAILED (${res.statusCode})`);
          console.log(`   - Error: ${data.substring(0, 100)}...`);
        }
        resolve();
      });
    });
    
    req.on('error', (err) => {
      console.log(`❌ ${description}: ERROR - ${err.message}`);
      resolve();
    });
    
    req.setTimeout(5000, () => {
      console.log(`⏰ ${description}: TIMEOUT`);
      req.destroy();
      resolve();
    });
  });
}

async function testKioskEndpoint(path, description) {
  return new Promise((resolve) => {
    console.log(`🔍 Testing ${description}...`);
    
    const req = http.get(`http://localhost:3002${path}`, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            console.log(`✅ ${description}: SUCCESS`);
            if (parsed.success) {
              console.log(`   - Layout: ${parsed.layout?.lockers?.length || 'N/A'} lockers`);
              console.log(`   - Stats: ${parsed.stats?.enabledCards || 'N/A'} cards, ${parsed.stats?.totalChannels || 'N/A'} channels`);
            }
          } catch (e) {
            console.log(`✅ ${description}: SUCCESS (HTML response)`);
            console.log(`   - Response length: ${data.length} characters`);
          }
        } else {
          console.log(`❌ ${description}: FAILED (${res.statusCode})`);
          console.log(`   - Error: ${data.substring(0, 100)}...`);
        }
        resolve();
      });
    });
    
    req.on('error', (err) => {
      console.log(`❌ ${description}: ERROR - ${err.message}`);
      resolve();
    });
    
    req.setTimeout(5000, () => {
      console.log(`⏰ ${description}: TIMEOUT`);
      req.destroy();
      resolve();
    });
  });
}

async function testAPIEndpoints() {
  console.log('🧪 Testing Dynamic Layout API Endpoints');
  console.log('=======================================');
  
  console.log('\\n📋 Panel Service Endpoints (Port 3001):');
  await testEndpoint('/api/lockers/layout', 'Panel Layout API');
  await testEndpoint('/api/lockers/cards', 'Panel Cards HTML API');
  
  console.log('\\n📱 Kiosk Service Endpoints (Port 3002):');
  await testKioskEndpoint('/api/ui/layout', 'Kiosk Layout API');
  await testKioskEndpoint('/api/ui/tiles', 'Kiosk Tiles HTML API');
  
  console.log('\\n🎉 API endpoint testing completed!');
  console.log('\\n📝 Next Steps:');
  console.log('   1. Start the services: ./scripts/start-all-clean.sh');
  console.log('   2. Open panel: http://localhost:3001/lockers');
  console.log('   3. Open kiosk: http://localhost:3002');
  console.log('   4. Verify exactly 16 lockers are shown (not 30)');
  console.log('   5. Check hardware information is displayed');
}

if (require.main === module) {
  testAPIEndpoints();
}

module.exports = { testAPIEndpoints };