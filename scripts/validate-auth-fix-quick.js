#!/usr/bin/env node

/**
 * Quick validation script for authentication cookie fix
 * Tests the key components without requiring a running server
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating authentication cookie fixes...');
console.log('');

function checkFile(filePath, checks) {
  console.log(`📁 Checking ${path.relative(process.cwd(), filePath)}...`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let allPassed = true;
    
    checks.forEach(check => {
      const passed = check.test(content);
      console.log(`   ${passed ? '✅' : '❌'} ${check.description}`);
      if (!passed) allPassed = false;
    });
    
    return allPassed;
  } catch (error) {
    console.log(`   ❌ Failed to read file: ${error.message}`);
    return false;
  }
}

// Validation checks
const validations = [
  {
    file: 'app/panel/src/index.ts',
    checks: [
      {
        description: 'Cookie parseOptions secure is set to false',
        test: content => /parseOptions:\s*\{[\s\S]*?secure:\s*false/m.test(content)
      },
      {
        description: 'Uses @fastify/cookie plugin',
        test: content => content.includes('@fastify/cookie')
      },
      {
        description: 'Has cookie secret configuration',
        test: content => content.includes('COOKIE_SECRET')
      }
    ]
  },
  {
    file: 'app/panel/src/routes/auth-routes.ts',
    checks: [
      {
        description: 'Contains shouldUseSecureCookies helper function',
        test: content => content.includes('shouldUseSecureCookies')
      },
      {
        description: 'Uses shouldUseSecureCookies() in setCookie call',
        test: content => /setCookie\(['"]session['"][\s\S]*?secure:\s*shouldUseSecureCookies\(\)/m.test(content)
      },
      {
        description: 'No hardcoded secure: process.env.NODE_ENV === "production"',
        test: content => !content.includes('secure: process.env.NODE_ENV === \'production\'')
      }
    ]
  },
  {
    file: 'app/panel/src/middleware/auth-middleware.ts',
    checks: [
      {
        description: 'Excludes /auth/me from authentication',
        test: content => content.includes("request.url === '/auth/me'")
      },
      {
        description: 'Excludes /auth/csrf-token from authentication',
        test: content => content.includes("request.url === '/auth/csrf-token'")
      },
      {
        description: 'Has comprehensive IP extraction logic',
        test: content => content.includes('extractClientIp') && content.includes('x-forwarded-for')
      }
    ]
  }
];

// Run validations
let allValidationsPassed = true;

validations.forEach(validation => {
  const filePath = path.join(__dirname, '..', validation.file);
  const passed = checkFile(filePath, validation.checks);
  if (!passed) allValidationsPassed = false;
  console.log('');
});

// Check environment template
console.log('📁 Checking environment template...');
const envPath = path.join(__dirname, '../.env.example');
try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const hasHttpsEnabled = envContent.includes('HTTPS_ENABLED=false');
  const hasCookieSecret = envContent.includes('COOKIE_SECRET=');
  
  console.log(`   ${hasHttpsEnabled ? '✅' : '❌'} Contains HTTPS_ENABLED configuration`);
  console.log(`   ${hasCookieSecret ? '✅' : '❌'} Contains COOKIE_SECRET configuration`);
  
  if (!hasHttpsEnabled || !hasCookieSecret) allValidationsPassed = false;
} catch (error) {
  console.log(`   ❌ Environment template not found or readable`);
  allValidationsPassed = false;
}

console.log('');

// Summary
if (allValidationsPassed) {
  console.log('🎉 All validation checks passed!');
  console.log('');
  console.log('✅ The authentication cookie fix has been successfully applied.');
  console.log('');
  console.log('🔧 Key improvements:');
  console.log('   • Session cookies are no longer marked as Secure over HTTP');
  console.log('   • /auth/me endpoint is properly excluded from auth middleware');
  console.log('   • Comprehensive IP extraction for various proxy configurations');
  console.log('   • Environment-based HTTPS detection');
  console.log('');
  console.log('🚀 Ready for testing:');
  console.log('   1. Start the panel service');
  console.log('   2. Run: node scripts/test-auth-cookie-fix.js');
  console.log('   3. Test login flow in browser');
} else {
  console.log('❌ Some validation checks failed.');
  console.log('');
  console.log('🔧 Please review the failed checks above and ensure all fixes are properly applied.');
  process.exit(1);
}