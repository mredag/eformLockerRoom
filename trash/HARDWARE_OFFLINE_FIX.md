# Hardware Offline Issue Fix

## Problem Description

After 10-30 minutes of operation, the eForm Locker System was incorrectly marking hardware as "HARDWARE_OFFLINE", causing:

- Direct relay control buttons to fail with 500 Internal Server Error
- Locker states to change to "Error" 
- RFID operations to fail with "Sistem bakımda - Görevliye başvurun" message

## Root Cause Analysis

The issue was in the `ModbusController.isHardwareAvailable()` method, which had overly aggressive timeout checks:

### Original Problematic Logic:

1. **Health Check Timeout**: After 5 minutes without a successful command, health status was marked as 'degraded'
2. **Hardware Availability Timeout**: After 10 minutes without a successful command, hardware was marked as unavailable
3. **False Negative**: In a real locker system, there can be natural periods of 10-30+ minutes without any locker operations (especially during off-peak hours)

### Code Issues:

```typescript
// PROBLEMATIC CODE (REMOVED):
// Check if we haven't had a successful command in the last 10 minutes
const timeSinceLastSuccess = Date.now() - this.health.last_successful_command.getTime();
if (timeSinceLastSuccess > 600000 && this.health.total_commands > 0) { // 10 minutes
  return false; // This caused false "hardware offline" errors
}
```

## Solution Implemented

### 1. Removed Time-Based Hardware Availability Checks

- **Before**: Hardware marked unavailable after 10 minutes of inactivity
- **After**: Hardware availability based only on connection status and error rate

### 2. Improved Health Monitoring

- **Before**: Health marked as 'degraded' after 5 minutes of inactivity
- **After**: Health monitoring uses actual hardware connectivity tests instead of time-based assumptions

### 3. Added Proactive Hardware Testing

- **New Feature**: `performHardwareTest()` method that performs lightweight connectivity tests
- **New Feature**: `testHardwareConnectivity()` API method for manual testing
- **Improved**: Health checks now test actual hardware instead of relying on command history

### 4. Enhanced Error Rate Tolerance

- **Before**: Hardware marked unavailable at 75% error rate
- **After**: Hardware marked unavailable only at 90% error rate (more tolerant of occasional failures)

## Code Changes

### Modified Files:

1. **`app/kiosk/src/hardware/modbus-controller.ts`**:
   - Removed time-based availability checks
   - Added `performHardwareTest()` method
   - Added `testHardwareConnectivity()` method
   - Improved health monitoring logic

2. **`app/kiosk/src/controllers/ui-controller.ts`**:
   - Added public methods for hardware status and testing

3. **`app/kiosk/src/index.ts`**:
   - Enhanced `/health` endpoint with hardware status
   - Added `/api/hardware/test` endpoint for connectivity testing

## New API Endpoints

### Enhanced Health Check
```bash
GET http://192.168.1.8:3002/health
```

Response includes hardware status:
```json
{
  "status": "healthy",
  "kiosk_id": "kiosk-1",
  "hardware": {
    "available": true,
    "connected": true,
    "health_status": "ok",
    "error_rate": 0,
    "last_successful_command": "2025-09-02T09:15:30.123Z",
    "uptime_seconds": 1800
  }
}
```

### Hardware Connectivity Test
```bash
GET http://192.168.1.8:3002/api/hardware/test
```

Response:
```json
{
  "success": true,
  "message": "Hardware connectivity test passed",
  "details": {
    "port": "/dev/ttyUSB0",
    "health": { ... },
    "lastSuccessfulCommand": "2025-09-02T09:15:30.123Z"
  }
}
```

## Testing

### Test Script Created:
- `test-hardware-connectivity.js` - Validates the fix works correctly

### Manual Testing:
1. Start the kiosk service
2. Wait 30+ minutes without any locker operations
3. Verify hardware remains available
4. Test locker operations still work

## Deployment Instructions

### For Windows PC (Development):
```powershell
# Build the updated kiosk service
npm run build:kiosk

# Commit and push changes
git add .
git commit -m "fix(kiosk): resolve hardware offline false positives during inactivity"
git push origin main
```

### For Raspberry Pi (Production):
```bash
# SSH to Pi and update
ssh pi@pi-eform-locker
cd /home/pi/eform-locker
git pull origin main

# Restart kiosk service
sudo pkill -f "node.*kiosk"
npm run start:kiosk &

# Verify fix
curl http://localhost:3002/health
curl http://localhost:3002/api/hardware/test
```

## Monitoring

### Health Check Commands:
```bash
# Check overall health
curl http://192.168.1.8:3002/health

# Test hardware connectivity
curl http://192.168.1.8:3002/api/hardware/test

# Monitor logs for hardware events
tail -f logs/kiosk.log | grep -i "hardware\|connectivity"
```

### Expected Behavior After Fix:

1. **No More False Offline Errors**: Hardware should remain available during periods of inactivity
2. **Improved Error Handling**: Only real hardware failures will trigger offline status
3. **Better Monitoring**: Health endpoints provide detailed hardware status information
4. **Proactive Testing**: System can test hardware connectivity without affecting operations

## Verification Checklist

- [ ] Kiosk service builds without errors
- [ ] Health endpoint returns hardware status
- [ ] Hardware test endpoint works
- [ ] System remains operational after 30+ minutes of inactivity
- [ ] Direct relay control buttons work after inactivity periods
- [ ] RFID operations work after inactivity periods
- [ ] Logs show no false "HARDWARE_OFFLINE" errors

## Notes

- The fix maintains all existing functionality while eliminating false positives
- Hardware is now considered available as long as the serial connection is open and error rate is acceptable
- Actual hardware failures will still be detected and reported correctly
- The system is now more resilient to natural periods of low activity

---

**Status**: ✅ Fix implemented and ready for deployment
**Impact**: Resolves false "HARDWARE_OFFLINE" errors during normal operation
**Risk**: Low - maintains existing functionality while improving reliability