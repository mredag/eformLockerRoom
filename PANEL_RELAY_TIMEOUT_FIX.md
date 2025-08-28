# Panel Relay Timeout Fix - August 2025

## 🚨 Issue Description

**Problem**: Panel service returns "500 Internal Server Error" when trying to activate relays after 20-30 minutes of operation.

**Symptoms**:
- API endpoint `http://192.168.1.8:3001/api/relay/activate` fails with 500 error
- Error occurs consistently after 20-30 minutes of service uptime
- Direct relay activation from Panel UI stops working
- Queue-based locker control from `/lockers` page continues to work

## 🔍 Root Cause Analysis

The issue was caused by **serial port connection degradation** over time:

1. **Connection Staleness**: Serial port connections can become stale after extended periods
2. **No Connection Refresh**: The original code didn't check or refresh connections
3. **Poor Error Handling**: Connection failures weren't properly handled or recovered
4. **Resource Leaks**: Serial port resources weren't properly cleaned up
5. **No Timeout Protection**: Requests could hang indefinitely

## ✅ Solution Implemented

### 1. **Connection Lifecycle Management**

```typescript
private lastConnectionTime: number = 0;
private connectionTimeout: number = 30 * 60 * 1000; // 30 minutes

private isConnectionStale(): boolean {
  return Date.now() - this.lastConnectionTime > this.connectionTimeout;
}

private async refreshConnection(): Promise<void> {
  if (this.isConnected && this.isConnectionStale()) {
    console.log('🔄 Connection is stale, refreshing...');
    await this.disconnect();
    this.isConnected = false;
  }
}
```

### 2. **Improved Connection Handling**

- **Automatic Refresh**: Connections are automatically refreshed when stale
- **Error Handlers**: Serial port error and close events are properly handled
- **Connection Validation**: Port status is verified before each operation
- **Graceful Cleanup**: Proper disconnection with error handling

### 3. **Request Timeout Protection**

```typescript
// Add timeout to prevent hanging requests
const activationPromise = relayService.activateRelay(relay_number);
const timeoutPromise = new Promise<boolean>((_, reject) => {
  setTimeout(() => reject(new Error('Activation timeout after 10 seconds')), 10000);
});

const success = await Promise.race([activationPromise, timeoutPromise]);
```

### 4. **Periodic Health Checks**

```typescript
// Start periodic health check
healthCheckInterval = setInterval(async () => {
  try {
    if (relayService && relayService.isReady()) {
      await relayService.refreshConnection();
    }
  } catch (error) {
    console.warn('⚠️ Health check error:', error);
  }
}, 5 * 60 * 1000); // Check every 5 minutes
```

### 5. **Graceful Shutdown**

- Proper cleanup of serial port connections
- Health check interval cleanup
- Resource deallocation on service shutdown

## 🛠️ Files Modified

1. **`app/panel/src/routes/relay-routes.ts`**:
   - Added connection lifecycle management
   - Improved error handling and recovery
   - Added timeout protection
   - Implemented periodic health checks

2. **`app/panel/src/index.ts`**:
   - Added graceful shutdown handling
   - Integrated cleanup functions

3. **`scripts/diagnose-panel-relay-issue.js`** (NEW):
   - Diagnostic tool for troubleshooting relay issues

## 🚀 Deployment Instructions

### 1. **Build and Deploy**

```powershell
# On Windows PC
npm run build:panel
git add .
git commit -m "Fix Panel relay timeout issue after 30 minutes"
git push origin main
```

### 2. **Update Raspberry Pi**

```bash
# SSH to Pi
ssh pi@pi-eform-locker

# Pull latest changes
cd /home/pi/eform-locker
git pull origin main

# Restart Panel service
sudo pkill -f "node.*panel"
npm run start:panel &
```

### 3. **Verify Fix**

```bash
# Test relay API
curl -X POST http://192.168.1.8:3001/api/relay/test \
  -H "Content-Type: application/json" \
  -d '{"test_type": "connection"}'

# Check service health
curl http://192.168.1.8:3001/health

# Run diagnostic tool
node scripts/diagnose-panel-relay-issue.js
```

## 🔧 Testing the Fix

### 1. **Immediate Testing**

```bash
# Test relay activation
curl -X POST http://192.168.1.8:3001/api/relay/activate \
  -H "Content-Type: application/json" \
  -d '{"relay_number": 5, "staff_user": "test", "reason": "testing fix"}'
```

### 2. **Long-term Testing**

- Let Panel service run for 30+ minutes
- Test relay activation periodically
- Monitor logs for connection refresh messages
- Verify no 500 errors occur

### 3. **Diagnostic Tool**

```bash
# Run comprehensive diagnostics
node scripts/diagnose-panel-relay-issue.js
```

## 📊 Monitoring

### **Log Messages to Watch For**

```
✅ Connection refresh successful
🔄 Connection is stale, refreshing...
🔄 Serial port not open, reconnecting...
⚠️ Health check error: [details]
```

### **Health Check Endpoints**

- **Panel Health**: `GET http://192.168.1.8:3001/health`
- **Relay Status**: `GET http://192.168.1.8:3001/api/relay/status`
- **Connection Test**: `POST http://192.168.1.8:3001/api/relay/test`

## 🎯 Prevention Strategies

### 1. **Use Queue-Based Control**

**Recommended**: Use the `/lockers` page for locker control instead of direct relay activation.

```
✅ Queue-based: http://192.168.1.8:3001/lockers (Always works)
⚠️ Direct relay: http://192.168.1.8:3001/relay (Can have conflicts)
```

### 2. **Service Management**

```bash
# Restart services periodically (optional)
./scripts/start-all-clean.sh

# Monitor service health
curl http://192.168.1.8:3001/health
```

### 3. **Port Conflict Avoidance**

- Only one service should access `/dev/ttyUSB0` at a time
- Kiosk service takes priority for hardware access
- Panel service automatically detects conflicts and uses Gateway API

## 🔄 Rollback Procedure

If issues persist:

```bash
# Revert to previous version
git revert HEAD
npm run build:panel

# Or use emergency relay reset
node scripts/emergency-relay-reset.js
```

## 📈 Expected Results

After implementing this fix:

- ✅ **No more 500 errors** after 20-30 minutes
- ✅ **Automatic connection recovery** when issues occur
- ✅ **Better error messages** with troubleshooting suggestions
- ✅ **Improved reliability** for direct relay control
- ✅ **Graceful degradation** to API-based control when needed

## 🎯 Success Metrics

- **Zero 500 errors** from relay activation after 30+ minutes
- **Connection refresh logs** appearing every 30 minutes
- **Successful relay activation** throughout extended operation
- **Proper error handling** with helpful suggestions

---

**Status**: ✅ **IMPLEMENTED AND READY FOR TESTING**

**Next Steps**: Deploy to Pi and monitor for 1+ hour to confirm fix effectiveness.