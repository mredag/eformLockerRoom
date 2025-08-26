# eForm Locker System - Monitoring & Troubleshooting Guide

## 📊 **System Monitoring Overview**

This guide provides comprehensive monitoring strategies, log analysis techniques, and troubleshooting procedures for the eForm Locker System.

## 🔍 **Service Health Monitoring**

### **Automated Health Checks**

#### **Quick Health Check Script**
```bash
#!/bin/bash
# File: scripts/health-check.sh

echo "=== eForm Locker System Health Check ==="
echo "Timestamp: $(date)"
echo ""

# Service health checks
echo "🔍 Service Health:"
services=("gateway:3000" "panel:3001" "kiosk:3002")

for service in "${services[@]}"; do
    name="${service%:*}"
    port="${service#*:}"
    
    if curl -s --max-time 5 "http://localhost:${port}/health" > /dev/null; then
        echo "✅ ${name^} (port ${port}): HEALTHY"
    else
        echo "❌ ${name^} (port ${port}): DOWN"
    fi
done

echo ""

# System resources
echo "💻 System Resources:"
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
echo "Memory Usage: $(free -m | awk 'NR==2{printf "%.1f%%", $3*100/$2}')"
echo "Disk Usage: $(df -h / | awk 'NR==2{print $5}')"
echo "Load Average: $(uptime | awk -F'load average:' '{print $2}')"

echo ""

# Hardware status
echo "🔧 Hardware Status:"
if ls /dev/ttyUSB* > /dev/null 2>&1; then
    echo "✅ USB-RS485 Adapter: Connected ($(ls /dev/ttyUSB*))"
else
    echo "❌ USB-RS485 Adapter: Not found"
fi

if lsusb | grep -i rfid > /dev/null; then
    echo "✅ RFID Reader: Connected"
else
    echo "❌ RFID Reader: Not detected"
fi

echo ""

# Process status
echo "🔄 Process Status:"
pids=$(pgrep -f "node.*eform" | wc -l)
echo "Active Node.js processes: ${pids}"

if [ $pids -eq 3 ]; then
    echo "✅ All services running"
else
    echo "⚠️  Expected 3 services, found ${pids}"
fi

echo ""

# Recent errors
echo "🚨 Recent Errors (last 10 minutes):"
error_count=$(find logs/ -name "*.log" -mmin -10 -exec grep -i "error\|failed\|exception" {} \; 2>/dev/null | wc -l)
echo "Error count: ${error_count}"

if [ $error_count -gt 0 ]; then
    echo "Recent errors:"
    find logs/ -name "*.log" -mmin -10 -exec grep -i "error\|failed\|exception" {} \; 2>/dev/null | tail -5
fi
```

#### **Continuous Monitoring Script**
```bash
#!/bin/bash
# File: scripts/monitor-continuous.sh

while true; do
    clear
    ./scripts/health-check.sh
    echo ""
    echo "Press Ctrl+C to stop monitoring..."
    sleep 30
done
```

### **Service-Specific Health Endpoints**

#### **Gateway Service Health**
```bash
curl -s http://localhost:3000/health | jq '.'
```

**Expected Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-08-26T20:47:21.538Z",
  "service": "eform-gateway",
  "version": "1.0.0"
}
```

#### **Kiosk Service Health**
```bash
curl -s http://localhost:3002/health | jq '.'
```

**Expected Response**:
```json
{
  "status": "healthy",
  "kiosk_id": "kiosk-1",
  "timestamp": "2025-08-26T20:47:21.556Z",
  "version": "1.0.0"
}
```

#### **Panel Service Health**
```bash
curl -s http://localhost:3001/health | jq '.'
```

**Expected Response**:
```json
{
  "status": "ok",
  "service": "eform-panel",
  "timestamp": "2025-08-26T20:47:21.574Z",
  "database": {
    "status": "ok",
    "lastWrite": "2025-08-26T20:47:21.591Z",
    "walSize": 0
  }
}
```

---

## 📋 **Log Analysis**

### **Log File Locations**
- `logs/gateway.log` - Gateway service logs
- `logs/kiosk.log` - Kiosk service logs
- `logs/panel.log` - Panel service logs

### **Real-Time Log Monitoring**

#### **Monitor All Services**
```bash
# Monitor all logs simultaneously
tail -f logs/*.log

# Monitor with service identification
tail -f logs/gateway.log logs/kiosk.log logs/panel.log | while read line; do
    echo "[$(date '+%H:%M:%S')] $line"
done
```

#### **Monitor Specific Events**
```bash
# Monitor RFID card activity
tail -f logs/kiosk.log | grep -i "rfid\|card\|session"

# Monitor relay activations
tail -f logs/*.log | grep -i "relay\|modbus\|hardware"

# Monitor errors only
tail -f logs/*.log | grep -i "error\|failed\|exception"

# Monitor API requests
tail -f logs/*.log | grep -i "incoming request\|POST\|GET"
```

### **Log Analysis Commands**

#### **Error Analysis**
```bash
# Count errors in last hour
grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')" logs/*.log | grep -i error | wc -l

# Find most common errors
grep -i error logs/*.log | awk -F'"error":' '{print $2}' | sort | uniq -c | sort -nr

# Errors by service
for log in logs/*.log; do
    service=$(basename $log .log)
    count=$(grep -i error $log | wc -l)
    echo "$service: $count errors"
done
```

#### **Performance Analysis**
```bash
# Response time analysis
grep "responseTime" logs/*.log | awk -F'"responseTime":' '{print $2}' | awk -F',' '{print $1}' | sort -n | tail -10

# Request frequency
grep "incoming request" logs/*.log | awk '{print $1}' | cut -d'T' -f2 | cut -d':' -f1-2 | sort | uniq -c

# Database operations
grep -i "database\|sqlite" logs/*.log | tail -20
```

#### **RFID Activity Analysis**
```bash
# RFID card usage
grep "RFID Card Detected" logs/kiosk.log | awk '{print $NF}' | sort | uniq -c

# Session management
grep -i "session" logs/kiosk.log | tail -20

# Locker assignments
grep "successfully assigned" logs/kiosk.log | awk '{print $(NF-1)}' | sort | uniq -c
```

### **Log Rotation and Cleanup**

#### **Manual Log Rotation**
```bash
#!/bin/bash
# File: scripts/rotate-logs.sh

DATE=$(date +%Y%m%d_%H%M%S)

for log in logs/*.log; do
    if [ -f "$log" ] && [ -s "$log" ]; then
        mv "$log" "${log%.log}_${DATE}.log"
        touch "$log"
        echo "Rotated $log"
    fi
done

# Compress old logs
find logs/ -name "*.log" -mtime +1 -not -name "*.gz" -exec gzip {} \;

# Remove logs older than 30 days
find logs/ -name "*.log.gz" -mtime +30 -delete

echo "Log rotation completed"
```

#### **Automated Log Rotation (Crontab)**
```bash
# Add to crontab (crontab -e)
0 0 * * * /home/pi/eform-locker/scripts/rotate-logs.sh
0 6 * * * find /home/pi/eform-locker/logs/ -name "*.log.gz" -mtime +30 -delete
```

---

## 🚨 **Alert System**

### **Critical Alert Script**
```bash
#!/bin/bash
# File: scripts/alert-check.sh

ALERT_FILE="/tmp/eform_alerts"
EMAIL="admin@example.com"  # Configure email if needed

# Check for critical conditions
check_services() {
    for port in 3000 3001 3002; do
        if ! curl -s --max-time 5 "http://localhost:${port}/health" > /dev/null; then
            echo "CRITICAL: Service on port ${port} is down" >> $ALERT_FILE
        fi
    done
}

check_hardware() {
    if ! ls /dev/ttyUSB* > /dev/null 2>&1; then
        echo "CRITICAL: USB-RS485 adapter not found" >> $ALERT_FILE
    fi
    
    if ! lsusb | grep -i rfid > /dev/null; then
        echo "WARNING: RFID reader not detected" >> $ALERT_FILE
    fi
}

check_disk_space() {
    usage=$(df / | awk 'NR==2{print $5}' | cut -d'%' -f1)
    if [ $usage -gt 90 ]; then
        echo "CRITICAL: Disk usage at ${usage}%" >> $ALERT_FILE
    fi
}

check_errors() {
    error_count=$(find logs/ -name "*.log" -mmin -5 -exec grep -i "error\|failed" {} \; 2>/dev/null | wc -l)
    if [ $error_count -gt 10 ]; then
        echo "WARNING: High error rate: ${error_count} errors in last 5 minutes" >> $ALERT_FILE
    fi
}

# Run checks
rm -f $ALERT_FILE
check_services
check_hardware  
check_disk_space
check_errors

# Send alerts if any
if [ -f $ALERT_FILE ]; then
    echo "=== eForm Locker System Alerts ===" 
    echo "Timestamp: $(date)"
    echo ""
    cat $ALERT_FILE
    
    # Uncomment to send email alerts
    # mail -s "eForm Locker System Alert" $EMAIL < $ALERT_FILE
fi
```

### **Automated Monitoring (Crontab)**
```bash
# Add to crontab (crontab -e)
*/5 * * * * /home/pi/eform-locker/scripts/alert-check.sh
*/10 * * * * /home/pi/eform-locker/scripts/health-check.sh >> /var/log/eform-health.log
```

---

## 🔧 **Troubleshooting Procedures**

### **Service Issues**

#### **Service Won't Start**

**Symptoms**:
- Service fails to start
- Immediate crash after startup
- Port binding errors

**Diagnosis Steps**:
```bash
# 1. Check if port is in use
netstat -tlnp | grep -E "300[0-2]"

# 2. Check for existing processes
ps aux | grep node

# 3. Check logs for startup errors
tail -20 logs/kiosk.log

# 4. Check file permissions
ls -la data/eform.db
ls -la /dev/ttyUSB*

# 5. Test database connectivity
sqlite3 data/eform.db "SELECT COUNT(*) FROM lockers;"
```

**Solutions**:
```bash
# Kill conflicting processes
sudo pkill -f "node.*eform"

# Fix database permissions
chmod 664 data/eform.db
chown pi:pi data/eform.db

# Fix serial port permissions
sudo usermod -a -G dialout pi
sudo chmod 666 /dev/ttyUSB0

# Rebuild and restart
npm run build:kiosk
./scripts/start-all-clean.sh
```

#### **Service Running But Not Responding**

**Symptoms**:
- Process exists but health check fails
- API requests timeout
- High CPU/memory usage

**Diagnosis Steps**:
```bash
# 1. Check process status
ps aux | grep node | grep eform

# 2. Check resource usage
top -p $(pgrep -f "node.*kiosk")

# 3. Check network connectivity
netstat -tlnp | grep 3002
curl -v http://localhost:3002/health

# 4. Check for deadlocks in logs
grep -i "timeout\|deadlock\|hang" logs/kiosk.log
```

**Solutions**:
```bash
# Restart specific service
sudo pkill -f "node.*kiosk"
npm run start:kiosk > logs/kiosk.log 2>&1 &

# Full system restart
./scripts/start-all-clean.sh

# If persistent, check for memory leaks
node --inspect scripts/debug-memory.js
```

### **Hardware Issues**

#### **RFID Reader Not Working**

**Symptoms**:
- Card scans not detected
- No keyboard input from reader
- Reader not showing in USB devices

**Diagnosis Steps**:
```bash
# 1. Check USB connection
lsusb | grep -i rfid
lsusb | grep -i hid

# 2. Check device permissions
ls -la /dev/input/event*

# 3. Test keyboard input
cat > /dev/null  # Scan card, should see output

# 4. Check browser focus
# Ensure kiosk page has focus for keyboard events
```

**Solutions**:
```bash
# Reconnect USB device
sudo rmmod usbhid
sudo modprobe usbhid

# Reset USB ports
echo '1-1' | sudo tee /sys/bus/usb/drivers/usb/unbind
echo '1-1' | sudo tee /sys/bus/usb/drivers/usb/bind

# Check browser console for JavaScript errors
# Verify RFID event listeners are active
```

#### **Relay Control Not Working**

**Symptoms**:
- API returns success but no relay activation
- No clicking sound from relays
- Hardware communication errors

**Diagnosis Steps**:
```bash
# 1. Check serial port
ls -la /dev/ttyUSB*
sudo dmesg | grep ttyUSB

# 2. Check port conflicts
sudo lsof /dev/ttyUSB0

# 3. Test direct hardware communication
node scripts/test-basic-relay-control.js

# 4. Check Modbus communication
node scripts/debug-hardware-communication.js

# 5. Verify relay card power
# Check LED indicators on relay cards
```

**Solutions**:
```bash
# Stop all services to free serial port
sudo pkill -f "node.*"

# Test hardware directly
node scripts/test-basic-relay-control.js

# Check connections and power
# Verify RS485 wiring: A+, B-, GND

# Restart services
./scripts/start-all-clean.sh

# If still failing, check relay card configuration
# Verify Modbus slave ID and baud rate
```

### **Database Issues**

#### **Database Locked Errors**

**Symptoms**:
- "Database is locked" errors
- SQLite busy errors
- Transaction timeouts

**Diagnosis Steps**:
```bash
# 1. Check database processes
sudo lsof data/eform.db

# 2. Check database integrity
sqlite3 data/eform.db "PRAGMA integrity_check;"

# 3. Check disk space
df -h

# 4. Check database size and WAL files
ls -la data/eform.db*
```

**Solutions**:
```bash
# Stop all services
sudo pkill -f "node.*"

# Check and repair database
sqlite3 data/eform.db "PRAGMA integrity_check;"
sqlite3 data/eform.db "VACUUM;"

# Enable WAL mode for better concurrency
sqlite3 data/eform.db "PRAGMA journal_mode=WAL;"

# Restart services
./scripts/start-all-clean.sh
```

#### **Database Corruption**

**Symptoms**:
- Integrity check failures
- Malformed database errors
- Data inconsistencies

**Recovery Steps**:
```bash
# 1. Stop all services
sudo pkill -f "node.*"

# 2. Backup current database
cp data/eform.db data/eform.db.corrupted

# 3. Try to recover
sqlite3 data/eform.db ".recover" | sqlite3 data/eform.db.recovered

# 4. If recovery successful, replace database
mv data/eform.db.recovered data/eform.db

# 5. If recovery fails, restore from backup or recreate
# cp backups/latest_backup.db data/eform.db
# OR
# rm data/eform.db  # Will be recreated on startup

# 6. Restart services
./scripts/start-all-clean.sh
```

### **Network Issues**

#### **Services Not Accessible Remotely**

**Symptoms**:
- Services work locally but not from other devices
- Connection refused errors
- Timeout errors

**Diagnosis Steps**:
```bash
# 1. Check service binding
netstat -tlnp | grep -E "300[0-2]"

# 2. Check firewall
sudo iptables -L

# 3. Check network connectivity
ping 192.168.1.8
telnet 192.168.1.8 3002

# 4. Check service configuration
grep -r "localhost\|127.0.0.1" app/*/src/
```

**Solutions**:
```bash
# Ensure services bind to all interfaces (0.0.0.0)
# Check fastify configuration in service code

# Configure firewall if needed
sudo ufw allow 3000:3002/tcp

# Restart networking
sudo systemctl restart networking
```

---

## 📊 **Performance Monitoring**

### **System Performance Script**
```bash
#!/bin/bash
# File: scripts/performance-monitor.sh

echo "=== eForm Locker System Performance Monitor ==="
echo "Timestamp: $(date)"
echo ""

# CPU and Memory
echo "💻 System Resources:"
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
echo "Memory Usage: $(free -m | awk 'NR==2{printf "%.1f%% (%dMB/%dMB)", $3*100/$2, $3, $2}')"
echo "Load Average: $(uptime | awk -F'load average:' '{print $2}')"
echo ""

# Disk I/O
echo "💾 Disk Performance:"
echo "Disk Usage: $(df -h / | awk 'NR==2{print $5}')"
if command -v iostat > /dev/null; then
    iostat -x 1 1 | grep -A1 "Device"
fi
echo ""

# Network
echo "🌐 Network Statistics:"
if command -v ss > /dev/null; then
    echo "Active connections:"
    ss -tuln | grep -E ":300[0-2]"
fi
echo ""

# Service Response Times
echo "⚡ Service Response Times:"
for port in 3000 3001 3002; do
    start_time=$(date +%s.%N)
    if curl -s --max-time 5 "http://localhost:${port}/health" > /dev/null; then
        end_time=$(date +%s.%N)
        response_time=$(echo "$end_time - $start_time" | bc)
        printf "Port %d: %.3f seconds\n" $port $response_time
    else
        echo "Port $port: TIMEOUT"
    fi
done
echo ""

# Database Performance
echo "🗄️  Database Performance:"
if [ -f data/eform.db ]; then
    db_size=$(du -h data/eform.db | cut -f1)
    echo "Database size: $db_size"
    
    # Simple query performance test
    start_time=$(date +%s.%N)
    sqlite3 data/eform.db "SELECT COUNT(*) FROM lockers;" > /dev/null
    end_time=$(date +%s.%N)
    query_time=$(echo "$end_time - $start_time" | bc)
    printf "Query response time: %.3f seconds\n" $query_time
fi
```

### **Performance Alerts**
```bash
#!/bin/bash
# File: scripts/performance-alerts.sh

# Thresholds
CPU_THRESHOLD=80
MEMORY_THRESHOLD=85
RESPONSE_TIME_THRESHOLD=2.0

# Check CPU usage
cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
if (( $(echo "$cpu_usage > $CPU_THRESHOLD" | bc -l) )); then
    echo "ALERT: High CPU usage: ${cpu_usage}%"
fi

# Check memory usage
memory_usage=$(free | awk 'NR==2{printf "%.1f", $3*100/$2}')
if (( $(echo "$memory_usage > $MEMORY_THRESHOLD" | bc -l) )); then
    echo "ALERT: High memory usage: ${memory_usage}%"
fi

# Check service response times
for port in 3000 3001 3002; do
    start_time=$(date +%s.%N)
    if curl -s --max-time 5 "http://localhost:${port}/health" > /dev/null; then
        end_time=$(date +%s.%N)
        response_time=$(echo "$end_time - $start_time" | bc)
        if (( $(echo "$response_time > $RESPONSE_TIME_THRESHOLD" | bc -l) )); then
            echo "ALERT: Slow response from port ${port}: ${response_time}s"
        fi
    else
        echo "ALERT: Service on port ${port} not responding"
    fi
done
```

---

## 🛠️ **Maintenance Procedures**

### **Daily Maintenance Checklist**
```bash
#!/bin/bash
# File: scripts/daily-maintenance.sh

echo "=== Daily Maintenance Checklist ==="
echo "Date: $(date)"
echo ""

# 1. Service health check
echo "1. Checking service health..."
./scripts/health-check.sh

# 2. Check for errors
echo "2. Checking for recent errors..."
error_count=$(find logs/ -name "*.log" -mtime -1 -exec grep -i "error\|failed" {} \; 2>/dev/null | wc -l)
echo "Errors in last 24 hours: $error_count"

# 3. Database backup
echo "3. Creating database backup..."
DATE=$(date +%Y%m%d)
cp data/eform.db backups/eform_${DATE}.db
echo "Backup created: backups/eform_${DATE}.db"

# 4. Log file size check
echo "4. Checking log file sizes..."
for log in logs/*.log; do
    if [ -f "$log" ]; then
        size=$(du -h "$log" | cut -f1)
        echo "$(basename $log): $size"
    fi
done

# 5. Disk space check
echo "5. Checking disk space..."
df -h /

# 6. Hardware connectivity
echo "6. Checking hardware connectivity..."
if ls /dev/ttyUSB* > /dev/null 2>&1; then
    echo "✅ USB-RS485: Connected"
else
    echo "❌ USB-RS485: Not found"
fi

if lsusb | grep -i rfid > /dev/null; then
    echo "✅ RFID Reader: Connected"
else
    echo "❌ RFID Reader: Not found"
fi

echo ""
echo "Daily maintenance completed."
```

### **Weekly Maintenance Checklist**
```bash
#!/bin/bash
# File: scripts/weekly-maintenance.sh

echo "=== Weekly Maintenance Checklist ==="
echo "Date: $(date)"
echo ""

# 1. System updates
echo "1. Checking for system updates..."
sudo apt update
updates=$(apt list --upgradable 2>/dev/null | wc -l)
echo "Available updates: $((updates - 1))"

# 2. Log rotation
echo "2. Rotating logs..."
./scripts/rotate-logs.sh

# 3. Database maintenance
echo "3. Database maintenance..."
sqlite3 data/eform.db "VACUUM;"
sqlite3 data/eform.db "ANALYZE;"
echo "Database optimized"

# 4. Performance analysis
echo "4. Performance analysis..."
./scripts/performance-monitor.sh

# 5. Cleanup old backups
echo "5. Cleaning up old backups..."
find backups/ -name "eform_*.db" -mtime +30 -delete
echo "Old backups cleaned"

# 6. Hardware test
echo "6. Hardware functionality test..."
node scripts/test-basic-relay-control.js

echo ""
echo "Weekly maintenance completed."
```

---

## 📞 **Emergency Procedures**

### **Emergency Service Restart**
```bash
#!/bin/bash
# File: scripts/emergency-restart.sh

echo "🚨 EMERGENCY SERVICE RESTART 🚨"
echo "Timestamp: $(date)"
echo ""

# 1. Stop all services immediately
echo "1. Stopping all services..."
sudo pkill -9 -f "node.*eform"
sleep 2

# 2. Reset hardware
echo "2. Resetting hardware..."
node scripts/emergency-relay-reset.js

# 3. Check system resources
echo "3. Checking system resources..."
echo "Memory: $(free -m | awk 'NR==2{printf "%.1f%%", $3*100/$2}')"
echo "Disk: $(df -h / | awk 'NR==2{print $5}')"

# 4. Clear any locks
echo "4. Clearing locks..."
rm -f /tmp/eform_*.lock

# 5. Restart services
echo "5. Restarting services..."
./scripts/start-all-clean.sh

# 6. Verify restart
echo "6. Verifying restart..."
sleep 10
./scripts/health-check.sh

echo ""
echo "Emergency restart completed."
```

### **Emergency Hardware Reset**
```bash
#!/bin/bash
# File: scripts/emergency-hardware-reset.sh

echo "🚨 EMERGENCY HARDWARE RESET 🚨"
echo "Timestamp: $(date)"
echo ""

# 1. Stop all services
sudo pkill -f "node.*"

# 2. Reset all relays
echo "Resetting all relays to OFF state..."
node scripts/emergency-relay-reset.js

# 3. Reset USB devices
echo "Resetting USB devices..."
for device in /sys/bus/usb/devices/*/authorized; do
    if [ -f "$device" ]; then
        echo 0 | sudo tee "$device" > /dev/null
        sleep 1
        echo 1 | sudo tee "$device" > /dev/null
    fi
done

# 4. Restart services
echo "Restarting services..."
./scripts/start-all-clean.sh

echo "Emergency hardware reset completed."
```

---

*This monitoring guide is part of the eForm Locker System documentation. For additional support, refer to SYSTEM_DOCUMENTATION.md and API_REFERENCE.md*