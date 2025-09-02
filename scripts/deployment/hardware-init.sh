#!/bin/bash

# eForm Locker System - Hardware Initialization Script
# This script initializes hardware and system settings on boot

set -e

# Configuration
PROJECT_DIR="/home/pi/eform-locker"
LOG_FILE="/var/log/eform-hardware-init.log"

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

log_info "🔧 Starting eForm Locker hardware initialization..."

# Create status file
STATUS_FILE="$PROJECT_DIR/.hardware-init-status"
echo "STARTING" > "$STATUS_FILE"

# 1. USB Serial Device Configuration
log_info "🔌 Configuring USB serial devices..."

# Check for USB-RS485 adapter
if ls /dev/ttyUSB* > /dev/null 2>&1; then
    USB_DEVICES=$(ls /dev/ttyUSB*)
    log_success "Found USB serial devices: $USB_DEVICES"
    
    # Set permissions for USB devices
    for device in $USB_DEVICES; do
        chmod 666 "$device" 2>/dev/null || true
        log_info "Set permissions for $device"
    done
    
    # Primary device should be /dev/ttyUSB0
    if [ -e "/dev/ttyUSB0" ]; then
        log_success "Primary USB-RS485 adapter found at /dev/ttyUSB0"
        echo "USB_DEVICE_OK" >> "$STATUS_FILE"
    else
        log_warning "Primary USB device /dev/ttyUSB0 not found"
        echo "USB_DEVICE_WARNING" >> "$STATUS_FILE"
    fi
else
    log_error "No USB serial devices found!"
    echo "USB_DEVICE_ERROR" >> "$STATUS_FILE"
fi

# 2. System Permissions
log_info "🔐 Setting up system permissions..."

# Add pi user to dialout group (for serial access)
usermod -a -G dialout pi 2>/dev/null || true
log_success "Added pi user to dialout group"

# Set project directory permissions
chown -R pi:pi "$PROJECT_DIR" 2>/dev/null || true
log_success "Set project directory ownership"

# 3. Network Configuration Check
log_info "🌐 Checking network configuration..."

# Check if static IP is configured
if grep -q "192.168.1.8" /etc/dhcpcd.conf 2>/dev/null; then
    log_success "Static IP configuration found"
    echo "NETWORK_STATIC_OK" >> "$STATUS_FILE"
else
    log_warning "Static IP not configured, using DHCP"
    echo "NETWORK_DHCP" >> "$STATUS_FILE"
fi

# Check network connectivity
if ping -c 1 8.8.8.8 > /dev/null 2>&1; then
    log_success "Network connectivity OK"
    echo "NETWORK_OK" >> "$STATUS_FILE"
else
    log_warning "Network connectivity issues"
    echo "NETWORK_WARNING" >> "$STATUS_FILE"
fi

# 4. System Resource Check
log_info "📊 Checking system resources..."

# Check available memory
MEMORY_MB=$(free -m | awk 'NR==2{printf "%.0f", $7}')
if [ "$MEMORY_MB" -gt 100 ]; then
    log_success "Available memory: ${MEMORY_MB}MB"
    echo "MEMORY_OK" >> "$STATUS_FILE"
else
    log_warning "Low available memory: ${MEMORY_MB}MB"
    echo "MEMORY_WARNING" >> "$STATUS_FILE"
fi

# Check disk space
DISK_AVAILABLE=$(df / | awk 'NR==2 {print $4}')
DISK_AVAILABLE_MB=$((DISK_AVAILABLE / 1024))
if [ "$DISK_AVAILABLE_MB" -gt 500 ]; then
    log_success "Available disk space: ${DISK_AVAILABLE_MB}MB"
    echo "DISK_OK" >> "$STATUS_FILE"
else
    log_warning "Low disk space: ${DISK_AVAILABLE_MB}MB"
    echo "DISK_WARNING" >> "$STATUS_FILE"
fi

# Check CPU temperature
if [ -f "/sys/class/thermal/thermal_zone0/temp" ]; then
    TEMP_RAW=$(cat /sys/class/thermal/thermal_zone0/temp)
    TEMP_C=$((TEMP_RAW / 1000))
    if [ "$TEMP_C" -lt 70 ]; then
        log_success "CPU temperature: ${TEMP_C}°C"
        echo "TEMP_OK" >> "$STATUS_FILE"
    else
        log_warning "High CPU temperature: ${TEMP_C}°C"
        echo "TEMP_WARNING" >> "$STATUS_FILE"
    fi
fi

# 5. Create necessary directories
log_info "📁 Creating necessary directories..."

sudo -u pi mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/pids" "$PROJECT_DIR/data"
log_success "Created required directories"

# 6. Database initialization check
log_info "🗄️  Checking database..."

if [ -f "$PROJECT_DIR/data/eform.db" ]; then
    log_success "Database file exists"
    echo "DATABASE_OK" >> "$STATUS_FILE"
else
    log_warning "Database file not found - will be created on first run"
    echo "DATABASE_INIT_NEEDED" >> "$STATUS_FILE"
fi

# 7. Node.js and dependencies check
log_info "📦 Checking Node.js and dependencies..."

# Check Node.js version
if command -v node > /dev/null; then
    NODE_VERSION=$(node --version)
    log_success "Node.js version: $NODE_VERSION"
    echo "NODE_OK" >> "$STATUS_FILE"
else
    log_error "Node.js not found!"
    echo "NODE_ERROR" >> "$STATUS_FILE"
fi

# Check if node_modules exists
if [ -d "$PROJECT_DIR/node_modules" ]; then
    log_success "Node modules installed"
    echo "MODULES_OK" >> "$STATUS_FILE"
else
    log_warning "Node modules not found - may need npm install"
    echo "MODULES_WARNING" >> "$STATUS_FILE"
fi

# 8. Final status
log_info "📋 Hardware initialization summary..."

# Count warnings and errors
WARNINGS=$(grep -c "WARNING\|ERROR" "$STATUS_FILE" || echo "0")
ERRORS=$(grep -c "ERROR" "$STATUS_FILE" || echo "0")

if [ "$ERRORS" -eq 0 ]; then
    if [ "$WARNINGS" -eq 0 ]; then
        log_success "🎉 Hardware initialization completed successfully!"
        echo "COMPLETED_SUCCESS" >> "$STATUS_FILE"
        exit 0
    else
        log_warning "⚠️  Hardware initialization completed with $WARNINGS warnings"
        echo "COMPLETED_WITH_WARNINGS" >> "$STATUS_FILE"
        exit 0
    fi
else
    log_error "❌ Hardware initialization completed with $ERRORS errors and $WARNINGS warnings"
    echo "COMPLETED_WITH_ERRORS" >> "$STATUS_FILE"
    exit 1
fi