#!/usr/bin/env node

/**
 * Check current cookie configuration and environment
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking Cookie Configuration');
console.log('');

// Check environment variables
console.log('1️⃣ Environment Variables:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}`);
console.log(`   HTTPS_ENABLED: ${process.env.HTTPS_ENABLED || 'NOT SET'}`);
console.log(`   PANEL_PORT: ${process.env.PANEL_PORT || 'NOT SET'}`);
console.log(`   COOKIE_SECRET: ${process.env.COOKIE_SECRET ? 'SET (hidden)' : 'NOT SET'}`);
console.log('');

// Check .env file
console.log('2️⃣ .env File:');
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  console.log('   ✅ .env file exists');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  envLines.forEach(line => {
    const [key, value] = line.split('=');
    if (key && key.includes('COOKIE') || key.includes('HTTPS') || key.includes('NODE_ENV')) {
      console.log(`   ${key}=${key.includes('SECRET') ? 'SET (hidden)' : value}`);
    }
  });
} else {
  console.log('   ❌ .env file not found');
}
console.log('');

// Check auth routes file
console.log('3️⃣ Auth Routes Configuration:');
const authRoutesPath = path.join(process.cwd(), 'app/panel/src/routes/auth-routes.ts');
if (fs.existsSync(authRoutesPath)) {
  const authContent = fs.readFileSync(authRoutesPath, 'utf8');
  
  const hasHelper = authContent.includes('shouldUseSecureCookies');
  const hasSecureCall = authContent.includes('secure: shouldUseSecureCookies()');
  const hasOldSecure = authContent.includes("secure: process.env.NODE_ENV === 'production'");
  
  console.log(`   ✅ Auth routes file exists`);
  console.log(`   shouldUseSecureCookies helper: ${hasHelper ? '✅ PRESENT' : '❌ MISSING'}`);
  console.log(`   Dynamic secure setting: ${hasSecureCall ? '✅ PRESENT' : '❌ MISSING'}`);
  console.log(`   Old hardcoded secure: ${hasOldSecure ? '❌ STILL PRESENT' : '✅ REMOVED'}`);
  
  if (hasHelper) {
    // Extract the helper function
    const helperMatch = authContent.match(/const shouldUseSecureCookies = \(\) => \{[\s\S]*?\};/);
    if (helperMatch) {
      console.log('   Helper function found:');
      console.log('   ' + helperMatch[0].split('\n').map(line => '     ' + line).join('\n'));
    }
  }
} else {
  console.log('   ❌ Auth routes file not found');
}
console.log('');

// Check index.ts file
console.log('4️⃣ Main Index Configuration:');
const indexPath = path.join(process.cwd(), 'app/panel/src/index.ts');
if (fs.existsSync(indexPath)) {
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  
  const hasCookiePlugin = indexContent.includes('@fastify/cookie');
  const hasSecureFalse = indexContent.includes('secure: false');
  const hasParseOptions = indexContent.includes('parseOptions');
  
  console.log(`   ✅ Index file exists`);
  console.log(`   Cookie plugin: ${hasCookiePlugin ? '✅ PRESENT' : '❌ MISSING'}`);
  console.log(`   secure: false setting: ${hasSecureFalse ? '✅ PRESENT' : '❌ MISSING'}`);
  console.log(`   parseOptions: ${hasParseOptions ? '✅ PRESENT' : '❌ MISSING'}`);
  
  // Extract cookie configuration
  const cookieMatch = indexContent.match(/await fastify\.register\(import\("@fastify\/cookie"\), \{[\s\S]*?\}\);/);
  if (cookieMatch) {
    console.log('   Cookie configuration:');
    console.log('   ' + cookieMatch[0].split('\n').map(line => '     ' + line).join('\n'));
  }
} else {
  console.log('   ❌ Index file not found');
}
console.log('');

// Check middleware file
console.log('5️⃣ Auth Middleware Configuration:');
const middlewarePath = path.join(process.cwd(), 'app/panel/src/middleware/auth-middleware.ts');
if (fs.existsSync(middlewarePath)) {
  const middlewareContent = fs.readFileSync(middlewarePath, 'utf8');
  
  const excludesAuthMe = middlewareContent.includes("request.url === '/auth/me'");
  const excludesCsrfToken = middlewareContent.includes("request.url === '/auth/csrf-token'");
  
  console.log(`   ✅ Middleware file exists`);
  console.log(`   Excludes /auth/me: ${excludesAuthMe ? '✅ YES' : '❌ NO'}`);
  console.log(`   Excludes /auth/csrf-token: ${excludesCsrfToken ? '✅ YES' : '❌ NO'}`);
  
  // Extract skip logic
  const skipMatch = middlewareContent.match(/if \(skipAuth \|\|[\s\S]*?\) \{\s*return;\s*\}/);
  if (skipMatch) {
    console.log('   Skip authentication logic:');
    const skipLines = skipMatch[0].split('\n').slice(0, 10); // First 10 lines
    skipLines.forEach(line => console.log('     ' + line));
    if (skipMatch[0].split('\n').length > 10) {
      console.log('     ... (truncated)');
    }
  }
} else {
  console.log('   ❌ Middleware file not found');
}
console.log('');

// Summary
console.log('📋 CONFIGURATION SUMMARY:');
const nodeEnv = process.env.NODE_ENV;
const httpsEnabled = process.env.HTTPS_ENABLED;

console.log(`   Environment: ${nodeEnv || 'NOT SET'}`);
console.log(`   HTTPS Enabled: ${httpsEnabled || 'NOT SET'}`);

if (nodeEnv === 'production' && httpsEnabled !== 'false') {
  console.log('   ⚠️  WARNING: NODE_ENV=production but HTTPS_ENABLED is not explicitly false');
  console.log('      This may cause secure cookies to be set over HTTP');
}

if (!process.env.COOKIE_SECRET) {
  console.log('   ⚠️  WARNING: COOKIE_SECRET not set - using default (insecure)');
}

console.log('');
console.log('🔧 RECOMMENDED ACTIONS:');
if (nodeEnv === 'production' && httpsEnabled !== 'false') {
  console.log('   1. Set HTTPS_ENABLED=false in your .env file for HTTP deployments');
}
if (!process.env.COOKIE_SECRET) {
  console.log('   2. Set a random COOKIE_SECRET in your .env file');
}
console.log('   3. Run: node scripts/debug-cookie-issue.js to test cookie behavior');
console.log('   4. Check browser developer tools for cookie storage issues');