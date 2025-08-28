# Implementation Plan

**NOTE: Tasks have been simplified for small business gym locker system. Removed over-engineered features like:**

- Complex analytics and reporting dashboards
- Advanced filtering and search systems
- Multi-level priority and assignment workflows
- Full WCAG AA compliance (basic accessibility sufficient)
- Enterprise-grade security and audit systems
- Load testing for 100+ kiosks (2-3 kiosks realistic)
- Complex telemetry and monitoring systems

**Focus: Simple, reliable locker operations with minimal complexity.**

- [x] 1. Complete SQLite session storage migration

  - Create sessions table migration with proper indexes
  - Update SessionManager to use SQLite instead of in-memory storage
  - Implement session persistence across server restarts
  - Add session cleanup job for expired sessions
  - Test session renewal and cleanup functionality
  - _Requirements: 1.4, 1.5, 1.6_

- [x] 2. Set up React development environment

  - Initialize React + Vite + TypeScript project in app/panel/frontend/
  - Configure Tailwind CSS with custom theme and responsive breakpoints
  - Install and configure shadcn/ui component library with base components
  - Set up ESLint, Prettier, and TypeScript strict configuration
  - Create Vite build configuration to output to app/panel/public/
  - _Requirements: 2.1, 2.2, 2.5_

- [x] 3. Create core application structure and routing

  - Build main App component with routing for dashboard, lockers, help, VIP, reports, settings, users
  - Create layout components (Header, Sidebar, Footer) with responsive design
  - Implement React Router with protected routes and authentication guards

  - Add loading states, error boundaries, and toast notification system
  - Build theme provider for dark/light mode switching
  - _Requirements: 2.3, 2.8_

- [x] 4. Implement internationalization system

  - Create JSON dictionary files for Turkish and English languages

  - Build useI18n hook for language switching and message interpolation
  - Add language selector component with persistent language preference
  - Implement parameterized messages for dynamic content (locker numbers, timestamps)
  - Test all UI text for proper translation coverage
  - _Requirements: 2.4_

- [x] 5. Build API client and authentication integration

  - Create REST API client with proper error handling and retry logic
  - Implement authentication context and useAuth hook
  - Build login/logout components that integrate with existing auth endpoints
  - Add automatic token refresh and session management
  - Replace legacy HTML files with React components and test all functionality
  - _Requirements: 2.5, 2.6, 2.7_

- [x] 6. Implement WebSocket server infrastructure

  - Add @fastify/websocket to gateway service with namespace support
  - Create WebSocketManager class with connection, room, and broadcast management
  - Implement WebSocket namespaces for /ws/lockers, /ws/help, /ws/events
  - Add connection authentication and authorization middleware
  - Build WebSocket connection lifecycle management with cleanup
  - _Requirements: 3.1, 3.2_

- [x] 7. Define and implement event schemas

  - Create TypeScript interfaces for LockerStateChanged, HelpRequested, CommandApplied events
  - Implement event validation and serialization/deserialization
  - Build event broadcasting system with room-based targeting
  - Add event persistence and replay capability for reconnecting clients
  - Write unit tests for all event types and broadcasting logic
  - _Requirements: 3.3_

- [x] 8. Build real-time locker grid updates

  - Modify existing locker state changes to emit WebSocket events
  - Create React WebSocket client with automatic reconnection and backoff
  - Build real-time locker grid component with differential updates
  - Implement optimistic updates with rollback on failure
  - Test locker state changes propagate to panel within 300ms on LAN
  - _Requirements: 3.4, 3.5, 3.6_

- [x] 9. Add WebSocket error handling and resilience

  - Implement automatic reconnection with exponential backoff
  - Add message queuing during disconnection with replay on reconnect
  - Build connection health monitoring and status indicators
  - Create fallback to polling when WebSocket is unavailable
  - Test WebSocket resilience under various network conditions
  - _Requirements: 3.7_

- [x] 10. Create help requests database schema and service

  - Create migration for help_requests table with proper indexes and constraints
  - Build HelpService class with create, assign, resolve, and photo upload methods
  - Implement help request status transitions and validation
  - Add help request event emission for real-time notifications
  - Write unit tests for all help service operations
  - _Requirements: 4.1, 4.6_

-

- [x] 11. Build kiosk help request interface

  - Add Help button to kiosk UI with category selection dialog
  - Implement note input and optional photo capture functionality
  - Create help request submission with proper error handling
  - Add visual feedback for successful help request submission
  - Test help request creation from kiosk interface
  - _Requirements: 4.2, 4.3_

- [x] 12. Implement panel help center interface

  - Create Help Center page with simple help request list
  - Build basic resolve action for help requests
  - Add simple status filtering (open/resolved)
  - Create basic help request display with essential info only
  - _Requirements: 4.4_

- [x] 12.1. Simplify over-engineered help system components

  - Remove complex help statistics dashboard and replace with simple counters
  - Remove advanced filtering system (keep only basic status filter)
  - Remove 4-level priority system (keep only normal/urgent)
  - Remove assignment workflow and agent tracking
  - Remove detailed help request modal (use inline display)
  - Remove user contact information fields
  - Simplify help categories to just "Lock Problem" and "Other"
  - Update database schema to remove unnecessary fields
  - _Requirements: 4.4_

-

- [x] 13. Add basic help notifications (simplified)

  - Implement simple notification for new help requests
  - Add manual refresh button for help request list
  - Create basic help request counter in panel header
  - Test simple help workflow from kiosk request to panel resolution
  - _Requirements: 4.5, 4.6_

- [x] 14. Create enhanced VIP database schema

  - Create migration for contracts table with member info, plan details, and pricing
  - Create migration for payments table with payment method tracking and references
  - Extend existing vip_contracts table with new fields if needed
  - Add proper foreign key constraints and indexes for performance
  - Write repository classes for contract and payment data access

  - _Requirements: 5.1, 5.2_

-

- [x] 15. Build VIP service layer

  - Implement enhanced VipService class with contract creation, renewal, and cancellation
  - Add payment recording and contract value calculation methods
  - Create contract validation and business rule enforcement
  - Implement contract status management and expiration handling
  - Write comprehensive unit tests for all VIP service operations
  - _Requirements: 5.2, 5.3_

-

- [x] 16. Create VIP contract wizard interface

  - Build multi-step wizard with Member, Plan, Dates, Price, Confirm, Print steps
  - Implement form validation and step-by-step navigation
  - Add plan selection with feature comparison and pricing calculation
  - Create locker assignment interface with availability checking
  - Build payment confirmation step with method selection
  - _Requirements: 5.4_

-

- [x] 17. Implement PDF generation and contract completion

  - Add PDF generation using @fastify/multipart and pdfkit or puppeteer
  - Create professional contract PDF template with member and plan details
  - Implement PDF download and print functionality
  - Add contract completion confirmation and success messaging
  - Test complete VIP workflow finishes in under 2 minutes with PDF generation
  - _Requirements: 5.5, 5.6_

- [x] 18. Build basic reporting (simplified)

  - Create simple daily usage count display
  - Add basic locker status overview (free/owned/blocked counts)
  - Implement simple CSV export of daily events
  - Show basic statistics on dashboard (total opens today, this week)
  - _Requirements: 6.1, 6.2, 6.3, 6.5_

-

- [x] 19. REMOVED: Complex reporting features

  - Advanced analytics, charts, and complex reporting removed as unnecessary for small gym
  - Performance monitoring and caching removed as overkill
  - Interactive charts and drill-down capabilities removed
  - Complex PDF reports removed - simple CSV export sufficient
  - _Requirements: 6.4, 6.6_

-

- [x] 20. Implement basic accessibility improvements (simplified)

  - Add Help button to kiosk screens when lock fails
  - Implement simple text size toggle (normal/large)
  - Add Back button to screens with navigation
  - Ensure basic keyboard navigation works
  - _Requirements: 7.1, 7.2, 7.3, 7.6, 7.7_

- [x] 21. Add language switching and localization

  - Create language menu with Turkish and English options
  - Implement language switching with immediate UI updates
  - Add language preference persistence across sessions
  - Update all kiosk messages and UI text for proper localization
  - Test language switching functionality and message completeness
  - _Requirements: 7.4_

-

- [x] 22. Enhance master PIN security and interface

  - Implement master PIN lockout after 5 failed attempts
  - Add lockout timer display and automatic unlock after timeout
  - Create secure PIN entry interface with masked input
  - Build master PIN management interface in staff panel
  - Test master PIN security and lockout functionality
  - _Requirements: 7.5_

- [x] 23. REMOVED: WCAG AA accessibility compliance

  - Full WCAG AA compliance removed as overkill for small gym kiosk
  - Basic accessibility (keyboard navigation, readable text)
    sufficient
  - Screen reader support and complex ARIA labels unnecessary
    --_Requirements: 7.6_

- [x] 24. Implement command bus system

  - Create command bus in gateway for open, close, reset, buzzer commands
  - Build command validation and authorization system
  - Implement command queuing and execution trackin
    g
  - Add command result reporting and error handling
  - Write unit tests for all command bus operations
  - _Requirements: 8.1, 8.4_

-

- [x] 25. Build kiosk heartbeat and telemetry system (simplified)

  - Enhance existing heartbeat to include basic status and voltage
  - Create simple telemetry data collection
  - Implement heartbeat endpoint POST /api/kiosk/heartbeat with essential data
  - Add basic telemetry validation
  - _Requirements: 8.2_

-
-

- [x] 26. Create remote control interface (simplified)

  - Build locker detail view with basic status display
  - Add remote open door button with confirmation dialog
  - Implement simple command history display

  - Add basic remote control authorization
    --_Requirements: 8.3_

- [x] 27. Add basic command logging

  - Implement basic logging for remote comma

nds

- Create simple command execution tracking

- Add basic audit trail for troubleshooting
- Test remote open functionality
- _Requirements: 8.4, 8.5_

- [x] 28. Implement basic testing suite (simplified)

  - Write unit tests for core auth, sessions, and help flow
  - Create basic integration tests for panel-gateway communication
  - Add simple end-to-end tests for login, open locker, help workflow
  - Test basic functionality with 2-3 kiosks
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
