#!/usr/bin/env node

/**
 * Quick fix for session mismatch issue
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Applying Session Issue Fix');
console.log('');

// The issue might be that sessions are being cleaned up too aggressively
// or there's a race condition. Let's modify the session manager to be more lenient.

console.log('1️⃣ Checking session manager configuration...');

const sessionManagerPath = path.join(process.cwd(), 'app/panel/src/services/session-manager.ts');
if (fs.existsSync(sessionManagerPath)) {
  let content = fs.readFileSync(sessionManagerPath, 'utf8');
  
  // Check current cleanup interval
  const hasCleanupInterval = content.includes('cleanupInterval:');
  console.log(`   Cleanup interval configured: ${hasCleanupInterval ? '✅ YES' : '❌ NO'}`);
  
  // Check if IP validation is disabled
  const hasIpValidationDisabled = content.includes('IP validation disabled');
  console.log(`   IP validation disabled: ${hasIpValidationDisabled ? '✅ YES' : '❌ NO'}`);
  
  // Increase session timeout and reduce cleanup frequency for debugging
  if (content.includes('sessionTimeout: 8 * 60 * 60 * 1000')) {
    content = content.replace(
      'sessionTimeout: 8 * 60 * 60 * 1000, // 8 hours',
      'sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours (extended for debugging)'
    );
    console.log('   ✅ Extended session timeout to 24 hours');
  }
  
  if (content.includes('maxIdleTime: 30 * 60 * 1000')) {
    content = content.replace(
      'maxIdleTime: 30 * 60 * 1000, // 30 minutes',
      'maxIdleTime: 2 * 60 * 60 * 1000, // 2 hours (extended for debugging)'
    );
    console.log('   ✅ Extended idle timeout to 2 hours');
  }
  
  if (content.includes('cleanupInterval: 15 * 60 * 1000')) {
    content = content.replace(
      'cleanupInterval: 15 * 60 * 1000 // 15 minutes',
      'cleanupInterval: 60 * 60 * 1000 // 1 hour (reduced frequency for debugging)'
    );
    console.log('   ✅ Reduced cleanup frequency to 1 hour');
  }
  
  fs.writeFileSync(sessionManagerPath, content);
  console.log('   ✅ Updated session manager configuration');
} else {
  console.log('   ❌ Session manager file not found');
}

console.log('');
console.log('2️⃣ Creating browser test page...');

// Create a simple test page to help debug browser behavior
const testPageContent = `<!DOCTYPE html>
<html>
<head>
    <title>Session Debug Test</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .test-result { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        .info { background: #d1ecf1; color: #0c5460; }
        button { padding: 10px 20px; margin: 5px; cursor: pointer; }
    </style>
</head>
<body>
    <h1>🔍 Session Debug Test</h1>
    <p>This page helps debug session cookie issues.</p>
    
    <div id="results"></div>
    
    <button onclick="testLogin()">Test Login</button>
    <button onclick="testAuthMe()">Test /auth/me</button>
    <button onclick="testDashboard()">Test Dashboard</button>
    <button onclick="clearCookies()">Clear Cookies</button>
    <button onclick="showCookies()">Show Cookies</button>
    
    <script>
        function addResult(message, type = 'info') {
            const div = document.createElement('div');
            div.className = 'test-result ' + type;
            div.innerHTML = new Date().toLocaleTimeString() + ': ' + message;
            document.getElementById('results').appendChild(div);
        }
        
        async function testLogin() {
            try {
                const response = await fetch('/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: 'admin', password: 'admin123' })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    addResult('✅ Login successful: ' + data.user.username, 'success');
                    showCookies();
                } else {
                    addResult('❌ Login failed: ' + response.status, 'error');
                }
            } catch (error) {
                addResult('❌ Login error: ' + error.message, 'error');
            }
        }
        
        async function testAuthMe() {
            try {
                const response = await fetch('/auth/me');
                if (response.ok) {
                    const data = await response.json();
                    addResult('✅ /auth/me successful: ' + data.user.username, 'success');
                } else {
                    addResult('❌ /auth/me failed: ' + response.status, 'error');
                }
            } catch (error) {
                addResult('❌ /auth/me error: ' + error.message, 'error');
            }
        }
        
        async function testDashboard() {
            try {
                const response = await fetch('/dashboard');
                if (response.ok) {
                    addResult('✅ Dashboard accessible', 'success');
                } else if (response.status === 302) {
                    addResult('⚠️ Dashboard redirected (check login)', 'info');
                } else {
                    addResult('❌ Dashboard failed: ' + response.status, 'error');
                }
            } catch (error) {
                addResult('❌ Dashboard error: ' + error.message, 'error');
            }
        }
        
        function clearCookies() {
            document.cookie.split(";").forEach(function(c) { 
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
            });
            addResult('🗑️ Cookies cleared', 'info');
        }
        
        function showCookies() {
            const cookies = document.cookie || 'No cookies found';
            addResult('🍪 Current cookies: ' + cookies, 'info');
        }
        
        // Auto-show cookies on page load
        showCookies();
    </script>
</body>
</html>`;

const testPagePath = path.join(process.cwd(), 'app/panel/src/views/debug-session.html');
fs.writeFileSync(testPagePath, testPageContent);
console.log('   ✅ Created debug test page at /debug-session.html');

console.log('');
console.log('3️⃣ Adding debug route...');

// Add a debug route to the main index.ts
const indexPath = path.join(process.cwd(), 'app/panel/src/index.ts');
if (fs.existsSync(indexPath)) {
  let indexContent = fs.readFileSync(indexPath, 'utf8');
  
  if (!indexContent.includes('/debug-session')) {
    // Add debug route before the health check
    const healthRouteIndex = indexContent.indexOf('// Health check endpoint');
    if (healthRouteIndex > -1) {
      const debugRoute = `
    // Debug session route (temporary)
    fastify.get("/debug-session", async (_request, reply) => {
      reply.sendFile("debug-session.html");
    });

    `;
      indexContent = indexContent.slice(0, healthRouteIndex) + debugRoute + indexContent.slice(healthRouteIndex);
      fs.writeFileSync(indexPath, indexContent);
      console.log('   ✅ Added debug route to index.ts');
    }
  } else {
    console.log('   ✅ Debug route already exists');
  }
}

console.log('');
console.log('✅ Session issue fix applied!');
console.log('');
console.log('🔄 Next steps:');
console.log('   1. Restart the panel service');
console.log('   2. Visit http://192.168.1.8:3002/debug-session in browser');
console.log('   3. Use the test buttons to debug session behavior');
console.log('   4. Run: node scripts/debug-session-mismatch.js for detailed testing');
console.log('');
console.log('💡 Changes made:');
console.log('   • Extended session timeout to 24 hours');
console.log('   • Extended idle timeout to 2 hours');
console.log('   • Reduced cleanup frequency to 1 hour');
console.log('   • Added browser debug test page');
console.log('   • Added /debug-session route');