#!/usr/bin/env node

/**
 * Temporary auth bypass for debugging
 * This creates a modified auth middleware that allows access without authentication
 * WARNING: Only use for debugging, not in production!
 */

const fs = require('fs');
const path = require('path');

console.log('⚠️  TEMPORARY AUTH BYPASS FOR DEBUGGING');
console.log('=====================================\n');

const authMiddlewarePath = path.join(__dirname, '../app/panel/src/middleware/auth-middleware.ts');
const backupPath = authMiddlewarePath + '.backup';

try {
  // Create backup of original file
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(authMiddlewarePath, backupPath);
    console.log('✅ Created backup of auth-middleware.ts');
  }
  
  // Create bypassed version
  const bypassedMiddleware = `import { FastifyRequest, FastifyReply } from 'fastify';
import { SessionManager } from '../services/session-manager';
import { PermissionService, Permission } from '../services/permission-service';
import { User } from '../services/auth-service';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
    session?: {
      id: string;
      csrfToken: string;
    };
  }
}

export interface AuthMiddlewareOptions {
  sessionManager: SessionManager;
  requiredPermission?: Permission;
  skipAuth?: boolean;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const { sessionManager, requiredPermission, skipAuth = false } = options;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // TEMPORARY BYPASS: Skip authentication for debugging
    console.log('🚨 AUTH BYPASS ACTIVE - Request:', request.method, request.url);
    
    // Skip authentication for certain routes
    if (skipAuth || 
        request.url.startsWith('/auth/') || 
        request.url === '/health' ||
        request.url === '/setup' ||
        request.url === '/login.html' ||
        request.url.startsWith('/static/') ||
        request.url.endsWith('.css') ||
        request.url.endsWith('.js') ||
        request.url.endsWith('.ico')) {
      return;
    }

    // BYPASS: Create fake user for all requests
    const fakeUser: User = {
      id: 1,
      username: 'admin',
      role: 'admin',
      created_at: new Date(),
      last_login: new Date()
    };
    
    request.user = fakeUser;
    request.session = {
      id: 'bypass-session',
      csrfToken: 'bypass-csrf-token'
    };
    
    console.log('🚨 BYPASSED AUTH - Fake user assigned:', fakeUser.username);
  };
}

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // BYPASS: Always allow
    console.log('🚨 PERMISSION BYPASS - Allowing:', permission);
  };
}

export function requireCsrfToken() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // BYPASS: Always allow
    console.log('🚨 CSRF BYPASS - Allowing request');
  };
}
`;

  fs.writeFileSync(authMiddlewarePath, bypassedMiddleware);
  console.log('✅ Created bypassed auth middleware');
  
  console.log('\n🔨 Rebuilding panel service...');
  const { execSync } = require('child_process');
  
  try {
    execSync('npm run build:panel', { stdio: 'inherit' });
    console.log('✅ Panel rebuilt with bypassed auth');
  } catch (error) {
    console.log('❌ Build failed:', error.message);
    throw error;
  }
  
  console.log('\n🚨 AUTH BYPASS ACTIVE!');
  console.log('📋 What this does:');
  console.log('- Skips all authentication checks');
  console.log('- Creates fake admin user for all requests');
  console.log('- Allows access to all protected routes');
  console.log('- Logs all bypass activities');
  
  console.log('\n🔄 To restart panel with bypass:');
  console.log('pkill -f "node app/panel/dist/index.js"');
  console.log('npm run start:panel');
  
  console.log('\n🔧 To restore normal auth:');
  console.log('node scripts/restore-auth.js');
  
  console.log('\n⚠️  WARNING: This is for debugging only!');
  console.log('Do not use in production or leave active!');
  
} catch (error) {
  console.error('❌ Failed to create auth bypass:', error.message);
  process.exit(1);
}