# Requirements Document

## Introduction

This feature completely overhauls the kiosk UI/UX to create a lightweight, Raspberry Pi-optimized interface that fixes the current card assignment issues and provides a smooth, reliable user experience. The focus is on simplicity, performance, and fixing the broken card-to-locker assignment functionality that occurred after the major system update.

## Requirements

### Requirement 1: Simplified Raspberry Pi-Optimized UI

**User Story:** As a kiosk user on a Raspberry Pi device, I want a fast, responsive interface that works smoothly without lag or stuttering, so that I can quickly and reliably use the locker system.

#### Acceptance Criteria

1. WHEN the kiosk loads THEN it SHALL display a simple, clean interface optimized for touch screens with minimal animations
2. WHEN displaying locker tiles THEN they SHALL be large (minimum 100px), clearly labeled, and respond immediately to touch
3. WHEN showing status information THEN it SHALL use simple, high-contrast colors without complex gradients or effects
4. WHEN running on Raspberry Pi THEN the interface SHALL maintain 30+ FPS performance with minimal CPU usage
5. WHEN displaying the grid THEN it SHALL use a simple layout that fits common screen resolutions (1024x768, 1920x1080)
6. WHEN showing feedback THEN it SHALL use simple text messages instead of complex animations

### Requirement 2: Fixed Card Assignment Functionality

**User Story:** As a kiosk user, I want to scan my RFID card and successfully assign it to a locker without errors, so that I can store my belongings securely.

#### Acceptance Criteria

1. WHEN I scan my RFID card THEN the system SHALL immediately check if I already have a locker assigned
2. WHEN I have an existing locker THEN it SHALL open that locker and release the assignment
3. WHEN I don't have a locker THEN it SHALL show available lockers for selection
4. WHEN I select a locker THEN it SHALL assign the locker to my card and open it successfully
5. WHEN assignment fails THEN it SHALL show a clear error message and allow me to try again
6. WHEN the assignment process completes THEN the system SHALL return to the idle state ready for the next user

### Requirement 3: Streamlined Session Management

**User Story:** As a kiosk user, I want a simple session flow that doesn't timeout too quickly and clearly shows my options, so that I can complete my locker selection without confusion.

#### Acceptance Criteria

1. WHEN I scan my card THEN the system SHALL create a 30-second session (increased from 20 seconds)
2. WHEN in a session THEN it SHALL show a simple countdown timer that's easy to see
3. WHEN I select a locker THEN the session SHALL complete immediately
4. WHEN the session times out THEN it SHALL return to idle with a clear message
5. WHEN a new card is scanned THEN it SHALL cancel any existing session and start fresh
6. WHEN there are session errors THEN it SHALL provide clear recovery instructions

### Requirement 4: Reliable Hardware Communication

**User Story:** As a kiosk user, I want the locker hardware to respond reliably when I make selections, so that I can trust the system to work correctly.

#### Acceptance Criteria

1. WHEN I select a locker THEN the system SHALL use the proven working API endpoints for hardware control
2. WHEN hardware communication fails THEN it SHALL retry the operation automatically
3. WHEN a locker fails to open THEN it SHALL release the assignment and show an error message
4. WHEN hardware is unavailable THEN it SHALL show a maintenance message
5. WHEN operations succeed THEN it SHALL provide immediate positive feedback
6. WHEN there are hardware errors THEN it SHALL log them for troubleshooting

### Requirement 5: Simple Visual Design

**User Story:** As a kiosk user, I want a clean, easy-to-understand interface with clear visual indicators, so that I can quickly see locker availability and system status.

#### Acceptance Criteria

1. WHEN viewing the locker grid THEN each locker SHALL show its number and status using simple colors (green=available, red=occupied, gray=disabled)
2. WHEN lockers are available THEN they SHALL be clearly highlighted and clickable
3. WHEN lockers are occupied THEN they SHALL be visually distinct and non-clickable
4. WHEN the system is idle THEN it SHALL show a simple "Scan your card" message
5. WHEN in session mode THEN it SHALL show "Select a locker" with the countdown
6. WHEN operations are in progress THEN it SHALL show simple loading indicators

### Requirement 6: Improved Error Handling and Recovery

**User Story:** As a kiosk user, I want clear error messages in Turkish with simple recovery options, so that I know what to do when something goes wrong.

#### Acceptance Criteria

1. WHEN card reading fails THEN it SHALL show "Kart okunamadı - Tekrar deneyin"
2. WHEN no lockers are available THEN it SHALL show "Müsait dolap yok - Daha sonra deneyin"
3. WHEN locker assignment fails THEN it SHALL show "Dolap atanamadı - Farklı dolap seçin"
4. WHEN hardware is offline THEN it SHALL show "Sistem bakımda - Görevliye başvurun"
5. WHEN session expires THEN it SHALL show "Süre doldu - Kartınızı tekrar okutun"
6. WHEN any error occurs THEN it SHALL provide a "Ana ekrana dön" button

### Requirement 7: Performance and Reliability

**User Story:** As a system administrator, I want the kiosk to run reliably on Raspberry Pi hardware with minimal resource usage, so that it operates consistently without crashes or slowdowns.

#### Acceptance Criteria

1. WHEN running on Raspberry Pi THEN the system SHALL use less than 50% CPU during normal operation
2. WHEN displaying the interface THEN it SHALL use less than 200MB of RAM
3. WHEN operating continuously THEN it SHALL run for 24+ hours without memory leaks
4. WHEN network connectivity is lost THEN it SHALL show offline status and attempt reconnection
5. WHEN the system recovers from errors THEN it SHALL return to a stable idle state
6. WHEN logging events THEN it SHALL not fill up storage with excessive log files

### Requirement 8: Touch-Friendly Interface

**User Story:** As a kiosk user using a touch screen, I want large, responsive buttons and clear visual feedback, so that I can easily interact with the system.

#### Acceptance Criteria

1. WHEN displaying interactive elements THEN they SHALL be at least 60px in size for easy touch
2. WHEN I touch a button THEN it SHALL provide immediate visual feedback
3. WHEN selecting lockers THEN the touch targets SHALL be large and well-spaced
4. WHEN the interface loads THEN all elements SHALL be properly sized for the screen resolution
5. WHEN using the interface THEN scrolling SHALL be smooth and responsive
6. WHEN elements are disabled THEN they SHALL be clearly visually distinct from active elements