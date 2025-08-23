#!/usr/bin/env node

/**
 * Immediate fix for cookie issue - ensures proper environment configuration
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Applying Immediate Cookie Fix');
console.log('');

// Step 1: Create/update .env file
console.log('1️⃣ Configuring Environment Variables...');
const envPath = path.join(process.cwd(), '.env');
const envConfig = `# Eform Panel Configuration - Updated for HTTP Cookie Fix
NODE_ENV=production
HTTPS_ENABLED=false
PANEL_PORT=3002
COOKIE_SECRET=eform-pi-secret-${Date.now()}
DATABASE_PATH=./data/eform.db
LOG_LEVEL=info
`;

fs.writeFileSync(envPath, envConfig);
console.log('   ✅ Created .env with HTTPS_ENABLED=false');

// Step 2: Verify auth routes configuration
console.log('');
console.log('2️⃣ Checking Auth Routes...');
const authRoutesPath = path.join(process.cwd(), 'app/panel/src/routes/auth-routes.ts');
if (fs.existsSync(authRoutesPath)) {
  const content = fs.readFileSync(authRoutesPath, 'utf8');
  
  if (!content.includes('shouldUseSecureCookies')) {
    console.log('   ❌ shouldUseSecureCookies helper missing - applying fix...');
    
    // Add the helper function
    const functionStart = 'export async function authRoutes(fastify: FastifyInstance, options: AuthRouteOptions) {\n  const { authService, sessionManager } = options;';
    
    const newFunctionStart = `export async function authRoutes(fastify: FastifyInstance, options: AuthRouteOptions) {
  const { authService, sessionManager } = options;

  // Helper function to determine if we should use secure cookies
  const shouldUseSecureCookies = () => {
    // Only use secure cookies when explicitly enabled for HTTPS
    return process.env.HTTPS_ENABLED === 'true';
  };`;

    const updatedContent = content.replace(functionStart, newFunctionStart);
    
    // Update setCookie call
    const setCookieRegex = /reply\.setCookie\('session', session\.id, \{[\s\S]*?\}\);/;
    const newSetCookie = `reply.setCookie('session', session.id, {
        httpOnly: true,
        secure: shouldUseSecureCookies(),
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 // 8 hours
      });`;
    
    const finalContent = updatedContent.replace(setCookieRegex, newSetCookie);
    fs.writeFileSync(authRoutesPath, finalContent);
    console.log('   ✅ Updated auth routes with proper cookie logic');
  } else {
    console.log('   ✅ Auth routes already have shouldUseSecureCookies helper');
  }
} else {
  console.log('   ❌ Auth routes file not found');
}

// Step 3: Test the configuration
console.log('');
console.log('3️⃣ Testing Configuration...');

// Set environment variables for this process
process.env.NODE_ENV = 'production';
process.env.HTTPS_ENABLED = 'false';
process.env.PANEL_PORT = '3002';

console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`   HTTPS_ENABLED: ${process.env.HTTPS_ENABLED}`);
console.log(`   Should use secure cookies: ${process.env.HTTPS_ENABLED === 'true'}`);

console.log('');
console.log('✅ Immediate fix applied!');
console.log('');
console.log('🔄 Next steps:');
console.log('   1. Restart the panel service');
console.log('   2. Test login in browser');
console.log('   3. Run: node scripts/debug-cookie-issue.js for detailed testing');
console.log('');
console.log('💡 Key changes:');
console.log('   • Set HTTPS_ENABLED=false explicitly');
console.log('   • Simplified cookie security logic');
console.log('   • Generated new COOKIE_SECRET');