const https = require('http');

const options = {
  hostname: '192.168.1.8',
  port: 3002,
  path: '/api/lockers/available?kioskId=kiosk-1',
  method: 'GET'
};

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      console.log('=== API RESPONSE ANALYSIS ===');
      console.log(`Total lockers returned: ${response.lockers ? response.lockers.length : 0}`);
      
      if (response.lockers) {
        const lockerIds = response.lockers.map(l => l.id).sort((a, b) => a - b);
        console.log('Locker IDs returned:', lockerIds);
        
        // Find missing IDs from 1-30
        const allIds = Array.from({length: 30}, (_, i) => i + 1);
        const missingIds = allIds.filter(id => !lockerIds.includes(id));
        console.log('Missing locker IDs:', missingIds);
        
        // Show first few lockers with details
        console.log('\\nFirst 5 lockers with details:');
        response.lockers.slice(0, 5).forEach(locker => {
          console.log(`  Locker ${locker.id}: ${locker.displayName} (status: ${locker.status})`);
        });
      } else {
        console.log('No lockers array in response');
        console.log('Full response:', data);
      }
    } catch (error) {
      console.error('Error parsing response:', error);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.end();