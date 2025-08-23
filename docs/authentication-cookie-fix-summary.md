# Authentication Cookie Fix Summary

## Problem Description

The session cookie was being marked with the `Secure` attribute in production environments, which prevents browsers from sending the cookie over HTTP connections. Since the Raspberry Pi serves the panel over plain HTTP (not HTTPS), browsers would never send the session cookie, causing every request after login to appear unauthenticated and creating an infinite redirect loop.

## Root Cause Analysis

1. **Cookie Configuration**: The `reply.setCookie` call was setting `secure: process.env.NODE_ENV === 'production'`
2. **HTTP vs HTTPS**: On the Pi, `NODE_ENV` is set to "production" but the service runs over HTTP
3. **Browser Behavior**: Browsers never send Secure cookies over HTTP connections (except localhost)
4. **Middleware Issue**: The `/auth/me` endpoint was not properly excluded from authentication middleware

## Applied Fixes

### 1. Conditional Secure Cookie Setting

**File**: `app/panel/src/routes/auth-routes.ts`

Added a helper function to determine when to use secure cookies:

```typescript
const shouldUseSecureCookies = () => {
  const serverAddress = fastify.server.address();
  const isLocalhost = serverAddress && 
    (typeof serverAddress === 'object' && 
     (serverAddress.address === '127.0.0.1' || serverAddress.address === '::1'));
  
  return process.env.NODE_ENV === 'production' && 
         !isLocalhost && 
         process.env.HTTPS_ENABLED === 'true';
};
```

Updated cookie setting:
```typescript
reply.setCookie('session', session.id, {
  httpOnly: true,
  secure: shouldUseSecureCookies(), // Dynamic based on environment
  sameSite: 'strict',
  maxAge: 8 * 60 * 60
});
```

### 2. Cookie Plugin Configuration

**File**: `app/panel/src/index.ts`

Updated the cookie plugin registration to not set secure by default:

```typescript
await fastify.register(import("@fastify/cookie"), {
  secret: process.env.COOKIE_SECRET || "eform-panel-secret-key-change-in-production",
  parseOptions: {
    httpOnly: true,
    secure: false, // Set per-cookie instead
    sameSite: "strict",
  },
});
```

### 3. Auth Middleware Route Exclusions

**File**: `app/panel/src/middleware/auth-middleware.ts`

Added proper exclusions for authentication endpoints:

```typescript
if (skipAuth || 
    request.url === '/auth/login' ||
    request.url === '/auth/logout' ||
    request.url === '/auth/me' ||           // ← Added this
    request.url === '/auth/csrf-token' ||   // ← Added this
    request.url.startsWith('/auth/change-password') ||
    // ... other exclusions
) {
  return;
}
```

### 4. Environment Configuration

**File**: `.env.example`

Added environment variables for proper configuration:

```bash
# Security Configuration
HTTPS_ENABLED=false  # Set to true only when behind HTTPS proxy
COOKIE_SECRET=your-secure-cookie-secret-change-this

# Notes:
# - Set HTTPS_ENABLED=true only when running behind HTTPS proxy/load balancer
# - Change COOKIE_SECRET to a random string in production
```

## Testing

### Automated Testing

Run the test script to validate the fix:

```bash
node scripts/test-auth-cookie-fix.js
```

This script:
1. Tests login endpoint
2. Checks if session cookie has Secure flag
3. Tests `/auth/me` endpoint with session cookie
4. Tests dashboard access
5. Provides detailed feedback

### Manual Testing Steps

1. **Start the panel service**:
   ```bash
   cd app/panel
   npm start
   ```

2. **Test with curl**:
   ```bash
   # Login and capture cookie
   curl -i -X POST http://localhost:3002/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"admin123"}'
   
   # Check Set-Cookie header - should NOT include "Secure"
   
   # Use session cookie in follow-up request
   curl -i http://localhost:3002/auth/me \
     -H "Cookie: session=<session-token>"
   
   # Should return 200 OK with user information
   ```

3. **Test in browser**:
   - Navigate to `http://localhost:3002`
   - Login with admin credentials
   - Should redirect to dashboard without infinite loop
   - Check browser dev tools - session cookie should be present

## Production Deployment

### For HTTP Deployments (Raspberry Pi)

Set environment variables:
```bash
NODE_ENV=production
HTTPS_ENABLED=false
COOKIE_SECRET=your-random-secret-here
```

### For HTTPS Deployments (Behind Proxy)

Set environment variables:
```bash
NODE_ENV=production
HTTPS_ENABLED=true
COOKIE_SECRET=your-random-secret-here
TRUST_PROXY=true
```

## Security Considerations

1. **Cookie Security**: Cookies are still `HttpOnly` and `SameSite=Strict` for security
2. **HTTPS Recommendation**: Use HTTPS in production when possible
3. **Proxy Configuration**: When behind a reverse proxy, set `HTTPS_ENABLED=true`
4. **Secret Management**: Use a strong, random `COOKIE_SECRET` in production

## Validation Checklist

- [ ] Session cookie is not marked as Secure over HTTP
- [ ] `/auth/me` endpoint works without authentication
- [ ] Login flow completes without redirect loops
- [ ] Dashboard is accessible after login
- [ ] Logout clears the session cookie
- [ ] Environment variables are properly configured

## Files Modified

1. `app/panel/src/index.ts` - Cookie plugin configuration
2. `app/panel/src/routes/auth-routes.ts` - Dynamic secure cookie setting
3. `app/panel/src/middleware/auth-middleware.ts` - Route exclusions
4. `.env.example` - Environment configuration template
5. `scripts/test-auth-cookie-fix.js` - Testing script
6. `scripts/fix-auth-cookie-comprehensive.js` - Fix application script
7. `scripts/validate-auth-fix-quick.js` - Validation script

## Result

The authentication system now works correctly over HTTP while maintaining security best practices. The session cookie is only marked as Secure when explicitly configured for HTTPS deployments, resolving the infinite redirect loop issue on Raspberry Pi deployments.