#!/bin/bash

# eForm Locker System - Service Restart Script
# This script gracefully restarts all eForm services

set -e

# Configuration
PROJECT_DIR="/home/pi/eform-locker"

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

log_info "🔄 Restarting eForm Locker System services..."

# Ensure we're in the right directory
cd "$PROJECT_DIR"

# Step 1: Stop services
log_info "Step 1: Stopping services..."
if bash "$PROJECT_DIR/scripts/deployment/stop-services.sh"; then
    log_success "Services stopped successfully"
else
    log_error "Failed to stop services cleanly"
    exit 1
fi

# Step 2: Wait a moment for cleanup
log_info "Waiting for cleanup..."
sleep 5

# Step 3: Start services
log_info "Step 2: Starting services..."
if bash "$PROJECT_DIR/scripts/deployment/startup-services.sh"; then
    log_success "Services started successfully"
else
    log_error "Failed to start services"
    exit 1
fi

log_success "🎉 eForm Locker services restarted successfully!"