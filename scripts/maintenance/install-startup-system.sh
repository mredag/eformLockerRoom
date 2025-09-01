#!/bin/bash

# eForm Locker System - Complete Startup System Installation
# This script installs and configures the complete startup system for Raspberry Pi

set -e

# Configuration
PROJECT_DIR="/home/pi/eform-locker"
SCRIPT_DIR="$PROJECT_DIR/scripts/deployment"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

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

log_header() {
    echo -e "${PURPLE}🚀 $1${NC}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   echo "Usage: sudo bash scripts/deployment/install-startup-system.sh"
   exit 1
fi

# Verify project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    log_error "Project directory $PROJECT_DIR not found!"
    log_info "Please ensure the eForm Locker project is cloned to $PROJECT_DIR"
    exit 1
fi

# Verify we're in the right directory
cd "$PROJECT_DIR"

log_header "eForm Locker Startup System Installation"
echo "=========================================="
echo "This script will install and configure:"
echo "• Systemd services for automatic startup"
echo "• Hardware initialization scripts"
echo "• System monitoring and health checks"
echo "• Boot optimizations for Raspberry Pi"
echo "• Maintenance cron jobs"
echo "• Status dashboard"
echo ""

read -p "Continue with installation? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Installation cancelled"
    exit 0
fi

echo ""
log_header "Step 1: Installing Systemd Services"
echo "===================================="

# Make scripts executable
chmod +x "$SCRIPT_DIR"/*.sh

# Install systemd services
if bash "$SCRIPT_DIR/pi-startup-system.sh"; then
    log_success "Systemd services installed"
else
    log_error "Failed to install systemd services"
    exit 1
fi

echo ""
log_header "Step 2: Configuring Boot Optimizations"
echo "======================================"

# Configure boot optimizations
if bash "$SCRIPT_DIR/pi-boot-setup.sh"; then
    log_success "Boot optimizations configured"
else
    log_error "Failed to configure boot optimizations"
    exit 1
fi

echo ""
log_header "Step 3: Enabling Services"
echo "========================="

# Reload systemd daemon
systemctl daemon-reload
log_info "Systemd daemon reloaded"

# Enable services
systemctl enable eform-locker.service
log_success "eForm Locker service enabled"

systemctl enable eform-hardware-init.service
log_success "Hardware initialization service enabled"

systemctl enable eform-monitor.service
log_success "System monitor service enabled"

echo ""
log_header "Step 4: Setting Up Permissions"
echo "=============================="

# Ensure proper ownership
chown -R pi:pi "$PROJECT_DIR"
log_success "Project directory ownership set"

# Set executable permissions
find "$PROJECT_DIR/scripts" -name "*.sh" -exec chmod +x {} \;
log_success "Script permissions set"

# Create necessary directories
sudo -u pi mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/pids" "$PROJECT_DIR/data"
log_success "Required directories created"

echo ""
log_header "Step 5: Testing Installation"
echo "============================"

# Test hardware initialization
log_info "Testing hardware initialization..."
if bash "$SCRIPT_DIR/hardware-init.sh"; then
    log_success "Hardware initialization test passed"
else
    log_warning "Hardware initialization test completed with warnings"
fi

# Test health check
log_info "Testing health check system..."
if sudo -u pi bash "$SCRIPT_DIR/health-check.sh"; then
    log_success "Health check system working"
else
    log_warning "Health check completed with warnings (services not running yet)"
fi

echo ""
log_header "Step 6: Creating Quick Access Commands"
echo "====================================="

# Create convenient aliases for pi user
cat >> /home/pi/.bashrc << 'EOF'

# eForm Locker System Aliases
alias eform-status='/home/pi/eform-status.sh'
alias eform-logs='tail -f /home/pi/eform-locker/logs/*.log'
alias eform-health='bash /home/pi/eform-locker/scripts/deployment/health-check.sh'
alias eform-restart='sudo systemctl restart eform-locker'
alias eform-stop='sudo systemctl stop eform-locker'
alias eform-start='sudo systemctl start eform-locker'
EOF

log_success "Quick access aliases created"

echo ""
log_header "Installation Complete!"
echo "====================="
echo ""
log_success "🎉 eForm Locker startup system installed successfully!"
echo ""
echo "📋 What was installed:"
echo "• ✅ Systemd services for automatic startup"
echo "• ✅ Hardware initialization on boot"
echo "• ✅ Continuous system monitoring"
echo "• ✅ Boot configuration optimizations"
echo "• ✅ Maintenance cron jobs"
echo "• ✅ Health check system"
echo "• ✅ Status dashboard"
echo "• ✅ Log rotation"
echo "• ✅ Firewall configuration"
echo ""
echo "🎯 Next Steps:"
echo "============="
echo "1. 🔄 Reboot the system to apply all changes:"
echo "   sudo reboot"
echo ""
echo "2. 📊 After reboot, check system status:"
echo "   eform-status"
echo ""
echo "3. 🔍 Monitor services:"
echo "   sudo systemctl status eform-locker"
echo "   eform-health"
echo ""
echo "4. 📝 View logs:"
echo "   eform-logs"
echo ""
echo "5. 🌐 Access web interfaces:"
echo "   • Admin Panel:   http://192.168.1.8:3001"
echo "   • Kiosk UI:      http://192.168.1.8:3002"
echo "   • Gateway API:   http://192.168.1.8:3000"
echo ""
echo "🔧 Service Management:"
echo "====================="
echo "• Start:   eform-start   (or sudo systemctl start eform-locker)"
echo "• Stop:    eform-stop    (or sudo systemctl stop eform-locker)"
echo "• Restart: eform-restart (or sudo systemctl restart eform-locker)"
echo "• Status:  eform-status"
echo "• Health:  eform-health"
echo "• Logs:    eform-logs"
echo ""
echo "📚 Documentation:"
echo "=================="
echo "• Startup System Guide: docs/raspberry-pi-startup-system.md"
echo "• Troubleshooting: docs/kiosk-troubleshooting-guide.md"
echo "• Performance Guide: docs/raspberry-pi-performance-optimizations.md"
echo ""
log_warning "⚠️  IMPORTANT: Please reboot the system to activate all changes!"
echo "   sudo reboot"
echo ""