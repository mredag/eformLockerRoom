#!/bin/bash

# eForm Locker System - Update Windows Pi Manager Scripts
# This script updates Windows PowerShell scripts with the current Pi IP

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

log_header "Updating Windows Pi Manager Scripts"
echo "===================================="

# Get current IP
CURRENT_IP=$(hostname -I | awk '{print $1}')
if [ -z "$CURRENT_IP" ]; then
    log_error "Could not detect current IP address"
    exit 1
fi

log_info "Current Pi IP: $CURRENT_IP"

# Update pi-manager.ps1
if [ -f "scripts/deployment/pi-manager.ps1" ]; then
    log_info "📝 Updating pi-manager.ps1..."
    
    # Backup original
    cp scripts/deployment/pi-manager.ps1 scripts/deployment/pi-manager.ps1.backup.$(date +%Y%m%d_%H%M%S)
    
    # Update PI_HOST variable
    sed -i "s/\$PI_HOST = \"pi@[^\"]*\"/\$PI_HOST = \"pi@$CURRENT_IP\"/" scripts/deployment/pi-manager.ps1
    
    # Update hardcoded IPs in help text
    sed -i "s/192\.168\.1\.[0-9]\+/$CURRENT_IP/g" scripts/deployment/pi-manager.ps1
    
    log_success "pi-manager.ps1 updated"
else
    log_warning "pi-manager.ps1 not found"
fi

# Update manage-all-pis.ps1 (update the main Pi location)
if [ -f "scripts/deployment/manage-all-pis.ps1" ]; then
    log_info "📝 Updating manage-all-pis.ps1..."
    
    # Backup original
    cp scripts/deployment/manage-all-pis.ps1 scripts/deployment/manage-all-pis.ps1.backup.$(date +%Y%m%d_%H%M%S)
    
    # Update the main eForm Pi IP (assuming it's the first one or default)
    sed -i "s/\"ip\" = \"192\.168\.1\.[0-9]\+\"/\"ip\" = \"$CURRENT_IP\"/" scripts/deployment/manage-all-pis.ps1
    
    log_success "manage-all-pis.ps1 updated"
else
    log_warning "manage-all-pis.ps1 not found"
fi

# Update other deployment scripts
for script in scripts/deployment/*.ps1; do
    if [ -f "$script" ] && [ "$(basename "$script")" != "pi-manager.ps1" ] && [ "$(basename "$script")" != "manage-all-pis.ps1" ]; then
        log_info "📝 Updating $(basename "$script")..."
        
        # Backup and update hardcoded IPs
        cp "$script" "${script}.backup.$(date +%Y%m%d_%H%M%S)"
        sed -i "s/192\.168\.1\.[0-9]\+/$CURRENT_IP/g" "$script"
        
        log_success "$(basename "$script") updated"
    fi
done

# Update status script
if [ -f "/home/pi/eform-status.sh" ]; then
    log_info "📝 Updating status script..."
    sed -i "s/192\.168\.1\.[0-9]\+/$CURRENT_IP/g" /home/pi/eform-status.sh
    log_success "Status script updated"
fi

# Create summary file
log_info "📄 Creating update summary..."
cat > scripts/deployment/ip-update-summary.txt << EOF
# eForm Locker IP Update Summary
# Generated on $(date)

Pi IP Address Updated To: $CURRENT_IP

Files Updated:
$(find scripts/deployment -name "*.ps1.backup.*" -newer scripts/deployment/pi-manager.ps1 2>/dev/null | sed 's/\.backup\.[0-9_]*$//' | sort -u | sed 's/^/  • /')

Web Interfaces:
  • Admin Panel:   http://$CURRENT_IP:3001
  • Kiosk UI:      http://$CURRENT_IP:3002
  • Gateway API:   http://$CURRENT_IP:3000

Windows Commands to Test:
  .\scripts\deployment\pi-manager.ps1 status
  .\scripts\deployment\discover-pi.ps1

Next Steps:
  1. Commit and push changes to Git
  2. Test Windows scripts from development PC
  3. Verify web interfaces are accessible
EOF

log_success "Update summary created: scripts/deployment/ip-update-summary.txt"

echo ""
log_header "🎉 Windows Scripts Updated Successfully!"
echo "========================================"
echo ""
echo "📊 Summary:"
echo "  ✅ Pi IP: $CURRENT_IP"
echo "  ✅ PowerShell scripts updated"
echo "  ✅ Status script updated"
echo "  ✅ Backup files created"
echo ""
echo "🌐 Web Interfaces:"
echo "  • Admin Panel:   http://$CURRENT_IP:3001"
echo "  • Kiosk UI:      http://$CURRENT_IP:3002"
echo "  • Gateway API:   http://$CURRENT_IP:3000"
echo ""
echo "💡 Next Steps:"
echo "  1. Test Windows scripts: .\scripts\deployment\pi-manager.ps1 status"
echo "  2. Commit changes: git add . && git commit -m 'update: Pi IP to $CURRENT_IP'"
echo "  3. Push to repository: git push origin main"
echo ""

log_info "📄 See scripts/deployment/ip-update-summary.txt for details"