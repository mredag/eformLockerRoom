#!/bin/bash

# eForm Locker System - Raspberry Pi Boot Setup
# This script configures the Pi for optimal eForm Locker operation

set -e

# Configuration
PROJECT_DIR="/home/pi/eform-locker"
BOOT_CONFIG="/boot/config.txt"
CMDLINE_CONFIG="/boot/cmdline.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

log_info "🔧 Configuring Raspberry Pi for eForm Locker System..."

# 1. Boot Configuration Optimizations
log_info "📝 Updating boot configuration..."

# Backup original config
cp "$BOOT_CONFIG" "${BOOT_CONFIG}.backup.$(date +%Y%m%d)"

# Add/update boot optimizations
cat >> "$BOOT_CONFIG" << 'EOF'

# eForm Locker System Optimizations
# Added by pi-boot-setup.sh

# GPU Memory Split (reduce GPU memory for headless operation)
gpu_mem=16

# Disable unnecessary hardware
dtparam=audio=off
dtparam=spi=off
dtparam=i2c=off

# Enable UART for debugging (optional)
enable_uart=1

# USB optimizations
dwc_otg.speed=1
dwc_otg.lpm_enable=0

# Performance optimizations
arm_freq=1500
over_voltage=2
temp_limit=75

# Disable WiFi and Bluetooth power management
dtoverlay=disable-wifi
dtoverlay=disable-bt
EOF

log_success "Boot configuration updated"

# 2. System Service Optimizations
log_info "⚙️  Optimizing system services..."

# Disable unnecessary services
systemctl disable bluetooth 2>/dev/null || true
systemctl disable cups 2>/dev/null || true
systemctl disable avahi-daemon 2>/dev/null || true
systemctl disable triggerhappy 2>/dev/null || true
systemctl disable dphys-swapfile 2>/dev/null || true

# Enable SSH (ensure remote access)
systemctl enable ssh

log_success "System services optimized"

# 3. Network Configuration
log_info "🌐 Checking network configuration..."

# Check if eForm static IP is already configured
if grep -q "# eForm Locker Static IP Configuration" /etc/dhcpcd.conf; then
    log_info "✅ eForm static IP already configured"
    
    # Get the configured IP for display
    CONFIGURED_IP=$(grep "static ip_address=" /etc/dhcpcd.conf | tail -1 | cut -d'=' -f2 | cut -d'/' -f1)
    if [ -n "$CONFIGURED_IP" ]; then
        log_success "Static IP: $CONFIGURED_IP"
    fi
else
    # Fallback to old hardcoded configuration if auto-config wasn't run
    log_warning "No eForm IP configuration found, using fallback (192.168.1.8)"
    cat >> /etc/dhcpcd.conf << 'EOF'

# eForm Locker Static IP Configuration (Fallback)
interface eth0
static ip_address=192.168.1.8/24
static routers=192.168.1.1
static domain_name_servers=8.8.8.8 8.8.4.4
EOF
    log_success "Fallback static IP configured (192.168.1.8)"
fi

# 4. File System Optimizations
log_info "📁 Configuring file system optimizations..."

# Add tmpfs mounts for logs (reduce SD card wear)
if ! grep -q "tmpfs.*eform" /etc/fstab; then
    cat >> /etc/fstab << 'EOF'

# eForm Locker tmpfs mounts (reduce SD card wear)
tmpfs /tmp tmpfs defaults,noatime,nosuid,size=100m 0 0
tmpfs /var/tmp tmpfs defaults,noatime,nosuid,size=50m 0 0
EOF
    log_success "tmpfs mounts configured"
else
    log_info "tmpfs mounts already configured"
fi

# 5. User and Permission Setup
log_info "👤 Configuring user permissions..."

# Add pi user to necessary groups
usermod -a -G dialout,gpio,spi,i2c,audio,video pi

# Set up sudo without password for service management
if ! grep -q "pi.*eform" /etc/sudoers; then
    echo "pi ALL=(ALL) NOPASSWD: /bin/systemctl * eform-*" >> /etc/sudoers
    echo "pi ALL=(ALL) NOPASSWD: /usr/bin/killall node" >> /etc/sudoers
    echo "pi ALL=(ALL) NOPASSWD: /usr/bin/pkill -f npm" >> /etc/sudoers
    log_success "Sudo permissions configured"
else
    log_info "Sudo permissions already configured"
fi

# 6. Firewall Configuration
log_info "🔥 Configuring firewall..."

# Install ufw if not present
apt-get update -qq
apt-get install -y ufw

# Configure firewall rules
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow 22/tcp

# Allow eForm Locker services
ufw allow 3000/tcp comment 'eForm Gateway'
ufw allow 3001/tcp comment 'eForm Panel'
ufw allow 3002/tcp comment 'eForm Kiosk'

# Allow local network access
ufw allow from 192.168.1.0/24

# Enable firewall
ufw --force enable

log_success "Firewall configured"

# 7. Log Rotation Configuration
log_info "📋 Configuring log rotation..."

cat > /etc/logrotate.d/eform-locker << 'EOF'
/home/pi/eform-locker/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    copytruncate
    su pi pi
}
EOF

log_success "Log rotation configured"

# 8. Cron Jobs for Maintenance
log_info "⏰ Setting up maintenance cron jobs..."

# Create cron job for pi user
sudo -u pi crontab -l 2>/dev/null | grep -v "eform" > /tmp/pi_cron || true

cat >> /tmp/pi_cron << 'EOF'

# eForm Locker System Maintenance
# Check services every 5 minutes
*/5 * * * * /home/pi/eform-locker/scripts/deployment/health-check.sh >> /home/pi/eform-locker/logs/health-check.log 2>&1

# Daily maintenance at 2 AM
0 2 * * * /home/pi/eform-locker/scripts/maintenance/daily-cleanup.sh >> /home/pi/eform-locker/logs/maintenance.log 2>&1

# Weekly system update check (Sundays at 3 AM)
0 3 * * 0 apt list --upgradable >> /home/pi/eform-locker/logs/system-updates.log 2>&1
EOF

sudo -u pi crontab /tmp/pi_cron
rm /tmp/pi_cron

log_success "Maintenance cron jobs configured"

# 9. Create startup status dashboard
log_info "📊 Creating startup dashboard..."

cat > /home/pi/eform-status.sh << 'EOF'
#!/bin/bash

# eForm Locker System Status Dashboard

echo "🏭 eForm Locker System Status"
echo "============================="
echo "Date: $(date)"
echo "Uptime: $(uptime -p)"
echo "IP Address: $(hostname -I | awk '{print $1}')"
echo ""

echo "🔧 Services Status:"
systemctl is-active eform-locker && echo "✅ Main Service: Running" || echo "❌ Main Service: Stopped"
systemctl is-active eform-monitor && echo "✅ Monitor: Running" || echo "❌ Monitor: Stopped"

echo ""
echo "🌐 Network Connectivity:"
curl -s http://localhost:3000/health --connect-timeout 3 > /dev/null && echo "✅ Gateway (3000): OK" || echo "❌ Gateway (3000): Failed"
curl -s http://localhost:3002/health --connect-timeout 3 > /dev/null && echo "✅ Kiosk (3002): OK" || echo "❌ Kiosk (3002): Failed"
curl -s http://localhost:3001 --connect-timeout 3 > /dev/null && echo "✅ Panel (3001): OK" || echo "❌ Panel (3001): Failed"

echo ""
echo "🔌 Hardware:"
echo "USB Devices: $(ls /dev/ttyUSB* 2>/dev/null | wc -l)"
echo "Temperature: $(vcgencmd measure_temp 2>/dev/null || echo 'N/A')"

echo ""
echo "💾 Resources:"
echo "Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "Disk: $(df -h / | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"

echo ""
echo "📝 Recent Logs:"
echo "Last 3 system events:"
tail -3 /home/pi/eform-locker/logs/system-monitor.log 2>/dev/null || echo "No monitor logs found"
EOF

chmod +x /home/pi/eform-status.sh
chown pi:pi /home/pi/eform-status.sh

log_success "Status dashboard created (/home/pi/eform-status.sh)"

# 10. Final system preparation
log_info "🎯 Final system preparation..."

# Ensure project directory permissions
chown -R pi:pi "$PROJECT_DIR"

# Create necessary directories
sudo -u pi mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/pids" "$PROJECT_DIR/data"

# Set executable permissions on all scripts
find "$PROJECT_DIR/scripts" -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true

log_success "System preparation completed"

echo ""
echo "🎉 Raspberry Pi boot setup completed successfully!"
echo ""
echo "📋 Summary of changes:"
echo "• Boot configuration optimized for headless operation"
echo "• Unnecessary services disabled"
echo "• Static IP configured (192.168.1.8)"
echo "• File system optimized with tmpfs"
echo "• Firewall configured with eForm ports"
echo "• Log rotation configured"
echo "• Maintenance cron jobs scheduled"
echo "• Status dashboard created"
echo ""
echo "🔄 Next steps:"
echo "1. Reboot the system: sudo reboot"
echo "2. After reboot, run: sudo systemctl enable eform-locker"
echo "3. Check status with: /home/pi/eform-status.sh"
echo ""
echo "⚠️  IMPORTANT: The system will reboot with optimized settings."
echo "   Make sure all changes are saved before rebooting!"