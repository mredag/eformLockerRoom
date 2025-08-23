#!/usr/bin/env node

/**
 * Test only the login endpoint to isolate the socket hang up issue
 */

const sqlite3 = require('sqlite3').verbose();
const argon2 = require('argon2');
const bcryptjs = require('bcryptjs');
const path = require('path');

async function testLoginEndpointIssue() {
  console.log('🔍 Testing Login Endpoint Issue');
  console.log('==============================\n');
  
  // First, test the authentication logic directly (same as in AuthService)
  console.log('📋 Step 1: Testing direct authentication logic...');
  
  const dbPath = path.join(process.cwd(), 'data/eform.db');
  console.log('📍 Database path:', dbPath);
  
  try {
    // Test direct SQLite authentication (same as AuthService.authenticateUser)
    const result = await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      
      console.log('🔐 Testing direct SQLite authentication for admin...');
      
      db.get(`
        SELECT id, username, password_hash, role, created_at, last_login, pin_expires_at
        FROM staff_users 
        WHERE username = ? AND active = 1
      `, ['admin'], async (err, userRow) => {
        if (err) {
          console.error('❌ SQLite3 query error:', err);
          db.close();
          resolve({ success: false, error: err.message });
          return;
        }

        if (!userRow) {
          console.log('❌ User not found: admin');
          db.close();
          resolve({ success: false, error: 'User not found' });
          return;
        }

        console.log('✅ User found:', userRow.username);
        console.log('🔍 Hash prefix:', userRow.password_hash ? userRow.password_hash.substring(0, 10) : 'NULL');

        try {
          if (!userRow.password_hash || typeof userRow.password_hash !== 'string' || userRow.password_hash.trim() === '') {
            console.error('❌ Invalid password hash');
            db.close();
            resolve({ success: false, error: 'Invalid password hash' });
            return;
          }

          const hash = userRow.password_hash.trim();
          let isValid = false;

          if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
            console.log('🔐 Verifying bcrypt hash...');
            isValid = await bcryptjs.compare('admin123', hash);
          } else if (hash.startsWith('$argon2')) {
            console.log('🔐 Verifying argon2 hash...');
            isValid = await argon2.verify(hash, 'admin123');
          } else {
            console.error('❌ Unknown hash format:', hash.substring(0, 10));
            db.close();
            resolve({ success: false, error: 'Unknown hash format' });
            return;
          }

          console.log('🔐 Password verification result:', isValid);
          
          db.close();
          resolve({ success: isValid, user: userRow });
        } catch (error) {
          console.error('❌ Password verification error:', error);
          db.close();
          resolve({ success: false, error: error.message });
        }
      });
    });
    
    if (result.success) {
      console.log('✅ Direct authentication successful');
    } else {
      console.log('❌ Direct authentication failed:', result.error);
      return;
    }
    
  } catch (error) {
    console.log('❌ Direct authentication test failed:', error.message);
    return;
  }
  
  // Step 2: Test HTTP login with detailed error handling
  console.log('\n📋 Step 2: Testing HTTP login endpoint with error handling...');
  
  const http = require('http');
  
  const loginData = JSON.stringify({
    username: 'admin',
    password: 'admin123'
  });
  
  try {
    const loginResponse = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3002,
        path: '/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(loginData)
        },
        timeout: 30000 // 30 second timeout
      }, (res) => {
        let responseData = '';
        
        console.log('📊 Response status:', res.statusCode);
        console.log('📊 Response headers:', res.headers);
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsedData = responseData ? JSON.parse(responseData) : null;
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: parsedData
            });
          } catch (error) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: responseData
            });
          }
        });
      });
      
      req.on('error', (error) => {
        console.log('❌ Request error:', error.message);
        reject(error);
      });
      
      req.on('timeout', () => {
        console.log('❌ Request timeout');
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.on('close', () => {
        console.log('🔌 Connection closed');
      });
      
      console.log('📤 Sending login request...');
      req.write(loginData);
      req.end();
    });
    
    console.log('✅ Login request completed');
    console.log('📊 Response:', loginResponse);
    
  } catch (error) {
    console.log('❌ HTTP login test failed:', error.message);
    
    // Check if the server is still running
    console.log('\n📋 Step 3: Checking if server is still running...');
    try {
      const healthResponse = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: 3002,
          path: '/health',
          method: 'GET',
          timeout: 5000
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Health check timeout'));
        });
        req.end();
      });
      
      console.log('✅ Server is still running - health check:', healthResponse.statusCode);
    } catch (healthError) {
      console.log('❌ Server appears to be down:', healthError.message);
    }
  }
  
  console.log('\n📋 Summary:');
  console.log('If direct auth works but HTTP fails with socket hang up:');
  console.log('1. There may be an error in the auth route handler');
  console.log('2. The server might be crashing during login processing');
  console.log('3. There could be a middleware issue');
  console.log('4. Check server logs for crash details');
}

testLoginEndpointIssue().catch(console.error);