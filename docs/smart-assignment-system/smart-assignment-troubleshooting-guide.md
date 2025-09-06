# Smart Locker Assignment Troubleshooting Guide

## Overview

This guide provides comprehensive troubleshooting procedures for the Smart Locker Assignment system. It covers common issues, diagnostic procedures, and resolution steps for both operational and technical problems.

## Quick Diagnostic Checklist

### System Health Check

```bash
# 1. Check service status
curl http://localhost:3000/health  # Gateway
curl http://localhost:3002/health  # Kiosk
curl http://localhost:3001/health  # Panel

# 2. Check feature flag status
curl http://localhost:3000/api/admin/feature-flags

# 3. Check configuration version
curl http://localhost:3000/api/admin/config/version

# 4. Check active alerts
curl http://localhost:3000/api/admin/alerts/active

# 5. Test hardware connectivity
node scripts/test-basic-relay-control.js
```

### Log Analysis Commands

```bash
# Check for errors in the last hour
tail -1000 logs/gateway.log | grep -i error
tail -1000 logs/kiosk.log | grep -i error
tail -1000 logs/panel.log | grep -i error

# Monitor assignment activity
tail -f logs/kiosk.log | grep -i "assignment\|card\|locker"

# Check configuration changes
tail -100 logs/gateway.log | grep -i "config"

# Monitor hardware commands
tail -f logs/kiosk.log | grep -i "modbus\|relay\|hardware"
```

## Common Issues and Solutions

### 1. Smart Assignment Not Working

#### Symptoms
- Cards show manual locker selection instead of automatic assignment
- API returns `show_selection` action instead of assignment
- No assignment logs in kiosk service

#### Diagnostic Steps

```bash
# Check feature flag status
curl http://localhost:3000/api/admin/feature-flags

# Check kiosk-specific configuration
curl http://localhost:3000/api/admin/config/effective/kiosk-1

# Verify configuration propagation
curl http://localhost:3002/api/debug/configuration
```

#### Solutions

**Feature Flag Disabled**:
```bash
# Enable smart assignment globally
curl -X PUT http://localhost:3000/api/admin/feature-flags/smart_assignment_enabled \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "admin_user": "troubleshoot"}'

# Enable for specific kiosk
curl -X PUT http://localhost:3000/api/admin/feature-flags/smart_assignment_enabled \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "kiosk_id": "kiosk-1", "admin_user": "troubleshoot"}'
```

**Configuration Not Propagated**:
```bash
# Force configuration reload
curl -X POST http://localhost:3000/api/admin/config/reload

# Check propagation time
tail -20 logs/gateway.log | grep "Config loaded"
```

**Service Restart Required**:
```bash
# Restart kiosk service
sudo pkill -f "node.*kiosk"
npm run start:kiosk &

# Verify service startup
curl http://localhost:3002/health
```

### 2. No Available Lockers (Frequent No Stock)

#### Symptoms
- Frequent "Boş dolap yok. Görevliye başvurun" messages
- High no_stock alert frequency
- Users unable to get assignments during normal capacity

#### Diagnostic Steps

```bash
# Check current locker states
sqlite3 data/eform.db "
SELECT 
  status, 
  COUNT(*) as count,
  COUNT(*) * 100.0 / (SELECT COUNT(*) FROM lockers) as percentage
FROM lockers 
GROUP BY status;"

# Check quarantine status
sqlite3 data/eform.db "
SELECT COUNT(*) as quarantined_count
FROM lockers 
WHERE quarantine_until > datetime('now');"

# Check reserve capacity settings
curl http://localhost:3000/api/admin/config/effective/kiosk-1 | grep -E "reserve_ratio|reserve_minimum"

# Check stock metrics
curl http://localhost:3000/api/admin/metrics/dashboard | grep -E "available|occupied|quarantined"
```

#### Solutions

**Too Many Quarantined Lockers**:
```bash
# Reduce quarantine duration temporarily
curl -X PUT http://localhost:3000/api/admin/config/global \
  -H "Content-Type: application/json" \
  -d '{"updates": {"quarantine_min_ceiling": 10, "quarantine_min_floor": 2}, "updated_by": "troubleshoot"}'

# Clear stuck quarantine manually (emergency)
sqlite3 data/eform.db "UPDATE lockers SET quarantine_until = NULL WHERE quarantine_until < datetime('now', '+1 hour');"
```

**Reserve Capacity Too High**:
```bash
# Reduce reserve capacity temporarily
curl -X PUT http://localhost:3000/api/admin/config/global \
  -H "Content-Type: application/json" \
  -d '{"updates": {"reserve_ratio": 0.05, "reserve_minimum": 1}, "updated_by": "troubleshoot"}'
```

**Stuck Overdue Lockers**:
```bash
# Check overdue lockers
curl http://localhost:3000/api/admin/lockers/overdue

# Force clear overdue lockers (with admin approval)
curl -X POST http://localhost:3000/api/admin/lockers/overdue/kiosk-1/8/force-open \
  -H "Content-Type: application/json" \
  -d '{"admin_user": "troubleshoot", "reason": "Emergency capacity recovery"}'
```

### 3. Hardware Communication Failures

#### Symptoms
- "Şu an işlem yapılamıyor" messages
- Relay commands timing out
- Hardware error logs in kiosk service

#### Diagnostic Steps

```bash
# Test basic hardware connectivity
node scripts/test-basic-relay-control.js

# Check serial port availability
ls -la /dev/ttyUSB*
sudo lsof /dev/ttyUSB0

# Test Modbus communication
node scripts/test-relays-1-8.js

# Check hardware error logs
tail -50 logs/kiosk.log | grep -i "modbus\|serial\|hardware\|error"
```

#### Solutions

**Serial Port Conflicts**:
```bash
# Kill conflicting processes
sudo pkill -f "node.*"
sudo lsof /dev/ttyUSB0 | awk 'NR>1 {print $2}' | xargs sudo kill

# Restart kiosk service
npm run start:kiosk &
```

**Hardware Connection Issues**:
```bash
# Check USB connections
lsusb | grep -i "serial\|usb"

# Reset USB device
sudo modprobe -r ftdi_sio
sudo modprobe ftdi_sio

# Test with different baud rate (if needed)
# Edit hardware configuration in config/system.json
```

**Modbus Communication Errors**:
```bash
# Increase hardware timeouts temporarily
curl -X PUT http://localhost:3000/api/admin/config/global \
  -H "Content-Type: application/json" \
  -d '{"updates": {"pulse_ms": 1200, "command_cooldown_seconds": 5}, "updated_by": "troubleshoot"}'

# Test individual relay cards
node -e "
const ModbusController = require('./shared/hardware/modbus-controller');
const controller = new ModbusController();
controller.testCard(1).then(console.log);
"
```

### 4. Assignment Conflicts and Race Conditions

#### Symptoms
- Multiple users assigned to same locker
- Assignment conflict errors in logs
- Database constraint violations

#### Diagnostic Steps

```bash
# Check for duplicate assignments
sqlite3 data/eform.db "
SELECT locker_id, COUNT(*) as assignment_count
FROM (
  SELECT kiosk_id || '-' || id as locker_id
  FROM lockers 
  WHERE status = 'Owned'
) 
GROUP BY locker_id 
HAVING assignment_count > 1;"

# Check assignment metrics for conflict rate
curl http://localhost:3000/api/admin/metrics/dashboard | grep conflict_rate

# Monitor concurrent assignment attempts
tail -f logs/kiosk.log | grep -i "assignment.*conflict\|transaction.*retry"
```

#### Solutions

**Database Lock Conflicts**:
```bash
# Check database WAL mode
sqlite3 data/eform.db "PRAGMA journal_mode;"

# Enable WAL mode if not already enabled
sqlite3 data/eform.db "PRAGMA journal_mode=WAL;"

# Optimize database
sqlite3 data/eform.db "PRAGMA optimize;"
```

**High Concurrency Issues**:
```bash
# Increase assignment timeout temporarily
curl -X PUT http://localhost:3000/api/admin/config/global \
  -H "Content-Type: application/json" \
  -d '{"updates": {"assignment_timeout_ms": 2000}, "updated_by": "troubleshoot"}'

# Reduce concurrent load with rate limiting
curl -X PUT http://localhost:3000/api/admin/config/global \
  -H "Content-Type: application/json" \
  -d '{"updates": {"card_rate_limit_seconds": 15}, "updated_by": "troubleshoot"}'
```

### 5. Session Management Issues

#### Symptoms
- Sessions not expiring properly
- Extension failures
- Overdue detection not working

#### Diagnostic Steps

```bash
# Check active sessions
curl http://localhost:3000/api/admin/sessions/live

# Check session configuration
curl http://localhost:3000/api/admin/config/effective/kiosk-1 | grep session

# Check overdue sessions
sqlite3 data/eform.db "
SELECT id, card_id, start_time, expires_time, status
FROM smart_sessions 
WHERE status = 'overdue' OR expires_time < datetime('now');"

# Monitor session lifecycle
tail -f logs/kiosk.log | grep -i "session"
```

#### Solutions

**Sessions Not Expiring**:
```bash
# Check session cleanup service
curl http://localhost:3000/api/debug/session-cleanup-status

# Force session cleanup
curl -X POST http://localhost:3000/api/admin/sessions/cleanup \
  -H "Content-Type: application/json" \
  -d '{"admin_user": "troubleshoot", "force": true}'
```

**Extension Failures**:
```bash
# Check extension limits
sqlite3 data/eform.db "
SELECT id, extension_count, max_extensions
FROM smart_sessions 
WHERE extension_count >= max_extensions;"

# Reset extension count (emergency)
sqlite3 data/eform.db "
UPDATE smart_sessions 
SET extension_count = 0 
WHERE id = 'session-id-here';"
```

### 6. Configuration Hot Reload Issues

#### Symptoms
- Configuration changes not taking effect
- Services using old configuration values
- Inconsistent behavior across services

#### Diagnostic Steps

```bash
# Check configuration version across services
curl http://localhost:3000/api/admin/config/version  # Gateway
curl http://localhost:3002/api/debug/config-version  # Kiosk
curl http://localhost:3001/api/debug/config-version  # Panel

# Check configuration propagation logs
tail -50 logs/gateway.log | grep -i "config.*version\|reload"

# Test configuration polling
curl http://localhost:3000/api/debug/config-poll-status
```

#### Solutions

**Version Mismatch**:
```bash
# Force reload on all services
curl -X POST http://localhost:3000/api/admin/config/reload

# Check individual service reload
curl -X POST http://localhost:3002/api/debug/reload-config
curl -X POST http://localhost:3001/api/debug/reload-config

# Verify version synchronization
for port in 3000 3002 3001; do
  echo "Port $port: $(curl -s http://localhost:$port/api/debug/config-version)"
done
```

**Polling Service Issues**:
```bash
# Restart configuration polling
curl -X POST http://localhost:3000/api/debug/restart-config-polling

# Check polling interval
curl http://localhost:3000/api/debug/config-poll-interval
```

### 7. Alert System Issues

#### Symptoms
- Alerts not triggering when they should
- Alerts not clearing automatically
- False positive alerts

#### Diagnostic Steps

```bash
# Check alert configuration
curl http://localhost:3000/api/admin/alerts/config

# Check alert history
curl http://localhost:3000/api/admin/alerts/history?limit=20

# Check alert thresholds
curl http://localhost:3000/api/admin/metrics/dashboard | grep -E "no_stock|conflict_rate|retry_rate"

# Monitor alert processing
tail -f logs/gateway.log | grep -i alert
```

#### Solutions

**Alerts Not Triggering**:
```bash
# Check alert monitoring service
curl http://localhost:3000/api/debug/alert-monitor-status

# Force alert check
curl -X POST http://localhost:3000/api/debug/check-alerts \
  -H "Content-Type: application/json" \
  -d '{"kiosk_id": "kiosk-1"}'

# Verify threshold calculations
curl http://localhost:3000/api/debug/alert-thresholds/kiosk-1
```

**Alerts Not Clearing**:
```bash
# Check auto-clear conditions
curl http://localhost:3000/api/admin/alerts/active | grep auto_clear

# Force clear stuck alerts
curl -X POST http://localhost:3000/api/admin/alerts/alert-id-here/clear \
  -H "Content-Type: application/json" \
  -d '{"admin_user": "troubleshoot", "reason": "Manual intervention"}'
```

## Performance Issues

### 8. Slow Assignment Response Times

#### Symptoms
- Assignment taking >1 second
- Timeout errors during peak usage
- Poor user experience

#### Diagnostic Steps

```bash
# Check assignment performance metrics
curl http://localhost:3000/api/admin/metrics/dashboard | grep assignment_time

# Monitor assignment duration
tail -f logs/kiosk.log | grep -i "assignment.*duration\|assignment.*ms"

# Check database performance
sqlite3 data/eform.db "EXPLAIN QUERY PLAN SELECT * FROM lockers WHERE status = 'Free';"

# Check system resources
top -p $(pgrep -f "node.*kiosk")
```

#### Solutions

**Database Optimization**:
```bash
# Rebuild database indexes
sqlite3 data/eform.db "REINDEX;"

# Analyze query performance
sqlite3 data/eform.db "ANALYZE;"

# Check for missing indexes
sqlite3 data/eform.db ".schema lockers"
```

**Algorithm Optimization**:
```bash
# Reduce candidate pool size temporarily
curl -X PUT http://localhost:3000/api/admin/config/global \
  -H "Content-Type: application/json" \
  -d '{"updates": {"top_k_candidates": 3}, "updated_by": "troubleshoot"}'

# Simplify scoring algorithm
curl -X PUT http://localhost:3000/api/admin/config/global \
  -H "Content-Type: application/json" \
  -d '{"updates": {"score_factor_d": 0}, "updated_by": "troubleshoot"}'
```

### 9. Memory Leaks and Resource Issues

#### Symptoms
- Increasing memory usage over time
- Service crashes during high load
- System becoming unresponsive

#### Diagnostic Steps

```bash
# Monitor memory usage
ps aux | grep node | awk '{print $2, $4, $6, $11}' | sort -k3 -nr

# Check for memory leaks
node --inspect=9229 app/kiosk/dist/index.js &
# Use Chrome DevTools to connect and profile

# Monitor file descriptors
lsof -p $(pgrep -f "node.*kiosk") | wc -l

# Check event loop lag
curl http://localhost:3002/api/debug/event-loop-lag
```

#### Solutions

**Memory Cleanup**:
```bash
# Force garbage collection (if enabled)
curl -X POST http://localhost:3002/api/debug/gc

# Restart services with memory monitoring
NODE_OPTIONS="--max-old-space-size=512" npm run start:kiosk &

# Clear session cache
curl -X POST http://localhost:3002/api/debug/clear-session-cache
```

**Resource Limits**:
```bash
# Set process limits
ulimit -n 1024  # File descriptors
ulimit -v 1048576  # Virtual memory (1GB)

# Monitor resource usage
watch -n 5 'ps aux | grep node'
```

## Emergency Procedures

### 10. Emergency Disable Smart Assignment

```bash
# Immediate disable (all kiosks)
curl -X PUT http://localhost:3000/api/admin/feature-flags/smart_assignment_enabled \
  -H "Content-Type: application/json" \
  -d '{"enabled": false, "admin_user": "emergency"}'

# Verify manual mode is working
curl -X POST http://localhost:3002/api/rfid/handle-card \
  -H "Content-Type: application/json" \
  -d '{"card_id": "test", "kiosk_id": "kiosk-1"}'
```

### 11. Emergency Locker Release

```bash
# Release all stuck lockers (EXTREME CAUTION)
sqlite3 data/eform.db "
UPDATE lockers 
SET status = 'Free', 
    owner_type = NULL, 
    owner_key = NULL, 
    quarantine_until = NULL,
    return_hold_until = NULL
WHERE status IN ('Owned', 'Opening', 'Error');"

# Log the emergency action
echo "$(date): Emergency locker release performed" >> logs/emergency.log
```

### 12. Emergency Hardware Reset

```bash
# Reset all relays to OFF state
node scripts/emergency-relay-reset.js

# Test hardware connectivity
node scripts/test-basic-relay-control.js

# Restart hardware service
sudo pkill -f "node.*kiosk"
sleep 5
npm run start:kiosk &
```

## Monitoring and Prevention

### Proactive Monitoring Setup

```bash
# Set up continuous monitoring
watch -n 30 'curl -s http://localhost:3000/api/admin/metrics/dashboard | grep -E "success_rate|assignment_time|no_stock"'

# Monitor log files for errors
tail -f logs/*.log | grep -i "error\|failed\|timeout" | tee logs/error-monitor.log

# Set up alert notifications (example with email)
curl http://localhost:3000/api/admin/alerts/active | \
  jq '.active_alerts[] | select(.severity == "high" or .severity == "critical")' | \
  mail -s "Smart Locker Alert" admin@example.com
```

### Health Check Script

```bash
#!/bin/bash
# smart-assignment-health-check.sh

echo "=== Smart Assignment Health Check ==="
echo "Timestamp: $(date)"

# Service health
echo "Service Health:"
for port in 3000 3002 3001; do
  status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/health)
  echo "  Port $port: $status"
done

# Feature flag status
echo "Feature Flags:"
curl -s http://localhost:3000/api/admin/feature-flags | jq '.feature_flags.smart_assignment_enabled'

# Active alerts
echo "Active Alerts:"
alert_count=$(curl -s http://localhost:3000/api/admin/alerts/active | jq '.total_active')
echo "  Total: $alert_count"

# Stock status
echo "Stock Status:"
curl -s http://localhost:3000/api/admin/metrics/dashboard | jq '.stock_status'

# Recent errors
echo "Recent Errors (last 10 minutes):"
find logs/ -name "*.log" -exec grep -l "$(date -d '10 minutes ago' '+%Y-%m-%d %H:')" {} \; | \
  xargs grep -i error | tail -5

echo "=== Health Check Complete ==="
```

### Log Rotation and Cleanup

```bash
# Set up log rotation
cat > /etc/logrotate.d/smart-locker << EOF
/path/to/eform-locker/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 pi pi
    postrotate
        pkill -USR1 node
    endscript
}
EOF

# Manual log cleanup
find logs/ -name "*.log" -mtime +7 -delete
```

## Escalation Procedures

### Level 1: Operational Issues
- Check service health and restart if needed
- Verify configuration settings
- Clear temporary issues (quarantine, rate limits)
- Monitor for 30 minutes

### Level 2: System Issues
- Analyze logs for error patterns
- Check database integrity
- Test hardware connectivity
- Consider temporary configuration changes

### Level 3: Critical Issues
- Emergency disable smart assignment
- Manual locker management
- Database backup and recovery
- Hardware replacement procedures
- Contact system administrator

### Documentation and Reporting

After resolving any issue:

1. **Document the Problem**: Record symptoms, root cause, and resolution
2. **Update Monitoring**: Add checks to prevent recurrence
3. **Review Configuration**: Assess if configuration changes are needed
4. **Update Procedures**: Improve troubleshooting documentation
5. **Team Communication**: Share lessons learned with operations team

This troubleshooting guide provides comprehensive procedures for diagnosing and resolving issues in the Smart Locker Assignment system, ensuring reliable operation and quick recovery from problems.