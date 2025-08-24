# Implementation Plan

## Phase 1: Core Infrastructure and Session Management

- [x] 1.1 Implement comprehensive Turkish localization system

  - Create tr.json and en.json dictionary files with short keys
  - Default language: Turkish, second language: English
  - Use ICU messages for plural rules and parameterized content
  - Implement Turkish-specific text handling: str.toLocaleUpperCase('tr-TR')
  - Avoid CSS text-transform: uppercase, use proper Turkish casing
  - _Requirements: 2.4, Turkish Language Requirements_
  - **Status: COMPLETED** - I18n service and controllers are implemented with Turkish/English support

- [x] 1.2 Fix authentication and cookie issues

  - Fix cookie flags in production to eliminate redirect loop
  - Set secure: true only on HTTPS, enable trustProxy behind Caddy/Nginx
  - Protect /auth/me with same session check as other protected routes
  - Keep /auth/login and /auth/logout open, do not skip /auth/\* globally
  - Test authentication flow: /auth/login then /auth/me returns 200 in browser and curl
  - _Requirements: 1.1, 1.8, 1.9_
  - **Status: COMPLETED** - Authentication system with Argon2id hashing, session management, and proper cookie handling is implemented

- [ ] 1.3 Complete SQLite session storage migration

  - Create sessions table migration with proper indexes
  - Update SessionManager to use SQLite instead of in-memory storage
  - Implement session persistence across server restarts
  - Add session cleanup job for expired sessions
  - Test session renewal and cleanup functionality
  - _Requirements: 1.4, 1.5, 1.6_
  - **Status: PARTIALLY COMPLETE** - SessionManager exists but uses in-memory storage, needs SQLite migration

- [x] 1.4 Create Turkish panel interface with proper formatting

  - Column names: "Dolap", "Durum", "Kullanıcı", "Süre", "İşlem"
  - Filters: "Aktif", "Boş", "Arızalı"
  - Date format: DD.MM.YYYY and HH:mm (24 hour)
  - Currency: ₺1.250,00 or "1.250 TL" (dot thousands, comma decimal)
  - Phone format: +90 532 000 00 00
  - Turkish calendar with Monday as first day of week
  - _Requirements: 2.3, Turkish Panel Requirements_
  - **Status: COMPLETED** - Turkish panel interface exists with proper formatting

- [x] 1.5 Add feature flags and configuration system
  - Feature flags for realtime, help, VIP, reports (toggle per site)
  - Config table for facility settings: hours, language default, kiosk branding
  - System limits: rate limit /auth/login, command bus quotas, help flood control
  - Store configuration in database with real-time updates
  - _Requirements: Configuration Management, System Limits_
  - **Status: COMPLETED** - Configuration system with config manager is implemented

## Phase 2: React Frontend Platform

- [ ] 2.1 Set up React development environment

  - Initialize React + Vite + TypeScript project in app/panel/frontend/
  - Configure Tailwind CSS with custom theme and responsive breakpoints
  - Install and configure shadcn/ui component library with base components
  - Set up ESLint, Prettier, and TypeScript strict configuration
  - Create Vite build configuration to output to app/panel/public/
  - _Requirements: 2.1, 2.2, 2.5_

- [ ] 2.2 Create core application structure and routing

  - Build main App component with routing for dashboard, lockers, help, VIP, reports, settings, users
  - Create layout components (Header, Sidebar, Footer) with responsive design
  - Implement React Router with protected routes and authentication guards
  - Add loading states, error boundaries, and toast notification system
  - Build theme provider for dark/light mode switching
  - _Requirements: 2.3, 2.8_

- [ ] 2.3 Implement internationalization system

  - Create JSON dictionary files for Turkish and English languages
  - Build useI18n hook for language switching and message interpolation
  - Add language selector component with persistent language preference
  - Implement parameterized messages for dynamic content (locker numbers, timestamps)
  - Test all UI text for proper translation coverage
  - _Requirements: 2.4_

- [ ] 2.4 Build API client and authentication integration
  - Create REST API client with proper error handling and retry logic
  - Implement authentication context and useAuth hook
  - Build login/logout components that integrate with existing auth endpoints
  - Add automatic token refresh and session management
  - Replace legacy HTML files with React components and test all functionality
  - _Requirements: 2.5, 2.6, 2.7_

## Phase 3: Real-time WebSocket Communication

- [ ] 3.1 Implement WebSocket server infrastructure

  - Add @fastify/websocket to gateway service with namespace support
  - Create WebSocketManager class with connection, room, and broadcast management
  - Implement WebSocket namespaces for /ws/lockers, /ws/help, /ws/events
  - Add connection authentication and authorization middleware
  - Build WebSocket connection lifecycle management with cleanup
  - _Requirements: 3.1, 3.2_

- [ ] 3.2 Define and implement event schemas

  - Create TypeScript interfaces for LockerStateChanged, HelpRequested, CommandApplied events
  - Implement event validation and serialization/deserialization
  - Build event broadcasting system with room-based targeting
  - Add event persistence and replay capability for reconnecting clients
  - Write unit tests for all event types and broadcasting logic
  - _Requirements: 3.3_

- [ ] 3.3 Build real-time locker grid updates

  - Modify existing locker state changes to emit WebSocket events
  - Create React WebSocket client with automatic reconnection and backoff
  - Build real-time locker grid component with differential updates
  - Implement optimistic updates with rollback on failure
  - Test locker state changes propagate to panel within 300ms on LAN
  - _Requirements: 3.4, 3.5, 3.6_

- [ ] 3.4 Add WebSocket error handling and resilience
  - Implement automatic reconnection with exponential backoff
  - Add message queuing during disconnection with replay on reconnect
  - Build connection health monitoring and status indicators
  - Create fallback to polling when WebSocket is unavailable
  - Test WebSocket resilience under various network conditions
  - _Requirements: 3.7_

## Phase 4: Help Request Workflow

- [ ] 4.1 Create help requests database schema and service

  - Create migration for help_requests table with proper indexes and constraints
  - Build HelpService class with create, assign, resolve, and photo upload methods
  - Implement help request status transitions and validation
  - Add help request event emission for real-time notifications
  - Write unit tests for all help service operations
  - _Requirements: 4.1, 4.6_

- [ ] 4.2 Build kiosk help request interface

  - Add Help button to kiosk UI with category selection dialog
  - Implement note input and optional photo capture functionality
  - Create help request submission with proper error handling
  - Add visual feedback for successful help request submission
  - Test help request creation from kiosk interface
  - _Requirements: 4.2, 4.3_

- [ ] 4.3 Implement panel help center interface

  - Create Help Center page with real-time help request list
  - Build help request detail modal with assign and resolve actions
  - Implement help request filtering and sorting capabilities
  - Add photo viewing and download functionality
  - Create help request assignment and resolution workflows
  - _Requirements: 4.4_

- [ ] 4.4 Add real-time help notifications and updates
  - Implement WebSocket events for help request status changes
  - Add real-time notifications for new help requests
  - Build help request assignment notifications for staff
  - Create help request resolution confirmations
  - Test complete help workflow from kiosk request to panel resolution with audit logging
  - _Requirements: 4.5, 4.6_

## Phase 5: VIP Contract Management with Payments

- [ ] 5.1 Create enhanced VIP database schema

  - Create migration for contracts table with member info, plan details, and pricing
  - Create migration for payments table with payment method tracking and references
  - Extend existing vip_contracts table with new fields if needed
  - Add proper foreign key constraints and indexes for performance
  - Write repository classes for contract and payment data access
  - _Requirements: 5.1, 5.2_

- [ ] 5.2 Build VIP service layer

  - Implement enhanced VipService class with contract creation, renewal, and cancellation
  - Add payment recording and contract value calculation methods
  - Create contract validation and business rule enforcement
  - Implement contract status management and expiration handling
  - Write comprehensive unit tests for all VIP service operations
  - _Requirements: 5.2, 5.3_

- [ ] 5.3 Create VIP contract wizard interface

  - Build multi-step wizard with Member, Plan, Dates, Price, Confirm, Print steps
  - Implement form validation and step-by-step navigation
  - Add plan selection with feature comparison and pricing calculation
  - Create locker assignment interface with availability checking
  - Build payment confirmation step with method selection
  - _Requirements: 5.4_

- [ ] 5.4 Implement PDF generation and contract completion
  - Add PDF generation using @fastify/multipart and pdfkit or puppeteer
  - Create professional contract PDF template with member and plan details
  - Implement PDF download and print functionality
  - Add contract completion confirmation and success messaging
  - Test complete VIP workflow finishes in under 2 minutes with PDF generation
  - _Requirements: 5.5, 5.6_

## Phase 6: Reporting and Analytics

- [ ] 6.1 Build reporting service infrastructure

  - Create ReportingService class with usage, revenue, and failure report methods
  - Implement metrics calculation for active lockers, daily usage, peak hours
  - Add report data aggregation and filtering capabilities
  - Build report caching system for performance optimization
  - Write unit tests for all reporting calculations and data aggregation
  - _Requirements: 6.1, 6.2_

- [ ] 6.2 Create reporting API endpoints

  - Implement GET /api/reports/usage and GET /api/reports/revenue endpoints
  - Add query parameter support for date ranges and filtering
  - Build report data validation and error handling
  - Add report generation performance monitoring
  - Test report endpoints load under 1 second for 10k rows
  - _Requirements: 6.3, 6.5_

- [ ] 6.3 Build Chart.js visualization components

  - Create chart components for usage trends, revenue analysis, and performance metrics
  - Implement interactive charts with drill-down capabilities
  - Add chart customization options and responsive design
  - Build chart data transformation and formatting utilities
  - Create chart export functionality for images and data
  - _Requirements: 6.4_

- [ ] 6.4 Implement CSV and PDF export functionality
  - Add CSV export with proper formatting and column headers
  - Implement PDF export with charts and formatted tables
  - Create export progress indicators and download management
  - Add export validation to ensure CSV and PDF totals match
  - Test export functionality with large datasets and verify accuracy
  - _Requirements: 6.5, 6.6_

## Phase 7: Enhanced Kiosk UX

- [ ] 7.1 Implement accessibility and usability improvements

  - Add persistent Help button to all kiosk screens
  - Implement text size switch with three size options (small, medium, large)
  - Create high contrast mode toggle for better visibility
  - Add Back and Cancel buttons to every screen with proper navigation
  - Build text size persistence in local storage for offline use
  - _Requirements: 7.1, 7.2, 7.3, 7.6, 7.7_

- [ ] 7.2 Add language switching and localization

  - Create language menu with Turkish and English options
  - Implement language switching with immediate UI updates
  - Add language preference persistence across sessions
  - Update all kiosk messages and UI text for proper localization
  - Test language switching functionality and message completeness
  - _Requirements: 7.4_

- [ ] 7.3 Enhance master PIN security and interface

  - Implement master PIN lockout after 5 failed attempts
  - Add lockout timer display and automatic unlock after timeout
  - Create secure PIN entry interface with masked input
  - Build master PIN management interface in staff panel
  - Test master PIN security and lockout functionality
  - _Requirements: 7.5_

- [ ] 7.4 Validate WCAG AA accessibility compliance
  - Conduct accessibility audit of all kiosk interfaces
  - Fix any accessibility issues found during audit
  - Add proper ARIA labels and keyboard navigation support
  - Test with screen readers and accessibility tools
  - Verify WCAG AA compliance for all user-facing interfaces
  - _Requirements: 7.6_

## Phase 8: Remote Control and Diagnostics (Future Phase)

- [ ] 8.1 Implement command bus system

  - Create command bus in gateway for open, close, reset, buzzer commands
  - Build command validation and authorization system
  - Implement command queuing and execution tracking
  - Add command result reporting and error handling
  - Write unit tests for all command bus operations
  - _Requirements: 8.1, 8.4_

- [ ] 8.2 Build kiosk heartbeat and telemetry system

  - Enhance existing heartbeat to include status, voltage, temp, firmware data
  - Create telemetry data collection and storage
  - Implement heartbeat endpoint POST /api/kiosk/heartbeat with extended data
  - Add telemetry data validation and anomaly detection
  - Build telemetry history tracking and trend analysis
  - _Requirements: 8.2_

- [ ] 8.3 Create remote control interface

  - Build locker detail view with live telemetry display
  - Add remote open door button with confirmation dialog
  - Implement last commands history and status display
  - Create real-time telemetry updates using WebSocket
  - Add remote control authorization and audit logging
  - _Requirements: 8.3_

- [ ] 8.4 Add comprehensive command logging and audit trail
  - Implement detailed logging for all remote commands
  - Create command execution confirmation events
  - Build audit trail with full command history and results
  - Add command failure analysis and reporting
  - Test remote open functionality with complete audit trail verification
  - _Requirements: 8.4, 8.5_
