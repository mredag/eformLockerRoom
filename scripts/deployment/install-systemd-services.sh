#!/bin/bash
set -Eeuo pipefail

echo "🚀 Installing eForm Locker systemd service..."
echo "====================================================="

# Ensure the script is run as root
if [ "$(id -u)" -ne 0 ]; then
  echo "❌ This script must be run as root. Please use sudo."
  exit 1
fi

# Define paths
PROJECT_DIR="/home/pi/eform-locker"
SCRIPTS_SRC_DIR="$PROJECT_DIR/scripts"
SYSTEMD_SRC_DIR="$PROJECT_DIR/scripts/systemd"
SYSTEMD_DEST_DIR="/etc/systemd/system"

# 1. Copy the new systemd service file
echo "⚙️  Installing eform.service..."
cp "$SYSTEMD_SRC_DIR/eform.service" "$SYSTEMD_DEST_DIR/"

# 2. Set permissions for the service file
chmod 644 "$SYSTEMD_DEST_DIR/eform.service"

# 3. Set permissions for the main startup script
echo "🔐 Setting permissions for the main startup script..."
chmod +x "$PROJECT_DIR/scripts/deployment/start-eform-system.sh"

# 4. Reload systemd daemon
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

# 5. Enable the service to start on boot
echo "🔌 Enabling eform.service to start on boot..."
systemctl enable eform.service

echo "====================================================="
echo "✅ eForm Locker systemd service installed and enabled!"
echo "   The service will now start automatically on boot."
echo "   To start the service immediately, run: sudo systemctl start eform.service"
echo "   To check the status, run: sudo systemctl status eform.service"
