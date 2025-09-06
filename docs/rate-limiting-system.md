# Rate Limiting System Documentation

## Overview

The Rate Limiting System provides comprehensive protection against abuse and ensures fair usage of the smart locker assignment system. It implements multiple layers of rate limiting with Turkish user messages and comprehensive monitoring capabilities.

## Rate Limiting Types

### 1. Card-Based Rate Limiting
- **Limit**: One open per 10 seconds per card
- **Purpose**: Prevents rapid-fire card scanning abuse
- **Message**: "Lütfen birkaç saniye sonra deneyin"
- **Scope**: Per RFID card ID

### 2. Locker-Based Rate Limiting
- **Limit**: 3 opens per 60 seconds per locker
- **Purpose**: Protects hardware from excessive relay activation
- **Message**: "Lütfen birkaç saniye sonra deneyin"
- **Scope**: Per individual locker

### 3. Command Cooldown
- **Limit**: 3 seconds between relay commands
- **Purpose**: Ensures hardware stability and prevents command conflicts
- **Message**: "Lütfen birkaç saniye sonra deneyin"
- **Scope**: Global system-wide

### 4. User Report Rate Limiting
- **Limit**: 2 reports per day per card
- **Purpose**: Prevents spam reporting of occupied lockers
- **Message**: "Günlük rapor limitine ulaştınız"
- **Scope**: Per RFID card ID, 24-hour window

## Implementation Architecture

### Core Components

#### RateLimiter Class
- Main rate limiting logic
- In-memory tracking of limits
- Violation recording and cleanup
- Thread-safe operations

#### RateLimitMonitor Class
- Monitoring and alerting
- Metrics calculation
- Alert generation and management
- Report generation

#### RateLimitCleanup Service
- Periodic cleanup of old data
- Violation history management
- Performance optimization

#### Rate Limit Middleware
- Integration with API endpoints
- Automatic rate limit checking
- Error response formatting
- Success operation recording

### Integration Points

#### Kiosk Service Integration
```typescript
// Card scan handling with rate limiting
const cardRateCheck = this.rateLimiter.checkCardRate(card_id);
if (!cardRateCheck.allowed) {
  return {
    success: false,
    error: 'rate_limit_exceeded',
    message: cardRateCheck.message,
    retryAfterSeconds: cardRateCheck.retryAfterSeconds
  };
}
```

#### Hardware Command Integration
```typescript
// Command cooldown before hardware operations
const commandCheck = this.rateLimiter.checkCommandCooldown();
if (!commandCheck.allowed) {
  return rateLimitResponse(commandCheck);
}

// Record successful operation
recordSuccessfulOperation(cardId, lockerId, 'open');
```

## Configuration

### Default Configuration
```json
{
  "cardOpenIntervalSeconds": 10,
  "lockerOpensPer60Seconds": 3,
  "commandCooldownSeconds": 3,
  "userReportsPerDay": 2
}
```

### Configuration File Location
- `config/rate-limits.json` - Rate limiting configuration
- Environment variables override support
- Runtime configuration updates via admin API

## API Endpoints

### Status and Monitoring
- `GET /api/admin/rate-limits/status` - System status overview
- `GET /api/admin/rate-limits/violations` - Recent violations
- `GET /api/admin/rate-limits/alerts` - Active alerts
- `GET /api/admin/rate-limits/report` - Comprehensive report

### Management Operations
- `POST /api/admin/rate-limits/cleanup` - Force cleanup
- `POST /api/admin/rate-limits/alerts/{id}/acknowledge` - Acknowledge alert
- `PUT /api/admin/rate-limits/thresholds` - Update alert thresholds
- `POST /api/admin/rate-limits/clear` - Emergency clear all limits

### Configuration
- `GET /api/admin/rate-limits/config` - Get current configuration
- `PUT /api/admin/rate-limits/cleanup/config` - Update cleanup settings
- `POST /api/admin/rate-limits/test` - Test rate limits

## Admin Interface

### Rate Limits Management Page
- **URL**: `http://localhost:3001/rate-limits`
- **Features**:
  - Real-time system status
  - Violation history table
  - Active alerts management
  - Configuration display
  - Auto-refresh capability

### Key Metrics Displayed
- System health status
- Active alerts count
- Recent violations (10 minutes)
- System load indicator
- Configuration parameters

## Monitoring and Alerting

### Alert Types

#### High Violation Rate Alert
- **Trigger**: >10 violations per minute
- **Severity**: High/Critical
- **Auto-clear**: When rate drops below threshold

#### Card Abuse Alert
- **Trigger**: >50 violations per hour for single card
- **Severity**: Medium
- **Purpose**: Detect potential abuse patterns

#### Locker Abuse Alert
- **Trigger**: >30 violations per hour for single locker
- **Severity**: Medium
- **Purpose**: Identify hardware issues or abuse

#### System Overload Alert
- **Trigger**: >100 violations per minute
- **Severity**: Critical
- **Purpose**: System-wide performance issues

### Violation Tracking
- All violations logged with timestamp
- Violation type and key tracking
- Retry-after time recording
- Automatic cleanup after 1 hour

## Performance Considerations

### Memory Management
- In-memory rate limit tracking
- Automatic cleanup of old data
- Configurable retention periods
- Efficient data structures (Maps)

### Cleanup Schedule
- Default: Every 15 minutes
- Configurable interval
- Removes violations older than 1 hour
- Maintains system performance

### Scalability
- Single-instance design (suitable for kiosk deployment)
- Memory-efficient tracking
- Fast lookup operations
- Minimal performance impact

## Error Handling

### Rate Limit Exceeded Response
```json
{
  "success": false,
  "error": "rate_limit_exceeded",
  "type": "card_rate",
  "key": "card123",
  "message": "Lütfen birkaç saniye sonra deneyin",
  "retryAfterSeconds": 8
}
```

### Graceful Degradation
- Rate limiter failures don't block operations
- Fallback to allowing operations if rate limiter fails
- Error logging for debugging
- System continues functioning

## Testing

### Test Script
- `scripts/test-rate-limiting-simple.js` - Comprehensive test suite
- Tests all rate limiting types
- Validates Turkish messages
- Checks violation tracking

### Test Coverage
- Card rate limiting scenarios
- Locker rate limiting scenarios
- Command cooldown testing
- User report rate limiting
- Combined rate limit testing
- Violation tracking validation

## Deployment

### Service Integration
1. Rate limiter automatically initialized in kiosk service
2. Middleware integrated with API endpoints
3. Admin routes registered in panel service
4. Cleanup service starts automatically

### Configuration Deployment
1. Update `config/rate-limits.json`
2. Restart services to apply changes
3. Monitor via admin interface
4. Adjust thresholds as needed

## Troubleshooting

### Common Issues

#### High Violation Rates
- Check for hardware issues
- Verify user behavior patterns
- Adjust rate limit thresholds if needed
- Monitor system performance

#### False Positives
- Review rate limit configuration
- Check for legitimate high-usage periods
- Adjust thresholds for specific scenarios
- Monitor user feedback

#### Performance Impact
- Monitor memory usage
- Check cleanup frequency
- Verify violation retention settings
- Optimize if necessary

### Debugging Tools
- Rate limit status API
- Violation history analysis
- Alert pattern review
- Test endpoint for validation

## Security Considerations

### Abuse Prevention
- Multiple layers of protection
- Graduated response (warnings → blocks)
- Monitoring and alerting
- Administrative override capabilities

### Data Privacy
- No sensitive data in violation logs
- Card IDs are hashed/anonymized where possible
- Automatic data cleanup
- Minimal data retention

### Administrative Access
- Rate limit management requires admin authentication
- Audit logging of administrative actions
- Emergency override capabilities
- Secure API endpoints

## Future Enhancements

### Potential Improvements
- Database persistence for rate limits
- Distributed rate limiting for multiple kiosks
- Machine learning for abuse detection
- Advanced analytics and reporting
- Integration with external monitoring systems

### Configuration Enhancements
- Per-kiosk rate limit configuration
- Time-based rate limit adjustments
- Dynamic threshold adjustment
- Integration with system load monitoring

This rate limiting system provides comprehensive protection while maintaining excellent user experience with clear Turkish messaging and robust monitoring capabilities.