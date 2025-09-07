# Requirements Document

## Introduction

This feature extends the current single-kiosk eForm Locker System to support multiple kiosk panels with zone-based hardware assignments. The system currently uses a composite primary key (kiosk_id, locker_id) in the database and maps lockers to hardware using `cardId = Math.ceil(lockerId / 16)` and `relayId = ((lockerId - 1) % 16) + 1`. This enhancement will allow deployment of separate kiosk interfaces for different physical locations (e.g., men's room, women's room) while maintaining centralized administration and hardware control through dedicated Modbus assignments.

**Current System Architecture:**
- Database: Composite key (kiosk_id, id) in lockers table - **NO NEW COLUMNS NEEDED**
- Hardware: Unlimited relay cards (configurable via hardware-config page), each with 16 channels
- Mapping: Automatic calculation from locker ID to card/relay via `Math.ceil(lockerId / 16)`
- Services: Gateway (3000), Panel (3001), Kiosk (3002)
- Configuration: JSON-based with relay_cards array in hardware section (managed via admin panel)
- Zone Info: Already exists in kiosk_heartbeat.zone column

## Requirements

### Requirement 1

**User Story:** As a facility manager, I want to deploy separate kiosk panels for men's and women's restrooms, so that users can access lockers appropriate to their location without confusion.

#### Acceptance Criteria

1. WHEN the system is configured THEN it SHALL support multiple independent kiosk panel instances
2. WHEN a kiosk panel is accessed THEN it SHALL display only lockers assigned to that specific zone
3. WHEN users interact with a zone-specific kiosk THEN they SHALL only see and access lockers within their designated area
4. IF a user scans their RFID card at any kiosk THEN the system SHALL show their assigned locker regardless of zone (if they have one)

### Requirement 2

**User Story:** As a system administrator, I want to assign specific Modbus hardware controllers to different zones, so that each kiosk panel controls only its designated physical lockers.

#### Acceptance Criteria

1. WHEN configuring the system THEN administrators SHALL be able to assign relay cards (slave addresses 1-2) to men's zone and cards (3-4) to women's zone
2. WHEN a locker operation is requested THEN the system SHALL route commands to the correct relay card based on zone assignment and locker range
3. WHEN hardware configuration changes THEN the system SHALL validate that each zone has at least one functional relay card
4. IF a relay card fails THEN the system SHALL continue operating other zones independently
5. WHEN zone assignments are configured THEN the system SHALL override the default `Math.ceil(lockerId / 16)` calculation with zone-specific card mapping

### Requirement 3

**User Story:** As a system administrator, I want to configure zone assignments for lockers, so that each physical locker is associated with the correct kiosk panel and hardware controller.

#### Acceptance Criteria

1. WHEN setting up the system THEN administrators SHALL be able to assign locker ranges to specific zones (e.g., lockers 1-32 to men's, 33-64 to women's)
2. WHEN a locker is assigned to a zone THEN it SHALL automatically use the relay cards designated for that zone
3. WHEN viewing locker status THEN administrators SHALL see zone information for each locker based on its kiosk_id (using existing database structure)
4. IF locker assignments change THEN the system SHALL update the configuration file and provide restart instructions
5. WHEN multiple kiosks exist THEN each SHALL have a unique kiosk_id (e.g., "kiosk-mens", "kiosk-womens") using existing database schema

### Requirement 4

**User Story:** As a user, I want my RFID card to work at any kiosk panel, so that I can retrieve my belongings even if I approach from a different entrance.

#### Acceptance Criteria

1. WHEN a user has an assigned locker THEN their RFID card SHALL work at any kiosk panel to open their specific locker
2. WHEN a user scans their card at the wrong zone's kiosk THEN the system SHALL display a clear message directing them to the correct zone
3. WHEN a user's locker is in a different zone THEN the kiosk SHALL provide clear navigation instructions
4. IF a user scans their card at the correct zone's kiosk THEN the system SHALL immediately open their assigned locker

### Requirement 5

**User Story:** As a system administrator, I want centralized monitoring and control, so that I can manage all zones from a single admin interface.

#### Acceptance Criteria

1. WHEN accessing the admin panel THEN administrators SHALL see status and controls for all zones
2. WHEN viewing locker status THEN the interface SHALL clearly indicate which zone each locker belongs to
3. WHEN performing administrative actions THEN the system SHALL route commands to the appropriate zone's hardware
4. IF there are zone-specific issues THEN the admin panel SHALL display zone-based alerts and diagnostics

### Requirement 6

**User Story:** As a system administrator, I want independent zone operation, so that if one zone has hardware issues, other zones continue to function normally.

#### Acceptance Criteria

1. WHEN one zone experiences hardware failure THEN other zones SHALL continue operating independently
2. WHEN network connectivity is lost to one zone THEN other zones SHALL maintain full functionality
3. WHEN performing maintenance on one zone THEN users SHALL still be able to access lockers in other zones
4. IF a zone goes offline THEN the admin panel SHALL clearly indicate the affected zone and available alternatives

### Requirement 7

**User Story:** As a developer, I want the multi-zone system to be backward compatible, so that existing single-zone deployments continue to work without modification.

#### Acceptance Criteria

1. WHEN the system starts with existing single-zone configuration THEN it SHALL operate exactly as before
2. WHEN no zone configuration is provided THEN the system SHALL default to single-zone behavior
3. WHEN migrating from single-zone to multi-zone THEN existing locker assignments SHALL be preserved
4. IF zone configuration is removed THEN the system SHALL gracefully fall back to single-zone operation

### Requirement 8

**User Story:** As a system administrator, I want to deploy multiple physical devices with different roles, so that I can have a central server with hardware control and separate kiosk-only devices for user interaction.

#### Acceptance Criteria

1. WHEN deploying the system THEN there SHALL be one main server Pi with Gateway (3000), Panel (3001), and Kiosk (3002) services plus hardware connections
2. WHEN deploying kiosk-only devices THEN additional Pi devices SHALL run only browser-based kiosk interfaces that connect to the main server
3. WHEN a kiosk-only device starts THEN it SHALL connect to the main server's kiosk service using URLs like `http://192.168.1.11:3002/?zone=mens` or `http://192.168.1.11:3002/?zone=womens`
4. WHEN the server receives a request with zone parameter THEN it SHALL filter lockers and functionality based on the specified zone
5. IF the main server is unreachable THEN kiosk-only devices SHALL display appropriate offline messages and retry connection

### Requirement 9

**User Story:** As a system administrator, I want zone identification through URL parameters or device configuration, so that the server can distinguish between different kiosk devices and show appropriate content.

#### Acceptance Criteria

1. WHEN a kiosk device connects with a zone parameter THEN the server SHALL remember this device's zone assignment for the session
2. WHEN displaying available lockers THEN the system SHALL show only lockers assigned to the requesting device's zone
3. WHEN an RFID card is scanned THEN the system SHALL check if the user's assigned locker is in the current zone
4. IF a user's locker is in a different zone THEN the system SHALL display directions to the correct zone
5. WHEN configuring kiosk devices THEN administrators SHALL be able to set the zone parameter in the device's browser startup URL

### Requirement 10

**User Story:** As a system administrator, I want to create and manage zones through the admin panel, so that I can easily configure multiple zones and assign hardware resources to them.

#### Acceptance Criteria

1. WHEN accessing the admin panel THEN administrators SHALL see a "Zone Management" section in the main navigation (next to "Dolaplar", "Performans", "VIP Sözleşmeler")
2. WHEN creating a new zone THEN administrators SHALL be able to specify zone name, description, locker ranges, and assigned relay cards
3. WHEN configuring a zone THEN administrators SHALL be able to assign specific relay cards (e.g., cards 1-2 for men's, cards 3-4 for women's)
4. WHEN saving zone configuration THEN the system SHALL validate that locker ranges don't overlap and each relay card is assigned to only one zone
5. IF zone configuration changes THEN the system SHALL update the configuration file and provide instructions for restarting kiosk services
6. WHEN viewing zone management THEN administrators SHALL see a table of existing zones with their locker ranges and assigned hardware

### Requirement 11

**User Story:** As a system administrator, I want to leverage existing database structure for zone management, so that no database migrations are required and the system uses proven architecture.

#### Acceptance Criteria

1. WHEN configuring zones THEN the system SHALL use existing kiosk_id values to represent zones (e.g., "kiosk-mens", "kiosk-womens")
2. WHEN setting up hardware THEN administrators SHALL use the existing hardware-config page to add relay cards and assign them to zones
3. WHEN deploying kiosk panels THEN each panel SHALL use URL parameter to determine which kiosk_id to filter by
4. IF facility requirements change THEN zone configurations SHALL be updatable through existing configuration management system
5. WHEN hardware mapping occurs THEN the system SHALL override default `Math.ceil(lockerId / 16)` calculation with zone-specific card assignments