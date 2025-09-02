#!/bin/bash

# eForm Locker System - Service Restart Script
# This script restarts all eForm services

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

# Ensure we're in the right directory
cd "$PROJECT_DIR"

log_info "🔄 Restarting eForm Locker System services..."

# Stop services
log_info "🛑 Stopping services..."
if bash scripts/deployment/stop-services.sh; then
    log_success "Services stopped successfully"
else
    log_warning "Service stop completed with warnings"
fi

# Wait a moment
sleep 3

# Start services
log_info "🚀 Starting services..."
if bash scripts/deployment/startup-services.sh; then
    log_success "🎉 Services restarted successfully!"
    exit 0
else
    log_error "❌ Service restart failed"
    exit 1
fi