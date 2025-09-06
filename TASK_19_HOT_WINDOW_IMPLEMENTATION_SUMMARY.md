# Task 19: Owner Hot Window Protection Implementation Summary

## Overview

Successfully implemented owner hot window protection for the smart locker assignment system. This feature prevents immediate reassignment of recently released lockers to give the original owner a chance to return, with dynamic duration based on system capacity.

## Implementation Details

### 1. Hot Window Manager Service

**File**: `shared/services/hot-window-manager.ts`

- **Core Functionality**: Manages owner hot window protection with capacity-based duration calculation
- **Key Features**:
  - Linear interpolation between 10-30 minutes based on free ratio
  - **Capacity clamping**: Free ratio clamped to [0,1] before interpolation
  - Automatic disabling when capacity is very low (≤0.1 free ratio)
  - Hot window application and expiration management
  - Original owner bypass capability
  - **Improved logging**: One-line info logs with periods, no PII

### 2. Hot Window Calculation Logic

**Requirements**: 14.1, 14.2, 14.3

```typescript
function calculateOwnerHotWindow(freeRatio: number): number {
  if (freeRatio <= 0.1) return 0; // Disabled when very low stock
  if (freeRatio >= 0.5) return 30; // 30 minutes

  // Linear interpolation between 0.1 and 0.5
  return 10 + ((freeRatio - 0.1) / 0.4) * 20; // 10-30 minutes
}
```

**Behavior**:

- **≥0.5 free ratio**: 30 minutes hot window
- **≤0.1 free ratio**: Disabled (0 minutes)
- **Between 0.1-0.5**: Linear interpolation (10-30 minutes)

### 3. Database Integration

**Requirements**: 14.4

- **Column Used**: `owner_hot_until` (already exists from migration 021)
- **Performance Index**: Added `idx_lockers_hot` on `(kiosk_id, owner_hot_until)` (migration 026)
- **Hot Window Application**: Updates locker with expiration timestamp and recent owner
- **Exclusion Logic**: Lockers in hot window are excluded from assignment pool
- **Bypass Logic**: Original owner can bypass their own hot window
- **Transaction Scope**: Hot window applied in same transaction as ownership clearing

### 4. Assignment Engine Integration

**File**: `shared/services/assignment-engine.ts`

**Changes Made**:

- Added `HotWindowManager` to assignment engine constructor
- Updated assignment flow to include hot window bypass check
- Enhanced `getAssignableLockers()` to exclude hot window protected lockers
- Added hot window application methods for locker release

**New Assignment Flow**:

1. Check existing ownership
2. Check overdue retrieval
3. Check return hold
4. **Check hot window bypass** ← NEW
5. Check reclaim eligibility
6. Assign new locker

### 5. Candidate Selector Updates

**File**: `shared/services/candidate-selector.ts`

**Changes Made**:

- Added `isInHotWindow` property to `LockerExclusionData` interface
- Updated exclusion logic to filter out lockers in hot window protection
- Updated example scenarios to include hot window test cases

### 6. Configuration Integration

**Requirements**: 14.1, 14.2, 14.3

**Configuration Keys** (snake_case format):

- `owner_hot_window_min`: 10 (minimum duration in minutes)
- `owner_hot_window_max`: 30 (maximum duration in minutes)
- `free_ratio_low`: 0.1 (threshold for disabling)
- `free_ratio_high`: 0.5 (threshold for maximum duration)

### 7. Comprehensive Testing

**Unit Tests**: `shared/services/__tests__/hot-window-manager.test.ts`

- Hot window calculation with various free ratios
- Hot window application and database updates
- Hot window status checking and bypass logic
- Expired hot window cleanup
- Configuration override handling
- Logging format verification

**Integration Tests**: `shared/services/__tests__/hot-window-integration.test.ts`

- Real database integration testing
- Concurrent hot window applications
- Performance testing with rapid queries
- Edge cases with zero lockers and VIP exclusions
- Assignment pool exclusion verification

**Reclaim Integration Tests**: `shared/services/__tests__/reclaim-hot-window.test.ts`

- Hot window exclusion from reclaim eligibility
- Original owner bypass for reclaim
- Transaction scope integration
- Configuration snake_case validation

**Simple Test Script**: `scripts/test-hot-window-simple.js`

- Standalone logic verification
- Linear interpolation validation
- Edge case testing
- ✅ All tests pass

## Key Features Implemented

### 1. Capacity-Based Duration (Requirements 14.1, 14.2, 14.3)

- **High Capacity (≥50% free)**: 30-minute hot window
- **Medium Capacity (10-50% free)**: Linear interpolation (10-30 minutes)
- **Low Capacity (≤10% free)**: Disabled for maximum availability
- **Capacity Clamping**: Free ratio clamped to [0,1] range before interpolation

### 2. Hot Window Application (Requirement 14.4)

- Applied when locker is released by owner
- Sets `owner_hot_until` timestamp in database
- Records `recent_owner` for bypass checking
- Logs application with exact format: "Hot window applied: locker=X, duration=Ymin"

### 3. Assignment Exclusion (Requirement 14.4)

- Lockers in hot window are excluded from assignment pool
- Original owner can bypass and reclaim their locker
- Other users cannot access hot window protected lockers

### 4. Automatic Expiration (Requirement 14.5)

- Hot windows automatically expire based on timestamp
- Cleanup method removes expired hot windows
- Logs cleared hot windows: "Cleared N expired hot windows"

### 5. Logging Requirements (Updated)

- **Calculation**: "Hot window: duration=X, disabled=Y." (one-line, no PII)
- **Application**: "Hot window applied: locker=X, duration=Ymin." (no expires timestamp)
- **Cleanup**: "Cleared N expired hot windows." (no kiosk ID)
- **Debug Level**: Detailed timestamps only at debug level

## Testing Results

### Unit Tests

- ✅ Hot window calculation with all free ratio scenarios
- ✅ Linear interpolation accuracy verification
- ✅ Database integration and updates
- ✅ Hot window bypass logic
- ✅ Configuration override handling
- ✅ Logging format compliance

### Integration Tests

- ✅ Real database operations
- ✅ Concurrent hot window applications
- ✅ Performance under load
- ✅ Edge cases and error handling

### Simple Logic Test

```
Test 1: High capacity (0.6 free ratio) - 30 minutes ✅ PASS
Test 2: Medium capacity (0.3 free ratio) - 20 minutes ✅ PASS
Test 3: Low capacity (0.2 free ratio) - 15 minutes ✅ PASS
Test 4: Very low capacity (0.1 free ratio) - 0 minutes (disabled) ✅ PASS
Test 5: Extremely low capacity (0.05 free ratio) - 0 minutes (disabled) ✅ PASS
Test 6: Edge case at 0.5 threshold - 30 minutes ✅ PASS
Test 7: Linear interpolation verification ✅ PASS
Test 8: Capacity clamping verification ✅ PASS
```

## API Methods Added

### HotWindowManager

- `calculateHotWindow(kioskId)`: Calculate hot window duration based on capacity
- `applyHotWindow(kioskId, lockerId, cardId)`: Apply hot window protection
- `isInHotWindow(kioskId, lockerId)`: Check if locker is protected
- `canBypassHotWindow(kioskId, lockerId, cardId)`: Check bypass eligibility
- `clearExpiredHotWindows(kioskId)`: Clean up expired protections
- `getStatus(kioskId)`: Get hot window status for monitoring

### AssignmentEngine

- `applyHotWindowOnRelease(kioskId, lockerId, cardId)`: Apply on locker release
- `clearExpiredHotWindows(kioskId)`: Cleanup expired windows
- `getHotWindowStatus(kioskId)`: Get status for monitoring

## Requirements Compliance

- ✅ **14.1**: Hot window calculation with linear interpolation (10-30 minutes)
- ✅ **14.2**: Free ratio-based hot window (≥0.5→30min, ≤0.1→disabled, linear between)
- ✅ **14.3**: Hot window bypass when free_ratio ≤ 0.1
- ✅ **14.4**: Hot window expiration and locker release logic
- ✅ **14.5**: Tests for hot window calculation and capacity-based disabling

## Acceptance Criteria Met

✅ **Hot window calculated correctly**: Linear interpolation working perfectly
✅ **Disabled at low capacity**: Automatically disabled when free_ratio ≤ 0.1
✅ **Proper logging**: All log messages follow required format (updated)

- "Hot window: duration=X, disabled=Y." (one-line, no PII)
- "Hot window applied: locker=X, duration=Ymin." (no expires timestamp)

## Integration Points

1. **Assignment Engine**: Hot window bypass check added to assignment flow
2. **Candidate Selector**: Hot window exclusion logic implemented
3. **Reclaim Manager**: Hot window exclusion from reclaim eligibility (except original owner bypass)
4. **Configuration System**: Hot window settings integrated with config manager (snake_case keys)
5. **Database Schema**: Uses existing `owner_hot_until` column + new performance index
6. **Transaction Scope**: Hot window applied within same transaction as ownership clearing
7. **Locker State Manager**: Compatible with existing locker state management

## Next Steps

The hot window protection is now fully implemented and tested. The system will:

1. **Automatically calculate** hot window duration based on capacity
2. **Apply protection** when lockers are released
3. **Exclude protected lockers** from assignment to other users
4. **Allow original owners** to bypass and reclaim their lockers
5. **Clean up expired** hot windows automatically

The implementation is ready for integration with the broader smart assignment system and can be enabled via the existing feature flag mechanism.
