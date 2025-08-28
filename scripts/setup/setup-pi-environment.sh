#!/bin/bash

echo "🔧 Raspberry Pi Environment Setup for eForm Locker"
echo "=================================================="

# Check if running as pi user
if [ "$USER" != "pi" ]; then
    echo "⚠️  Warning: This script is designed to run as the 'pi' user"
    echo "Current user: $USER"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Get project directory
PROJECT_DIR=$(pwd)
if [ ! -f "$PROJECT_DIR/package.json" ]; then
    echo "❌ Error: Not in eForm Locker project directory"
    echo "Please run this script from the project root"
    exit 1
fi

echo "📍 Project directory: $PROJECT_DIR"
echo ""

# Find RS-485 device
echo "🔍 Detecting RS-485 device..."
RS485_DEVICES=$(ls /dev/serial/by-id/ 2>/dev/null | grep -E "(FTDI|CH340|CP210)" | head -1)

if [ -n "$RS485_DEVICES" ]; then
    MODBUS_PORT="/dev/serial/by-id/$RS485_DEVICES"
    echo "✅ Found RS-485 device: $MODBUS_PORT"
else
    echo "⚠️  No RS-485 device auto-detected"
    echo "Available devices:"
    ls -la /dev/serial/by-id/ 2>/dev/null || echo "  No devices found"
    echo ""
    read -p "Enter RS-485 device path (or press Enter for default): " CUSTOM_PORT
    MODBUS_PORT=${CUSTOM_PORT:-"/dev/ttyUSB0"}
    echo "Using: $MODBUS_PORT"
fi

# Get kiosk ID
echo ""
read -p "Enter Kiosk ID (default: kiosk-1): " KIOSK_INPUT
KIOSK_ID=${KIOSK_INPUT:-"kiosk-1"}

# Get pulse duration
echo ""
read -p "Enter pulse duration in ms (default: 400): " PULSE_INPUT
PULSE_DURATION=${PULSE_INPUT:-"400"}

# Create environment file
ENV_FILE="$PROJECT_DIR/.env"
echo ""
echo "📝 Creating environment file: $ENV_FILE"

cat > "$ENV_FILE" << EOF
# eForm Locker Environment Configuration
# Generated on $(date)

# Database Configuration
EFORM_DB_PATH="$PROJECT_DIR/data/eform.db"

# Kiosk Configuration
KIOSK_ID="$KIOSK_ID"

# Modbus/RS-485 Configuration
MODBUS_PORT="$MODBUS_PORT"
MODBUS_BAUD="9600"
MODBUS_PARITY="none"

# Timing Configuration
PULSE_DURATION_MS="$PULSE_DURATION"
COMMAND_INTERVAL_MS="2000"
MAX_RETRIES="3"

# Panel Configuration
PANEL_PORT="3003"
EOF

echo "✅ Environment file created"

# Set up user permissions
echo ""
echo "🔐 Setting up user permissions..."
sudo usermod -a -G dialout pi 2>/dev/null || echo "⚠️  Could not add user to dialout group"

# Set device permissions if device exists
if [ -e "$MODBUS_PORT" ]; then
    sudo chmod 666 "$MODBUS_PORT" 2>/dev/null || echo "⚠️  Could not set device permissions"
    echo "✅ Device permissions configured"
else
    echo "⚠️  Device not found, permissions will be set when device is connected"
fi

# Create backup directory
echo ""
echo "📁 Creating backup directory..."
mkdir -p "$PROJECT_DIR/backups"
mkdir -p "$PROJECT_DIR/logs"
echo "✅ Directories created"

# Display configuration
echo ""
echo "🎉 Setup completed!"
echo ""
echo "📋 Configuration Summary:"
echo "  Project Dir:    $PROJECT_DIR"
echo "  Database:       $PROJECT_DIR/data/eform.db"
echo "  Kiosk ID:       $KIOSK_ID"
echo "  RS-485 Device:  $MODBUS_PORT"
echo "  Pulse Duration: ${PULSE_DURATION}ms"
echo ""
echo "🚀 Next Steps:"
echo "  1. Restart your terminal or run: source .env"
echo "  2. Test hardware: npm run test:hardware"
echo "  3. Start services: npm run start"
echo ""
echo "📖 For more details, see: RASPBERRY_PI_ENVIRONMENT_SETUP.md"