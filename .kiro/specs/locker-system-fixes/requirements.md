# Requirements Document

## Introduction

The Locker System Fixes specification addresses critical operational issues needed for the existing eform locker system. This focuses on resolving network errors, authentication loops, and browser extension interference that are currently blocking daily operations. The scope is limited to immediate fixes that can be implemented and tested quickly.

## Requirements

### Requirement 1: Make Available Lockers Load Successfully

**User Story:** As a facility staff member, I want the locker management panel to load the available lockers list without network errors, so that I can effectively manage lockers.

#### Acceptance Criteria

1. WHEN staff accesses GET /api/lockers with valid session THEN the system SHALL return 200 with JSON object containing lockers array
2. WHEN kioskId query parameter is missing THEN the client SHALL show "Select a kiosk" message
3. WHEN no valid session exists THEN the system SHALL return 401 with {"code":"unauthorized","message":"login required"}
4. WHEN kioskId is invalid THEN the system SHALL return 400 with {"code":"bad_request","message":"kioskId required"}
5. WHEN server errors occur THEN the system SHALL return 500 with {"code":"server_error","message":"try again"}
6. WHEN client makes the request THEN it SHALL use fetch with credentials: 'same-origin' and relative URL
7. WHEN non-200 responses occur THEN the client SHALL try response.json(), fallback to response.text(), and display the message
8. WHEN errors occur THEN the client SHALL show single Refresh button (no exponential backoff)
9. WHEN CSRF protection is configured THEN it SHALL NOT apply to GET requests
10. WHEN successful requests are made THEN the system SHALL log one info line with requestId, kioskId, and locker count

### Requirement 2: Stop Authentication Redirect Loops

**User Story:** As a facility staff member, I want to log in once without endless redirects, so that I can access the management panel efficiently.

#### Acceptance Criteria

1. WHEN root route is accessed THEN the system SHALL only redirect to /dashboard when validateSession returns a non-null user object
2. WHEN cookies are configured THEN the system SHALL use path=/, SameSite=Lax, HttpOnly=true settings
3. WHEN login flow is tested on LAN IP (192.168.1.x:3002) THEN the system SHALL show exactly one redirect to /dashboard
4. WHEN cookies are cleared and user re-logs in THEN no redirect loop SHALL occur
5. WHEN session validation fails THEN the system SHALL NOT redirect but show login form instead

### Requirement 3: Identify and Block Extension Interference

**User Story:** As a system administrator, I want to identify browser extension interference that causes JavaScript errors, so that the panel operates reliably on dedicated machines.

#### Acceptance Criteria

1. WHEN the system is tested with --disable-extensions or Guest profile THEN no line 2 JavaScript errors SHALL occur
2. WHEN Content Security Policy Report-Only is implemented THEN it SHALL use script-src 'self' and report violations
3. WHEN CSP reports are generated THEN they SHALL show blocked chrome-extension:// scripts when extensions are active
4. WHEN extension interference is confirmed THEN those extensions SHALL be disabled on panel machines
5. WHEN the system runs without extensions THEN console SHALL be clean of injection-related errors