#!/bin/bash

# eForm Locker System - Test IP Setup
# This script tests the IP configuration without making changes

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
    echo -e "${PURPLE}🔍 $1${NC}"
}

log_header "Testing eForm IP Configuration"
echo "==============================="

# Test 1: Detect current network configuration
log_info "🔍 Testing network detection..."

CURRENT_IP=$(hostname -I | awk '{print $1}')
INTERFACE=$(ip route | grep default | awk '{print $5}' | head -1)
GATEWAY=$(ip route | grep default | awk '{print $3}' | head -1)

if [ -n "$CURRENT_IP" ] && [ -n "$INTERFACE" ] && [ -n "$GATEWAY" ]; then
    log_success "Network detection working"
    echo "  IP: $CURRENT_IP"
    echo "  Interface: $INTERFACE"
    echo "  Gateway: $GATEWAY"
else
    log_error "Network detection failed"
    exit 1
fi

# Test 2: Check if static IP is configured
log_info "🔍 Testing static IP configuration..."

if grep -q "# eForm Locker Static IP Configuration" /etc/dhcpcd.conf; then
    CONFIGURED_IP=$(grep "static ip_address=" /etc/dhcpcd.conf | tail -1 | cut -d'=' -f2 | cut -d'/' -f1)
    log_success "Static IP configured: $CONFIGURED_IP"
    
    if [ "$CURRENT_IP" = "$CONFIGURED_IP" ]; then
        log_success "Current IP matches configured static IP"
    else
        log_warning "Current IP ($CURRENT_IP) differs from configured ($CONFIGURED_IP)"
        log_info "This is normal if you haven't rebooted after configuration"
    fi
else
    log_warning "No eForm static IP configuration found"
fi

# Test 3: Check Windows script configuration
log_info "🔍 Testing Windows script configuration..."

if [ -f "scripts/deployment/pi-manager.ps1" ]; then
    SCRIPT_IP=$(grep '\$PI_HOST = "pi@' scripts/deployment/pi-manager.ps1 | sed 's/.*pi@\([^"]*\)".*/\1/')
    if [ -n "$SCRIPT_IP" ]; then
        log_success "Windows script configured for: $SCRIPT_IP"
        
        if [ "$CURRENT_IP" = "$SCRIPT_IP" ]; then
            log_success "Windows script IP matches current IP"
        else
            log_warning "Windows script IP ($SCRIPT_IP) differs from current ($CURRENT_IP)"
        fi
    else
        log_warning "Could not detect IP in Windows script"
    fi
else
    log_warning "Windows pi-manager.ps1 not found"
fi

# Test 4: Check status script
log_info "🔍 Testing status script..."

if [ -f "/home/pi/eform-status.sh" ]; then
    STATUS_IP=$(grep "http://" /home/pi/eform-status.sh | head -1 | sed 's/.*http:\/\/\([^:]*\):.*/\1/')
    if [ -n "$STATUS_IP" ]; then
        log_success "Status script configured for: $STATUS_IP"
        
        if [ "$CURRENT_IP" = "$STATUS_IP" ]; then
            log_success "Status script IP matches current IP"
        else
            log_warning "Status script IP ($STATUS_IP) differs from current ($CURRENT_IP)"
        fi
    else
        log_warning "Could not detect IP in status script"
    fi
else
    log_warning "Status script not found"
fi

# Test 5: Check IP configuration file
log_info "🔍 Testing IP configuration file..."

if [ -f "/home/pi/eform-locker/.current-ip-config" ]; then
    source /home/pi/eform-locker/.current-ip-config
    log_success "IP configuration file found"
    echo "  Configured IP: $EFORM_IP"
    echo "  Interface: $EFORM_INTERFACE"
    echo "  Gateway: $EFORM_GATEWAY"
    
    if [ "$CURRENT_IP" = "$EFORM_IP" ]; then
        log_success "Configuration file IP matches current IP"
    else
        log_warning "Configuration file IP ($EFORM_IP) differs from current ($CURRENT_IP)"
    fi
else
    log_warning "IP configuration file not found"
fi

# Test 6: Test web interface accessibility
log_info "🔍 Testing web interface accessibility..."

for port in 3000 3001 3002; do
    if curl -s "http://localhost:$port/health" --connect-timeout 3 > /dev/null; then
        log_success "Port $port: Accessible"
    else
        log_warning "Port $port: Not accessible (service may not be running)"
    fi
done

echo ""
log_header "🎯 Test Summary"
echo "==============="
echo ""
echo "📊 Current Configuration:"
echo "  • Current IP: $CURRENT_IP"
echo "  • Interface: $INTERFACE"
echo "  • Gateway: $GATEWAY"
echo ""
echo "🌐 Expected Web Interfaces:"
echo "  • Admin Panel:   http://$CURRENT_IP:3001"
echo "  • Kiosk UI:      http://$CURRENT_IP:3002"
echo "  • Gateway API:   http://$CURRENT_IP:3000"
echo ""
echo "💡 To configure IP settings:"
echo "  sudo bash scripts/maintenance/smart-ip-setup.sh"
echo ""
echo "💻 To test Windows management:"
echo "  .\scripts\deployment\pi-manager.ps1 status"
echo ""