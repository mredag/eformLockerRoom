const http = require('http');

const data = JSON.stringify({
  relay_number: 5,
  staff_user: 'test',
  reason: 'hardware_test'
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/relay/activate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('🔧 Testing relay activation via Panel API...');
console.log('📡 Sending request to:', `http://${options.hostname}:${options.port}${options.path}`);
console.log('📦 Payload:', data);

const req = http.request(options, (res) => {
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  res.on('end', () => {
    console.log('📊 Status Code:', res.statusCode);
    console.log('📋 Response:', responseData);
    
    if (res.statusCode === 200) {
      console.log('✅ Relay activation request successful!');
    } else {
      console.log('❌ Relay activation request failed');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error);
});

req.write(data);
req.end();