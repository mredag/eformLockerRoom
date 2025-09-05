# Implementation Plan

## P0 - Production Path (MVP Core)

- [ ] 1. Implement feature flag system

  - Create feature flag configuration and management
  - Implement runtime feature flag checking throughout the system
  - Add seamless switching between manual and smart assignment modes
  - Create feature flag persistence and configuration storage
  - Build feature flag testing and validation tools
  - **Acceptance**: Feature flag toggles assignment mode without restart, logs "Smart assignment enabled/disabled"
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 2. Create minimal database migration

  - Create migration file for essential locker table columns: free_since, recent_owner, recent_owner_time, quarantine_until, wear_count, return_hold_until
  - Add indexes for performance optimization on new columns
  - Create basic global_config table for feature flag storage
  - Ensure migration is reversible for rollback scenarios
  - Test migration on development and staging databases
  - **Acceptance**: Migration runs successfully, new columns queryable, rollback tested
  - _Requirements: 20.1, 20.2, 20.5_

- [ ] 3. Implement locker scoring algorithm

  - Create LockerScorer class with configurable scoring parameters
  - Implement base_score + score_factor_a×free_hours + score_factor_b×hours_since_last_owner formula
  - Add quarantine multiplier (×0.2) and wear_count divisor (÷(1+score_factor_g×wear_count)) logic
  - Implement optional waiting hours bonus (score_factor_d×waiting_hours) for starvation reduction
  - Create unit tests for scoring edge cases and parameter variations
  - **Acceptance**: Scoring produces consistent results, handles edge cases, logs "Scored N lockers, top candidate: ID"
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 4. Build candidate selection system

  - Implement top_k_candidates filtering from scored lockers
  - Create weighted random selection with stable seed for reproducibility
  - Add selection_temperature parameter for selection randomness control
  - Implement exclusion logic for quarantined, held, overdue, and suspected lockers
  - Write tests for selection distribution and determinism
  - **Acceptance**: Selection is deterministic with same seed, excludes invalid lockers, logs "Selected locker ID from K candidates"
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 5. Create assignment engine orchestrator

  - Implement AssignmentEngine class with main assignLocker method
  - Add assignment flow logic: existing ownership → overdue retrieval → return hold → reclaim → new assignment
  - Implement concurrency control with single transaction and one retry only
  - Create assignment result formatting with Turkish messages
  - Add comprehensive error handling and fallback logic
  - **Acceptance**: Single transaction with one retry on conflict, Turkish messages displayed, logs "Assignment completed: action=X, locker=Y"
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 19.1, 19.2, 19.3, 19.4, 19.5_

- [ ] 6. Implement sensorless open system

  - Create SensorlessRetryHandler with pulse and wait logic
  - Implement open window detection based on scan timing and open command timestamps (no door sensors)
  - Add single retry with backoff after card scan during window
  - Create timing budget enforcement (≤ pulse_ms + open_window_sec + retry_backoff_ms + pulse_ms)
  - Build Turkish message display: "Tekrar deneniyor" only during retry window
  - **Acceptance**: Single retry only, timing budget enforced, shows "Tekrar deneniyor" then success/failure message
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 7. Build rate limiting system

  - Implement card-based rate limiting (one open per 10 seconds)
  - Create locker-based rate limiting (3 opens per 60 seconds)
  - Add command cooldown enforcement (3 seconds between relay commands)
  - Implement user report rate limiting (2 per day per card)
  - Create rate limit violation tracking and throttling messages
  - **Acceptance**: Rate limits enforced, shows "Lütfen birkaç saniye sonra deneyin", logs "Rate limit exceeded: type=X, key=Y"
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 8. Enhance kiosk UI for smart assignment

  - Modify RFID card handling to call assignment engine when feature flag enabled
  - Implement feature flag check for smart vs manual mode
  - Add Turkish message display system for all assignment outcomes
  - Remove locker selection UI when smart assignment is enabled (locker list never renders to DOM)
  - Create loading states and progress indicators for assignment process
  - **Acceptance**: Feature flag OFF shows manual UI, ON shows no locker list, displays correct Turkish messages
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 9. Update kiosk API endpoints
  - Enhance POST /api/rfid/handle-card for smart assignment flow
  - Modify response format to include assignment results and messages
  - Add error handling for all assignment failure scenarios
  - Implement backward compatibility for manual mode
  - Use static windows for MVP: quarantine_min=20, reclaim_min=60 (no dynamics yet)
  - **Acceptance**: API returns proper format, backward compatible, logs "API response: action=X, message=Y"
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

## P1 - Configuration and Dynamic Logic

- [ ] 10. Implement configuration seeding system

  - Create configuration seeding service that populates default values on first boot
  - Implement seed data for all global configuration keys with proper data types
  - Set session_limit_minutes=180 (config-driven, not hardcoded 120)
  - Create validation functions for configuration value types and ranges
  - Add configuration version tracking for hot reload detection
  - **Acceptance**: First boot seeds all defaults, session limit configurable, logs "Configuration seeded: N keys"
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 11. Build configuration manager service

  - Implement ConfigurationManager class with hot reload capabilities
  - Create methods for getEffectiveConfig, getGlobalConfig, getKioskOverrides
  - Implement configuration merging logic (global + kiosk overrides)
  - Add configuration change detection and version tracking
  - Build configuration validation and type checking
  - **Acceptance**: Configuration merges correctly, validates types, logs "Config loaded: version=X"
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 12. Implement hot reload mechanism

  - Create configuration change subscription system with EventEmitter
  - Implement ≤3 second propagation requirement with measurement
  - Add configuration version polling and change detection
  - Create configuration cache invalidation system
  - Write integration tests for hot reload timing and reliability
  - **Acceptance**: Configuration changes propagate ≤3 seconds, measured and logged
  - _Requirements: 8.1, 8.4, 8.5_

- [ ] 13. Create configuration API endpoints

  - Implement GET /admin/config/effective/{kioskId} endpoint
  - Implement PUT /admin/config/global for global configuration updates
  - Implement PUT /admin/config/override/{kioskId} for kiosk-specific overrides
  - Implement DELETE /admin/config/override/{kioskId} for override removal
  - Add configuration audit logging for all changes
  - **Acceptance**: APIs work correctly, audit trail created, logs "Config updated: key=X, by=Y"
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

- [ ] 14. Implement dynamic quarantine calculation

  - Create quarantine duration calculation with linear interpolation (5-20 minutes)
  - Implement free_ratio-based quarantine: ≥0.5→20min, ≤0.1→5min, linear between
  - Add fixed 20-minute exit quarantine for reclaim scenarios
  - Create quarantine application and expiration logic
  - Write tests for quarantine calculation accuracy and edge cases
  - **Acceptance**: Quarantine duration calculated correctly, logs "Quarantine applied: duration=X, reason=Y"
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 15. Create dynamic reclaim system

  - Implement reclaim window calculation with linear interpolation (30-180 minutes)
  - Add 120-minute threshold check for exit reopen eligibility
  - Create exit quarantine application (20 minutes) after reclaim
  - Implement last locker availability check for reclaim
  - Write tests for reclaim timing and quarantine application
  - **Acceptance**: Reclaim triggers at 120min, applies exit quarantine, logs "Reclaim executed: locker=X, quarantine=20min"
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 16. Build rollout and monitoring tools

  - Create gradual rollout system for enabling smart assignment per kiosk
  - Implement rollback mechanisms and emergency disable functionality
  - Add rollout monitoring and success metrics tracking
  - Create rollout decision support with key metrics analysis
  - Build automated rollback triggers for critical issues
  - **Acceptance**: Per-kiosk rollout works, emergency disable functional, logs "Rollout: kiosk=X, enabled=Y"
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 17. Enhance session tracking system

  - Extend SessionManager with smart assignment features
  - Implement SmartSession model with extension tracking and limits
  - Add session limit enforcement (config-driven session_limit_minutes=180)
  - Create overdue session detection and marking
  - Build session extension logic (60-minute increments, 240-minute maximum)
  - **Acceptance**: Sessions use config limit (180min), extensions work, logs "Session extended: +60min, total=X"
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [ ] 18. Build overdue and suspected handling
  - Implement overdue locker marking when session limit expires
  - Create one-time retrieval logic for overdue owners
  - Add suspected occupied reporting with double-scan detection
  - Implement daily reporting caps (2 reports per card)
  - Create overdue and suspected locker exclusion from assignment pool
  - **Acceptance**: Overdue marked correctly, one retrieval allowed, logs "Overdue retrieval: card=X, locker=Y"
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

## P2 - Advanced Features

- [ ] 19. Implement owner hot window protection

  - Create owner hot window calculation with linear interpolation (10-30 minutes)
  - Add free_ratio-based hot window: ≥0.5→30min, ≤0.1→disabled, linear between
  - Implement hot window bypass when free_ratio ≤ 0.1
  - Create hot window expiration and locker release logic
  - Write tests for hot window calculation and capacity-based disabling
  - **Acceptance**: Hot window calculated correctly, disabled at low capacity, logs "Hot window: duration=X, disabled=Y"
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [ ] 20. Implement reserve capacity system

  - Create reserve capacity calculation (reserve_ratio percentage or reserve_minimum)
  - Implement assignable locker pool filtering (total - reserved)
  - Add low stock detection and reserve disabling logic
  - Create reserve capacity monitoring and alerts
  - Write tests for reserve calculation and low stock behavior
  - **Acceptance**: Reserve capacity maintained, disabled at low stock, logs "Reserve: kept=X, assignable=Y"
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 21. Build stock monitoring system

  - Implement free_ratio calculation and tracking
  - Create stock level categorization (high/medium/low)
  - Add stock-based behavior adjustments (quarantine, hot window, reserve)
  - Implement stock alerts and notifications
  - Create basic stock metrics (no trend analysis in MVP)
  - **Acceptance**: Stock levels calculated, behavior adjusts accordingly, logs "Stock level: ratio=X, category=Y"
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [ ] 22. Create alert manager service

  - Implement AlertManager class with threshold monitoring
  - Create alert generation, tracking, and auto-clearing logic
  - Add alert severity classification and escalation
  - Implement alert persistence and history tracking
  - Build alert notification system for admin interface
  - **Acceptance**: Alerts generated and cleared correctly, logs "Alert triggered: type=X, severity=Y"
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [ ] 23. Implement specific alert monitors

  - Create no_stock alert (>3 events/10min, clear <2 events/10min after 20min)
  - Implement conflict_rate alert (>2%/5min, clear <1%/10min)
  - Add open_fail_rate alert (>1%/10min, clear <0.5%/20min)
  - Create retry_rate alert (>5%/5min, clear <3%/10min)
  - Implement overdue_share alert (≥20%/10min, clear <10%/20min)
  - **Acceptance**: All alert thresholds work, auto-clear conditions met, logs "Alert cleared: type=X, condition=Y"
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [ ] 24. Create configuration management UI

  - Build admin panel pages for global configuration editing
  - Implement kiosk-specific override management interface
  - Add configuration validation and error handling in UI
  - Create configuration history and audit trail display
  - Implement Turkish labels: "Kaydet", "Varsayılanı Yükle", "Kiosk için Geçersiz Kıl"
  - **Acceptance**: UI saves config correctly, shows Turkish labels, displays audit trail
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 25. Build live session monitoring

  - Create live sessions dashboard with real-time updates
  - Implement session extension interface (60-minute increments)
  - Add session details display (remaining time, locker assignment)
  - Create session management actions (extend, cancel, force complete)
  - Build session history and analytics views
  - **Acceptance**: Live sessions display correctly, extensions work, shows "Kalan süre", "Oturumu uzat +60 dk"
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 26. Implement overdue and suspected management

  - Create "Gecikmiş dolaplar" (overdue lockers) management page
  - Implement force open and mark cleared functionality
  - Add "Şüpheli dolaplar" (suspected lockers) management interface
  - Create bulk operations for overdue and suspected locker handling
  - Build reporting and analytics for overdue patterns
  - **Acceptance**: Pages show Turkish labels, force open works, bulk operations functional
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 27. Create metrics and alerts dashboard
  - Build real-time metrics dashboard with key performance indicators
  - Implement alert management interface with acknowledgment and clearing
  - Add historical metrics visualization
  - Create system health monitoring and status displays
  - Implement alert configuration and threshold management
  - **Acceptance**: Dashboard shows real-time data, alerts manageable, health status visible
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

## Testing and Documentation

- [ ] 28. Create comprehensive unit tests

  - Write unit tests for all assignment engine components
  - Test configuration management and hot reload functionality
  - Create tests for all calculation algorithms (quarantine, reclaim, scoring)
  - Test session management and extension logic
  - Build tests for alert generation and clearing logic
  - **Acceptance**: All components have >90% test coverage, tests pass consistently
  - _Requirements: All requirements validation_

- [ ] 29. Implement integration tests

  - Create end-to-end assignment flow tests
  - Test feature flag switching and backward compatibility
  - Build concurrency and race condition tests
  - Test hardware integration and retry logic
  - Create performance and load testing scenarios
  - **Acceptance**: E2E tests cover all user flows, performance meets SLA
  - _Requirements: All requirements validation_

- [ ] 30. Build acceptance tests

  - Create acceptance tests for all Turkish UI messages
  - Test admin panel functionality and user workflows
  - Validate all configuration scenarios and edge cases
  - Test rollout and rollback procedures
  - Build production readiness validation tests
  - **Acceptance**: All Turkish messages validated, rollback procedures tested
  - _Requirements: All requirements validation_

- [ ] 31. Create system documentation

  - Write comprehensive API documentation for all new endpoints
  - Create configuration reference with all parameters and defaults
  - Build troubleshooting guide for common issues and solutions
  - Create deployment and rollout procedures documentation
  - Write operational runbook for monitoring and maintenance
  - **Acceptance**: Documentation complete, reviewed, and accessible
  - _Requirements: All requirements documentation_

- [ ] 32. Prepare deployment artifacts
  - Create database migration scripts and rollback procedures
  - Build configuration deployment and validation tools
  - Create monitoring and alerting setup scripts
  - Build deployment verification and health check tools
  - Create rollback and emergency procedures documentation
  - **Acceptance**: Deployment artifacts tested, rollback procedures validated
  - _Requirements: All requirements deployment_
