# Implementation Plan

- [x] 1. Allow GET requests through CSRF protection

  - Configure @fastify/csrf-protection to skip GET requests by setting getToken: false
  - Update CSRF registration in app/panel/src/index.ts with proper options
  - Ensure GET /api/lockers works without CSRF token while POST requests still require it
  - _Requirements: 1.9_

- [x] 2. Verify server route returns proper response format

  - Ensure existing GET /api/lockers route returns { lockers: [...] } format for kioskId parameter
  - Add structured logging with requestId, kioskId, and locker count in the route handler
  - Verify error responses return consistent JSON format with code and message fields

  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.10_

- [x] 3. Update client-side locker loading with error handling

- [x] 3.1 Update fetch implementation with proper error parsing

  - Update loadLockers function in app/panel/src/views/lockers.html
  - Keep current fetch to /api/lockers with credentials: 'same-origin'
  - Require kioskId in the UI - if missing, show "Select a kiosk" message
  - Implement error parsing: try response.json(), fallback to response.text()
  - Display server error message in the UI banner
  - _Requirements: 1.6, 1.7_

- [x] 3.2 Add simple retry functionality

  - Show single Refresh button on error (no exponential backoff)
  - Display clear error messages from server response
  - Handle three main error cases: 401 session, 403 permission, 500 server error
  - _Requirements: 1.8_

- [x] 4. Fix authentication redirect loops

  - Update root route handler in app/panel/src/index.ts
  - Only redirect to /dashboard when validateSession returns v
    alid session object
  - Redirect to /login.html when session is invalid or missing
  - Set sameSite: "lax" instead of "strict" for better LAN compatibility
  - _Requirements: 2.1, 2.2, 2.4, 2.5_

- [x] 5. Add CSP Report-Only for extension interference detection

  - Update SecurityMiddleware to add CSP with script-src 'self' in report-only mode
  - Add POST /csp-report endpoint to log violations

  - Test with --disable-extensions to verify no line 2 JavaScript errors
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 6. Test the three main fixes


  - Test happy path: logged-in user accessing /lockers loads data successfully
  - Test 401 session error returns "login required" message in UI banner
  - Test 403 permission error shows appropriate message in UI banner
  - Test 500 server error shows "try again" message with Refresh button
  - Verify Network tab shows 200 response for /api/lockers?kioskId=K1
  - Test login produces exactly one redirect to /dashboard (no loops)
  - _Requirements: 1.1, 1.3, 1.4, 1.8, 2.1, 2.4_
