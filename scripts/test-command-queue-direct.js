#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();

console.log('🧪 Direct CommandQueue Test');
console.log('===========================');

async function testCommandQueue() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database('./data/eform.db', (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
        reject(err);
        return;
      }
      
      console.log('✅ Connected to database');
      
      // Test the exact query that CommandQueueManager uses
      const kioskId = 'kiosk-1';
      const limit = 10;
      const now = new Date().toISOString();
      
      console.log('🔍 Testing query with parameters:');
      console.log('  kioskId:', kioskId);
      console.log('  now:', now);
      console.log('  limit:', limit);
      
      const query = `SELECT * FROM command_queue 
       WHERE kiosk_id = ? AND status = 'pending' AND next_attempt_at <= ?
       ORDER BY created_at ASC LIMIT ?`;
      
      console.log('📝 Query:', query);
      
      db.all(query, [kioskId, now, limit], (err, rows) => {
        if (err) {
          console.error('❌ Query error:', err.message);
          db.close();
          reject(err);
          return;
        }
        
        console.log('📊 Query results:');
        console.log('  Row count:', rows.length);
        
        if (rows.length > 0) {
          console.log('  First row:', JSON.stringify(rows[0], null, 2));
        } else {
          console.log('  No rows returned');
          
          // Debug: check what's in the table
          db.all('SELECT command_id, kiosk_id, status, next_attempt_at FROM command_queue WHERE kiosk_id = ?', [kioskId], (err, debugRows) => {
            if (err) {
              console.error('❌ Debug query error:', err.message);
            } else {
              console.log('🔍 Debug - All commands for kiosk-1:');
              debugRows.forEach(row => {
                console.log(`    ${row.command_id}: ${row.status}, next_attempt: ${row.next_attempt_at}`);
                console.log(`    Comparison: "${row.next_attempt_at}" <= "${now}" = ${row.next_attempt_at <= now}`);
              });
            }
            db.close();
            resolve();
          });
          return;
        }
        
        db.close();
        resolve();
      });
    });
  });
}

testCommandQueue().catch(console.error);