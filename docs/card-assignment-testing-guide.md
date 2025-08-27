# Card Assignment Flow Testing Guide

This document provides comprehensive testing guidance for the card assignment flow implementation, covering Requirements 2.1-2.6 and related session management requirements.

## Overview

The card assignment flow testing suite validates the complete user journey from RFID card scan to locker assignment, including error handling and recovery scenarios.

## Test Structure

### 1. Comprehensive Card Assignment Tests
**File:** `scripts/test-card-assignment-comprehensive.js`

Tests all core card assignment functionality:
- **Requirement 2.1:** Existing card detection
- **Requirement 2.2:** Existing locker opening and release
- **Requirement 2.3:** Available locker display for new cards
- **Requirement 2.4:** Locker assignment and opening
- **Requirement 2.5:** Error handling and retry mechanisms
- **Requirement 2.6:** Return to idle state after completion

### 2. Session Timeout and Cleanup Tests
**File:** `scripts/test-session-timeout-behavior.js`

Tests session management functionality:
- **Requirement 3.1:** 30-second session timeout
- **Requirement 3.2:** Countdown timer display
- **Requirement 3.3:** Session completion on locker selection
- **Requirement 3.4:** Clear timeout messages
- **Requirement 3.5:** New card cancels existing session
- **Requirement 3.6:** Session cleanup and memory management

### 3. Error Scenarios and Recovery Tests
**File:** `scripts/test-error-scenarios-recovery.js`

Tests error handling and recovery:
- Invalid session handling
- Missing parameter validation
- Hardware error scenarios
- Turkish error messages (Requirements 6.1-6.6)
- Network error recovery
- Return to idle state after errors

### 4. Unit Tests for UI Components
**File:** `app/kiosk/src/ui/static/__tests__/app-simple.test.js`

Tests the simplified kiosk UI JavaScript:
- State management
- DOM manipulation
- Event handling
- API communication
- Error display

## Running Tests

### Prerequisites

1. **Kiosk Service Running:**
   ```bash
   # Start the kiosk service
   cd /path/to/project
   npm run start:kiosk
   ```

2. **Environment Variables:**
   ```bash
   export KIOSK_URL=http://192.168.1.8:3002  # Or your kiosk URL
   ```

### Individual Test Execution

```bash
# Run comprehensive card assignment tests
node scripts/test-card-assignment-comprehensive.js

# Run session timeout tests
node scripts/test-session-timeout-behavior.js

# Run error recovery tests
node scripts/test-error-scenarios-recovery.js

# Run all tests with master runner
node scripts/run-card-assignment-tests.js
```

### Unit Test Execution

```bash
# Install dependencies for UI tests
cd app/kiosk/src/ui/static
npm install

# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

## Test Scenarios

### Core Card Assignment Flow

#### Scenario 1: Existing Card Assignment
1. **Setup:** Card already has a locker assigned
2. **Action:** Scan RFID card
3. **Expected:** 
   - System detects existing assignment (Requirement 2.1)
   - Opens assigned locker (Requirement 2.2)
   - Releases assignment after opening
   - Returns to idle state (Requirement 2.6)

#### Scenario 2: New Card Assignment
1. **Setup:** Card has no existing assignment
2. **Action:** Scan RFID card
3. **Expected:**
   - System shows available lockers (Requirement 2.3)
   - Creates 30-second session (Requirement 3.1)
   - Shows countdown timer (Requirement 3.2)
4. **Action:** Select a locker
5. **Expected:**
   - Assigns locker to card (Requirement 2.4)
   - Opens selected locker
   - Completes session immediately (Requirement 3.3)
   - Returns to idle state (Requirement 2.6)

### Session Management Scenarios

#### Scenario 3: Session Timeout
1. **Setup:** Active session with countdown
2. **Action:** Wait for 30-second timeout
3. **Expected:**
   - Session expires after 30 seconds (Requirement 3.1)
   - Shows clear timeout message (Requirement 3.4)
   - Returns to idle state
   - Cleans up session data (Requirement 3.6)

#### Scenario 4: Session Cancellation
1. **Setup:** Active session for Card A
2. **Action:** Scan Card B
3. **Expected:**
   - Cancels existing session for Card A (Requirement 3.5)
   - Creates new session for Card B
   - Maintains single session per kiosk

### Error Handling Scenarios

#### Scenario 5: Assignment Failure
1. **Setup:** Active session with available lockers
2. **Action:** Select locker that becomes unavailable
3. **Expected:**
   - Shows clear error message (Requirement 2.5)
   - Provides retry option
   - Maintains session for retry
   - Uses Turkish error messages (Requirements 6.1-6.6)

#### Scenario 6: Hardware Failure
1. **Setup:** Hardware communication issues
2. **Action:** Attempt locker assignment
3. **Expected:**
   - Detects hardware failure (Requirement 4.4)
   - Releases assignment if opening fails (Requirement 4.5)
   - Shows appropriate error message
   - Allows recovery when hardware is restored

## Test Data

### Test Cards
- **Card 1:** `0009652489` - Primary test card
- **Card 2:** `0009652490` - Secondary test card for session cancellation
- **Invalid Card:** `INVALID123` - For error testing

### Expected API Responses

#### Successful Card Scan (New Assignment)
```json
{
  "action": "show_lockers",
  "session_id": "session-kiosk-1-card-timestamp",
  "timeout_seconds": 30,
  "message": "Kart okundu. Dolap seçin",
  "lockers": [
    {"id": 1, "status": "Free", "display_name": "Dolap 1"},
    {"id": 2, "status": "Free", "display_name": "Dolap 2"}
  ]
}
```

#### Successful Card Scan (Existing Assignment)
```json
{
  "action": "open_locker",
  "locker_id": 5,
  "message": "Dolap açıldı ve bırakıldı"
}
```

#### Assignment Failure
```json
{
  "error": "assignment_failed",
  "message": "Dolap atanamadı - Farklı dolap seçin",
  "allow_retry": true
}
```

## Validation Criteria

### Functional Requirements

| Requirement | Test Method | Success Criteria |
|-------------|-------------|------------------|
| 2.1 | API call with existing card | Returns existing locker info |
| 2.2 | Locker opening verification | Locker opens and assignment released |
| 2.3 | New card scan | Shows available lockers list |
| 2.4 | Locker selection | Successfully assigns and opens locker |
| 2.5 | Error injection | Shows clear error with retry option |
| 2.6 | State verification | Returns to idle after completion |
| 3.1 | Session timing | 30-second timeout enforced |
| 3.2 | UI verification | Countdown timer displays and updates |
| 3.3 | Session completion | Session ends immediately on selection |
| 3.4 | Timeout handling | Clear message on session expiry |
| 3.5 | Concurrent sessions | New card cancels existing session |
| 3.6 | Memory monitoring | Session cleanup prevents memory leaks |

### Performance Requirements

- **Response Time:** All API calls complete within 2 seconds
- **Memory Usage:** No memory leaks during extended operation
- **Session Cleanup:** Old sessions removed within 5 minutes
- **Error Recovery:** System recovers from errors within 3 seconds

### Turkish Language Requirements (6.1-6.6)

All error messages must be in Turkish:
- `"Kart okunamadı - Tekrar deneyin"` (Card read failed)
- `"Müsait dolap yok - Daha sonra deneyin"` (No available lockers)
- `"Dolap atanamadı - Farklı dolap seçin"` (Assignment failed)
- `"Sistem bakımda - Görevliye başvurun"` (Hardware offline)
- `"Süre doldu - Kartınızı tekrar okutun"` (Session expired)
- `"Ana ekrana dön"` (Return to main screen)

## Troubleshooting

### Common Test Failures

#### 1. Service Not Available
**Error:** `Kiosk service not available: 500`
**Solution:** 
```bash
# Check service status
curl http://192.168.1.8:3002/health

# Restart service if needed
npm run start:kiosk
```

#### 2. Session Timeout Issues
**Error:** Session not expiring correctly
**Solution:**
- Check session manager configuration
- Verify countdown timer implementation
- Review session cleanup logic

#### 3. Hardware Communication Failures
**Error:** Locker operations failing
**Solution:**
- Check hardware status endpoint
- Verify Modbus communication
- Test with hardware diagnostic scripts

#### 4. Turkish Message Validation
**Error:** Error messages not in Turkish
**Solution:**
- Review error message catalog
- Check i18n implementation
- Verify message display logic

### Debug Mode

Enable debug logging for detailed test output:
```bash
# Set debug environment
export DEBUG=true
export LOG_LEVEL=debug

# Run tests with verbose output
node scripts/run-card-assignment-tests.js --verbose
```

### Test Environment Validation

Before running tests, validate the environment:
```bash
# Check service health
node scripts/run-card-assignment-tests.js --check-health

# Validate hardware status
curl http://192.168.1.8:3002/api/hardware/status

# Test basic connectivity
curl http://192.168.1.8:3002/api/session/status?kiosk_id=kiosk-1
```

## Continuous Integration

### Automated Test Execution

```yaml
# Example CI configuration
test_card_assignment:
  script:
    - npm run start:kiosk &
    - sleep 10  # Wait for service startup
    - node scripts/run-card-assignment-tests.js
    - npm run test:ui  # Run unit tests
  artifacts:
    reports:
      junit: test-results.xml
    paths:
      - coverage/
```

### Test Reporting

The master test runner generates comprehensive reports:
- **Success Rate:** Percentage of passed tests
- **Requirements Coverage:** Which requirements are validated
- **Performance Metrics:** Response times and resource usage
- **Error Analysis:** Detailed failure information

## Maintenance

### Regular Test Updates

1. **New Requirements:** Add test cases for new functionality
2. **API Changes:** Update test expectations for API modifications
3. **Error Messages:** Validate Turkish translations for new errors
4. **Performance Baselines:** Update performance criteria as system evolves

### Test Data Management

- **Card Registration:** Ensure test cards are registered in system
- **Locker Availability:** Maintain sufficient test lockers
- **Session Cleanup:** Regular cleanup of test sessions
- **Database State:** Reset test data between runs

This testing guide ensures comprehensive validation of the card assignment flow, providing confidence that all requirements are met and the system operates reliably in production.