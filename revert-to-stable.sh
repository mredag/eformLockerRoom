#!/bin/bash

# 🔄 Revert to Stable Version Script
# This script reverts the system to the stable version before UI improvements

echo "🔄 Reverting to stable version (before locker-ui-improvements)..."
echo "================================================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Step 1: Stop all services
print_status "Stopping all services..."
sudo systemctl stop eform-panel || print_warning "Panel service might not be running"
sudo systemctl stop eform-gateway || print_warning "Gateway service might not be running"
sudo systemctl stop eform-kiosk || print_warning "Kiosk service might not be running"

# Step 2: Kill any remaining processes
print_status "Cleaning up any remaining processes..."
sudo pkill -f "node.*panel" || true
sudo pkill -f "node.*gateway" || true
sudo pkill -f "node.*kiosk" || true

# Step 3: Pull the reverted code
print_status "Pulling reverted code from main branch..."
git fetch origin
git reset --hard origin/main

# Step 4: Clean and rebuild
print_status "Cleaning old build files..."
npm run clean || print_warning "Clean command failed, continuing..."
rm -rf node_modules
rm -rf app/*/dist

# Step 5: Fresh install
print_status "Installing dependencies..."
npm install

# Step 6: Build applications
print_status "Building applications..."
npm run build

if [ $? -eq 0 ]; then
    print_success "Build completed successfully"
else
    print_error "Build failed. Please check the error messages above."
    exit 1
fi

# Step 7: Start services
print_status "Starting services..."
sudo systemctl start eform-gateway
sleep 3
sudo systemctl start eform-panel
sleep 3
sudo systemctl start eform-kiosk

# Step 8: Check service status
print_status "Checking service status..."

services=("eform-gateway" "eform-panel" "eform-kiosk")
all_services_ok=true

for service in "${services[@]}"; do
    if sudo systemctl is-active --quiet $service; then
        print_success "$service is running"
    else
        print_error "$service is not running"
        all_services_ok=false
    fi
done

# Step 9: Display service URLs
print_status "Service URLs:"
echo "  📊 Panel Interface: http://$(hostname -I | awk '{print $1}'):3001"
echo "  🌐 Gateway API: http://$(hostname -I | awk '{print $1}'):3000"
echo "  🖥️  Kiosk Interface: http://$(hostname -I | awk '{print $1}'):3002"

# Step 10: Final status
echo ""
echo "================================================================"
if [ "$all_services_ok" = true ]; then
    print_success "🎉 Successfully reverted to stable version!"
    echo ""
    echo "✅ System Status:"
    echo "  • All services are running"
    echo "  • Reverted to commit: b3f64be"
    echo "  • UI improvements have been removed"
    echo "  • System is back to stable state"
    echo ""
    echo "🌐 You can now access your panel at:"
    echo "  http://$(hostname -I | awk '{print $1}'):3001"
else
    print_error "❌ Revert completed but some services have issues!"
    echo ""
    echo "🔍 Troubleshooting steps:"
    echo "  1. Check service logs: sudo journalctl -u eform-panel -f"
    echo "  2. Try manual restart: sudo systemctl restart eform-*"
    echo "  3. Check build output above for errors"
fi

echo "================================================================"