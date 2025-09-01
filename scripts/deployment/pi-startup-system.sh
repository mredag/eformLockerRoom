#!/bin/bash

# eForm Locker System - Raspberry Pi Startup System Setup
# This script configures the Pi to automatically start services and perform useful tasks on boot

set -e

echo "🚀 Setting up eForm Locker System startup configuration..."
echo "=========================================================="

# Configuration
PROJECT_DIR="/home/pi/eform-locker"
SERVICE_USER="pi"
LOG_DIR="$PROJECT_DIR/logs"
SYSTEMD_DIR="/etc/systemd/system"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

# Verify project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    log_error "Project directory $PROJECT_DIR not found!"
    exit 1
fi

log_info "Creating startup system for eForm Locker..."

# 1. Create systemd service files
log_info "Creating systemd service files..."

# Main eForm Locker service
cat > "$SYSTEMD_DIR/eform-locker.service" << 'EOF'
[Unit]
Description=eForm Locker System - Main Service
After=network.target
Wants=network-online.target
After=network-online.target

[Service]
Type=forking
User=pi
Group=pi
WorkingDirectory=/home/pi/eform-locker
Environment=NODE_ENV=production
Environment=PATH=/usr/local/bin:/usr/bin:/bin:/home/pi/.nvm/versions/node/v20.17.0/bin
ExecStartPre=/bin/bash -c 'cd /home/pi/eform-locker && npm run build'
ExecStart=/bin/bash /home/pi/eform-locker/scripts/deployment/startup-services.sh
ExecStop=/bin/bash /home/pi/eform-locker/scripts/deployment/stop-services.sh
ExecReload=/bin/bash /home/pi/eform-locker/scripts/deployment/restart-services.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=eform-locker

[Install]
WantedBy=multi-user.target
EOF

# Hardware initialization service
cat > "$SYSTEMD_DIR/eform-hardware-init.service" << 'EOF'
[Unit]
Description=eForm Locker Hardware Initialization
Before=eform-locker.service
After=network.target

[Service]
Type=oneshot
User=root
ExecStart=/bin/bash /home/pi/eform-locker/scripts/deployment/hardware-init.sh
RemainAfterExit=yes
StandardOutput=journal
StandardError=journal
SyslogIdentifier=eform-hardware-init

[Install]
WantedBy=multi-user.target
EOF

# System monitoring service
cat > "$SYSTEMD_DIR/eform-monitor.service" << 'EOF'
[Unit]
Description=eForm Locker System Monitor
After=eform-locker.service
Requires=eform-locker.service

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/eform-locker
Environment=NODE_ENV=production
ExecStart=/bin/bash /home/pi/eform-locker/scripts/deployment/system-monitor.sh
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal
SyslogIdentifier=eform-monitor

[Install]
WantedBy=multi-user.target
EOF

log_success "Systemd service files created"

# 2. Create startup scripts
log_info "Creating startup scripts..."

# Create scripts directory if it doesn't exist
mkdir -p "$PROJECT_DIR/scripts/deployment"

log_success "Startup system configuration completed!"

echo ""
echo "🎯 Next steps:"
echo "=============="
echo "1. Run: sudo systemctl daemon-reload"
echo "2. Run: sudo systemctl enable eform-locker.service"
echo "3. Run: sudo systemctl enable eform-hardware-init.service"
echo "4. Run: sudo systemctl enable eform-monitor.service"
echo "5. Reboot to test: sudo reboot"
echo ""
echo "📊 Monitor services with:"
echo "sudo systemctl status eform-locker"
echo "sudo journalctl -u eform-locker -f"
echo ""
echo "🔧 Manual control:"
echo "sudo systemctl start/stop/restart eform-locker"