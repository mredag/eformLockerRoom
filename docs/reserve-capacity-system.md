# Reserve Capacity System

## Overview

The Reserve Capacity System is a critical component of the Smart Locker Assignment feature that ensures system availability by maintaining a buffer of lockers for emergency situations and high-demand periods. This system implements intelligent capacity management with dynamic reserve allocation based on current stock levels.

## Requirements Implemented

### Requirement 13.1: Reserve Ratio Maintenance

- **Implementation**: System maintains `reserve_ratio` percentage of total available capacity as reserve
- **Formula**: `reserveRequired = Math.max(Math.ceil(totalAvailable * reserve_ratio), reserve_minimum)`
- **Default**: 10% of available lockers (minimum 2 lockers)

### Requirement 13.2: Low Stock Alert Triggering

- **Implementation**: System triggers alerts when reserve capacity drops below `reserve_minimum`
- **Condition**: `availableLockers < reserveRequired`
- **Alert Type**: `reserve_capacity_below_minimum` with high severity

### Requirement 13.3: Low Stock Reserve Disabling

- **Implementation**: Reserve is automatically disabled when stock is critically low
- **Condition**: `totalAvailable <= reserveRequired * 2`
- **Behavior**: All available lockers become assignable to maximize availability

### Requirement 13.4: Reserve Capacity Monitoring

- **Implementation**: Comprehensive monitoring with real-time status reporting
- **Metrics**: Total, available, reserved, assignable locker counts
- **Alerts**: Multiple alert types with different severity levels

### Requirement 13.5: Configuration Management

- **Implementation**: Global defaults with per-kiosk override capability
- **Hot Reload**: Configuration changes take effect within 3 seconds
- **Audit Trail**: All configuration changes are logged with timestamps

## Architecture

### Core Components

#### ReserveCapacityManager

- **Location**: `shared/services/reserve-capacity-manager.ts`
- **Purpose**: Main service for reserve capacity management
- **Key Methods**:
  - `applyReserveCapacity()`: Filter assignable lockers
  - `checkLowStockAlert()`: Monitor alert conditions
  - `getReserveCapacityStatus()`: Get current status
  - `monitorReserveCapacity()`: Generate alerts

#### Integration with Assignment Engine

- **Location**: `shared/services/assignment-engine.ts`
- **Integration Point**: `assignNewLocker()` method
- **Flow**: Available lockers → Reserve filtering → Scoring → Selection

### Configuration Schema

```typescript
interface ReserveCapacityConfig {
  reserve_ratio: number; // Percentage (0.0-1.0)
  reserve_minimum: number; // Minimum count
}
```

#### Default Configuration

```json
{
  "reserve_ratio": 0.1, // 10% (clamped 0.0-0.5)
  "reserve_minimum": 2 // 2 lockers minimum (clamped 0-10)
}
```

## Operational Logic

### Reserve Calculation Algorithm

```typescript
function calculateReserve(
  totalAvailable: number,
  config: ReserveCapacityConfig
) {
  // Step 1: Calculate ratio-based reserve
  const reserveByRatio = Math.ceil(totalAvailable * config.reserve_ratio);

  // Step 2: Apply minimum constraint
  const reserveRequired = Math.max(reserveByRatio, config.reserve_minimum);

  // Step 3: Check low stock threshold
  const lowStockThreshold = reserveRequired * 2;

  if (totalAvailable <= lowStockThreshold) {
    // Disable reserve to maximize availability
    return {
      reserveRequired: 0,
      assignableCount: totalAvailable,
      reserveDisabled: true,
      reason: "low_stock",
    };
  }

  // Step 4: Apply reserve
  return {
    reserveRequired,
    assignableCount: totalAvailable - reserveRequired,
    reserveDisabled: false,
  };
}
```

### Low Stock Detection

The system uses a two-tier approach for low stock detection:

1. **Reserve Disabling Threshold**: `totalAvailable <= reserveRequired * 2`

   - Purpose: Maximize availability during critical low stock
   - Action: Disable reserve, make all lockers assignable

2. **Alert Threshold**: `totalAvailable < reserveRequired`
   - Purpose: Early warning for capacity management
   - Action: Trigger alerts for administrative attention

### Alert System

#### Alert Types

1. **reserve_below_minimum** (High Severity)

   - Triggered when available capacity drops below reserve minimum
   - Indicates immediate attention needed

2. **reserve_disabled** (Medium Severity)

   - Triggered when reserve is automatically disabled due to low stock
   - Indicates system operating in emergency mode

3. **low_stock** (High Severity)
   - Triggered when available lockers ≤ 2
   - Indicates critical capacity shortage

#### Alert Auto-Clearing

Alerts automatically clear when conditions improve:

- Monitor conditions every 5 minutes
- Clear alerts when thresholds return to normal ranges
- Maintain alert history for analysis

## Integration Points

### Assignment Engine Integration

```typescript
// In assignNewLocker() method
const availableLockers = await this.getAssignableLockers(kioskId);
const reserveResult = await this.reserveCapacityManager.applyReserveCapacity(
  kioskId,
  availableLockers
);

// Use only assignable lockers for scoring and selection
const scoringData = await this.prepareScoringData(
  reserveResult.assignableLockers,
  timestamp
);
```

### Configuration Manager Integration

```typescript
// Global configuration
await configManager.updateGlobalConfig({
  reserve_ratio: 0.15, // 15%
  reserve_minimum: 3, // 3 lockers
});

// Per-kiosk override
await reserveManager.updateReserveConfig("kiosk-1", {
  reserve_ratio: 0.2, // 20% for high-traffic kiosk
  reserve_minimum: 5, // 5 lockers minimum
});
```

### Admin Panel Integration

#### Status Dashboard

- Real-time reserve capacity metrics
- Visual indicators for reserve status
- Alert notifications and management

#### Configuration Management

- Global and per-kiosk configuration editing
- Configuration history and audit trail
- Bulk configuration operations

## Monitoring and Metrics

### Key Metrics

1. **Reserve Utilization**

   - Current reserve count vs. required
   - Reserve efficiency ratio
   - Historical reserve usage patterns

2. **Alert Frequency**

   - Low stock alert frequency
   - Reserve disabled events
   - Alert resolution times

3. **Capacity Trends**
   - Available locker trends
   - Peak usage periods
   - Capacity planning metrics

### Logging Format

The system uses standardized logging for monitoring (one-line, no PII):

```
Reserve applied: kept=X, assignable=Y.
Reserve disabled: reason=low_stock, assignable=Z.
```

This format enables:

- Automated log parsing
- Metrics collection
- Performance monitoring
- Troubleshooting support

## Testing Strategy

### Unit Tests

- **Location**: `shared/services/__tests__/reserve-capacity-manager.test.ts`
- **Coverage**: All core methods and edge cases
- **Scenarios**: Normal, low stock, critical stock, configuration changes

### Integration Tests

- **Location**: `shared/services/__tests__/reserve-capacity-integration.test.ts`
- **Coverage**: Database integration, configuration management
- **Scenarios**: Real database operations, concurrent access

### Validation Scripts

- **Simple Logic Test**: `scripts/test-reserve-capacity-simple.js`
- **Full System Test**: `scripts/test-reserve-capacity.js`

## Configuration Examples

### High-Traffic Kiosk

```json
{
  "reserve_ratio": 0.2, // 20% reserve
  "reserve_minimum": 5 // 5 lockers minimum
}
```

### Low-Traffic Kiosk

```json
{
  "reserve_ratio": 0.05, // 5% reserve
  "reserve_minimum": 1 // 1 locker minimum
}
```

### Emergency Mode

```json
{
  "reserve_ratio": 0.0, // No percentage reserve
  "reserve_minimum": 0 // No minimum reserve
}
```

## Troubleshooting

### Common Issues

#### Reserve Always Disabled

- **Cause**: `reserve_minimum` too high for available capacity
- **Solution**: Reduce `reserve_minimum` or increase locker availability

#### Too Many Low Stock Alerts

- **Cause**: `reserve_ratio` too high for typical usage patterns
- **Solution**: Adjust `reserve_ratio` based on historical data

#### No Reserve Applied

- **Cause**: Configuration not loaded or system in emergency mode
- **Solution**: Check configuration and system status

### Diagnostic Commands

```bash
# Check reserve capacity status
curl http://localhost:3000/api/admin/reserve-capacity/status/kiosk-1

# Monitor alerts
curl http://localhost:3000/api/admin/reserve-capacity/alerts/kiosk-1

# Test reserve calculation
node scripts/test-reserve-capacity-simple.js
```

## Performance Considerations

### Database Queries

- Optimized queries for available locker counting
- Indexed columns for fast filtering
- Minimal database round trips

### Memory Usage

- Efficient locker filtering algorithms
- Minimal object creation during reserve calculation
- Garbage collection friendly operations

### Response Times

- Reserve calculation: < 10ms
- Status queries: < 50ms
- Configuration updates: < 100ms

## Security Considerations

### Configuration Access

- Admin-only configuration modification
- Audit trail for all changes
- Validation of configuration values

### Alert Management

- Authenticated access to alert endpoints
- Rate limiting on alert queries
- Secure alert notification channels

## Future Enhancements

### Predictive Reserve Management

- Machine learning based reserve calculation
- Historical usage pattern analysis
- Predictive capacity planning

### Advanced Alert Rules

- Custom alert thresholds per kiosk
- Time-based alert rules
- Integration with external monitoring systems

### Capacity Optimization

- Dynamic reserve adjustment based on usage patterns
- Multi-tier reserve levels
- Capacity forecasting and recommendations

## API Reference

All endpoints use `/api/admin/reserve-capacity/*` prefix with admin authentication and CSRF protection.

### Reserve Capacity Status

```
GET /api/admin/reserve-capacity/status/{kioskId}
```

### Monitor Alerts (with pagination)

```
GET /api/admin/reserve-capacity/alerts/{kioskId}?page=1&limit=20
```

### Update Kiosk Configuration

```
PUT /api/admin/reserve-capacity/config/{kioskId}
Body: { reserve_ratio?: number, reserve_minimum?: number, updated_by: string }
```

### Reset Kiosk Configuration

```
DELETE /api/admin/reserve-capacity/config/{kioskId}
Body: { updated_by: string, csrf_token: string }
```

### Global Configuration

```
GET /api/admin/reserve-capacity/global-config
PUT /api/admin/reserve-capacity/global-config
```

## Conclusion

The Reserve Capacity System provides robust capacity management for the Smart Locker Assignment feature. It ensures system availability during high-demand periods while providing intelligent alerts and monitoring capabilities. The system is designed for reliability, performance, and ease of management, making it suitable for production deployment in various operational environments.
