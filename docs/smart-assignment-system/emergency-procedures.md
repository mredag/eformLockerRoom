# Smart Locker Assignment System - Emergency Procedures

## Emergency Response Overview

This document provides step-by-step emergency procedures for critical issues with the Smart Locker Assignment System. These procedures prioritize system stability and user access to lockers.

## Emergency Classification

### Critical (Immediate Response Required)
- Complete system failure - no services responding
- Database corruption preventing all operations
- Hardware failure preventing locker access
- Security breach or unauthorized access

### High (Response within 15 minutes)
- Single service failure affecting core functionality
- Smart assignment system malfunction
- Performance degradation affecting user experience
- Configuration errors causing service instability

### Medium (Response within 1 hour)
- Non-critical feature failures
- Monitoring system alerts
- Log file issues
- Minor performance issues

## Emergency Response Procedures

### CRITICAL: Complete System Failure

**Symptoms**: No services responding, users cannot access lockers

**Immediate Actions** (Execute in order):

```bash
# 1. EMERGENCY STOP - Kill all processes
sudo pkill -9 -f "node"
sudo systemctl stop smart-assignment-* 2>/dev/null || true

# 2. ASSESS SYSTEM STATE
ps aux | grep node  # Verify no Node processes running
df -h  # Check disk space
free -h  # Check memory
uptime  # Check system load

# 3. EMERGENCY RESTORE - Use latest backup
cd /home/pi/eform-locker
LATEST_BACKUP=$(ls -t backups/ | head -n1)
echo "Using backup: $LATEST_BACKUP"

# Restore database
cp "backups/$LATEST_BACKUP/eform.db.backup" data/eform.db

# Restore configuration
cp "backups/$LATEST_BACKUP/system.json.backup" config/system.json

# 4. MINIMAL CONFIGURATION - Ensure basic functionality
cat > config/system.json << 'EOF'
{
  "lockers": {
    "total_count": 32,
    "offline_threshold_seconds": 60
  },
  "hardware": {
    "modbus": {
      "pulse_duration_ms": 400,
      "command_interval_ms": 300,
      "max_retries": 4
    }
  },
  "rate_limits": {
    "ip_per_minute": 20,
    "card_per_minute": 30,
    "locker_per_minute": 3
  }
}
EOF

# 5. START ESSENTIAL SERVICES ONLY
npm run start:kiosk &  # Hardware control - PRIORITY
sleep 10
npm run start:gateway &  # Admin access
sleep 5

# 6. VERIFY BASIC FUNCTIONALITY
curl http://localhost:3002/health
curl http://localhost:3000/health

# 7. TEST HARDWARE CONTROL
node scripts/test-basic-relay-control.js

# 8. DOCUMENT INCIDENT
echo "$(date): Emergency restore completed. Backup used: $LATEST_BACKUP" >> logs/emergency.log
```

**Recovery Time Objective**: 5 minutes
**Recovery Point Objective**: Last backup (maximum 24 hours data loss)

### CRITICAL: Database Corruption

**Symptoms**: Database errors, SQLite integrity check failures

**Immediate Actions**:

```bash
# 1. STOP ALL SERVICES
sudo pkill -f "node"

# 2. ASSESS DATABASE DAMAGE
cd /home/pi/eform-locker
sqlite3 data/eform.db "PRAGMA integrity_check;"

# If integrity check fails:
# 3. BACKUP CORRUPTED DATABASE (for analysis)
cp data/eform.db data/eform.db.corrupted-$(date +%Y%m%d-%H%M%S)

# 4. RESTORE FROM BACKUP
LATEST_BACKUP=$(ls -t backups/ | head -n1)
cp "backups/$LATEST_BACKUP/eform.db.backup" data/eform.db

# 5. VERIFY RESTORED DATABASE
sqlite3 data/eform.db "PRAGMA integrity_check;"
sqlite3 data/eform.db "SELECT COUNT(*) FROM lockers;"

# 6. RESTART SERVICES
npm run start:kiosk &
sleep 5
npm run start:gateway &

# 7. VERIFY FUNCTIONALITY
curl http://localhost:3002/health
```

### CRITICAL: Hardware Failure

**Symptoms**: Relays not responding, serial port errors

**Immediate Actions**:

```bash
# 1. CHECK HARDWARE CONNECTIONS
ls -la /dev/ttyUSB*
dmesg | tail -20  # Check for USB errors

# 2. TEST SERIAL PORT
sudo chmod 666 /dev/ttyUSB0
echo "Testing serial port..." > /dev/ttyUSB0

# 3. RESTART USB SUBSYSTEM (if needed)
sudo modprobe -r ftdi_sio
sudo modprobe ftdi_sio

# 4. EMERGENCY HARDWARE RESET
# Physical actions required:
# - Unplug USB-RS485 adapter
# - Wait 10 seconds
# - Reconnect adapter
# - Check for /dev/ttyUSB0

# 5. TEST HARDWARE CONTROL
node scripts/test-basic-relay-control.js

# 6. IF HARDWARE STILL FAILS - MANUAL OVERRIDE MODE
# Enable manual locker control via admin panel
# Document all affected lockers
# Contact hardware support
```

### HIGH: Smart Assignment System Failure

**Symptoms**: Smart assignment not working, feature flag issues

**Immediate Actions**:

```bash
# 1. DISABLE SMART ASSIGNMENT IMMEDIATELY
sqlite3 data/eform.db "UPDATE settings_global SET value='false' WHERE key='smart_assignment_enabled';"

# 2. VERIFY MANUAL MODE WORKS
# Test RFID card scanning
# Verify manual locker selection appears

# 3. CHECK SMART ASSIGNMENT TABLES
sqlite3 data/eform.db "SELECT COUNT(*) FROM smart_sessions WHERE status='active';"
sqlite3 data/eform.db "SELECT COUNT(*) FROM assignment_metrics WHERE DATE(assignment_time) = DATE('now');"

# 4. CLEAR PROBLEMATIC SESSIONS (if needed)
sqlite3 data/eform.db "UPDATE smart_sessions SET status='cancelled' WHERE status='active';"

# 5. RESTART SERVICES
sudo pkill -f "node.*kiosk"
npm run start:kiosk &

# 6. VERIFY MANUAL MODE FUNCTIONALITY
# Test with known RFID card
# Verify locker selection UI appears
```

### HIGH: Service Failure

**Symptoms**: One or more services not responding

**Immediate Actions**:

```bash
# 1. IDENTIFY FAILED SERVICE
curl http://localhost:3000/health  # Gateway
curl http://localhost:3002/health  # Kiosk  
curl http://localhost:3001/health  # Panel

# 2. CHECK SERVICE LOGS
tail -50 logs/gateway.log
tail -50 logs/kiosk.log
tail -50 logs/panel.log

# 3. RESTART FAILED SERVICE
# For Gateway:
sudo pkill -f "node.*gateway"
npm run start:gateway &

# For Kiosk (CRITICAL - handles hardware):
sudo pkill -f "node.*kiosk"
npm run start:kiosk &

# For Panel:
sudo pkill -f "node.*panel"
npm run start:panel &

# 4. VERIFY SERVICE RESTART
sleep 10
curl http://localhost:3000/health
curl http://localhost:3002/health
curl http://localhost:3001/health

# 5. TEST CORE FUNCTIONALITY
# Test RFID scanning
# Test admin panel access
# Test hardware control
```

## Emergency Rollback Procedures

### Immediate Rollback (Under 2 minutes)

```bash
#!/bin/bash
# Emergency rollback script - save as emergency-rollback.sh

echo "EMERGENCY ROLLBACK INITIATED: $(date)"

# Stop all services
sudo pkill -9 -f "node"

# Find latest backup
LATEST_BACKUP=$(ls -t backups/ | head -n1)
echo "Using backup: $LATEST_BACKUP"

# Restore database
cp "backups/$LATEST_BACKUP/eform.db.backup" data/eform.db

# Restore configuration  
cp "backups/$LATEST_BACKUP/system.json.backup" config/system.json

# Start essential services
npm run start:kiosk &
sleep 5
npm run start:gateway &

echo "EMERGENCY ROLLBACK COMPLETED: $(date)"
echo "Verify functionality and check logs"
```

### Smart Assignment Disable (Under 30 seconds)

```bash
#!/bin/bash
# Disable smart assignment immediately

echo "DISABLING SMART ASSIGNMENT: $(date)"

# Disable in database
sqlite3 data/eform.db "UPDATE settings_global SET value='false' WHERE key='smart_assignment_enabled';"

# Restart kiosk service to pick up change
sudo pkill -f "node.*kiosk"
npm run start:kiosk &

echo "SMART ASSIGNMENT DISABLED: $(date)"
```

## Emergency Contact Information

### Internal Contacts
- **System Administrator**: [Name] - [Phone] - [Email]
- **Hardware Technician**: [Name] - [Phone] - [Email]  
- **Database Administrator**: [Name] - [Phone] - [Email]

### External Contacts
- **Hardware Vendor Support**: [Phone] - [Email]
- **Hosting Provider**: [Phone] - [Email]
- **Network Support**: [Phone] - [Email]

### Escalation Matrix
1. **Level 1** (0-15 min): On-site technician
2. **Level 2** (15-60 min): System administrator
3. **Level 3** (1-4 hours): Vendor support
4. **Level 4** (4+ hours): Management escalation

## Emergency Tools and Scripts

### Quick Diagnostic Script

```bash
#!/bin/bash
# emergency-diagnostics.sh - Quick system assessment

echo "=== EMERGENCY DIAGNOSTICS ==="
echo "Time: $(date)"
echo

echo "=== SYSTEM STATUS ==="
uptime
free -h
df -h /home/pi/eform-locker

echo "=== SERVICE STATUS ==="
curl -s http://localhost:3000/health && echo "Gateway: OK" || echo "Gateway: FAILED"
curl -s http://localhost:3002/health && echo "Kiosk: OK" || echo "Kiosk: FAILED"  
curl -s http://localhost:3001/health && echo "Panel: OK" || echo "Panel: FAILED"

echo "=== PROCESS STATUS ==="
pgrep -f "node.*gateway" && echo "Gateway process: Running" || echo "Gateway process: STOPPED"
pgrep -f "node.*kiosk" && echo "Kiosk process: Running" || echo "Kiosk process: STOPPED"
pgrep -f "node.*panel" && echo "Panel process: Running" || echo "Panel process: STOPPED"

echo "=== DATABASE STATUS ==="
if sqlite3 data/eform.db "SELECT 1;" &>/dev/null; then
    echo "Database: Accessible"
    echo "Lockers count: $(sqlite3 data/eform.db 'SELECT COUNT(*) FROM lockers;')"
else
    echo "Database: FAILED"
fi

echo "=== HARDWARE STATUS ==="
if [ -c "/dev/ttyUSB0" ]; then
    echo "Serial port: Available"
else
    echo "Serial port: NOT AVAILABLE"
fi

echo "=== RECENT ERRORS ==="
tail -10 logs/*.log | grep -i error || echo "No recent errors found"
```

### Emergency Hardware Test

```bash
#!/bin/bash
# emergency-hardware-test.sh - Test basic hardware functionality

echo "=== EMERGENCY HARDWARE TEST ==="

# Test serial port
if [ -c "/dev/ttyUSB0" ]; then
    echo "✓ Serial port available"
    
    # Test basic communication
    if node scripts/test-basic-relay-control.js &>/dev/null; then
        echo "✓ Hardware communication OK"
    else
        echo "✗ Hardware communication FAILED"
    fi
else
    echo "✗ Serial port NOT AVAILABLE"
fi

# Test specific relay
echo "Testing relay 1..."
node -e "
const ModbusController = require('./shared/services/modbus-controller');
const controller = new ModbusController();
controller.openLocker(1).then(result => {
    console.log(result ? '✓ Relay test PASSED' : '✗ Relay test FAILED');
    process.exit(result ? 0 : 1);
}).catch(err => {
    console.log('✗ Relay test ERROR:', err.message);
    process.exit(1);
});
"
```

## Emergency Communication Templates

### Critical Incident Notification

```
SUBJECT: CRITICAL - eForm Locker System Emergency

INCIDENT: [Brief description]
TIME: [Timestamp]
IMPACT: [User impact description]
STATUS: [In Progress/Resolved]

IMMEDIATE ACTIONS TAKEN:
- [Action 1]
- [Action 2]

CURRENT STATUS:
- Services: [Status]
- User Access: [Available/Limited/Unavailable]
- ETA for Resolution: [Time estimate]

NEXT UPDATE: [Time]
CONTACT: [Emergency contact info]
```

### Resolution Notification

```
SUBJECT: RESOLVED - eForm Locker System Emergency

INCIDENT: [Brief description]
RESOLUTION TIME: [Duration]
ROOT CAUSE: [Brief explanation]

SERVICES RESTORED:
- Gateway: [Status]
- Kiosk: [Status]  
- Panel: [Status]

USER IMPACT: [Description of any ongoing effects]

FOLLOW-UP ACTIONS:
- [Action 1]
- [Action 2]

INCIDENT REPORT: [Will be provided within 24 hours]
```

## Post-Emergency Procedures

### Immediate Post-Emergency (0-1 hour)
1. **Verify full system functionality**
2. **Document all actions taken**
3. **Notify stakeholders of resolution**
4. **Monitor system stability**
5. **Begin root cause analysis**

### Short-term Follow-up (1-24 hours)
1. **Complete incident report**
2. **Review and update emergency procedures**
3. **Implement immediate preventive measures**
4. **Schedule system health review**
5. **Update monitoring and alerting**

### Long-term Follow-up (1-7 days)
1. **Conduct post-incident review meeting**
2. **Update documentation and procedures**
3. **Implement systemic improvements**
4. **Review and test backup procedures**
5. **Update emergency contact information**

## Emergency Preparedness Checklist

### Monthly Checks
- [ ] Test emergency rollback procedures
- [ ] Verify backup integrity and accessibility
- [ ] Update emergency contact information
- [ ] Review and practice emergency procedures
- [ ] Test monitoring and alerting systems

### Quarterly Checks
- [ ] Conduct emergency response drill
- [ ] Review and update emergency procedures
- [ ] Test hardware emergency procedures
- [ ] Validate emergency communication templates
- [ ] Update emergency toolkit and scripts

### Annual Checks
- [ ] Complete emergency preparedness audit
- [ ] Update business continuity plans
- [ ] Review emergency response training
- [ ] Evaluate and improve emergency procedures
- [ ] Update disaster recovery documentation

This emergency procedures document ensures rapid response to critical issues while maintaining system integrity and user access to locker services.