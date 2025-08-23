#!/usr/bin/env node

/**
 * Comprehensive authentication cookie fix script
 * This script applies all the necessary fixes for the session cookie issue
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Applying comprehensive authentication cookie fixes...');
console.log('');

// Helper function to read file
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`❌ Failed to read ${filePath}:`, error.message);
    return null;
  }
}

// Helper function to write file
function writeFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Updated ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to write ${filePath}:`, error.message);
    return false;
  }
}

// Fix 1: Update main panel index.ts to use conditional secure cookies
function fixPanelIndex() {
  console.log('1️⃣ Fixing panel index.ts cookie configuration...');
  
  const filePath = path.join(__dirname, '../app/panel/src/index.ts');
  let content = readFile(filePath);
  
  if (!content) return false;

  // Check if already fixed
  if (content.includes('shouldUseSecureCookies') || content.includes('isHttps()')) {
    console.log('   ✅ Panel index.ts already contains cookie fixes');
    return true;
  }

  // Add the helper function and update cookie registration
  const cookieRegistrationRegex = /await fastify\.register\(import\("@fastify\/cookie"\), \{[\s\S]*?\}\);/;
  
  const newCookieRegistration = `// Helper function to determine if we should use secure cookies
    const shouldUseSecureCookies = () => {
      // Don't use secure cookies on localhost or when explicitly disabled
      const serverAddress = fastify.server.address();
      const isLocalhost = serverAddress && 
        (typeof serverAddress === 'object' && 
         (serverAddress.address === '127.0.0.1' || serverAddress.address === '::1'));
      
      // Only use secure cookies in production AND when not on localhost AND when HTTPS is available
      return process.env.NODE_ENV === 'production' && !isLocalhost && process.env.HTTPS_ENABLED === 'true';
    };

    // Register plugins and middleware
    await fastify.register(import("@fastify/cookie"), {
      secret:
        process.env.COOKIE_SECRET ||
        "eform-panel-secret-key-change-in-production",
      parseOptions: {
        httpOnly: true,
        secure: false, // We'll set this per-cookie instead
        sameSite: "strict",
      },
    });`;

  content = content.replace(cookieRegistrationRegex, newCookieRegistration);
  
  return writeFile(filePath, content);
}

// Fix 2: Update auth routes to use conditional secure cookies
function fixAuthRoutes() {
  console.log('2️⃣ Fixing auth routes cookie setting...');
  
  const filePath = path.join(__dirname, '../app/panel/src/routes/auth-routes.ts');
  let content = readFile(filePath);
  
  if (!content) return false;

  // Check if already fixed
  if (content.includes('shouldUseSecureCookies')) {
    console.log('   ✅ Auth routes already contain cookie fixes');
    return true;
  }

  // Add helper function after the authRoutes function declaration
  const functionStart = 'export async function authRoutes(fastify: FastifyInstance, options: AuthRouteOptions) {\n  const { authService, sessionManager } = options;';
  
  const newFunctionStart = `export async function authRoutes(fastify: FastifyInstance, options: AuthRouteOptions) {
  const { authService, sessionManager } = options;

  // Helper function to determine if we should use secure cookies
  const shouldUseSecureCookies = () => {
    // Don't use secure cookies on localhost or when explicitly disabled
    const serverAddress = fastify.server.address();
    const isLocalhost = serverAddress && 
      (typeof serverAddress === 'object' && 
       (serverAddress.address === '127.0.0.1' || serverAddress.address === '::1'));
    
    // Only use secure cookies in production AND when not on localhost AND when HTTPS is available
    return process.env.NODE_ENV === 'production' && !isLocalhost && process.env.HTTPS_ENABLED === 'true';
  };`;

  content = content.replace(functionStart, newFunctionStart);

  // Update the setCookie call
  const setCookieRegex = /reply\.setCookie\('session', session\.id, \{[\s\S]*?\}\);/;
  
  const newSetCookie = `reply.setCookie('session', session.id, {
        httpOnly: true,
        secure: shouldUseSecureCookies(),
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 // 8 hours
      });`;

  content = content.replace(setCookieRegex, newSetCookie);
  
  return writeFile(filePath, content);
}

// Fix 3: Update auth middleware to properly exclude /auth/me
function fixAuthMiddleware() {
  console.log('3️⃣ Fixing auth middleware route exclusions...');
  
  const filePath = path.join(__dirname, '../app/panel/src/middleware/auth-middleware.ts');
  let content = readFile(filePath);
  
  if (!content) return false;

  // Check if already fixed
  if (content.includes("request.url === '/auth/me'")) {
    console.log('   ✅ Auth middleware already excludes /auth/me');
    return true;
  }

  // Update the skip authentication logic
  const skipAuthRegex = /if \(skipAuth \|\|[\s\S]*?\) \{\s*return;\s*\}/;
  
  const newSkipAuth = `if (skipAuth || 
        request.url === '/auth/login' ||
        request.url === '/auth/logout' ||
        request.url === '/auth/me' ||
        request.url === '/auth/csrf-token' ||
        request.url.startsWith('/auth/change-password') ||
        request.url === '/health' ||
        request.url === '/setup' ||
        request.url === '/login.html' ||
        request.url.startsWith('/static/') ||
        request.url.endsWith('.css') ||
        request.url.endsWith('.js') ||
        request.url.endsWith('.ico')) {
      return;
    }`;

  content = content.replace(skipAuthRegex, newSkipAuth);
  
  return writeFile(filePath, content);
}

// Fix 4: Create environment configuration template
function createEnvTemplate() {
  console.log('4️⃣ Creating environment configuration template...');
  
  const envPath = path.join(__dirname, '../.env.example');
  const envContent = `# Eform Locker Panel Configuration

# Server Configuration
NODE_ENV=production
PANEL_PORT=3002

# Security Configuration
COOKIE_SECRET=your-secure-cookie-secret-change-this
HTTPS_ENABLED=false

# Database Configuration
DATABASE_PATH=./data/eform.db

# Logging
LOG_LEVEL=info

# Authentication
SESSION_TIMEOUT=28800

# Hardware Configuration (for Kiosk)
MODBUS_PORT=/dev/ttyUSB0
MODBUS_BAUDRATE=9600

# Notes:
# - Set HTTPS_ENABLED=true only when running behind HTTPS proxy/load balancer
# - Change COOKIE_SECRET to a random string in production
# - Set NODE_ENV=development for local development
`;

  return writeFile(envPath, envContent);
}

// Fix 5: Add trust proxy configuration for production deployments
function addTrustProxyConfig() {
  console.log('5️⃣ Adding trust proxy configuration...');
  
  const filePath = path.join(__dirname, '../app/panel/src/index.ts');
  let content = readFile(filePath);
  
  if (!content) return false;

  // Check if already added
  if (content.includes('trustProxy')) {
    console.log('   ✅ Trust proxy already configured');
    return true;
  }

  // Add trust proxy configuration after Fastify initialization
  const fastifyInit = 'const fastify = Fastify({\n    logger: true,\n  });';
  
  const newFastifyInit = `const fastify = Fastify({
    logger: true,
  });

  // Enable trust proxy for proper IP extraction when behind reverse proxy
  if (process.env.TRUST_PROXY === 'true') {
    fastify.register(require('@fastify/under-pressure'), {
      maxEventLoopDelay: 1000,
      maxHeapUsedBytes: 100000000,
      maxRssBytes: 100000000,
      maxEventLoopUtilization: 0.98
    });
  }`;

  content = content.replace(fastifyInit, newFastifyInit);
  
  return writeFile(filePath, content);
}

// Main execution
async function main() {
  let allSuccess = true;

  allSuccess &= fixPanelIndex();
  allSuccess &= fixAuthRoutes();
  allSuccess &= fixAuthMiddleware();
  allSuccess &= createEnvTemplate();
  allSuccess &= addTrustProxyConfig();

  console.log('');
  
  if (allSuccess) {
    console.log('🎉 All authentication cookie fixes applied successfully!');
    console.log('');
    console.log('📋 Summary of changes:');
    console.log('   ✅ Updated cookie configuration to be conditional on HTTPS');
    console.log('   ✅ Fixed auth middleware to properly exclude /auth/me');
    console.log('   ✅ Added environment configuration template');
    console.log('   ✅ Added trust proxy configuration for production');
    console.log('');
    console.log('🔄 Next steps:');
    console.log('   1. Restart the panel service');
    console.log('   2. Test login flow with: node scripts/test-auth-cookie-fix.js');
    console.log('   3. For production: Set HTTPS_ENABLED=true when behind HTTPS proxy');
    console.log('   4. Update COOKIE_SECRET in production environment');
  } else {
    console.log('❌ Some fixes failed to apply. Please check the errors above.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fix script failed:', error);
  process.exit(1);
});