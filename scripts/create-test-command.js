#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

console.log('🧪 Creating Test Command');
console.log('========================');

async function createTestCommand() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database('./data/eform_locker.db', (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
        reject(err);
        return;
      }
      
      console.log('📝 Creating test command for kiosk-1...');
      
      const commandId = uuidv4();
      const now = new Date().toISOString();
      const payload = JSON.stringify({
        locker_id: 1,
        staff_user: 'test-user',
        reason: 'Hardware test',
        force: false
      });
      
      db.run(
        `INSERT INTO command_queue 
         (command_id, kiosk_id, command_type, payload, max_retries, created_at, next_attempt_at, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [commandId, 'kiosk-1', 'open_locker', payload, 3, now, now, 'pending'],
        function(err) {
          if (err) {
            console.error('❌ Error creating command:', err.message);
            db.close();
            reject(err);
            return;
          }
          
          console.log(`✅ Command created: ${commandId}`);
          
          // Query the command back to verify
          db.get(
            'SELECT * FROM command_queue WHERE command_id = ?',
            [commandId],
            (err, row) => {
              if (err) {
                console.error('❌ Error querying command:', err.message);
              } else if (row) {
                console.log('📊 Command details:');
                console.log(`   ID: ${row.command_id}`);
                console.log(`   Type: ${row.command_type}`);
                console.log(`   Status: ${row.status}`);
                console.log(`   Kiosk: ${row.kiosk_id}`);
                console.log(`   Created: ${row.created_at}`);
                console.log(`   Payload: ${row.payload}`);
              }
              
              console.log('');
              console.log('💡 Now test if kiosk picks it up:');
              console.log('curl -X POST http://localhost:3000/api/heartbeat/commands/poll \\');
              console.log('  -H "Content-Type: application/json" \\');
              console.log('  -d \'{"kiosk_id": "kiosk-1"}\'');
              
              db.close();
              resolve();
            }
          );
        }
      );
    });
  });
}

createTestCommand().catch(console.error);