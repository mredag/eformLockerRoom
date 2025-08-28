#!/bin/bash

# Kiosk UI Health Check Script
# Comprehensive health monitoring for the kiosk system

set -e

# Configuration
LOG_FILE="/home/pi/logs/health-check.log"
ALERT_THRESHOLD_CPU=80
ALERT_THRESHOLD_MEMORY=85
ALERT_THRESHOLD_TEMP=75
ALERT_THRESHOLD_RESPONSE=1000

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Status functions
status_ok() {
    echo -e "${GREEN}✅ $1${NC}"
    log "OK: $1"
}

status_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    log "WARNING: $1"
}

status_error() {
    echo -e "${RED}❌ $1${NC}"
    log "ERROR: $1"
}

# Health check functions
check_service_status() {
    echo "🔍 Checking service status..."
    
    if systemctl is-active --quiet kiosk-ui.service; then
        status_ok "Kiosk service is running"
        
        # Check service uptime
        UPTIME=$(systemctl show kiosk-ui.service --property=ActiveEnterTimestamp | cut -d'=' -f2)
        if [ -n "$UPTIME" ]; then
            status_ok "Service started: $UPTIME"
        fi
    else
        status_error "Kiosk service is not running"
        return 1
    fi
}

check_api_health() {
    echo "🌐 Checking API health..."
    
    # Test API endpoint with timeout
    if timeout 10 curl -f http://localhost:3002/health > /dev/null 2>&1; then
        # Measure response time
        RESPONSE_TIME=$(curl -s -w "%{time_total}" http://localhost:3002/health -o /dev/null | awk '{print $1*1000}')
        
        if (( $(echo "$RESPONSE_TIME < $ALERT_THRESHOLD_RESPONSE" | bc -l) )); then
            status_ok "API responding in ${RESPONSE_TIME}ms"
        else
            status_warning "API slow response: ${RESPONSE_TIME}ms"
        fi
    else
        status_error "API health check failed"
        return 1
    fi
}

check_system_resources() {
    echo "💻 Checking system resources..."
    
    # CPU usage
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    if (( $(echo "$CPU_USAGE < $ALERT_THRESHOLD_CPU" | bc -l) )); then
        status_ok "CPU usage: ${CPU_USAGE}%"
    else
        status_warning "High CPU usage: ${CPU_USAGE}%"
    fi
    
    # Memory usage
    MEMORY_PERCENT=$(free | awk 'NR==2{printf "%.1f", $3*100/$2}')
    MEMORY_MB=$(free -m | awk 'NR==2{printf "%.0f", $3}')
    if (( $(echo "$MEMORY_PERCENT < $ALERT_THRESHOLD_MEMORY" | bc -l) )); then
        status_ok "Memory usage: ${MEMORY_MB}MB (${MEMORY_PERCENT}%)"
    else
        status_warning "High memory usage: ${MEMORY_MB}MB (${MEMORY_PERCENT}%)"
    fi
    
    # Disk usage
    DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | cut -d'%' -f1)
    if [ "$DISK_USAGE" -lt 80 ]; then
        status_ok "Disk usage: ${DISK_USAGE}%"
    else
        status_warning "High disk usage: ${DISK_USAGE}%"
    fi
    
    # Temperature (Pi specific)
    if command -v vcgencmd &> /dev/null; then
        TEMP=$(vcgencmd measure_temp | cut -d'=' -f2 | cut -d"'" -f1)
        if (( $(echo "$TEMP < $ALERT_THRESHOLD_TEMP" | bc -l) )); then
            status_ok "Temperature: ${TEMP}°C"
        else
            status_warning "High temperature: ${TEMP}°C"
        fi
    fi
}

check_hardware_connectivity() {
    echo "🔧 Checking hardware connectivity..."
    
    # Check serial port
    if [ -e "/dev/ttyUSB0" ]; then
        status_ok "Serial port /dev/ttyUSB0 available"
        
        # Check port permissions
        if [ -r "/dev/ttyUSB0" ] && [ -w "/dev/ttyUSB0" ]; then
            status_ok "Serial port permissions OK"
        else
            status_warning "Serial port permission issues"
        fi
    else
        status_error "Serial port /dev/ttyUSB0 not found"
    fi
    
    # Check USB devices
    USB_COUNT=$(lsusb | wc -l)
    if [ "$USB_COUNT" -gt 0 ]; then
        status_ok "USB devices detected: $USB_COUNT"
    else
        status_warning "No USB devices detected"
    fi
    
    # Check RFID reader (look for HID device)
    if ls /dev/input/by-id/ 2>/dev/null | grep -qi "usb.*keyboard"; then
        status_ok "RFID reader (HID) detected"
    else
        status_warning "RFID reader not detected"
    fi
}

check_network_connectivity() {
    echo "🌐 Checking network connectivity..."
    
    # Check local network
    if ping -c 1 -W 5 192.168.1.1 > /dev/null 2>&1; then
        status_ok "Local network connectivity OK"
    else
        status_warning "Local network connectivity issues"
    fi
    
    # Check internet connectivity
    if ping -c 1 -W 10 8.8.8.8 > /dev/null 2>&1; then
        status_ok "Internet connectivity OK"
    else
        status_warning "Internet connectivity issues"
    fi
    
    # Check WiFi signal (if using WiFi)
    if iwconfig wlan0 2>/dev/null | grep -q "ESSID"; then
        SIGNAL=$(iwconfig wlan0 2>/dev/null | grep "Signal level" | awk '{print $4}' | cut -d'=' -f2)
        if [ -n "$SIGNAL" ]; then
            status_ok "WiFi signal: $SIGNAL"
        fi
    fi
}

check_log_files() {
    echo "📋 Checking log files..."
    
    # Check if log directory exists
    if [ -d "/home/pi/logs" ]; then
        status_ok "Log directory exists"
        
        # Check log file sizes
        KIOSK_LOG_SIZE=$(stat -c%s "/home/pi/logs/kiosk.log" 2>/dev/null || echo 0)
        if [ "$KIOSK_LOG_SIZE" -gt 0 ]; then
            LOG_SIZE_MB=$((KIOSK_LOG_SIZE / 1024 / 1024))
            if [ "$LOG_SIZE_MB" -lt 50 ]; then
                status_ok "Kiosk log size: ${LOG_SIZE_MB}MB"
            else
                status_warning "Large kiosk log file: ${LOG_SIZE_MB}MB"
            fi
        else
            status_warning "Kiosk log file empty or missing"
        fi
        
        # Check for recent errors
        ERROR_COUNT=$(grep -c "ERROR" /home/pi/logs/kiosk.log 2>/dev/null | tail -100 | wc -l || echo 0)
        if [ "$ERROR_COUNT" -lt 5 ]; then
            status_ok "Recent error count: $ERROR_COUNT"
        else
            status_warning "High recent error count: $ERROR_COUNT"
        fi
    else
        status_error "Log directory missing"
    fi
}

check_configuration() {
    echo "⚙️  Checking configuration..."
    
    # Check main config file
    if [ -f "/etc/kiosk-config.json" ]; then
        if jq . /etc/kiosk-config.json > /dev/null 2>&1; then
            status_ok "Main configuration file valid"
        else
            status_error "Main configuration file invalid JSON"
        fi
    else
        status_warning "Main configuration file missing"
    fi
    
    # Check environment variables
    if [ -n "$KIOSK_PI_MODEL" ]; then
        status_ok "Pi model configured: $KIOSK_PI_MODEL"
    else
        status_warning "Pi model not configured"
    fi
    
    # Check project files
    if [ -f "/home/pi/eform-locker/package.json" ]; then
        status_ok "Project files present"
    else
        status_error "Project files missing"
    fi
}

check_database() {
    echo "🗄️  Checking database..."
    
    DB_PATH="/home/pi/eform-locker/data/eform.db"
    if [ -f "$DB_PATH" ]; then
        status_ok "Database file exists"
        
        # Check database integrity
        if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
            status_ok "Database integrity OK"
        else
            status_error "Database integrity check failed"
        fi
        
        # Check database size
        DB_SIZE=$(stat -c%s "$DB_PATH")
        DB_SIZE_MB=$((DB_SIZE / 1024 / 1024))
        status_ok "Database size: ${DB_SIZE_MB}MB"
    else
        status_error "Database file missing"
    fi
}

# Generate summary report
generate_summary() {
    echo ""
    echo "📊 Health Check Summary"
    echo "======================="
    
    # Count status types from log
    OK_COUNT=$(grep -c "OK:" "$LOG_FILE" | tail -1 || echo 0)
    WARNING_COUNT=$(grep -c "WARNING:" "$LOG_FILE" | tail -1 || echo 0)
    ERROR_COUNT=$(grep -c "ERROR:" "$LOG_FILE" | tail -1 || echo 0)
    
    echo "✅ OK: $OK_COUNT"
    echo "⚠️  Warnings: $WARNING_COUNT"
    echo "❌ Errors: $ERROR_COUNT"
    
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo ""
        echo "🚨 Critical Issues Found:"
        grep "ERROR:" "$LOG_FILE" | tail -5
        return 1
    elif [ "$WARNING_COUNT" -gt 0 ]; then
        echo ""
        echo "⚠️  Warnings Found:"
        grep "WARNING:" "$LOG_FILE" | tail -5
        return 2
    else
        echo ""
        echo "🎉 All systems healthy!"
        return 0
    fi
}

# Main health check function
main() {
    echo "🏥 Kiosk UI Health Check - $(date)"
    echo "=================================="
    
    # Create log directory if it doesn't exist
    mkdir -p "/home/pi/logs"
    
    # Clear previous health check from log
    echo "=== Health Check Started $(date) ===" >> "$LOG_FILE"
    
    # Run all health checks
    check_service_status || true
    check_api_health || true
    check_system_resources || true
    check_hardware_connectivity || true
    check_network_connectivity || true
    check_log_files || true
    check_configuration || true
    check_database || true
    
    # Generate summary
    generate_summary
    HEALTH_STATUS=$?
    
    echo "=== Health Check Completed $(date) ===" >> "$LOG_FILE"
    
    return $HEALTH_STATUS
}

# Handle command line arguments
case "${1:-check}" in
    "check")
        main
        ;;
    "service")
        check_service_status
        ;;
    "api")
        check_api_health
        ;;
    "resources")
        check_system_resources
        ;;
    "hardware")
        check_hardware_connectivity
        ;;
    "network")
        check_network_connectivity
        ;;
    "logs")
        check_log_files
        ;;
    "config")
        check_configuration
        ;;
    "database")
        check_database
        ;;
    *)
        echo "Usage: $0 [check|service|api|resources|hardware|network|logs|config|database]"
        echo "  check     - Run all health checks (default)"
        echo "  service   - Check service status only"
        echo "  api       - Check API health only"
        echo "  resources - Check system resources only"
        echo "  hardware  - Check hardware connectivity only"
        echo "  network   - Check network connectivity only"
        echo "  logs      - Check log files only"
        echo "  config    - Check configuration only"
        echo "  database  - Check database only"
        exit 1
        ;;
esac