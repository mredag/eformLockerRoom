#!/bin/bash

# eForm Locker System - Service Startup Script
# This script starts all eForm services in the correct order with proper initialization

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

# Create necessary directories
mkdir -p "$LOG_DIR" "$PID_DIR"

log_info "🚀 Starting eForm Locker System services..."

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local port=$2
    local max_attempts=30
    local attempt=1
    
    log_info "⏳ Waiting for $service_name to be ready on port $port..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://localhost:$port/health" --connect-timeout 2 > /dev/null 2>&1; then
            log_success "$service_name is ready!"
            return 0
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            log_error "$service_name failed to start after $max_attempts attempts"
            return 1
        fi
        
        sleep 2
        attempt=$((attempt + 1))
    done
}

# Function to start a service
start_service() {
    local service_name=$1
    local npm_script=$2
    local port=$3
    local pid_file="$PID_DIR/${service_name}.pid"
    
    log_info "🌐 Starting $service_name service..."
    
    # Start the service in background
    nohup npm run "$npm_script" > "$LOG_DIR/${service_name}.log" 2>&1 &
    local service_pid=$!
    
    # Save PID
    echo $service_pid > "$pid_file"
    log_info "$service_name PID: $service_pid (saved to $pid_file)"
    
    # Wait for service to be ready
    if wait_for_service "$service_name" "$port"; then
        log_success "$service_name started successfully"
        return 0
    else
        log_error "$service_name failed to start"
        return 1
    fi
}

# Pre-startup checks
log_info "🔍 Running pre-startup checks..."

# Check Node.js version
NODE_VERSION=$(node --version)
log_info "Node.js version: $NODE_VERSION"

# Check if ports are available
for port in 3000 3001 3002; do
    if netstat -tuln | grep ":$port " > /dev/null; then
        log_warning "Port $port is already in use, attempting to free it..."
        sudo fuser -k $port/tcp 2>/dev/null || true
        sleep 2
    fi
done

# Kill any existing services
log_info "🛑 Stopping any existing services..."
sudo killall node 2>/dev/null || true
sleep 3

# Clean up old PID files
rm -f "$PID_DIR"/*.pid

# Build services
log_info "🔨 Building services..."
if npm run build; then
    log_success "Build completed successfully"
else
    log_error "Build failed"
    exit 1
fi

# Start services in order
log_info "🚀 Starting services in sequence..."

# 1. Start Gateway (core API)
if start_service "gateway" "start:gateway" "3000"; then
    log_success "Gateway service started"
else
    log_error "Failed to start Gateway service"
    exit 1
fi

# 2. Start Kiosk (hardware control)
if start_service "kiosk" "start:kiosk" "3002"; then
    log_success "Kiosk service started"
else
    log_error "Failed to start Kiosk service"
    exit 1
fi

# 3. Start Panel (admin interface)
log_info "📊 Starting Panel service..."
nohup npm run start:panel > "$LOG_DIR/panel.log" 2>&1 &
PANEL_PID=$!
echo $PANEL_PID > "$PID_DIR/panel.pid"
log_info "Panel PID: $PANEL_PID"

# Wait for Panel (it doesn't have /health endpoint, so check if it responds)
sleep 5
if curl -s "http://localhost:3001" --connect-timeout 3 > /dev/null 2>&1; then
    log_success "Panel service started successfully"
else
    log_warning "Panel service may not be fully ready yet"
fi

# Final status check
log_info "🔍 Final service status check..."

# Check all services
services_ok=true

if curl -s "http://localhost:3000/health" --connect-timeout 3 > /dev/null; then
    log_success "✅ Gateway (port 3000): Running"
else
    log_error "❌ Gateway (port 3000): Not responding"
    services_ok=false
fi

if curl -s "http://localhost:3002/health" --connect-timeout 3 > /dev/null; then
    log_success "✅ Kiosk (port 3002): Running"
else
    log_error "❌ Kiosk (port 3002): Not responding"
    services_ok=false
fi

if curl -s "http://localhost:3001" --connect-timeout 3 > /dev/null; then
    log_success "✅ Panel (port 3001): Running"
else
    log_error "❌ Panel (port 3001): Not responding"
    services_ok=false
fi

# Log startup completion
if $services_ok; then
    log_success "🎉 All eForm Locker services started successfully!"
    
    echo ""
    echo "🎯 Service Access URLs:"
    echo "======================"
    CURRENT_IP=$(hostname -I | awk '{print $1}' || echo "localhost")
    echo "📊 Admin Panel:   http://$CURRENT_IP:3001"
    echo "🔧 Relay Control: http://$CURRENT_IP:3001/relay"
    echo "📋 Lockers:       http://$CURRENT_IP:3001/lockers"
    echo "🌐 Gateway API:   http://$CURRENT_IP:3000"
    echo "🖥️  Kiosk UI:      http://$CURRENT_IP:3002"
    echo ""
    echo "📝 Monitor logs:"
    echo "tail -f $LOG_DIR/gateway.log"
    echo "tail -f $LOG_DIR/kiosk.log"
    echo "tail -f $LOG_DIR/panel.log"
    
    # Create startup success marker
    echo "$(date)" > "$PROJECT_DIR/.startup-success"
    
    exit 0
else
    log_error "❌ Some services failed to start properly"
    exit 1
fi