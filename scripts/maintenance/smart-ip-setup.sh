#!/bin/bash

# eForm Locker System - Smart IP Setup
# This script handles complete IP configuration including Windows script updates

set -e

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
   exit 1
fi

log_header "eForm Locker Smart IP Setup"
echo "============================"
echo "This script will:"
echo "• Detect current IP address"
echo "• Configure it as static IP"
echo "• Update all scripts and configurations"
echo "• Update Windows management scripts"
echo "• Create status dashboard"
echo ""

# Step 1: Auto-configure static IP
log_header "Step 1: Configuring Static IP"
echo "=============================="

if bash /home/pi/eform-locker/scripts/maintenance/auto-configure-static-ip.sh; then
    log_success "Static IP configuration completed"
else
    log_error "Failed to configure static IP"
    exit 1
fi

# Step 2: Update Windows scripts
echo ""
log_header "Step 2: Updating Windows Scripts"
echo "================================="

if bash /home/pi/eform-locker/scripts/maintenance/update-windows-pi-manager.sh; then
    log_success "Windows scripts updated"
else
    log_error "Failed to update Windows scripts"
    exit 1
fi

# Step 3: Create enhanced status script
echo ""
log_header "Step 3: Creating Status Dashboard"
echo "=================================="

# Get current IP for status script
CURRENT_IP=$(hostname -I | awk '{print $1}')

cat > /home/pi/eform-status.sh << EOF
#!/bin/bash

# eForm Locker System Status Dashboard
# Auto-generated on $(date)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "\${PURPLE}🏭 eForm Locker System Status\${NC}"
echo "============================="
echo "Date: \$(date)"
echo "Uptime: \$(uptime -p)"
echo "IP Address: $CURRENT_IP"
echo ""

echo -e "\${BLUE}🔧 Services Status:\${NC}"
systemctl is-active eform-locker.service --quiet && echo -e "\${GREEN}✅ Main Service: Running\${NC}" || echo -e "\${RED}❌ Main Service: Stopped\${NC}"
systemctl is-active eform-monitor.service --quiet && echo -e "\${GREEN}✅ Monitor: Running\${NC}" || echo -e "\${RED}❌ Monitor: Stopped\${NC}"

echo ""
echo -e "\${BLUE}🌐 Network Connectivity:\${NC}"
curl -s http://localhost:3000/health --connect-timeout 3 > /dev/null && echo -e "\${GREEN}✅ Gateway (3000): OK\${NC}" || echo -e "\${RED}❌ Gateway (3000): Failed\${NC}"
curl -s http://localhost:3002/health --connect-timeout 3 > /dev/null && echo -e "\${GREEN}✅ Kiosk (3002): OK\${NC}" || echo -e "\${RED}❌ Kiosk (3002): Failed\${NC}"
curl -s http://localhost:3001/health --connect-timeout 3 > /dev/null && echo -e "\${GREEN}✅ Panel (3001): OK\${NC}" || echo -e "\${RED}❌ Panel (3001): Failed\${NC}"

echo ""
echo -e "\${BLUE}🔌 Hardware:\${NC}"
USB_COUNT=\$(lsusb | wc -l)
echo "USB Devices: \$USB_COUNT"
TEMP=\$(vcgencmd measure_temp 2>/dev/null | cut -d'=' -f2 || echo "N/A")
echo "Temperature: \$TEMP"

echo ""
echo -e "\${BLUE}💾 Resources:\${NC}"
echo "Memory: \$(free -h | awk 'NR==2{printf \"%s/%s\", \$3, \$2}')"
echo "Disk: \$(df -h / | awk 'NR==2{printf \"%s/%s (%s used)\", \$3, \$2, \$5}')"

echo ""
echo -e "\${BLUE}📝 Recent Logs:\${NC}"
echo "Last 3 system events:"
tail -3 /home/pi/eform-locker/logs/*.log 2>/dev/null | grep -E "^\[" | tail -3 || echo "No recent logs found"

echo ""
echo -e "\${PURPLE}🌐 Web Interfaces:\${NC}"
echo "  • Admin Panel:   http://$CURRENT_IP:3001"
echo "  • Kiosk UI:      http://$CURRENT_IP:3002"
echo "  • Gateway API:   http://$CURRENT_IP:3000"
echo ""
EOF

chmod +x /home/pi/eform-status.sh
chown pi:pi /home/pi/eform-status.sh
log_success "Status dashboard created: /home/pi/eform-status.sh"

# Step 4: Create quick access aliases
echo ""
log_header "Step 4: Creating Quick Access Commands"
echo "======================================"

# Add aliases to .bashrc if not already present
if ! grep -q "eform-status" /home/pi/.bashrc; then
    cat >> /home/pi/.bashrc << 'EOF'

# eForm Locker Quick Commands
alias eform-status='/home/pi/eform-status.sh'
alias eform-health='bash /home/pi/eform-locker/scripts/maintenance/health-check.sh'
alias eform-logs='tail -f /home/pi/eform-locker/logs/*.log'
alias eform-start='bash /home/pi/eform-locker/scripts/maintenance/startup-services.sh'
alias eform-stop='bash /home/pi/eform-locker/scripts/maintenance/stop-services.sh'
alias eform-restart='bash /home/pi/eform-locker/scripts/maintenance/restart-services.sh'
EOF
    log_success "Quick access commands added to .bashrc"
else
    log_info "Quick access commands already configured"
fi

# Step 5: Final summary
echo ""
log_header "🎉 Smart IP Setup Complete!"
echo "============================"
echo ""
echo "📊 Configuration Summary:"
echo "  ✅ Static IP: $CURRENT_IP"
echo "  ✅ Windows scripts updated"
echo "  ✅ Status dashboard created"
echo "  ✅ Quick access commands configured"
echo ""
echo "🌐 Web Interfaces:"
echo "  • Admin Panel:   http://$CURRENT_IP:3001"
echo "  • Kiosk UI:      http://$CURRENT_IP:3002"
echo "  • Gateway API:   http://$CURRENT_IP:3000"
echo ""
echo "⚡ Quick Commands (after reboot):"
echo "  • eform-status    - System dashboard"
echo "  • eform-health    - Health check"
echo "  • eform-logs      - View logs"
echo "  • eform-restart   - Restart services"
echo ""
echo "💻 Windows Management:"
echo "  • .\scripts\deployment\pi-manager.ps1 status"
echo "  • .\scripts\deployment\discover-pi.ps1"
echo ""
echo "📄 Files Created/Updated:"
echo "  • /etc/dhcpcd.conf (static IP)"
echo "  • /home/pi/eform-status.sh (dashboard)"
echo "  • /home/pi/eform-locker/.current-ip-config"
echo "  • scripts/deployment/*.ps1 (Windows scripts)"
echo ""

log_warning "⚠️  Reboot required to activate all changes"
echo ""
read -p "Reboot now to complete setup? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "🔄 Rebooting in 5 seconds..."
    sleep 5
    reboot
else
    log_info "Remember to reboot manually: sudo reboot"
    echo ""
    log_info "After reboot, test with: eform-status"
fi