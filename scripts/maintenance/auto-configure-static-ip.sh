#!/bin/bash

# eForm Locker System - Auto-Configure Static IP
# This script detects the current IP and configures it as static

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

log_header "Auto-Configuring Static IP for eForm Locker"
echo "============================================="

# Detect current network configuration
log_info "🔍 Detecting current network configuration..."

# Get current IP address
CURRENT_IP=$(hostname -I | awk '{print $1}')
if [ -z "$CURRENT_IP" ]; then
    log_error "Could not detect current IP address"
    exit 1
fi

# Get network interface (usually eth0 or wlan0)
INTERFACE=$(ip route | grep default | awk '{print $5}' | head -1)
if [ -z "$INTERFACE" ]; then
    log_error "Could not detect network interface"
    exit 1
fi

# Get current gateway
GATEWAY=$(ip route | grep default | awk '{print $3}' | head -1)
if [ -z "$GATEWAY" ]; then
    log_error "Could not detect gateway"
    exit 1
fi

# Calculate network prefix (assuming /24)
NETWORK_PREFIX=$(echo $CURRENT_IP | cut -d. -f1-3)
SUBNET="${NETWORK_PREFIX}.0/24"

# Get current DNS servers
DNS_SERVERS=$(grep "nameserver" /etc/resolv.conf | awk '{print $2}' | tr '\n' ' ' | sed 's/ $//')
if [ -z "$DNS_SERVERS" ]; then
    DNS_SERVERS="8.8.8.8 8.8.4.4"
    log_warning "Could not detect DNS servers, using Google DNS"
fi

log_info "📊 Detected Configuration:"
echo "  Interface: $INTERFACE"
echo "  Current IP: $CURRENT_IP"
echo "  Gateway: $GATEWAY"
echo "  Subnet: $SUBNET"
echo "  DNS Servers: $DNS_SERVERS"
echo ""

# Ask for confirmation
read -p "Configure $CURRENT_IP as static IP? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Configuration cancelled"
    exit 0
fi

# Backup existing dhcpcd.conf
log_info "📝 Backing up existing network configuration..."
cp /etc/dhcpcd.conf /etc/dhcpcd.conf.backup.$(date +%Y%m%d_%H%M%S)

# Remove any existing eForm static IP configuration
log_info "🧹 Removing any existing eForm IP configuration..."
sed -i '/# eForm Locker Static IP Configuration/,/^$/d' /etc/dhcpcd.conf

# Add new static IP configuration
log_info "⚙️ Configuring static IP: $CURRENT_IP..."

cat >> /etc/dhcpcd.conf << EOF

# eForm Locker Static IP Configuration
# Auto-configured on $(date)
interface $INTERFACE
static ip_address=$CURRENT_IP/24
static routers=$GATEWAY
static domain_name_servers=$DNS_SERVERS
EOF

log_success "Static IP configuration added to /etc/dhcpcd.conf"

# Update firewall rules for the detected network
log_info "🔥 Updating firewall rules for network $SUBNET..."

# Remove old network rules
ufw --force delete allow from 192.168.1.0/24 2>/dev/null || true

# Add new network rule
ufw allow from $SUBNET comment 'eForm Locker Network'

log_success "Firewall updated for network $SUBNET"

# Create IP configuration file for other scripts
log_info "📄 Creating IP configuration file..."
cat > /home/pi/eform-locker/.current-ip-config << EOF
# eForm Locker Current IP Configuration
# Auto-generated on $(date)
EFORM_IP=$CURRENT_IP
EFORM_INTERFACE=$INTERFACE
EFORM_GATEWAY=$GATEWAY
EFORM_SUBNET=$SUBNET
EFORM_DNS_SERVERS="$DNS_SERVERS"
EOF

chown pi:pi /home/pi/eform-locker/.current-ip-config
log_success "IP configuration saved to .current-ip-config"

# Update status script with current IP
log_info "📊 Updating status script with current IP..."
if [ -f "/home/pi/eform-status.sh" ]; then
    sed -i "s/192\.168\.1\.[0-9]\+/$CURRENT_IP/g" /home/pi/eform-status.sh
    log_success "Status script updated"
fi

# Update pi-manager scripts on Windows side (create update script)
log_info "💻 Creating Windows script update helper..."
cat > /home/pi/eform-locker/update-windows-scripts.txt << EOF
# Update Windows Pi Manager Scripts
# Run these commands on your Windows PC:

# Update pi-manager.ps1
# Edit scripts/deployment/pi-manager.ps1
# Change: \$PI_HOST = "pi@pi-eform-locker"
# To:     \$PI_HOST = "pi@$CURRENT_IP"

# Update manage-all-pis.ps1 if using multi-Pi setup
# Edit the IP address in the PI_LOCATIONS configuration

# Or use the discovery script to find the new IP:
# .\scripts\deployment\discover-pi.ps1
EOF

log_success "Windows update instructions created"

echo ""
log_header "🎉 Static IP Configuration Complete!"
echo "============================================="
echo ""
echo "📊 Configuration Summary:"
echo "  ✅ Static IP: $CURRENT_IP"
echo "  ✅ Interface: $INTERFACE"
echo "  ✅ Gateway: $GATEWAY"
echo "  ✅ DNS: $DNS_SERVERS"
echo "  ✅ Firewall: Updated for $SUBNET"
echo ""
echo "🌐 Web Interfaces (after reboot):"
echo "  • Admin Panel:   http://$CURRENT_IP:3001"
echo "  • Kiosk UI:      http://$CURRENT_IP:3002"
echo "  • Gateway API:   http://$CURRENT_IP:3000"
echo ""
echo "💡 Next Steps:"
echo "  1. Reboot the Pi to activate static IP: sudo reboot"
echo "  2. Update Windows scripts with new IP (see update-windows-scripts.txt)"
echo "  3. Test connectivity after reboot"
echo ""
echo "📄 Configuration files updated:"
echo "  • /etc/dhcpcd.conf (network config)"
echo "  • /home/pi/eform-locker/.current-ip-config (for scripts)"
echo "  • /home/pi/eform-status.sh (status dashboard)"
echo ""

log_warning "⚠️  Reboot required to activate static IP configuration"
echo ""
read -p "Reboot now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "🔄 Rebooting in 5 seconds..."
    sleep 5
    reboot
else
    log_info "Remember to reboot manually: sudo reboot"
fi