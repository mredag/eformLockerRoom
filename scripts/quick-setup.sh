#!/bin/bash

# 🚀 Eform Locker System - Quick Setup Script
# Raspberry Pi Production Deployment

set -e  # Exit on any error

echo "🍓 Eform Locker System - Quick Setup"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Check if running on Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    print_warning "This script is designed for Raspberry Pi. Continuing anyway..."
fi

# Check if running as pi user
if [ "$USER" != "pi" ]; then
    print_warning "This script is designed to run as 'pi' user. Current user: $USER"
fi

print_status "Starting Eform Locker System setup..."

# Step 1: System Update
print_status "Step 1: Updating system packages..."
sudo apt update && sudo apt upgrade -y
print_success "System packages updated"

# Step 2: Install Node.js 20
print_status "Step 2: Installing Node.js 20..."
if ! command -v node &> /dev/null || [[ $(node --version) != v20* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    print_success "Node.js 20 installed"
else
    print_success "Node.js 20 already installed"
fi

# Verify Node.js version
NODE_VERSION=$(node --version)
print_status "Node.js version: $NODE_VERSION"

# Step 3: Install system dependencies
print_status "Step 3: Installing system dependencies..."
sudo apt install -y git vim htop screen curl wget build-essential
sudo apt install -y python3-pip python3-serial
sudo apt install -y minicom setserial usbutils
sudo apt install -y ufw fail2ban
sudo apt install -y iotop nethogs
print_success "System dependencies installed"

# Step 4: Configure user permissions
print_status "Step 4: Configuring user permissions..."
sudo usermod -a -G dialout,gpio,i2c,spi,audio,video,input pi

# Set up USB device permissions
sudo chmod 666 /dev/ttyUSB* 2>/dev/null || true
echo 'SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", MODE="0666"' | sudo tee /etc/udev/rules.d/99-usb-serial.rules > /dev/null
echo 'SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", MODE="0666"' | sudo tee -a /etc/udev/rules.d/99-usb-serial.rules > /dev/null
sudo udevadm control --reload-rules
print_success "User permissions configured"

# Step 5: Configure firewall
print_status "Step 5: Configuring firewall..."
sudo ufw --force enable
sudo ufw allow ssh
sudo ufw allow 3000:3003/tcp
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
print_success "Firewall configured"

# Step 6: Install project dependencies
print_status "Step 6: Installing project dependencies..."
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root directory."
    exit 1
fi

npm install
npm run install-all
npm install -g tsx
print_success "Project dependencies installed"

# Step 7: Validate Node.js compatibility
print_status "Step 7: Validating Node.js compatibility..."
npm run validate:nodejs
print_success "Node.js compatibility validated"

# Step 8: Generate configuration
print_status "Step 8: Generating system configuration..."
npm run config:setup
print_success "System configuration generated"

# Step 9: Validate configuration
print_status "Step 9: Validating configuration..."
npm run config:validate
print_success "Configuration validated"

# Step 10: Run database migration
print_status "Step 10: Running database migration..."
npm run migrate
print_success "Database migration completed"

# Step 11: Test hardware (if available)
print_status "Step 11: Testing hardware connectivity..."
if npm run test:hardware 2>/dev/null; then
    print_success "Hardware tests passed"
else
    print_warning "Hardware tests failed or hardware not connected"
fi

# Step 12: Install systemd services
print_status "Step 12: Installing systemd services..."
sudo cp scripts/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable eform-gateway eform-kiosk eform-panel
print_success "Systemd services installed and enabled"

# Step 13: Start services
print_status "Step 13: Starting services..."
sudo systemctl start eform-gateway
sudo systemctl start eform-kiosk
sudo systemctl start eform-panel

# Wait for services to start
sleep 5

# Check service status
print_status "Checking service status..."
if sudo systemctl is-active --quiet eform-gateway; then
    print_success "Gateway service is running"
else
    print_error "Gateway service failed to start"
fi

if sudo systemctl is-active --quiet eform-kiosk; then
    print_success "Kiosk service is running"
else
    print_error "Kiosk service failed to start"
fi

if sudo systemctl is-active --quiet eform-panel; then
    print_success "Panel service is running"
else
    print_error "Panel service failed to start"
fi

# Step 14: Test health endpoints
print_status "Step 14: Testing health endpoints..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    print_success "Gateway health check passed"
else
    print_warning "Gateway health check failed"
fi

if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    print_success "Kiosk health check passed"
else
    print_warning "Kiosk health check failed"
fi

if curl -f http://localhost:3003/health > /dev/null 2>&1; then
    print_success "Panel health check passed"
else
    print_warning "Panel health check failed"
fi

# Step 15: Set up monitoring
print_status "Step 15: Setting up basic monitoring..."
# Add health check cron jobs
(crontab -l 2>/dev/null; echo "*/5 * * * * curl -f http://localhost:3000/health || sudo systemctl restart eform-gateway") | crontab -
(crontab -l 2>/dev/null; echo "*/5 * * * * curl -f http://localhost:3001/health || sudo systemctl restart eform-kiosk") | crontab -
(crontab -l 2>/dev/null; echo "*/5 * * * * curl -f http://localhost:3003/health || sudo systemctl restart eform-panel") | crontab -
print_success "Basic monitoring configured"

# Final status
echo ""
echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "📊 System Status:"
echo "  Gateway:  http://localhost:3000 (API)"
echo "  Kiosk:    http://localhost:3001 (Touch Interface)"
echo "  Panel:    http://localhost:3003 (Admin Panel)"
echo ""
echo "🔧 Useful Commands:"
echo "  Check services:     sudo systemctl status eform-*"
echo "  View logs:          sudo journalctl -u eform-gateway -f"
echo "  Test hardware:      npm run test:hardware"
echo "  Validate config:    npm run config:validate"
echo ""
echo "📚 Documentation:"
echo "  Setup Guide:        docs/raspberry-pi-deployment-guide.md"
echo "  Turkish Guide:      docs/raspberry-pi-formatting-guide-tr.md"
echo "  Configuration:      config/README.md"
echo ""

# Get system information
HOSTNAME=$(hostname)
IP_ADDRESS=$(hostname -I | awk '{print $1}')

echo "🌐 Network Access:"
echo "  Local:     http://$IP_ADDRESS:3001 (Kiosk)"
echo "  Local:     http://$IP_ADDRESS:3003 (Admin)"
echo "  Hostname:  http://$HOSTNAME.local:3001"
echo ""

print_success "Eform Locker System is ready for use!"
print_status "Check the documentation for advanced configuration and troubleshooting."