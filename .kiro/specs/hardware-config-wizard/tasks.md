# Implementation Plan

- [ ] 1. Backend API Foundation
  - Create new API endpoints for hardware detection, address configuration, and testing
  - Extend existing hardware-config-routes.ts with wizard-specific endpoints
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] 1.1 Create Hardware Detection API Endpoints
  - Add GET /api/hardware-config/scan-ports endpoint for serial port discovery
  - Add GET /api/hardware-config/scan-devices endpoint for Modbus device scanning
  - Add GET /api/hardware-config/detect-new-cards endpoint for new device detection
  - Implement proper error handling and timeout management for scanning operations
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 1.2 Create Slave Address Management API Endpoints
  - Add POST /api/hardware-config/set-slave-address endpoint for address configuration
  - Add GET /api/hardware-config/read-slave-address endpoint for address verification
  - Add GET /api/hardware-config/find-next-address endpoint for automatic address assignment
  - Implement broadcast command functionality for initial device configuration
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 1.3 Create Hardware Testing API Endpoints
  - Add POST /api/hardware-config/test-card endpoint for comprehensive card testing
  - Add POST /api/hardware-config/test-relay endpoint for individual relay testing
  - Add POST /api/hardware-config/validate-setup endpoint for system validation
  - Implement real-time progress reporting through WebSocket connections
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 1.4 Create Wizard Session Management API Endpoints
  - Add POST /api/hardware-config/wizard/create-session endpoint for wizard initialization
  - Add GET /api/hardware-config/wizard/session/:id endpoint for session retrieval
  - Add PUT /api/hardware-config/wizard/session/:id endpoint for session updates
  - Add POST /api/hardware-config/wizard/finalize endpoint for wizard completion
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [ ] 2. Hardware Detection Service Implementation
  - Create service class for automatic hardware discovery and device identification
  - Extend existing ModbusController with scanning capabilities
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] 2.1 Implement Serial Port Scanning Service
  - Create HardwareDetectionService class in shared/services/hardware-detection-service.ts
  - Implement scanSerialPorts() method to discover available USB-RS485 adapters
  - Add validateSerialPort() method to verify port accessibility and permissions
  - Include manufacturer and device identification for better user guidance
  - _Requirements: 1.1, 1.2_

- [ ] 2.2 Implement Modbus Device Discovery
  - Add scanModbusDevices() method to probe addresses 1-255 systematically
  - Implement identifyDeviceType() method to fingerprint Waveshare and other devices
  - Add getDeviceCapabilities() method to read device specifications and features
  - Include timeout handling and retry logic for reliable scanning
  - _Requirements: 1.3, 1.4, 1.5_

- [ ] 2.3 Implement New Device Detection Logic
  - Add detectNewDevices() method to identify cards not in current configuration
  - Implement device comparison logic to distinguish new from existing devices
  - Add monitorForNewDevices() method for real-time device detection
  - Include caching mechanism to avoid repeated scanning of known devices
  - _Requirements: 1.6, 2.1_

- [ ] 3. Slave Address Management Service Implementation
  - Create service for automated slave address configuration using proven dual relay card solution
  - Build directly upon existing configure-relay-slave-addresses.js functionality and DUAL_RELAY_CARD_PROBLEM_SOLUTION.md
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3.1 Implement Address Discovery and Validation
  - Create SlaveAddressService class in shared/services/slave-address-service.ts using proven solution patterns
  - Implement findNextAvailableAddress() method based on successful dual card configuration experience
  - Add validateAddressAvailability() method using the working register 0x4000 read method
  - Add detectAddressConflicts() method to identify duplicate addresses using proven scanning techniques
  - _Requirements: 3.1, 3.4_

- [ ] 3.2 Implement Broadcast Address Configuration
  - Add configureBroadcastAddress() method using proven broadcast address (0x00) commands from dual card solution
  - Implement setSlaveAddress() method using exact CRC16 calculation and command format from working solution
  - Add verifyAddressConfiguration() method using successful register 0x4000 verification approach
  - Include error handling patterns proven in production dual card deployment
  - _Requirements: 3.2, 3.3, 3.6_

- [ ] 3.3 Implement Bulk Address Configuration
  - Add configureSequentialAddresses() method for multiple card setup
  - Implement resolveAddressConflicts() method for automatic conflict resolution
  - Add configuration rollback functionality for failed bulk operations
  - Include progress reporting for multi-card configuration processes
  - _Requirements: 8.2, 8.3_

- [ ] 4. Hardware Testing Service Implementation
  - Create comprehensive testing service for hardware validation and verification
  - Integrate with existing ModbusController testing functionality
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 4.1 Implement Basic Communication Testing
  - Create HardwareTestingService class in shared/services/hardware-testing-service.ts
  - Implement testCommunication() method to verify Modbus connectivity
  - Add measureResponseTime() method for performance benchmarking
  - Include comprehensive error reporting and diagnostic information
  - _Requirements: 4.1, 4.2_

- [ ] 4.2 Implement Relay Activation Testing
  - Add testRelayActivation() method for individual relay verification
  - Implement testAllRelays() method for comprehensive relay testing
  - Add physical click detection guidance and user confirmation prompts
  - Include timing measurements and reliability statistics
  - _Requirements: 4.3, 4.4_

- [ ] 4.3 Implement Comprehensive Test Suites
  - Add runFullHardwareTest() method combining all test types
  - Implement validateSystemIntegration() method for end-to-end verification
  - Add testReliability() method for stress testing and endurance validation
  - Include detailed test reporting and pass/fail analysis
  - _Requirements: 4.5, 4.6_

- [ ] 5. Wizard Orchestration Service Implementation
  - Create service to manage multi-step wizard process and state management
  - Implement session tracking and step validation
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [ ] 5.1 Implement Wizard Session Management
  - Create WizardOrchestrationService class in shared/services/wizard-orchestration-service.ts
  - Implement createWizardSession() method with unique session ID generation
  - Add getWizardSession() and updateWizardSession() methods for state management
  - Include session persistence and recovery mechanisms
  - _Requirements: 2.1, 2.2_

- [ ] 5.2 Implement Step Validation and Execution
  - Add validateStep() method to verify step completion requirements
  - Implement executeStep() method to perform step-specific operations
  - Add canProceedToNextStep() method for navigation control
  - Include error handling and recovery for failed step execution
  - _Requirements: 2.3, 2.4, 2.5_

- [ ] 5.3 Implement Wizard Completion and Rollback
  - Add finalizeWizard() method to complete configuration and integration
  - Implement rollbackWizard() method for error recovery and cancellation
  - Add configuration backup and restore functionality
  - Include comprehensive audit logging for all wizard operations
  - _Requirements: 2.6, 2.7, 7.1, 7.2_

- [ ] 6. Database Schema Extensions
  - Create database tables for wizard session tracking and audit logging
  - Extend existing database with hardware test history and configuration audit
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 6.1 Create Wizard Session Tables
  - Add wizard_sessions table to migrations/019_hardware_wizard_tables.sql
  - Include session_id, current_step, card_data, and timestamp fields
  - Add indexes for efficient session lookup and cleanup
  - Implement session expiration and cleanup procedures
  - _Requirements: 5.1, 5.2_

- [ ] 6.2 Create Hardware Test History Tables
  - Add hardware_test_history table for test result tracking
  - Include device_address, test_type, success, duration, and error fields
  - Add foreign key relationships to wizard sessions
  - Implement data retention policies for test history cleanup
  - _Requirements: 4.5, 4.6_

- [ ] 6.3 Create Configuration Audit Tables
  - Add configuration_audit table for change tracking
  - Include change_type, old_value, new_value, and success fields
  - Add comprehensive logging for all configuration modifications
  - Implement audit trail reporting and analysis capabilities
  - _Requirements: 5.3, 5.4, 5.5, 5.6_

- [ ] 7. Frontend Wizard Components
  - Create React-based wizard interface components for step-by-step hardware setup
  - Build responsive and accessible user interface following design specifications
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [ ] 7.1 Create Main Wizard Container Component
  - Create WizardContainer component in app/panel/src/components/wizard/WizardContainer.tsx
  - Implement step navigation, progress tracking, and state management
  - Add responsive design for desktop, tablet, and mobile devices
  - Include accessibility features with ARIA labels and keyboard navigation
  - _Requirements: 2.1, 9.1, 9.2, 9.3_

- [ ] 7.2 Create Step 1: Pre-Setup Checklist Component
  - Create PreSetupChecklist component with interactive checklist items
  - Add visual indicators for power-off, connection, and safety requirements
  - Implement validation to prevent proceeding without checklist completion
  - Include helpful images and diagrams for connection guidance
  - _Requirements: 2.2, 7.1_

- [ ] 7.3 Create Step 2: Device Detection Component
  - Create DeviceDetection component with real-time scanning progress
  - Add visual representation of detected devices and their properties
  - Implement automatic refresh and manual scan trigger functionality
  - Include troubleshooting guidance for connection issues
  - _Requirements: 2.3, 1.1, 1.2, 1.3_

- [ ] 7.4 Create Step 3: Address Configuration Component
  - Create AddressConfiguration component with automatic and manual options
  - Add visual feedback for address assignment and conflict resolution
  - Implement broadcast configuration with progress indicators
  - Include address validation and verification status display
  - _Requirements: 2.4, 3.1, 3.2, 3.3_

- [ ] 7.5 Create Step 4: Testing and Validation Component
  - Create TestingValidation component with real-time test execution
  - Add visual indicators for communication, relay, and integration tests
  - Implement test result display with pass/fail status and error details
  - Include retry functionality and troubleshooting guidance
  - _Requirements: 2.5, 4.1, 4.2, 4.3, 4.4_

- [ ] 7.6 Create Step 5: System Integration Component
  - Create SystemIntegration component showing configuration updates
  - Add progress indicators for service restarts and system updates
  - Implement success confirmation with new locker range display
  - Include options to add another card or return to dashboard
  - _Requirements: 2.6, 5.1, 5.2, 5.3_

- [ ] 8. Dashboard and Overview Components
  - Create enhanced dashboard showing hardware status and quick actions
  - Replace existing basic hardware configuration interface
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 8.1 Create Hardware Dashboard Component
  - Create HardwareDashboard component replacing existing hardware-config.html
  - Add system status overview with card count, locker count, and health indicators
  - Implement quick action buttons for scanning, adding cards, and testing
  - Include real-time status updates through WebSocket connections
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 8.2 Create Device Status Cards
  - Create DeviceStatusCard components for individual relay card display
  - Add status indicators, address information, and locker range display
  - Implement individual card testing and configuration options
  - Include visual health indicators and last-tested timestamps
  - _Requirements: 6.4, 6.5_

- [ ] 8.3 Create System Health Monitoring
  - Add SystemHealthMonitor component for real-time system status
  - Implement warning and error indicators for hardware issues
  - Add diagnostic information display and troubleshooting links
  - Include performance metrics and system uptime information
  - _Requirements: 6.6, 10.1, 10.2_

- [ ] 9. Error Handling and Troubleshooting
  - Implement comprehensive error handling with user-friendly messages and recovery options
  - Create troubleshooting wizard for common hardware issues
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [ ] 9.1 Create Error Classification System
  - Create ErrorHandler class in shared/services/error-handler.ts
  - Implement error classification by severity and recoverability
  - Add user-friendly error message generation and formatting
  - Include error code mapping and documentation references
  - _Requirements: 7.1, 7.2_

- [ ] 9.2 Implement Recovery Action System
  - Add suggestRecoveryAction() method for automatic error resolution
  - Implement executeRecoveryAction() method for automated fixes
  - Add manual intervention guidance for complex issues
  - Include rollback mechanisms for failed recovery attempts
  - _Requirements: 7.3, 7.4_

- [ ] 9.3 Create Troubleshooting Wizard
  - Create TroubleshootingWizard component for guided problem resolution
  - Add step-by-step diagnostic procedures for common issues
  - Implement automated testing and verification during troubleshooting
  - Include escalation paths for unresolvable issues
  - _Requirements: 7.5, 7.6, 7.7_

- [ ] 10. Advanced Configuration Features
  - Implement power-user features for manual configuration and bulk operations
  - Add configuration templates and import/export functionality
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 10.1 Create Manual Configuration Interface
  - Create ManualConfiguration component for advanced users
  - Add direct register access and custom command execution
  - Implement manual slave address configuration with validation
  - Include expert mode toggle with additional configuration options
  - _Requirements: 8.1, 8.4_

- [ ] 10.2 Implement Bulk Configuration Tools
  - Add BulkConfiguration component for multiple card setup
  - Implement sequential address assignment with customizable ranges
  - Add batch testing and validation for multiple devices
  - Include progress tracking and error handling for bulk operations
  - _Requirements: 8.2, 8.3_

- [ ] 10.3 Create Configuration Templates System
  - Add ConfigurationTemplates component for saving and loading setups
  - Implement template validation and compatibility checking
  - Add template sharing and import/export functionality
  - Include template versioning and migration capabilities
  - _Requirements: 8.5, 8.6_

- [ ] 11. WebSocket Integration for Real-Time Updates
  - Implement WebSocket connections for real-time progress updates and status monitoring
  - Integrate with existing WebSocket service infrastructure
  - _Requirements: 4.1, 4.2, 4.3, 6.4, 10.3, 10.4_

- [ ] 11.1 Extend WebSocket Service for Hardware Events
  - Extend existing WebSocketService in shared/services/websocket-service.ts
  - Add hardware detection, testing, and configuration event types
  - Implement real-time progress broadcasting for wizard operations
  - Include connection management and reconnection logic
  - _Requirements: 4.1, 4.2, 6.4_

- [ ] 11.2 Create Real-Time Progress Components
  - Create ProgressIndicator components with WebSocket integration
  - Add real-time status updates for scanning, testing, and configuration
  - Implement live error reporting and recovery status updates
  - Include connection status indicators and offline handling
  - _Requirements: 4.3, 10.3, 10.4_

- [ ] 12. Testing and Validation Implementation
  - Create comprehensive test suites for all wizard functionality
  - Implement integration tests with real hardware simulation
  - _Requirements: All requirements validation_

- [ ] 12.1 Create Unit Tests for Services
  - Write unit tests for HardwareDetectionService, SlaveAddressService, and HardwareTestingService
  - Add tests for WizardOrchestrationService and error handling functionality
  - Implement mock hardware interfaces for reliable testing
  - Include edge case testing and error condition validation
  - _Requirements: All service layer requirements_

- [ ] 12.2 Create Integration Tests for API Endpoints
  - Write integration tests for all new API endpoints
  - Add tests for wizard session management and state persistence
  - Implement database integration testing with test data
  - Include WebSocket communication testing and real-time updates
  - _Requirements: All API layer requirements_

- [ ] 12.3 Create End-to-End Tests for Wizard Flow
  - Write E2E tests using Playwright for complete wizard workflows
  - Add tests for error scenarios and recovery procedures
  - Implement hardware simulation for automated testing
  - Include accessibility testing and responsive design validation
  - _Requirements: All user interface requirements_

- [ ] 13. Documentation and User Guides
  - Create comprehensive documentation for the hardware configuration wizard
  - Write user guides and troubleshooting documentation
  - _Requirements: User experience and support requirements_

- [ ] 13.1 Create API Documentation
  - Document all new API endpoints with OpenAPI specifications
  - Add code examples and integration guides for developers
  - Include error code reference and troubleshooting information
  - Create developer onboarding guide for wizard extension
  - _Requirements: Developer documentation needs_

- [ ] 13.2 Create User Documentation
  - Write step-by-step user guide for hardware configuration wizard
  - Add troubleshooting guide with common issues and solutions
  - Create video tutorials for complex setup procedures
  - Include FAQ section with frequently asked questions
  - _Requirements: User support and training needs_

- [ ] 14. Performance Optimization and Monitoring
  - Implement performance monitoring and optimization for wizard operations
  - Add caching and resource management for efficient operation
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [ ] 14.1 Implement Caching and Resource Management
  - Add Redis caching for device detection results and session state
  - Implement connection pooling for Modbus communications
  - Add lazy loading for wizard components and large data sets
  - Include memory management and garbage collection optimization
  - _Requirements: 10.1, 10.2, 10.3_

- [ ] 14.2 Create Performance Monitoring
  - Add performance metrics collection for wizard operations
  - Implement response time monitoring and alerting
  - Add resource usage tracking and optimization recommendations
  - Include user experience metrics and improvement suggestions
  - _Requirements: 10.4, 10.5, 10.6_

- [ ] 15. Security Implementation and Audit
  - Implement security measures for hardware configuration operations
  - Add audit logging and access control for sensitive operations
  - _Requirements: Security and compliance requirements_

- [ ] 15.1 Implement Access Control and Authentication
  - Add role-based access control for wizard operations
  - Implement operation-specific permissions and restrictions
  - Add session security and CSRF protection
  - Include audit logging for all configuration changes
  - _Requirements: Security access control_

- [ ] 15.2 Create Security Validation and Monitoring
  - Add input validation and sanitization for all user inputs
  - Implement rate limiting for hardware operations
  - Add security monitoring and anomaly detection
  - Include emergency stop and rollback capabilities
  - _Requirements: Security monitoring and protection_