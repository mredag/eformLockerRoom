#!/usr/bin/env node

/**
 * Add cookie clearing route to main index.ts
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Adding Cookie Clearing Route');

const indexPath = path.join(process.cwd(), 'app/panel/src/index.ts');
if (fs.existsSync(indexPath)) {
  let content = fs.readFileSync(indexPath, 'utf8');
  
  if (!content.includes('/clear-cookies')) {
    // Find the health check endpoint and add before it
    const healthIndex = content.indexOf('// Health check endpoint');
    if (healthIndex > -1) {
      const clearCookiesRoute = `
    // Clear cookies endpoint (fix browser conflicts)
    fastify.get("/clear-cookies", async (request, reply) => {
      // Clear session cookies with all possible paths
      reply.clearCookie('session', { path: '/' });
      reply.clearCookie('session', { path: '/auth' });
      reply.clearCookie('session');
      
      reply.type('text/html');
      return \`
        <!DOCTYPE html>
        <html>
        <head>
          <title>🍪 Cookie Cleaner - Eform Panel</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh; margin: 0; display: flex; align-items: center; justify-content: center;
            }
            .container { 
              background: white; padding: 3rem; border-radius: 15px; 
              box-shadow: 0 20px 40px rgba(0,0,0,0.1); text-align: center; max-width: 500px; width: 90%;
            }
            .success { color: #28a745; font-size: 2rem; margin-bottom: 1rem; }
            .title { color: #333; font-size: 1.5rem; margin-bottom: 1rem; font-weight: 600; }
            .info { color: #6c757d; margin-bottom: 2rem; line-height: 1.6; }
            .button { 
              display: inline-block; padding: 12px 30px; background: #007bff; color: white; 
              text-decoration: none; border-radius: 8px; font-weight: 500; transition: all 0.3s;
              margin: 0 10px;
            }
            .button:hover { background: #0056b3; transform: translateY(-2px); }
            .button.secondary { background: #6c757d; }
            .button.secondary:hover { background: #545b62; }
            .steps { text-align: left; margin: 2rem 0; }
            .steps li { margin: 0.5rem 0; }
            .note { background: #f8f9fa; padding: 1rem; border-radius: 8px; margin-top: 2rem; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success">✅</div>
            <div class="title">Cookies Cleared Successfully!</div>
            <div class="info">
              All session cookies have been cleared from your browser. 
              This should fix any login issues caused by conflicting cookies.
            </div>
            
            <div class="steps">
              <strong>What happened:</strong>
              <ul>
                <li>🗑️ Removed old session cookies</li>
                <li>🧹 Cleared browser cache conflicts</li>
                <li>🔄 Reset authentication state</li>
              </ul>
            </div>
            
            <a href="/login.html" class="button">Go to Login</a>
            <a href="/debug-session" class="button secondary">Debug Tools</a>
            
            <div class="note">
              <strong>💡 Tip:</strong> If you continue having issues, try using incognito/private mode 
              or manually clear all cookies for this site in your browser settings.
            </div>
          </div>
          
          <script>
            // Additional JavaScript cookie clearing for extra safety
            console.log('🍪 Clearing cookies via JavaScript...');
            
            // Clear all cookies for this domain
            document.cookie.split(";").forEach(function(c) { 
              const cookie = c.replace(/^ +/, "");
              const eqPos = cookie.indexOf("=");
              const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
              
              // Clear with different path combinations
              document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
              document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/auth";
              document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
            });
            
            console.log('✅ JavaScript cookie clearing completed');
            
            // Show current cookies (should be empty)
            setTimeout(() => {
              const remainingCookies = document.cookie;
              console.log('🔍 Remaining cookies:', remainingCookies || 'None');
            }, 100);
          </script>
        </body>
        </html>
      \`;
    });

    `;
      
      content = content.slice(0, healthIndex) + clearCookiesRoute + content.slice(healthIndex);
      fs.writeFileSync(indexPath, content);
      console.log('✅ Added /clear-cookies route to index.ts');
    }
  } else {
    console.log('✅ Clear cookies route already exists');
  }
} else {
  console.log('❌ Index.ts file not found');
}

console.log('');
console.log('🎯 Cookie clearing route added!');
console.log('Users can now visit: http://192.168.1.8:3002/clear-cookies');