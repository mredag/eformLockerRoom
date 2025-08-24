# Requirements Document

## Introduction

The System Modernization project aims to upgrade the existing eform locker system to a modern, responsive, and real-time platform while maintaining backward compatibility and zero downtime deployment. The modernization focuses on enhancing the user experience with a React-based frontend, implementing real-time WebSocket communication, strengthening security with HTTPS and session management, and adding comprehensive VIP contract workflows with payment tracking.

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

### Requirement 4: Help Request Workflow

**User Story:** As a facility user, I want to request help when I have issues with lockers, so that staff can assist me quickly and efficiently.

#### Acceptance Criteria

1. WHEN help system is implemented THEN it SHALL use table help_requests(id, kiosk_id, locker_no, category, note, photo_url, status, created_at, resolved_at, agent_id)
2. WHEN user needs help THEN kiosk SHALL provide Help button with category selection and optional photo upload if camera is present
3. WHEN help is requested THEN it SHALL use endpoint POST /api/help
4. WHEN staff views help THEN panel SHALL show Help Center with list view, detail modal, Assign and Resolve actions
5. WHEN help status changes THEN updates SHALL be pushed via WebSocket
6. WHEN help is raised on kiosk THEN it SHALL appear on panel in real time and be resolvable with full audit log

### Requirement 5: VIP Contract Management with Payments

**User Story:** As a facility manager, I want to manage VIP contracts with payment tracking, so that I can offer premium services and track revenue.

#### Acceptance Criteria

1. WHEN VIP system is implemented THEN it SHALL use tables contracts(id, member_name, phone, plan, price, start_at, end_at, status, created_at) and payments(id, contract_id, amount, method, paid_at, ref)
2. WHEN VIP service is created THEN it SHALL implement vip-service.ts with Create, renew, cancel operations
3. WHEN VIP endpoints are available THEN they SHALL include POST /api/vip, GET /api/vip/:id, POST /api/vip/:id/payments
4. WHEN VIP contract is created THEN panel SHALL provide wizard with steps: Member, Plan, Dates, Price, Confirm, Print
5. WHEN VIP contract is completed THEN it SHALL export PDF using @fastify/multipart + pdfkit or puppeteer
6. WHEN VIP workflow is complete THEN it SHALL finish in under 2 minutes and print or save PDF

### Requirement 6: Reporting and Analytics

**User Story:** As a facility manager, I want comprehensive reports and analytics, so that I can make data-driven decisions about facility operations.

#### Acceptance Criteria

1. WHEN reporting is implemented THEN it SHALL use service reporting-service.ts
2. WHEN metrics are calculated THEN they SHALL include active lockers, daily usage, failures, revenue, peak hours
3. WHEN reporting endpoints are available THEN they SHALL include GET /api/reports/usage?from&to, GET /api/reports/revenue?from&to
4. WHEN reports are displayed THEN panel SHALL use Chart.js for visualization with CSV and PDF export options
5. WHEN reports are generated THEN they SHALL load under 1 second for 10k rows
6. WHEN exports are created THEN CSV and PDF SHALL match on totals

### Requirement 7: Enhanced Kiosk User Experience

**User Story:** As a facility user, I want an improved kiosk interface that's accessible and easy to use, so that I can operate lockers efficiently.

#### Acceptance Criteria

1. WHEN kiosk UI is enhanced THEN it SHALL have persistent Help button and text size switch
2. WHEN accessibility is improved THEN it SHALL support high contrast mode
3. WHEN languages are available THEN it SHALL provide language menu for TR and EN
4. WHEN user navigates THEN it SHALL have Back and Cancel buttons on every screen
5. WHEN master PIN is used THEN it SHALL have lockout after 5 failed attempts
6. WHEN accessibility standards are met THEN it SHALL pass WCAG AA basics
7. WHEN text size is changed THEN it SHALL persist offline

### Requirement 8: Remote Control and Diagnostics

**User Story:** As facility staff, I want remote control capabilities and diagnostic information, so that I can manage lockers and troubleshoot issues remotely.

#### Acceptance Criteria

1. WHEN remote control is implemented THEN it SHALL use command bus in gateway for open, close, reset, buzzer commands
2. WHEN kiosk reports status THEN it SHALL use POST /api/kiosk/heartbeat with status, voltage, temp, firmware data
3. WHEN locker details are viewed THEN panel SHALL show live telemetry, last commands, and remote open door button
4. WHEN commands are executed THEN they SHALL be logged to events table
5. WHEN remote open works THEN it SHALL provide confirmation event and maintain full audit trail

### Requirement 9: Progressive Web App and Offline Support

**User Story:** As facility staff, I want the system to work during network outages, so that operations can continue uninterrupted.

#### Acceptance Criteria

1. WHEN PWA is implemented THEN it SHALL include manifest.json and service worker for panel and kiosk
2. WHEN offline caching is active THEN it SHALL cache shell, last state, i18n, and fonts
3. WHEN kiosk is offline THEN it SHALL queue actions and sync on reconnect
4. WHEN network drops occur THEN kiosk SHALL operate core flows during short network interruptions

### Requirement 10: Enhanced Security and Role Management

**User Story:** As a system administrator, I want comprehensive security controls and role-based access, so that the system is protected against unauthorized access.

#### Acceptance Criteria

1. WHEN roles are implemented THEN they SHALL include admin, staff, auditor with defined permissions
2. WHEN authorization is enforced THEN it SHALL use permission matrix in authorization-service.ts with route guards
3. WHEN panel UI is used THEN it SHALL implement CSRF protection on mutating routes
4. WHEN login attempts are made THEN it SHALL rate limit POST /auth/login
5. WHEN passwords are stored THEN it SHALL use Argon2id hashing with rehashing on login if parameters are outdated
6. WHEN security testing is complete THEN ZAP baseline SHALL find no high severity issues

### Requirement 11: Observability and Monitoring

**User Story:** As a system operator, I want comprehensive monitoring and logging, so that I can maintain system health and troubleshoot issues.

#### Acceptance Criteria

1. WHEN logging is implemented THEN it SHALL use structured logs with pino
2. WHEN health monitoring is active THEN it SHALL provide health endpoints per service
3. WHEN metrics are collected THEN they SHALL use Prometheus style counters for requests, errors, WS clients
4. WHEN database maintenance runs THEN it SHALL perform daily SQLite vacuum and backups
5. WHEN monitoring is complete THEN error budget dashboards SHALL show SLI for auth, WS, help systems

### Requirement 12: Zero Downtime Deployment

**User Story:** As a system operator, I want to deploy updates without service interruption, so that facility operations continue uninterrupted.

#### Acceptance Criteria

1. WHEN reverse proxy is configured THEN it SHALL provide TLS on Pi with auto-renew certificates
2. WHEN CI/CD is implemented THEN it SHALL build, test, typecheck, bundle, and run e2e tests
3. WHEN deployment occurs THEN it SHALL use blue-green strategy via two systemd services and symlink switch
4. WHEN migrations run THEN they SHALL use single runner in gateway on boot
5. WHEN updates are applied THEN they SHALL maintain zero downtime during deployment

### Requirement 13: Comprehensive Testing Strategy

**User Story:** As a development team, I want comprehensive automated testing, so that system quality and reliability are maintained.

#### Acceptance Criteria

1. WHEN unit tests run THEN they SHALL cover auth, sessions, VIP rules, help flow
2. WHEN contract tests run THEN they SHALL test panel calls gateway and gateway talks to kiosk stub
3. WHEN WebSocket tests run THEN they SHALL test broadcast fan-out and reconnects
4. WHEN e2e tests run THEN they SHALL use Playwright to test login, open locker, help, VIP create, report export flows
5. WHEN load tests run THEN they SHALL simulate 100 kiosks with WS and maintain locker grid updates under 200ms

### Requirement 14: Performance Optimization

**User Story:** As a facility user and staff member, I want fast system response times, so that operations are efficient and user-friendly.

#### Acceptance Criteria

1. WHEN panel loads THEN first paint SHALL be under 1.5 seconds on Pi LAN
2. WHEN WebSocket broadcasts THEN they SHALL have median latency under 150ms
3. WHEN database queries run THEN p95 SHALL be under 50ms
4. WHEN kiosk starts THEN cold start SHALL be under 3 seconds
5. WHEN system operates THEN it SHALL meet all performance targets consistently