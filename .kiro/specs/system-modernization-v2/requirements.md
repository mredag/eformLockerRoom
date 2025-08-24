# Requirements Document

## Introduction

The System Modernization project aims to upgrade the existing eform locker system to a modern, simple, and reliable platform suitable for small gym operations. The modernization focuses on essential functionality: a React-based frontend for staff, basic help request system for lock failures, simple VIP contract management, and basic reporting. **This is designed for small business operations (2-3 kiosks, 1-2 staff members) - not enterprise scale.**

## Requirements

### Requirement 1: Secure Authentication and Session Management

**User Story:** As a facility administrator, I want a secure authentication system with proper session management, so that staff access is protected and sessions are managed reliably.

#### Acceptance Criteria

1. WHEN the panel is deployed on Pi THEN it SHALL be served behind HTTPS using Caddy or Nginx with TLS termination
2. WHEN cookies are set THEN they SHALL have secure: true flag ONLY when served over HTTPS
3. WHEN reverse proxy is used THEN trustProxy SHALL be enabled in Fastify configuration
4. WHEN sessions are created THEN they SHALL use HttpOnly cookies with SameSite Strict and Path "/"
5. WHEN session data is stored THEN it SHALL use SQLite table sessions(id, user_id, ua, ip, created_at, expires_at, csrf) instead of in-memory storage
6. WHEN sessions are active THEN they SHALL implement idle timeout with sliding renewal mechanism
7. WHEN authentication events occur THEN they SHALL be logged (login, logout, renew, failed attempts)
8. WHEN /auth/login is successful THEN /auth/me SHALL return 200 status in both browser and curl
9. WHEN authentication is working THEN redirect loops SHALL be eliminated

### Requirement 2: Modern React Frontend Platform

**User Story:** As facility staff, I want a modern, responsive interface that works well on all devices, so that I can efficiently manage lockers from any screen size.

#### Acceptance Criteria

1. WHEN frontend is built THEN it SHALL use React + Vite + TypeScript + Tailwind CSS stack
2. WHEN UI components are needed THEN they SHALL use shadcn/ui for base components
3. WHEN navigation is implemented THEN it SHALL include routes for dashboard, lockers, help, VIP, reports, settings, users
4. WHEN multiple languages are supported THEN it SHALL use simple JSON dictionaries for i18n
5. WHEN frontend is built THEN it SHALL compile to app/panel/public/ and be served with Fastify static
6. WHEN old HTML is replaced THEN all legacy HTML files SHALL be removed
7. WHEN pages are displayed THEN they SHALL be fully responsive across all device sizes
8. WHEN dark mode is available THEN it SHALL work correctly across all components

### Requirement 3: Real-time WebSocket Communication

**User Story:** As facility staff, I want to see locker status changes in real-time, so that I can respond quickly to user needs and system events.

#### Acceptance Criteria

1. WHEN WebSocket is implemented THEN it SHALL use @fastify/websocket in gateway service
2. WHEN WebSocket namespaces are created THEN they SHALL include /ws/lockers, /ws/help, /ws/events
3. WHEN events occur THEN they SHALL use shared event schema: LockerStateChanged, HelpRequested, CommandApplied
4. WHEN kiosk state changes THEN kiosk SHALL post changes to gateway and gateway SHALL broadcast to connected clients
5. WHEN panel subscribes THEN it SHALL render locker grid with differential updates
6. WHEN locker is opened or freed THEN panel SHALL update in under 300ms on LAN
7. WHEN WebSocket connections drop THEN they SHALL reconnect with backoff and message replay

### Requirement 4: Simple Help Request System

**User Story:** As a gym member, I want to request help when a locker won't open, so that staff can assist me quickly.

#### Acceptance Criteria

1. WHEN help system is implemented THEN it SHALL use simple table help_requests(id, kiosk_id, locker_no, category, note, status, created_at, resolved_at)
2. WHEN locker fails to open THEN kiosk SHALL show Help button with simple note field
3. WHEN help is requested THEN it SHALL use endpoint POST /api/help
4. WHEN staff views help THEN panel SHALL show simple list with resolve button
5. WHEN help is resolved THEN staff SHALL click resolve button with optional note
6. WHEN help counter shows pending requests THEN staff can see "Help (3)" in panel header

### Requirement 5: VIP Contract Management with Payments

**User Story:** As a facility manager, I want to manage VIP contracts with payment tracking, so that I can offer premium services and track revenue.

#### Acceptance Criteria

1. WHEN VIP system is implemented THEN it SHALL use tables contracts(id, member_name, phone, plan, price, start_at, end_at, status, created_at) and payments(id, contract_id, amount, method, paid_at, ref)
2. WHEN VIP service is created THEN it SHALL implement vip-service.ts with Create, renew, cancel operations
3. WHEN VIP endpoints are available THEN they SHALL include POST /api/vip, GET /api/vip/:id, POST /api/vip/:id/payments
4. WHEN VIP contract is created THEN panel SHALL provide wizard with steps: Member, Plan, Dates, Price, Confirm, Print
5. WHEN VIP contract is completed THEN it SHALL export PDF using @fastify/multipart + pdfkit or puppeteer
6. WHEN VIP workflow is complete THEN it SHALL finish in under 2 minutes and print or save PDF

### Requirement 6: Basic Reporting

**User Story:** As a gym manager, I want simple daily reports, so that I can track basic usage.

#### Acceptance Criteria

1. WHEN reporting is implemented THEN it SHALL show simple daily counters on dashboard
2. WHEN metrics are displayed THEN they SHALL include total opens today, this week, locker status counts
3. WHEN export is needed THEN it SHALL provide simple CSV export of daily events
4. WHEN reports are viewed THEN they SHALL load quickly for small gym data (under 1000 events/day)
5. WHEN dashboard loads THEN it SHALL show basic statistics without complex charts

### Requirement 7: Basic Kiosk Improvements

**User Story:** As a gym member, I want a simple kiosk interface that works reliably, so that I can use lockers easily.

#### Acceptance Criteria

1. WHEN locker fails THEN kiosk SHALL show Help button
2. WHEN text is hard to read THEN kiosk SHALL have simple text size toggle (normal/large)
3. WHEN languages are needed THEN it SHALL provide TR and EN language menu
4. WHEN user navigates THEN it SHALL have Back button where needed
5. WHEN master PIN is used THEN it SHALL have lockout after 5 failed attempts
6. WHEN interface is used THEN it SHALL be readable and functional for basic gym users

### Requirement 8: Basic Remote Control

**User Story:** As gym staff, I want to open stuck lockers remotely, so that I can help customers without walking to each kiosk.

#### Acceptance Criteria

1. WHEN remote control is needed THEN it SHALL provide open, reset commands via panel
2. WHEN kiosk reports status THEN it SHALL use POST /api/kiosk/heartbeat with basic status and voltage
3. WHEN locker is stuck THEN panel SHALL show remote open button with confirmation
4. WHEN commands are executed THEN they SHALL be logged for basic troubleshooting
5. WHEN remote open works THEN it SHALL provide simple confirmation

### Requirement 9: REMOVED - PWA and Offline Support

**Rationale:** Small gym doesn't need offline operation. Simple refresh button sufficient.

### Requirement 10: Basic Security (Simplified)

**User Story:** As gym staff, I want secure login, so that only authorized staff can access the panel.

#### Acceptance Criteria

1. WHEN login is used THEN it SHALL use simple username/password with session cookies
2. WHEN passwords are stored THEN they SHALL use basic Argon2id hashing
3. WHEN login fails THEN it SHALL have basic rate limiting (5 attempts per minute)
4. WHEN sessions expire THEN staff SHALL login again
5. WHEN panel is accessed THEN it SHALL require valid session

### Requirement 11: REMOVED - Complex Monitoring

**Rationale:** Small gym doesn't need enterprise monitoring. Basic logging sufficient.

### Requirement 12: REMOVED - Zero Downtime Deployment

**Rationale:** Small gym can handle brief maintenance windows. Simple restart sufficient.

### Requirement 13: Basic Testing (Simplified)

**User Story:** As a developer, I want basic tests to ensure core functionality works.

#### Acceptance Criteria

1. WHEN unit tests run THEN they SHALL cover core auth, sessions, and help flow
2. WHEN integration tests run THEN they SHALL test basic panel-gateway communication
3. WHEN manual testing is done THEN it SHALL verify login, open locker, help workflow
4. WHEN system is tested THEN it SHALL work reliably with 2-3 kiosks

### Requirement 14: Basic Performance (Simplified)

**User Story:** As gym staff, I want the system to respond quickly for daily operations.

#### Acceptance Criteria

1. WHEN panel loads THEN it SHALL load reasonably fast on local network
2. WHEN locker commands are sent THEN they SHALL execute within a few seconds
3. WHEN database is used THEN it SHALL handle small gym data volumes efficiently
4. WHEN system runs THEN it SHALL be responsive for 2-3 kiosks and 1-2 staff users
