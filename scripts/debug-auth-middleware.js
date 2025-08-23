#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function debugAuthMiddleware() {
  console.log('🔍 Debugging Auth Middleware Issue');
  console.log('==================================');
  
  // The issue might be that the session is created but the auth middleware
  // is not finding it. Let's check a few things:
  
  console.log('📋 Possible issues to investigate:');
  console.log('1. Session cookie not being sent correctly');
  console.log('2. Session cookie not being parsed correctly');
  console.log('3. Session not being found in SessionManager');
  console.log('4. IP address validation failing');
  console.log('5. Auth middleware configuration issue');
  
  console.log('\n🔍 Let\'s check the auth middleware configuration...');
  
  // Check if the auth middleware is configured to skip certain routes
  console.log('The /auth/me route should NOT be skipped by auth middleware');
  console.log('But the /auth/login route SHOULD be skipped');
  
  console.log('\n💡 Based on the logs, the issue is likely:');
  console.log('- Session is created successfully (login works)');
  console.log('- Session cookie is set correctly');
  console.log('- But when validating, the session is not found');
  
  console.log('\n🔧 This suggests the issue is in the SessionManager.validateSession method');
  console.log('or the IP address validation logic is too strict');
  
  console.log('\n📝 Next steps:');
  console.log('1. Add debug logging to SessionManager.validateSession');
  console.log('2. Check if the session ID is being passed correctly');
  console.log('3. Verify IP address matching logic');
  
  // Let's check if there are any sessions in the database
  const dbPath = path.join(process.cwd(), 'data', 'eform.db');
  
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err);
        resolve();
        return;
      }
      
      // Check if there are any user sessions in the database
      db.all('SELECT * FROM user_sessions ORDER BY created_at DESC LIMIT 5', [], (err, rows) => {
        if (err) {
          console.error('❌ Error querying user_sessions:', err);
        } else {
          console.log(`\n📊 Recent user sessions in database: ${rows.length}`);
          rows.forEach((row, index) => {
            console.log(`   ${index + 1}. ID: ${row.id}, User: ${row.user_id}, Created: ${row.created_at}`);
            console.log(`      IP: ${row.ip_address}, Expires: ${row.expires_at}`);
          });
        }
        
        db.close();
        resolve();
      });
    });
  });
}

debugAuthMiddleware()
  .then(() => {
    console.log('\n🎯 RECOMMENDATION:');
    console.log('The issue is likely in the SessionManager IP validation.');
    console.log('Even though we added flexible IP validation, there might be');
    console.log('a case we didn\'t handle, or the session is not being stored correctly.');
    console.log('\nTry temporarily disabling IP validation entirely to test.');
  });