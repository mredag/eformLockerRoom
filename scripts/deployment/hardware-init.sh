#!/bin/bash

# eForm Locker System - Hardware Initialization Script
# This script initializes hardware components and system settings on boot

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

# 1. System Information
log_info "📊 System Information:"
echo "Hostname: $(hostname)" | tee -a "$LOG_FILE"
echo "IP Address: $(hostname -I | awk '{print $1}')" | tee -a "$LOG_FILE"
echo "Uptime: $(uptime)" | tee -a "$LOG_FILE"
echo "Memory: $(free -h | grep Mem)" | tee -a "$LOG_FILE"
echo "Disk: $(df -h / | tail -1)" | tee -a "$LOG_FILE"

# 2. USB Device Detection
log_info "🔌 Detecting USB devices..."
if lsusb | grep -i "serial\|rs485\|ftdi\|prolific" > /dev/null; then
    log_success "USB-RS485 adapter detected"
    lsusb | grep -i "serial\|rs485\|ftdi\|prolific" | tee -a "$LOG_FILE"
else
    log_warning "No USB-RS485 adapter detected"
fi

if lsusb | grep -i "rfid\|hid" > /dev/null; then
    log_success "RFID reader detected"
    lsusb | grep -i "rfid\|hid" | tee -a "$LOG_FILE"
else
    log_warning "No RFID reader detected"
fi

# 3. Serial Port Configuration
log_info "📡 Configuring serial ports..."

# Check for USB serial devices
USB_DEVICES=$(ls /dev/ttyUSB* 2>/dev/null || echo "")
if [ -n "$USB_DEVICES" ]; then
    for device in $USB_DEVICES; do
        log_info "Found serial device: $device"
        
        # Set permissions for pi user
        sudo chown pi:dialout "$device" 2>/dev/null || true
        sudo chmod 666 "$device" 2>/dev/null || true
        
        # Configure serial port settings
        stty -F "$device" 9600 cs8 -cstopb -parenb raw -echo 2>/dev/null || true
        
        log_success "Configured $device (9600 8N1)"
    done
else
    log_warning "No USB serial devices found"
fi

# 4. Network Configuration
log_info "🌐 Network configuration check..."
CURRENT_IP=$(hostname -I | awk '{print $1}')
EXPECTED_IP="192.168.1.8"

if [ "$CURRENT_IP" = "$EXPECTED_IP" ]; then
    log_success "IP address is correctly set to $CURRENT_IP"
else
    log_warning "IP address is $CURRENT_IP (expected: $EXPECTED_IP)"
fi

# Test network connectivity
if ping -c 1 8.8.8.8 > /dev/null 2>&1; then
    log_success "Internet connectivity: OK"
else
    log_warning "No internet connectivity"
fi

# 5. File System Permissions
log_info "📁 Setting up file system permissions..."

# Ensure project directory permissions
sudo chown -R pi:pi "$PROJECT_DIR" 2>/dev/null || true

# Create necessary directories
sudo -u pi mkdir -p "$PROJECT_DIR/logs" 2>/dev/null || true
sudo -u pi mkdir -p "$PROJECT_DIR/pids" 2>/dev/null || true
sudo -u pi mkdir -p "$PROJECT_DIR/data" 2>/dev/null || true

# Set executable permissions on scripts
find "$PROJECT_DIR/scripts" -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true

log_success "File system permissions configured"

# 6. Database Initialization
log_info "🗄️  Database initialization check..."
DB_FILE="$PROJECT_DIR/data/eform.db"

if [ -f "$DB_FILE" ]; then
    log_success "Database file exists: $DB_FILE"
    
    # Check database integrity
    if sudo -u pi sqlite3 "$DB_FILE" "PRAGMA integrity_check;" | grep -q "ok"; then
        log_success "Database integrity check passed"
    else
        log_error "Database integrity check failed"
    fi
else
    log_warning "Database file not found, will be created on first run"
fi

# 7. System Resource Optimization
log_info "⚡ Optimizing system resources..."

# Increase file descriptor limits for Node.js
echo "pi soft nofile 65536" >> /etc/security/limits.conf 2>/dev/null || true
echo "pi hard nofile 65536" >> /etc/security/limits.conf 2>/dev/null || true

# Set swappiness for better performance
echo 10 > /proc/sys/vm/swappiness 2>/dev/null || true

# Disable unnecessary services to free up resources
systemctl disable bluetooth 2>/dev/null || true
systemctl disable cups 2>/dev/null || true

log_success "System optimization completed"

# 8. Hardware Test
log_info "🔧 Running basic hardware test..."

if [ -f "$PROJECT_DIR/scripts/test-basic-relay-control.js" ]; then
    log_info "Testing relay control..."
    cd "$PROJECT_DIR"
    
    # Run hardware test with timeout
    timeout 30s sudo -u pi node scripts/test-basic-relay-control.js > /tmp/hardware-test.log 2>&1 || true
    
    if grep -q "success\|completed\|working" /tmp/hardware-test.log; then
        log_success "Hardware test completed successfully"
    else
        log_warning "Hardware test completed with warnings (check logs)"
    fi
else
    log_warning "Hardware test script not found"
fi

# 9. Service Dependencies Check
log_info "🔍 Checking service dependencies..."

# Check Node.js
if command -v node > /dev/null; then
    NODE_VERSION=$(node --version)
    log_success "Node.js version: $NODE_VERSION"
else
    log_error "Node.js not found!"
fi

# Check npm
if command -v npm > /dev/null; then
    NPM_VERSION=$(npm --version)
    log_success "npm version: $NPM_VERSION"
else
    log_error "npm not found!"
fi

# Check if project dependencies are installed
if [ -d "$PROJECT_DIR/node_modules" ]; then
    log_success "Project dependencies are installed"
else
    log_warning "Project dependencies not found, running npm install..."
    cd "$PROJECT_DIR"
    sudo -u pi npm install > /tmp/npm-install.log 2>&1 || true
fi

# 10. Create startup status file
log_info "📝 Creating startup status file..."
STATUS_FILE="$PROJECT_DIR/.hardware-init-status"

cat > "$STATUS_FILE" << EOF
Hardware Initialization Status
==============================
Date: $(date)
Hostname: $(hostname)
IP Address: $(hostname -I | awk '{print $1}')
Node.js: $(node --version 2>/dev/null || echo "Not found")
USB Devices: $(ls /dev/ttyUSB* 2>/dev/null | wc -l) found
Database: $([ -f "$DB_FILE" ] && echo "Present" || echo "Missing")
Status: Initialization completed
EOF

sudo chown pi:pi "$STATUS_FILE"
log_success "Status file created: $STATUS_FILE"

# 11. Final system check
log_info "🎯 Final system readiness check..."

READY=true

# Check critical components
if ! command -v node > /dev/null; then
    log_error "Node.js not available"
    READY=false
fi

if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    log_error "Project dependencies not installed"
    READY=false
fi

if [ ! -d "$PROJECT_DIR/app" ]; then
    log_error "Application code not found"
    READY=false
fi

if $READY; then
    log_success "🎉 Hardware initialization completed successfully!"
    echo "READY" > "$PROJECT_DIR/.hardware-ready"
    exit 0
else
    log_error "❌ Hardware initialization completed with errors"
    echo "ERROR" > "$PROJECT_DIR/.hardware-ready"
    exit 1
fi