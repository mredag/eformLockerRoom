#!/usr/bin/env node

/**
 * Fix cookie manager timing issue
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Cookie Manager Timing Issue');
console.log('');

// The issue is that aggressive clearing might interfere with setting
// Let's simplify the cookie manager to be less aggressive

console.log('1️⃣ Simplifying cookie manager...');

const simplifiedCookieManager = `import { FastifyReply } from 'fastify';

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number;
  path?: string;
  domain?: string;
}

export class CookieManager {
  private static readonly COOKIE_NAME = 'session';
  private static readonly DEFAULT_PATH = '/';
  
  /**
   * Set session cookie with simple clearing of old cookies
   */
  static setSessionCookie(reply: FastifyReply, sessionId: string, options: CookieOptions = {}): void {
    // Simple clearing - just the main variations
    reply.clearCookie(this.COOKIE_NAME, { path: '/' });
    reply.clearCookie(this.COOKIE_NAME, { path: '/auth' });
    reply.clearCookie(this.COOKIE_NAME); // Default path
    
    // Set the new cookie with proper options
    const cookieOptions = {
      path: this.DEFAULT_PATH,
      httpOnly: true,
      sameSite: 'strict' as const,
      maxAge: 8 * 60 * 60, // 8 hours
      ...options
    };
    
    reply.setCookie(this.COOKIE_NAME, sessionId, cookieOptions);
    
    console.log(\`🍪 Set session cookie: \${sessionId.substring(0, 16)}... with options:\`, cookieOptions);
  }
  
  /**
   * Clear session cookies (simplified)
   */
  static clearAllSessionCookies(reply: FastifyReply): void {
    // Simple clearing without aggressive domain/path combinations
    reply.clearCookie(this.COOKIE_NAME, { path: '/' });
    reply.clearCookie(this.COOKIE_NAME, { path: '/auth' });
    reply.clearCookie(this.COOKIE_NAME); // Default path
    
    console.log('🗑️ Cleared session cookies');
  }
  
  /**
   * Get session cookie value from request
   */
  static getSessionCookie(request: any): string | null {
    return request.cookies?.[this.COOKIE_NAME] || null;
  }
  
  /**
   * Check if secure cookies should be used
   */
  static shouldUseSecureCookies(): boolean {
    // Only use secure cookies when explicitly enabled for HTTPS
    return process.env.HTTPS_ENABLED === 'true';
  }
  
  /**
   * Generate cookie options based on environment
   */
  static getDefaultCookieOptions(): CookieOptions {
    return {
      path: this.DEFAULT_PATH,
      httpOnly: true,
      secure: this.shouldUseSecureCookies(),
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 // 8 hours
    };
  }
}`;

const cookieManagerPath = path.join(process.cwd(), 'shared/services/cookie-manager.ts');
fs.writeFileSync(cookieManagerPath, simplifiedCookieManager);
console.log('   ✅ Simplified cookie manager');

// 2. Temporarily disable the cleanup service that might be interfering
console.log('');
console.log('2️⃣ Temporarily disabling cleanup service...');

const indexPath = path.join(process.cwd(), 'app/panel/src/index.ts');
if (fs.existsSync(indexPath)) {
  let content = fs.readFileSync(indexPath, 'utf8');
  
  // Comment out the cleanup service
  if (content.includes('cookieCleanupService.startCleanup(fastify);')) {
    content = content.replace(
      'cookieCleanupService.startCleanup(fastify);',
      '// cookieCleanupService.startCleanup(fastify); // Temporarily disabled'
    );
    fs.writeFileSync(indexPath, content);
    console.log('   ✅ Temporarily disabled cleanup service');
  }
}

// 3. Simplify auth routes to use basic cookie setting
console.log('');
console.log('3️⃣ Simplifying auth routes cookie handling...');

const authRoutesPath = path.join(process.cwd(), 'app/panel/src/routes/auth-routes.ts');
if (fs.existsSync(authRoutesPath)) {
  let content = fs.readFileSync(authRoutesPath, 'utf8');
  
  // Replace the complex cookie handling with simple version
  const complexCookieHandling = /\/\/ Detect and resolve any session conflicts[\\s\\S]*?CookieManager\\.setSessionCookie\\(reply, session\\.id, \\{[\\s\\S]*?\\}\\);/;
  
  const simpleCookieHandling = \`// Clear any existing session cookies to prevent conflicts
      reply.clearCookie('session', { path: '/' });
      reply.clearCookie('session', { path: '/auth' });
      reply.clearCookie('session'); // Default path

      // Set session cookie with proper path
      reply.setCookie('session', session.id, {
        path: '/',          // Make cookie available to all routes
        httpOnly: true,
        secure: shouldUseSecureCookies(),
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 // 8 hours
      });\`;
  
  content = content.replace(complexCookieHandling, simpleCookieHandling);
  
  fs.writeFileSync(authRoutesPath, content);
  console.log('   ✅ Simplified auth routes cookie handling');
}

console.log('');
console.log('✅ Cookie Manager Timing Fix Applied!');
console.log('');
console.log('🔄 Changes made:');
console.log('   • Simplified cookie clearing (less aggressive)');
console.log('   • Disabled cleanup service temporarily');
console.log('   • Reverted to basic cookie setting in auth routes');
console.log('');
console.log('🎯 This should restore login functionality while keeping the path fix.');
console.log('');
console.log('Next steps:');
console.log('   1. Restart the panel service');
console.log('   2. Test login - should work now');
console.log('   3. If working, we can gradually re-enable features');