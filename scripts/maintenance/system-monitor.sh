#!/bin/bash

# eForm Locker System - System Monitor Script
# This script continuously monitors system health and services

set -e

# Configuration
PROJECT_DIR="/home/pi/eform-locker"
LOG_FILE="$PROJECT_DIR/logs/system-monitor.log"
STATUS_FILE="$PROJECT_DIR/.system-status"
ALERT_FILE="$PROJECT_DIR/.system-alerts"
CHECK_INTERVAL=60  # seconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] ℹ️  $1${NC}" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$LOG_FILE"
}

# Function to check service health
check_service_health() {
    local service_name=$1
    local port=$2
    local endpoint=${3:-"/health"}
    
    if curl -s "http://localhost:$port$endpoint" --connect-timeout 5 --max-time 10 > /dev/null 2>&1; then
        return 0  # Service is healthy
    else
        return 1  # Service is not responding
    fi
}

# Function to check system resources
check_system_resources() {
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    local memory_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | cut -d'%' -f1)
    local temperature=$(vcgencmd measure_temp 2>/dev/null | cut -d'=' -f2 | cut -d"'" -f1 || echo "N/A")
    
    echo "CPU:${cpu_usage}% MEM:${memory_usage}% DISK:${disk_usage}% TEMP:${temperature}°C"
    
    # Check for resource alerts
    if (( $(echo "$cpu_usage > 80" | bc -l) )); then
        log_warning "High CPU usage: ${cpu_usage}%"
        echo "$(date): High CPU usage: ${cpu_usage}%" >> "$ALERT_FILE"
    fi
    
    if (( $(echo "$memory_usage > 85" | bc -l) )); then
        log_warning "High memory usage: ${memory_usage}%"
        echo "$(date): High memory usage: ${memory_usage}%" >> "$ALERT_FILE"
    fi
    
    if [ "$disk_usage" -gt 90 ]; then
        log_warning "High disk usage: ${disk_usage}%"
        echo "$(date): High disk usage: ${disk_usage}%" >> "$ALERT_FILE"
    fi
    
    if [ "$temperature" != "N/A" ] && (( $(echo "$temperature > 70" | bc -l) )); then
        log_warning "High temperature: ${temperature}°C"
        echo "$(date): High temperature: ${temperature}°C" >> "$ALERT_FILE"
    fi
}

# Function to check hardware connectivity
check_hardware() {
    local usb_devices=$(ls /dev/ttyUSB* 2>/dev/null | wc -l)
    local hardware_status="OK"
    
    if [ "$usb_devices" -eq 0 ]; then
        hardware_status="NO_USB"
        log_warning "No USB serial devices detected"
        echo "$(date): No USB serial devices detected" >> "$ALERT_FILE"
    fi
    
    echo "USB_DEVICES:$usb_devices STATUS:$hardware_status"
}

# Function to restart failed services
restart_failed_service() {
    local service_name=$1
    local npm_script=$2
    
    log_warning "Attempting to restart $service_name service..."
    
    # Kill existing process
    pkill -f "npm run $npm_script" 2>/dev/null || true
    sleep 3
    
    # Restart service
    cd "$PROJECT_DIR"
    nohup npm run "$npm_script" > "$PROJECT_DIR/logs/${service_name}.log" 2>&1 &
    
    # Save PID
    echo $! > "$PROJECT_DIR/pids/${service_name}.pid"
    
    log_info "$service_name restart initiated"
}

# Function to perform log rotation
rotate_logs() {
    local max_size=10485760  # 10MB
    
    for log_file in "$PROJECT_DIR/logs"/*.log; do
        if [ -f "$log_file" ] && [ $(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file" 2>/dev/null || echo 0) -gt $max_size ]; then
            mv "$log_file" "${log_file}.old"
            touch "$log_file"
            chown pi:pi "$log_file"
            log_info "Rotated log file: $(basename "$log_file")"
        fi
    done
}

# Function to cleanup old files
cleanup_old_files() {
    # Remove old log files (older than 7 days)
    find "$PROJECT_DIR/logs" -name "*.log.old" -mtime +7 -delete 2>/dev/null || true
    
    # Remove old alert entries (keep last 100)
    if [ -f "$ALERT_FILE" ]; then
        tail -100 "$ALERT_FILE" > "${ALERT_FILE}.tmp" && mv "${ALERT_FILE}.tmp" "$ALERT_FILE"
    fi
    
    # Remove old temporary files
    find /tmp -name "eform-*" -mtime +1 -delete 2>/dev/null || true
}

# Main monitoring loop
log_info "🔍 Starting eForm Locker system monitor..."

# Create necessary directories
mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/pids"

# Initialize status file
echo "MONITOR_STARTED:$(date)" > "$STATUS_FILE"

while true; do
    # Update status timestamp
    echo "LAST_CHECK:$(date)" >> "$STATUS_FILE"
    
    # Check services
    services_status=""
    restart_needed=false
    
    # Check Gateway
    if check_service_health "gateway" "3000"; then
        services_status="${services_status}GATEWAY:OK "
    else
        services_status="${services_status}GATEWAY:FAIL "
        log_error "Gateway service not responding"
        restart_failed_service "gateway" "start:gateway"
        restart_needed=true
    fi
    
    # Check Kiosk
    if check_service_health "kiosk" "3002"; then
        services_status="${services_status}KIOSK:OK "
    else
        services_status="${services_status}KIOSK:FAIL "
        log_error "Kiosk service not responding"
        restart_failed_service "kiosk" "start:kiosk"
        restart_needed=true
    fi
    
    # Check Panel (no health endpoint, just check if it responds)
    if check_service_health "panel" "3001" ""; then
        services_status="${services_status}PANEL:OK "
    else
        services_status="${services_status}PANEL:FAIL "
        log_error "Panel service not responding"
        restart_failed_service "panel" "start:panel"
        restart_needed=true
    fi
    
    # Check system resources
    resources_status=$(check_system_resources)
    
    # Check hardware
    hardware_status=$(check_hardware)
    
    # Update status file
    cat > "$STATUS_FILE" << EOF
MONITOR_STARTED:$(date)
LAST_CHECK:$(date)
SERVICES:$services_status
RESOURCES:$resources_status
HARDWARE:$hardware_status
RESTART_NEEDED:$restart_needed
EOF
    
    # Log periodic status (every 10 minutes)
    if [ $(($(date +%s) % 600)) -lt $CHECK_INTERVAL ]; then
        log_info "📊 Status - Services: $services_status | Resources: $resources_status | Hardware: $hardware_status"
    fi
    
    # Perform maintenance tasks (every hour)
    if [ $(($(date +%s) % 3600)) -lt $CHECK_INTERVAL ]; then
        log_info "🧹 Performing maintenance tasks..."
        rotate_logs
        cleanup_old_files
        
        # Database health check
        if [ -f "$PROJECT_DIR/data/eform.db" ]; then
            if sqlite3 "$PROJECT_DIR/data/eform.db" "PRAGMA integrity_check;" | grep -q "ok"; then
                log_info "Database integrity check: OK"
            else
                log_error "Database integrity check: FAILED"
                echo "$(date): Database integrity check failed" >> "$ALERT_FILE"
            fi
        fi
    fi
    
    # Wait for next check
    sleep $CHECK_INTERVAL
done