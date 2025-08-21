# Implementation Plan

- [ ] 0. Provisioning and configuration distribution

  - [x] 0.1 Create kiosk provisioning system

    - Build initial registration flow with secret generation and QR/one-time code panel binding
    - Implement clean rollback mechanism for failed provisioning attempts
    - Add kiosk identity validation and secure enrollment process
    - _Requirements: 10.1_

  - [x] 0.2 Implement configuration distribution system

    - Create config push mechanism to kiosks with version and hash control
    - Add atomic configuration apply with rollback capability
    - Build read-only configuration display in panel interface
    - _Requirements: Configuration Management_

- [x] 1. Set up project structure and core interfaces

  - Create directory structure following /opt/eform layout with app/, config/, data/, logs/, migrations/, static/
  - Define TypeScript interfaces for core entities (Locker, VipContract, Event, Command)
  - Set up package.json with Node.js 20 LTS, TypeScript, Fastify, SQLite3, and other dependencies
  - Configure esbuild for compilation and packaging
  - _Requirements: 10.1_

- [x] 2. Implement database layer and migrations

  - [x] 2.1 Create SQLite database schema with WAL mode

    - Write SQL migration files for lockers, vip_contracts, events, command_queue, kiosk_heartbeat tables
    - Implement composite primary key (kiosk_id, id) for lockers table
    - Add all required indexes for performance optimization
    - _Requirements: 1.1, 2.1, 6.1_

  - [x] 2.2 Implement database connection and migration system

    - Create database connection manager with WAL mode enabled
    - Write migration runner that applies schema changes incrementally
    - Implement connection pooling and error handling
    - _Requirements: 9.4, 10.4_

  - [x] 2.3 Create data access layer with optimistic locking

    - Implement repository pattern for all entities
    - Add version-based optimistic locking for locker state changes
    - Write unit tests for all database operations
    - _Requirements: 1.6, 7.4_

- [x] 3. Implement core locker state management

  - [x] 3.1 Create locker state machine and transitions

    - Implement LockerStateManager class with all state transitions (Free→Reserved→Owned→Free)
    - Add 90-second timeout for Reserved status with automatic cleanup
    - Enforce "one card, one locker" rule in state transitions
    - _Requirements: 1.1, 1.2, 1.6_

  - [x] 3.2 Implement locker assignment and release logic

    - Write assignLocker method with ownership validation
    - Implement releaseLocker with immediate ownership removal
    - Add getAvailableLockers filtering out Blocked and Reserved lockers
    - Write comprehensive unit tests for all state transitions
    - _Requirements: 1.3, 1.4, 1.5_

- [x] 4. Build Modbus hardware interface

  - [x] 4.1 Implement Modbus controller with serial execution

    - Create ModbusController class with mutex for single-channel operation
    - Implement 400ms pulse timing and burst opening (10 seconds, 2-second intervals)
    - Add command queuing with 300ms minimum intervals between operations
    - _Requirements: 7.1, 7.2, 7.6_

  - [x] 4.2 Add hardware error handling and retry logic

    - Implement connection error handling with exponential backoff
    - Add burst opening retry mechanism for failed initial attempts
    - Create hardware health monitoring and status reporting
    - Write unit tests with mock Modbus interface
    - _Requirements: 7.3, 7.4_

  - [x] 4.3 Create RS485 diagnostic tools

    - Build bus scanning tool for slave address detection and testing
    - Add A/B line direction control and validation
    - Implement 120Ω termination and failsafe resistor verification
    - Create diagnostic report output for troubleshooting
    - _Requirements: 7.7, 10.5_

- [x] 5. Create RFID card handling system

  - [x] 5.1 Implement RFID reader interface

    - Create RfidHandler class supporting both node-hid and HID keyboard input
    - Implement card scanning event processing with debouncing
    - Add UID hashing and standardization for consistent card identification
    - _Requirements: 1.1, 1.2_

  - [x] 5.2 Build RFID user flow logic

    - Implement handleCardWithNoLocker for new assignments with Free locker list
    - Create handleCardWithLocker for existing assignments with immediate open/release
    - Add checkExistingOwnership to enforce one-card-one-locker rule
    - Write integration tests for complete RFID user journeys
    - _Requirements: 1.1, 1.2, 1.5_

- [x] 6. Develop QR code access system

  - [x] 6.1 Create QR web interface and device ID management

    - Build HTTP endpoints for /lock/{id} GET and /act POST requests
    - Implement device_id cookie generation and validation (128-bit, HttpOnly, SameSite=Strict)
    - Add private/incognito mode detection with appropriate warnings
    - _Requirements: 5.1, 5.6, 5.7_

  - [x] 6.2 Implement QR action tokens and security

    - Create HMAC-signed action tokens with 5-second TTL
    - Add rate limiting (IP: 30/min, locker: 6/min, device: 1/20sec)
    - Implement Origin/Referer validation and VIP locker blocking
    - Write security tests for token validation and rate limiting
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 8.2, 8.3_

- [x] 7. Build kiosk user interface

  - [x] 7.1 Create kiosk web UI with touch interface

    - Build responsive HTML interface optimized for touch screens
    - Implement main screen with "Kart okutunuz" message and RFID scanning
    - Create locker selection grid for available lockers
    - Add status messages and user feedback displays
    - _Requirements: 1.1, 1.9_

  - [x] 7.2 Implement master PIN interface

    - Create master button and PIN entry interface
    - Build locker grid showing all lockers with status indicators
    - Add PIN validation with 5-attempt lockout and 5-minute timeout
    - Implement master PIN operations logging
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [-] 8. Develop staff management panel

  - [x] 8.1 Create staff authentication and session management

    - Implement role-based authentication (admin/staff) with Argon2id hashing
    - Add HttpOnly cookie sessions with CSRF protection
    - Create permission matrix enforcement for all operations
    - _Requirements: 3.1, 8.1, 8.4_

  - [x] 8.2 Build locker management interface

    - Create real-time locker status display with room/zone filtering
    - Implement individual locker operations (open, block, unblock, override)
    - Add bulk operations with sequential execution and progress tracking
    - Build end-of-day opening with CSV report generation
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.8_

  - [x] 8.3 Implement VIP contract management

    - Create VIP contract creation form with locker and card assignment
    - Build contract extension, card change, and cancellation interfaces
    - Add VIP contract listing with expiration warnings (7 days)
    - Implement VIP locker exclusion from regular operations
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.5_

  - [x] 8.4 Create VIP transfer and audit workflow

    - Build room change workflow for VIP contracts with old card cancellation
    - Implement mandatory audit logging for all VIP operations
    - Add VIP contract history tracking and change documentation
    - Create VIP transfer validation and approval process
    - _Requirements: 2.1, 2.2, 8.4_

- [x] 9. Create command queue and multi-room coordination

  - [x] 9.1 Implement command queue system

    - Create CommandQueue class with UUID-based idempotent commands
    - Add retry logic with exponential backoff and failure tracking
    - Implement command status tracking and completion marking
    - _Requirements: 6.3, 6.4_

  - [x] 9.2 Build kiosk heartbeat and coordination

    - Implement kiosk registration and heartbeat system (10-second intervals)
    - Add offline detection (30-second threshold) and status tracking
    - Create command polling mechanism (2-second intervals) for kiosks
    - Build multi-room panel interface with zone filtering
    - _Requirements: 6.1, 6.2, 6.5, 6.6_

- [x] 10. Add security and rate limiting

  - [x] 10.1 Implement comprehensive rate limiting

    - Create token bucket rate limiter for IP, card, locker, and device limits
    - Make all rate limits configurable through system configuration
    - Add rate limit violation logging and temporary blocking
    - _Requirements: 5.5, 8.3_

  - [x] 10.2 Add security headers and validation

    - Implement CSP, Referrer-Policy, X-Frame-Options headers for panel
    - Add input validation and sanitization for all user inputs
    - Create audit logging for all staff operations with full details
    - _Requirements: 8.4, 8.5_

  - [x] 10.3 Implement comprehensive security headers and session management

    - Add CSP, Referrer-Policy, X-Frame-Options, X-Content-Type-Options for panel and kiosk
    - Implement session duration limits and automatic renewal mechanisms
    - Create PIN rotation control and enforcement (90-day policy)
    - Add session security validation and timeout handling
    - _Requirements: 8.1, 8.6_

- [x] 11. Build event logging and monitoring

  - [x] 11.1 Create comprehensive event logging system

    - Implement EventLogger with standardized event types (restarted, rfid_assign, etc.)
    - Add structured JSON details for all events with schema validation
    - Create event querying and filtering capabilities
    - _Requirements: 8.4, 9.3_

  - [x] 11.2 Implement health monitoring and diagnostics

    - Create /health endpoints for all services with detailed status
    - Add system health monitoring (database, RS485, queue status, version)
    - Implement log rotation with 30-day retention policy
    - Build diagnostic tools for troubleshooting
    - _Requirements: 10.3, 10.5_

  - [x] 11.3 Create hardware soak testing automation

    - Build relay and lock bench rig for automated testing
    - Implement automatic 1000-cycle soak testing with cycle counters
    - Add failure threshold detection and automatic Blocked status assignment
    - Create hardware endurance reporting and maintenance scheduling
    - _Requirements: Testing Strategy - Hardware Testing_

  - [x] 11.4 Implement log retention and anonymization

    - Create automatic 30-day log deletion with configurable retention periods
    - Add device_id hashing in logs for privacy protection
    - Implement secure log archival and cleanup procedures
    - Build log anonymization tools for compliance
    - _Requirements: Log Retention Policy_

- [x] 12. Add internationalization and configuration

  - [x] 12.1 Implement i18n system

    - Create message files for Turkish and English languages
    - Build language switching mechanism for kiosk and panel interfaces
    - Add parameterized messages for dynamic content (locker numbers, etc.)
    - _Requirements: 1.9_

  - [x] 12.2 Create configuration management system

    - Implement SystemConfig interface with all configurable parameters
    - Add configuration file loading and validation
    - Create panel interface for viewing and updating system parameters
    - _Requirements: Configuration Management section_

  - [x] 12.3 Build comprehensive i18n test coverage

    - Create automated tests for Turkish and English message file completeness
    - Add parameterized message testing with dynamic content validation
    - Implement language switching tests for all user interfaces
    - Build i18n regression testing for new message additions
    - _Requirements: Internationalization section_

- [x] 13. Build update system and deployment

  - [x] 13.1 Implement update agent with security verification

    - Create UpdateAgent class with SHA256 and minisign signature verification
    - Add automatic update checking (30-minute intervals) and safe application
    - Implement rollback mechanism for failed updates

    - _Requirements: 10.2_

  - [x] 13.2 Create installation and deployment scripts

    - Write installation script with dependency management and service setup
    - Create systemd service files for all components (gateway, kiosk, panel, agent)
    - Add backup and restore functionality for database and configuration
    - _Requirements: 10.1, 10.4_

  - [x] 13.3 Implement canary deployment and rollback scenarios

    - Create canary deployment strategy with kiosk grouping
    - Add mandatory signature verification for all updates
    - Implement automatic rollback threshold detection and execution
    - Build deployment monitoring and health validation during updates
    - _Requirements: 10.2, Update System Security_

- [x] 14. Implement comprehensive testing suite

  - [x] 14.1 Create unit tests for all core components

    - Write unit tests for state management, database operations, and business logic
    - Add mock implementations for hardware interfaces (Modbus, RFID)
    - Create security tests for authentication, authorization, and rate limiting
    - _Requirements: All requirements need testing coverage_

  - [x] 14.2 Build integration and end-to-end tests

    - Create integration tests for multi-service communication and database operations
    - Add end-to-end tests for complete user flows (RFID and QR journeys)
    - Implement soak testing with 1000-cycle open-close hardware endurance tests
    - Build failure scenario tests for power loss, network issues, and hardware failures
    - _Requirements: All requirements need integration testing_

- [-] 15. Final integration and system testing

  - [x] 15.1 Integrate all services and test multi-room operation

    - Connect all services (gateway, kiosk, panel, agent) in test environment
    - Test cross-room operations and command synchronization
    - Validate VIP locker operations and staff management workflows
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 15.2 Perform system validation and performance testing


    - Test system under realistic load with multiple concurrent users
    - Validate all security measures and access controls
    - Verify hardware integration with actual Modbus relays and RFID readers
    - Complete final system acceptance testing against all requirements
    - _Requirements: All requirements final validation_

  - [ ] 15.3 Execute performance and health validation
    - Test panel performance with 500 lockers and 3 kiosks (filtering and status updates under 1 second)
    - Validate power interruption scenarios with restart events and queue cleanup
    - Test end-of-day CSV schema with fixed column set and VIP exclusion defaults
    - Create operational runbook with emergency opening procedures, failure classifications, and spare parts list
    - _Requirements: Performance Optimization, System Events, End-of-Day Operations_
