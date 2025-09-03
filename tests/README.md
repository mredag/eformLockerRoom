# Test Organization and Documentation

## Overview

This document describes the organized test structure for the eForm Locker System. Tests are now properly organized by type and purpose, with clear separation between integration tests and unit tests.

## Test Structure

### Integration Tests (`tests/integration/`)

Integration tests are centralized in the main `tests/integration/` directory and test cross-service functionality:

#### Core Integration Tests
- `session-management-lifecycle.test.ts` - RFID session management
- `real-time-state-sync.test.ts` - WebSocket real-time updates  
- `turkish-language-validation.test.ts` - Turkish localization
- `accessibility-requirements.test.ts` - Accessibility compliance
- `backend-integration.test.ts` - Backend service integration
- `admin-panel-ui-improvements.test.ts` - Admin panel UI tests
- `websocket-realtime-ui-updates.test.ts` - Real-time UI updates

#### Hardware Configuration Wizard Tests (NEW!)
- `hardware-wizard-api.test.ts` - Wizard API endpoint testing
- `wizard-performance-monitoring.test.ts` - Performance monitoring integration

#### Service Integration Tests  
- `vip-workflow-integration.test.ts` - VIP contract workflows
- `rfid-qr-integration.test.ts` - RFID and QR code integration
- `database-integration.test.ts` - Database setup and migrations
- `multi-service-integration.test.ts` - Gateway/Kiosk/Panel coordination
- `multi-room-coordination.test.ts` - Cross-room operations
- `gateway-service-integration.test.ts` - Gateway service coordination

### Unit Tests (Service-specific directories)

Unit tests are organized within each service's `__tests__` directory:

#### Panel Service (`app/panel/src/__tests__/`)
- Authentication and authorization tests
- Route handler tests  
- Service layer tests
- Maksisoft integration tests
- UI improvement tests

#### Kiosk Service (`app/kiosk/src/__tests__/`)
- UI controller tests
- Session manager tests
- Hardware integration tests
- RFID flow tests
- QR handler tests

#### Gateway Service (`app/gateway/src/__tests__/`)
- Coordination service tests
- Route handler tests
- Validation tests

#### Shared Services (`shared/services/__tests__/`)
- Locker state manager tests
- WebSocket service tests
- Event logger tests
- Configuration manager tests
- Rate limiter tests

#### Hardware Wizard Services (`shared/services/__tests__/`)
- `wizard-security-service.test.ts` - Security service (26 tests ✅)
- `wizard-security-service-enhanced.test.ts` - Enhanced security features
- `wizard-security-monitor.test.ts` - Security monitoring and alerts
- `wizard-input-validator.test.ts` - Input validation and sanitization
- `wizard-orchestration-service.test.ts` - Wizard workflow orchestration
- `wizard-performance-monitor.test.ts` - Performance monitoring
- `wizard-cache-service.test.ts` - Caching and resource management
- `hardware-detection-service.test.ts` - Hardware detection and scanning
- `hardware-testing-service.test.ts` - Hardware testing and validation
- `slave-address-service.test.ts` - Slave address configuration
- `troubleshooting-integration-service.test.ts` - Troubleshooting automation
- `recovery-action-system.test.ts` - Automatic error recovery
- `error-handler.test.ts` - Error handling and logging

## Running Tests

### All Integration Tests
```bash
npm run test:integration
# or
npx tsx tests/integration/run-integration-tests.ts
```

### Specific Integration Test
```bash
npx vitest run tests/integration/session-management-lifecycle.test.ts
```

### Unit Tests by Service
```bash
# Panel service unit tests
npx vitest run app/panel/src/__tests__/**/*.test.ts

# Kiosk service unit tests  
npx vitest run app/kiosk/src/__tests__/**/*.test.ts

# Shared service unit tests
npx vitest run shared/services/__tests__/**/*.test.ts
```

### Hardware Wizard Tests
```bash
# Run all wizard tests
npm test -- --testPathPattern="wizard.*test\.ts"

# Run wizard security tests specifically
npm test shared/services/__tests__/wizard-security-service.test.ts

# Run wizard integration tests
npx vitest run tests/integration/hardware-wizard-api.test.ts
npx vitest run tests/integration/wizard-performance-monitoring.test.ts

# Run wizard unit tests
npx vitest run tests/unit/wizard-services.test.ts

# Run wizard end-to-end tests
npx vitest run tests/e2e/hardware-wizard-flow.test.ts
```

### All Tests
```bash
npm test
```

## Test Organization Principles

1. **Integration tests** test cross-service functionality and are centralized
2. **Unit tests** test individual components and stay close to the code
3. **No duplicate tests** - consolidated similar test files
4. **Clear naming** - test files clearly indicate what they test
5. **Proper imports** - updated import paths after reorganization

## Removed Duplicates

The following duplicate test files were consolidated:
- `tests/integration/real-time-sync.test.ts` (merged into real-time-state-sync.test.ts)
- Integration tests moved from service directories to main integration directory

## Empty Directories

The following empty integration directories should be removed:
- `app/panel/src/__tests__/integration/` (empty)
- `app/kiosk/src/__tests__/integration/` (empty)  
- `app/gateway/src/__tests__/integration/` (empty)

## Requirements Coverage

Tests are mapped to specific requirements as documented in the test runner configuration.