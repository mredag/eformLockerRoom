# Panel Authentication Issue - Help Request for AI Agents

## 🚨 **CRITICAL AUTHENTICATION PROBLEM**

I have a **Fastify-based Node.js panel application** running on **Raspberry Pi** that's experiencing a **redirect loop authentication issue**. Users get stuck between the login page and dashboard after successful authentication.

## 📋 **System Overview**

- **Framework**: Fastify (Node.js)
- **Database**: SQLite3 with migrations
- **Authentication**: Custom session-based auth with bcrypt/argon2
- **Environment**: Raspberry Pi (ARM64) + Development (Windows)
- **Cookie Management**: @fastify/cookie plugin
- **Session Storage**: In-memory Map-based SessionManager

## 🔍 **Problem Description**

### **Symptoms:**
1. ✅ Login endpoint works (returns 200, sets session cookie)
2. ✅ Session is created and stored in SessionManager
3. ❌ Subsequent requests fail authentication (401 "Not authenticated")
4. ❌ Users get redirect loop: login → dashboard → login → dashboard
5. ❌ Session validation always fails despite valid session cookie

### **Expected Behavior:**
1. User logs in successfully
2. Session cookie is set
3. User is redirected to dashboard
4. Dashboard loads with authenticated session
5. All protected routes work with session cookie

## 🏗️ **Architecture Details**

### **Key Components:**

1. **AuthService** (`app/panel/src/services/auth-service.ts`)
   - Handles user authentication with SQLite
   - Supports both bcrypt and argon2 password hashing
   - Direct SQLite operations (no ORM)

2. **SessionManager** (`app/panel/src/services/session-manager.ts`)
   - In-memory session storage using Map
   - Session validation with IP address checking
   - CSRF token management
   - Session timeout and renewal

3. **Auth Middleware** (`app/panel/src/middleware/auth-middleware.ts`)
   - Protects routes requiring authentication
   - Validates session cookies
   - Handles redirects for browser requests

4. **Auth Routes** (`app/panel/src/routes/auth-routes.ts`)
   - `/auth/login` - User authentication
   - `/auth/me` - Session validation
   - `/auth/logout` - Session destruction

### **Database Schema:**
```sql
-- Users are stored in 'staff_users' table
CREATE TABLE staff_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  pin_expires_at DATETIME
);
```

## 🐛 **Debugging Evidence**

### **Login Success Logs:**
```
Authenticating user with direct SQLite3: admin
Hash prefix for user admin : $argon2id$
Verifying argon2 hash for user: admin
Password verification result for admin : true
🔧 Creating session for user: admin
🔧 Session ID: b5259f7e7a9dd3c9...
🔧 IP Address: 127.0.0.1
✅ Session stored in memory. Total sessions: 1
```

### **Session Validation Failure Logs:**
```
🔍 Auth middleware: Processing request to /auth/me
🔍 Auth middleware: Cookies received: {}
🔍 Auth middleware: Cookie header: undefined
🔍 Auth middleware: Session token: undefined...
❌ Auth middleware: No session token found
```

### **Cookie Configuration:**
```typescript
// Cookie plugin registration
await fastify.register(import("@fastify/cookie"), {
  secret: process.env.COOKIE_SECRET || "eform-panel-secret-key-change-in-production",
  parseOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  },
});

// Cookie setting in auth routes
reply.setCookie('session', session.id, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 8 * 60 * 60 // 8 hours
});
```

## 🔧 **Code Snippets**

### **Auth Middleware Route Skipping:**
```typescript
// Skip authentication for certain routes
if (skipAuth || 
    request.url.startsWith('/auth/') ||  // ⚠️ POTENTIAL ISSUE?
    request.url === '/health' ||
    request.url === '/setup' ||
    request.url === '/login.html' ||
    request.url.startsWith('/static/') ||
    request.url.endsWith('.css') ||
    request.url.endsWith('.js') ||
    request.url.endsWith('.ico')) {
  return;
}
```

### **Session Validation Logic:**
```typescript
validateSession(sessionId: string, ipAddress?: string, userAgent?: string): Session | null {
  const session = this.sessions.get(sessionId);
  if (!session) {
    return null;
  }

  // Check session timeout
  const timeSinceCreation = now.getTime() - session.createdAt.getTime();
  if (timeSinceCreation > this.config.sessionTimeout) {
    this.destroySession(sessionId);
    return null;
  }

  // IP address validation
  if (ipAddress && session.ipAddress !== ipAddress) {
    // Handle IP variations...
  }

  return session;
}
```

## 🎯 **What I Need Help With**

### **Primary Questions:**
1. **Why are session cookies not being received by the auth middleware?**
2. **Is there an issue with the auth middleware route skipping logic?**
3. **Could IP address validation be causing session validation failures?**
4. **Are there Fastify-specific cookie handling issues I'm missing?**

### **Specific Areas to Investigate:**
1. **Cookie Parsing**: Why `request.cookies` is empty despite cookie being set
2. **Route Protection**: Should `/auth/me` be protected or excluded from auth middleware?
3. **IP Validation**: Local network IP variations causing session invalidation
4. **Session Storage**: In-memory vs persistent session storage considerations
5. **Fastify Configuration**: Missing plugins or middleware configuration

## 📁 **File Structure**
```
app/panel/src/
├── services/
│   ├── auth-service.ts          # User authentication
│   └── session-manager.ts       # Session management
├── middleware/
│   └── auth-middleware.ts       # Route protection
├── routes/
│   └── auth-routes.ts          # Authentication endpoints
└── index.ts                    # Main application setup
```

## 🧪 **Testing Scenario**

```bash
# 1. Login (works)
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# Returns: 200 OK with Set-Cookie header

# 2. Session validation (fails)
curl http://localhost:3002/auth/me \
  -H "Cookie: session=<session-token>"
# Returns: 401 "Not authenticated"
```

## 💡 **Suspected Issues**

1. **Auth middleware skipping `/auth/me`** - Should this route be protected?
2. **Cookie parsing configuration** - Missing Fastify cookie plugin setup?
3. **IP address validation too strict** - Local network variations?
4. **Session timing issues** - Race conditions in session storage?
5. **Cross-platform compatibility** - Windows dev vs Raspberry Pi deployment?

## 🎯 **Expected Solution**

Please provide:
1. **Root cause analysis** of why session validation fails
2. **Specific code fixes** for the authentication flow
3. **Configuration changes** needed for Fastify/cookies
4. **Testing approach** to verify the fix works
5. **Best practices** for session management in this architecture

## 📊 **Environment Details**

- **Node.js**: v20+ (Raspberry Pi), v18+ (Development)
- **Fastify**: Latest version with @fastify/cookie
- **SQLite3**: Direct queries, no ORM
- **Deployment**: Raspberry Pi OS (ARM64)
- **Development**: Windows 11

---

**🚨 This is blocking user access to the admin panel. Any help identifying the authentication flow issue would be greatly appreciated!**