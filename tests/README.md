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