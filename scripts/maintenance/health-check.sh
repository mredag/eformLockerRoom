#!/bin/bash

# Eform Locker System Health Check Script
# Comprehensive system health monitoring

set -e

# Configuration
INSTALL_DIR="/opt/eform"
DATA_DIR="/opt/eform/data"
CONFIG_DIR="/opt/eform/config"
LOG_DIR="/var/log/eform"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Health status
OVERALL_STATUS="healthy"
ISSUES=()

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    ISSUES+=("WARNING: $1")
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    OVERALL_STATUS="unhealthy"
    ISSUES+=("ERROR: $1")
}

# Check service status
check_services() {
    echo "=============================================="
    echo "  Service Status"
    echo "=============================================="
    
    local services=("eform-gateway" "eform-kiosk" "eform-panel" "eform-agent")
    
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            log_success "$service is running"
        else
            log_error "$service is not running"
        fi
        
        if systemctl is-enabled --quiet "$service"; then
            log_info "$service is enabled"
        else
            log_warning "$service is not enabled"
        fi
    done
    echo
}

# Check HTTP endpoints
check_endpoints() {
    echo "=============================================="
    echo "  HTTP Endpoints"
    echo "=============================================="
    
    local endpoints=(
        "Gateway:3000:/health"
        "Kiosk:3001:/health"
        "Panel:3002:/health"
    )
    
    for endpoint in "${endpoints[@]}"; do
        local name=$(echo "$endpoint" | cut -d: -f1)
        local port=$(echo "$endpoint" | cut -d: -f2)
        local path=$(echo "$endpoint" | cut -d: -f3)
        local url="http://localhost:$port$path"
        
        if curl -f -s --max-time 5 "$url" >/dev/null 2>&1; then
            log_success "$name endpoint ($url) is responding"
        else
            log_error "$name endpoint ($url) is not responding"
        fi
    done
    echo
}

# Check database
check_database() {
    echo "=============================================="
    echo "  Database Health"
    echo "=============================================="
    
    local db_file="$DATA_DIR/eform.db"
    
    if [[ -f "$db_file" ]]; then
        log_success "Database file exists: $db_file"
        
        # Check file permissions
        local owner=$(stat -c %U:%G "$db_file")
        if [[ "$owner" == "eform:eform" ]]; then
            log_success "Database file ownership is correct"
        else
            log_error "Database file ownership is incorrect: $owner (should be eform:eform)"
        fi
        
        # Check database integrity
        if sudo -u eform sqlite3 "$db_file" "PRAGMA integrity_check;" | grep -q "ok"; then
            log_success "Database integrity check passed"
        else
            log_error "Database integrity check failed"
        fi
        
        # Check WAL mode
        local wal_mode=$(sudo -u eform sqlite3 "$db_file" "PRAGMA journal_mode;")
        if [[ "$wal_mode" == "wal" ]]; then
            log_success "Database is in WAL mode"
        else
            log_warning "Database is not in WAL mode: $wal_mode"
        fi
        
        # Check table counts
        local locker_count=$(sudo -u eform sqlite3 "$db_file" "SELECT COUNT(*) FROM lockers;" 2>/dev/null || echo "0")
        log_info "Locker count: $locker_count"
        
        local event_count=$(sudo -u eform sqlite3 "$db_file" "SELECT COUNT(*) FROM events;" 2>/dev/null || echo "0")
        log_info "Event count: $event_count"
        
    else
        log_error "Database file not found: $db_file"
    fi
    echo
}

# Check disk space
check_disk_space() {
    echo "=============================================="
    echo "  Disk Space"
    echo "=============================================="
    
    local paths=("$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR" "/var/log")
    
    for path in "${paths[@]}"; do
        if [[ -d "$path" ]]; then
            local usage=$(df -h "$path" | awk 'NR==2 {print $5}' | sed 's/%//')
            local available=$(df -h "$path" | awk 'NR==2 {print $4}')
            
            if [[ $usage -lt 80 ]]; then
                log_success "$path: ${usage}% used, $available available"
            elif [[ $usage -lt 90 ]]; then
                log_warning "$path: ${usage}% used, $available available"
            else
                log_error "$path: ${usage}% used, $available available (critically low)"
            fi
        fi
    done
    echo
}

# Check memory usage
check_memory() {
    echo "=============================================="
    echo "  Memory Usage"
    echo "=============================================="
    
    local total_mem=$(free -h | awk '/^Mem:/ {print $2}')
    local used_mem=$(free -h | awk '/^Mem:/ {print $3}')
    local available_mem=$(free -h | awk '/^Mem:/ {print $7}')
    local mem_percent=$(free | awk '/^Mem:/ {printf "%.0f", $3/$2 * 100}')
    
    if [[ $mem_percent -lt 80 ]]; then
        log_success "Memory usage: ${mem_percent}% ($used_mem/$total_mem used, $available_mem available)"
    elif [[ $mem_percent -lt 90 ]]; then
        log_warning "Memory usage: ${mem_percent}% ($used_mem/$total_mem used, $available_mem available)"
    else
        log_error "Memory usage: ${mem_percent}% ($used_mem/$total_mem used, $available_mem available)"
    fi
    
    # Check swap usage
    local swap_total=$(free -h | awk '/^Swap:/ {print $2}')
    local swap_used=$(free -h | awk '/^Swap:/ {print $3}')
    
    if [[ "$swap_total" != "0B" ]]; then
        local swap_percent=$(free | awk '/^Swap:/ {if($2>0) printf "%.0f", $3/$2 * 100; else print "0"}')
        if [[ $swap_percent -lt 50 ]]; then
            log_success "Swap usage: ${swap_percent}% ($swap_used/$swap_total)"
        else
            log_warning "Swap usage: ${swap_percent}% ($swap_used/$swap_total)"
        fi
    else
        log_info "No swap configured"
    fi
    echo
}

# Check process status
check_processes() {
    echo "=============================================="
    echo "  Process Status"
    echo "=============================================="
    
    local services=("eform-gateway" "eform-kiosk" "eform-panel" "eform-agent")
    
    for service in "${services[@]}"; do
        local pid=$(systemctl show --property MainPID --value "$service" 2>/dev/null)
        
        if [[ "$pid" != "0" ]] && [[ -n "$pid" ]]; then
            local mem_usage=$(ps -p "$pid" -o %mem --no-headers 2>/dev/null | tr -d ' ')
            local cpu_usage=$(ps -p "$pid" -o %cpu --no-headers 2>/dev/null | tr -d ' ')
            local uptime=$(ps -p "$pid" -o etime --no-headers 2>/dev/null | tr -d ' ')
            
            log_success "$service (PID: $pid) - CPU: ${cpu_usage}%, MEM: ${mem_usage}%, Uptime: $uptime"
        else
            log_error "$service is not running (no PID)"
        fi
    done
    echo
}

# Check log files
check_logs() {
    echo "=============================================="
    echo "  Log Files"
    echo "=============================================="
    
    local log_dirs=("$LOG_DIR" "$INSTALL_DIR/logs")
    
    for log_dir in "${log_dirs[@]}"; do
        if [[ -d "$log_dir" ]]; then
            log_info "Checking logs in: $log_dir"
            
            # Check for recent errors
            local error_count=$(find "$log_dir" -name "*.log" -mtime -1 -exec grep -c "ERROR\|FATAL" {} + 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
            
            if [[ $error_count -eq 0 ]]; then
                log_success "No errors in recent logs"
            elif [[ $error_count -lt 10 ]]; then
                log_warning "$error_count errors found in recent logs"
            else
                log_error "$error_count errors found in recent logs"
            fi
            
            # Check log file sizes
            find "$log_dir" -name "*.log" -size +100M -exec basename {} \; | while read large_log; do
                log_warning "Large log file detected: $large_log (>100MB)"
            done
        fi
    done
    echo
}

# Check hardware connectivity
check_hardware() {
    echo "=============================================="
    echo "  Hardware Connectivity"
    echo "=============================================="
    
    # Check serial ports
    if [[ -c /dev/ttyUSB0 ]]; then
        log_success "Serial port /dev/ttyUSB0 is available"
    else
        log_warning "Serial port /dev/ttyUSB0 not found"
    fi
    
    # Check for USB devices
    local usb_devices=$(lsusb | wc -l)
    log_info "USB devices detected: $usb_devices"
    
    # Check for RFID readers (HID devices)
    local hid_devices=$(ls /dev/hidraw* 2>/dev/null | wc -l)
    if [[ $hid_devices -gt 0 ]]; then
        log_success "HID devices detected: $hid_devices"
    else
        log_warning "No HID devices detected"
    fi
    echo
}

# Check network connectivity
check_network() {
    echo "=============================================="
    echo "  Network Connectivity"
    echo "=============================================="
    
    # Check if ports are listening
    local ports=("3000" "3001" "3002")
    
    for port in "${ports[@]}"; do
        if netstat -tuln | grep -q ":$port "; then
            log_success "Port $port is listening"
        else
            log_error "Port $port is not listening"
        fi
    done
    
    # Check localhost connectivity
    if ping -c 1 localhost >/dev/null 2>&1; then
        log_success "Localhost connectivity OK"
    else
        log_error "Localhost connectivity failed"
    fi
    echo
}

# Check configuration
check_configuration() {
    echo "=============================================="
    echo "  Configuration"
    echo "=============================================="
    
    local config_file="$CONFIG_DIR/system.json"
    
    if [[ -f "$config_file" ]]; then
        log_success "Configuration file exists: $config_file"
        
        # Check JSON validity
        if jq empty "$config_file" >/dev/null 2>&1; then
            log_success "Configuration file is valid JSON"
        else
            log_error "Configuration file contains invalid JSON"
        fi
        
        # Check for default secrets
        if grep -q "change-this-in-production" "$config_file"; then
            log_error "Default secrets detected in configuration"
        else
            log_success "No default secrets found in configuration"
        fi
        
    else
        log_error "Configuration file not found: $config_file"
    fi
    echo
}

# Generate health report
generate_report() {
    echo "=============================================="
    echo "  Health Check Summary"
    echo "=============================================="
    echo
    
    if [[ "$OVERALL_STATUS" == "healthy" ]]; then
        log_success "Overall system status: HEALTHY"
    else
        log_error "Overall system status: UNHEALTHY"
    fi
    
    echo
    echo "Issues found: ${#ISSUES[@]}"
    
    if [[ ${#ISSUES[@]} -gt 0 ]]; then
        echo
        echo "Issue Details:"
        for issue in "${ISSUES[@]}"; do
            echo "  - $issue"
        done
    fi
    
    echo
    echo "Health check completed at: $(date)"
    echo "System uptime: $(uptime -p)"
    echo "Load average: $(uptime | awk -F'load average:' '{print $2}')"
}

# Main health check function
main() {
    echo "=============================================="
    echo "  Eform Locker System Health Check"
    echo "=============================================="
    echo "Started at: $(date)"
    echo
    
    check_services
    check_endpoints
    check_database
    check_disk_space
    check_memory
    check_processes
    check_logs
    check_hardware
    check_network
    check_configuration
    generate_report
    
    # Exit with appropriate code
    if [[ "$OVERALL_STATUS" == "healthy" ]]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"