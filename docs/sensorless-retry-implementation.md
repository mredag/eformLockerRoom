# Sensorless Retry Handler Implementation

## Overview

The Sensorless Retry Handler implements intelligent locker opening with automatic retry detection for smart locker assignment systems that lack door sensors. It uses card scan timing patterns to detect when a retry is needed and provides a single retry attempt with proper timing budget enforcement.

## Requirements Implemented

### Requirement 6.1: Pulse and Wait Logic

- ✅ Implements relay pulse followed by open window detection
- ✅ Handles both successful first attempts and retry scenarios
- ✅ Proper timing coordination between hardware and detection logic

### Requirement 6.2: Open Window Detection

- ✅ Detects retry need based on card scan timing during open window
- ✅ Records card scans with timestamps for pattern analysis
- ✅ Configurable open window duration (default: 10 seconds)

### Requirement 6.3: Single Retry with Backoff

- ✅ Enforces exactly one retry attempt per open operation
- ✅ Implements configurable backoff delay (default: 500ms)
- ✅ Prevents multiple retry attempts on same operation

### Requirement 6.4: Timing Budget Enforcement

- ✅ Calculates maximum duration: pulse + window + backoff + pulse
- ✅ Enforces timing constraints to prevent operations exceeding budget
- ✅ Skips retry if insufficient time remaining in budget

### Requirement 6.5: Turkish Message Display

- ✅ "Tekrar deneniyor." - Shown only during retry window
- ✅ "Dolabınız açıldı. Eşyalarınızı yerleştirin." - Success message
- ✅ "Şu an işlem yapılamıyor." - Failure message

## Architecture

### Core Components

#### SensorlessRetryHandler

- Main service class managing retry logic
- Event-driven architecture for message display
- Configurable parameters for different hardware setups
- Thread-safe operation tracking per locker

#### ModbusController Integration

- Enhanced `openLockerWithSensorlessRetry()` method
- Card scan recording via `recordCardScan()`
- Message event forwarding for UI display
- Configuration hot-reload support

#### UI Controller Integration

- Automatic card scan recording on RFID events
- Smart assignment mode integration
- Message display event handling
- Seamless fallback to manual mode

### Configuration

```typescript
interface SensorlessConfig {
  pulse_ms: number; // Relay pulse duration (800ms)
  open_window_seconds: number; // Detection window (10 seconds)
  retry_backoff_ms: number; // Retry delay (500ms)
  retry_count: number; // Always 1 for single retry
}
```

### Default Configuration

- **Pulse Duration**: 800ms (200-2000ms range, increased from 400ms for smart assignment)
- **Open Window**: 10 seconds (5-20 seconds range, sufficient for user reaction time)
- **Retry Backoff**: 500ms (200-1000ms range, prevents hardware stress)
- **Retry Count**: 1 (always enforced, rejects values > 1)

## Usage Examples

### Basic Usage

```typescript
const handler = createSensorlessRetryHandler({
  pulse_ms: 800,
  open_window_seconds: 10,
  retry_backoff_ms: 500,
  retry_count: 1,
});

const result = await handler.openWithRetry(lockerId, cardId, pulseFunction);
```

### Integration with ModbusController

```typescript
// Record card scan for retry detection
modbusController.recordCardScan(cardId);

// Open with sensorless retry
const result = await modbusController.openLockerWithSensorlessRetry(
  lockerId,
  cardId
);

// Handle result
if (result.success) {
  console.log(`Opened: ${result.message} (${result.action})`);
} else {
  console.error(`Failed: ${result.message}`);
}
```

### Message Handling

```typescript
modbusController.on("sensorless_message", (event) => {
  displayMessage(event.message, event.type);
});
```

## Flow Diagram

```
Card Scan → Record Timestamp
    ↓
Start Open Attempt
    ↓
Send Pulse → Wait for Open Window (10s)
    ↓
Check for Card Scans During Window
    ↓
┌─ No Scans ────────────────┐    ┌─ Scans Detected ─────────┐
│   Return Success/Failure  │    │   Show "Tekrar deneniyor." │
└───────────────────────────┘    │   Wait Backoff (500ms)    │
                                 │   Send Retry Pulse        │
                                 │   Return Success/Failure  │
                                 └───────────────────────────┘
```

## Timing Budget Calculation

Maximum Duration = `pulse_ms + (open_window_seconds × 1000) + retry_backoff_ms + pulse_ms`

Example with defaults:

- First Pulse: 800ms
- Open Window: 10,000ms
- Retry Backoff: 500ms
- Retry Pulse: 800ms
- **Total Maximum**: 12,100ms

## Error Handling

### Hardware Errors

- Graceful handling of pulse function failures
- Proper cleanup of attempt records
- Error message display in Turkish

### Timing Violations

- Skip retry if insufficient budget remaining
- Enforce maximum duration constraints
- Log timing violations for monitoring

### Concurrent Operations

- Per-locker mutex prevents conflicts
- Support for multiple simultaneous operations on different lockers
- Proper cleanup on operation completion

## Testing

### Unit Tests

- Complete test coverage for all requirements
- Mock-based testing with fake timers
- Edge case validation (timing, errors, concurrency)

### Integration Tests

- ModbusController integration validation
- Message event flow testing
- Configuration hot-reload verification

### Demonstration Script

```bash
node scripts/test-sensorless-retry.js
```

## Performance Considerations

### Memory Management

- Automatic cleanup of old card scan records
- Bounded attempt tracking per locker
- Event listener cleanup on shutdown

### Hardware Efficiency

- Single retry only to prevent hardware stress
- Proper timing intervals between commands
- Mutex-based concurrency control

### Monitoring

- Comprehensive logging for debugging
- Performance metrics tracking
- Health status integration

## Configuration Management

### Hot Reload Support

```typescript
// Update configuration without restart
modbusController.updateSensorlessConfig({
  pulse_ms: 1000,
  open_window_seconds: 15,
});
```

### Environment-Specific Tuning

- Development: Shorter windows for faster testing
- Production: Standard timing for reliability
- High-traffic: Optimized for throughput

## Integration Points

### Smart Assignment Engine

- Seamless integration with assignment logic
- Automatic retry handling for assigned lockers
- Proper error propagation and cleanup

### Rate Limiting

- Respects existing rate limiting rules
- Single retry doesn't violate rate limits
- Proper command interval enforcement

### Feature Flags

- Works with smart assignment feature flag
- Graceful fallback to manual mode
- No impact on existing functionality

## Monitoring and Alerts

### Key Metrics

- Retry rate percentage
- Timing budget violations
- Hardware failure correlation
- Message display effectiveness

### Logging

- Structured logging for all operations
- Performance timing data
- Error correlation and debugging

### Health Checks

- Integration with existing health monitoring
- Retry handler status validation
- Configuration consistency checks

## Future Enhancements

### Potential Improvements

- Machine learning for retry prediction
- Adaptive timing based on usage patterns
- Enhanced error recovery strategies
- Multi-language message support

### Scalability

- Support for multiple retry strategies
- Configurable retry algorithms
- Advanced timing budget management
- Hardware-specific optimizations

## Conclusion

The Sensorless Retry Handler successfully implements all requirements (6.1-6.5) for intelligent locker opening without door sensors. It provides:

- ✅ Reliable retry detection using card scan timing
- ✅ Single retry with proper timing budget enforcement
- ✅ Turkish language message display
- ✅ Seamless integration with existing systems
- ✅ Comprehensive error handling and monitoring
- ✅ Production-ready performance and reliability

The implementation is ready for deployment and provides a solid foundation for smart locker assignment systems requiring sensorless operation.
