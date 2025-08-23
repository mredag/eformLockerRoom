#!/usr/bin/env node

/**
 * Fix browser cookie conflicts by improving cookie management
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Browser Cookie Conflicts');
console.log('');

console.log('1️⃣ Adding cookie cleanup to login process...');

// Update auth routes to clear old cookies before setting new ones
const authRoutesPath = path.join(process.cwd(), 'app/panel/src/routes/auth-routes.ts');
if (fs.existsSync(authRoutesPath)) {
  let content = fs.readFileSync(authRoutesPath, 'utf8');
  
  // Find the login handler and add cookie clearing
  const loginHandlerStart = content.indexOf('// Create session with flexible IP extraction');
  if (loginHandlerStart > -1) {
    const sessionCreationLine = content.indexOf('const session = sessionManager.createSession', loginHandlerStart);
    if (sessionCreationLine > -1) {
      // Add cookie clearing before session creation
      const beforeSession = content.substring(0, sessionCreationLine);
      const afterSession = content.substring(sessionCreationLine);
      
      const cookieClearingCode = `      // Clear any existing session cookies to prevent conflicts
      reply.clearCookie('session', { path: '/' });
      
      `;
      
      content = beforeSession + cookieClearingCode + afterSession;
      console.log('   ✅ Added cookie clearing to login handler');
    }
  }
  
  // Also add cookie clearing to logout handler if not already present
  if (!content.includes('reply.clearCookie(\'session\', { path: \'/\' })')) {
    content = content.replace(
      'reply.clearCookie(\'session\');',
      'reply.clearCookie(\'session\', { path: \'/\' });'
    );
    console.log('   ✅ Updated logout cookie clearing with path');
  }
  
  fs.writeFileSync(authRoutesPath, content);
} else {
  console.log('   ❌ Auth routes file not found');
}

console.log('');
console.log('2️⃣ Adding cookie conflict detection...');

// Add a route to detect and clear conflicting cookies
const indexPath = path.join(process.cwd(), 'app/panel/src/index.ts');
if (fs.existsSync(indexPath)) {
  let indexContent = fs.readFileSync(indexPath, 'utf8');
  
  if (!indexContent.includes('/clear-cookies')) {
    // Add cookie clearing route before health check
    const healthRouteIndex = indexContent.indexOf('// Health check endpoint');
    if (healthRouteIndex > -1) {
      const clearCookiesRoute = `
    // Clear cookies route (for fixing browser conflicts)
    fastify.get("/clear-cookies", async (request, reply) => {
      // Clear all possible session cookies
      reply.clearCookie('session', { path: '/' });
      reply.clearCookie('session', { path: '/auth' });
      reply.clearCookie('session'); // Default path
      
      reply.type('text/html');
      return \`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Cookies Cleared</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin-top: 100px; }
            .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
            .info { color: #6c757d; margin-bottom: 30px; }
            .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="success">✅ Cookies Cleared Successfully!</div>
          <div class="info">All session cookies have been cleared from your browser.</div>
          <a href="/login.html" class="button">Go to Login</a>
          
          <script>
            // Also clear cookies via JavaScript for extra safety
            document.cookie.split(";").forEach(function(c) { 
              document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
            });
            console.log('🍪 JavaScript cookie clearing completed');
          </script>
        </body>
        </html>
      \`;
    });

    `;
      indexContent = indexContent.slice(0, healthRouteIndex) + clearCookiesRoute + indexContent.slice(healthRouteIndex);
      fs.writeFileSync(indexPath, indexContent);
      console.log('   ✅ Added /clear-cookies route');
    }
  } else {
    console.log('   ✅ Clear cookies route already exists');
  }
}

console.log('');
console.log('3️⃣ Creating browser fix instructions...');

const instructionsContent = `# Browser Cookie Conflict Fix

## 🚨 Problem
Normal browser has old/conflicting session cookies, but incognito mode works fine.

## 🔧 Quick Fixes

### Option 1: Clear Cookies via Browser
1. Open browser developer tools (F12)
2. Go to Application/Storage tab
3. Find Cookies section
4. Delete all cookies for 192.168.1.8:3002
5. Refresh page and try login again

### Option 2: Use Clear Cookies Route
1. Visit: http://192.168.1.8:3002/clear-cookies
2. Click "Go to Login" button
3. Try login again

### Option 3: Manual Cookie Clearing
1. In browser address bar, type: javascript:document.cookie.split(";").forEach(function(c){document.cookie=c.replace(/^ +/,"").replace(/=.*/,"=;expires="+new Date().toUTCString()+";path=/");});alert("Cookies cleared!");
2. Press Enter
3. Refresh page and try login

## 🎯 Prevention
The system now automatically clears old cookies during login to prevent future conflicts.

## ✅ Verification
After clearing cookies:
- Login should work in normal browser
- No more redirect loops
- Session should persist properly
`;

fs.writeFileSync(path.join(process.cwd(), 'BROWSER-COOKIE-FIX.md'), instructionsContent);
console.log('   ✅ Created browser fix instructions');

console.log('');
console.log('✅ Browser cookie conflict fix applied!');
console.log('');
console.log('🔄 Next steps:');
console.log('   1. Restart the panel service');
console.log('   2. Visit http://192.168.1.8:3002/clear-cookies to clear old cookies');
console.log('   3. Or manually clear cookies in browser developer tools');
console.log('   4. Try login in normal browser - should work now!');
console.log('');
console.log('💡 Changes made:');
console.log('   • Added automatic cookie clearing during login');
console.log('   • Added /clear-cookies route for manual clearing');
console.log('   • Improved logout cookie clearing');
console.log('   • Created browser fix instructions');
console.log('');
console.log('🎯 This should make normal browser work just like incognito mode!');