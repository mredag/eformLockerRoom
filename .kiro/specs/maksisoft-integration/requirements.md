# Requirements Document

## Introduction

The Maksisoft Integration feature enables facility staff to quickly search for member information using RFID cards directly from the admin panel's locker management interface. This integration connects the eForm Locker System with the existing Maksisoft member management system, allowing staff to verify member details, check membership status, and access member profiles without leaving the locker management workflow. The feature is designed to speed up staff operations while maintaining security by keeping all Maksisoft credentials and session management on the server side.

## Requirements

### Requirement 1: RFID Member Search Integration

**User Story:** As facility staff, I want to search for member information using RFID card numbers from the locker management interface, so that I can quickly verify member details and resolve locker-related issues.

#### Acceptance Criteria

1. WHEN viewing the lockers page THEN each locker card SHALL display a "Maksisoft" button
2. WHEN a locker has an assigned RFID card THEN clicking the Maksisoft button SHALL automatically search using that card's RFID number
3. WHEN a locker has no assigned RFID card THEN clicking the Maksisoft button SHALL prompt staff to enter an RFID number manually
4. WHEN the RFID search is initiated THEN the button SHALL show "Sorgulanıyor…" (Searching...) status and be disabled during the request
5. WHEN the search completes THEN the button SHALL return to normal state and display results in a modal dialog

### Requirement 2: Member Information Display (MVP)

**User Story:** As facility staff, I want to see essential member information in a simple format, so that I can verify member identity and status quickly.

#### Acceptance Criteria

1. WHEN member search returns results THEN the system SHALL display member information in a modal dialog
2. WHEN displaying member information THEN it SHALL include exactly these 6 fields: ID, RFID number, full name, phone number, membership end date, and last check status
3. WHEN no member is found THEN the modal SHALL display "Kayıt bulunamadı" (No record found)
4. WHEN search errors occur THEN the modal SHALL display one of three Turkish error messages: "Kayıt bulunamadı", "Kimlik doğrulama hatası", or "Çok fazla istek"
5. WHEN member information is displayed THEN it SHALL use simple text formatting with clear labels

### Requirement 3: Maksisoft Profile Access

**User Story:** As facility staff, I want direct access to the member's full profile in Maksisoft, so that I can view additional details or make updates when necessary.

#### Acceptance Criteria

1. WHEN member search results are displayed THEN the modal SHALL include a "Profili Aç" (Open Profile) link
2. WHEN the profile link is clicked THEN it SHALL open the member's Maksisoft profile page in a new browser tab
3. WHEN opening the profile link THEN it SHALL use the searched RFID number to pre-populate the Maksisoft search
4. WHEN the profile link is accessed THEN staff SHALL be able to use their existing Maksisoft session without additional login

### Requirement 4: Server-Side Session Management (MVP)

**User Story:** As a system administrator, I want Maksisoft API calls proxied through the server with basic session handling, so that sensitive credentials are protected and CORS issues are avoided.

#### Acceptance Criteria

1. WHEN the system starts THEN it SHALL use bootstrap cookies from environment variables
2. WHEN making Maksisoft API calls THEN the server SHALL include the session cookie in requests
3. WHEN session authentication fails THEN the server SHALL return appropriate error messages without exposing credentials
4. WHEN API calls are made THEN the system SHALL use a fixed criteria value for RFID lookups (criteria=0)
5. WHEN requests timeout THEN the system SHALL limit total request time to 5 seconds maximum

### Requirement 5: Configuration and Security (MVP)

**User Story:** As a system administrator, I want basic configuration options with secure credential management, so that the integration can be deployed safely.

#### Acceptance Criteria

1. WHEN configuring the integration THEN base URL, search path, criteria value, bootstrap cookie, and feature flag SHALL be stored in environment variables
2. WHEN MAKSI_ENABLED is not "true" THEN the Maksisoft buttons SHALL be hidden from the interface
3. WHEN API requests are made THEN the system SHALL include simple rate limiting per IP and RFID combination (1 request per second)
4. WHEN logging system activity THEN only status codes and hashed RFID numbers SHALL be logged, no personal data
5. WHEN handling errors THEN the system SHALL provide predefined Turkish error messages without technical details

### Requirement 6: Error Handling and User Feedback (MVP)

**User Story:** As facility staff, I want clear feedback when searches fail or encounter errors, so that I can understand what happened and take appropriate action.

#### Acceptance Criteria

1. WHEN network errors occur THEN the modal SHALL display "Bağlantı hatası" (Connection error) message
2. WHEN authentication fails THEN the modal SHALL display "Kimlik doğrulama hatası" (Authentication error) message  
3. WHEN rate limits are exceeded THEN the modal SHALL display "Çok fazla istek" (Too many requests) message
4. WHEN search is in progress THEN the button SHALL show "Sorgulanıyor…" and be disabled with 5 second timeout
5. WHEN any error occurs THEN the Maksisoft button SHALL return to normal state and be re-enabled for retry