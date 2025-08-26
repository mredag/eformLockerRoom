# Requirements Document

## Introduction

The Admin Panel Relay Control specification addresses the critical issue where the admin panel's "Open" button only updates the database but never sends Modbus commands to physically open lockers. Currently, staff can see locker status changes in the UI but the physical lockers remain locked, making the admin panel ineffective for actual locker management operations.

## Requirements

### Requirement 1: Enable Physical Locker Opening from Admin Panel

**User Story:** As a facility staff member, I want the "Open" button in the admin panel to physically unlock the locker hardware, so that I can help users access their belongings when needed.

#### Acceptance Criteria

1. WHEN staff clicks "Open" on a single locker THEN the system SHALL send a Modbus command to pulse the relay and physically unlock the locker
2. WHEN the open command is successful THEN the system SHALL update the database to reflect the locker status change
3. WHEN the Modbus command fails THEN the system SHALL return an error message and NOT update the database
4. WHEN staff accesses the admin panel THEN it SHALL use the correct service port (3003) to avoid 500 errors
5. WHEN the physical locker opens THEN the UI SHALL refresh to show the updated locker status
6. WHEN staff provides a reason for opening THEN the system SHALL log the staff username, reason, and timestamp
7. WHEN the relay pulse completes THEN the system SHALL use the configured 400ms pulse duration
8. WHEN multiple lockers are selected THEN each locker SHALL be opened with the configured interval between operations

### Requirement 2: Implement Command Queue Integration

**User Story:** As a system administrator, I want the admin panel to use the existing command queue system, so that locker operations are processed reliably through the established architecture.

#### Acceptance Criteria

1. WHEN staff clicks "Open" THEN the system SHALL enqueue an 'open_locker' command instead of calling releaseLocker() directly
2. WHEN bulk open is requested THEN the system SHALL enqueue a 'bulk_open' command with the selected locker IDs
3. WHEN commands are enqueued THEN they SHALL include staff_user, reason, and force parameters
4. WHEN the kiosk service processes commands THEN it SHALL call modbusController.openLocker() to pulse the relay
5. WHEN the kiosk completes the command THEN it SHALL update the locker status in the database
6. WHEN commands are queued THEN the system SHALL return success immediately to the UI
7. WHEN the heartbeat system delivers commands THEN the kiosk SHALL process them in the correct order
8. WHEN bulk operations are performed THEN the system SHALL respect the configured interval_ms between locker operations

### Requirement 3: Validate Hardware Integration

**User Story:** As a system administrator, I want to verify that the Modbus hardware is properly configured, so that the relay commands will work reliably in production.

#### Acceptance Criteria

1. WHEN validation scripts are run THEN they SHALL confirm RS-485 connectivity to relay cards
2. WHEN DIP switches are checked THEN card 1 SHALL be address 1 and card 2 SHALL be address 2
3. WHEN baud rate is verified THEN DIP switch 9 SHALL be off for 9600 baud
4. WHEN parity is checked THEN DIP switch 10 SHALL be off for no parity
5. WHEN the RS-485 converter is tested THEN it SHALL appear as /dev/ttyUSB0
6. WHEN ModbusController is instantiated THEN it SHALL use use_multiple_coils: true and the correct port/baud settings
7. WHEN openLocker() is called manually THEN it SHALL successfully pulse the specified relay
8. WHEN Modbus timeouts occur THEN the system SHALL log clear error messages for troubleshooting