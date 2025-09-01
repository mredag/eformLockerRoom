#!/bin/bash

# eForm Locker System - Service Stop Script
# This script gracefully stops all eForm services

set -e

# Configuration
PROJECT_DIR="/home/pi/eform-locker"
PID_DIR="$PROJECT_DIR/pids"
LOG_DIR="$PROJECT_DIR/logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

log_info "🛑 Stopping eForm Locker System services..."

# Function to stop service by PID file
stop_service_by_pid() {
    local service_name=$1
    local pid_file="$PID_DIR/${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            log_info "Stopping $service_name (PID: $pid)..."
            kill -TERM "$pid" 2>/dev/null || true
            
            # Wait for graceful shutdown
            local count=0
            while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
                sleep 1
                count=$((count + 1))
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                log_warning "Force killing $service_name (PID: $pid)"
                kill -KILL "$pid" 2>/dev/null || true
            fi
            
            log_success "$service_name stopped"
        else
            log_warning "$service_name PID file exists but process not running"
        fi
        
        # Remove PID file
        rm -f "$pid_file"
    else
        log_info "No PID file found for $service_name"
    fi
}

# Stop services in reverse order (Panel -> Kiosk -> Gateway)
log_info "Stopping services in order..."

# Stop Panel
stop_service_by_pid "panel"

# Stop Kiosk
stop_service_by_pid "kiosk"

# Stop Gateway
stop_service_by_pid "gateway"

# Fallback: Kill any remaining Node.js processes related to eForm
log_info "Checking for remaining eForm processes..."
REMAINING=$(ps aux | grep -E "node.*(gateway|kiosk|panel|eform)" | grep -v grep | wc -l)

if [ "$REMAINING" -gt 0 ]; then
    log_warning "Found $REMAINING remaining processes, cleaning up..."
    
    # Kill by process name patterns
    pkill -f "npm run start:gateway" 2>/dev/null || true
    pkill -f "npm run start:kiosk" 2>/dev/null || true
    pkill -f "npm run start:panel" 2>/dev/null || true
    pkill -f "node.*dist/index.js" 2>/dev/null || true
    
    sleep 3
    
    # Force kill if still running
    pkill -9 -f "npm run start:" 2>/dev/null || true
    pkill -9 -f "node.*dist/index.js" 2>/dev/null || true
    
    log_success "Cleanup completed"
else
    log_success "No remaining processes found"
fi

# Clean up PID files
log_info "Cleaning up PID files..."
rm -f "$PID_DIR"/*.pid 2>/dev/null || true

# Update status files
echo "STOPPED:$(date)" > "$PROJECT_DIR/.service-status"
rm -f "$PROJECT_DIR/.startup-success" 2>/dev/null || true

# Final verification
FINAL_CHECK=$(ps aux | grep -E "node.*(gateway|kiosk|panel|eform)" | grep -v grep | wc -l)
if [ "$FINAL_CHECK" -eq 0 ]; then
    log_success "🎉 All eForm Locker services stopped successfully"
    exit 0
else
    log_error "❌ Some processes may still be running"
    ps aux | grep -E "node.*(gateway|kiosk|panel|eform)" | grep -v grep
    exit 1
fi