#!/usr/bin/env node

const http = require('http');

// Configuration - update these if your Pi has different IP/ports
const PI_IP = process.env.PI_IP || 'localhost';
const GATEWAY_PORT = process.env.GATEWAY_PORT || '3000';
const KIOSK_PORT = process.env.KIOSK_PORT || '3001';

console.log('🔍 Remote Command Status Checker');
console.log('================================');
console.log(`Target: ${PI_IP}`);
console.log('');

async function makeRequest(url, description) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`✅ ${description}: ${res.statusCode}`);
        try {
          const parsed = JSON.parse(data);
          console.log(`   Response:`, JSON.stringify(parsed, null, 2));
        } catch (e) {
          console.log(`   Response: ${data.substring(0, 200)}${data.length > 200 ? '...' : ''}`);
        }
        resolve({ success: true, data, statusCode: res.statusCode });
      });
    });
    
    req.on('error', (err) => {
      console.log(`❌ ${description}: ${err.message}`);
      resolve({ success: false, error: err.message });
    });
    
    req.setTimeout(5000, () => {
      console.log(`⏰ ${description}: Timeout`);
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });
  });
}

async function checkServices() {
  console.log('📡 Testing Gateway...');
  await makeRequest(`http://${PI_IP}:${GATEWAY_PORT}/api/heartbeat/commands/poll`, 'Commands Poll');
  await makeRequest(`http://${PI_IP}:${GATEWAY_PORT}/api/heartbeat/kiosks`, 'Kiosk Registration');
  
  console.log('\n🖥️ Testing Kiosk...');
  await makeRequest(`http://${PI_IP}:${KIOSK_PORT}/health`, 'Kiosk Health');
  
  console.log('\n📊 Testing Command Creation...');
  const testCommand = JSON.stringify({
    type: 'OPEN_LOCKER',
    lockerId: 1,
    kioskId: 'test-kiosk'
  });
  
  // Note: This would need POST request implementation for full testing
  console.log('💡 To test command creation, run this curl on the Pi:');
  console.log(`curl -X POST http://localhost:3000/api/commands \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '${testCommand}'`);
}

// Usage instructions
if (process.argv.includes('--help')) {
  console.log('Usage:');
  console.log('  node scripts/check-command-status-remote.js');
  console.log('  PI_IP=192.168.1.100 node scripts/check-command-status-remote.js');
  console.log('');
  console.log('Environment variables:');
  console.log('  PI_IP: IP address of Raspberry Pi (default: localhost)');
  console.log('  GATEWAY_PORT: Gateway service port (default: 3000)');
  console.log('  KIOSK_PORT: Kiosk service port (default: 3001)');
  process.exit(0);
}

checkServices().catch(console.error);