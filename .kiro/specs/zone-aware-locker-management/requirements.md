# Zone-Aware Locker Management - Requirements Document

## Introduction

This feature extends the existing eForm Locker System to support zone-based organization of lockers. Zones allow logical grouping of lockers (e.g., "mens", "womens", "staff") while maintaining backward compatibility with existing single-zone deployments. 

**Current Status**: Tasks 1-4 are complete with basic zone functionality working. This spec covers the remaining tasks 5-8 to complete the full zone-aware system with API integration, hardware config sync, monitoring, and comprehensive testing.

## Requirements

### Requirement 1: Zone Configuration Management ✅ COMPLETED

**User Story:** As a system administrator, I want to configure zones for logical locker grouping, so that I can organize lockers by purpose or location while maintaining system flexibility.

#### Acceptance Criteria ✅ IMPLEMENTED

1. ✅ WHEN zones are disabled in configuration THEN the system SHALL operate exactly as before with no behavioral changes
2. ✅ WHEN zones are enabled THEN the system SHALL support multiple named zones with defined locker ranges
3. ✅ WHEN a zone configuration is invalid (overlapping ranges, capacity overflow) THEN the system SHALL reject the configuration and maintain the previous valid state
4. ✅ WHEN zones are configured THEN each zone SHALL have an id, enabled status, and locker ranges (start-end positions)
5. ✅ IF zones are enabled AND a zone is disabled THEN lockers in that zone SHALL be excluded from all operations

### Requirement 2: Zone-Aware Hardware Mapping ✅ COMPLETED

**User Story:** As a system operator, I want locker positions to map correctly to hardware addresses within zones, so that physical relay activation matches the logical zone organization.

#### Acceptance Criteria ✅ IMPLEMENTED

1. ✅ WHEN a locker is opened in a zone THEN the system SHALL calculate the correct slave ID and coil address based on zone position
2. ✅ WHEN zone mapping fails or returns null THEN the system SHALL fall back to legacy hardware mapping
3. ✅ WHEN locker 1 is in the first zone THEN it SHALL map to slave 1, coil 1 (1-based coil addressing)
4. ✅ WHEN locker 17 is in the second zone starting at position 17 THEN it SHALL map to slave 2, coil 1
5. ⏳ WHEN hardware mapping is calculated THEN the system SHALL log zone_id, slave_id, and coil_address for traceability

### Requirement 3: Zone-Aware Kiosk API Endpoints (Task 5)

**User Story:** As a client application, I want to query and control lockers by zone, so that I can provide zone-specific interfaces while maintaining backward compatibility.

#### Acceptance Criteria

1. WHEN GET /api/lockers/available is called without zone parameter THEN the system SHALL return all available lockers (existing behavior)
2. WHEN GET /api/lockers/available is called with valid zone parameter THEN the system SHALL return only lockers in that zone
3. WHEN GET /api/lockers/all is called with zone parameter THEN the system SHALL filter results by the specified zone
4. WHEN POST /api/locker/open is called THEN the system SHALL use zone-aware hardware mapping if zones are enabled
5. WHEN an unknown zone is specified THEN the system SHALL return HTTP 400 with clear error message
6. WHEN a locker outside all zones is accessed AND zones are enabled THEN the system SHALL return HTTP 422 with validation error
7. WHEN zone-aware operations occur THEN logs SHALL include zone_id, slave, and coil information

### Requirement 4: Automatic Zone Extension (Task 6)

**User Story:** As a system administrator, I want zones to automatically extend when I add hardware cards, so that new lockers are immediately available without manual reconfiguration.

#### Acceptance Criteria

1. WHEN hardware cards are added in Hardware Config THEN the system SHALL automatically call syncZonesWithHardware if zones are enabled
2. WHEN total locker count increases THEN the last enabled zone SHALL extend its range to include uncovered lockers
3. WHEN zones already cover all lockers THEN no automatic extension SHALL occur
4. WHEN zone extension occurs THEN adjacent ranges SHALL be merged automatically
5. WHEN zone extension fails validation THEN the system SHALL log the error and maintain previous configuration
6. WHEN zone extension succeeds THEN the system SHALL update relay_cards count for affected zones
7. WHEN new lockers are assigned THEN an optional modal SHALL show "New lockers assigned to <zone>"

### Requirement 5: Zone-Aware Health and Heartbeat Integration (Task 7)

**User Story:** As a system operator, I want comprehensive monitoring of zone operations, so that I can troubleshoot issues and verify correct zone behavior.

#### Acceptance Criteria

1. WHEN /health endpoint is called THEN the response SHALL include zones_enabled flag, config_hash, and total_lockers count
2. WHEN heartbeat stats page is accessed THEN the system SHALL show locker counts by status and by zone
3. WHEN a locker operation occurs THEN the system SHALL log zone_id, locker_id, slave_id, and coil_address
4. WHEN zone mapping fails THEN the system SHALL return 4xx error with reason and trace_id
5. WHEN unknown zone or unmapped locker is accessed THEN the system SHALL return appropriate 4xx status with trace_id

### Requirement 6: Backward Compatibility and Migration ✅ COMPLETED

**User Story:** As an existing system user, I want zone functionality to be completely optional, so that my current deployment continues working without any changes.

#### Acceptance Criteria ✅ IMPLEMENTED

1. ✅ WHEN zones_enabled is false THEN all API endpoints SHALL behave exactly as before
2. ✅ WHEN zones_enabled is false THEN hardware mapping SHALL use legacy calculation methods
3. ✅ WHEN migrating from non-zone to zone configuration THEN existing locker assignments SHALL remain valid
4. ✅ WHEN zone configuration is removed THEN the system SHALL gracefully fall back to legacy behavior
5. ✅ WHEN zones are disabled THEN no zone-related validation or processing SHALL occur

### Requirement 7: Comprehensive Testing and Safeguards (Task 8)

**User Story:** As a developer, I want comprehensive tests for zone functionality, so that I can ensure reliability and prevent regressions.

#### Acceptance Criteria

1. WHEN unit tests run THEN zone helper functions SHALL be tested for boundary conditions (positions 1, 16, 17, 32)
2. WHEN validation tests run THEN overlap detection and capacity overflow SHALL be verified
3. WHEN API tests run THEN zone filtering and error handling SHALL be validated (400 on unknown zone, 422 on out-of-zone)
4. WHEN sync tests run THEN hardware card addition and zone extension SHALL be tested
5. WHEN tests complete THEN no existing endpoint behavior SHALL be changed (snapshot testing)
6. WHEN pre-commit runs THEN tsc --noEmit SHALL pass and unused routes SHALL be detected

### Requirement 8: Error Handling and Resilience ✅ COMPLETED

**User Story:** As a system operator, I want robust error handling for zone operations, so that the system remains stable even when zone configuration issues occur.

#### Acceptance Criteria ✅ IMPLEMENTED

1. ✅ WHEN zone configuration validation fails THEN the system SHALL maintain the previous valid configuration
2. ✅ WHEN zone mapping calculation fails THEN the system SHALL fall back to legacy mapping without error
3. ⏳ WHEN hardware sync encounters zone errors THEN the operation SHALL complete for valid portions and log failures
4. ⏳ WHEN zone-related API calls fail THEN the system SHALL return appropriate HTTP status codes with descriptive messages
5. ⏳ WHEN zone operations encounter errors THEN the system SHALL generate trace IDs for debugging and support

### Requirement 9: Remaining Implementation Tasks (Tasks 5-8)

**User Story:** As a developer completing the zone implementation, I want to finish the remaining tasks in the correct order, so that the zone system is fully functional and production-ready.

#### Acceptance Criteria

1. **Task 5 - Zone-Aware Kiosk API**: WHEN zone parameter is added to GET endpoints THEN filtering SHALL work correctly AND POST /api/locker/open SHALL use zone mapping
2. **Task 6 - Hardware Config Sync**: WHEN cards are added in Hardware Config THEN zones SHALL extend automatically AND new lockers SHALL be visible
3. **Task 7 - Health Integration**: WHEN /health is called THEN zone information SHALL be included AND heartbeat stats SHALL show zone counts
4. **Task 8 - Tests and Safeguards**: WHEN all tests run THEN boundary conditions SHALL be verified AND no regressions SHALL occur