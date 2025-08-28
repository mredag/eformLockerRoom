# Archived Incident Reports Summary

This document contains key information from resolved incidents that have been archived during repository cleanup.

## Kiosk Assignment Failure (August 27, 2025)

**Issue**: Session management bug causing "Assignment failed, Dolap atanamadı" error
**Root Cause**: `getAvailableLockers` method created session ID but didn't store it in session manager
**Resolution**: Fixed session creation to properly store session data matching RfidSession interface
**Key Learning**: Temporary sessions require proper storage even for short-lived operations

**Fix Applied**:
```typescript
// Before: Session ID created but not stored
return {
  sessionId: `temp-${Date.now()}`, // Created but never stored
  // ...
};

// After: Proper session creation and storage
const sessionData = {
  id: sessionId,
  kioskId,
  cardId: 'manual',
  startTime: new Date(),
  timeoutSeconds: 30,
  status: 'active' as const,
  availableLockers: availableLockersList.map(l => l.id)
};
(this.sessionManager as any).sessions.set(sessionId, sessionData);
```

## Command Queue Database Path Issue

**Issue**: Commands stuck in "pending" status due to database path conflicts
**Root Cause**: Services accessing different database files due to working directory mismatch
**Resolution**: Set `EFORM_DB_PATH` environment variable to absolute path
**Key Learning**: Ensure all services use consistent database paths in distributed systems

## Direct Relay Troubleshooting

**Issue**: Direct relay button stopped working after implementing locker room functionality
**Root Cause**: Serial port conflicts between Panel and Kiosk services
**Resolution**: Implemented smart conflict detection and service startup order
**Key Learning**: Linux serial ports can only be accessed by one process at a time

## Raspberry Pi Migration Fix

**Issue**: System failed to start due to duplicate migration conflicts
**Root Cause**: Migrations 015/016 conflicted with already-applied migrations 009/010
**Resolution**: Created automatic fix script to remove duplicate migration entries
**Key Learning**: Migration numbering must be consistent across all environments

---

*This summary was created during repository cleanup on August 28, 2025*
*Original detailed reports were archived to maintain clean repository structure*