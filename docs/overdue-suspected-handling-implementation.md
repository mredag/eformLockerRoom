# Overdue and Suspected Handling Implementation

## Overview

This document describes the implementation of Task 18: "Build overdue and suspected handling" from the smart locker assignment specification. The implementation provides comprehensive handling of overdue lockers and suspected occupied reporting as required by Requirements 5.1-5.5.

## Features Implemented

### 1. Overdue Locker Marking (Requirement 5.1)
- **Functionality**: Automatically marks lockers as overdue when session limits expire
- **Implementation**: `OverdueManager.markLockerOverdue()`
- **Database**: Updates `lockers.overdue_from` and `lockers.overdue_reason`
- **Exclusion**: Overdue lockers are excluded from assignment pool

### 2. One-Time Retrieval Logic (Requirement 5.2)
- **Functionality**: Allows overdue owners to retrieve their locker exactly once
- **Implementation**: `OverdueManager.canRetrieveOverdue()` and `processOverdueRetrieval()`
- **Quarantine**: Applies 20-minute quarantine after retrieval
- **Tracking**: Uses `lockers.cleared_by` to prevent multiple retrievals

### 3. Suspected Occupied Reporting (Requirement 5.3)
- **Functionality**: Handles double-scan detection for suspected occupied lockers
- **Implementation**: `OverdueManager.reportSuspectedOccupied()`
- **Window**: 30-second report window after locker opening
- **Action**: Marks locker as suspected and moves to overdue status

### 4. Daily Report Limits (Requirement 5.5)
- **Functionality**: Limits users to 2 reports per day per card
- **Implementation**: `OverdueManager.getUserReportsToday()`
- **Tracking**: Uses `user_reports` table with daily count validation
- **Rejection**: Returns clear error message when limit exceeded

### 5. Assignment Pool Exclusion (Requirements 5.1, 5.3)
- **Functionality**: Excludes overdue and suspected lockers from assignment
- **Implementation**: `OverdueManager.shouldExcludeFromAssignment()`
- **Integration**: Used by assignment engine during locker selection
- **Reasons**: Clear exclusion reasons for debugging

## Database Schema

### Enhanced Lockers Table
```sql
ALTER TABLE lockers ADD COLUMN overdue_from DATETIME;
ALTER TABLE lockers ADD COLUMN overdue_reason TEXT CHECK (overdue_reason IN ('time_limit', 'user_report'));
ALTER TABLE lockers ADD COLUMN suspected_occupied INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lockers ADD COLUMN cleared_by TEXT;
ALTER TABLE lockers ADD COLUMN cleared_at DATETIME;
```

### New Tables
```sql
-- User reports tracking
CREATE TABLE user_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('suspected_occupied')),
  reported_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Locker operations for report window tracking
CREATE TABLE locker_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  locker_id INTEGER NOT NULL,
  card_id TEXT,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('open', 'close', 'assign', 'release')),
  opened_at DATETIME,
  closed_at DATETIME,
  success BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API Integration

### Assignment Engine Integration
The `OverdueManager` is integrated into the `AssignmentEngine` to handle:

1. **Overdue Retrieval Flow**:
   ```typescript
   // Enhanced checkOverdueRetrieval method
   const canRetrieve = await this.overdueManager.canRetrieveOverdue(kioskId, lockerId, cardId);
   if (canRetrieve.allowed) {
     await this.overdueManager.processOverdueRetrieval(kioskId, lockerId, cardId);
   }
   ```

2. **Suspected Occupied Reporting**:
   ```typescript
   // New handleSuspectedOccupiedReport method
   if (userReportWindow) {
     const reportResult = await this.handleSuspectedOccupiedReport(cardId, kioskId);
     if (reportResult.success) {
       return reportResult; // Assign new locker with "reported occupied" message
     }
   }
   ```

3. **Assignment Pool Filtering**:
   ```typescript
   // Enhanced exclusion logic
   const exclusion = await this.overdueManager.shouldExcludeFromAssignment(kioskId, lockerId);
   if (exclusion.exclude) {
     // Exclude from candidate selection
   }
   ```

## Event System

The `OverdueManager` emits events for monitoring and integration:

```typescript
// Event types emitted
overdueManager.on('locker_overdue', (data) => {
  // { kioskId, lockerId, cardId, reason, overdueFrom }
});

overdueManager.on('overdue_retrieved', (data) => {
  // { kioskId, lockerId, cardId, retrievedAt, quarantineUntil }
});

overdueManager.on('suspected_occupied_reported', (data) => {
  // { kioskId, lockerId, cardId, reportedAt }
});

overdueManager.on('suspected_cleared', (data) => {
  // { kioskId, lockerId, adminUser, clearedAt }
});

overdueManager.on('overdue_force_cleared', (data) => {
  // { kioskId, lockerId, adminUser, clearedAt }
});
```

## Admin Management Functions

### Overdue Locker Management
```typescript
// Get all overdue lockers
const overdueLockers = await overdueManager.getOverdueLockers(kioskId);

// Force clear overdue locker (admin action)
await overdueManager.forceCloseOverdue(kioskId, lockerId, adminUser);
```

### Suspected Locker Management
```typescript
// Get all suspected lockers
const suspectedLockers = await overdueManager.getSuspectedLockers(kioskId);

// Clear suspected flag (admin action)
await overdueManager.clearSuspectedOccupied(kioskId, lockerId, adminUser);
```

## Configuration

The system uses configurable parameters:

```typescript
interface OverdueConfig {
  userReportWindowSeconds: number; // 30 seconds - time to report after open
  suspectTtlMinutes: number; // 60 minutes - how long suspected status lasts
  dailyReportCap: number; // 2 reports - max reports per card per day
  retrievalGracePeriodMinutes: number; // 10 minutes - grace for overdue retrieval
}
```

## Logging and Monitoring

### Key Log Messages
- `📋 Marked locker X as overdue: reason=Y, card=Z`
- `🔓 Overdue retrieval: card=X, locker=Y`
- `🚨 Suspected occupied reported: card=X, locker=Y`
- `🔧 Cleared suspected occupied flag: locker=X, admin=Y`
- `🔧 Force cleared overdue locker: locker=X, admin=Y`

### Acceptance Criteria Validation
The implementation logs the required acceptance message:
- **Requirement 5.2**: Logs "Overdue retrieval: card=X, locker=Y" ✅

## Testing

### Unit Tests
- `shared/services/__tests__/overdue-manager.test.ts` - Comprehensive unit tests
- `shared/services/__tests__/overdue-integration.test.ts` - Integration tests

### Simple Test Script
- `scripts/test-overdue-simple.js` - Standalone test without complex dependencies
- `scripts/run-overdue-migration.js` - Database migration test

### Test Coverage
All requirements are covered by tests:
- ✅ 5.1: Overdue marking when session expires
- ✅ 5.2: One-time retrieval with quarantine
- ✅ 5.3: Suspected occupied reporting with double-scan
- ✅ 5.4: Moving suspected lockers to overdue status
- ✅ 5.5: Daily report limits (2 per card)

## Error Handling

### Graceful Degradation
- Database errors return appropriate error responses
- Rate limit violations provide clear user messages
- Missing lockers handled with proper error codes

### Validation
- Report window validation prevents stale reports
- Daily limit validation prevents abuse
- Ownership validation ensures security

## Performance Considerations

### Database Indexes
```sql
-- Optimized queries with proper indexes
CREATE INDEX idx_user_reports_card_date ON user_reports(card_id, reported_at);
CREATE INDEX idx_locker_operations_locker_time ON locker_operations(kiosk_id, locker_id, opened_at);
CREATE INDEX idx_lockers_overdue_from ON lockers(overdue_from);
CREATE INDEX idx_lockers_suspected_occupied ON lockers(suspected_occupied);
```

### Query Optimization
- Efficient daily report counting with date range queries
- Optimized exclusion checks for assignment pool
- Minimal database operations for high-frequency calls

## Migration Path

### Database Migration
1. Run `migrations/024_overdue_suspected_system_simple.sql`
2. Verify tables created: `user_reports`, `locker_operations`
3. Test with `scripts/run-overdue-migration.js`

### Service Integration
1. Import `OverdueManager` in assignment engine
2. Initialize with database connection and configuration manager
3. Integrate into assignment flow methods
4. Add event listeners for monitoring

## Future Enhancements

### Potential Improvements
- Configurable report window duration per kiosk
- Advanced analytics for overdue patterns
- Automated suspected locker investigation
- Integration with hardware sensors for validation

### Monitoring Integration
- Alert thresholds for high overdue rates
- Dashboard metrics for admin interface
- Automated reporting for operational insights

## Conclusion

The overdue and suspected handling implementation provides a robust foundation for managing problem lockers in the smart assignment system. It meets all specified requirements while providing flexibility for future enhancements and comprehensive monitoring capabilities.

The system is designed to be:
- **Reliable**: Comprehensive error handling and validation
- **Performant**: Optimized database queries and minimal overhead
- **Maintainable**: Clear separation of concerns and extensive testing
- **Monitorable**: Rich event system and logging for operational visibility