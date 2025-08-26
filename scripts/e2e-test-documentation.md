# End-to-End Testing Documentation for Admin Panel Relay Control

## Overview

This document describes the comprehensive end-to-end testing suite for the Admin Panel Relay Control feature. The tests validate the complete flow from staff login to physical locker opening, ensuring all components work together correctly.

## Test Coverage

### 1. Complete User Flow Testing
- **Staff Authentication**: Login process and session management
- **Kiosk Selection**: Interface for selecting target kiosk
- **Single Locker Open**: Individual locker opening with physical verification
- **Bulk Locker Open**: Multiple locker operations with timing validation
- **UI Feedback**: Success/error messages and status updates

### 2. Hardware Integration Testing
- **Modbus Controller**: RS-485 communication with relay cards
- **Relay Operations**: Physical relay pulsing and timing validation
- **Card Communication**: Testing both relay cards (addresses 1 and 2)
- **Error Handling**: Hardware failure scenarios and recovery

### 3. Service Integration Testing
- **Command Queue**: Proper command enqueueing and processing
- **Service Communication**: Gateway, kiosk, and panel coordination
- **Database Updates**: Locker state synchronization
- **Logging**: Comprehensive audit trail validation

### 4. Error Scenario Testing
- **Invalid Input**: Bad locker IDs, missing kiosks
- **Authentication**: Unauthorized access attempts
- **Hardware Failures**: Modbus timeouts and communication errors
- **Concurrent Operations**: Command collision handling

## Test Scripts

### Main Test Runner

#### Linux/macOS (Raspberry Pi)
```bash
# Set Modbus port if needed
export MODBUS_PORT=/dev/ttyAMA0

# Run comprehensive tests
npm run test:e2e:full
# Or directly
./scripts/test-admin-panel-e2e.sh
```

#### Windows
```powershell
# Set Modbus port if needed
$env:MODBUS_PORT = "COM3"

# Run comprehensive tests
npm run test:e2e:full
# Or directly
powershell -ExecutionPolicy Bypass -File scripts/test-admin-panel-e2e.ps1
```

### Individual Test Components
```bash
# Validate setup first
node scripts/validate-e2e-setup.js

# Admin panel functionality tests
npm run test:e2e:admin-panel

# Hardware validation tests
MODBUS_PORT=/dev/ttyUSB0 npm run test:e2e:hardware

# UI feedback validation
npm run test:e2e:ui
```

## Test Requirements

### Prerequisites
- Node.js 20+ installed
- All services running (Gateway, Kiosk, Admin Panel)
- Hardware properly connected (for hardware tests)
- Test database with sample data

### Service Ports
- **Gateway Service**: http://localhost:3000
- **Kiosk Service**: http://localhost:3001  
- **Admin Panel**: http://localhost:3003

### Hardware Requirements (for hardware tests)
- Waveshare 16-channel relay cards
- RS-485 to USB converter
- Proper DIP switch configuration:
  - Card 1: Address 1 (DIP 1-4: ON,OFF,OFF,OFF)
  - Card 2: Address 2 (DIP 1-4: OFF,ON,OFF,OFF)
  - Both cards: DIP 9=OFF (9600 baud), DIP 10=OFF (no parity)

### Environment Variables
- **MODBUS_PORT**: Serial port for Modbus communication (default: `/dev/ttyUSB0`)
  - Raspberry Pi GPIO: `/dev/ttyAMA0`
  - USB converter: `/dev/ttyUSB0`
  - Mock for CI: `/dev/null`

## Test Scenarios

### 1. Single Locker Open Flow
```
1. Staff logs into admin panel
2. Selects target kiosk
3. Clicks "Open" on available locker
4. System enqueues 'open_locker' command
5. Kiosk service processes command
6. Modbus controller pulses relay (400ms)
7. Database updated with new locker state
8. UI shows success message and refreshes
```

**Validation Points**:
- Command properly enqueued with staff_user, reason, timestamp
- Physical relay activation confirmed
- Database state matches physical state
- UI feedback displayed correctly
- Logging includes all required fields

### 2. Bulk Locker Open Flow
```
1. Staff selects multiple lockers (3 test lockers)
2. Initiates bulk open with 1000ms interval
3. System enqueues 'bulk_open' command
4. Kiosk processes each locker sequentially
5. 1000ms delay between each operation
6. All lockers opened with proper timing
7. UI shows bulk operation success
```

**Validation Points**:
- Timing validation (within 20% of expected duration)
- Sequential processing confirmed
- All selected lockers processed
- Bulk operation logging
- UI feedback for bulk operations

### 3. Error Scenario Testing
```
1. Invalid locker ID (999) → 400 Bad Request
2. Missing kiosk ID → 400 Bad Request  
3. Unauthorized access → 401 Unauthorized
4. Hardware failure → Proper error handling
5. Concurrent commands → Command collision prevention
```

**Validation Points**:
- Appropriate HTTP status codes
- Clear error messages
- No database corruption
- Proper error logging
- UI error feedback

## Test Results and Reporting

### Test Output
The test suite provides detailed console output with:
- ✅ Success indicators for passed tests
- ❌ Error indicators with detailed messages
- ⚠️ Warnings for non-critical issues
- 📊 Summary statistics

### Test Report
A comprehensive JSON report is generated at:
```
scripts/e2e-test-report.json
```

Report includes:
- Test execution timestamp
- Pass/fail statistics
- Detailed error information
- Performance metrics
- Recommendations for failures

### Screenshots (UI Tests)
UI validation tests capture screenshots for debugging:
```
logs/screenshots/
├── login-success-[timestamp].png
├── locker-selection-[timestamp].png
├── single-open-[timestamp].png
├── bulk-open-[timestamp].png
└── error-scenarios-[timestamp].png
```

## Troubleshooting

### Common Issues

#### Services Not Running
```
Error: ECONNREFUSED localhost:3003
```
**Solution**: Start all services before running tests
```bash
npm run start:gateway
npm run start:kiosk  
npm run start:panel
```

#### Hardware Communication Failure
```
Error: Modbus timeout - check RS-485 wiring
```
**Solution**: 
1. Verify RS-485 converter connection
2. Check DIP switch settings
3. Ensure relay cards are powered
4. Test with `npm run test:hardware`

#### Authentication Failure
```
Error: Login failed: 401 - Invalid credentials
```
**Solution**: 
1. Verify test credentials in database
2. Check session management configuration
3. Ensure CSRF protection is properly configured

#### Database Issues
```
Error: SQLITE_BUSY: database is locked
```
**Solution**:
1. Ensure no other processes are using the database
2. Check database file permissions
3. Restart all services

### Debug Mode
Run tests with verbose output:
```powershell
scripts/test-admin-panel-e2e.ps1 -Verbose
```

### Skip Hardware Tests
For software-only testing:
```powershell
scripts/test-admin-panel-e2e.ps1 -SkipHardware
```

## Performance Benchmarks

### Expected Timing
- **Single locker open**: < 2 seconds end-to-end
- **Bulk open (3 lockers, 1000ms interval)**: 3-4 seconds
- **Command processing**: < 500ms per command
- **UI feedback**: < 1 second response time

### Success Criteria
- **Pass Rate**: > 95% for all test scenarios
- **Hardware Tests**: 100% success for relay operations
- **Timing Validation**: Within 20% of expected durations
- **Error Handling**: All error scenarios properly handled

## Continuous Integration

### Automated Testing
The test suite can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run E2E Tests
  run: |
    npm install
    npm run start &
    sleep 10
    npm run test:e2e:admin-panel
```

### Test Environment
- Use dedicated test database
- Mock hardware for CI environments
- Isolated service instances
- Automated cleanup after tests

## Maintenance

### Regular Testing Schedule
- **Daily**: Automated software tests
- **Weekly**: Full hardware validation
- **Before Deployment**: Complete test suite
- **After Updates**: Regression testing

### Test Data Management
- Reset test database before each run
- Use consistent test locker IDs
- Clean up command queue between tests
- Maintain test user accounts

### Test Updates
Update tests when:
- New features are added
- API endpoints change
- Hardware configuration changes
- Error handling is modified

## Requirements Validation

This test suite validates all requirements from the specification:

### Requirement 1.1 - Physical Locker Opening
✅ **Validated**: Tests confirm Modbus commands are sent and relays pulse

### Requirement 1.5 - UI Feedback  
✅ **Validated**: Success messages and status updates are verified

### Requirement 1.6 - Logging
✅ **Validated**: Staff user, reason, and timestamps are logged

### Requirement 1.7 - Timing
✅ **Validated**: 400ms pulse duration and bulk intervals are confirmed

### Requirement 2.7 - Command Status
✅ **Validated**: Command status polling endpoint is tested

### Requirement 3.8 - Hardware Integration
✅ **Validated**: Complete hardware validation with DIP switch verification

## Conclusion

This comprehensive test suite ensures the Admin Panel Relay Control feature works correctly across all components - from user interface to physical hardware. Regular execution of these tests provides confidence in the system's reliability and helps catch issues before they affect production operations.