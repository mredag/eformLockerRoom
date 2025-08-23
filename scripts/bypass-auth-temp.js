#!/usr/bin/env node

// Temporary authentication bypass for initial setup
// This creates a simple auth bypass route for emergency access

const fs = require('fs');
const path = require('path');

const bypassCode = `
// TEMPORARY AUTH BYPASS - REMOVE IN PRODUCTION
app.get('/bypass-auth', async (request, reply) => {
  console.log('🚨 EMERGENCY AUTH BYPASS USED - REMOVE IN PRODUCTION');
  
  // Create a temporary session
  const sessionId = 'temp-admin-session-' + Date.now();
  const csrfToken = 'temp-csrf-' + Date.now();
  
  // Set session cookie
  reply.setCookie('session', sessionId, {
    httpOnly: true,
    secure: false, // Set to true in production with HTTPS
    sameSite: 'strict',
    maxAge: 3600000 // 1 hour
  });
  
  // Store temporary session in memory (not persistent)
  if (!global.tempSessions) global.tempSessions = new Map();
  global.tempSessions.set(sessionId, {
    id: sessionId,
    user: { id: 1, username: 'admin', role: 'admin' },
    csrfToken: csrfToken,
    createdAt: new Date()
  });
  
  // Redirect to dashboard
  reply.redirect('/dashboard.html');
});

// Modify session validation to check temp sessions
const originalValidateSession = sessionManager.validateSession;
sessionManager.validateSession = function(sessionToken) {
  // Check temp sessions first
  if (global.tempSessions && global.tempSessions.has(sessionToken)) {
    return global.tempSessions.get(sessionToken);
  }
  // Fall back to original validation
  return originalValidateSession.call(this, sessionToken);
};
`;

const indexPath = path.join(__dirname, '../app/panel/src/index.ts');

try {
  let content = fs.readFileSync(indexPath, 'utf8');
  
  // Check if bypass already exists
  if (content.includes('bypass-auth')) {
    console.log('⚠️  Auth bypass already exists in index.ts');
    return;
  }
  
  // Find the place to insert the bypass (after fastify is created but before routes)
  const insertPoint = content.indexOf('// Register routes');
  
  if (insertPoint === -1) {
    console.log('❌ Could not find insertion point in index.ts');
    return;
  }
  
  // Insert the bypass code
  const newContent = content.slice(0, insertPoint) + bypassCode + '\n    ' + content.slice(insertPoint);
  
  // Write the modified file
  fs.writeFileSync(indexPath, newContent);
  
  console.log('✅ Temporary auth bypass added to panel service');
  console.log('🚨 WARNING: This is for emergency access only!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Rebuild the panel: npm run build:panel');
  console.log('2. Restart the panel service');
  console.log('3. Go to: http://localhost:3002/bypass-auth');
  console.log('4. This will log you in temporarily');
  console.log('5. REMOVE this bypass after fixing the real auth issue!');
  
} catch (error) {
  console.error('❌ Error adding auth bypass:', error);
}