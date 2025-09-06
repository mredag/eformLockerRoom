# AssignmentEngine Implementation Summary

## Overview

The AssignmentEngine is the core orchestrator for smart locker assignment, implementing the main assignment flow as specified in task 5 of the smart locker assignment specification. This implementation addresses all feedback requirements including rate limiting, PII-free logging, explicit reclaim vs exit-reopen paths, and proper Turkish message handling.

## Key Features Implemented

### 1. Main Assignment Flow

- **Existing ownership check**: Returns existing locker if user already owns one
- **Overdue retrieval**: Handles one-time retrieval for overdue lockers with quarantine
- **Return hold check**: Reopens lockers in return hold for the same user
- **Reclaim eligibility**: Two explicit paths with different timing and quarantine rules
- **New assignment**: Uses scoring and selection algorithms for optimal locker assignment

### 2. Rate Limiting and Throttling ✅

- **Card rate limit**: One assignment per card every 10 seconds (configurable)
- **Command cooldown**: 3-second relay cooldown between commands (configurable)
- **Locker rate limit**: 3 opens per locker per 60 seconds (configurable)
- **Throttle message**: "Lütfen birkaç saniye sonra deneyin" on rate limit
- **Pre-assignment checks**: Rate limits enforced before assignment logic

### 3. Explicit Reclaim vs Exit-Reopen Paths ✅

- **Reclaim Path**: Uses `reclaim_min` config (default 30 minutes), no quarantine
  - Log: `"Reclaim: locker X after Y minutes"`
- **Exit-Reopen Path**: Fixed 120-minute threshold, applies exit quarantine
  - Log: `"Exit-reopen: locker X after Y minutes"`
- **Clear distinction**: Both paths explicitly logged with different messages

### 4. PII-Free Logging ✅

- **No card data**: All logs use generic identifiers like "kiosk X" instead of card IDs
- **Secure logging**: Assignment logs show action and locker only
- **Rate limit logs**: Generic messages without exposing card information
- **Error logs**: System-level information without user data

### 5. Logging Format Compliance ✅

- **Single selection log**: Only from CandidateSelector: "Selected locker X from Y candidates"
- **No duplicate logs**: AssignmentEngine doesn't re-log selection
- **Assignment completion**: "Assignment completed: action=X, locker=Y"
- **Rate limiting**: "Rate limit triggered: reason"

### 6. Turkish Message Compliance ✅

- **Approved messages only**: Uses only messages from the approved UI_MESSAGES set
- **No stock**: "Boş dolap yok. Görevliye başvurun"
- **Conflict retry**: "Şu an işlem yapılamıyor"
- **Rate limited**: "Lütfen birkaç saniye sonra deneyin"

## Implementation Details

### Rate Limiting Integration

```typescript
// Check rate limits before assignment
const rateLimitCheck = this.rateLimiter.checkRateLimits(
  cardId,
  kioskId,
  undefined,
  {
    cardRateLimitSeconds: config.card_rate_limit_seconds,
    commandCooldownSeconds: config.command_cooldown_seconds,
    lockerRateLimit: config.locker_rate_limit_per_minute,
  }
);

if (!rateLimitCheck.allowed) {
  return {
    success: false,
    message: ERROR_MESSAGES.rate_limited, // "Lütfen birkaç saniye sonra deneyin"
    errorCode: "rate_limited",
  };
}
```

### Explicit Reclaim Paths

```typescript
// Path 1: Exit-reopen (120 minutes fixed threshold)
if (minutesSinceRelease >= 120) {
  // Apply exit quarantine and reopen
  console.log(
    `Exit-reopen: locker ${recentLocker.id} after ${Math.round(
      minutesSinceRelease
    )} minutes`
  );
}

// Path 2: Reclaim (uses reclaim_min config)
const reclaimMinMinutes = config.reclaim_min || 30;
if (minutesSinceRelease >= reclaimMinMinutes && minutesSinceRelease < 120) {
  // Standard reclaim without quarantine
  console.log(
    `Reclaim: locker ${recentLocker.id} after ${Math.round(
      minutesSinceRelease
    )} minutes`
  );
}
```

### PII-Free Logging Examples

```typescript
// Before (with PII)
console.log(`🎯 Starting assignment for card ${cardId} on kiosk ${kioskId}`);

// After (PII-free)
console.log(`🎯 Starting assignment on kiosk ${kioskId}`);
```

### Hardware Command Rate Limiting

```typescript
// Record commands for rate limiting in UI controller
this.rateLimiter.recordCommand();
this.rateLimiter.recordLockerCommand(kiosk_id, assignmentResult.lockerId);
hardwareSuccess = await this.modbusController.openLocker(
  assignmentResult.lockerId
);
```

## Configuration Extensions

### New Configuration Fields

- `reclaim_min`: Minimum minutes for reclaim eligibility (default: 30)
- `card_rate_limit_seconds`: Card assignment rate limit (default: 10)
- `command_cooldown_seconds`: Hardware command cooldown (default: 3)
- `locker_rate_limit_per_minute`: Locker operation limit (default: 3)

## Error Handling Improvements

### Conflict Handling ✅

- **Exactly one retry**: Single retry on optimistic locking conflict
- **Failure message**: "Şu an işlem yapılamıyor" on retry failure
- **No further retries**: System stops after one retry attempt

### Empty Pool Handling ✅

- **No stock message**: "Boş dolap yok. Görevliye başvurun"
- **Consistent response**: Same message for all no-stock scenarios
- **Early detection**: Checked before scoring and selection

## Integration Points

### Rate Limiter Service

- **Singleton pattern**: Shared across all services
- **Memory efficient**: Automatic cleanup of old entries
- **Configurable limits**: Uses ConfigurationManager for settings

### UI Controller Integration

- **Pre-assignment checks**: Rate limits checked before assignment
- **Hardware recording**: Commands recorded for rate limiting
- **Error propagation**: Rate limit errors properly surfaced

## Testing Coverage

### Rate Limiting Tests

- Card rate limiting scenarios
- Command cooldown validation
- Locker rate limit enforcement
- Combined rate limit checking

### Assignment Flow Tests

- Existing ownership handling
- Overdue retrieval with quarantine
- Return hold reopening
- Explicit reclaim vs exit-reopen paths
- New assignment with scoring

## Requirements Compliance

✅ **Rate Limits**: Card (10s), command (3s), locker (3/min) enforced
✅ **Reclaim vs Exit-Reopen**: Explicit paths with different configs and logs
✅ **Logging Format**: Single selection log, PII-free, exact format compliance
✅ **Turkish Messages**: Only approved messages used
✅ **Conflict Handling**: Exactly one retry, proper error message
✅ **Empty Pool**: Correct Turkish message
✅ **PII Protection**: Zero card data in logs

## Status

**COMPLETED** ✅ **WITH ALL FEEDBACK ADDRESSED**

The AssignmentEngine orchestrator is fully implemented with all requested improvements:

- Rate limiting and throttling protection
- Explicit reclaim vs exit-reopen paths with proper configuration
- PII-free logging throughout the system
- Single selection log format from CandidateSelector
- Turkish message compliance with approved set only
- Proper conflict handling with exactly one retry
- Hardware command rate limiting integration
