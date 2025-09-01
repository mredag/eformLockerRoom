#!/bin/bash

# eForm Locker System - Health Check Script
# Quick health check for all services and components

set -e

# Configuration
PROJECT_DIR="/home/pi/eform-locker"
LOG_FILE="$PROJECT_DIR/logs/health-check.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')] ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] ✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ❌ $1${NC}"
}

# Function to check service health
check_service() {
    local service_name=$1
    local port=$2
    local endpoint=${3:-"/health"}
    
    if curl -s "http://localhost:$port$endpoint" --connect-timeout 3 --max-time 5 > /dev/null 2>&1; then
        log_success "$service_name (port $port): OK"
        return 0
    else
        log_error "$service_name (port $port): FAILED"
        return 1
    fi
}

# Quick health check
health_score=0
total_checks=6

echo "🏥 eForm Locker Health Check - $(date)" | tee -a "$LOG_FILE"
echo "======================================" | tee -a "$LOG_FILE"

# Check Gateway
if check_service "Gateway" "3000"; then
    health_score=$((health_score + 1))
fi

# Check Kiosk
if check_service "Kiosk" "3002"; then
    health_score=$((health_score + 1))
fi

# Check Panel (no health endpoint)
if check_service "Panel" "3001" ""; then
    health_score=$((health_score + 1))
fi

# Check USB devices
usb_count=$(ls /dev/ttyUSB* 2>/dev/null | wc -l)
if [ "$usb_count" -gt 0 ]; then
    log_success "USB devices: $usb_count found"
    health_score=$((health_score + 1))
else
    log_warning "USB devices: None found"
fi

# Check database
if [ -f "$PROJECT_DIR/data/eform.db" ]; then
    if sqlite3 "$PROJECT_DIR/data/eform.db" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
        log_success "Database: OK"
        health_score=$((health_score + 1))
    else
        log_error "Database: Integrity check failed"
    fi
else
    log_warning "Database: File not found"
fi

# Check system resources
cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 | cut -d',' -f1)
memory_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')

if (( $(echo "$cpu_usage < 80" | bc -l) )) && [ "$memory_usage" -lt 85 ]; then
    log_success "Resources: CPU ${cpu_usage}%, MEM ${memory_usage}%"
    health_score=$((health_score + 1))
else
    log_warning "Resources: CPU ${cpu_usage}%, MEM ${memory_usage}% (HIGH)"
fi

# Calculate health percentage
health_percentage=$((health_score * 100 / total_checks))

echo "" | tee -a "$LOG_FILE"
if [ "$health_percentage" -ge 80 ]; then
    log_success "Overall Health: ${health_percentage}% (${health_score}/${total_checks})" | tee -a "$LOG_FILE"
    exit 0
elif [ "$health_percentage" -ge 60 ]; then
    log_warning "Overall Health: ${health_percentage}% (${health_score}/${total_checks})" | tee -a "$LOG_FILE"
    exit 1
else
    log_error "Overall Health: ${health_percentage}% (${health_score}/${total_checks})" | tee -a "$LOG_FILE"
    exit 2
fi