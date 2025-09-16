#!/bin/bash

# eForm Locker System - System Monitor Script
# This script continuously monitors system health and services

set -e

# Configuration
PROJECT_DIR="/home/pi/eform-locker"
LOG_DIR="$PROJECT_DIR/logs"
MONITOR_LOG="$LOG_DIR/system-monitor.log"
STATUS_FILE="$PROJECT_DIR/.system-status"
ALERTS_FILE="$PROJECT_DIR/.system-alerts"
CHECK_INTERVAL=60  # seconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] ℹ️  $1${NC}" | tee -a "$MONITOR_LOG"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$MONITOR_LOG"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}" | tee -a "$MONITOR_LOG"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1" >> "$ALERTS_FILE"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$MONITOR_LOG"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> "$ALERTS_FILE"
}

# Ensure we're in the right directory
cd "$PROJECT_DIR"

# Create necessary directories
mkdir -p "$LOG_DIR"

log_info "🔍 Starting eForm Locker system monitor..."

# Function to check service health
check_service_health() {
    local service_name=$1
    local port=$2
    local endpoint=$3
    
    if curl -s "http://localhost:$port$endpoint" --connect-timeout 5 > /dev/null 2>&1; then
        echo "OK"
        return 0
    else
        echo "FAILED"
        return 1
    fi
}

# Function to restart failed service
restart_failed_service() {
    local service_name=$1
    
    log_warning "Attempting to restart $service_name service..."
    
    # Try to restart via systemd first
    if systemctl is-active --quiet eform-locker; then
        systemctl restart eform-locker
        log_info "Restarted eform-locker service via systemd"
    else
        # Manual restart
        cd "$PROJECT_DIR"
        bash scripts/deployment/stop-services.sh
        sleep 5
        bash scripts/deployment/startup-services.sh
        log_info "Manually restarted services"
    fi
}

# Function to check system resources
check_system_resources() {
    # Memory check
    MEMORY_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    MEMORY_AVAILABLE=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    
    # Disk check
    DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    DISK_AVAILABLE=$(df / | awk 'NR==2 {print $4}')
    DISK_AVAILABLE_MB=$((DISK_AVAILABLE / 1024))
    
    # CPU temperature
    if [ -f "/sys/class/thermal/thermal_zone0/temp" ]; then
        TEMP_RAW=$(cat /sys/class/thermal/thermal_zone0/temp)
        CPU_TEMP=$((TEMP_RAW / 1000))
    else
        CPU_TEMP=0
    fi
    
    # CPU load
    CPU_LOAD=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    
    # Update status file
    cat > "$STATUS_FILE" << EOF
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
MEMORY_USAGE=${MEMORY_USAGE}%
MEMORY_AVAILABLE=${MEMORY_AVAILABLE}MB
DISK_USAGE=${DISK_USAGE}%
DISK_AVAILABLE=${DISK_AVAILABLE_MB}MB
CPU_TEMP=${CPU_TEMP}°C
CPU_LOAD=${CPU_LOAD}
EOF
    
    # Check for resource alerts
    if [ "$MEMORY_USAGE" -gt 85 ]; then
        log_warning "High memory usage: ${MEMORY_USAGE}%"
    fi
    
    if [ "$MEMORY_AVAILABLE" -lt 50 ]; then
        log_warning "Low available memory: ${MEMORY_AVAILABLE}MB"
    fi
    
    if [ "$DISK_USAGE" -gt 85 ]; then
        log_warning "High disk usage: ${DISK_USAGE}%"
    fi
    
    if [ "$DISK_AVAILABLE_MB" -lt 200 ]; then
        log_warning "Low disk space: ${DISK_AVAILABLE_MB}MB"
    fi
    
    if [ "$CPU_TEMP" -gt 70 ]; then
        log_warning "High CPU temperature: ${CPU_TEMP}°C"
    fi
}

# Function to check hardware connectivity
check_hardware() {
    # Check USB devices
    if ls /dev/ttyUSB* > /dev/null 2>&1; then
        USB_COUNT=$(ls /dev/ttyUSB* | wc -l)
        echo "USB_DEVICES=${USB_COUNT}" >> "$STATUS_FILE"
        
        if [ "$USB_COUNT" -eq 0 ]; then
            log_error "No USB serial devices found!"
        fi
    else
        log_error "USB serial devices not accessible"
        echo "USB_DEVICES=0" >> "$STATUS_FILE"
    fi
}

# Function to rotate logs
rotate_logs() {
    # Rotate monitor log if it gets too large (>10MB)
    if [ -f "$MONITOR_LOG" ] && [ $(stat -f%z "$MONITOR_LOG" 2>/dev/null || stat -c%s "$MONITOR_LOG") -gt 10485760 ]; then
        mv "$MONITOR_LOG" "${MONITOR_LOG}.old"
        log_info "Rotated monitor log file"
    fi
    
    # Keep only last 100 alerts
    if [ -f "$ALERTS_FILE" ] && [ $(wc -l < "$ALERTS_FILE") -gt 100 ]; then
        tail -100 "$ALERTS_FILE" > "${ALERTS_FILE}.tmp"
        mv "${ALERTS_FILE}.tmp" "$ALERTS_FILE"
        log_info "Rotated alerts file"
    fi
}

# Main monitoring loop
log_info "Monitor started with ${CHECK_INTERVAL}s interval"

while true; do
    # Check service health
    GATEWAY_STATUS=$(check_service_health "gateway" "3000" "/health")
    KIOSK_STATUS=$(check_service_health "kiosk" "3002" "/health")
    PANEL_STATUS=$(check_service_health "panel" "3001" "/health")
    
    # Update status file with service status
    echo "GATEWAY_STATUS=$GATEWAY_STATUS" >> "$STATUS_FILE"
    echo "KIOSK_STATUS=$KIOSK_STATUS" >> "$STATUS_FILE"
    echo "PANEL_STATUS=$PANEL_STATUS" >> "$STATUS_FILE"
    
    # Check for failed services
    FAILED_SERVICES=0
    
    if [ "$GATEWAY_STATUS" = "FAILED" ]; then
        log_error "Gateway service is not responding"
        FAILED_SERVICES=$((FAILED_SERVICES + 1))
    fi
    
    if [ "$KIOSK_STATUS" = "FAILED" ]; then
        log_error "Kiosk service is not responding"
        FAILED_SERVICES=$((FAILED_SERVICES + 1))
    fi
    
    if [ "$PANEL_STATUS" = "FAILED" ]; then
        log_error "Panel service is not responding"
        FAILED_SERVICES=$((FAILED_SERVICES + 1))
    fi
    
    # Auto-restart if services are down
    if [ "$FAILED_SERVICES" -gt 0 ]; then
        log_warning "$FAILED_SERVICES service(s) failed, attempting restart..."
        restart_failed_service "all"
        
        # Wait a bit before next check
        sleep 30
    else
        log_success "All services healthy: Gateway($GATEWAY_STATUS) Kiosk($KIOSK_STATUS) Panel($PANEL_STATUS)"
    fi
    
    # Check system resources
    check_system_resources
    
    # Check hardware
    check_hardware
    
    # Rotate logs if needed
    rotate_logs
    
    # Wait for next check
    sleep "$CHECK_INTERVAL"
done