# AlertManager Implementation Summary

## Overview

The AlertManager service provides comprehensive monitoring and alerting capabilities for the smart locker assignment system. It implements threshold-based monitoring with automatic alert generation, persistence, and clearing functionality. The service integrates with ConfigurationManager for hot-reloadable thresholds, enforces single alert per breach, implements proper hysteresis, and provides REST API endpoints with authentication and CSRF protection.

## Key Features

### 1. Alert Generation and Management
- **Single Alert Per Breach**: Enforces one active alert per type/kiosk to prevent duplicates
- **Alert Persistence**: Stores alerts in SQLite database with proper status tracking
- **Alert Clearing**: Manual and automatic alert clearing with hysteresis enforcement
- **Severity Classification**: Calculates alert severity (low, medium, high, critical) based on threshold exceedance
- **PII Sanitization**: Removes sensitive data (card IDs, seeds, payloads) from alert data

### 2. Threshold Monitoring
Implements monitoring for all required alert types:
- **no_stock**: Monitors no-stock events (>3 events in 10 minutes)
- **conflict_rate**: Monitors assignment conflicts (>2% rate in 5 minutes)
- **open_fail_rate**: Monitors locker open failures (>1% rate in 10 minutes)
- **retry_rate**: Monitors retry events (>5% rate in 5 minutes)
- **overdue_share**: Monitors overdue locker percentage (≥20% in 10 minutes)

### 3. Auto-Clear Conditions
Each alert type has specific auto-clear conditions:
- **no_stock**: <2 events in 10 minutes after 20 minutes wait
- **conflict_rate**: <1% rate in 10 minutes
- **open_fail_rate**: <0.5% rate in 20 minutes
- **retry_rate**: <3% rate in 10 minutes
- **overdue_share**: <10% in 20 minutes

### 4. Configuration Management
- **ConfigurationManager Integration**: Uses ConfigurationManager for threshold configuration
- **Hot-Reload Support**: Configuration changes propagate within 3 seconds
- **Per-Kiosk Overrides**: Kiosk-specific threshold configuration via ConfigurationManager

### 5. Monitoring Control
- **Continuous Monitoring**: Configurable monitoring intervals per kiosk
- **Start/Stop Control**: Individual kiosk monitoring management
- **Event-Driven Monitoring**: Real-time threshold checking on metric updates

## Database Schema

### Tables Created
1. **alerts**: Main alert storage with status tracking (SQLite TEXT types)
2. **alert_metrics**: Time-series metric data with timestamp indexing

### Schema Features
- **SQLite Types Only**: Uses TEXT for timestamps, INTEGER for booleans
- **Composite Indexes**: Optimized for kiosk/type/status/time queries
- **Status Tracking**: 'active'/'cleared' status with proper transitions
- **IF NOT EXISTS**: Safe migration with existing database compatibility

### Key Indexes
- `idx_alerts_composite_main`: (kiosk_id, type, status, triggered_at)
- `idx_alert_metrics_composite`: (kiosk_id, metric_type, timestamp)

## API Interface

### Core Methods
```typescript
// Alert management with pagination
getAlerts(kioskId?: string, status?: string, page?: number, limit?: number): Promise<AlertListResponse>
getAlertHistory(kioskId?: string, page?: number, limit?: number): Promise<AlertListResponse>
triggerAlert(type: AlertType, data: AlertData): Promise<void>
clearAlert(alertId: string): Promise<void>

// Threshold monitoring with ConfigurationManager integration
monitorNoStock(kioskId: string): Promise<void>
monitorConflictRate(kioskId: string): Promise<void>
monitorOpenFailRate(kioskId: string): Promise<void>
monitorRetryRate(kioskId: string): Promise<void>
monitorOverdueShare(kioskId: string): Promise<void>

// Metric recording
recordMetric(kioskId: string, metricType: string, value: number, eventCount?: number): Promise<void>

// Monitoring control
startMonitoring(kioskId: string, intervalSeconds?: number): void
stopMonitoring(kioskId: string): void
shutdown(): void // Proper cleanup of timers and listeners
```

### REST API Endpoints
```typescript
// Admin routes with auth + CSRF protection
GET /api/admin/alerts?kiosk_id=&status=&page=&limit=
GET /api/admin/alerts/history?kiosk_id=&page=&limit=
POST /api/admin/alerts/{id}/clear

// Default pagination: page=1, limit=50
// Ordering: triggered_at DESC
// Error schema: { error: string, code: string, details?: any }
```

### Event System
```typescript
// Event emissions for real-time updates
alertManager.on('alertTriggered', (alert: Alert) => { /* handle */ });
alertManager.on('alertCleared', (alert: Alert) => { /* handle */ });
```

## Alert Types and Messages

### Alert Messages (Turkish-ready)
- **no_stock**: "No stock events exceeded threshold: X events in Y minutes"
- **conflict_rate**: "Assignment conflict rate exceeded: X% in Y minutes"
- **open_fail_rate**: "Locker open failure rate exceeded: X% in Y minutes"
- **retry_rate**: "Retry rate exceeded: X% in Y minutes"
- **overdue_share**: "Overdue locker share exceeded: X% in Y minutes"

### Severity Calculation
- **Critical**: actualValue ≥ threshold × 2
- **High**: actualValue ≥ threshold × 1.5
- **Medium**: actualValue ≥ threshold × 1.2
- **Low**: actualValue < threshold × 1.2

## Integration Points

### 1. Assignment Engine Integration
```typescript
// Record metrics during assignment operations
await alertManager.recordMetric(kioskId, 'conflict_rate', conflictRate);
await alertManager.recordMetric(kioskId, 'no_stock_events', 1);
```

### 2. Hardware Integration
```typescript
// Record hardware failures
await alertManager.recordMetric(kioskId, 'open_fail_rate', failureRate);
await alertManager.recordMetric(kioskId, 'retry_rate', retryRate);
```

### 3. Session Management Integration
```typescript
// Monitor overdue sessions
await alertManager.recordMetric(kioskId, 'overdue_share', overduePercentage);
```

### 4. Admin Panel Integration
```typescript
// Real-time alert display
const activeAlerts = await alertManager.checkAlerts(kioskId);
const alertHistory = await alertManager.getAlertHistory(kioskId, 50);

// Manual alert clearing
await alertManager.clearAlert(alertId);
```

## Performance Considerations

### 1. Database Optimization
- Efficient indexes for time-window queries
- Batch metric recording for high-frequency events
- Automatic cleanup of old data

### 2. Memory Management
- In-memory active alert cache
- Event-driven updates to minimize polling
- Configurable monitoring intervals

### 3. Concurrency Safety
- Thread-safe alert operations
- Database transaction safety
- Event emitter cleanup on shutdown

## Logging and Monitoring

### Log Messages (No Emojis, Exact Format)
```
Alert triggered: type=no_stock, severity=high.
Alert cleared: type=conflict_rate.
Started alert monitoring for kiosk kiosk-1 (interval: 60s)
Stopped alert monitoring for kiosk kiosk-1
Cleaned up alerts older than 30 days
```

### PII Protection
- **No Card IDs**: Never logs RFID card identifiers
- **No Seeds**: Removes cryptographic seeds from logs
- **No Raw Payloads**: Sanitizes raw data before persistence
- **Server-Side Messages**: Alert messages stay in English on server

### Metrics Tracked
- Alert trigger frequency per type
- Alert resolution time
- Threshold breach patterns
- System performance impact

## Testing Coverage

### Unit Tests
- **Single Alert Per Breach**: Prevents duplicate alerts for same type/kiosk
- **Auto-Clear Path**: Verifies hysteresis timer setup and execution
- **Pagination**: Tests paginated alert history with proper limits
- **Emitter Cleanup**: Ensures proper cleanup of listeners and timers on shutdown
- **Logging Format**: Validates exact log message format compliance
- **PII Sanitization**: Confirms removal of sensitive data from alerts

### Integration Tests
- Real database operations with proper schema
- Metric recording and querying with SQLite types
- Alert lifecycle management with status transitions
- Configuration integration with ConfigurationManager
- Cleanup operations and data retention

## Usage Examples

### Basic Setup
```typescript
const alertManager = new AlertManager(database);

// Start monitoring for a kiosk
alertManager.startMonitoring('kiosk-1', 60);

// Set up event handlers
alertManager.on('alertTriggered', (alert) => {
  console.log(`Alert: ${alert.message}`);
  // Send notification to admin
});
```

### Recording Metrics
```typescript
// Record assignment events
await alertManager.recordMetric('kiosk-1', 'no_stock_events', 1);
await alertManager.recordMetric('kiosk-1', 'conflict_rate', 0.025);

// Trigger threshold checks
await alertManager.monitorNoStock('kiosk-1');
await alertManager.monitorConflictRate('kiosk-1');
```

### Alert Management
```typescript
// Get current alerts
const alerts = await alertManager.checkAlerts('kiosk-1');

// Clear specific alert
await alertManager.clearAlert(alertId);

// Get alert history
const history = await alertManager.getAlertHistory('kiosk-1', 100);
```

## Requirements Compliance

✅ **Requirement 17.1**: no_stock events >3 in 10 minutes trigger alert, auto-clear <2 events after 20 minutes with hysteresis  
✅ **Requirement 17.2**: conflict_rate >2% in 5 minutes trigger alert, auto-clear <1% in 10 minutes with hysteresis  
✅ **Requirement 17.3**: open_fail_rate >1% in 10 minutes trigger alert, auto-clear <0.5% in 20 minutes with hysteresis  
✅ **Requirement 17.4**: retry_rate >5% in 5 minutes trigger alert, auto-clear <3% in 10 minutes with hysteresis  
✅ **Requirement 17.5**: overdue_share ≥20% in 10 minutes trigger alert, auto-clear <10% in 20 minutes with hysteresis

## Implementation Features

✅ **ConfigurationManager Integration**: Uses ConfigurationManager for thresholds with hot-reload ≤3s  
✅ **Single Alert Per Breach**: Enforces one active alert per type/kiosk combination  
✅ **Hysteresis**: Exact auto-clear windows as per spec to prevent flapping  
✅ **SQLite Schema**: Proper SQLite types with composite indexes  
✅ **REST API**: Admin routes with auth + CSRF protection and error schema  
✅ **PII Protection**: Sanitizes card IDs, seeds, and raw payloads  
✅ **Logging Format**: Exact format "Alert triggered: type=X, severity=Y." and "Alert cleared: type=X."  
✅ **Pagination**: Default page=1, limit=50, ordered by triggered_at DESC  
✅ **Proper Cleanup**: Emitter and timer cleanup on shutdown

The AlertManager service is fully implemented with all requested enhancements and ready for production integration.