# Hardware Configuration Wizard - Test Suite Documentation

## Overview

This document describes the comprehensive test suite for the Hardware Configuration Wizard, covering unit tests, integration tests, and end-to-end tests with hardware simulation, accessibility validation, and responsive design testing.

## Test Structure

```
tests/
├── unit/
│   └── wizard-services.test.ts          # Unit tests for all wizard services
├── integration/
│   └── hardware-wizard-api.test.ts      # API endpoint integration tests
├── e2e/
│   └── hardware-wizard-flow.test.ts     # End-to-end wizard flow tests
├── helpers/
│   └── test-server.ts                   # Test server helper utilities
└── run-all-tests.ts                     # Test runner script
```

## Test Categories

### 1. Unit Tests (`tests/unit/wizard-services.test.ts`)

**Coverage**: All wizard services with mock hardware interfaces
**Requirements**: Service layer requirements (1.1-10.6)

**Test Suites**:
- `HardwareDetectionService` - Serial port scanning, device discovery, type identification
- `SlaveAddressService` - Address configuration, broadcast commands, CRC16 calculation
- `HardwareTestingService` - Communication testing, relay activation, comprehensive test suites
- `WizardOrchestrationService` - Session management, step validation, execution
- `ErrorHandler` - Error classification, recovery actions, troubleshooting steps

**Key Features**:
- Mock hardware interfaces for reliable testing
- Edge case and error condition validation
- Service integration testing
- Memory pressure and concurrent operation testing
- Requirements validation mapping

### 2. Integration Tests (`tests/integration/hardware-wizard-api.test.ts`)

**Coverage**: All API endpoints with database integration and WebSocket communication
**Requirements**: API layer requirements (1.1-10.6)

**Test Suites**:
- Hardware Detection API Endpoints
- Slave Address Management API Endpoints  
- Hardware Testing API Endpoints
- Wizard Session Management API Endpoints
- Advanced Configuration API Endpoints
- WebSocket Real-Time Communication
- Database Integration
- Error Handling and Edge Cases

**Key Features**:
- Real database integration with test data
- WebSocket communication testing
- Session state persistence validation
- Configuration audit logging
- Concurrent operation handling
- Malformed request handling

### 3. End-to-End Tests (`tests/e2e/hardware-wizard-flow.test.ts`)

**Coverage**: Complete wizard workflows with hardware simulation
**Requirements**: User interface requirements (2.1-9.6)

**Test Suites**:
- Complete Wizard Flow
- Error Scenarios and Recovery
- Hardware Simulation
- Accessibility Testing
- Responsive Design Testing
- Performance Testing
- Browser Compatibility

**Key Features**:
- Playwright-based browser automation
- Hardware simulation with configurable devices
- Accessibility compliance validation (WCAG 2.1)
- Responsive design testing (mobile, tablet, desktop)
- Performance benchmarking
- Cross-browser compatibility testing

## Running Tests

### All Tests
```bash
npm run test:wizard
```

### Individual Test Suites
```bash
# Unit tests only
npm run test:wizard:unit

# Integration tests only
npm run test:wizard:integration

# End-to-end tests only
npm run test:wizard:e2e

# Watch mode for development
npm run test:wizard:watch

# Coverage report
npm run test:wizard:coverage
```

### Playwright E2E Tests
```bash
# Run all E2E tests
npx playwright test

# Run specific test file
npx playwright test tests/e2e/hardware-wizard-flow.test.ts

# Run with UI mode
npx playwright test --ui

# Run specific browser
npx playwright test --project=chromium

# Generate report
npx playwright show-report
```

## Test Configuration

### Vitest Configuration
- Uses existing project Vitest configuration
- Mock implementations for external dependencies
- Test timeout: 60 seconds for unit tests, 120 seconds for integration tests

### Playwright Configuration
- Multi-browser testing (Chrome, Firefox, Safari, Edge)
- Mobile and tablet device simulation
- Automatic screenshot and video capture on failure
- HTML and JSON reporting
- Parallel test execution

## Hardware Simulation

The test suite includes a comprehensive hardware simulator that can:

- **Add/Remove Devices**: Simulate different relay card configurations
- **Device Types**: Support for Waveshare 16CH, 8CH, and generic devices
- **Response Simulation**: Configurable response times and timeouts
- **Error Scenarios**: Simulate communication failures, address conflicts
- **Real-time Updates**: Mock WebSocket events for progress updates

### Example Usage
```typescript
const simulator = new HardwareSimulator();
simulator.addDevice(1, 'waveshare_16ch');
simulator.addDevice(2, 'waveshare_8ch');
simulator.simulateTimeout(1); // Device 1 won't respond
```

## Accessibility Testing

### WCAG 2.1 Compliance
- **Level AA** compliance validation
- Keyboard navigation testing
- Screen reader compatibility
- Color contrast validation
- Focus management
- ARIA label verification

### Test Coverage
- Keyboard-only navigation through entire wizard
- Screen reader announcements for state changes
- High contrast mode compatibility
- Focus trap validation in modal dialogs
- Alternative text for images and icons

## Responsive Design Testing

### Device Coverage
- **Desktop**: 1920x1080, 1366x768
- **Tablet**: iPad Pro (1024x1366), iPad (768x1024)
- **Mobile**: iPhone 12 (390x844), iPhone SE (375x667)
- **Small Screens**: 320x568 minimum

### Test Scenarios
- Layout adaptation across breakpoints
- Touch interaction compatibility
- Orientation change handling
- Content accessibility on small screens
- Performance on mobile devices

## Performance Testing

### Metrics Tracked
- **Load Time**: Wizard initialization < 3 seconds
- **Interaction Response**: Button clicks < 200ms
- **Scan Operations**: Device scanning < 30 seconds
- **Memory Usage**: < 100MB for large datasets
- **Network Requests**: Optimized API call patterns

### Test Scenarios
- Large device datasets (100+ devices)
- Rapid user interactions
- Concurrent operations
- Memory pressure testing
- Network timeout handling

## Error Scenarios

### Comprehensive Error Testing
- **Serial Port Errors**: Not found, permission denied, device busy
- **Communication Errors**: Timeouts, CRC failures, device not responding
- **Address Conflicts**: Duplicate addresses, invalid ranges
- **System Integration**: Configuration failures, service unavailability
- **User Errors**: Invalid inputs, incomplete steps, cancellation

### Recovery Testing
- **Automatic Recovery**: Retry mechanisms, fallback options
- **Manual Recovery**: User-guided troubleshooting steps
- **Rollback Scenarios**: Configuration restoration, session cleanup
- **Error Reporting**: User-friendly messages, technical details

## Test Data Management

### Database Setup
- **Test Database**: Isolated SQLite database for testing
- **Schema Migration**: Automatic test schema setup
- **Data Cleanup**: Automatic cleanup between tests
- **Seed Data**: Consistent test data for reproducible results

### Mock Data
- **Hardware Responses**: Realistic Modbus response patterns
- **Configuration Data**: Valid system configurations
- **Session Data**: Complete wizard session states
- **Error Conditions**: Comprehensive error scenarios

## Continuous Integration

### GitHub Actions Integration
```yaml
name: Hardware Wizard Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:wizard
      - uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-results/
```

### Test Reporting
- **HTML Reports**: Interactive test results with screenshots
- **JSON Reports**: Machine-readable results for CI/CD
- **Coverage Reports**: Code coverage metrics and trends
- **Performance Reports**: Response time and resource usage metrics

## Debugging Tests

### Debug Mode
```bash
# Run with debug output
DEBUG=1 npm run test:wizard

# Run specific test with verbose output
npm run test:wizard:unit -- --reporter=verbose

# Run E2E tests with browser UI
npx playwright test --debug
```

### Test Artifacts
- **Screenshots**: Automatic capture on test failures
- **Videos**: Full test execution recordings
- **Traces**: Detailed execution traces for debugging
- **Logs**: Comprehensive logging for troubleshooting

## Best Practices

### Writing Tests
1. **Descriptive Names**: Clear test descriptions that explain the scenario
2. **Isolated Tests**: Each test should be independent and repeatable
3. **Realistic Data**: Use realistic test data that matches production scenarios
4. **Error Handling**: Test both success and failure paths
5. **Performance**: Include performance assertions where appropriate

### Maintaining Tests
1. **Regular Updates**: Keep tests updated with feature changes
2. **Flaky Test Management**: Identify and fix unreliable tests
3. **Coverage Monitoring**: Maintain high test coverage for critical paths
4. **Documentation**: Keep test documentation current and comprehensive

## Troubleshooting

### Common Issues
1. **Port Conflicts**: Ensure test ports are available
2. **Timeout Issues**: Adjust timeouts for slower environments
3. **Browser Issues**: Update Playwright browsers regularly
4. **Mock Issues**: Verify mock implementations match real behavior

### Getting Help
- Check test logs in `test-results/` directory
- Review Playwright trace files for E2E test failures
- Use debug mode for detailed execution information
- Consult test documentation for specific test requirements

## Requirements Traceability

### Unit Test Coverage
- **1.1-1.6**: Hardware detection service requirements
- **3.1-3.6**: Slave address management requirements
- **4.1-4.6**: Hardware testing service requirements
- **2.1-2.7**: Wizard orchestration requirements
- **7.1-7.7**: Error handling requirements

### Integration Test Coverage
- **API Endpoints**: All wizard API endpoints (1.1-10.6)
- **Database Integration**: Session and audit logging
- **WebSocket Communication**: Real-time updates
- **Configuration Management**: System integration

### E2E Test Coverage
- **2.1-2.7**: Complete wizard workflow
- **9.1-9.6**: User interface and accessibility
- **10.1-10.6**: Performance and reliability
- **Error Recovery**: Comprehensive error scenarios

This test suite provides comprehensive validation of all Hardware Configuration Wizard functionality, ensuring reliability, accessibility, and performance across all supported platforms and use cases.