# Implementation Plan

- [x] 1. Database Schema Updates for Locker Naming

  - Extend lockers table with display_name, name_updated_at, name_updated_by columns
  - Create locker_name_audit table for tracking name changes
  - Write migration script to add new columns safely
  - _Requirements: 5.2, 5.8_

- [x] 2. Implement Locker Naming Service

  - Create LockerNamingService class with validation for Turkish characters (max 20 chars)
  - Implement setDisplayName, getDisplayName, validateName methods

  - Add generatePresets method with Turkish examples ("Kapı A1", "Dolap 101")
  - Write unit tests for name validation and Turkish character support
  - _Requirements: 5.1, 5.3, 5.5, 5.10_

- [x] 3. Update Shared Locker State Manager

  - Modify LockerStateManager to use ONLY thes
    e consistent state names everywhere: Boş, Dolu, Açılıyor, Hata, Engelli
  - Add displayName field to locker data model
  - Implement real-time state broadcasting via WebSocket
  - Create connection status monitoring (online/offline/reconnecting)
  - _Requirements: 6.1, 6.3, 6.4, 6.5_

-

- [x] 4. Enhance Kiosk UI - Core Layout Structure

  - Modify app/kiosk/src/ui/index.html to implement full-screen layout with background grid and front overlay
  - Update app/kiosk/src/ui/static/styles.css with blur effects, overlay card styling, and responsive grid
  - Implement always-visible legend bar at bottom with state chips
  - Add CSS for tile specifications: 120x120px, 12px gaps, 56px touch targets
  - _Requirements: 3.1, 3.2, 3.3, 3.7_

- [x] 5. Implement Kiosk Session Management

  - Create SessionManager class in app/kiosk/src/controllers/ for RFID session handling
  - Implement 20-second countdown timer with LARGE badge display in top-right corner
  - Add one-session-per-kiosk rule: new card cancels current session with "Yeni kart okundu. Önceki oturum kapatıldı."
  - Create session cleanup and timeout handling
  - _Requirements: 1.1, 1.2, 1.4, 1.5_

- [x] 6. Update Kiosk UI Controller for Enhanced Feedback

- [ ] 6. Update Kiosk UI Controller for Enhanced Feedback

  - Modify app/kiosk/src/controllers/ui-controller.ts to handle blur/overlay transitions
  - Implement smooth animations: fade, scale, blur effects (200-300ms)
  - Add BIG screen-level feedback banners: "Dolap açılıyor", "Dolap açıldı", "Açılamadı"
  - Create audio feedback system with success/error tones
  - Use exact Turkish copy: "Kart okutunuz", "Kart okundu. Seçim için dokunun", "Oturum zaman aşımı"
  - _Requirements: 2.4, 2.5, 1.6_

-

- [x] 7. Implement Locker Grid with State Visualization

  - Update app/kiosk/src/ui/static/app.js to render tiles with consistent states
  - Add state-specific colors and icons: Boş (green+check), Dolu (red+lock), etc.
  - Implement tile interaction: lift effect, outline glow, spinner animations
  - Create real-time grid updates without page reload
  - _Requirements: 2.1, 2.2, 2.6, 3.4_

-

- [x] 8. Add Turkish Error Messages and Recovery

  - Update app/kiosk/src/ui/static/i18n.js with comprehensive Turkish error catalog
  - Implement error message display system with recovery suggestions
  - Add connection status indicators: "Çevrimdışı", "Yeniden bağlandı"
  - Create "Son güncelleme" timestamp display
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 6.5_

-

- [x] 9. Redesign Admin Panel Locker Cards

  - Modify app/panel/src/views/lockers.html to show display names prominently with small relay numbers
  - Update locker card styling with state chips using ONLY these states: Boş, Dolu, Açılıyor, Hata, Engelli
  - Remove ONLY "Engelle" buttons from locker cards (leave other admin controls untouched)
  - Add last change time display to each card
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 10. Implement Admin Panel Filtering and Management

  - Add filtering controls to app/panel/src/views/lockers.html for State, Kiosk, Name search

  - Add filtering controls to app/panel/src/views/lockers.html for State, Kiosk, Name search
  - Implement sorting options: Name, Relay, State, Last Changed
  - Create bulk action buttons: Open, Release, Refresh
  - Add toast notification system for operation feedback
  - _Requirements: 4.5, 4.6, 4.7, 4.8, 4.9_

- [x] 11. Create Locker Naming Management Interface

  - Add naming management section to admin panel
  - Create form for setting custom locker names with Turkish character validation
  - Implement name audit logging and display
  - Add printable map generation for installers
  - _Requirements: 5.6, 5.7, 5.8, 5.9_

- [x] 12. Implement Real-time WebSocket Communication

  - Create WebSocket server in shared services for state broadcasting
  - Update kiosk UI to receive real-time state upda
    tes
  - Implement admin panel real-time synchronization
  - Add automatic reconnection logic with status indicators
  - _Requirements: 6.1, 6.2, 6.4, 6.6_

-

- [x] 13. Add Performance Monitoring and Metrics

  - Implement performance tracking: time to open, error rate, sessions per hour
  - Create metrics collection for most selected lockers and average idle time
  - Add UI update latency monitoring
  - Create performance dashboard for administrators
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 14. Optimize for Raspberry Pi Performance

  - Cap grid frame rate at 30fps in CSS animations
  - Optimize image assets and use vector icons
  - Implement memory usage monitoring
  - Test and tune performance on target hardware
  - _Requirements: 3.8, 8.5_

-

- [x] 15. Integration Testing and Validation

  - Write integration tests for session management lifecycle
  - Test real-time state synchronization across all interfaces
  - Validate Turkish language display and error messages
  - Test accessibility requirements: 2m readability, color-blind safety, touch targets
  - _Requirements: 2.3, 7.6, 8.2, 8.3, 8.4_

-

- [x] 16. Final UI Polish and Acceptance Testing


  - Verify all acceptance criteria from design checklist
  - Test smooth transitions and animations on Raspberry Pi
  - Validate consistent state names across all interfaces
  - Ensure session management works correctly with timeout and new card scenarios
  - _Requirements: All requirements validation_
