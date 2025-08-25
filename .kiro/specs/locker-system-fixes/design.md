# Design Document

## Overview

This design addresses three critical operational issues in the eform locker system that are preventing daily operations:

1. **Network Error Loading Lockers**: The panel fails to load locker data due to CSRF protection blocking GET requests and client-side error handling issues
2. **Authentication Redirect Loops**: Users get stuck in endless redirects after login due to session validation logic and cookie configuration issues  
3. **Browser Extension Interference**: JavaScript errors on line 2 caused by browser extension script injection

The design focuses on minimal, targeted fixes that can be implemented quickly without disrupting the existing architecture.

## Architecture

The system follows a multi-service architecture:
- **Panel Service** (port 3001): Staff management interface with Fastify server
- **Gateway Service** (port 3000): Central coordination service
- **Kiosk Services**: Individual kiosk interfaces
- **SQLite Database**: Shared data storage with WAL mode

### Current Issues Analysis

#### Issue 1: Network Error Loading Lockers
- **Root Cause**: CSRF protection applies to GET requests, blocking legitimate locker data fetches
- **Secondary Issues**: Client uses absolute URLs, poor error handling, session validation too strict for LAN
- **Impact**: Staff cannot view or manage lockers

#### Issue 2: Authentication Redirect Loops  
- **Root Cause**: Root route redirects to dashboard even when session validation fails
- **Secondary Issues**: Inconsistent cookie settings, IP/UA validation too strict
- **Impact**: Staff cannot access the panel after login

#### Issue 3: Extension Interference
- **Root Cause**: Browser extensions inject scripts that cause JavaScript errors
- **Secondary Issues**: No Content Security Policy to block third-party scripts
- **Impact**: Panel functionality breaks unpredictably

## Components and Interfaces

### 1. CSRF Protection Configuration
**Location**: `app/panel/src/index.ts`

**Current State**:
```typescript
await fastify.register(import("@fastify/csrf-protection"));
```

**Required Changes**:
```typescript
await fastify.register(import("@fastify/csrf-protection"), {
  cookieOpts: { signed: true },
  sessionPlugin: false,
  getToken: false // Ignore GET requests
});
```

**Interface**:
- Input: HTTP requests with method type
- Output: CSRF validation result (pass/fail)
- Behavior: Skip CSRF validation for GET requests

### 2. Locker API Endpoint Enhancement
**Location**: `app/panel/src/routes/locker-routes.ts`

**Current Endpoint**: `GET /api/lockers/`

**Request Schema**:
```typescript
{
  query: {
    kioskId: string // Required parameter
  }
}
```

**Response Schema** (Consistent across all endpoints):
```typescript
// Success (200)
{
  lockers: Array<{
    id: number,
    status: "Free" | "Owned" | "Reserved" | "Blocked",
    is_vip: boolean,
    kiosk_id: string
  }>
}

// Error responses (Consistent JSON format)
{
  code: "bad_request" | "unauthorized" | "server_error",
  message: string,
  requestId?: string
}
```

**Locker Status Enum** (Single source of truth):
```typescript
enum LockerStatus {
  FREE = "Free",
  OWNED = "Owned", 
  RESERVED = "Reserved",
  BLOCKED = "Blocked"
}
```

**Error Handling**:
- 400: Invalid kiosk_id with clear message
- 401: No session with "login required" message  
- 500: Server errors with "try again" message

### 3. Client-Side Locker Loading
**Location**: `app/panel/src/views/lockers.html`

**Current Implementation**: Uses `/api/lockers` with complex query building
**Enhanced Implementation**:

```javascript
async function loadLockers() {
  const kioskId = getSelectedKioskId();
  
  if (!kioskId) {
    showError('Select a kiosk');
    return;
  }
  
  try {
    const response = await fetch(
      `/api/lockers?kioskId=${encodeURIComponent(kioskId)}`, 
      { credentials: 'same-origin' }
    );
    
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        message = errorData.message || message;
      } catch {
        // Fallback to text if JSON parsing fails (e.g., HTML error pages)
        try {
          message = await response.text();
        } catch {
          // Keep original HTTP status message
        }
      }
      throw new Error(message);
    }
    
    const data = await response.json();
    renderLockers(data.lockers);
  } catch (error) {
    showError(error.message);
    showRefreshButton();
    console.error('Locker loading failed:', error);
  }
}
```

**Simple Retry Logic**:
```javascript
function showRefreshButton() {
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = 'Refresh';
  refreshBtn.onclick = () => loadLockers();
  document.getElementById('error-message').appendChild(refreshBtn);
}
```

### 4. Session Validation Enhancement
**Location**: `app/panel/src/services/session-manager.ts`

**Current Issue**: Strict IP and User-Agent validation fails on LAN
**Enhanced Logic**:

```typescript
validateSession(token: string, requestIp?: string, userAgent?: string) {
  const session = this.sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    return null;
  }

  // Lenient IP validation for LAN environments
  if (session.ipAddress && requestIp && session.ipAddress !== requestIp) {
    if (this.isIPv4(session.ipAddress) && this.isIPv4(requestIp)) {
      // Allow same /24 subnet for IPv4 LAN
      const sessionSubnet = session.ipAddress.split('.').slice(0, 3).join('.');
      const requestSubnet = requestIp.split('.').slice(0, 3).join('.');
      if (sessionSubnet !== requestSubnet) {
        return null;
      }
    } else if (this.isIPv6(session.ipAddress) && this.isIPv6(requestIp)) {
      // Allow same /64 prefix for IPv6 LAN
      const sessionPrefix = session.ipAddress.split(':').slice(0, 4).join(':');
      const requestPrefix = requestIp.split(':').slice(0, 4).join(':');
      if (sessionPrefix !== requestPrefix) {
        return null;
      }
    } else {
      // Different IP versions or unrecognized format - reject
      return null;
    }
  }

  // Skip strict User-Agent validation on LAN
  // (User-Agent can change due to browser updates)

  return session;
}

private isIPv4(ip: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
}

private isIPv6(ip: string): boolean {
  return ip.includes(':') && !ip.includes('.');
}
```

### 5. Root Route Redirect Logic
**Location**: `app/panel/src/index.ts`

**Current Issue**: Always redirects to dashboard regardless of session validity
**Enhanced Logic**:

```typescript
fastify.get("/", async (request, reply) => {
  try {
    const hasAdmins = await authService.hasAdminUsers();
    if (!hasAdmins) {
      return reply.redirect("/setup");
    }

    const sessionToken = request.cookies.session;
    if (sessionToken) {
      const ipAddress = extractClientIp(request);
      const userAgent = request.headers['user-agent'] || 'unknown';
      const session = sessionManager.validateSession(sessionToken, ipAddress, userAgent);
      
      // Only redirect to dashboard if session is valid
      if (session) {
        return reply.redirect("/dashboard");
      }
    }
    
    // No valid session - show login
    return reply.redirect("/login.html");
  } catch (error) {
    fastify.log.error('Root route error:', error);
    return reply.redirect("/login.html");
  }
});
```

### 6. Cookie Configuration
**Location**: `app/panel/src/index.ts`

**Enhanced Configuration**:
```typescript
// Helper function to determine secure cookie settings
const shouldUseSecureCookies = () => {
  return process.env.NODE_ENV === 'production' && 
         process.env.HTTPS_ENABLED === 'true';
};

await fastify.register(import("@fastify/cookie"), {
  secret: process.env.COOKIE_SECRET || "eform-panel-secret-key-change-in-production",
  parseOptions: {
    httpOnly: true,
    secure: shouldUseSecureCookies(), // Dynamic based on HTTPS availability
    sameSite: "lax", // Changed from "strict" for better LAN compatibility
    path: "/" // Ensure consistent path across all routes
  },
});
```

**Cookie Security Notes**:
- `secure: true` only when served over HTTPS in production
- `sameSite: "lax"` allows cross-site navigation while preventing CSRF
- `path: "/"` ensures cookies work across all panel routes

### 7. Content Security Policy Implementation
**Location**: `app/panel/src/middleware/security-middleware.ts`

**Enhanced CSP Configuration**:
```typescript
const securityMiddleware = new SecurityMiddleware({
  csp: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
    reportUri: "/csp-report" // For monitoring violations
  },
  reportOnly: true // Start with report-only mode
});
```

**CSP Violation Reporting**:
```typescript
fastify.post('/csp-report', async (request, reply) => {
  const report = request.body;
  fastify.log.warn('CSP Violation:', {
    blockedUri: report['blocked-uri'],
    violatedDirective: report['violated-directive'],
    sourceFile: report['source-file'],
    lineNumber: report['line-number']
  });
  reply.code(204).send();
});
```

**CSP Limitations Note**:
- CSP Report-Only mode provides visibility into extension interference
- Will not block all extension injections, but helps identify problematic extensions
- Primary mitigation is disabling extensions on dedicated panel machines

## Data Models

### Enhanced Error Response Model
```typescript
interface ErrorResponse {
  code: 'bad_request' | 'unauthorized' | 'server_error' | 'forbidden';
  message: string;
  requestId?: string;
  details?: any;
}
```

### Locker Response Model
```typescript
interface LockerResponse {
  lockers: Array<{
    id: number;
    status: 'Free' | 'Owned' | 'Reserved' | 'Blocked';
    is_vip: boolean;
    kiosk_id: string;
    owner_type?: string;
    reserved_at?: string;
    owned_at?: string;
  }>;
  total?: number;
}
```

### Session Validation Model
```typescript
interface SessionValidationOptions {
  allowSubnetMatch?: boolean; // For LAN environments
  skipUserAgentCheck?: boolean; // For browser updates
  maxIpChanges?: number; // Allow limited IP changes
}
```

## Error Handling

### Client-Side Error Display
```typescript
function showError(message: string, isRetryable: boolean = false) {
  const errorDiv = document.getElementById('error-message');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  
  if (isRetryable) {
    showRetryButton();
  }
}

function showRetryButton() {
  const retryBtn = document.createElement('button');
  retryBtn.textContent = 'Retry';
  retryBtn.onclick = () => loadLockersWithRetry();
  document.getElementById('error-message').appendChild(retryBtn);
}
```

### Server-Side Error Logging
```typescript
function logRequestError(request: any, error: any, context: string) {
  fastify.log.error({
    requestId: request.id,
    route: request.url,
    method: request.method,
    error: error.message,
    context
  });
}
```

## Testing Strategy

### 1. Network Error Resolution Testing
**Test Kiosk ID**: `K1` (used consistently across all tests)

**Test Cases**:
- Logged-in user accesses `/lockers` → expect locker list loads without errors
- Invalid session accesses API → expect 401 with "login required" message  
- Missing kioskId parameter → expect "Select a kiosk" message in UI
- Invalid kioskId parameter → expect 400 with "kioskId required" message
- Gateway service down → expect single Refresh button appears

**Done Criteria**:
- ✅ Lockers view shows data on first load without "Network error loading lockers"
- ✅ Network tab shows single 200 response for `/api/lockers?kioskId=K1`
- ✅ Console clean of network-related errors on successful load
- ✅ Error messages display server-provided message text, not generic errors

### 2. Authentication Loop Prevention Testing
**Test Cases**:
- Login on `http://192.168.1.x:3002` → expect exactly one redirect to `/dashboard`
- Login on `http://localhost:3001` → expect exactly one redirect to `/dashboard`
- Clear cookies and re-login → expect no redirect loops
- Invalid session on root route → expect redirect to `/login.html`, not `/dashboard`

**Done Criteria**:
- ✅ Network tab shows single 302 redirect chain (no repeated redirects)
- ✅ Root route with invalid session goes to `/login.html`, not `/dashboard`
- ✅ Cookie settings verified: `path=/`, `SameSite=Lax`, `HttpOnly=true`
- ✅ Login flow completes in under 3 seconds without loops

### 3. Extension Interference Testing  
**Test Cases**:
- Run with `--disable-extensions` → expect no line 2 JavaScript errors
- Run with extensions enabled → expect CSP reports show blocked `chrome-extension://` scripts
- Guest profile testing → expect clean console output
- Incognito mode testing → expect clean console output

**Done Criteria**:
- ✅ Console clean when extensions disabled (no line 2 errors)
- ✅ CSP violation reports logged to server when extensions active
- ✅ Panel functionality works completely without extensions
- ✅ CSP reports identify specific problematic extensions for panel machine configuration

### 4. Integration Testing
**Test Cases**:
- Full login → locker loading → management operations flow
- Cross-browser testing (Chrome, Firefox, Edge)
- LAN IP address changes during session
- Multiple concurrent user sessions

**Success Criteria**:
- All three issues resolved without regression
- Existing functionality preserved
- Performance impact minimal (< 50ms additional latency)

## Implementation Priority

### Phase 1: Critical Fixes (Day 1)
1. Fix CSRF configuration to exclude GET requests
2. Enhance `/api/lockers/all` endpoint with proper error responses
3. Update client-side fetch to use relative URLs and proper error handling
4. Fix root route redirect logic

### Phase 2: Session Improvements (Day 2)  
1. Implement lenient session validation for LAN environments
2. Update cookie configuration for better compatibility
3. Add retry logic with exponential backoff

### Phase 3: Security Hardening (Day 3)
1. Implement CSP Report-Only mode
2. Add CSP violation logging
3. Document extension management for panel machines

This design ensures minimal disruption while addressing the core operational issues that are blocking daily use of the locker management system.