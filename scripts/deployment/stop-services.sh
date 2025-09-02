#!/bin/bash

# eForm Locker System - Service Stop Script
# This script gracefully stops all eForm services

set -e

# Configuration
PROJECT_DIR="/home/pi/eform-locker"
LOG_DIR="$PROJECT_DIR/logs"
PID_DIR="$PROJECT_DIR/pids"

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

# Ensure we're in the right directory
cd "$PROJECT_DIR"

log_info "🛑 Stopping eForm Locker System services..."

# Function to stop a service by PID file
stop_service_by_pid() {
    local service_name=$1
    local pid_file="$PID_DIR/${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            log_info "Stopping $service_name (PID: $pid)..."
            kill -TERM "$pid" 2>/dev/null || true
            
            # Wait for graceful shutdown
            local attempts=0
            while kill -0 "$pid" 2>/dev/null && [ $attempts -lt 10 ]; do
                sleep 1
                attempts=$((attempts + 1))
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                log_warning "Force killing $service_name (PID: $pid)..."
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

# Stop services in reverse order
log_info "Stopping services in reverse order..."

# Stop Panel
stop_service_by_pid "panel"

# Stop Kiosk
stop_service_by_pid "kiosk"

# Stop Gateway
stop_service_by_pid "gateway"

# Kill any remaining node processes (fallback)
log_info "Checking for remaining node processes..."
REMAINING=$(ps aux | grep "node.*dist/index.js" | grep -v grep | wc -l)
if [ "$REMAINING" -gt 0 ]; then
    log_warning "Found $REMAINING remaining node processes, killing them..."
    sudo killall node 2>/dev/null || true
    sleep 2
fi

# Final cleanup
log_info "Cleaning up..."

# Remove all PID files
rm -f "$PID_DIR"/*.pid

# Check final status
log_info "🔍 Final status check..."

services_stopped=true

# Check if any services are still running
for port in 3000 3001 3002; do
    if netstat -tuln | grep ":$port " > /dev/null; then
        log_error "❌ Port $port is still in use"
        services_stopped=false
    else
        log_success "✅ Port $port is free"
    fi
done

if $services_stopped; then
    log_success "🎉 All eForm Locker services stopped successfully!"
    
    # Remove startup success marker
    rm -f "$PROJECT_DIR/.startup-success"
    
    exit 0
else
    log_error "❌ Some services may still be running"
    exit 1
fi