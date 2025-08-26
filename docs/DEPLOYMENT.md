# Production Deployment Guide

## 🚀 E2E Testing & Production Deployment

This guide covers the complete end-to-end testing and production deployment process for the Eform Locker Control System.

## 📋 Pre-flight Checklist

### Hardware Configuration

**DIP Switch Settings:**
- **Waveshare Card 1**: DIP switches set to address 1
- **Waveshare Card 2**: DIP switches set to address 2  
- **DIP switch 9**: OFF (9600 baud rate)
- **DIP switch 10**: OFF (no parity)

**RS-485 Connection:**
```bash
# Find your RS-485 converter
ls /dev/serial/by-id/

# Example output:
# usb-FTDI_FT232R_USB_UART_A12345-if00-port0

# Set the correct device path
export MODBUS_PORT="/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A12345-if00-port0"
```

**Permissions (Linux):**
```bash
# Add user to dialout group
sudo usermod -a -G dialout $USER

# Verify membership
groups | grep dialout
```

### Environment Configuration

Create your environment configuration:

```bash
# Database
export EFORM_DB_PATH="/home/pi/eform-locker/data/eform.db"

# Kiosk Identity
export KIOSK_ID="KIOSK-1"

# Modbus Configuration
export MODBUS_PORT="/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_XXXX-if00-port0"
export MODBUS_BAUD="9600"
export MODBUS_PARITY="none"
export PULSE_DURATION_MS="400"
export COMMAND_INTERVAL_MS="300"
export MAX_RETRIES="2"

# Service Ports
export GATEWAY_PORT="3000"
export PANEL_PORT="3003"  # Note: Panel runs on 3003
export KIOSK_PORT="3002"
```

## 🏗️ Build & Setup

```bash
# Install dependencies
npm install

# Build all services
npm run build

# Run database migrations
npm run migrate

# Verify database
ls -la data/eform.db
```

## 🚀 Service Startup

### Option 1: Production Startup Script
```bash
# Start all services with proper logging
node scripts/production-startup.js
```

### Option 2: Manual Service Start
```bash
# Terminal 1 - Gateway
cd app/gateway && npm start

# Terminal 2 - Panel  
cd app/panel && npm start

# Terminal 3 - Kiosk
cd app/kiosk && npm start
```

### Expected Boot Logs

Each service should print:
- ✅ Absolute database path
- ✅ SQLite PRAGMAs (WAL, busy_timeout=5000, foreign_keys=ON)
- ✅ Service version and startup timestamp
- ✅ Kiosk hardware configuration (MODBUS_PORT, baud rate, etc.)

Example:
```
🗄️  Connected to SQLite database
📍 Absolute database path: /home/pi/eform-locker/data/eform.db
🔧 Database PRAGMAs initialized:
   - journal_mode = WAL
   - synchronous = NORMAL
   - foreign_keys = ON
   - busy_timeout = 5000
```

## 🧪 E2E Testing Protocol

Run the comprehensive test suite:

```bash
node scripts/e2e-production-checklist.js
```

### Test 1: Single Open

**Request:**
```bash
POST /api/lockers/KIOSK-1/7/open
Content-Type: application/json

{
  "reason": "E2E single open test",
  "override": false
}
```

**Expected Response (202):**
```json
{
  "success": true,
  "command_id": "cmd_abc123",
  "message": "Command enqueued"
}
```

**Expected Kiosk Logs:**
```
[Kiosk] 📤 Opening locker 7 (Card 1, Coil 7)
[Kiosk] 🔧 Using 0x0F (Write Multiple Coils)
[Kiosk] ✅ Relay pulse successful (400ms)
[Kiosk] 🔍 Read-coils verification: OFF
[Kiosk] ✅ Command cmd_abc123 completed (duration: 450ms)
```

### Test 2: Bulk Open

**Request:**
```bash
POST /api/lockers/bulk/open
Content-Type: application/json

{
  "kioskId": "KIOSK-1",
  "lockerIds": [1, 2, 18],
  "reason": "E2E bulk open test",
  "exclude_vip": true,
  "interval_ms": 300
}
```

**Expected Response (202):**
```json
{
  "success": true,
  "command_id": "bulk_xyz789",
  "processed": 3
}
```

**Expected Behavior:**
- Total time ≈ 3 × 300ms + pulse overhead
- Locker 1: Card 1, Coil 1
- Locker 2: Card 1, Coil 2  
- Locker 18: Card 2, Coil 2 (18 → card 2, relay 2)
- Individual logs per locker
- Continue on errors

### Test 3: Duplicate Prevention

**Scenario:**
1. Issue single open command
2. Immediately issue identical command

**Expected Results:**
- First request: 202 (accepted)
- Second request: 409 (conflict)
- No double pulse on hardware

### Test 4: Offline Recovery

**Manual Test:**
1. Stop kiosk service
2. Enqueue single open command via panel
3. Start kiosk service
4. Verify command executes and completes

### Test 5: Failure Path

**Manual Test:**
1. Set wrong `MODBUS_PORT` or unplug RS-485
2. Issue open command
3. Verify command fails with `error_message`
4. Restore connection and retry → should work

### Test 6: Stale Command Recovery

**Manual Test:**
1. Start open command
2. Kill kiosk process while executing
3. Restart kiosk service
4. Verify stale commands (>120s) are recovered
5. No commands remain stuck in executing state

## 📊 Database Verification

Run these queries to verify system state:

```sql
-- Command Queue Status
SELECT command_id, status, started_at, completed_at, duration_ms 
FROM command_queue 
ORDER BY created_at DESC LIMIT 10;

-- Recent Events  
SELECT kiosk_id, locker_id, event_type, details 
FROM events 
ORDER BY timestamp DESC LIMIT 10;
```

## 🎯 Success Criteria

All of the following must be verified:

1. ✅ **Relays pulse for the right lockers**
2. ✅ **Status flows**: pending → executing → completed or failed
3. ✅ **No concurrent opens** for the same locker
4. ✅ **Bulk operations honor** `interval_ms`
5. ✅ **Logs include**: command_id, kiosk_id, locker_id, staff_user, reason, duration_ms
6. ✅ **Database reflects** events and timings
7. ✅ **Duplicate requests** return 409
8. ✅ **Failed commands** have error_message
9. ✅ **Stale commands** are recovered on restart

## 🔧 Systemd Configuration

Create `/etc/systemd/system/eform-kiosk.service`:

```ini
[Unit]
Description=Eform Kiosk Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/eform-locker
ExecStart=/usr/bin/node app/kiosk/dist/index.js
Restart=always
RestartSec=5

Environment=EFORM_DB_PATH=/home/pi/eform-locker/data/eform.db
Environment=KIOSK_ID=KIOSK-1
Environment=MODBUS_PORT=/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_XXXX-if00-port0
Environment=MODBUS_BAUD=9600
Environment=MODBUS_PARITY=none
Environment=PULSE_DURATION_MS=400
Environment=COMMAND_INTERVAL_MS=300
Environment=MAX_RETRIES=2

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable eform-kiosk
sudo systemctl start eform-kiosk
sudo systemctl status eform-kiosk
```

## 🚨 Troubleshooting

### If Tests Fail

Provide the following information:

1. **The 202 JSON response**
2. **The kiosk log lines** for the same command_id
3. **The two DB rows** from the verification queries

### Common Issues

**Permission Denied on Serial Port:**
```bash
sudo usermod -a -G dialout $USER
# Log out and back in
```

**Database Lock Errors:**
```bash
# Check for zombie processes
ps aux | grep node
# Kill if necessary
sudo pkill -f "node.*kiosk"
```

**Hardware Not Responding:**
```bash
# Check device exists
ls -la /dev/serial/by-id/
# Test with different baud rate
export MODBUS_BAUD=19200
```

## 📈 Monitoring

### Real-time Logs
```bash
# Follow all service logs
tail -f /var/log/eform-*.log

# Or with journalctl
journalctl -f -u eform-kiosk
```

### Health Checks
```bash
# Service health
curl http://localhost:3000/health  # Gateway
curl http://localhost:3003/health  # Panel  
curl http://localhost:3002/health  # Kiosk

# Database status
sqlite3 /home/pi/eform-locker/data/eform.db "PRAGMA integrity_check;"
```

## ✅ Production Deployment

Once all E2E tests pass:

1. ✅ Configure systemd services
2. ✅ Set up log rotation
3. ✅ Configure firewall rules
4. ✅ Set up monitoring/alerting
5. ✅ Create backup procedures
6. ✅ Document operational procedures

**🎉 System is ready for production deployment!**