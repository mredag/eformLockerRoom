# Requirements Document

## Introduction

The Eform Locker System is a comprehensive RFID-based locker management solution designed for multi-room facilities such as gyms, spas, or recreational centers. The system operates without user registration, using RFID cards as the primary access method with optional static QR codes as backup. The system supports VIP locker contracts, staff management panels, and operates offline with minimal maintenance requirements.

## Requirements

### Requirement 1: RFID-Based Locker Access

**User Story:** As a facility user, I want to use my RFID card to select and access lockers without any registration process, so that I can quickly store my belongings.

#### Acceptance Criteria

1. WHEN a user scans their RFID card at the kiosk AND no locker is assigned to the card THEN the system SHALL display a list of available (Free) lockers
2. WHEN a user scans their RFID card AND the card already has an Owned locker THEN the system SHALL NOT display the Free list but directly open the assigned locker
3. WHEN a user selects a locker from the available list THEN the system SHALL assign the locker to the card, change status to Reserved, and initiate opening sequence
4. WHEN the opening sequence completes successfully THEN the system SHALL change locker status to Owned and return to main screen
5. WHEN a user scans their RFID card AND a locker is already assigned to the card THEN the system SHALL open the assigned locker with a single pulse and immediately release ownership (change to Free status) without requiring sensors
6. WHEN a locker is in Reserved status for 90 seconds without successful opening THEN the system SHALL automatically change status back to Free
7. WHEN lockers are in Reserved or Blocked status THEN they SHALL NOT appear in the Free locker list
8. WHEN an "open" command is issued THEN ownership SHALL be released immediately upon command execution, not upon door closure
9. WHEN kiosk displays messages THEN it SHALL show "Dolap X açılıyor" during opening and "Dolap X açıldı ve bırakıldı" after successful release
10. WHEN a card is lost THEN staff SHALL use "override open" function to open the locker and the action SHALL be logged

### Requirement 2: VIP Locker Management

**User Story:** As a facility manager, I want to offer long-term locker contracts to premium customers, so that they can have dedicated locker access for extended periods.

#### Acceptance Criteria

1. WHEN a VIP contract is created through the staff panel THEN the system SHALL assign a specific locker to a specific RFID card for the contract duration (3-12 months)
2. WHEN a VIP cardholder scans their card THEN the system SHALL open their assigned locker without releasing ownership (remains Owned)
3. WHEN a VIP locker is accessed THEN the system SHALL NOT include it in the available locker list for regular users
4. WHEN staff performs bulk opening operations THEN the system SHALL exclude VIP lockers by default with option to include them
5. WHEN a VIP contract expires THEN the system SHALL return the locker to normal operation mode

### Requirement 3: Staff Management Interface

**User Story:** As facility staff, I want a comprehensive management panel to monitor and control all lockers across multiple rooms, so that I can efficiently manage the facility and assist users.

#### Acceptance Criteria

1. WHEN staff accesses the management panel THEN the system SHALL display real-time status of all lockers across all rooms with filtering capabilities
2. WHEN staff selects individual or multiple lockers THEN the system SHALL provide options to open, block, unblock, or override open
3. WHEN staff initiates bulk opening THEN the system SHALL open all Owned and Reserved lockers sequentially with configurable intervals
4. WHEN staff performs end-of-day opening THEN the system SHALL open and release all non-VIP lockers and generate a CSV report
5. WHEN staff manages VIP contracts THEN the system SHALL provide options to create, extend, change cards, or cancel contracts
6. WHEN staff uses "override open" function THEN the system SHALL require a reason field and log the action as an event
7. WHEN lockers are in Blocked status THEN they SHALL NOT appear in the Free locker list
8. WHEN end-of-day CSV report is generated THEN it SHALL include at minimum: kiosk_id, locker_id, timestamp, and result columns

### Requirement 4: Kiosk Master PIN Access

**User Story:** As facility staff, I want to use a master PIN at each kiosk to open any locker for maintenance or user assistance, so that I can resolve issues without accessing the main panel.

#### Acceptance Criteria

1. WHEN staff presses the Master button on kiosk THEN the system SHALL display a grid of all lockers with their current status
2. WHEN staff selects a locker and enters correct master PIN THEN the system SHALL open the locker and change status to Free
3. WHEN staff enters incorrect PIN 5 times THEN the system SHALL lock master access for 5 minutes
4. WHEN master PIN is used successfully THEN the system SHALL log the action with timestamp and locker information
5. WHEN master PIN is configured through staff panel THEN the system SHALL store it securely using Argon2id hashing

### Requirement 5: Optional Static QR Code Access

**User Story:** As a facility user without an RFID card, I want to use QR codes on lockers to access them with my mobile device, so that I can still use the locker system.

#### Acceptance Criteria

1. WHEN a user scans a QR code on a Free locker THEN the system SHALL assign the locker to the device ID and open it
2. WHEN the same device scans the QR code of their assigned locker THEN the system SHALL open the locker and release ownership
3. WHEN a different device scans a QR code of an occupied locker THEN the system SHALL return a "busy" response
4. WHEN a QR code is scanned on a VIP locker THEN the system SHALL return a "VIP locker, QR disabled" response (423 status)
5. WHEN QR access is used THEN the system SHALL apply rate limiting (IP: 30/min, locker: 6/min, device: 1/20sec)
6. WHEN user is not connected to local network THEN QR flow SHALL not work and return "network required" response
7. WHEN browser is in private/incognito mode THEN device_id SHALL not persist and same-device "open and release" flow SHALL not be guaranteed, with warning displayed on page
8. WHEN Origin/Referer headers fail validation THEN requests SHALL be rejected with 403 status
9. WHEN all QR requests to VIP lockers are made THEN system SHALL return 423 status

### Requirement 6: Multi-Room Architecture

**User Story:** As a facility operator, I want to manage multiple rooms with separate kiosks from a central panel, so that I can efficiently oversee the entire facility.

#### Acceptance Criteria

1. WHEN each room kiosk starts up THEN it SHALL register with the central panel and send heartbeat signals every 10 seconds
2. WHEN a kiosk doesn't send heartbeat for 30 seconds THEN the panel SHALL mark it as offline
3. WHEN staff sends commands from the panel THEN the system SHALL queue commands and deliver them when kiosks poll every 2 seconds
4. WHEN a kiosk is offline THEN the system SHALL maintain command queue and execute when connection is restored
5. WHEN viewing the panel THEN staff SHALL be able to filter and view lockers by room/zone
6. WHEN panel displays kiosks THEN it SHALL show zone and kiosk filters with offline kiosks marked with status badges

### Requirement 7: Hardware Integration and Control

**User Story:** As a system operator, I want the software to reliably control locker hardware through Modbus communication, so that lockers open and close correctly.

#### Acceptance Criteria

1. WHEN a locker opening is requested THEN the system SHALL send a 400ms pulse to the appropriate Modbus relay channel
2. WHEN initial opening fails THEN the system SHALL perform burst opening (10 seconds with 2-second intervals)
3. WHEN multiple lockers need opening THEN the system SHALL queue operations with minimum 300ms intervals between commands
4. WHEN Modbus communication fails THEN the system SHALL log errors and retry operations
5. WHEN system restarts THEN it SHALL clear any pending command queues and log restart event
6. WHEN operating relays THEN only one relay SHALL be driven at a time, guaranteed by command queue
7. WHEN RS485 communication is established THEN 120Ω termination SHALL be present at endpoints with failsafe resistors (A: 680Ω pull-up, B: 680Ω pull-down)

### Requirement 8: Security and Access Control

**User Story:** As a facility administrator, I want the system to be secure against unauthorized access and tampering, so that user belongings and system integrity are protected.

#### Acceptance Criteria

1. WHEN admin or master PINs are stored THEN the system SHALL use Argon2id hashing with appropriate salt
2. WHEN QR codes are used THEN the system SHALL implement action tokens with 5-second TTL and HMAC signing
3. WHEN rate limiting is triggered THEN the system SHALL temporarily block excessive requests from IP, card, or locker
4. WHEN staff actions are performed THEN the system SHALL log all operations with timestamps and user identification
5. WHEN the system detects security violations THEN it SHALL log incidents and apply appropriate lockouts
6. WHEN admin and master PINs are used THEN they SHALL be rotated every 90 days
7. WHEN any staff operation is performed THEN it SHALL be logged as an event with full audit trail

### Requirement 9: Offline Operation and Reliability

**User Story:** As a facility operator, I want the system to continue working during network outages and recover gracefully from power failures, so that service is not interrupted.

#### Acceptance Criteria

1. WHEN network connectivity is lost THEN kiosks SHALL continue operating independently for RFID access
2. WHEN power is restored after outage THEN the system SHALL NOT automatically open any lockers
3. WHEN system restarts THEN it SHALL log restart events and clear incomplete command queues
4. WHEN database operations fail THEN the system SHALL use WAL mode and retry mechanisms
5. WHEN storage reaches capacity THEN the system SHALL implement log rotation and cleanup
6. WHEN power is restored THEN no automatic opening SHALL occur and "restarted" event SHALL be logged
7. WHEN incomplete command queue exists after restart THEN it SHALL be cleared and panel SHALL display warning

### Requirement 10: Installation and Maintenance

**User Story:** As a system installer, I want a simple installation process and maintenance tools, so that I can deploy and maintain the system efficiently.

#### Acceptance Criteria

1. WHEN installation script is run THEN it SHALL automatically install dependencies, create users, and configure services
2. WHEN system updates are available THEN the update agent SHALL check every 30 minutes and apply updates safely
3. WHEN health checks are performed THEN the system SHALL provide status endpoints for monitoring
4. WHEN backup is needed THEN the system SHALL perform nightly backups of database and configuration
5. WHEN maintenance is required THEN the system SHALL provide diagnostic tools and log access