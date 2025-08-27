# Requirements Document

## Introduction

This feature enhances the user experience and administrative functionality of the eForm Locker System by implementing comprehensive UI improvements across both the kiosk interface and admin panel. The improvements focus on better visual feedback, session management, and a flexible locker naming system to handle physical installation variations.

## Requirements

### Requirement 1: RFID Session Management with Visual Feedback

**User Story:** As a kiosk user, I want clear feedback when my card is read and a visible countdown for my session, so that I understand the system state and time remaining for selection.

#### Acceptance Criteria

1. WHEN an RFID card is scanned THEN the system SHALL display "Kart okundu" message and show a large countdown badge with 20 seconds default
2. WHEN in session mode THEN the system SHALL show "Seçim için dokunun" instruction clearly
3. WHEN the session timeout period expires THEN the system SHALL show "Oturum zaman aşımı" message and return to idle state
4. WHEN a new RFID is scanned during active session THEN it SHALL cancel current session with clear message and start new session
5. WHEN a user selects a locker before timeout THEN the system SHALL clear the session and proceed with locker assignment
6. WHEN session state changes THEN the system SHALL provide audio feedback (success tone for valid actions, different tone for errors)

### Requirement 2: Enhanced Kiosk Visual Feedback and Accessibility

**User Story:** As a kiosk user, I want to see clear, accessible visual indicators of locker states with proper feedback for all actions, so that I can make informed decisions and understand system responses.

#### Acceptance Criteria

1. WHEN displaying lockers THEN each SHALL show distinct visual states: Boş (green + check icon), Dolu (red + lock icon), Açılıyor (orange + spinner icon), Hata (gray + warning icon), Engelli (purple/blue + shield icon)
2. WHEN displaying the grid THEN it SHALL use large tiles with minimum 56px touch targets for accessibility
3. WHEN showing locker states THEN it SHALL use high contrast colors with color-blind safe palette and be readable at 2m distance
4. WHEN locker operations occur THEN it SHALL show big, screen-level messages: "Dolap açılıyor", "Dolap açıldı", "Açılamadı"
5. WHEN displaying transitions THEN it SHALL use fade and scale animations with 200-300ms duration
6. WHEN locker states change THEN the visual indicators SHALL update in real-time without page reload

### Requirement 3: Always-Visible Locker Status Dashboard with Legend

**User Story:** As a kiosk user, I want to see the current status of all lockers at all times with clear guidance and understand what each color means, so that I can quickly assess availability and understand the system.

#### Acceptance Criteria

1. WHEN the kiosk is in idle state THEN it SHALL display the full locker grid in the background with blur effect
2. WHEN in idle state THEN it SHALL show a front overlay with "Kart okutunuz" text, clean, centered, and high contrast
3. WHEN in idle state THEN it SHALL display an always-on legend showing colors and labels: Boş, Dolu, Açılıyor, Hata, Engelli
4. WHEN locker states change THEN the background grid SHALL update automatically in real-time with current state colors
5. WHEN an RFID card is read THEN the front overlay SHALL fade out and blur SHALL be removed with smooth 200-300ms transition
6. WHEN RFID is read THEN the locker grid SHALL become sharp and interactive for selection
7. WHEN there is inactivity for 20 seconds THEN the system SHALL restore the front overlay and blur effect
8. WHEN running on Raspberry Pi THEN the interface SHALL perform smoothly without stutter at target resolution

### Requirement 4: Admin Panel Locker Card Improvements and Management

**User Story:** As an administrator, I want to see clear visual feedback about locker states with proper management tools and filtering capabilities, so that I can effectively monitor and control the locker system.

#### Acceptance Criteria

1. WHEN viewing locker cards THEN each SHALL show display name prominently and relay number small for reference
2. WHEN displaying locker state THEN it SHALL use state chips with color and text: Boş, Dolu, Açılıyor, Hata, Engelli
3. WHEN showing locker information THEN it SHALL display last change time for tracking
4. WHEN the "Engelle" button is present THEN it SHALL be removed from all locker cards
5. WHEN managing lockers THEN the panel SHALL provide filters for State, Kiosk, and Name search
6. WHEN organizing lockers THEN it SHALL provide sorting options: Name, Relay, State
7. WHEN performing operations THEN it SHALL provide bulk actions: Open, Release, Refresh
8. WHEN operations complete THEN it SHALL show toast notifications: "Komut kuyruğa alındı", "İşlem tamamlandı", "İşlem başarısız"
9. WHEN showing operation results THEN it SHALL provide links to command details by command_id

### Requirement 5: Locker Naming System with Turkish Support

**User Story:** As an administrator, I want to assign custom names to lockers that correspond to their physical locations with proper validation and management tools, so that I can manage lockers based on their actual door numbers rather than relay numbers.

#### Acceptance Criteria

1. WHEN creating locker names THEN the system SHALL allow Turkish letters and numbers with maximum 20 characters
2. WHEN assigning names THEN they SHALL be unique per kiosk and stored in database associated with relay number
3. WHEN providing naming examples THEN the system SHALL suggest presets like "Kapı A1", "Dolap 101"
4. WHEN displaying in kiosk interface THEN it SHALL show only the custom name
5. WHEN displaying in admin panel THEN it SHALL show both custom name and relay number together
6. WHEN no custom name is assigned THEN it SHALL fall back to displaying "Dolap [relay_number]"
7. WHEN locker names are updated THEN all interfaces SHALL reflect changes instantly
8. WHEN name changes occur THEN the system SHALL keep a short audit note for tracking
9. WHEN managing installations THEN it SHALL provide a printable map view for installers
10. WHEN creating locker commands THEN the system SHALL correctly map custom names to corresponding relay numbers

### Requirement 6: Real-time State Synchronization with Connection Monitoring

**User Story:** As a system user, I want all interfaces to show consistent and up-to-date locker information with clear connection status, so that I can trust the displayed status and understand system connectivity.

#### Acceptance Criteria

1. WHEN a locker state changes THEN kiosk grid SHALL update under 2 seconds and panel list SHALL update under 2 seconds
2. WHEN multiple users access different interfaces simultaneously THEN they SHALL see consistent locker states
3. WHEN updates stop arriving THEN interfaces SHALL show "Çevrimdışı" banner to indicate offline status
4. WHEN connection is restored THEN interfaces SHALL show "Yeniden bağlandı" message and sync current state
5. WHEN displaying locker information THEN it SHALL always show "Son güncelleme" timestamp
6. WHEN network connectivity is restored after interruption THEN interfaces SHALL sync with the current system state automatically

### Requirement 7: Comprehensive Error Handling with Turkish Messages

**User Story:** As a system user, I want clear feedback in Turkish when operations fail or when there are system issues with helpful suggestions, so that I understand what's happening and can take appropriate action.

#### Acceptance Criteria

1. WHEN hardware is not connected THEN the system SHALL show "Donanım bağlı değil. Sistem bakımda" message
2. WHEN a locker is busy/occupied THEN it SHALL show "Dolap dolu" message
3. WHEN session times out THEN it SHALL show "Oturum zaman aşımı" message
4. WHEN general errors occur THEN it SHALL show "İşlem yapılamadı" message
5. WHEN operations fail THEN the system SHALL suggest alternatives: "Farklı dolap seçin", "Tekrar deneyin", "Görevliye başvurun"
6. WHEN system errors occur THEN they SHALL be logged with sufficient detail for troubleshooting

### Requirement 8: Performance Metrics and Success Criteria

**User Story:** As a system administrator, I want to monitor system performance and user experience metrics, so that I can ensure the system meets operational requirements.

#### Acceptance Criteria

1. WHEN tracking performance THEN the system SHALL measure time to open, error rate, sessions per hour, most selected lockers, and average idle time
2. WHEN measuring success THEN 95% of locker opens SHALL complete under 2 seconds after selection
3. WHEN monitoring reliability THEN error rate SHALL be under 2%
4. WHEN checking responsiveness THEN UI updates SHALL occur under 2 seconds
5. WHEN evaluating user experience THEN session policy SHALL allow one active session per kiosk with clear messaging for session conflicts