# Requirements Document

## Introduction

This feature implements a zero-touch automatic locker assignment system that replaces manual locker selection with intelligent assignment algorithms. The system maintains full backward compatibility with existing APIs while adding sophisticated assignment logic, return handling, and administrative controls. Users will experience a seamless flow where they simply scan their card and receive an automatically assigned locker, with smart handling for returns, overdue situations, and capacity management.

## Requirements

### Requirement 1: Zero-Touch Assignment Engine

**User Story:** As a kiosk user, I want to scan my card once and automatically receive an assigned locker, so that I don't need to manually select from available options.

#### Acceptance Criteria

1. WHEN a user scans their RFID card THEN the system SHALL automatically assign and open the most suitable available locker
2. WHEN no suitable lockers are available THEN the system SHALL display "Boş dolap yok. Görevliye başvurun" message
3. WHEN the assignment engine runs THEN it SHALL exclude lockers that are in quarantine, return hold, overdue, or suspected occupied status
4. WHEN multiple suitable lockers exist THEN the system SHALL use weighted scoring algorithm to select the optimal locker
5. IF the user has an active ownership THEN the system SHALL open their existing locker instead of assigning a new one

### Requirement 2: Intelligent Scoring and Selection Algorithm

**User Story:** As a system administrator, I want lockers to be assigned using intelligent scoring that considers usage patterns and wear distribution, so that the system optimizes locker utilization and longevity.

#### Acceptance Criteria

1. WHEN calculating locker scores THEN the system SHALL use formula: score = base_score + score_factor_a×free_hours + score_factor_b×hours_since_last_owner
2. WHEN a locker is in quarantine THEN the system SHALL exclude it from the assignment pool
3. WHEN calculating final score THEN the system SHALL divide by (1 + score_factor_g×wear_count)
4. WHEN reducing starvation THEN the system SHALL optionally add score_factor_d×waiting_hours to score
5. WHEN selecting from candidates THEN the system SHALL take top_k_candidates scored lockers and use weighted random selection with selection_temperature

### Requirement 3: Return Hold and Short Errand Detection

**User Story:** As a user who needs to make a quick trip back to my locker, I want the system to hold my locker for a short period after I close it, so that I can return quickly without losing my assignment.

#### Acceptance Criteria

1. WHEN a locker door is opened and closed quickly THEN the system SHALL infer a short errand and set return hold
2. WHEN return hold is active THEN only the same card SHALL be able to bypass the hold and reopen the locker
3. WHEN return hold expires THEN the locker SHALL return to the general assignment pool
4. WHEN calculating available lockers THEN the system SHALL exclude lockers in return hold from assignment to other users
5. WHEN the same user returns during hold period THEN the system SHALL immediately open their held locker

### Requirement 4: Dynamic Reclaim and Exit Reopen Logic

**User Story:** As a returning user, I want the system to intelligently handle my return based on available capacity and time elapsed, so that I can reclaim my previous locker when appropriate.

#### Acceptance Criteria

1. WHEN calculating reclaim window THEN the system SHALL interpolate between high stock (180 minutes) and low stock (30 minutes) based on free ratio
2. WHEN user returns after 120 minutes AND their last locker is free THEN the system SHALL reopen it and apply 20-minute exit quarantine
3. WHEN free capacity is high THEN the system SHALL allow longer reclaim windows
4. WHEN free capacity is low THEN the system SHALL prioritize new assignments over reclaims
5. WHEN exit quarantine is applied THEN the locker SHALL be excluded from general assignment for the quarantine period

### Requirement 5: Overdue and Suspected Occupied Management

**User Story:** As a system administrator, I want automatic handling of overdue lockers and user-reported issues, so that the system maintains optimal availability and handles problem situations.

#### Acceptance Criteria

1. WHEN session limit expires THEN the system SHALL mark locker as overdue and exclude from assignment pool
2. WHEN overdue owner returns THEN the system SHALL allow one retrieval open before applying quarantine
3. WHEN user double-scans shortly after locker open THEN the system SHALL mark locker as suspected occupied and assign a different locker
4. WHEN suspected occupied is reported THEN the system SHALL move original locker to overdue status with reason "user report"
5. WHEN user reports occupied locker THEN the system SHALL respect daily cap of 2 reports per card

### Requirement 6: Sensorless Open and Retry Logic

**User Story:** As a user, I want the system to handle hardware timing issues gracefully with automatic retries, so that temporary hardware glitches don't prevent me from accessing my locker.

#### Acceptance Criteria

1. WHEN opening a locker THEN the system SHALL pulse relay and wait for confirmation window
2. WHEN same card scans again within open window THEN the system SHALL display "Tekrar deneniyor" and retry once after short backoff
3. WHEN retry succeeds THEN the system SHALL display "Dolabınız açıldı. Eşyalarınızı yerleştirin"
4. WHEN retry fails THEN the system SHALL display "Şu an işlem yapılamıyor"
5. WHEN displaying final message THEN total duration SHALL be ≤ pulse_ms + open_window_sec + retry_backoff_ms + pulse_ms

### Requirement 7: Rate Limiting and Throttling

**User Story:** As a system administrator, I want rate limiting to prevent abuse and hardware stress, so that the system remains stable under heavy usage.

#### Acceptance Criteria

1. WHEN user attempts multiple opens THEN the system SHALL enforce one open per card every 10 seconds
2. WHEN locker receives multiple commands THEN the system SHALL enforce three opens per locker per 60 seconds
3. WHEN relay commands are sent THEN the system SHALL enforce 3-second relay cooldown
4. WHEN user exceeds rate limits THEN the system SHALL display "Lütfen birkaç saniye sonra deneyin" message
5. WHEN report-based reassignment occurs THEN the system SHALL cap at two per day per card

### Requirement 8: Configuration Management System

**User Story:** As a system administrator, I want a flexible configuration system with global defaults and per-kiosk overrides, so that I can tune system behavior for different locations and requirements.

#### Acceptance Criteria

1. WHEN system starts for first time THEN it SHALL seed all default configuration values from predefined defaults table
2. WHEN configuration changes THEN updates SHALL take effect within 3 seconds across all services
3. WHEN kiosk-specific tuning is needed THEN the system SHALL support per-kiosk override table
4. WHEN hot reload occurs THEN system SHALL measure and verify configuration propagation time ≤ 3 seconds
5. WHEN configuration is modified THEN the system SHALL maintain audit history of all changes with version tracking

### Requirement 9: Feature Flag and Backward Compatibility

**User Story:** As a system administrator, I want to switch between old manual selection and new auto-assignment modes, so that I can safely deploy and test the new system without breaking existing functionality.

#### Acceptance Criteria

1. WHEN feature flag is OFF THEN the system SHALL show traditional manual locker selection interface
2. WHEN feature flag is ON THEN the system SHALL never render locker selection list to DOM
3. WHEN in either mode THEN existing APIs SHALL continue to work without modification
4. WHEN switching modes THEN no service restart SHALL be required
5. WHEN rollback is needed THEN the system SHALL immediately revert to manual mode via configuration at `/feature-flags`
6. WHEN feature flag changes THEN system SHALL log "Smart assignment enabled/disabled for kiosk {kioskId} by {editor}" without card data
7. WHEN default state is set THEN smart assignment SHALL be OFF by default

### Requirement 10: Administrative Interface and Monitoring

**User Story:** As a system administrator, I want comprehensive admin panels for configuration, monitoring, and management, so that I can effectively operate and troubleshoot the smart assignment system.

#### Acceptance Criteria

1. WHEN managing settings THEN admin panel SHALL provide Turkish interface with "Kaydet", "Varsayılanı Yükle", "Kiosk için Geçersiz Kıl" options
2. WHEN monitoring sessions THEN admin panel SHALL show live sessions with remaining time and extend options
3. WHEN handling overdue lockers THEN admin panel SHALL provide "Gecikmiş dolaplar" list with force open and clear options
4. WHEN managing suspected lockers THEN admin panel SHALL show "Şüpheli dolaplar" list with clear flag functionality
5. WHEN monitoring system health THEN admin panel SHALL display metrics and configurable alerts

### Requirement 11: Turkish Language User Experience

**User Story:** As a Turkish-speaking user, I want clear status messages in my language during the locker assignment process, so that I understand what's happening at each step.

#### Acceptance Criteria

1. WHEN system is idle THEN display SHALL show "Kartınızı okutun."
2. WHEN new locker is assigned THEN display SHALL show "Dolabınız açıldı. Eşyalarınızı yerleştirin."
3. WHEN returning to existing locker THEN display SHALL show "Önceki dolabınız açıldı."
4. WHEN session is overdue THEN display SHALL show "Süreniz doldu. Almanız için açılıyor."
5. WHEN locker is reported occupied THEN display SHALL show "Dolap dolu bildirildi. Yeni dolap açılıyor."

### Requirement 12: Dynamic Quarantine Management

**User Story:** As a system administrator, I want dynamic quarantine periods that adapt to system capacity, so that lockers are optimally managed during high and low usage periods.

#### Acceptance Criteria

1. WHEN free_ratio is ≥ 0.5 THEN quarantine period SHALL be set to 20 minutes (maximum)
2. WHEN free_ratio is ≤ 0.1 THEN quarantine period SHALL be set to 5 minutes (minimum)
3. WHEN free_ratio is between 0.1 and 0.5 THEN system SHALL interpolate linearly between 5 and 20 minutes
4. WHEN exit quarantine is applied THEN system SHALL use fixed 20-minute duration regardless of capacity
5. WHEN calculating quarantine duration THEN system SHALL use formula: 5 + (free_ratio - 0.1) / 0.4 * 15 minutes

### Requirement 13: Reserve Capacity and Temperature Controls

**User Story:** As a system administrator, I want reserve capacity management and temperature-based selection, so that the system maintains availability buffers and optimizes selection algorithms.

#### Acceptance Criteria

1. WHEN calculating available lockers THEN system SHALL maintain reserve_ratio percentage of total capacity as reserve
2. WHEN reserve capacity drops below reserve_minimum THEN system SHALL trigger low stock alerts
3. WHEN using temperature parameter THEN system SHALL apply temperature weighting to random selection algorithm
4. WHEN temperature is high THEN system SHALL favor more random selection among top candidates
5. WHEN temperature is low THEN system SHALL favor deterministic selection of highest scored locker

### Requirement 14: Owner Hot Window Protection

**User Story:** As a recent locker user, I want protection from immediate reassignment when capacity is very low, so that I have a reasonable chance to return to my locker.

#### Acceptance Criteria

1. WHEN free_ratio is ≥ 0.5 THEN owner hot window SHALL be set to 30 minutes
2. WHEN free_ratio is ≤ 0.1 THEN owner hot window SHALL be disabled  
3. WHEN free_ratio is between 0.1 and 0.5 THEN system SHALL interpolate linearly between 10 and 30 minutes
4. WHEN owner hot window is active THEN system SHALL exclude locker from assignment to other users
5. WHEN owner hot window expires THEN locker SHALL return to general assignment pool

### Requirement 15: User Report Window and Limits

**User Story:** As a user, I want to report occupied lockers within a reasonable time window, so that I can get help when the assigned locker is actually occupied.

#### Acceptance Criteria

1. WHEN locker is opened THEN system SHALL start user_report_window_sec countdown for reporting
2. WHEN user double-scans within report window THEN system SHALL accept suspected occupied report
3. WHEN suspected occupied is reported THEN system SHALL set suspect_ttl_min timeout for investigation
4. WHEN daily report limit is reached THEN system SHALL reject additional reports from same card
5. WHEN report window expires THEN system SHALL no longer accept suspected occupied reports for that opening

### Requirement 16: Session Extension Management

**User Story:** As an administrator, I want to extend user sessions in 60-minute increments with proper limits and auditing, so that I can help users who need more time.

#### Acceptance Criteria

1. WHEN extending session THEN system SHALL add exactly 60 minutes to current expiration time
2. WHEN session total time reaches 240 minutes THEN system SHALL prevent further extensions
3. WHEN extension is requested THEN system SHALL verify administrator authorization only
4. WHEN extension is granted THEN system SHALL create mandatory audit record with admin user, timestamp, and reason
5. WHEN maximum 240 minutes reached THEN system SHALL require manual intervention for any further time

### Requirement 17: Alerting and Monitoring Thresholds

**User Story:** As a system administrator, I want configurable alerts for system conditions, so that I can proactively address issues before they impact users.

#### Acceptance Criteria

1. WHEN no_stock events exceed 3 in 10 minutes THEN system SHALL trigger alert with auto-clear when <2 events in 10 minutes after 20 minutes
2. WHEN conflict_rate exceeds 2% in 5 minutes THEN system SHALL trigger alert with auto-clear when <1% in 10 minutes
3. WHEN open_fail_rate exceeds 1% in 10 minutes THEN system SHALL trigger alert with auto-clear when <0.5% in 20 minutes
4. WHEN retry_rate exceeds 5% in 5 minutes THEN system SHALL trigger alert with auto-clear when <3% in 10 minutes
5. WHEN overdue_share reaches 20% in 10 minutes THEN system SHALL trigger alert with auto-clear when <10% in 20 minutes

### Requirement 18: Per-Kiosk Configuration Override System

**User Story:** As a system administrator, I want to override global settings for specific kiosks, so that I can tune behavior for different locations and usage patterns.

#### Acceptance Criteria

1. WHEN retrieving effective configuration THEN system SHALL merge global defaults with kiosk-specific overrides
2. WHEN setting kiosk override THEN system SHALL validate configuration keys and values
3. WHEN configuration is requested THEN GET /admin/config/effective/{kioskId} SHALL return merged configuration
4. WHEN override is updated THEN PUT /admin/config/override/{kioskId} SHALL update kiosk-specific settings
5. WHEN override is removed THEN DELETE /admin/config/override/{kioskId} SHALL revert to global defaults

### Requirement 19: Concurrency and Transaction Safety

**User Story:** As a developer, I want atomic locker selection and assignment operations, so that race conditions don't cause double assignments or lost reservations.

#### Acceptance Criteria

1. WHEN selecting and claiming locker THEN entire operation SHALL be wrapped in single database transaction
2. WHEN assignment conflict occurs THEN system SHALL refresh locker state once and retry selection with fresh state
3. WHEN concurrent assignments happen THEN only one SHALL succeed and others SHALL retry once with updated state
4. WHEN transaction fails THEN system SHALL rollback all changes and return appropriate error
5. WHEN retry fails after conflict THEN system SHALL return error without further retry attempts

### Requirement 20: Data Model Extensions

**User Story:** As a developer, I want extended data models that support all smart assignment features, so that the system can track timing, status, and usage patterns effectively.

#### Acceptance Criteria

1. WHEN tracking locker timing THEN system SHALL store free_since, recent_owner, recent_owner_time, quarantine_until, wear_count
2. WHEN managing locker status THEN system SHALL store overdue_from, overdue_reason, suspected_occupied, cleared_by, cleared_at flags
3. WHEN handling return holds THEN system SHALL store return_hold_until timestamp
4. WHEN managing sessions THEN system SHALL store start, limit, extended, expires, status, last_seen fields
5. WHEN auditing changes THEN system SHALL maintain complete history of all status and configuration changes