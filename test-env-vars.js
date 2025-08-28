// Test environment variables on Pi
require('dotenv').config();

console.log('🔍 Environment Variables Test:');
console.log('MAKSI_BASE:', process.env.MAKSI_BASE || 'NOT SET');
console.log('MAKSI_ENABLED:', process.env.MAKSI_ENABLED || 'NOT SET');
console.log('MAKSI_BOOTSTRAP_COOKIE:', process.env.MAKSI_BOOTSTRAP_COOKIE ? 'SET (length: ' + process.env.MAKSI_BOOTSTRAP_COOKIE.length + ')' : 'NOT SET');
console.log('MAKSI_SEARCH_PATH:', process.env.MAKSI_SEARCH_PATH || 'NOT SET');
console.log('MAKSI_CRITERIA_FOR_RFID:', process.env.MAKSI_CRITERIA_FOR_RFID || 'NOT SET');