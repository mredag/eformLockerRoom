# Hardware Integration & Troubleshooting Guide

## Overview

This guide covers the eForm Locker System's hardware integration, focusing on Modbus RTU communication, serial port management, and common troubleshooting procedures. The system uses a Raspberry Pi 4 with USB-RS485 adapter to control relay cards via Modbus protocol.

## Modbus RTU Communication

### Protocol Fundamentals

The eForm Locker System uses **Modbus RTU** (Remote Terminal Unit) protocol for hardware communication:

```
Master (Raspberry Pi) ←→ USB-to-RS485 ←→ Slave Devices (Relay Cards)
```

**Key Characteristics:**
- **Single Master, Multiple Slaves**: Only one device can initiate communication
- **Serial Port Exclusivity**: Linux locks the port to prevent conflicts
- **Timing Critical**: Commands must be properly spaced (50ms intervals)
- **Error Handling**: CRC validation, timeout handling, retry logic

### Hardware Architecture

```
Raspberry Pi 4
    ↓ USB
USB-to-RS485 Adapter (/dev/ttyUSB0)
    ↓ RS485 Bus
Relay Card 1 (Address 1) - Relays 1-16  → Lockers 1-16
Relay Card 2 (Address 2) - Relays 1-16  → Lockers 17-32
```

### Relay Control Logic

Both Panel and Kiosk services use the same relay activation pattern:

```javascript
// Turn relay ON
writeCoil(address, true);
// Wait for pulse duration (400ms)
delay(400);
// Turn relay OFF (safety)
writeCoil(address, false);
```

### Locker ID to Hardware Mapping

```javascript
// Formula used by both services
const cardId = Math.ceil(lockerId / 16); // Which relay card (1-2)
const relayId = ((lockerId - 1) % 16) + 1; // Which relay on card (1-16)
const coilAddress = relayId - 1; // Modbus address (0-15)

// Examples:
// Locker 1  -> Card 1, Relay 1,  Coil 0
// Locker 5  -> Card 1, Relay 5,  Coil 4
// Locker 16 -> Card 1, Relay 16, Coil 15
// Locker 17 -> Card 2, Relay 1,  Coil 0
```

## Serial Port Management

### Port Conflicts and Resolution

**Primary Issue**: Multiple services competing for the same serial port (`/dev/ttyUSB0`)

#### Linux Exclusive Locking
- Only one process can access `/dev/ttyUSB0` at a time
- No sharing possible between multiple services
- Detection required before attempting connection

#### Service Architecture

**Two Operating Modes:**

1. **Direct Relay Mode** (Kiosk Not Running)
   ```
   Panel UI → SimpleRelayService → USB-to-RS485 → Relay Cards
   ```
   - **Use Case**: Hardware testing, maintenance
   - **Advantages**: Direct control, immediate response (~50ms)
   - **Limitations**: Conflicts with Kiosk service

2. **Queue-Based Mode** (Production)
   ```
   Panel UI → Gateway → Command Queue → Kiosk → ModbusController → Hardware
   ```
   - **Use Case**: Normal operation with Kiosk running
   - **Advantages**: No port conflicts, proper queuing (~200ms)
   - **Limitations**: Slightly more complex path

### Smart Conflict Detection

```javascript
// Panel checks if Kiosk is running
const kioskRunning = await this.isKioskServiceRunning();
if (kioskRunning && portError) {
  throw new Error(
    "Port in use by Kiosk service. Use queue-based commands instead."
  );
}
```

## Connection Lifecycle Management

### Connection Staleness Issues

**Problem**: Serial port connections can become stale after extended periods (20-30 minutes), causing 500 Internal Server Error responses.

**Solution**: Automatic connection refresh and lifecycle management:

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

### Timeout Protection

```typescript
// Add timeout to prevent hanging requests
const activationPromise = relayService.activateRelay(relay_number);
const timeoutPromise = new Promise<boolean>((_, reject) => {
  setTimeout(() => reject(new Error('Activation timeout after 10 seconds')), 10000);
});

const success = await Promise.race([activationPromise, timeoutPromise]);
```

### Periodic Health Checks

```typescript
// Start periodic health check every 5 minutes
healthCheckInterval = setInterval(async () => {
  try {
    if (relayService && relayService.isReady()) {
      await relayService.refreshConnection();
    }
  } catch (error) {
    console.warn('⚠️ Health check error:', error);
  }
}, 5 * 60 * 1000);
```

## Common Issues & Solutions

### 1. Port Conflicts

**Symptoms:**
- `Resource temporarily unavailable` errors
- `EBUSY` error codes
- API returns success but no relay activation

**Diagnosis:**
```bash
# Check what's using the port
sudo lsof /dev/ttyUSB0

# List USB devices
lsusb

# Check serial ports
ls -la /dev/ttyUSB*
```

**Solutions:**
```bash
# Kill conflicting processes
sudo killall node

# Restart services in proper order
./scripts/start-all-clean.sh

# Check service status
ps aux | grep node
```

### 2. Relay Not Clicking

**Symptoms:**
- API returns success but no physical relay activation
- No audible click from relay cards
- Hardware appears unresponsive

**Diagnosis:**
```bash
# Test basic relay control
node scripts/test-basic-relay-control.js

# Test multiple relays
node scripts/test-relays-1-8.js

# Check hardware connections
sudo minicom -D /dev/ttyUSB0 -b 9600
```

**Solutions:**
1. Verify using basic ON/OFF commands (not Waveshare timed pulse)
2. Check CRC calculation method
3. Ensure proper command intervals (50ms between commands)
4. Verify hardware wiring and power supply

### 3. Service Won't Start

**Symptoms:**
- Service fails to start or crashes immediately
- Port access denied errors
- Configuration loading failures

**Diagnosis:**
```bash
# Check logs for errors
tail -20 logs/kiosk.log
tail -20 logs/panel.log

# Verify port availability
ls -la /dev/ttyUSB*

# Check service health
curl http://localhost:3002/health
curl http://localhost:3001/health
```

**Solutions:**
```bash
# Fix port permissions
sudo chmod 666 /dev/ttyUSB0

# Clean restart all services
sudo killall node
sleep 3
./scripts/start-all-clean.sh

# Check for syntax errors
npm run build:all
```

### 4. Connection Timeouts

**Symptoms:**
- 500 Internal Server Error after 20-30 minutes
- Panel relay activation fails intermittently
- Connection becomes unresponsive

**Solutions:**
- Automatic connection refresh (implemented)
- Periodic health checks (implemented)
- Request timeout protection (implemented)
- Graceful error handling and recovery

## Hardware Mapping and Timing Requirements

### Command Intervals
- **Between Commands**: 50ms minimum to prevent bus conflicts
- **Pulse Duration**: 400ms ensures reliable relay activation
- **Timeout Handling**: 2-second timeouts prevent hanging operations

### Error Recovery
- **Retry Logic**: Up to 3 attempts with exponential backoff
- **Fallback Commands**: Multiple coils (0x0F) → Single coil (0x05)
- **CRC Validation**: Ensures data integrity in noisy environments

### Address Calculation
- **Consistent Formulas**: Both services use identical mapping
- **Card Distribution**: 16 relays per card, supports multiple cards
- **Zero-based Addressing**: Modbus protocol requirement

## Debugging Tools and Procedures

### Hardware Testing Scripts

```bash
# Basic relay functionality
node scripts/test-basic-relay-control.js

# Multiple relay testing
node scripts/test-relays-1-8.js

# Emergency controls
node scripts/emergency-close-relay.js
node scripts/emergency-relay-reset.js

# Queue vs direct comparison
node scripts/test-queue-vs-direct.js
```

### Service Management

```bash
# Clean service startup
./scripts/start-all-clean.sh

# Production startup with monitoring
node scripts/production-startup.js

# Health monitoring
./scripts/health-check-kiosk.sh
```

### Diagnostic Commands

```bash
# Monitor serial communication (stop services first!)
sudo minicom -D /dev/ttyUSB0 -b 9600

# Check hardware connections
lsusb | grep -i "serial\|rs485\|ftdi"

# Test port permissions
echo "test" > /dev/ttyUSB0
```

### Debug Logging

Enable detailed logging in service code:

```javascript
console.log(`🔧 Debug: ${JSON.stringify(data)}`);
console.log(`📡 Command: ${buffer.toString("hex").toUpperCase()}`);
console.log(`⏱️ Timing: ${Date.now() - startTime}ms`);
```

## Performance Characteristics

### Direct Relay Mode
- **Latency**: ~50ms (immediate hardware access)
- **Reliability**: High (direct communication)
- **Concurrency**: Single operation only
- **Use Case**: Testing and maintenance

### Queue-Based Mode
- **Latency**: ~200ms (via Gateway and queue)
- **Reliability**: High (retry logic, error handling)
- **Concurrency**: Multiple operations queued
- **Use Case**: Production operation

## Monitoring and Health Checks

### Log Messages to Monitor

```bash
# Success indicators
✅ Connection refresh successful
🔄 Connection is stale, refreshing...
🔄 Serial port not open, reconnecting...

# Warning signs
⚠️ Health check error: [details]
❌ Port in use by another service
🚨 Relay activation timeout
```

### Health Check Endpoints

```bash
# Service health
curl http://192.168.1.8:3000/health  # Gateway
curl http://192.168.1.8:3001/health  # Panel
curl http://192.168.1.8:3002/health  # Kiosk

# Relay status
curl http://192.168.1.8:3001/api/relay/status

# Connection test
curl -X POST http://192.168.1.8:3001/api/relay/test \
  -H "Content-Type: application/json" \
  -d '{"test_type": "connection"}'
```

### Performance Monitoring

```bash
# Monitor all service logs
tail -f logs/*.log

# Monitor relay activations
tail -f logs/*.log | grep -i "relay\|modbus"

# Monitor errors only
tail -f logs/*.log | grep -i "error\|failed"
```

## Prevention Strategies

### 1. Use Queue-Based Control (Recommended)

For production use, always prefer the queue-based system:

```
✅ Queue-based: http://192.168.1.8:3001/lockers (Always works)
⚠️ Direct relay: http://192.168.1.8:3001/relay (Can have conflicts)
```

### 2. Proper Service Startup Order

```bash
# Correct sequence
Gateway (port 3000) → Kiosk (port 3002) → Panel (port 3001)

# Use the startup script
./scripts/start-all-clean.sh
```

### 3. Regular Maintenance

```bash
# Restart services periodically (optional)
./scripts/start-all-clean.sh

# Monitor service health
curl http://192.168.1.8:3001/health

# Check hardware connections
node scripts/test-basic-relay-control.js
```

## Emergency Procedures

### Emergency Relay Reset

```bash
# Reset all relays to OFF state
node scripts/emergency-relay-reset.js

# Close specific relay
node scripts/emergency-close-relay.js
```

### Service Recovery

```bash
# Kill all services
sudo killall node

# Wait for cleanup
sleep 5

# Restart in proper order
./scripts/start-all-clean.sh

# Verify functionality
node scripts/test-basic-relay-control.js
```

### Rollback Procedures

```bash
# Revert to previous version
git log --oneline -10  # Find previous commit
git revert <commit-hash>
npm run build:all

# Or use emergency reset
node scripts/emergency-relay-reset.js
```

## Success Metrics

After implementing these solutions:

- ✅ **Zero port conflicts** with proper service management
- ✅ **No 500 errors** after extended operation (30+ minutes)
- ✅ **Automatic connection recovery** when issues occur
- ✅ **Reliable relay activation** throughout operation
- ✅ **Clear error messages** with troubleshooting guidance

## Conclusion

The eForm Locker System's hardware integration requires careful management of serial port access, proper service coordination, and robust error handling. The key to reliable operation is:

1. **Proper Service Architecture**: Use queue-based control for production
2. **Smart Conflict Detection**: Automatic detection and graceful degradation
3. **Connection Lifecycle Management**: Automatic refresh and health monitoring
4. **Comprehensive Error Handling**: Clear messages and recovery procedures

By following these guidelines and using the provided diagnostic tools, the system can achieve reliable, long-term operation with minimal maintenance overhead.

---

**Last Updated**: August 2025  
**System Status**: Production Ready ✅  
**Hardware**: Raspberry Pi 4 + USB-RS485 + Waveshare Relay Cards