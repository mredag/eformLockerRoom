# Requirements Document

## Introduction

The Admin Panel UI Improvements feature addresses critical usability issues in the eForm Locker System's staff management interface. Currently, the panel displays incomplete RFID information, incorrect status text, and lacks proper visual indicators for locker ownership states. This feature will enhance the admin panel to provide clear, actionable information with proper Turkish localization and improved user experience.

## Requirements

### Requirement 1: RFID Card Display Enhancement

**User Story:** As facility staff, I want to see the complete RFID card number instead of generic "rfid" text, so that I can identify which specific card owns each locker.

#### Acceptance Criteria

1. WHEN a locker is owned by an RFID card THEN the panel SHALL display the full RFID card number (e.g., "0009652489") instead of generic "rfid" text
2. WHEN staff clicks on the RFID card number THEN the system SHALL make the text selectable for easy copying
3. WHEN the RFID card number is displayed THEN it SHALL be formatted consistently across all panel views
4. WHEN a locker has no owner THEN the owner field SHALL display "Yok" (None) instead of empty text
5. WHEN the RFID card number is too long for the display area THEN it SHALL be truncated with ellipsis and show full number on hover

### Requirement 2: Locker Status Text Correction

**User Story:** As facility staff, I want to see accurate status descriptions in Turkish, so that I can understand the current state of each locker without confusion.

#### Acceptance Criteria

1. WHEN a locker status is "Owned" in the database THEN the panel SHALL display "Sahipli" instead of "Açılıyor"
2. WHEN a locker status is "Free" in the database THEN the panel SHALL display "Boş"
3. WHEN a locker status is "Reserved" in the database THEN the panel SHALL display "Rezerve"
4. WHEN a locker status is "Opening" in the database THEN the panel SHALL display "Açılıyor"
5. WHEN a locker status is "Blocked" in the database THEN the panel SHALL display "Engelli"
6. WHEN status text is displayed THEN it SHALL be consistent with the existing Turkish UI language

### Requirement 3: Visual Status Indicators

**User Story:** As facility staff, I want lockers to have distinct visual indicators based on their ownership status, so that I can quickly identify locker states at a glance.

#### Acceptance Criteria

1. WHEN a locker is "Free" THEN it SHALL display with green background color (#28a745 or equivalent)
2. WHEN a locker is "Owned" THEN it SHALL display with red background color (#dc3545 or equivalent)
3. WHEN a locker is "Reserved" THEN it SHALL display with orange background color (#fd7e14 or equivalent)
4. WHEN a locker is "Opening" THEN it SHALL display with blue background color (#007bff or equivalent)
5. WHEN a locker is "Blocked" THEN it SHALL display with gray background color (#6c757d or equivalent)
6. WHEN color indicators are applied THEN text SHALL remain readable with appropriate contrast ratios
7. WHEN status changes occur THEN color indicators SHALL update in real-time without page refresh

### Requirement 4: Enhanced Locker Information Display

**User Story:** As facility staff, I want comprehensive locker information displayed clearly, so that I can make informed decisions about locker management.

#### Acceptance Criteria

1. WHEN displaying locker information THEN the panel SHALL show locker number, status, owner information, and last activity timestamp
2. WHEN a locker has an owner THEN the panel SHALL display the owner type (RFID card number, device ID, or VIP contract)
3. WHEN displaying timestamps THEN they SHALL be formatted in Turkish locale (DD.MM.YYYY HH:mm format)
4. WHEN locker information is updated THEN all related displays SHALL refresh automatically
5. WHEN hovering over locker cards THEN additional details SHALL be shown in a tooltip or expanded view

