# Hardware Testing Service

The Hardware Testing Service provides comprehensive testing and validation capabilities for the eForm Locker System's hardware configuration wizard. It integrates with the existing ModbusController to perform automated testing of Modbus relay cards.

## Features

- **Basic Communication Testing**: Verify Modbus connectivity and response times
- **Relay Activation Testing**: Test individual and multiple relay operations
- **Comprehensive Test Suites**: Full hardware validation with detailed reporting
- **Reliability Testing**: Stress testing and endurance validation
- **System Integration Validation**: End-to-end system health checks
- **Real-time Progress Reporting**: Event-driven progress updates
- **Error Handling**: Comprehensive error reporting and recovery guidance

## Requirements Fulfilled

- **4.1**: Basic communication testing with response time measurement
- **4.2**: Individual relay testing with physical click confirmation
- **4.3**: Comprehensive test suites combining all test types
- **4.4**: Real-time test results with pass/fail indicators
- **4.5**: Detailed test reporting and analysis
- **4.6**: System integration validation and troubleshooting

## Usage

### Basic Setup

```typescript
import { HardwareTestingService } from './hardware-testing-service';
import { ModbusConfig } from '../../app/kiosk/src/hardware/modbus-controller';

const testingService = new HardwareTestingService();

const config: ModbusConfig = {
  port: '/dev/ttyUSB0',
  baudrate: 9600,
  timeout_ms: 5000,
  pulse_duration_ms: 400,
  burst_duration_seconds: 2,
  burst_interval_ms: 100,
  command_interval_ms: 300,
  test_mode: true // Important: Enable test mode
};

await testingService.initialize(config);
```

### Communication Testing

```typescript
// Test basic communication
const commResult = await testingService.testCommunication(1);
console.log(`Communication: ${commResult.success ? 'PASS' : 'FAIL'}`);

// Measure response time
const responseTime = await testingService.measureResponseTime(1);
console.log(`Response time: ${responseTime}ms`);
```

### Relay Testing

```typescript
// Test individual relay
const relayResult = await testingService.testRelayActivation(1, 5);
console.log(`Relay 5: ${relayResult.success ? 'PASS' : 'FAIL'}`);

// Test default relays (1, 8, 16) as per requirements
const relayResults = await testingService.testAllRelays(1);
console.log(`Relay tests: ${relayResults.filter(r => r.success).length}/${relayResults.length} passed`);

// Test all 16 relays
const allRelayResults = await testingService.testAllRelays(1, { includeAllRelays: true });
```

### Comprehensive Testing

```typescript
// Run full hardware test suite
const testSuite = await testingService.runFullHardwareTest(1);
console.log(`Overall success: ${testSuite.overallSuccess}`);
console.log(`Tests: ${testSuite.passedTests}/${testSuite.totalTests} passed`);

// Validate system integration
const integrationResult = await testingService.validateSystemIntegration();
console.log(`System healthy: ${integrationResult.systemHealthy}`);

// Reliability testing
const reliabilityResult = await testingService.testReliability(1, 20);
console.log(`Reliability: ${(reliabilityResult.reliability * 100).toFixed(2)}%`);
```

## Event Handling

The service emits various events for real-time monitoring:

```typescript
// Test progress events
testingService.on('test_completed', (data) => {
  console.log(`Test completed: ${data.testName} - ${data.success ? 'PASS' : 'FAIL'}`);
});

// Relay test progress
testingService.on('relay_test_progress', (data) => {
  console.log(`Progress: ${data.completedTests}/${data.totalTests}`);
});

// Reliability test progress
testingService.on('reliability_test_progress', (data) => {
  console.log(`Iteration ${data.iteration}: ${data.success ? 'PASS' : 'FAIL'} (${data.responseTime}ms)`);
});

// Error events
testingService.on('error', (data) => {
  console.error(`Error: ${data.error}`);
});
```

## API Reference

### Core Methods

#### `initialize(config: ModbusConfig): Promise<void>`
Initialize the testing service with Modbus configuration.

#### `testCommunication(address: number, options?: CommunicationTestOptions): Promise<TestResult>`
Test basic Modbus communication with a device.

**Options:**
- `timeout`: Communication timeout (default: 5000ms)
- `retries`: Number of retry attempts (default: 3)
- `includeResponseTime`: Include response time in results (default: true)

#### `measureResponseTime(address: number): Promise<number>`
Measure response time for performance benchmarking.

#### `testRelayActivation(address: number, relay: number, options?: RelayTestOptions): Promise<TestResult>`
Test individual relay activation.

**Options:**
- `pulseDuration`: Relay pulse duration (default: 400ms)
- `confirmationRequired`: Require user confirmation (default: false)

#### `testAllRelays(address: number, options?: RelayTestOptions): Promise<TestResult[]>`
Test multiple relays on a card.

**Options:**
- `testRelays`: Specific relays to test (default: [1, 8, 16])
- `includeAllRelays`: Test all 16 relays (default: false)
- `pulseDuration`: Relay pulse duration (default: 400ms)
- `confirmationRequired`: Require user confirmation (default: false)

#### `runFullHardwareTest(address: number): Promise<TestSuite>`
Run comprehensive hardware test combining all test types.

#### `validateSystemIntegration(): Promise<IntegrationResult>`
Validate system integration for end-to-end verification.

#### `testReliability(address: number, iterations?: number, options?: ReliabilityTestOptions): Promise<ReliabilityResult>`
Test reliability with stress testing and endurance validation.

**Options:**
- `delayBetweenTests`: Delay between test iterations (default: 1000ms)
- `includeStressTest`: Include concurrent stress testing (default: false)
- `maxConcurrentTests`: Maximum concurrent tests for stress testing (default: 1)

#### `cleanup(): Promise<void>`
Clean up resources and close connections.

### Data Types

#### `TestResult`
```typescript
interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  details: string;
  error?: string;
  timestamp: Date;
  responseTime?: number;
  retryCount?: number;
}
```

#### `TestSuite`
```typescript
interface TestSuite {
  address: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestResult[];
  overallSuccess: boolean;
  duration: number;
  timestamp: Date;
}
```

#### `ReliabilityResult`
```typescript
interface ReliabilityResult {
  address: number;
  totalIterations: number;
  successfulIterations: number;
  failedIterations: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  errorRate: number;
  reliability: number; // 0-1 scale
  errors: string[];
}
```

#### `IntegrationResult`
```typescript
interface IntegrationResult {
  systemHealthy: boolean;
  servicesRunning: boolean;
  configurationValid: boolean;
  hardwareResponding: boolean;
  lockersAccessible: boolean;
  issues: string[];
  recommendations: string[];
}
```

## Integration with Hardware Configuration Wizard

The service is designed to integrate seamlessly with the hardware configuration wizard:

### Step 4: Testing and Validation

1. **Communication Test**: Verify basic Modbus connectivity
2. **Relay Tests**: Test relays 1, 8, and 16 as per requirements
3. **Comprehensive Validation**: Run full test suite
4. **Integration Check**: Validate system integration

```typescript
// Wizard Step 4 implementation
async function wizardStep4Testing(cardAddress: number) {
  const testingService = new HardwareTestingService();
  await testingService.initialize(config);

  // Step 4.1: Communication test
  const commTest = await testingService.testCommunication(cardAddress);
  if (!commTest.success) {
    throw new Error('Communication test failed');
  }

  // Step 4.2: Relay tests
  const relayTests = await testingService.testAllRelays(cardAddress, {
    testRelays: [1, 8, 16]
  });
  
  // Step 4.3: Full validation
  const fullTest = await testingService.runFullHardwareTest(cardAddress);
  
  return fullTest.overallSuccess;
}
```

## Error Handling

The service provides comprehensive error handling:

- **Communication Errors**: Timeout, connection failures, device not responding
- **Hardware Errors**: Relay activation failures, hardware malfunctions
- **Configuration Errors**: Invalid parameters, service not initialized
- **System Errors**: Resource conflicts, permission issues

All errors include detailed messages and suggested recovery actions.

## Testing

Run the test suite:

```bash
npm test shared/services/__tests__/hardware-testing-service.test.ts
```

## Examples

See `hardware-testing-example.ts` for comprehensive usage examples including:

- Basic hardware testing
- Comprehensive test suites
- Reliability testing
- System integration validation
- Wizard integration patterns

## Dependencies

- **ModbusController**: Core Modbus communication
- **SerialPort**: Serial communication (via ModbusController)
- **EventEmitter**: Event-driven architecture

## Configuration

The service uses the same configuration as ModbusController with the addition of:

- `test_mode: true`: Prevents conflicts with production queue processor
- Standard Modbus RTU settings for Waveshare relay cards

## Performance

- **Communication Tests**: < 1 second per test
- **Relay Tests**: < 2 seconds per relay (including pulse duration)
- **Full Test Suite**: < 30 seconds for complete validation
- **Reliability Tests**: Configurable duration based on iteration count

## Troubleshooting

### Common Issues

1. **Service Not Initialized**: Ensure `initialize()` is called before testing
2. **Port Access**: Verify serial port permissions and availability
3. **Hardware Not Responding**: Check power supply and connections
4. **Test Mode**: Always use `test_mode: true` to prevent conflicts

### Debug Logging

Enable debug logging by listening to service events:

```typescript
testingService.on('test_completed', console.log);
testingService.on('error', console.error);
testingService.on('relay_test_progress', console.log);
```

## License

Part of the eForm Locker System - see main project license.