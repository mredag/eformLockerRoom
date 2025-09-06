# Rollout and Monitoring System

## Overview

The rollout and monitoring system provides comprehensive tools for gradually deploying smart locker assignment across kiosks with automated monitoring, decision support, and emergency rollback capabilities.

## Key Features

### 1. Gradual Rollout System
- **Per-kiosk enablement**: Enable smart assignment on individual kiosks
- **Phase tracking**: Monitor rollout phases (disabled, enabled, monitoring, rolled_back)
- **Audit trail**: Complete history of who enabled/disabled what and when

### 2. Rollback Mechanisms
- **Manual rollback**: Disable individual kiosks with reason tracking
- **Emergency disable**: Instantly disable all kiosks with confirmation code
- **Automated rollback**: System-triggered rollback based on performance metrics

### 3. Monitoring and Analytics
- **Real-time metrics**: Success rates, response times, error rates
- **Decision support**: AI-powered recommendations based on performance data
- **Alert system**: Configurable thresholds with automatic notifications

### 4. Emergency Controls
- **Emergency disable**: Requires confirmation code "EMERGENCY_DISABLE"
- **Immediate effect**: Changes take effect within seconds
- **Global scope**: Affects all enabled kiosks simultaneously

## Components

### RolloutManager
Core service for managing rollout operations:

```typescript
// Enable kiosk
await rolloutManager.enableKiosk('kiosk-1', 'admin', 'Initial rollout');

// Disable kiosk
await rolloutManager.disableKiosk('kiosk-1', 'admin', 'Performance issues');

// Emergency disable all
await rolloutManager.emergencyDisableAll('admin', 'Critical system issue');

// Analyze rollout decision
const decision = await rolloutManager.analyzeRolloutDecision('kiosk-1');
```

### AutomatedRollbackMonitor
Continuous monitoring with automated rollback triggers:

```typescript
// Start monitoring
await monitor.startMonitoring({
  checkIntervalMinutes: 5,
  enableAutomatedRollback: true,
  criticalThresholds: {
    minSuccessRate: 0.90,
    maxFailureRate: 0.10,
    maxResponseTimeMs: 2000
  }
});
```

### Database Schema

#### rollout_status
```sql
CREATE TABLE rollout_status (
  kiosk_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT 0,
  enabled_at DATETIME,
  enabled_by TEXT,
  rollback_at DATETIME,
  rollback_by TEXT,
  rollback_reason TEXT,
  phase TEXT NOT NULL DEFAULT 'disabled',
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### monitoring_metrics
```sql
CREATE TABLE monitoring_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  success_rate REAL NOT NULL,
  failure_rate REAL NOT NULL,
  avg_response_time REAL NOT NULL,
  total_assignments INTEGER NOT NULL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  alert_level TEXT NOT NULL DEFAULT 'none',
  recommended_action TEXT NOT NULL DEFAULT 'continue'
);
```

## API Endpoints

### Rollout Management
- `GET /api/admin/rollout/status` - Get all kiosk rollout status
- `GET /api/admin/rollout/status/:kioskId` - Get specific kiosk status
- `POST /api/admin/rollout/enable` - Enable smart assignment for kiosk
- `POST /api/admin/rollout/disable` - Disable smart assignment for kiosk
- `POST /api/admin/rollout/emergency-disable` - Emergency disable all kiosks

### Analysis and Monitoring
- `GET /api/admin/rollout/analyze/:kioskId` - Analyze rollout decision
- `POST /api/admin/rollout/check-automated-rollback` - Run automated check
- `GET /api/admin/rollout/events` - Get rollout event history
- `GET /api/admin/rollout/decisions` - Get decision history

### Configuration
- `GET /api/admin/rollout/thresholds` - Get rollout thresholds
- `PUT /api/admin/rollout/thresholds` - Update rollout thresholds

## Web Dashboard

Access the rollout dashboard at: `http://localhost:3001/rollout`

### Features:
- **Real-time status**: Live view of all kiosk rollout status
- **Summary cards**: Key metrics and statistics
- **Individual kiosk management**: Enable/disable specific kiosks
- **Emergency controls**: Emergency disable with confirmation
- **Event history**: Recent rollout events and decisions
- **Metrics visualization**: Performance charts and trends

## CLI Tool

Use the command-line interface for quick operations:

```bash
# Show rollout status
node scripts/rollout-cli.js status

# Enable kiosk
node scripts/rollout-cli.js enable kiosk-1 admin "Initial rollout"

# Disable kiosk
node scripts/rollout-cli.js disable kiosk-1 admin "Performance issues"

# Emergency disable all
node scripts/rollout-cli.js emergency-disable admin "Critical system issue"

# Analyze kiosk
node scripts/rollout-cli.js analyze kiosk-1

# Run automated check
node scripts/rollout-cli.js check-automated
```

## Decision Analysis

The system provides intelligent rollout recommendations based on:

### Metrics Analyzed:
- **Success Rate**: Percentage of successful assignments
- **Response Time**: Average assignment completion time
- **Error Rates**: No-stock, retry, and conflict event rates
- **Sample Size**: Minimum assignments for reliable analysis

### Recommendations:
- **Enable**: All metrics within acceptable thresholds
- **Monitor**: Some metrics need watching but not critical
- **Rollback**: Performance below acceptable levels
- **Disable**: Insufficient data or critical issues

### Confidence Levels:
- **High (>80%)**: Strong recommendation based on solid data
- **Medium (50-80%)**: Moderate confidence, may need more data
- **Low (<50%)**: Insufficient data for reliable recommendation

## Automated Rollback

### Triggers:
- Success rate below 90%
- Average response time above 2 seconds
- More than 5 consecutive failures
- High error rates (>10% no-stock, >2% conflicts)

### Process:
1. Continuous monitoring every 5 minutes
2. Metric analysis against thresholds
3. Confidence calculation for rollback decision
4. Automatic rollback if confidence >80%
5. Alert generation and audit logging

## Emergency Procedures

### Emergency Disable Process:
1. Access admin panel or use CLI
2. Enter admin credentials
3. Provide detailed reason
4. Enter confirmation code: "EMERGENCY_DISABLE"
5. System disables all kiosks immediately
6. Critical alert generated
7. All changes logged with audit trail

### Recovery Process:
1. Investigate and resolve root cause
2. Update system configuration if needed
3. Test on single kiosk first
4. Gradually re-enable kiosks
5. Monitor closely for issues

## Monitoring and Alerts

### Alert Types:
- **rollout_enabled**: Kiosk enabled for smart assignment
- **rollout_disabled**: Kiosk disabled (manual rollback)
- **emergency_rollback**: Emergency disable executed
- **automated_rollback**: System-triggered rollback
- **performance_critical**: Critical performance issues
- **performance_warning**: Performance warnings

### Thresholds (Configurable):
```json
{
  "criticalThresholds": {
    "minSuccessRate": 0.90,
    "maxFailureRate": 0.10,
    "maxResponseTimeMs": 2000,
    "minSampleSize": 20
  },
  "alertThresholds": {
    "warningSuccessRate": 0.95,
    "criticalSuccessRate": 0.90,
    "maxConsecutiveFailures": 5
  }
}
```

## Best Practices

### Rollout Strategy:
1. **Start Small**: Enable on 1-2 kiosks initially
2. **Monitor Closely**: Watch metrics for first 24-48 hours
3. **Gradual Expansion**: Add kiosks in small batches
4. **Performance Validation**: Ensure metrics stay healthy
5. **Full Deployment**: Complete rollout once stable

### Monitoring:
- Check dashboard daily during rollout
- Set up alert notifications
- Review decision recommendations
- Monitor automated rollback triggers
- Keep emergency procedures accessible

### Troubleshooting:
- Use CLI tool for quick status checks
- Review event history for patterns
- Analyze decision recommendations
- Check database metrics directly
- Verify configuration settings

## Security Considerations

- All rollout operations require admin authentication
- Emergency disable requires confirmation code
- Complete audit trail for all changes
- API endpoints protected with proper authorization
- Sensitive operations logged with user attribution

## Performance Impact

- Monitoring runs every 5 minutes by default
- Database queries optimized with proper indexes
- API responses cached where appropriate
- WebSocket updates for real-time dashboard
- Minimal impact on assignment performance

## Integration Points

### Configuration System:
- Uses existing configuration manager
- Supports per-kiosk overrides
- Hot reload capability (≤3 seconds)

### Alert System:
- Integrates with existing alert manager
- Configurable thresholds and notifications
- Auto-clear conditions for alerts

### Database:
- Extends existing schema
- Uses optimistic locking for concurrency
- Maintains data consistency

### Feature Flags:
- Integrates with smart assignment feature flags
- Seamless switching between manual/auto modes
- No service restart required

This rollout and monitoring system provides comprehensive tools for safely deploying smart locker assignment with full visibility, control, and automated safeguards.