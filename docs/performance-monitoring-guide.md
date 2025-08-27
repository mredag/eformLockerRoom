# Kiosk UI Performance Monitoring and Maintenance Guide

## Overview

This guide provides comprehensive procedures for monitoring and maintaining the optimized kiosk UI system to ensure reliable, high-performance operation on Raspberry Pi hardware.

## Performance Monitoring Framework

### Key Performance Indicators (KPIs)

#### System Performance Metrics
- **CPU Usage**: Target <50% average, <80% peak
- **Memory Usage**: Target <200MB for Pi 4, <150MB for Pi 3B
- **Response Time**: Target <100ms for touch events
- **Uptime**: Target >99% availability
- **Error Rate**: Target <1% of operations

#### User Experience Metrics
- **Touch Response**: <100ms from touch to visual feedback
- **Card Scan Time**: <2 seconds from scan to response
- **Locker Selection**: <500ms from selection to confirmation
- **Session Timeout**: Accurate 30-second countdown
- **Error Recovery**: <5 seconds to return to idle state

### Automated Monitoring Setup

#### Performance Monitoring Service
```bash
# Create monitoring service
sudo nano /etc/systemd/system/kiosk-monitor.service
```

**Service Configuration**:
```ini
[Unit]
Description=Kiosk Performance Monitor
After=kiosk-ui.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/eform-locker
ExecStart=/usr/bin/node scripts/performance-monitor.js
Restart=always
RestartSec=30
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

#### Enable Monitoring
```bash
sudo systemctl daemon-reload
sudo systemctl enable kiosk-monitor.service
sudo systemctl start kiosk-monitor.service
```

### Real-Time Monitoring Dashboard

#### Web-Based Dashboard
Access at: `http://pi-ip:3003/monitor`

**Key Metrics Displayed**:
- Current CPU and memory usage
- Response time trends
- Error rate graphs
- Service health status
- Hardware communication status

#### Command-Line Monitoring
```bash
# Real-time system stats
watch -n 2 'free -h && ps aux | grep node | grep kiosk'

# Monitor service logs
tail -f /home/pi/logs/kiosk.log | grep -E "(ERROR|WARN|PERFORMANCE)"

# Check network connectivity
watch -n 5 'curl -s -w "%{time_total}" http://localhost:3002/health'
```

## Performance Metrics Collection

### Automated Data Collection

#### System Metrics Script
```bash
# Create metrics collection script
nano scripts/collect-performance-metrics.sh
```

**Script Content**:
```bash
#!/bin/bash

METRICS_DIR="/home/pi/logs/metrics"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$METRICS_DIR"

# Collect system metrics
{
    echo "timestamp,cpu_percent,memory_mb,disk_percent,temperature"
    
    CPU=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    MEMORY=$(free -m | awk 'NR==2{printf "%.1f", $3}')
    DISK=$(df -h / | awk 'NR==2{print $5}' | cut -d'%' -f1)
    TEMP=$(vcgencmd measure_temp | cut -d'=' -f2 | cut -d"'" -f1)
    
    echo "$(date +%s),$CPU,$MEMORY,$DISK,$TEMP"
} >> "$METRICS_DIR/system_metrics_$(date +%Y%m%d).csv"

# Collect kiosk-specific metrics
{
    echo "timestamp,response_time_ms,active_sessions,error_count"
    
    # Test API response time
    RESPONSE_TIME=$(curl -s -w "%{time_total}" http://localhost:3002/health -o /dev/null | awk '{print $1*1000}')
    
    # Count active sessions (from logs)
    SESSIONS=$(grep -c "session.*active" /home/pi/logs/kiosk.log 2>/dev/null || echo 0)
    
    # Count recent errors
    ERRORS=$(grep -c "ERROR" /home/pi/logs/kiosk.log | tail -100 | wc -l 2>/dev/null || echo 0)
    
    echo "$(date +%s),$RESPONSE_TIME,$SESSIONS,$ERRORS"
} >> "$METRICS_DIR/kiosk_metrics_$(date +%Y%m%d).csv"
```

#### Automated Collection Schedule
```bash
# Add to crontab
crontab -e

# Collect metrics every minute
* * * * * /home/pi/eform-locker/scripts/collect-performance-metrics.sh

# Generate hourly reports
0 * * * * /home/pi/eform-locker/scripts/generate-performance-report.sh

# Daily performance summary
0 6 * * * /home/pi/eform-locker/scripts/daily-performance-summary.sh
```

### Performance Analysis Tools

#### Performance Report Generator
```bash
# Create report generator
nano scripts/generate-performance-report.sh
```

**Report Script**:
```bash
#!/bin/bash

REPORT_DIR="/home/pi/reports"
DATE=$(date +%Y%m%d)
METRICS_DIR="/home/pi/logs/metrics"

mkdir -p "$REPORT_DIR"

# Generate performance report
{
    echo "# Kiosk Performance Report - $(date)"
    echo ""
    
    # System averages for last 24 hours
    echo "## System Performance (Last 24 Hours)"
    
    if [ -f "$METRICS_DIR/system_metrics_$DATE.csv" ]; then
        echo "- Average CPU Usage: $(awk -F',' 'NR>1 {sum+=$2; count++} END {printf "%.1f%%", sum/count}' "$METRICS_DIR/system_metrics_$DATE.csv")"
        echo "- Average Memory Usage: $(awk -F',' 'NR>1 {sum+=$3; count++} END {printf "%.1fMB", sum/count}' "$METRICS_DIR/system_metrics_$DATE.csv")"
        echo "- Peak Temperature: $(awk -F',' 'NR>1 {if($5>max) max=$5} END {printf "%.1f°C", max}' "$METRICS_DIR/system_metrics_$DATE.csv")"
    fi
    
    # Kiosk performance
    echo ""
    echo "## Kiosk Performance"
    
    if [ -f "$METRICS_DIR/kiosk_metrics_$DATE.csv" ]; then
        echo "- Average Response Time: $(awk -F',' 'NR>1 {sum+=$2; count++} END {printf "%.0fms", sum/count}' "$METRICS_DIR/kiosk_metrics_$DATE.csv")"
        echo "- Total Errors: $(awk -F',' 'NR>1 {sum+=$4} END {print sum+0}' "$METRICS_DIR/kiosk_metrics_$DATE.csv")"
        echo "- Peak Active Sessions: $(awk -F',' 'NR>1 {if($3>max) max=$3} END {print max+0}' "$METRICS_DIR/kiosk_metrics_$DATE.csv")"
    fi
    
    # Service uptime
    echo ""
    echo "## Service Status"
    echo "- Kiosk Service: $(systemctl is-active kiosk-ui.service)"
    echo "- Service Uptime: $(systemctl show kiosk-ui.service --property=ActiveEnterTimestamp | cut -d'=' -f2)"
    
    # Recommendations
    echo ""
    echo "## Recommendations"
    
    # Check if performance is degraded
    AVG_CPU=$(awk -F',' 'NR>1 {sum+=$2; count++} END {print sum/count}' "$METRICS_DIR/system_metrics_$DATE.csv" 2>/dev/null || echo 0)
    if (( $(echo "$AVG_CPU > 70" | bc -l) )); then
        echo "- ⚠️  High CPU usage detected. Consider optimizing or upgrading hardware."
    fi
    
    AVG_MEM=$(awk -F',' 'NR>1 {sum+=$3; count++} END {print sum/count}' "$METRICS_DIR/system_metrics_$DATE.csv" 2>/dev/null || echo 0)
    if (( $(echo "$AVG_MEM > 300" | bc -l) )); then
        echo "- ⚠️  High memory usage detected. Check for memory leaks."
    fi
    
    ERROR_COUNT=$(awk -F',' 'NR>1 {sum+=$4} END {print sum+0}' "$METRICS_DIR/kiosk_metrics_$DATE.csv" 2>/dev/null || echo 0)
    if [ "$ERROR_COUNT" -gt 10 ]; then
        echo "- ⚠️  High error rate detected. Check logs for issues."
    fi
    
} > "$REPORT_DIR/performance_report_$DATE.md"

echo "Performance report generated: $REPORT_DIR/performance_report_$DATE.md"
```

## Maintenance Procedures

### Daily Maintenance Tasks

#### Automated Daily Maintenance
```bash
# Create daily maintenance script
nano scripts/daily-maintenance.sh
```

**Daily Maintenance Script**:
```bash
#!/bin/bash

LOG_FILE="/home/pi/logs/maintenance.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting daily maintenance..."

# 1. Check service health
if ! systemctl is-active --quiet kiosk-ui.service; then
    log "⚠️  Kiosk service is not running, attempting restart..."
    sudo systemctl restart kiosk-ui.service
    sleep 10
    
    if systemctl is-active --quiet kiosk-ui.service; then
        log "✅ Kiosk service restarted successfully"
    else
        log "❌ Failed to restart kiosk service"
    fi
fi

# 2. Check disk space
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | cut -d'%' -f1)
if [ "$DISK_USAGE" -gt 80 ]; then
    log "⚠️  Disk usage is ${DISK_USAGE}%, cleaning up..."
    
    # Clean old logs
    find /home/pi/logs -name "*.log" -mtime +7 -delete
    find /home/pi/logs/metrics -name "*.csv" -mtime +30 -delete
    
    log "✅ Disk cleanup completed"
fi

# 3. Check memory usage
MEMORY_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
if [ "$MEMORY_USAGE" -gt 80 ]; then
    log "⚠️  High memory usage (${MEMORY_USAGE}%), clearing caches..."
    sudo sync && sudo sysctl vm.drop_caches=3
    log "✅ Memory caches cleared"
fi

# 4. Check temperature
TEMP=$(vcgencmd measure_temp | cut -d'=' -f2 | cut -d"'" -f1)
if (( $(echo "$TEMP > 70" | bc -l) )); then
    log "⚠️  High temperature detected: ${TEMP}°C"
fi

# 5. Test API endpoints
if ! curl -f http://localhost:3002/health > /dev/null 2>&1; then
    log "⚠️  Kiosk API health check failed"
else
    log "✅ Kiosk API health check passed"
fi

# 6. Rotate logs
if [ -f "/home/pi/logs/kiosk.log" ] && [ $(stat -c%s "/home/pi/logs/kiosk.log") -gt 10485760 ]; then
    log "📋 Rotating large log file..."
    mv /home/pi/logs/kiosk.log /home/pi/logs/kiosk.log.$(date +%Y%m%d)
    touch /home/pi/logs/kiosk.log
    sudo systemctl reload kiosk-ui.service
    log "✅ Log rotation completed"
fi

log "Daily maintenance completed"
```

#### Schedule Daily Maintenance
```bash
# Add to crontab
crontab -e

# Run daily maintenance at 3 AM
0 3 * * * /home/pi/eform-locker/scripts/daily-maintenance.sh
```

### Weekly Maintenance Tasks

#### Weekly System Check
```bash
# Create weekly maintenance script
nano scripts/weekly-maintenance.sh
```

**Weekly Maintenance Script**:
```bash
#!/bin/bash

LOG_FILE="/home/pi/logs/weekly-maintenance.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting weekly maintenance..."

# 1. System updates check (don't auto-install)
log "📦 Checking for system updates..."
sudo apt update
UPDATES=$(apt list --upgradable 2>/dev/null | wc -l)
if [ "$UPDATES" -gt 1 ]; then
    log "⚠️  $((UPDATES-1)) updates available. Review before installing."
fi

# 2. Performance analysis
log "📊 Generating performance analysis..."
./scripts/generate-performance-report.sh

# 3. Hardware health check
log "🔧 Checking hardware health..."

# Check USB devices
USB_DEVICES=$(lsusb | wc -l)
log "📱 USB devices detected: $USB_DEVICES"

# Check serial ports
if [ -e "/dev/ttyUSB0" ]; then
    log "✅ Serial port /dev/ttyUSB0 available"
else
    log "⚠️  Serial port /dev/ttyUSB0 not found"
fi

# 4. Network connectivity test
log "🌐 Testing network connectivity..."
if ping -c 3 google.com > /dev/null 2>&1; then
    log "✅ Internet connectivity OK"
else
    log "⚠️  Internet connectivity issues detected"
fi

# 5. Database integrity check
log "🗄️  Checking database integrity..."
if [ -f "/home/pi/eform-locker/data/eform.db" ]; then
    sqlite3 /home/pi/eform-locker/data/eform.db "PRAGMA integrity_check;" > /tmp/db_check.txt
    if grep -q "ok" /tmp/db_check.txt; then
        log "✅ Database integrity OK"
    else
        log "⚠️  Database integrity issues detected"
    fi
fi

# 6. Backup system configuration
log "💾 Creating configuration backup..."
BACKUP_DIR="/home/pi/backups/config/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"
cp -r /etc/kiosk-config.json "$BACKUP_DIR/" 2>/dev/null || true
cp -r ~/.bashrc "$BACKUP_DIR/" 2>/dev/null || true
cp -r /home/pi/eform-locker/config "$BACKUP_DIR/" 2>/dev/null || true
log "✅ Configuration backup created"

log "Weekly maintenance completed"
```

#### Schedule Weekly Maintenance
```bash
# Add to crontab
crontab -e

# Run weekly maintenance on Sunday at 2 AM
0 2 * * 0 /home/pi/eform-locker/scripts/weekly-maintenance.sh
```

### Monthly Maintenance Tasks

#### Comprehensive System Review
```bash
# Create monthly maintenance script
nano scripts/monthly-maintenance.sh
```

**Monthly Maintenance Script**:
```bash
#!/bin/bash

LOG_FILE="/home/pi/logs/monthly-maintenance.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting monthly maintenance..."

# 1. Full system backup
log "💾 Creating full system backup..."
BACKUP_DATE=$(date +%Y%m%d)
sudo rsync -av --exclude='/home/pi/backups' /home/pi/ "/media/usb/backup_$BACKUP_DATE/" 2>/dev/null || log "⚠️  External backup failed"

# 2. Performance trend analysis
log "📈 Analyzing performance trends..."
python3 scripts/analyze-performance-trends.py

# 3. Security updates
log "🔒 Checking security updates..."
sudo apt list --upgradable | grep -i security

# 4. Hardware stress test
log "🔧 Running hardware stress test..."
./scripts/test-hardware-reliability.js

# 5. Clean old files
log "🧹 Cleaning old files..."
find /home/pi/logs -name "*.log.*" -mtime +30 -delete
find /home/pi/backups -name "*" -mtime +90 -delete
find /tmp -name "*kiosk*" -mtime +7 -delete

# 6. Update documentation
log "📚 Updating system documentation..."
./scripts/generate-system-report.sh

log "Monthly maintenance completed"
```

## Performance Optimization

### Automatic Performance Tuning

#### Performance Optimizer Script
```bash
# Create performance optimizer
nano scripts/optimize-performance.sh
```

**Optimizer Script**:
```bash
#!/bin/bash

PI_MODEL=$(cat /proc/cpuinfo | grep Model | cut -d':' -f2 | xargs)
MEMORY_MB=$(free -m | awk 'NR==2{print $2}')

echo "Optimizing for: $PI_MODEL with ${MEMORY_MB}MB RAM"

# Apply model-specific optimizations
if [[ "$PI_MODEL" == *"Pi 4"* ]]; then
    echo "Applying Pi 4 optimizations..."
    export KIOSK_MEMORY_LIMIT=400
    export KIOSK_GPU_ACCELERATION=true
    export KIOSK_ANIMATION_LEVEL=full
elif [[ "$PI_MODEL" == *"Pi 3"* ]]; then
    echo "Applying Pi 3 optimizations..."
    export KIOSK_MEMORY_LIMIT=200
    export KIOSK_GPU_ACCELERATION=false
    export KIOSK_ANIMATION_LEVEL=minimal
fi

# Update configuration file
cat > /etc/kiosk-config.json << EOF
{
  "performance": {
    "maxMemoryUsage": "${KIOSK_MEMORY_LIMIT}MB",
    "enableGPUAcceleration": $KIOSK_GPU_ACCELERATION,
    "animationLevel": "$KIOSK_ANIMATION_LEVEL"
  }
}
EOF

echo "Performance optimization completed"
```

### Performance Alerts

#### Alert System Setup
```bash
# Create alert script
nano scripts/performance-alerts.sh
```

**Alert Script**:
```bash
#!/bin/bash

ALERT_LOG="/home/pi/logs/alerts.log"

check_and_alert() {
    local metric=$1
    local value=$2
    local threshold=$3
    local message=$4
    
    if (( $(echo "$value > $threshold" | bc -l) )); then
        echo "[ALERT $(date)] $message: $value" | tee -a "$ALERT_LOG"
        # Send notification (email, webhook, etc.)
        # curl -X POST webhook-url -d "alert=$message"
    fi
}

# Check CPU usage
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
check_and_alert "cpu" "$CPU_USAGE" "80" "High CPU usage"

# Check memory usage
MEMORY_PERCENT=$(free | awk 'NR==2{printf "%.1f", $3*100/$2}')
check_and_alert "memory" "$MEMORY_PERCENT" "85" "High memory usage"

# Check temperature
TEMP=$(vcgencmd measure_temp | cut -d'=' -f2 | cut -d"'" -f1)
check_and_alert "temperature" "$TEMP" "75" "High temperature"

# Check response time
RESPONSE_TIME=$(curl -s -w "%{time_total}" http://localhost:3002/health -o /dev/null | awk '{print $1*1000}')
check_and_alert "response" "$RESPONSE_TIME" "1000" "Slow response time"
```

## Rollback Procedures

### Automated Rollback System

#### Rollback Script
```bash
# Create rollback script
nano scripts/rollback-kiosk.sh
```

**Rollback Script**:
```bash
#!/bin/bash

BACKUP_DIR="/home/pi/backups/kiosk-ui"
LOG_FILE="/home/pi/logs/rollback.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# List available backups
list_backups() {
    echo "Available backups:"
    ls -la "$BACKUP_DIR" | grep "ui_backup_" | awk '{print $9}' | sort -r
}

# Rollback to specific backup
rollback_to_backup() {
    local backup_name=$1
    local backup_path="$BACKUP_DIR/$backup_name"
    
    if [ ! -d "$backup_path" ]; then
        log "❌ Backup not found: $backup_name"
        exit 1
    fi
    
    log "🔄 Rolling back to: $backup_name"
    
    # Stop services
    log "🛑 Stopping kiosk service..."
    sudo systemctl stop kiosk-ui.service
    
    # Create emergency backup of current state
    EMERGENCY_BACKUP="emergency_backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR/$EMERGENCY_BACKUP"
    cp -r app/kiosk/src/ui "$BACKUP_DIR/$EMERGENCY_BACKUP/" 2>/dev/null || true
    log "📦 Emergency backup created: $EMERGENCY_BACKUP"
    
    # Restore from backup
    log "📋 Restoring files from backup..."
    rm -rf app/kiosk/src/ui
    cp -r "$backup_path/ui" app/kiosk/src/ui/
    
    # Rebuild
    log "🔨 Rebuilding kiosk service..."
    npm run build:kiosk
    
    # Restart services
    log "🚀 Starting kiosk service..."
    sudo systemctl start kiosk-ui.service
    
    # Verify rollback
    sleep 10
    if curl -f http://localhost:3002/health > /dev/null 2>&1; then
        log "✅ Rollback completed successfully"
    else
        log "❌ Rollback verification failed"
        exit 1
    fi
}

# Main rollback logic
case "${1:-list}" in
    "list")
        list_backups
        ;;
    "latest")
        LATEST_BACKUP=$(ls -t "$BACKUP_DIR" | grep "ui_backup_" | head -n1)
        rollback_to_backup "$LATEST_BACKUP"
        ;;
    *)
        rollback_to_backup "$1"
        ;;
esac
```

### Emergency Recovery

#### Emergency Recovery Procedure
```bash
# Create emergency recovery script
nano scripts/emergency-recovery.sh
```

**Emergency Recovery Script**:
```bash
#!/bin/bash

echo "🚨 EMERGENCY RECOVERY MODE"
echo "This will restore the kiosk to a known working state"

# Stop all services
echo "🛑 Stopping all services..."
sudo systemctl stop kiosk-ui.service
sudo pkill -f "node.*kiosk"

# Restore default configuration
echo "⚙️  Restoring default configuration..."
sudo cp config/default-config.json /etc/kiosk-config.json

# Clear caches and temporary files
echo "🧹 Clearing caches..."
sudo sync && sudo sysctl vm.drop_caches=3
rm -rf /tmp/kiosk-*
rm -rf ~/.cache/kiosk-*

# Restore from git (clean state)
echo "📥 Restoring from git..."
git stash
git checkout main
git pull origin main

# Rebuild everything
echo "🔨 Rebuilding..."
npm install
npm run build:kiosk

# Start services
echo "🚀 Starting services..."
sudo systemctl start kiosk-ui.service

# Wait and verify
sleep 15
if curl -f http://localhost:3002/health > /dev/null 2>&1; then
    echo "✅ Emergency recovery completed successfully"
else
    echo "❌ Emergency recovery failed - manual intervention required"
    exit 1
fi
```

This comprehensive performance monitoring and maintenance guide ensures the kiosk UI system operates reliably and efficiently on Raspberry Pi hardware with proactive monitoring, automated maintenance, and robust recovery procedures.